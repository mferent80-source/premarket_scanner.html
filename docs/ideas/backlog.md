# Backlog de idei — trading suite

Întreținut de skill-ul `trading-ideation`. Statusuri: `propus` · `aprobat` · `făcut` · `respins`.
Sursă: `ideation` (generat de skill) · `tcc-idei` (din secțiunile „Idei" ale trading-code-craft) · `user`.
Regulă: ideile `respins`/`făcut` NU se repropun (nici reformulate).

| id | titlu | tool | efort | prio | status | sursă | dată |
|----|-------|------|-------|------|--------|-------|------|
| I-001 | Journal consolidat de execuții (review pe trade-uri reale) | NOU: journal/ | L | P1 | propus | ideation | 2026-07-02 |
| I-002 | Portfolio Risk Deck (risc agregat pe pozițiile deschise) | NOU: portfolio/ | M | P1 | propus | ideation | 2026-07-02 |
| I-003 | Suite Health (starea infrastructurii: proxy/chei/bot/sync) | NOU: health/ | S | P2 | propus | ideation | 2026-07-02 |
| I-004 | Weekly Review (retrospectiva săptămânii, client-side + AI) | NOU: weekly/ | M | P3 | propus | ideation | 2026-07-02 |

## Mini-spec-uri

### I-001 · Journal consolidat de execuții · [L] · P1
- **Problema/golul:** există PATRU jurnale paralele, fiecare parțial: `trade_plans_v1` (FAB 📓 hub — tracker minim, PnL `(exit−entry)*size` FĂRĂ comision/slippage = ficțiune per trader.md §2, status win/loss manual), `saved_setups` (Signal Journal macro — planuri evaluate close-only), `lib/ledger.js` (semnale +5/+20z), `stl_scan_history`+`pb_verdict_track` (scorecards per-tool). Niciunul nu răspunde la „cum tranzacționez EU de fapt": expectancy pe execuții reale, greșeli recurente, performanță pe sursă de semnal și pe regim.
- **Soluția:** pagină nouă `journal/` + modul `lib/journal.js` cu schemă unificată de execuție (entry/exit reale, size, fees, slippage estimat, sursa semnalului — link la setup/ledger, tag-uri de greșeală, regimul zilei la intrare din `md_risk_regime`). Migrare read-only din `trade_plans_v1` (nu strică FAB-ul). Scorecard pe execuții: expectancy R, PF, win% segmentat pe sursă/regim/tag, cu avertisment eșantion n<10.
- **Impact:** singura sursă de adevăr despre banii reali; închide etapa „review" a workflow-ului care azi e imposibilă cross-jurnale. Decizie mai bună: tai sursele de semnal care nu fac bani.
- **Riscuri/dependențe:** disciplina introducerii manuale a fill-urilor (fără broker API — Trade212 nu e integrat); migrarea trebuie să nu corupă `trade_plans_v1`; expectancy pe n mic = zgomot (afișat explicit).
- **Fișiere atinse:** `journal/index.html` (nou), `lib/journal.js` (nou), `index.html` (card hub + FAB link), `sw.js` (precache), `guide/index.html`.

### I-002 · Portfolio Risk Deck · [M] · P1
- **Problema/golul:** hub-ul arată doar COUNT-ul „Open trades"; nimeni nu agregă riscul pozițiilor deschise. Verificat pe disc: „expunere" apare doar per-simbol (watchlist `wlMacroSens`, macro Setup Builder); „risc agregat" nu există nicăieri. Un trader cu 5 poziții nu vede: risc total la SL-uri cumulat ($ și % din cont), concentrare pe sector, câte poziții pică simultan dacă QQQ −3%.
- **Soluția:** pagină `portfolio/` (sau secțiune mare în hub) care citește pozițiile `status:'open'` din `trade_plans_v1` + prețuri live (lib/data.js): tabel poziții cu PnL nerealizat, risc-la-SL per poziție și CUMULAT, breakdown pe sector (`sectorOf` există în watchlist), sensibilitate macro agregată, mini-stress „QQQ −3%" prin beta (beta vs QQQ există în watchlist v132). Alertă vizuală când riscul cumulat depășește bugetul zilnic (multiplicatorul din Danger Score).
- **Impact:** previne pierderea cea mai scumpă — supra-expunerea corelată (3 poziții tech = un singur trade mare). Riscul agregat e etapa complet neacoperită a workflow-ului.
- **Riscuri/dependențe:** depinde de calitatea datelor din `trade_plans_v1` (size/SL introduse corect); beta/corelația din date zilnice = aproximare (declarat în UI); stress-test-ul e liniar-naiv (beta), nu scenariu real — etichetat ca estimare.
- **Fișiere atinse:** `portfolio/index.html` (nou), `index.html` (card hub), `sw.js` (precache), `guide/index.html`; refolosește `lib/data.js`, logica sector/beta din `watchlist-monitor/index.html`.

### I-003 · Suite Health · [S] · P2
- **Problema/golul:** când ceva tace, afli când te doare: gist sync nasdaq dă 401 de săptămâni (TODO cunoscut), proxy-urile CORS cad cu strike-counter per pagină (`PROXY_TIMEOUTS` în macro), botul server-side are heartbeat DOAR în log-urile GitHub Actions (`tools/check-alerts.mjs` L123-127), cheile (Finnhub/Anthropic/TG/gist) n-au nicio verificare centrală. Verificat: nu există nicio pagină/secțiune de health în suită.
- **Soluția:** pagină mică `health/` (sau secțiune în guide): ping tt-proxy + fallback-uri (timp de răspuns), test cheie Finnhub (1 request quote), test cheie Anthropic (prezență, nu apel), test TG (`TG.test()` există), vârsta ultimului heartbeat al botului (scris de bot într-un loc citibil — ex. commit pe `alerts.json` sau gist), vârsta CACHE_VERSION vs badge-uri. Verde/galben/roșu per componentă.
- **Impact:** risc prevenit — „alertele tac" e cel mai periculos failure mode (crezi că ești păzit și nu ești); 401-ul de gist ar fi fost prins din prima zi.
- **Riscuri/dependențe:** heartbeat-ul botului cere o mică scriere server-side citibilă din client (azi doar log Actions — dependență pe un pas de automation); testele de chei consumă câte 1 request (rulare la buton, nu automat).
- **Fișiere atinse:** `health/index.html` (nou) sau secțiune în `guide/index.html`, `tools/check-alerts.mjs` (heartbeat citibil), `sw.js`, `index.html` (card/link).

### I-004 · Weekly Review · [M] · P3
- **Problema/golul:** scorecard-urile există per-tool (ledger hub, Journal macro, STL expectancy, brief-tracker) dar nimeni nu le pune cap la cap; review-ul săptămânal — „ce a mers, ce am ignorat, ce lecție trag" — se face manual sau deloc.
- **Soluția:** secțiune/pagină client-side „Review-ul săptămânii" generată LA BUTON (nu cron — datele-s în localStorage, serverul nu le vede; limită declarată): agregă pe ultimele 5 zile semnalele din ledger + hit-rate brief-tracker + execuțiile din journal (I-001 dacă există, altfel `trade_plans_v1`) + evenimentele macro consumate, apoi o sinteză AI (lib/ai.js, non-streaming) cu 3 secțiuni: ce a funcționat / ce a fost zgomot / de urmărit săptămâna viitoare. Cache pe săptămână (ISO week).
- **Impact:** timp câștigat + învățare sistematică; transformă grămada de scorecard-uri în o decizie pe săptămână.
- **Riscuri/dependențe:** valoarea crește mult DUPĂ I-001 (fără execuții consolidate, review-ul e doar despre semnale); n mic pe o săptămână = concluzii-zgomot (avertisment obligatoriu în output).
- **Fișiere atinse:** secțiune în `index.html` (hub, sub Signal Ledger) sau `weekly/index.html`, `sw.js`; refolosește `lib/ledger.js`, `lib/ai.js`, `pb_verdict_track`.
