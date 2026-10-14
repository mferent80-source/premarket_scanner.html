# Audit sever — Candidate Engine, Trend 12 luni, robotul zilnic și drumul spre Decision Desk — 14.10.2026

**Verdict: NU „gata de bani reali” până la reparațiile de mai jos — și ele sunt făcute azi (tt-v875).** După reparații: sugestiile
scannerului pot fi folosite ca listă de lucru cu trei garanții noi (raportările în fereastra planului nu mai primesc plan, fără
cheia Finnhub nimic nu e „actionable”, modul Trend arată cine raportează), dar SEMNALUL vechi (Top Long / Early Reversal) rămâne
fără avantaj statistic (auditul din dimineața zilei) și Trend 12 luni rămâne în probă. Decizia de cumpărare e a ta; scannerul
îți dă acum o listă cinstită, nu un buton.

Scop (ales de tine): `candidate-engine/` (engine.js, index.html), `tools/trend-12-1*.mjs` + `.github/workflows/trend-12-1.yml`,
`lib/daily-series.js`, `lib/exchange-calendar.js`, `lib/indicators.js`, `lib/me-early-bird.js`, `lib/earnings.js`, `lib/data.js`,
`lib/governor.js`, `lib/decision-verdict.js`, `lib/candidate-plan-handoff.js`, `lib/trade-plans.js`, `lib/watchlist.js`,
`lib/desk-alerts.js`, `lib/decision-panel.js`, `desk/index.html` (drumul candidaților: load → decisionItems → plan → ticket).
Citite integral: toate de mai sus afară de `desk/index.html` și `lib/early-long.js` (citite pe funcțiile folosite: load, decisionFor,
renderSignals, buildPlan, ticketSizing, allowedRisk; sectorOf / enrichSectorsYahoo). Audit făcut direct, fără subagenți (regula ta
din 24.09); criticele au fost verificate adversarial pe date reale (calendarul Finnhub de azi, clasamentul de azi).

## Sumar
- 🔴 2 (amândouă reparate) · 🟡 7 (4 reparate, 3 rămân ca decizii ale tale) · 🔵 6.
- Niciun XSS, niciun „look-ahead” în indicatori, nicio bară neînchisă acceptată ca EOD, niciun secret în pagini. Indicatorii (EMA,
  RSI Wilder, ATR Wilder) sunt corecți și identici în cele trei implementări (indicators.js, me-early-bird.js, decision-verdict.js).

## 🔴 Critice (bani reali)

1. **Garda de earnings apăra doar ziua intrării, planul se ține săptămâni.** `engine.js earningsInfo()`: blocat doar la ≤ 1 zi;
   la 2–14 zile doar scădea 4–12 puncte și candidatul rămânea „actionable”. Planul Desk-ului (stop 1,25 ATR, țintă 2R, `lib/trade-plans.js`
   fără orizont) traversa raportarea cu un stop pe care un gap îl sare. Dovadă: pe calendarul Finnhub de azi, 10 din cele 40 de
   acțiuni din clasamentul Trend raportează în 14 zile (JBHT mâine). **Reparat:** raportare în fereastra de 14 zile ⇒ candidatul rămâne
   vizibil, dar `actionable=false`, stare WATCH, motivul spune „ar traversa raportarea”; ≤ 1 zi rămâne BLOCKED. Zilele se numără pe
   calendarul New York (`DailySeries.date`), nu pe ceasul local (la 23:30 ora României era deja „mâine”). Fără cheie (neverificat):
   la fel, fără plan — nu se cumpără pe o gardă oarbă. Teste: `tools/candidate-earnings-gate.test.mjs`.
2. **Modul Trend 12 luni nu știa nimic de raportări.** Clasamentul vine de la robot (fără cheie); pagina îl arăta fără niciun
   avertisment, deși se ține 20–60 de zile. **Reparat:** cu cheia Finnhub în browser, pagina pune calendarul peste clasament —
   starea RAPORTEAZĂ (roșu) + „raportează în Nz (după închidere / înainte de deschidere)”; fără cheie, rândul spune „earnings
   neverificat (fără cheia Finnhub)”. Test în `tools/candidate-trend.test.mjs`.

## 🟡 Abateri serioase

3. **`lib/earnings.js` arunca raportările fără estimări** (filtrul listei din hub): 198 din 1.039 raportări din următoarele 14 zile
   (19 %) erau invizibile gardei — acțiuni mici, dar universul scannerului coboară la 3 mil. $/zi. **Reparat:** opțiunea `toate:true`
   (garda o cere; hubul rămâne cum era; cache separat). Test: `tools/earnings-toate.test.mjs`.
4. **Governor citit și scris de 85 de ori pe scanare** (`GV.status()` în fiecare `analyze()`: parsează jurnalul, calculează, scrie
   `tt_governor_state_v1` în localStorage) la fiecare 5 minute. **Reparat:** o citire pe scanare, dată funcției `analyze`.
5. **Robotul rulat de mână în timpul sesiunii lua bara de azi neînchisă** drept ultima zi (prețul și „EOD azi” false; mom 12-1 nu,
   pentru că sare ultima lună). **Reparat:** `taieBaraPartiala` — sub 16:15 New York bara de azi se taie din toate seriile. Test în
   `tools/trend-12-1.test.mjs`. Rularea programată (22:40 UTC) nu era afectată.
6. **Scorul de momentum premiază volumul pe zi roșie** (`momentumScore`: `rvol ≥ 1,1` dă 7 puncte indiferent de direcția zilei;
   trader.md: factor adirecțional premiat greșit). **NEREPARAT, decizia ta:** scorul n-are avantaj oricum (audit 14.10), iar o
   schimbare de prag fără re-probare e tot o ipoteză. Dacă vrei, se probează pe scripturile de pe E: înainte de orice schimbare.
7. **Governor „TRADE” fără jurnal** (`lib/governor.js`: jurnal gol ⇒ niciun motiv de oprire ⇒ TRADE; `accountSize` 10.000 implicit
   când lipsește contul). Dă confort fals când nu ții jurnalul manual și nu ai contul T212 conectat. **NEREPARAT (Decision App,
   decizia ta):** propunere — fără jurnal și fără T212, verdictul să fie „NEVERIFICAT”, nu TRADE.
8. **Desk-ul golește lista la 30 de minute de la scanare** (`CANDIDATE_STALE_MS`, `desk-alerts scan-stale`): cu scannerul închis,
   Desk-ul rămâne gol și spune „Scanarea a expirat”. Decizie conștientă a Decision App (rescanarea la 5 min ține lista vie cât
   e pagina deschisă). Semnalat, nu schimbat.
9. **Cele 4 `?v=` ale modulelor Radar din alerts se bat de mână la fiecare versiune** (I-603, azi a treia oară). Rămâne în backlog.

## 🔵 Sugestii

10. Coloana SCOR din modul Trend = 100 − rang (80–100 pentru top 20 %) arată ca scorul celorlalte moduri, deși înseamnă altceva;
    RANG (top x %) spune deja același lucru. De scos sau de etichetat.
11. `earningsInfo` dă mereu „earnings EU neverificat” (−5) pentru Europa — Finnhub acoperă doar SUA; EU nu primește plan nici înainte,
    nici acum (conform cu reparația 1).
12. Pagina scannerului încarcă `holdings-forecast*.js` (3 fișiere) pe care `engine.js` nu le cheamă; le folosește `TTEntryAuto`
    (captarea dovezilor). Nu e cod mort, dar încărcarea se face și când Desk-ul lipsește.
13. Universul `US_CORE` = 67 de nume alese de mână (câștigătorii de azi) — I-610 în backlog.
14. `lib/data.js`: răspunsul Yahoo din cache (30 min) de dinaintea închiderii devine „DATE STALE” după 16:15 New York până expiră
    cache-ul; simbolul e exclus cinstit („Surse excluse”), nu acceptat vechi. Corect, doar de știut: scanarea „bună” e după ~16:45 NY.
15. Cheia Finnhub și cheia Anthropic stau în `localStorage` pe dispozitiv — decizie documentată (device-local), nu bug.

## Consistență între unelte
- EMA (seed SMA, k = 2/(n+1)), RSI (Wilder, cu `d>0` / `d>=0` echivalente) și RVOL (volum azi / media celor 20 de zile DINAINTE)
  sunt identice în engine, Early Bird și verdict. ATR există într-un singur loc.
- `ce_results_v2` are un singur scriitor (scanner) și trei cititori (Desk, `desk-alerts`, `trade-evidence-auto`); Trend NU intră în el
  (Desk-ul nu-l vede) — intenționat, până trece proba.
- `CandidatePlanHandoff.read` acceptă doar `momentum` / `reversal`, `actionable===true`, ≤ 30 min, sesiune EOD actuală, niveluri
  valide ⇒ reparația 1 se propagă singură: ce nu e actionable nu primește plan nicăieri.

## Ce rămâne la tine
- 6 (scorul cu volum pe zi roșie), 7 (Governor fără jurnal), 10 (coloana SCOR la Trend), I-603, I-610 — spune-mi care.
- Cheia Finnhub pe fiecare browser (linkul din chat): fără ea, de azi, nimic nu mai e „actionable” — ăsta e comportamentul dorit.

## Versionare
tt-v875-2026-10-14 · `engine.js?v=26.10.14.1130` · teste noi: `candidate-earnings-gate` (4), `earnings-toate` (2), `candidate-trend`
(+1), `trend-12-1` (+1).
