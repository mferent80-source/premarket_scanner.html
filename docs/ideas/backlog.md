# Backlog de idei — trading suite

Întreținut de skill-ul `trading-ideation`. Statusuri: `propus` · `aprobat` · `făcut` · `respins`.
Sursă: `ideation` (generat de skill) · `tcc-idei` (din secțiunile „Idei" ale trading-code-craft) · `user`.
Regulă: ideile `respins`/`făcut` NU se repropun (nici reformulate).

| id | titlu | tool | efort | prio | status | sursă | dată |
|----|-------|------|-------|------|--------|-------|------|
| I-001 | Journal consolidat de execuții (review pe trade-uri reale) | NOU: journal/ | L | P1 | făcut | ideation | 2026-07-02 |
| I-002 | Portfolio Risk Deck (risc agregat pe pozițiile deschise) | NOU: portfolio/ | M | P1 | făcut | ideation | 2026-07-02 |
| I-003 | Suite Health (starea infrastructurii: proxy/chei/bot/sync) | NOU: health/ | S | P2 | făcut | ideation | 2026-07-02 |
| I-004 | Weekly Review (retrospectiva săptămânii, client-side + AI) | NOU: weekly/ | M | P3 | făcut | ideation | 2026-07-02 |
| I-005 | Shadow tracker pe semnalele blocate de macro gate | AntiFOMO Pine | M | P1 | făcut | ideation | 2026-07-03 |
| I-006 | Earnings guard pe preset Nasdaq | AntiFOMO Pine | S | P1 | făcut | ideation | 2026-07-03 |
| I-007 | Connector Meta-Confluence (slot AntiFOMO) | AntiFOMO Pine | S | P3 | făcut | ideation | 2026-07-03 |
| I-008 | Exit alert cu payload JSON → journal | AntiFOMO Pine | S | P3 | făcut | ideation | 2026-07-03 |
| I-009 | Aliniere alerte regim cu gate-ul real + vârsta gate-ului | AntiFOMO Pine | S | P2 | făcut | ideation | 2026-07-03 |
| I-010 | Detalii macro pe toggle (dashboard Pro de ziar → nucleu) | AntiFOMO Pine | S | P3 | făcut | ideation | 2026-07-03 |
| I-011 | Alerte filtrate pe quality score (prag preset) | ZLHMA TOP Pine | S | P1 | făcut | ideation | 2026-07-04 |
| I-012 | Preset Scalping (ZLHMA 9/20, dirHold=1) | ZLHMA TOP Pine | S | P1 | făcut | ideation | 2026-07-04 |
| I-013 | Forecast overlay RDS (durată trend HMA) | ZLHMA TOP Pine | M | P2 | făcut | ideation | 2026-07-04 |
| I-014 | Filtru chop ADX + volum în quality score | ZLHMA TOP Pine | M | P2 | făcut | ideation | 2026-07-04 |
| I-015 | Connector Meta-Confluence (dir −2..+2) | ZLHMA TOP Pine | S | P3 | propus | ideation | 2026-07-04 |
| I-016 | Earnings guard pe preset Nasdaq | ZLHMA TOP Pine | S | P2 | propus | ideation | 2026-07-04 |
| I-017 | Quality gate pe cross-uri BULL/BEAR | ZLHMA TOP Pine | S | P1 | făcut | ideation | 2026-07-05 |
| I-018 | STATS expectancy pe semnale confirmate | ZLHMA TOP Pine | M | P2 | făcut | ideation | 2026-07-05 |
| I-019 | Semnale pullback (touch HMA + bounce) | ZLHMA TOP Pine | M | P2 | făcut | ideation | 2026-07-05 |
| I-020 | Payload JSON cu SL/TP ATR → journal | ZLHMA TOP Pine | S | P2 | propus | ideation | 2026-07-05 |
| I-021 | Filtru sesiune RTH pe preset Nasdaq | ZLHMA TOP Pine | S | P2 | propus | ideation | 2026-07-05 |
| I-022 | Breakdown quality în dashboard (toggle) | ZLHMA TOP Pine | S | P3 | propus | ideation | 2026-07-05 |
| I-023 | Quality gate + minQual preset pe alerte | ZLEMA Pine | S | P1 | propus | ideation | 2026-07-05 |
| I-024 | Preset Swing (TF mari, motor lent) | ZLEMA Pine | S | P1 | propus | ideation | 2026-07-05 |
| I-025 | Semnale vizuale Early/Confirmed + pullback | ZLEMA Pine | M | P1 | propus | ideation | 2026-07-05 |
| I-026 | ADX chop + volum în quality score | ZLEMA Pine | M | P2 | propus | ideation | 2026-07-05 |
| I-027 | Forecast RDS pe linia ZLEMA | ZLEMA Pine | M | P2 | propus | ideation | 2026-07-05 |
| I-028 | STATS expectancy pe semnale confirmate | ZLEMA Pine | M | P2 | propus | ideation | 2026-07-05 |

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

### I-005 · Shadow tracker pe semnalele blocate de macro gate · [M] · P1
- **Problema/golul:** macro gate-ul e cel mai scump filtru din AntiFOMO (~36 `request.security`, jumătate din cod), dar nu există nicio dovadă că adaugă edge: STATS măsoară doar trade-urile care AU trecut de gate, iar semnalele blocate dispar fără urmă. Întrebarea „gate-ul previne pierderi sau taie câștiguri?" nu are azi răspuns (trader.md §1: segmentează pe regim, nu doar agregat).
- **Soluția:** un al doilea tracker de poziție „umbră" (aceeași mașină pesimistă SL-întâi din POSITION TRACKING) care intră pe semnalele complete dar blocate EXCLUSIV de macro gate (`mandatory + reversal + touchedPullback + scoruri OK + macroGateOk == false`). STATS primește un rând nou „Blocate de gate: N tr · exp ±X.XXR" — expectancy negativ al umbrei = gate-ul previne pierderi; pozitiv = gate-ul taie profit. Avertisment n<10 afișat explicit.
- **Impact:** validează/invalidă cu date filtrul central al indicatorului, per simbol și TF; pe crypto poate arăta negru pe alb dacă stack-ul macro US e zgomot acolo — decizia „țin gate-ul ON?" devine măsurabilă.
- **Riscuri/dependențe:** rezultatul e ipoteză pe eșantionul simbolului curent (out-of-sample per trader.md); dublează starea tracker-ului (atenție la var-uri paralele); zero request-uri noi (plafonul 40 rămâne neatins).
- **Fișiere atinse:** `pine-scripts\AntiFOMO_Pro_v9_2.pine` (secțiunile POSITION TRACKING + STATS), `AntiFOMO_Pro_v9_2_README.md`.

### I-006 · Earnings guard pe preset Nasdaq · [S] · P1
- **Problema/golul:** pe stocks, pullback-ul perfect cu earnings peste 1–2 zile e un risc binar pe care indicatorul nu-l vede — gap-ul prin SL la earnings e exact pierderea pe care stopul NU o limitează (trader.md §2-3). Un anti-FOMO care lasă intrarea cu earnings a doua zi își ratează misiunea.
- **Soluția:** guard pe `earnings.future_time` (built-in Pine, zero request-uri noi): dacă următorul raport e la ≤N zile (input, default 3), pe preset Nasdaq semnalul LONG e blocat, `blockReason` afișează „EARNINGS in Xz", + alertă de avertizare. Toggle ON/OFF; inactiv pe Crypto/Custom; `na` (simbol fără date de earnings) = guard pasiv, nu blochează.
- **Impact:** previne categoric cea mai urâtă pierdere pe stocks — riscul binar peste noapte; aliniat cu convenția casei (presetul Nasdaq să includă earnings/macro).
- **Riscuri/dependențe:** `earnings.future_time` poate fi `na` pe unele simboluri/planuri TV (declarat în dashboard); blocajul poate tăia și intrări câștigătoare — pragul N e ipoteză, de aceea toggle + valoare vizibilă în panou.
- **Fișiere atinse:** `pine-scripts\AntiFOMO_Pro_v9_2.pine` (inputs Anti-FOMO, `mandatory`/`blockReason`, dashboard SETUP, alerts), `AntiFOMO_Pro_v9_2_README.md`.

### I-007 · Connector Meta-Confluence (slot AntiFOMO) · [S] · P3
- **Problema/golul:** AntiFOMO e singurul tool matur din familia Pine fără export connector — Meta-Confluence și Command Deck nu-l pot consuma prin `input.source`; verdictul lui trăiește izolat pe chart, deși e singura lentilă „pullback-quality" din ecosistem.
- **Soluția:** un plot „AF Verdict (connector)" în convenția casei −3..+3 (LONG ACUM=+3, READY=+2, LOADED/ARMED=+1, WAIT=0, FOMO=−2, FOMO+VSA bear/upthrust=−3), `display.none` (vizibil doar în Data Window), ca la CVD PRO / Confirmation Engine / HVol / IronRod. Onest pe asimetrie: valorile negative înseamnă „nu intra long", NU „intră short" (tool long-only) — documentat în README.
- **Impact:** AntiFOMO devine o lentilă în meta-verdictul ALIGNED/CONFLICT; timp câștigat la citirea confluenței multi-tool.
- **Riscuri/dependențe:** slotul nou în Meta-Confluence e o modificare separată (alt fișier); semantica asimetrică poate induce în eroare dacă nu e documentată; companion-ul Subscores citește după numele plot-ului — de păstrat numele stabile.
- **Fișiere atinse:** `pine-scripts\AntiFOMO_Pro_v9_2.pine` (plot connector), `AntiFOMO_Pro_v9_2_README.md`; ulterior Meta-Confluence (slot nou — livrare separată).

### I-008 · Exit alert cu payload JSON → journal · [S] · P3
- **Problema/golul:** la intrare pleacă un JSON complet pe webhook (`longSignal` → entry/SL/TP), dar la închiderea poziției tracker pleacă doar textul „Pozitie inchisa" — fără exit, fără R realizat, fără motiv. Bucla semnal→execuție→review (journal/ din I-001) rămâne ruptă exact la capătul care contează.
- **Soluția:** la fiecare exit al tracker-ului, `alert()` cu JSON: symbol, tf, entry, exit, R realizat, motiv (SL / TP3 / TIMEOUT), durata în bare — format compatibil cu schema din `lib/journal.js`. Webhook-ul TradingView poate lovi un endpoint de ingestie (de construit în automation) sau mesajul se copiază manual în journal până atunci.
- **Impact:** R-ul realizat vine din tracker, nu din memorie — journal mai precis, completat în secunde.
- **Riscuri/dependențe:** webhook-urile TradingView cer plan cu alerte webhook; endpointul de ingestie NU există încă (dependență pe un pas automation separat); R-ul tracker-ului e aproximare price-touch fără costuri (declarat deja în STATS, de declarat și în payload).
- **Fișiere atinse:** `pine-scripts\AntiFOMO_Pro_v9_2.pine` (secțiunea position tracking / alerts), `AntiFOMO_Pro_v9_2_README.md`; ulterior endpoint în premarket_scanner (livrare separată).

### I-009 · Aliniere alerte regim cu gate-ul real + vârsta gate-ului · [S] · P2
- **Problema/golul:** alertele „Macro RISK-ON/OFF" folosesc `SMA5(macroScore)` cu praguri 0.60/0.35, dar gate-ul care chiar blochează semnalul e histerezisul 0.55/0.45 pe scorul brut (`macroRiskOn`) — poți primi alertă RISK-ON în timp ce gate-ul e OFF și invers. În plus, dashboard-ul nu arată de câte bare e gate-ul în starea curentă — regim proaspăt vs matur (regula de aur din cheat-sheet-ul VolRegime) e invizibil.
- **Soluția:** alertă nouă pe flip-ul REAL al `macroRiskOn` (edge detect pe var-ul de gate); cele vechi rămân redenumite „regim netezit" sau se scot. Plus contor `barsSinceGateFlip` afișat în rândul MACRO („RISK-ON de 37b").
- **Impact:** alerta primită = starea care îți deblochează/blochează intrările (azi pot diverge); vârsta regimului previne intrarea târzie în regim matur.
- **Riscuri/dependențe:** minime — edge-case la prima bară (init var); dacă se scot alertele vechi, alertele active pe ele în TV trebuie recreate manual (Pine Editor sync).
- **Fișiere atinse:** `pine-scripts\AntiFOMO_Pro_v9_2.pine` (ALERTS + dashboard MACRO), `AntiFOMO_Pro_v9_2_README.md`.

### I-010 · Detalii macro pe toggle (dashboard Pro de ziar → nucleu) · [S] · P3
- **Problema/golul:** pe modul Pro dashboard-ul are ~25 de rânduri — design.md §3 recomandă ~7 vizibile, restul pe toggle. În plus, label-urile secțiunilor sunt statice și mint pe crypto: „MACRO EXT +12 factori" când `incMicro` a exclus 8 din ei (la fel „+5 factori" la FRED vs numărătoarea reală).
- **Soluția:** input „Arata detalii macro" (default OFF) care ascunde rândurile-detaliu MACRO/EXT/FRED/V7 — barele de scor + rândul MACRO summary rămân, deci informația agregată nu se pierde (factorii intră oricum în scor). Label-urile secțiunilor calculate dinamic din contribuția reală la `totCnt`.
- **Impact:** esențialul (hero + blockReason + 4 bare de scor + STATS) se citește în 2 secunde; onestitate pe crypto la numărul de factori.
- **Riscuri/dependențe:** userul care vrea factorii individuali are un click în plus; numărul de rânduri devine variabil (contorul `rw` există deja, suportă).
- **Fișiere atinse:** `pine-scripts\AntiFOMO_Pro_v9_2.pine` (inputs Display + secțiunea DASHBOARD), `AntiFOMO_Pro_v9_2_README.md`.

### I-011 · Alerte filtrate pe quality score · [S] · P1
- **Problema/golul:** ZLHMA reacționează mai repede decât ZLEMA — cross-urile și STRONG LONG/SHORT alertează și pe semnale slabe (slope mic, ribbon nealiniat, HTF contra). Azi `sigUp`/`strongLong` nu verifică `quality` din `f_quality` (L194–204 din `Zero_Lag_HMA_Dashboard_v1.pine`).
- **Soluția:** prag `minQuality` derivat din preset (ex. Crypto 55%, Nasdaq 65%, Custom input); alertele JSON și `alertcondition` declanșează doar când `quality >= minQuality` și `dir != 0`. Dashboard arată pragul activ în rândul „Prag STRONG" sau un rând nou „Alert gate".
- **Impact:** mai puțin zgomot Telegram/webhook; decizii mai bune pe semnale cu confluență internă suficientă. Pragurile sunt ipoteze — de validat out-of-sample.
- **Riscuri/dependențe:** poate rata intrări rapide valoroase pe scalping; pragul trebuie toggle ON/OFF.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (inputs Preset, bloc Alerte, eventual dashboard).

### I-012 · Preset Scalping · [S] · P1
- **Problema/golul:** scriptul are doar Crypto/Nasdaq/Custom — lipsește profilul pentru TF mici unde ZLHMA e recomandat (SMI Fractal notează ZLHMA „scalping ONLY" cu 9/20). Userul trebuie să ghicească Custom manual.
- **Soluția:** al 4-lea preset „Scalping": ZLHMA ON forțat, fast 9 / slow 20, ATR 10, slopeTh 0.04, strongM 1.6, dirHold 1, chop OFF, extTh 2.0. Hero dashboard etichetează presetul explicit.
- **Impact:** setup instant pe 1m/5m crypto fără tuning; aliniat cu motorul zero-lag al tool-ului.
- **Riscuri/dependențe:** pe stocks RTH spread-ul mare pe TF mic = semnale zgomotoase (avertisment în tooltip preset).
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (bloc Preset + derivări).

### I-013 · Forecast overlay RDS · [M] · P2
- **Problema/golul:** față de `SMI_Fractal_Iron_HMA_v9.pine` (L750–869), ZLHMA TOP nu oferă proiecție de durată trend — userul vede verdictul dar nu „cât mai durează tipic această fază". Diferențiere slabă față de `Zero_Lag_EMA_Dashboard_v1_4` (același dashboard, alt MA).
- **Soluția:** port minimal RDS v4.61: array-uri `bullishDurations`/`bearishDurations` pe flip-uri HMA, forecast pe ultima bară (Real/Avg, unghi slope, toggle OFF by default). Reutilizează `hmaFast` ca linie sursă.
- **Impact:** context temporal la intrare (trend tânăr vs matur); diferențiere clară vs ZLEMA duplicate.
- **Riscuri/dependențe:** overhead vizual dacă nu rămâne OFF by default; sample mic pe simbol nou = „Avg: -" (de afișat explicit).
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (grup Vizual nou, logică forecast); referință `SMI_Fractal_Iron_HMA_v9.pine`.

### I-014 · Filtru chop ADX + volum în quality · [M] · P2
- **Problema/golul:** filtrul chop actual (L126–127) verifică doar `slopeSm < slopeTh` — în range ADX sub 20 HMA flip-uiește des și quality score nu penalizează volum slab sau lipsă de participare.
- **Soluția:** `ta.dmi` pentru ADX sub prag preset; dacă ADX < prag → downgrade STRONG la LONG/SHORT sau RABDARE. Componentă nouă în `f_quality`: RVOL vs SMA(volume) sau buy% simplu (pattern din SMI L742–747). Toggle „Filtru ADX" + „Volum în quality".
- **Impact:** mai puține whipsaw-uri în consolidare; quality reflectă participarea reală, nu doar geometria HMA.
- **Riscuri/dependențe:** `volume` na pe forex/indici (guard obligatoriu); pragurile ADX/RVOL = ipoteze per regim.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (Filtru, f_quality, dashboard detalii).

### I-015 · Connector Meta-Confluence · [S] · P3
- **Problema/golul:** AntiFOMO, CVD PRO, Confirmation Engine exportă plot connector −3..+3 pentru `input.source` — ZLHMA TOP izolează `dir` în dashboard fără export (convenția din I-007).
- **Soluția:** `plot(dir, "ZLHMA Dir (connector)", display=display.none)` — mapare: STRONG LONG=+2, LONG=+1, RABDARE=0, SHORT=−1, STRONG SHORT=−2; opțional al doilea plot `quality` pentru Command Deck.
- **Impact:** ZLHMA devine lentilă în meta-verdict fără a citi manual dashboard-ul pe fiecare chart.
- **Riscuri/dependențe:** Meta-Confluence trebuie actualizat separat cu slot nou; numele plot-ului stabil pentru companion scripts.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine`; ulterior `Meta_Confluence_v*.pine`.

### I-016 · Earnings guard pe preset Nasdaq · [S] · P2
- **Problema/golul:** pe stocks, STRONG LONG cu earnings în 1–3 zile e risc binar (model I-006 AntiFOMO) — ZLHMA TOP nu verifică `earnings.future_time`.
- **Soluția:** pe preset Nasdaq: dacă earnings ≤ N zile, downgrade `dir` maxim la ±1 și badge „EARNINGS in Xz" în `warnTxt`; alertă `ZLHMA_EARNINGS_WARN` JSON. Inactiv pe Crypto/Scalping.
- **Impact:** previne intrări trend agresive înainte de raport; aliniat cu convenția preset Nasdaq (pine.md §3).
- **Riscuri/dependințe:** `earnings.future_time` poate fi `na`; guard pasiv când lipsesc date.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (Preset, rawDir/warnTxt, alerte).

### I-017 · Quality gate pe cross-uri BULL/BEAR · [S] · P1
- **Problema/golul:** I-011 e parțial livrat în v1.6.1 — `useQualGate` filtrează BUY/SELL confirmate și STRONG, dar `sigUp`/`sigDown` (L460–463) și `alertcondition` BULL/BEAR (L479–480) declanșează încă fără `quality >= minQual`. Pe ZLHMA rapid, cross-urile brute sunt sursa principală de zgomot Telegram.
- **Soluția:** aceeași poartă `useQualGate` pe `ZLHMA_BULL_CROSS`/`ZLHMA_BEAR_CROSS` și pe `alertcondition`-urile aferente; opțional prag separat `minQualCross` (default = `minQual`). Dashboard: rând „Cross gate" sau extindere „Alert qual".
- **Impact:** consistență alerte — nu mai primești cross Telegram când quality e 30% și HTF contra. Pragurile rămân ipoteze de validat out-of-sample.
- **Riscuri/dependențe:** pe Scalping poate rata cross-uri rapide valoroase — toggle separat pentru cross vs confirmed.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (bloc Alerte L450–485).

### I-018 · STATS expectancy pe semnale confirmate · [M] · P2
- **Problema/golul:** AntiFOMO are panou STATS (expectancy R, PF, shadow gate) — ZLHMA TOP livrează verdict + quality dar zero feedback „semnalele mele pe acest simbol/TF au avut edge?". Userul nu poate valida ipotezele de prag fără export manual.
- **Soluția:** tracker pesimist price-touch pe `confBuySig`/`confSellSig` (SL = HMA fast sau ATR×mult, TP = ATR×mult preset), contor trades + expectancy R + PF în rând STATS sub dashboard (toggle OFF by default). Avertisment n<10 obligatoriu. Fără `request.security` noi.
- **Impact:** validare out-of-sample pe chart, fără strategy file — răspunde la „merită minQual 65% pe Nasdaq?".
- **Riscuri/dependențe:** R aproximativ fără comision/slippage (declarat ca la AntiFOMO STATS); sample mic pe simbol nou = zgomot.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (secțiune nouă POSITION/STATS + dashboard).

### I-019 · Semnale pullback (touch HMA + bounce) · [M] · P2
- **Problema/golul:** semnalele actuale sunt cross HMA sau flip `dir` — pe trend matur userul intră des EXTINS (warnTxt) sau chase-uiește cross târziu. Lipsește tipul „retest HMA în trend" (pattern standard continuation).
- **Soluția:** detectare touch: low/high atinge `hmaFast` ± buffer ATR în `dir != 0`, urmat de închidere în sensul trendului; label „PULLBACK BUY/SELL" + alertă JSON `ZLHMA_PULLBACK_*`. Toggle + cerință `quality >= minQual` și `not extended`. Opțional `trendBars >= 3`.
- **Impact:** intrări mai bune în trend continuu, mai puțin FOMO pe extended; diferențiere față de ZLEMA (același dashboard, alt motor).
- **Riscuri/dependențe:** pe chop, touch-urile multiplică semnale false — combină cu I-014 ADX sau filtru chop existent.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (grup Semnale, alerte, dashboard „Semnal").

### I-020 · Payload JSON cu SL/TP ATR → journal · [S] · P2
- **Problema/golul:** `f_json` (L343–350) trimite dir/quality/hma dar fără niveluri acționabile — bucla semnal→journal (I-001/I-008 AntiFOMO) se rupe la capătul ZLHMA: userul completează manual SL/TP.
- **Soluția:** la `ZLHMA_BUY_CONFIRMED`/`STRONG_LONG` (și simetric SHORT): câmpuri `sl`, `tp1`, `tp2`, `slDistAtr`, `riskNote` derivate din `hmaFast`, `atr`, multiplicatori preset. Format compatibil cu `lib/journal.js`. Fără endpoint nou obligatoriu — copy-paste sau webhook existent.
- **Impact:** journal completat în secunde; aliniere cu workflow-ul de execuție reală.
- **Riscuri/dependențe:** SL pe HMA poate fi prea strâns pe volatile — multiplicator ATR configurabil; nu înlocuiește decizia de sizing.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (`f_json`, inputs Preset); opțional ingestie în automation (livrare separată).

### I-021 · Filtru sesiune RTH pe preset Nasdaq · [S] · P2
- **Problema/golul:** trader.md §3 — stocks au premarket/after-hours cu spread și volum distorsionat; ZLHMA pe 5m premarket generează flip-uri ZLHMA rapide fără context sesiune. AntiFOMO și `check-alerts.mjs` tratează deja diferența stocks/crypto.
- **Soluția:** pe preset Nasdaq: input „Doar RTH (ET)" — în afara 09:30–16:00 ET downgrade `dir` la max ±1 sau blochează alertele confirmate; badge „PREMARKET"/„AH" în `warnTxt`. Inactiv pe Crypto/Scalping. Fus ET explicit în tooltip.
- **Impact:** mai puțin zgomot pe ore subțiri; decizii aliniate cu lichiditatea executabilă.
- **Riscuri/dependențe:** `time()` + timezone TV trebuie setat corect de user; DST — folosește `syminfo.timezone` unde e posibil.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (Preset, rawDir/warnTxt, alerte).

### I-022 · Breakdown quality în dashboard (toggle) · [S] · P3
- **Problema/golul:** `f_quality` (L221–231) compune 6 componente (slope, dist, persist, ribbon, HTF, extended) dar dashboard-ul arată doar procentul agregat — userul nu știe *de ce* quality e 42% (slope slab vs HTF contra vs extended).
- **Soluția:** când `showDetail` ON, 3–4 rânduri compacte: SlopeQ, RibbonQ, HTF Q, ExtQ (valori % sau bare text). Respectă design.md §3 (~7 rânduri nucleu, restul pe toggle).
- **Impact:** debugging rapid al semnalelor slabe fără Data Window; învață ce componentă taie quality pe regim.
- **Riscuri/dependențe:** +4 rânduri doar cu toggle — hero rămâne curat.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_HMA_Dashboard_v1.pine` (`f_quality` refactor return struct sau funcții aux, dashboard).

### I-023 · Quality gate + minQual preset pe alerte · [S] · P1
- **Problema/golul:** `Zero_Lag_EMA_Dashboard_v1_4.pine` calculează `quality` (L173–183) dar alertele `sigUp`/`strongLong` (L317–325) și `alertcondition` (L333–339) declanșează fără prag — STRONG și cross-uri ies și la ribbon nealiniat, HTF contra, extended. ZLHMA v1.7.0 are deja `minQual` + `useQualGate`; ZLEMA e în urmă cu ~3 versiuni de features.
- **Soluția:** `minQual` derivat din preset (Swing/Crypto/Nasdaq/Custom — praguri mai mari decât ZLHMA: motor lent = mai puține dar mai curate); `useQualGate` pe STRONG, cross BULL/BEAR, alerte JSON cu `minQual` în payload. Dashboard: rând „Alert qual".
- **Impact:** mai puțin zgomot Telegram; aliniere cu familia dashboard MA. Pragurile sunt ipoteze — validează out-of-sample.
- **Riscuri/dependențe:** poate rata cross-uri valoroase pe TF mic — toggle ON/OFF.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_EMA_Dashboard_v1_4.pine` (Preset, Alerte L317–339, dashboard).

### I-024 · Preset Swing (TF mari, motor lent) · [S] · P1
- **Problema/golul:** ZLEMA are Crypto/Nasdaq/Custom — nu există profil pentru 1H/4H/D unde motorul EMA zero-lag strălucește (trenduri mai lungi, mai puțin zgomot decât ZLHMA). Preset Scalping din ZLHMA nu se potrivește filozofiei ZLEMA (prea rapid).
- **Soluția:** al 4-lea preset „Swing": fast 21 / slow 55 (sau 34/89), ATR 14, slopeTh 0.07, strongM 2.0, dirHold 3, chop ON, extTh 2.8, minQual 70% Nasdaq / 60% Crypto. Hero etichetează „Swing" explicit.
- **Impact:** setup instant pe TF mari fără tuning manual; diferențiere clară față de ZLHMA Scalping.
- **Riscuri/dependențe:** pe 5m Swing poate fi prea lent — tooltip „recomandat 1H+".
- **Fișiere atinse:** `pine-scripts\Zero_Lag_EMA_Dashboard_v1_4.pine` (bloc Preset + derivări).

### I-025 · Semnale vizuale Early/Confirmed + pullback · [M] · P1
- **Problema/golul:** ZLEMA v1.4 nu are deloc labeluri, plotshape sau rând „Semnal" — doar cross-uri în alerte JSON (L317–325). Userul nu vede pe chart BUY/SELL confirmat, Early, sau retest ZLEMA (pullback), deși motorul lent e ideal pentru continuation pe touch.
- **Soluția:** port din ZLHMA v1.7.0 adaptat: grup Semnale (Early/Confirmed, labeluri, marcaje), pullback touch `zlema` ± buffer ATR, `lastSigTxt` în dashboard. Culori distincte PB vs Confirmed. Alerte `ZLEMA_BUY_CONFIRMED`, `ZLEMA_PULLBACK_BUY` etc.
- **Impact:** paritate UX cu ZLHMA; pullback pe ZLEMA = intrări swing naturale (mai puțin chase decât pe HMA rapid).
- **Riscuri/dependențe:** Early poate repainta — păstrează tooltip; pullback în chop necesită I-026 ADX.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_EMA_Dashboard_v1_4.pine` (grup Semnale nou, alerte, dashboard).

### I-026 · ADX chop + volum în quality score · [M] · P2
- **Problema/golul:** filtrul chop actual (L105–106) verifică doar `slopeSm < slopeTh` — în range ADX sub 20 ZLEMA flip-uiește târziu dar tot iese STRONG pe spike-uri scurte; `f_quality` nu penalizează volum slab (pattern SMI L742–747, deja în ZLHMA v1.7.0).
- **Soluția:** `ta.dmi` + downgrade STRONG la ADX < prag preset; componente `volQ`/`adxQ` în `f_quality` (guard `volume` na pe forex). Badge „CHOP" în `warnTxt`. Toggle-uri în Filtru.
- **Impact:** mai puține whipsaw-uri în consolidare; quality reflectă participarea reală.
- **Riscuri/dependențe:** pragurile ADX/RVOL = ipoteze per regim.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_EMA_Dashboard_v1_4.pine` (Filtru, f_quality, rawDir, dashboard detalii).

### I-027 · Forecast RDS pe linia ZLEMA · [M] · P2
- **Problema/golul:** ZLEMA arată verdict + quality dar nu „cât mai durează tipic această fază" — ZLHMA v1.7.0 are RDS (I-013 făcut); ZLEMA rămâne fără context temporal, deși trendurile pe EMA sunt de regulă mai lungi (avg durations diferite de HMA).
- **Soluția:** port minimal RDS v4.61 pe `zlema`: array-uri durate bullish/bearish, overlay Real/Avg, toggle OFF by default, rând Forecast în `showDetail`.
- **Impact:** diferențiere vs ZLHMA (durate medii mai mari așteptate); trend tânăr vs matur la intrare swing.
- **Riscuri/dependențe:** sample mic pe simbol nou = „Avg: -"; overhead vizual dacă nu rămâne OFF default.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_EMA_Dashboard_v1_4.pine` (grup Forecast, logică RDS); referință `Zero_Lag_HMA_Dashboard_v1.pine` + `SMI_Fractal_Iron_HMA_v9.pine`.

### I-028 · STATS expectancy pe semnale confirmate · [M] · P2
- **Problema/golul:** ZLEMA livrează quality dar zero feedback „semnalele confirmate pe acest simbol au avut edge?" — AntiFOMO și ZLHMA v1.7.0 au panou STATS; validarea pragurilor minQual pe ZLEMA e imposibilă fără export manual.
- **Soluția:** tracker price-touch pesimist pe confirmed BUY/SELL (SL = dist ZLEMA sau ATR×mult preset Swing), expectancy R + PF în dashboard, toggle OFF default, avertisment n<10.
- **Impact:** validare out-of-sample pe chart pentru motorul lent; răspunde la „merită minQual 70% pe Swing?".
- **Riscuri/dependențe:** R aproximativ fără comision/slippage; depinde de I-025 pentru semnale confirmate.
- **Fișiere atinse:** `pine-scripts\Zero_Lag_EMA_Dashboard_v1_4.pine` (grup STATS, secțiune tracking + dashboard).
