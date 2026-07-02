# Spec: trading-code-craft v2 — upgrade masiv

**Data:** 2026-07-02
**Status:** aprobat de user (design prezentat și acceptat în sesiune)
**Livrabil:** skill-ul personal `C:\Users\Cimin\.claude\skills\trading-code-craft\` rescris/extins.
**Urmează (proiect separat, după v2):** skill NOU dedicat ideației (propune features/interfață/îmbunătățiri pentru suită).

## 1. Obiectiv

Upgrade al skill-ului trading-code-craft pe cinci axe, decise explicit de user:

1. **Comportament de trader profesionist** — scepticism statistic, realism de execuție, context de piață. (Userul NU a cerut capitol de risc/money-management — nu se adaugă.)
2. **Ochi de web designer** — UI/UX modern pentru dashboard-uri; are voie să propună evoluția design system-ului; dashboard-uri Pine lizibile; data-viz de trader.
3. **Proactivitate controlată** — secțiune „Idei" obligatorie la finalul oricărei livrări (2–4 propuneri concrete design/cod/features, cu efort estimat S/M/L). **Propune, NU implementează** — implementarea doar la cerere explicită.
4. **Acoperire nouă** — Crypto Scanner Pro (standalone, Downloads) + grid-engine; pipeline automation (GitHub Actions + check-alerts.mjs + alerts.json); Cloudflare Worker proxy/relay.
5. **Calitate skill ca artefact** — description/triggering actualizat, structură modulară, evals noi scrise ȘI rulate.

## 2. Structura fișierelor

```
trading-code-craft/
├── SKILL.md                    — router scurt: lume → mod → livrare + reguli transversale
├── references/
│   ├── pine.md                 — adâncit (există)
│   ├── pwa.md                  — adâncit (există)
│   ├── crypto-scanner.md       — NOU: Crypto Scanner Pro + grid-engine
│   ├── automation.md           — NOU: GitHub Actions + check-alerts.mjs + cf-worker-proxy
│   ├── trader.md               — NOU, transversal: scepticism statistic, realism execuție, context piață
│   └── design.md               — NOU, transversal: UI/UX modern, dashboard Pine, data-viz trader
└── evals/
    ├── evals.json              — 6 existente + 6 noi
    └── files/                  — fixtures (confluence.pine existent + fixtures noi după nevoie)
```

Arhitectura: **lumi + teme transversale** (Varianta 1, aleasă în locul duplicării per-lume sau al skill-urilor separate). Regulile de trader/design se scriu o singură dată și se citesc alături de referința lumii.

## 3. SKILL.md (router)

- **Pasul 1 — lumea**, 4 opțiuni cu semne de recunoaștere:
  - **Pine** — `//@version=`, `indicator()`, `.pine`.
  - **PWA trading-tools** — pagini din `premarket_scanner`, `CACHE_VERSION`, namespace-uri `D./MK./BT./AI.`.
  - **Crypto Scanner Pro** — fișier `crypto-scanner-*.html` în `Downloads`, `.brand-sub`, `fetchSafe`, `tools/grid-engine/`.
  - **Automation** — `.github/workflows/*.yml`, `tools/check-alerts.mjs`, `tools/alerts.json`, `tools/cf-worker-proxy.js`.
- **Pasul 2 — modul**: Create / Audit / Improve (neschimbat, inclusiv cele două treceri la audit: corectitudine ÎNTÂI, convenții apoi).
- **Pasul 3 — citirea referințelor**: referința lumii + `trader.md` **mereu când codul produce semnale/decizii de trading** + `design.md` **mereu când codul are UI/dashboard/vizualizare**.
- **Regulă transversală NOUĂ — secțiunea „Idei"**: la ORICE livrare, la final, 2–4 propuneri concrete (design, cod, features) cu efort estimat (S/M/L). Neimplementate. Înlocuiește nota veche „menționează pe scurt la final" cu un format obligatoriu.
- **Versionarea** (regulă transversală existentă, extinsă):
  - PWA: dublă (sw.js `CACHE_VERSION` + badge pagină) — neschimbat.
  - Pine: header script — neschimbat.
  - Crypto Scanner Pro: text `vN.N` în `.brand-sub` — increment la orice livrare.
  - Automation: fără badge; commit convențional (`chore(alerts): … [skip ci]` pentru stare).

## 4. `trader.md` (transversal)

- **Scepticism statistic**: orice prag/parametru nou vine cu avertisment de sample size; orice backtest cere walk-forward/out-of-sample; evaluare pe regimuri de piață diferite (trending/ranging, bull/bear); niciodată concluzii dintr-o singură rulare optimizată. La audit: semnalează praguri „magice" fără justificare.
- **Realism de execuție**: costuri/slippage nenule mereu; lichiditate și spread pe premarket/small-caps; halts și gap-uri; diferența semnal ↔ preț executabil; pe crypto: comisioane exchange, funding pe perpetuals.
- **Context de piață**: sesiuni (premarket/RTH/after-hours vs. crypto 24/7 — consecvent cu weekend-handling din check-alerts.mjs); earnings și macro events ca risc de semnal; DST/timezone (ET vs. UTC); expirări opțiuni. Integrate din construcție în orice tool nou.

## 5. `design.md` (transversal)

- **Principii UI moderne**: ierarhie vizuală (o informație dominantă per card), spacing consecvent, stări obligatorii (loading / empty / error — niciodată tabel gol mut), responsive pe breakpoint-urile suitei (550 / 1280 / 1920), micro-interacțiuni ieftine (tranziții, hover) fără framework.
- **Evoluția design system-ului e permisă**: componente/pattern-uri noi se propun în secțiunea „Idei"; odată aprobate de user, se documentează în design.md ca să devină convenție.
- **Dashboard Pine**: contrast pe ambele teme de chart; densitate max ~7 rânduri vizibile (restul opțional); cod de culori consecvent cu suita (verde/roșu/warn); celulă de tabel vs. plot pe chart.
- **Data-viz de trader**: formatare numere (K/M/B, %, bps; 4 zecimale sub $1, 2 altfel — convenția din check-alerts); culori semantice consecvente; sparkline pentru istoric scurt; tabel pentru scanare rapidă, grafic pentru formă; timestamp-uri relative + absolute.

## 6. `crypto-scanner.md` (lume nouă)

Bazat pe explorarea din 2026-07-02 (fișier curent: `Downloads\crypto-scanner-v3-2-wide.html`, versiune in-app v4.1):

- **Single-file standalone** — NU se sparge în module, NU se mută în repo (separare intenționată de suită).
- **Light-first cu dark mode** (`body.dark`); paleta proprie indigo (`--acc #4f46e5`, `--bg #f4f6ff`), NU BTC orange; fonturi identice Sora/DM Mono; radius/shadow tokens (`--r`, `--rs`, `--sh`, `--shh`).
- **Idiomuri JS**: `document.querySelector`/`getElementById` direct (fără helper `$()`); handlers inline `onclick`; `fetchSafe(url, ms)` pentru ORICE fetch nou (timeout via Promise.race); render prin template strings + `innerHTML`.
- **localStorage**: `crypto_alerts`, `pf_entries`, `scanner_cfg`, `darkMode`, `anthropic_api_key` (device-local, NICIODATĂ sincronizată — vezi memoria).
- **Versionare**: `vN.N` text în `.brand-sub` — citește valoarea curentă, increment la orice livrare.
- **Regula de sync grid-engine**: logica de scoring trăiește în `tools/grid-engine/grid-engine.js` (funcții pure, fără DOM/fetch: `efficiencyRatio`, `neutralSubScore`, `directionalSubScore`, `combineNeutral`, `combineDirectional` etc.) ȘI ca o copie inline în scanner — orice modificare se aplică IDENTIC în ambele locuri.
- **Surse de date**: Binance public API, alternative.me FNG, Anthropic API.

## 7. `automation.md` (lume nouă)

Pipeline-ul complet, ca diagramă:

```
CF Worker cron (*/5, determinist) → GitHub workflow_dispatch → price-alerts.yml
  → node tools/check-alerts.mjs (prețuri Yahoo direct, 6 tipuri de alerte, Telegram)
  → tools/alerts.json (stare) → commit-back „chore(alerts): … [skip ci]"
```

Reguli:
- `[skip ci]` obligatoriu pe commit-urile de stare; user bot `github-actions[bot]`.
- Concurrency serializată (`group` + `cancel-in-progress: false`) — motivul: CF cron + GitHub cron pot coexista fără dubluri.
- Semantica celor 6 tipuri de alerte (REF / REF TRAILING / ANCHOR / PCT / DAY / LEVEL), one-shot vs. re-arm, histerezis `REARM_HYST = 0.003` (0.3%) — referință obligatorie la orice modificare.
- Weekend handling: stocks sărite Sat/Sun ET; crypto 24/7.
- Telegram: escape HTML entities pe orice text dinamic; parseMode HTML.
- Proxy CF: whitelist strictă de host-uri (Yahoo, CoinGecko) și origin (GitHub Pages) — un host nou se adaugă explicit, proxy-ul NU se deschide generic; cache 20s; timeout upstream 15s.
- Secrete DOAR în GitHub Secrets / CF Variables (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `GH_DISPATCH_TOKEN`) — niciodată în cod/commituri.
- Formatare numere: USDT 4 zecimale, restul 2; timestamps ISO 8601 UTC; istoric `triggered` max 50 intrări.

## 8. Adânciri `pine.md` și `pwa.md`

- **pine.md**: capcane suplimentare în checklist-ul de corectitudine — `request.security` pe TF mai mic decât chart-ul, `varip` vs `var`, `calc_on_order_fills`, limite `max_bars_back`, alerte duplicate la re-run; trimiteri la trader.md (praguri, backtest) și design.md (dashboard).
- **pwa.md**: bug-patterns suplimentare — quota localStorage cu cleanup pe prefix `ttd:`, backoff pe 429/403 (pattern `fh_econ_403_until`), dedupe alerte (`md_seen`), health-scoring proxy EMA [-5,5]; trimiteri la transversale.

## 9. Triggering (description nou)

Description-ul SKILL.md rescris ca să prindă și:
- zonele noi: „repară scannerul de crypto", „modifică workflow-ul de alerte", „adaugă un host la proxy", „schimbă scoringul grid";
- cererile de design: „fă-l mai modern", „arată mai bine dashboard-ul", „fă-l mai lizibil";
- ideația în context de execuție (skill-ul livrează + propune; skill-ul dedicat ideației e proiect separat).

Rămâne concis (limita de description) și păstrează triggerele existente.

## 10. Evals — 6 existente (neschimbate) + 6 noi

| # | Nume | Testează |
|---|------|----------|
| 6 | improve-crypto-scanner-button | Buton nou în scanner → fetchSafe, paleta indigo, bump `.brand-sub`; NU aplică convenții trading-tools (test de confuzie între lumi) |
| 7 | sync-grid-engine-scoring | Modificare de scoring → ambele copii (grid-engine.js + inline) actualizate identic |
| 8 | add-automation-alert-type | Tip nou de alertă în check-alerts.mjs → histerezis, `[skip ci]`, escape Telegram, stare în alerts.json |
| 9 | redesign-dashboard-readability | „Fă dashboard-ul mai lizibil" → aplică design.md fără să strice paleta; empty/loading states |
| 10 | trader-skepticism-thresholds | „Găsește-mi praguri mai bune" → walk-forward/out-of-sample + avertisment overfitting, nu doar numere |
| 11 | ideas-section-mandatory | Task normal oarecare → livrarea se termină cu secțiunea „Idei" (2–4 propuneri cu efort S/M/L, neimplementate) |

După scriere, evals-urile se **rulează efectiv** (anthropic-skills:skill-creator are tooling de eval) și skill-ul se corectează unde pică.

## 11. Livrare & post-pași

- Skill-ul se scrie în `C:\Users\Cimin\.claude\skills\trading-code-craft\` (în afara repo-ului → fără versionare PWA).
- Backup pe `E:` conform preferinței „salvează deliverables în ambele locuri".
- Memoria `trading-code-craft-skill.md` se actualizează cu noua acoperire (4 lumi + transversale + secțiunea Idei).
- Proiect următor, separat: skill-ul de ideație (B) — își are propriul ciclu brainstorming → spec → plan.

## 12. Ce NU facem (scope explicit)

- NU adăugăm capitol de risc/money-management (userul nu l-a selectat).
- NU implementăm idei nesolicitate în cod — doar le propunem în secțiunea „Idei".
- NU modificăm auditing-trading-suite (skill separat; rămâne read-only și își păstrează rolul).
- NU atingem codul suitei/scannerului în acest proiect — doar skill-ul.
