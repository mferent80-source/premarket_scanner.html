# Audit „probă statistică” și „probă în timp” — Trend 12 luni + Scorul zilei (14.10.2026, seara)

Cerut de Marius („da, poți face nr. 1”) după refacerea pachetelor de skill-uri: Trend 12 luni și Scorul zilei trecute prin pachetele
10 (probă statistică) și 11 (probă în timp). **Auditul a fost doar citire; reparațiile, cerute de el („REPARA TOATE”), sunt la sfârșit.** Script și rezultate:
`E:\Backup-Claude\premarket-suite\audit-candidate-engine-2026-10-14\audit_proba_1410.mjs` / `.txt`
(aceleași date ca `mom12_audit.mjs`: cache Yahoo 5 ani, 590 de acțiuni, 941 de zile, universul de azi ⇒ supraviețuitori).

Metode: statistical-significance-and-deflated-metrics, backtest-result-authenticity-audit, lookahead-bias-detection-methodology,
statistical-power, live-vs-backtest-drift-monitoring, paper-trading-and-forward-test-protocol.

## Pe scurt

| # | Severitate | Ce | Unde |
|---|---|---|---|
| 1 | 🔴 | „Probat față de alte acțiuni în aceeași zi” nu ține: pe ferestre independente t ≈ 1,5, nu p 0,000 | eticheta robotului, Candidate Engine, Radar (Sugestii, Piața azi) |
| 2 | 🟡 | Criteriul din bilanț e slab și puțin prea larg: după 1 an „probat” doar în 30 % din lumile cu avantaj real, dar în 9 % din cele fără | `bilant()` din `tools/trend-12-1-lib.mjs` |
| 3 | 🟡 | Lipsește alarma de abatere live (pragurile scrise înainte) | bilanțul + Discord |
| 4 | 🟡 | Jurnalul verdictelor din Radar numără cele 20 de nume ale unei zile ca 20 de dovezi independente; valorează cât ~6 | `crypto/public/lib/verdicte.js` (`fataDeZero`) |
| 5 | 🔵 | Scorul zilei nu poate fi judecat de jurnal în timp util: „puține” ~1,2 ani la 5 zile și ~5 ani la 20 de zile | `crypto` sursele `scor-zi-*` |
| 6 | ✅ | Privirea în viitor și alinierea datelor: curate (19 din 536.518 ferestre nealiniate, 0,004 %) | `mom12_audit.mjs` |

## 1 · 🔴 „Probat față de alte acțiuni” era o numărătoare greșită a dovezilor

Auditul de dimineață a raportat față de nulul B (alte acțiuni, aceleași zile) **+0,9 % pe 20 de zile, p 0,000, interval pe zile 0,7…1,1 %**.
Fiecare zi purta însă o fereastră de 20 de zile care se suprapune cu a celor 19 zile vecine ⇒ ~941 de „zile” erau de fapt ~48 de
observații independente (regula din 06.10 despre puține observații). Pe ferestre de 20 de zile **nesuprapuse**:

| Variantă | Ferestre | Diferența medie (top − univers) | Abaterea | Sharpe pe fereastră | t |
|---|---|---|---|---|---|
| P · 12-1 top 20 % (cea din robot) | 48 | +0,8 % | 3,5 % | 0,22 | 1,5 |
| R · P + regim | 38 | +0,8 % | 3,6 % | 0,22 | 1,4 |
| 6-1 top 20 % | 48 | +0,5 % | 3,4 % | 0,15 | 1,1 |
| 12-1 top 10 % | 48 | +1,5 % | 5,3 % | 0,29 | 2,0 |
| Oglinda (ultimele 20 %) | 48 | +0,3 % | 2,9 % | 0,09 | 0,6 |

- Fără corecție (o singură încercare): probabilitatea ca avantajul să fie real **90,5 %**.
- **Sharpe deflat** (Bailey & López de Prado), cu cele 7 variante încercate azi (cele 5 de mai sus + regimul cu 3 închideri + plafonul pe sector): **75,2 %**; cu 3 variante chiar diferite: 82,2 %. Pragul uzual e 95 %.
- Asimetrie −1,3, curtoză 6,1: câteva ferestre proaste trag mult (cozile grele scad și ele încrederea).

**Concluzie:** față de alte acțiuni în aceleași zile, Trend 12 luni e un **indiciu** (t ≈ 1,5), **nu „probat”**. Verdictul de ansamblu nu se
schimbă („NU TRECE”, din cauza nulului A și a listei de supraviețuitori), dar textele care spun „selecție probată față de acțiunile din
aceeași zi (+0,9 % pe 20 z, +3,4 % pe 60)” trebuie îndreptate: în eticheta robotului (`tools/trend-12-1.mjs`), în `candidate-engine/engine.js`
(`TREND_ETICHETA`) și în Radar (`sugestii-ecran.js`, `acasa-ecran.js`, `tura-trend.mjs`).

## 2 · 🟡 Criteriul din bilanț: slab după un an și puțin prea larg

Criteriul pre-înregistrat: după cel puțin 12 ferestre de 20 de zile, marginea de 5 % a diferenței față de univers > 0 ⇒ „probat”.
Simulat pe ferestrele reale (bootstrap, 4.000 de lumi):

| Lumea | „probat” după 12 ferestre | „picat” |
|---|---|---|
| avantajul din istorie (+0,8 % pe fereastră) | 29,5 % | 0,1 % |
| jumătate din el (+0,4 %) | 17,7 % | 0,5 % |
| fără avantaj (0) | **9,1 %** (ținta e 5 %) | 2,0 % |

- Pentru 80 % putere sunt necesare **~127 de ferestre (~10 ani)** cu avantajul din istorie și ~500 (~40 de ani) cu jumătate din el.
- Pagina spune „bilanțul … gol până la 12 ferestre (≈ 1 an)”. Cinstit ar fi: după un an, cel mai probabil tot „în probă”.
- Marginea de 5 % din bootstrap pe 12 ferestre e prea îngustă (9 % „probat” fals) ⇒ de trecut pe t cu 11 grade de libertate sau pe permutare.

## 3 · 🟡 Pragurile de abatere live, scrise ACUM, înainte de date

Alarmă („avantajul din istorie devine improbabil”) dacă media diferenței live (top − univers, pe ferestre nesuprapuse) scade sub:

| După | Prag (percentila 5) | Mediana așteptată |
|---|---|---|
| 3 ferestre (~3 luni) | −3,0 % | +1,1 % |
| 6 ferestre (~6 luni) | −1,8 % | +0,9 % |
| 9 ferestre (~9 luni) | −1,2 % | +0,8 % |
| 12 ferestre (~11 luni) | −0,9 % | +0,9 % |

Propunere: bilanțul de sâmbătă scrie starea „abatere” când pragul e atins, iar Discord anunță o singură dată.

## 4 · 🟡 Jurnalul verdictelor din Radar: 20 de nume ≠ 20 de dovezi

Pe 48 de zile nesuprapuse × 20 de nume, excesul pe 20 de zile față de SPY are **ICC 0,13** ⇒ efectul de design 1 + 19 × 0,13 = **3,5**:
cele 20 de nume ale unei zile valorează cât **~5,7 observații independente** (11 din 20 sunt Technology). `fataDeZero` din `verdicte.js`
întoarce semnul pe simbol, ca și cum simbolurile ar fi independente ⇒ intervalul și p-ul ies de ~1,9 ori prea strânse. Reparație: pentru
sursele cu un coș zilnic (`trend-12-1`, `top-sector`), unitatea testului e **ziua semnalului** (media coșului), nu simbolul.

## 5 · 🔵 Scorul zilei: jurnalul îl poate judeca abia peste ani

Verdictele sunt pe un singur simbol (SPY / BTC), deci jurnalul păstrează doar ferestrele nesuprapuse (corect, regula din v100.177):

| Orizont | Abaterea SPY | Verdicte nesuprapuse / an | „puține” până la | Diferența minimă vizibilă (80 % putere) după 1 / 3 / 5 ani |
|---|---|---|---|---|
| 5 zile | 2,2 % | 50 | ~1,2 ani | 1,8 % / 1,0 % / 0,8 % |
| 20 de zile | 4,1 % | 12 | ~5 ani | 6,6 % / 3,8 % / 3,0 % |

Scorul rămâne util ca **rezumat al faptelor de azi**, nu ca semnal. Cartela poate spune: „jurnalul îl poate judeca la 5 zile după ~1 an”.

## 6 · ✅ Ce e curat

- Privirea în viitor (cod): `m12 = C[t−21]/C[t−252]`, intrare la deschiderea zilei t+1, ieșire la închiderea t+20; regimul din ziua t.
- Alinierea: fereastra acțiunii și a SPY se termină în aceeași zi în 99,996 % din cazuri (19 excepții din 536.518).
- Costuri și lichiditate: 0,3 % dus-întors, doar acțiuni ≥ 5 $ și ≥ 10 mil. $/zi ⇒ umpleri plauzibile (OHLC zilnic, fără date de ordine — limită declarată).
- Nul A (aceleași acțiuni, alte zile) și lista de supraviețuitori rămân, ca dimineață, motivul principal pentru „NU TRECE”.

## Ordinea în care aș repara (după acordul lui)

1. Textele „probat față de alte acțiuni” ⇒ „indiciu (t ≈ 1,5 pe ferestre independente)” — robot, Candidate Engine, Radar.
2. Bilanțul: t / permutare în loc de marginea bootstrap pe 12 ferestre + nota cinstită „după 1 an, probabil tot în probă” + pragurile de abatere din §3.
3. Jurnalul verdictelor din Radar: unitatea = ziua semnalului pentru coșuri.
4. Cartela Scorului zilei: când poate fi judecat.

## Reparat (14.10.2026 seara, el: „REPARA TOATE”)

| # | Ce | Unde | Commit |
|---|---|---|---|
| 1 | „probat față de alte acțiuni” ⇒ „indiciu (t ≈ 1,5 pe ferestre independente)” | eticheta robotului, Candidate Engine (eticheta de rezervă + motivul din detalii), fișierul publicat de azi, Radar (Sugestii, tura colectorului) | `c9df34a9` tt-v887 · Radar `ac4dc1f` v100.195 |
| 2 | Bilanțul: ferestrele de 20 de zile **nesuprapuse** pe calendarul SPY + **t > 3,2** (≥ 12 ferestre) | `bilant()` + `ferestreNesuprapuse()` + `T_PRAG` în `tools/trend-12-1-lib.mjs` | `c9df34a9` |
| 3 | Abaterea live: pragurile din §3, scrise înainte (`pragAbatere`), în fișierul bilanțului, pe pagină și pe Discord (o singură dată) | lib + robotul bilanțului + Candidate Engine + Radar (Sugestii, cardul din „Piața azi”) | `c9df34a9` · `ac4dc1f` |
| 4 | Jurnalul verdictelor: coșurile (Trend 12 luni, topul pe sectoare, **și ideile zilei**, același defect) se judecă pe **zi**; cel puțin 12 zile independente | `crypto/public/lib/verdicte.js` (`cos`, `nesuprapuse`, unitatea `u`), `cont-ecran.js` | `ac4dc1f` |
| 5 | Cartela Scorului zilei: „la 5 zile abia după ~1 an, la 20 de zile după ~5 ani; până atunci e un rezumat, nu un semnal” | `crypto/public/lib/scor-zi.js` | `ac4dc1f` |

### Corecție la §2 (calibrarea de dinainte de cod)

Simularea din §2 folosise deja un t pe ferestre, nu criteriul real. Criteriul **real** de dinainte (marginea bootstrap pe blocuri de
20, pe 240 de zile consecutive) e mai slab decât scria §2: în lumea **fără** avantaj dădea **„probat” în 13,2 %** și **„picat” în 9,2 %**
(`calibrare_bilant_1410.txt` pe E:). Pragul nou e ales în lumea fără avantaj (seria reală cu media scoasă, asimetria și cozile păstrate),
cu privirile săptămânale de la 12 la 63 de ferestre (≈ 5 ani), înainte de orice rezultat live (`calibrare_secventa_1410`):

| Prag t | „probat” fals în 3 ani | în 5 ani | „probat” cu avantajul din istorie, în 3 ani | în 5 ani |
|---|---|---|---|---|
| 2,5 | 9,3 % | 11,3 % | 41,6 % | 54,9 % |
| 2,8 | 6,3 % | 7,7 % | 34,0 % | 46,2 % |
| 3,0 | 5,0 % | 6,0 % | 29,0 % | 40,2 % |
| **3,2 (ales)** | **3,5 %** | **4,3 %** | **24,5 %** | **34,3 %** |

Prețul e spus cinstit și în criteriile din fișier: după un an, cel mai probabil tot „în probă”.

### Probe

- premarket_scanner: 4 teste noi în `tools/trend-12-1-robot.test.mjs` (zgomotul fără avantaj rămâne „în probă”, ferestrele, pragurile,
  abaterea + mesajul); 101/101 pe testele care ating schimbarea. Cele 50 de teste `cloud-sync-*` pică și pe main fără aceste schimbări
  (`81e81574`, altă sesiune) — neatinse.
- Radar: `scripts/proba-v100195.mjs` 11/11 (un șoc comun pe zi: pe simbol p < 0,01, pe zi p mare), `npm test` întreg, proba de telefon 55/55.
