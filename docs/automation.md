# Automatizările suitei — pipeline-ul real (27.10.2026)

Harta a ce rulează fără pagină deschisă: roboții din GitHub Actions, workerii Cloudflare, canalele de alarmă. Scrisă după auditul E din
27.10.2026 (🟡 Y6: documentația de până acum descria un lanț „CF cron */5 → workflow_dispatch → check-alerts → Telegram” care nu mai exista
de pe 27.09.2026). Testul `tools/wrangler-cron.test.mjs` compară acest document cu wrangler-ele, cu proxy-ul și cu fluxul de știri: dacă se
schimbă unul, se schimbă și celălalt.

## 1. Știrile (singurul robot „de alerte” rămas)

```
GitHub Actions cron `0 */2 * * *` (la 2 ore, non-stop) + Run workflow manual
  → .github/workflows/price-alerts.yml  (job „check”, Node 20, timeout 15 min, concurrency serializată)
    → node tools/check-news-watch.mjs   (Finnhub: company-news + calendar/earnings; lista = tools/alerts.json, starea = tools/news-watch.json)
      → Discord (DISCORD_WEBHOOK, prin tools/discord-mesaj.mjs — fiecare mesaj poartă eticheta „text generat automat, neverificat de om”)
        → commit-back `chore(alerts): stare actualizata dupa verificare [skip ci]` (news-watch.json + news-audit.jsonl); push ratat de 3 ori ⇒ roșu + Discord
```

- **Pragurile de preț nu mai există pe server.** De la v116 (27.09.2026) lista din `tools/alerts.json` e o listă de simboluri urmărite
  (`kind: "watch"` + notiță); mișcarea, insiderii, rezultatele și analiștii vin din poza Radarului. Botul vechi de praguri
  (`tools/check-alerts.mjs`, Telegram) a fost retras pe 27.10.2026 împreună cu testele lui; fișierele lui de stare
  (`tools/equity-drift.json`, `tools/capital-risk.json`, `tools/hub-stale-digest.json`) rămân doar pentru cititorii vechi din Health / hub.
- **Regulile de știri** (`BIG_KW`, `NOISE_RE`, `MODE_MIN`, sursele, severitatea, sentimentul) stau într-un singur loc: `lib/news-rules.js`,
  încărcat și de pagina `/alerts/` și de robot. Aceeași știre e „big” sau „noise” la fel în ambele.
- **Fără dubluri browser ↔ server:** pagina `/alerts/` trimite ea pe Discord doar când robotul nu a rulat în ultimele 3 ore
  (`NewsRules.botActiv` pe `_meta.lastRun` din `tools/news-watch.json`); altfel doar toast + notificare în browser. `seen` / `eventSeen` se
  unesc (local ∪ server) la fiecare citire și urcare a stării.
- **Scrierea stării din pagină** (`tools/alerts.json`, `tools/news-watch.json`) nu mai trece printr-un PAT GitHub ținut în browser: pagina
  cheamă ruta `POST /github/save` a workerului `deck-relay` (doar din originea suitei, doar cele două fișiere, conținut validat), iar secretul
  `GH_CONTENTS_TOKEN` (fine-grained, doar acest depozit, Contents: Read and write) stă pe Cloudflare. Citirea proaspătă: `GET /github/file?path=…`.

## 2. Ceilalți roboți din GitHub Actions

| Workflow | Când (UTC) | Ce scrie | La eșec |
|---|---|---|---|
| `clasificator-paza.yml` | 05:10, 07:10, 09:10, 11:10 marți–sâmbătă | nimic (pornește robotul lipsă) | scriptul anunță pe Discord |
| `clasificator.yml` | 23:20 luni–vineri; 03:40 marți–sâmbătă | `candidate-engine/generated/clasificator.json`, jurnalul, verdictul | push 3×; Discord |
| `europe-calendar.yml` | 06:15 luni–vineri | `europe-stocks/calendar.json` | Discord; commit cu `[skip ci]` |
| `pages.yml` (Breadth) | 12:20, 22:20 luni–vineri | `market-breadth/data/latest.json`, `generated/` | Discord; commit cu `[skip ci]` |
| `premarket-bilant.yml` | sâmbătă 07:45 | `scanner-verdicts/generated/premarket-bilant.json` | Discord |
| `price-alerts.yml` (News Watch) | la 2 ore | `tools/news-watch.json`, `tools/news-audit.jsonl` | Discord; push ratat ⇒ roșu |
| `teste.yml` | la push pe `main`, manual | `health/generated/suita.json` | Discord la roșu |
| `trend-12-1.yml` / `trend-12-1-bilant.yml` | 22:40 + 03:10 / sâmbătă 07:30 | `candidate-engine/generated/` | Discord |
| `v1-proba.yml` | 21:45 luni–vineri (+ rezerva 10:15) | `scanner-verdicts/generated/v1-*`, `premarket-*`, `reversal-umbra-*` | reîncercare + Discord |
| `verdict-dimineata.yml` | 12:00 luni–vineri | nimic (mesajul de dimineață) | Discord |
| `verdict-piata.yml` | 00:55, 05:25 marți–sâmbătă | `candidate-engine/generated/verdict-piata.json`, istoricul, cursul BNR | push 3×; paza îl verifică |

Toți comit cu `[skip ci]` (ca să nu pornească suita), toți fac `pull --rebase` înainte de push, toate acțiunile sunt fixate pe SHA.

## 3. Workerii Cloudflare

| Worker | Config | Rol | Cron |
|---|---|---|---|
| `premarket-scanner-html` | `tools/cloud-sync-wrangler.jsonc` (bundle `tools/cloud-sync-worker.bundle.mjs`) | sincronizarea cheilor, releul Trading 212 (citiri + `stop-order` + anularea ordinelor, I-757), monitorul contului, fișa zilei | `*/5 * * * *` — declarat în wrangler (monitorul cere heartbeat sub 15 min) |
| `tt-proxy` | `tools/cf-proxy-wrangler.toml` (`tools/cf-worker-proxy.js`) | proxy CORS cu listă strictă de gazde + ingest jurnal | **fără cron** — dispatch-ul spre GitHub a fost scos pe 27.09.2026; `[triggers]` a dispărut din toml pe 27.10.2026 |
| `tt-breadth-daily` | `tools/breadth-daily-wrangler.jsonc` | Durable Object, dispatch o dată pe zi (origin strict, `GH_DISPATCH_TOKEN`) | propriul alarm |
| `deck-relay` | `tools/cf-worker-deck-relay.js` (lipit în dashboard) | webhook-urile TradingView → KV + înaintare; de pe 27.10.2026 și scrierea `tools/alerts.json` / `tools/news-watch.json` pe GitHub (`/github/save`, `/github/file`) | — |

Publicarea: `npx wrangler deploy --config tools/cloud-sync-wrangler.jsonc --keep-vars` (după `node tools/cloud-sync-bundle.mjs`),
`npx wrangler deploy --config tools/cf-proxy-wrangler.toml --keep-vars`; `deck-relay` se lipește în editorul din dashboard
(secretele: `WRITE_TOKEN`, `READ_TOKEN`, `FORWARD_URL`, `GH_CONTENTS_TOKEN`, `GH_REPO`).

## 4. Secrete

- GitHub Actions: `DISCORD_WEBHOOK`, `FINNHUB_API_KEY`. Cloudflare: `GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_SUB`, `CLOUD_ENCRYPTION_KEY`,
  `DISCORD_WEBHOOK` (sync), `JOURNAL_*` (proxy), `GH_DISPATCH_TOKEN` (breadth), `GH_CONTENTS_TOKEN` + `GH_REPO` (deck-relay).
- Niciodată în cod, loguri, commituri sau mesaje de eroare; cheia Trading 212 doar în antetul `Authorization` al releului, niciodată în URL.
- În browser nu mai stă niciun secret cu drept de scriere pe depozit (I-756).
