# trading-code-craft v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Editarea skill-ului se face sub superpowers:writing-skills (frontmatter valid, description sub limită, conținut concret).

**Goal:** Upgrade skill-ul personal `trading-code-craft` de la 2 lumi (Pine, PWA) la 4 lumi + 2 referințe transversale (trader, design), cu secțiune „Idei" obligatorie, description nou și 12 evals (6 vechi + 6 noi), rulate și validate.

**Architecture:** SKILL.md rămâne router scurt (lume → mod → livrare); regulile trăiesc în `references/` — una per lume (pine, pwa, crypto-scanner, automation) + două transversale (trader.md, design.md) citite condiționat. Evals validează comportamentul la final.

**Tech Stack:** Markdown (skill files), JSON (evals). Fără cod de producție — skill-ul e artefact de instrucțiuni.

**Sursa de adevăr:** spec-ul `docs/superpowers/specs/2026-07-02-trading-code-craft-v2-design.md` (aprobat). Orice conflict → spec-ul câștigă.

## Global Constraints

- Skill-ul trăiește în `C:\Users\Cimin\.claude\skills\trading-code-craft\` — NU e în repo git; „commit" per task = doar pentru fișierele din worktree (plan/spec); fișierele skill-ului se salvează direct + backup pe `E:` la final.
- Limba: română cu diacritice complete (ca v1). Termenii tehnici rămân în engleză.
- Description-ul din frontmatter: sub ~1024 caractere, format YAML `>-` multiline (ca v1).
- NU se adaugă capitol de risc/money-management (exclus explicit de user).
- Regula „Idei": propune, NU implementează — formulare imperativă în SKILL.md.
- Evals vechi (id 0–5) rămân neschimbate.
- Fiecare fișier de referință: concret, cu exemple de cod scurte, fără platitudini („scrie cod curat" e interzis; fiecare regulă trebuie să fie verificabilă).

---

### Task 1: `references/trader.md` (nou, transversal)

**Files:**
- Create: `C:\Users\Cimin\.claude\skills\trading-code-craft\references\trader.md`

**Interfaces:**
- Produces: fișierul citit de SKILL.md Pasul 3 „mereu când codul produce semnale/decizii de trading". Task 6 va referenția exact numele `references/trader.md`.

- [ ] **Step 1: Scrie fișierul** cu trei secțiuni + un mini-checklist de audit, conform spec §4. Conținut obligatoriu:
  - **§1 Scepticism statistic:** orice prag/parametru nou primește avertisment de sample size; backtest ⇒ cere walk-forward/out-of-sample explicit în livrare; evaluare pe regimuri diferite (trending/ranging, bull/bear); interzis concluzii dintr-o singură rulare optimizată; la audit semnalează praguri „magice" (numere fără justificare) ca 🔵/🟡.
  - **§2 Realism de execuție:** costuri/slippage nenule mereu (deja în pine.md §8 pentru strategy — aici se generalizează la orice calcul de PnL, inclusiv PWA `signal_log`/`trade_tracker`); lichiditate/spread pe premarket și small-caps; halts și gap-uri; diferența semnal ↔ preț executabil; crypto: comision exchange + funding pe perpetuals.
  - **§3 Context de piață:** sesiuni premarket/RTH/after-hours vs. crypto 24/7 (consecvent cu weekend-handling din `tools/check-alerts.mjs`: stocks sărite Sat/Sun ET); earnings/macro ca risc de semnal; DST și ET vs. UTC; expirări opțiuni. Orice tool nou le integrează din construcție.
  - **Checklist audit trader** (4–6 bife) folosibil în Trecerea 1.
  - Exemple concrete unde e posibil (ex. formulare de avertisment overfitting gata de refolosit).

- [ ] **Step 2: Verifică** — recitește fișierul: fiecare regulă e verificabilă (un auditor poate spune DA/NU)? Fără „TBD". Diacritice corecte.

### Task 2: `references/design.md` (nou, transversal)

**Files:**
- Create: `C:\Users\Cimin\.claude\skills\trading-code-craft\references\design.md`

**Interfaces:**
- Produces: fișierul citit de SKILL.md Pasul 3 „mereu când codul are UI/dashboard/vizualizare".

- [ ] **Step 1: Scrie fișierul** cu patru secțiuni, conform spec §5:
  - **§1 Principii UI moderne (orice lume cu UI):** ierarhie vizuală — o informație dominantă per card; spacing consecvent; stări obligatorii loading/empty/error (niciodată tabel gol mut — exemplu de empty state HTML scurt); responsive pe breakpoint-urile suitei (550/1280/1920); micro-interacțiuni ieftine (transition CSS pe hover), fără framework.
  - **§2 Evoluția design system-ului:** permisă — componente/pattern-uri noi se PROPUN în secțiunea „Idei"; după aprobarea userului se documentează AICI (design.md e registrul viu al sistemului).
  - **§3 Dashboard Pine:** contrast pe ambele teme de chart (nu doar dark); densitate max ~7 rânduri vizibile, restul în spatele unui toggle; cod de culori consecvent (verde/roșu/warn ca în suită); regulă celulă-de-tabel vs. plot-pe-chart (valoare curentă → tabel; evoluție → plot ascuns by default).
  - **§4 Data-viz de trader:** formatare numere — K/M/B, %, bps; 4 zecimale sub $1, 2 altfel (convenția check-alerts); culori semantice consecvente; sparkline pentru istoric scurt; tabel = scanare rapidă, grafic = formă; timestamp relativ + absolut. Exemplu de helper de formatare (`fmtNum`) ca pattern recomandat.

- [ ] **Step 2: Verifică** — reguli verificabile, exemple prezente, fără platitudini.

### Task 3: `references/crypto-scanner.md` (nou, lume)

**Files:**
- Create: `C:\Users\Cimin\.claude\skills\trading-code-craft\references\crypto-scanner.md`

**Interfaces:**
- Consumes: date din explorarea 2026-07-02 (în spec §6) — fișier `Downloads\crypto-scanner-v3-2-wide.html`, v4.1 in-app.

- [ ] **Step 1: Scrie fișierul**, conform spec §6. Secțiuni:
  - **Identitate:** standalone single-file în `Downloads`, separat INTENȚIONAT de suită — nu se mută în repo, nu se sparge în module, nu i se aplică convenții trading-tools (fără sw.js, fără `$('id')`, fără BTC orange).
  - **Design:** light-first cu `body.dark`; tokens `--acc #4f46e5` (indigo), `--bg #f4f6ff`, `--r/--rs/--sh/--shh`; fonturi Sora/DM Mono (singura suprapunere cu suita); clase kebab-case, id-uri camelCase.
  - **Idiomuri JS:** `document.querySelector`/`getElementById` direct; handlers inline `onclick="fn()"`; `fetchSafe(url, ms)` OBLIGATORIU pentru orice fetch nou (snippet inclus); render prin template strings + `innerHTML`; constante UPPER_SNAKE (`CRYPTO_CAT`).
  - **localStorage:** `crypto_alerts`, `pf_entries`, `scanner_cfg`, `darkMode`, `anthropic_api_key` (device-local, NICIODATĂ sincronizată/logată — link memoria). Chei noi: snake_case scurt, consecvent cu cele existente.
  - **Versionare:** `vN.N` text în `.brand-sub` (ex. „… · v4.1") — citește valoarea curentă din fișier, increment minor la livrare, major la refactor mare. Nu inventa dacă nu o vezi.
  - **Regula de sync grid-engine (critică):** scoring-ul trăiește în `tools/grid-engine/grid-engine.js` (funcții pure: `efficiencyRatio`, `neutralSubScore`, `directionalSubScore`, `combineNeutral`, `combineDirectional`, `sma`, `rangePct`, `atrPct`, `oscillationRate`, `slopePct`, `lerp`, `volPointsNeutral`) ȘI ca o copie inline în scanner. Orice modificare → AMBELE locuri, identic, în aceeași livrare. La audit: diff-uiește cele două copii.
  - **Surse de date:** Binance public API (`/api/v3/ticker/24hr`, `/api/v3/klines`), alternative.me FNG, Anthropic API.
  - **Checklist corectitudine + checklist convenții** (pattern-ul din pine.md/pwa.md, două treceri).

- [ ] **Step 2: Verifică** — numele funcțiilor grid-engine corecte (confruntă cu `tools/grid-engine/grid-engine.js` din repo), snippet `fetchSafe` fidel originalului.

### Task 4: `references/automation.md` (nou, lume)

**Files:**
- Create: `C:\Users\Cimin\.claude\skills\trading-code-craft\references\automation.md`

- [ ] **Step 1: Scrie fișierul**, conform spec §7. Secțiuni:
  - **Diagrama pipeline** (bloc text): CF Worker cron `*/5` (determinist; motivul: GitHub cron nu ține cadența) → `workflow_dispatch` → `price-alerts.yml` (Node 20, concurrency `group` + `cancel-in-progress: false`) → `tools/check-alerts.mjs` (Yahoo direct server-side, fără proxy) → Telegram + `tools/alerts.json` → commit-back.
  - **Reguli commit stare:** mesaj exact `chore(alerts): stare actualizata dupa verificare [skip ci]`; `[skip ci]` OBLIGATORIU; bot user `github-actions[bot]`; guard `git diff --quiet` înainte de commit.
  - **Semantica alertelor** (tabel scurt): REF / REF TRAILING / ANCHOR (4 sub-alerte) / PCT / DAY / LEVEL; one-shot vs. re-arm; histerezis `REARM_HYST = 0.003`; snooze `snoozeUntil`; istoric `triggered` max 50. Orice modificare în check-alerts.mjs se confruntă cu tabelul ăsta.
  - **Weekend/sesiuni:** stocks sărite Sat/Sun ET; crypto detectat pe pattern (USDT, -USD, BTC/ETH/SOL) rulează 24/7.
  - **Telegram:** escape HTML entities (`&`, `<`, `>`) pe ORICE text dinamic; parseMode HTML; formatare preț: USDT 4 zecimale, altele 2; timestamps ISO 8601 UTC.
  - **CF Worker proxy:** whitelist STRICTĂ host-uri (query1/query2.finance.yahoo.com, api.coingecko.com) + origin (`https://mferent80-source.github.io`); host nou = adăugare explicită în whitelist, NU se deschide generic; cache 20s; timeout upstream 15s (AbortSignal).
  - **Secrete:** DOAR GitHub Secrets / CF Variables (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `GH_DISPATCH_TOKEN`); niciodată în cod, log-uri sau commituri.
  - **Checklist corectitudine** (stare coruptă alerts.json, alerte duplicate la rulări paralele, fetch fără timeout, escape lipsă) **+ checklist convenții**.

- [ ] **Step 2: Verifică** — mesajul de commit identic cu cel din `price-alerts.yml`; numele secretelor corecte (confruntă cu workflow-ul din repo).

### Task 5: Adâncire `pine.md` + `pwa.md`

**Files:**
- Modify: `C:\Users\Cimin\.claude\skills\trading-code-craft\references\pine.md`
- Modify: `C:\Users\Cimin\.claude\skills\trading-code-craft\references\pwa.md`

- [ ] **Step 1: pine.md** — în „Checklist corectitudine Pine" adaugă bife noi (cu o linie de explicație fiecare): `request.security` pe TF mai mic decât chart-ul (date incomplete/agregate greșit); `varip` vs `var` (varip persistă intra-bar → repaint în backtest vs. realtime); `calc_on_order_fills` (doar strategy, execuții fantomă); `max_bars_back` insuficient pe serii referențiate adânc; alerte duplicate la re-run/reload. La finalul secțiunilor relevante adaugă trimiteri: praguri/backtest → `trader.md`; dashboard/culori → `design.md` §3–4.

- [ ] **Step 2: pwa.md** — în „Checklist corectitudine PWA" adaugă: quota localStorage plină → cleanup pe prefix `ttd:` (pattern-ul din lib/data.js, șterge cele mai vechi 10); backoff pe 429/403 cu timestamp persistat (pattern `fh_econ_403_until`, 24h); dedupe pe alerte repetitive (pattern `md_seen`); health-scoring proxy EMA mărginit [-5, 5]. Adaugă în secțiunea 5 (integrări) o notă: notificările noi respectă dedupe + escape. Trimiteri la `trader.md` (orice pagină cu semnale/PnL) și `design.md` (orice pagină nouă/redesign).

- [ ] **Step 3: Verifică** — checklist-urile rămân scanabile (o linie per bifă), trimiterile folosesc numele exacte de fișiere.

### Task 6: Rescriere `SKILL.md` (router + description)

**Files:**
- Modify: `C:\Users\Cimin\.claude\skills\trading-code-craft\SKILL.md`

**Interfaces:**
- Consumes: numele exacte `references/trader.md`, `references/design.md`, `references/crypto-scanner.md`, `references/automation.md` (Task 1–4).

- [ ] **Step 1: Pasul 1 (lumea)** → 4 lumi cu semnele de recunoaștere din spec §3 (Pine: `//@version=`; PWA: `CACHE_VERSION`, `D./MK./BT./AI.`; Crypto Scanner Pro: `crypto-scanner-*.html` în Downloads, `.brand-sub`, `fetchSafe`, `tools/grid-engine/`; Automation: `.github/workflows/*.yml`, `check-alerts.mjs`, `alerts.json`, `cf-worker-proxy.js`). Avertisment explicit anti-confuzie: Crypto Scanner Pro NU primește convenții trading-tools și invers.

- [ ] **Step 2: Pasul 3 (citirea referințelor)** → referința lumii + condiționat: `trader.md` mereu când codul produce semnale/praguri/backtest/PnL; `design.md` mereu când livrarea are UI/dashboard/vizualizare.

- [ ] **Step 3: Regula „Idei"** → înlocuiește nota veche din „Note de stil" („menționeaz-o pe scurt la final") cu regulă transversală formată: la ORICE livrare, secțiune finală `## Idei` cu 2–4 propuneri concrete (design/cod/features), fiecare cu efort estimat S/M/L și o frază de justificare. NU se implementează nimic din ele fără cerere explicită.

- [ ] **Step 4: Versionare extinsă** → adaugă la regula existentă: Crypto Scanner Pro = `vN.N` în `.brand-sub`; Automation = fără badge, commit convențional (stare: `chore(alerts): … [skip ci]`).

- [ ] **Step 5: Description nou** în frontmatter — păstrează triggerele v1 și adaugă: „repară scannerul de crypto / crypto-scanner-pro", „schimbă scoringul grid / grid-engine", „modifică workflow-ul de alerte / check-alerts / alerts.json", „adaugă un host la proxy / cf-worker", „fă-l mai modern / mai lizibil / redesign dashboard". Sub ~1024 caractere.

- [ ] **Step 6: Verifică** — frontmatter YAML valid (name + description, `>-`), toate cele 6 referințe menționate cu căi exacte, regula celor două treceri la audit păstrată intactă.

### Task 7: Evals noi (`evals/evals.json`)

**Files:**
- Modify: `C:\Users\Cimin\.claude\skills\trading-code-craft\evals\evals.json`

- [ ] **Step 1: Adaugă 6 evals** (id 6–11), cu `prompt` în română ca cele existente și `expected_output` verificabil, conform spec §10:
  - `6 improve-crypto-scanner-button`: prompt „În crypto scanner (fișierul din Downloads) vreau un buton care exportă portofoliul (pf_entries) în CSV." → expected: fetch-uri (dacă apar) prin fetchSafe, paleta indigo/tokens existenți NU BTC orange, fără `$('id')`, fără bump sw.js (nu există), bump `vN.N` în `.brand-sub`, cheie/format localStorage consecvent, secțiune Idei la final.
  - `7 sync-grid-engine-scoring`: prompt „Vreau ca neutralSubScore să dea mai multe puncte când oscillation rate e peste 10%. Modifică scoringul." → expected: modificare IDENTICĂ în `tools/grid-engine/grid-engine.js` ȘI în copia inline din scanner, menționată explicit; avertisment trader (prag nou = re-validare, nu doar cifră schimbată).
  - `8 add-automation-alert-type`: prompt „Adaugă în check-alerts.mjs un tip de alertă `cross`: alertează când prețul traversează o medie mobilă pe 20 de zile." → expected: semantica one-shot/re-arm declarată, histerezis la re-arm, stare persistată în alerts.json, escape HTML pe mesajul Telegram, mențiune commit `[skip ci]`, weekend handling respectat.
  - `9 redesign-dashboard-readability`: prompt „Dashboard-ul din watchlist-monitor arată aglomerat, fă-l mai lizibil și mai modern." → expected: aplică design.md (ierarhie, spacing, empty/loading states) FĂRĂ să schimbe paleta/fonturile; bump dublu versiune (sw.js + badge); propuneri de evoluție a sistemului doar în secțiunea Idei.
  - `10 trader-skepticism-thresholds`: prompt „Ce praguri de scor ar fi mai bune pentru semnalele long din smart-trade-long? Optimizează-le." → expected: răspunsul cere/propune validare walk-forward sau out-of-sample, avertisment de overfitting și sample size, praguri pe regimuri diferite — nu doar numere noi.
  - `11 ideas-section-mandatory`: prompt „Adaugă un buton de refresh manual în sector-rotation." → expected: livrare normală (cu bump dublu versiune) care se TERMINĂ cu secțiunea `## Idei`: 2–4 propuneri cu efort S/M/L, neimplementate.

- [ ] **Step 2: Validează JSON** — `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')) && console.log('OK')" <cale>` → `OK`. Evals 0–5 neatinse.

### Task 8: Rulare evals + corecții

**Files:**
- Read: toate fișierele skill-ului; posibile corecții în oricare.

- [ ] **Step 1: Rulează evals-urile** — pentru fiecare din cele 12 evals, dispatch un subagent cu: conținutul SKILL.md + referințele + prompt-ul evalului (+ fixture-ul dacă are), instruit să livreze ca și cum ar fi sesiune reală. Poți rula în paralel (independente).
- [ ] **Step 2: Notează per eval** PASS/FAIL față de `expected_output` (grading manual pe output, criteriu cu criteriu).
- [ ] **Step 3: Corectează skill-ul** unde pică (regula neclară → reformulează; referință prea lungă → strânge), re-rulează DOAR evals-urile picate. Țintă: 12/12, minim acceptat 11/12 cu explicație.

### Task 9: Backup E: + memorie + commit plan

**Files:**
- Create: backup pe `E:` (director conform structurii existente — verifică întâi cu Glob ce structură are E:\)
- Modify: `C:\Users\Cimin\.claude\projects\C--Users-Cimin-premarket-scanner\memory\trading-code-craft-skill.md` + `MEMORY.md` dacă hook-ul se schimbă

- [ ] **Step 1: Backup** — copiază folderul complet `trading-code-craft\` pe `E:` lângă celelalte backup-uri (verifică structura existentă înainte; creează `E:\<loc potrivit>\claude-skills\trading-code-craft\` dacă nu există ceva mai potrivit).
- [ ] **Step 2: Memorie** — actualizează `trading-code-craft-skill.md`: acoperire 4 lumi (Pine, PWA, Crypto Scanner Pro + grid-engine sync, Automation/Worker), transversale trader+design, secțiunea Idei obligatorie, evals 12. Actualizează hook-ul din MEMORY.md dacă nu mai e fidel.
- [ ] **Step 3: Commit** în worktree: planul + orice actualizare de spec (`git add docs/ && git commit -m "docs(plan): trading-code-craft v2 executat"`).

## Self-Review (rulat la scriere)

1. **Acoperire spec:** §2→Task 1–4 structura; §3→Task 6; §4→Task 1; §5→Task 2; §6→Task 3; §7→Task 4; §8→Task 5; §9→Task 6 Step 5; §10→Task 7–8; §11→Task 9; §12 (excluderi) → în Global Constraints. Fără găuri.
2. **Placeholders:** niciun TBD; fiecare task listează conținutul concret cerut.
3. **Consistență nume:** `trader.md`/`design.md`/`crypto-scanner.md`/`automation.md` identice în Task 1–6; funcțiile grid-engine identice cu explorarea.
