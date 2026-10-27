# Registrul cercetării — ce s-a încercat, inclusiv ce a picat

**Pornit 20.10.2026 (I-728).** Fiecare ipoteză, variantă și probă încercată pe suita de trading, cu perioada, amprenta datelor, rezultatul și de ce
s-a oprit — ca numărul de încercări să fie la vedere când se judecă un „avantaj” (corecția pentru încercări multiple pornește de la acest număr;
`statistical-significance-and-deflated-metrics`). Regula: **intrarea se scrie când se face încercarea, nu după**; încercările picate rămân.
Rezultatele mari stau în rapoartele de pe `E:\Backup-Claude\premarket-suite\...` (pe PC); aici e indexul lor.

Convenții: **n** = perioade sau zile independente (nu monede × zile); **B** = nulul de bază (alte acțiuni, aceleași zile); **Holm** = corecție pe
familia de teste; **mărimea testului** = rata de fals pozitiv măsurată sub H0 înainte de a citi rezultatul.

## 1. Scannerul Premarket (Long & Reversal) — motorul original

| # | Data | Ipoteza / varianta | Date | Rezultat | Stare | Sursa |
|---|---|---|---|---|---|---|
| 1 | 2026-10-14 | Top Long (scorul `momentumScore` al motorului) are avantaj la 5 / 10 / 20 sesiuni față de B | 591 acțiuni × 5 ani, nulul B (alte acțiuni aceleași zile), bootstrap pe blocuri, mulberry32 | fără avantaj ⇒ „NU se cumpără pe el” | picată | `E:\Backup-Claude\premarket-suite\audit-candidate-engine-2026-10-14\RAPORT.md` |
| 2 | 2026-10-14 | Early Reversal (scorul `rScore` + MEB) are avantaj | idem | fără avantaj | picată | idem |
| 3 | 2026-10-14 | Trend 12 luni (12-1) are avantaj | idem | neconcludent ⇒ proba în timp | în probă | `docs/premarket-proba-protocol.md` (Trend) |
| 4–9 | 2026-10-19 | H1 Top Long cu motorul de azi (amprenta `pm-cb956aef5680`) | 942 zile 2022-10…2026-07, top 200 din 600, cost 0,2 %, Holm pe 6 | −0,4 % față de B | picată | `E:\Backup-Claude\premarket-suite\audit-long-reversal-2026-10-19\RAPORT.md` |
| | 2026-10-19 | H2 ieșirile: stop de timp 20 z / chandelier 3 ATR față de planul 1,25 ATR / 2R | idem; mărimea testului verificată: 11–16 % fals la 5 % ⇒ prag p ≤ 0,01 | +0,4 / +0,3 R față de plan, dar = SPY +1,5 % / 20 z; planul: R mediu 0,0, 58 % stop, cozi −27 R; DSR 0,61 | trece statistic, fără valoare peste piață ⇒ **neaplicată** (ar reporni proba) | idem |
| | 2026-10-19 | H3 momentum rezidual 12-1 față de brut | idem | mai prost decât brut | picată | idem |
| | 2026-10-19 | H4 RSI(2) < 10 peste SMA200 | idem | fără avantaj | picată | idem |
| | 2026-10-19 | H5 proxy PEAD (gap ≥ 4 %, volum ≥ 2×) | idem | fără avantaj | picată | idem |
| | 2026-10-19 | H6 filtrul de regim SPY > SMA200 | idem | ar fi costat | picată | idem |
| 10 | 2026-10-19 | Stopul Reversal „în umbră” (stopul în bază, nu la 1,25 ATR) | protocol scris înainte; testul semnelor ar da 10–12 % fals ⇒ t unilateral prag 3,0; putere 11–27 % | jurnal separat, verdict la 24–48 de perioade | în probă | `docs/reversal-stop-umbra-protocol.md`, `lib/reversal-umbra.mjs` |

**Total încercări pe scanner: ≈ 31** (cele de mai sus + variantele de parametri din rapoartele 14.10 și 19.10). Orice „avantaj” viitor pe scanner
se corectează pentru ≥ 31 încercări.

> **27.10.2026 (I-745, auditul F):** registrul număra doar scannerul (≈ 31). Familiile de mai jos (§ 1b–1f) erau încercate, dar nescrise aici;
> le adun din protocoalele și rapoartele lor, cu trimiteri. **Corecțiile se fac pe familii separate** (o încercare din Portofoliu nu umflă
> pragul Clasificatorului), dar numărul total e la vedere: **≈ 101 încercări pe toată aplicația** (tabelul din § 1g).

## 1b. Clasificatorul Long / Hold / Short (`docs/clasificator-protocol.md`, „Registrul încercărilor”)

| # | Data | Încercarea | Variante | Rezultat | Stare | Sursa |
|---|---|---|---|---|---|---|
| 11 | 2026-10-16 | Clasificatorul pe fiecare acțiune: Boosting, Random Forest, SVM, vot; walk-forward pe 3 ferestre | 4 modele, Holm pe 4 | fără avantaj confirmat | picată | protocolul, rândul 1 |
| 12 | 2026-10-16 | Ablația indicatorilor noi | 5 variante (18, cei 10 vechi, fără MACD, fără SMA, fără suport / rezistență) | niciun câștig | picată | `docs/clasificator-ablatie-2026-10-16.md` |
| 13 | 2026-10-16 | Contextul pieței (SPY) ca indicatori în plus | 1 | niciun câștig | picată | `docs/clasificator-context-2026-10-16.md` |
| 14 | 2026-10-16 | Modelul comun pe 150 de acțiuni, dovada pe zile | 1 | 0 / 3 ferestre, p 0,34 | picată | protocolul, rândul 4 |
| 15 | 2026-10-16 | Motorul v2 → v5 (bani, calibrare, cost după lichiditate) | 4 versiuni | v5 în probă | în probă (v5) | `docs/clasificator-versiuni.md` |
| 16 | 2026-10-17 | Puterea pe partea de test (52, apoi 512 acțiuni) | 2 | votul mai slab decât frecvențele (−0,015 / −0,022); doar varianța folosită | descriptiv | `docs/clasificator-putere-2026-10.md` |
| 17 | 2026-10-17 | Testul pe zile suprapuse (Newey-West h și 2h, Hansen-Hodrick, medii pe 6–12 perioade cu / fără pauze), simulare sub H0 | ≥ 6 | doar mediile pe perioade cu pauze țin 5 % ⇒ ales 8 perioade, pauze h − 1 | ales înaintea datelor (mărimea, nu avantajul) | protocolul, rândul 9; testul SIZE din `tools/clasificator-jurnal.test.mjs` (27.10) |
| 18 | 2026-10-16 | **Proba înainte** — 2 ținte (5 / 20 sesiuni) + 2 clasamente + 4 felii pe regim | 8 teste, în 3 subfamilii | în probă (2 zile verificate din 180 la 27.10) | în probă | protocolul |

**Total Clasificator: ≈ 31** (4 + 5 + 1 + 1 + 4 + 2 + 6 + 8). Pe istoric, H0 a câștigat de fiecare dată. **Familia probei înainte e mai mare
decât corecția** (auditul F): Holm pe cele 2 ținte și separat pe cele 2 clasamente, dar feliile pe regim (4 teste) sunt corectate doar între
ele, nu față de ținte. Protocolul nu se mai poate schimba (are rezultate din 23.10.2026), deci regula de citire se scrie aici, fără să mute
vreun verdict: **un „ține” doar pe o felie de regim e exploratoriu** — se citește ca indiciu pentru o probă nouă, nu ca verdict. La o probă
nouă: Holm pe toate cele 8 sau feliile declarate exploratorii dinainte. Grilele interne ale modelelor (SVM: 3 × 5, pădurea: 3 adâncimi) se
aleg pe validare în fiecare fereastră și se judecă pe test — nu se adună la familie.

## 1c. Trend 12 luni (`docs/trend-12-1-protocol.md`, `docs/AUDIT-PROBA-TREND-SCOR-2026-10-14.md`)

| # | Data | Încercarea | Variante | Rezultat | Stare | Sursa |
|---|---|---|---|---|---|---|
| 19 | 2026-10-14 | Momentum 12-1 pe universul de azi, 5 ani, față de alte acțiuni aceleași zile (nulul B) | 7 variante (`trend-12-1-lib.mjs`: Sharpe deflat 75 % cu 7 variante) | +0,8 % / 20 z, t ≈ 1,5 pe 48 de ferestre nesuprapuse ⇒ indiciu, nu probat | în probă | raportul din 14.10 |
| 20 | 2026-10-14 | Criteriul bilanțului: marginea bootstrap (13,2 % „probat” fals) ⇒ t pe ferestre, praguri 2,5 / 2,8 / 3,0 / 3,2 | 4 praguri, alese **sub H0** | 3,2: 4,3 % fals în 5 ani de priviri | ales înaintea datelor (mărimea, nu avantajul) | idem, „Corecție la § 2” |
| 21 | 2026-10-13 | **Proba înainte** (12 ferestre, t > 3,2, priviri repetate) | 1 | 0 ferestre la 27.10; primul verdict posibil ~28.09.2027 | în probă; din 27.10 (revizia F, 🔴3) prețurile pe tot istoricul și zilele închise înghețate (`trend-12-1-inghetat.jsonl`) — aceeași judecată, fără fereastra alunecătoare | `docs/trend-12-1-protocol.md` |

**Total Trend: ≈ 8** (7 + 1; pragurile alese sub H0 nu se numără ca încercări de avantaj).

## 1d. Verdictul pieței (`docs/verdict-piata-protocol.md`)

| # | Data | Încercarea | Variante | Rezultat | Stare | Sursa |
|---|---|---|---|---|---|---|
| 22 | 2026-10-17 | Scala din 6 indicatori (trend, participare, VIX, dobânzi / credit, regim macro, sectoare) | 1 regulă, scrisă înainte, fără backtest | — | regulă de prudență (×0,75), în probă | protocolul |
| 23 | 2026-10-17 | Ipoteza I-679: structura VIX (9 zile peste 3 luni) ⇒ cel mult −1 | 1 | — | ipoteză în regulă, neprobată separat | idem |
| 24 | 2026-10-17 | Ipoteza I-680: creditul HYG / IEF > 1 % sub media de 50 ⇒ cel mult −1 | 1 | — | ipoteză în regulă, neprobată separat | idem |
| 25 | 2026-10-17 | Revizia (rotunjirea simetrică, HYG / IEF pe zile comune) | 2 schimbări | — | regula v2.1; 16.10 rămâne sub regula veche (27.10) | idem, „Schimbări” |
| 26 | 2026-10-17 | **Proba înainte** (căderea maximă SPY pe 5 sesiuni, Welch, ≥ 20 / grup) | 1 | 0 „redus” / 1 „normal” separate la 27.10 (după excluderea lui 16.10) | în probă; din 27.10 judecată o singură dată | idem |
| 27 | 2026-10-27 | Revizia F (🔴4): testul probei — Welch ⇒ **permutare pe episoade de etichetă, statistica studentizată** | 3 teste comparate **sub H0** (Welch, permutare cu diferența mediilor, permutare studentizată) pe 12 lumi (i.i.d. / GARCH × persistență × pondere), 4000 de lumi fiecare | aleasă: ≤ 4,0 % fals cu GARCH (Welch până la 7,6 %, diferența simplă până la 6,8 %) | aleasă după mărime, înaintea primei zile „redus” măsurate (23.10 se închide pe 30.10) — nu e o încercare de avantaj | protocolul, § „Revizia independentă” |
| 28 | 2026-10-27 | Revizia F (🟡8): regula verdictului cu amprentă din conținut (`rv-…`), 4 amprente din istoric recunoscute ca v2.1 cu motivul | — | — | regulă de notare, nu încercare | protocolul, § „Amprentele regulii v2.1” |

**Total Verdict: ≈ 6** (rândurile 27–28 sunt alegeri sub H0 / reguli de notare, nu încercări de avantaj). Filtrul din Planuri (A / B / fără filtru, § 3) e o alegere a lui Marius, nu o căutare pe date.

## 1e. Laboratoarele din Portofoliu (`lib/holdings-*.js`; toate `reviewOnly`, nu dimensionează poziții)

| # | Data | Încercarea | Variante | Rezultat | Stare | Sursa |
|---|---|---|---|---|---|---|
| 27 | 2026-10 | Modelele de laborator: Neural, Gradient Boosting, KNN, HMM, GARCH, Quantile, Isolation Forest (fiecare cu testul lui recent / walk-forward) | 7 modele | „experimental” / „fără avantaj” pe poziție; niciunul nu decide bani | laborator | `lib/holdings-neural.js` … `lib/holdings-isolation.js` |
| 28 | 2026-10 | Calibrarea estimărilor combinate (Forecast) | 3 ponderi × 4 temperaturi = 12 | alese pe test cu marja de log loss / Brier | laborator | `lib/holdings-calibration.js` (`CONFIG.weights`, `CONFIG.temperatures`) |

**Total Portofoliu: ≈ 19** (7 + 12).

## 1f. Reguli V1 și probele Top Long / umbră (§ 2)

| # | Data | Încercarea | Variante | Stare |
|---|---|---|---|---|
| 29 | 2026-10-18 | Reguli V1 — cele 8 verificări (fără backtest), proba înainte | 1 regulă × 2 orizonturi | v1 închisă fără verdict; v2 în probă |
| 30 | 2026-10-18 | Top Long — proba înainte | 1 × 2 orizonturi | v1 închisă fără verdict; v2 în probă |
| 31 | 2026-10-19 | Stopul Reversal în umbră (rândul 10 de sus) | 1 | în probă |
| 32 | 2026-10-27 | Revizia F (🟡6): calibrarea abaterii pe perioadă cu motoarele ADEVĂRATE pe Core85, 998 de zile (01.11.2022 – 23.10.2026) | măsurătoare: doar abaterea și autocorelarea; media diferențelor NU s-a citit | Top Long 2,27 % / 4,89 %, V1 2,40 % / 4,86 % (5 / 20 de sesiuni); ρ₁ ≈ 0 |
| 33 | 2026-10-27 | Revizia F, decizia (a) (ipoteză declarată, a lui de confirmat): principal 5 sesiuni la N = 30, 20 de sesiuni doar monitorizare | aceeași ipoteză, alt orizont principal ales ÎNAINTE de orice zi v2 — cele 2 orizonturi erau deja numărate | în probă din prima zi v2; primul verdict ~17.06.2027 |

**Total: ≈ 6** (2 + 2 + 1, plus repornirea v2 a celor două, care NU e o încercare nouă de avantaj — aceeași ipoteză, altă judecată; la fel
rândurile 32–33 din revizia F: o măsurătoare a abaterii și alegerea orizontului principal înaintea datelor).

## 1g. Totalul pe familii

| Familia | Încercări | Corecția pentru un „avantaj” viitor |
|---|---|---|
| Scannerul (§ 1) | ≈ 31 | ≥ 31 |
| Clasificatorul (§ 1b) | ≈ 31 | ≥ 31; proba înainte: Holm pe ținte și pe clasamente, feliile exploratorii |
| Trend 12 luni (§ 1c) | ≈ 8 | Sharpe deflat cu 7; pragul t > 3,2 pentru privirile repetate |
| Verdictul pieței (§ 1d) | ≈ 6 | proba e una (din 27.10 permutare pe episoade de etichetă, eșantion fix) |
| Portofoliu (§ 1e) | ≈ 19 | laborator — niciun avantaj nu se folosește la bani fără o probă înainte |
| Reguli V1 / Top Long / umbră (§ 1f) | ≈ 6 | fiecare probă cu testul ei; din 27.10 doar orizontul de 5 sesiuni are verdict (20 = monitorizare), deci nicio corecție între orizonturi |
| **Total** | **≈ 101** | |

## 2. Probele în timp (pre-înregistrate)

| Proba | Protocol | Început | Pragurile scrise înainte | Mărimea testului | Stare |
|---|---|---|---|---|---|
| Top Long (Premarket) | `docs/premarket-proba-protocol.md` · amprenta `pm-cb956aef5680` (orice schimbare a funcțiilor înghețate repornește proba) | 2026-10-16 | testul semnelor pe perioade care nu se suprapun; 8 perioade | simulată | **închisă 27.10.2026 fără verdict** (2 zile, 0 / 8 și 1 / 8) ⇒ repornită ca v2 (rândul de mai jos); zilele rămân în jurnal sub amprenta veche |
| Top Long v2 (`premarket-proba-2`) | idem, § „Revizia independentă din 27.10.2026” · amprenta `pm-20f73dff32f3` (motor + ajutoarele + indicatorii și harta de sectoare apelate + înregistrarea + evaluator; tabelul „Amprentele v2”) | 2026-10-28 (prima zi v2) | judecată UNICĂ la **30 de perioade de 5 sesiuni** (principal, decizia (a)); 20 de sesiuni doar monitorizare; perioadele și judecata înghețate (`premarket-inghetat.jsonl`); „cu rezerve” la ρ̂ ≥ 0,2 (nu ridică plafonul) | 4,9 % fals (exact 4,94 %); ρ = 0,2 ⇒ 7,7 %; putere la +1 %/perioadă **59,3 %** cu abaterea măsurată 2,27 % (35,5 % la abaterea pesimistă 3,4 %) | în probă; primul verdict ~17.06.2027 |
| Trend 12 luni | `docs/trend-12-1-protocol.md` (scris la un loc pe 27.10; până atunci regulile erau doar în cod și în auditul din 14.10) · judecătorul `jt-7098991f68d3` (revizia F: tot istoricul, zilele închise înghețate) | 2026-10-13 | ≥ 12 ferestre de 20 z nesuprapuse, t > 3,2 cu priviri repetate; din 27.10 delistatele la ultima închidere | în depozit (27.10): 1,5 % fals în 5 ani (gaussian), 5,7 % cu asimetria ferestrelor reale (14.10, pe ferestrele reale: 4,3 %); putere la +1 %/fereastră 4,1 % / 17,2 % / 30,0 % la 1 / 3 / 5 ani | în probă (0 ferestre); primul verdict posibil ~28.09.2027 |
| Reguli V1 (Piață) | `docs/v1-proba-protocol.md` · univers înghețat de 85 | 2026-10-16 | SUS (6–8 verificări) față de JOS (≤ 5), testul semnelor; verdict la 5 sesiuni după ~8 săptămâni | 1,45 % (2000 lumi), putere 85 % la +0,4 %/sesiune | **închisă 27.10.2026 fără verdict** (2 zile, versiunea `experimental-1.0.0`) ⇒ repornită ca v2; zilele rămân sub versiunea veche |
| Reguli V1 v2 (`v1-proba-2`) | idem, § „Revizia independentă din 27.10.2026” · amprenta `v1-bec732f9281a` (regulile V1 + evaluatorul cu înregistrarea; tabelul „Amprentele v2”) | 2026-10-28 (prima zi v2) | judecată UNICĂ la **30 de perioade de 5 sesiuni** (principal, decizia (a)); 20 de sesiuni doar monitorizare; prețuri pe toată proba; perioadele și judecata înghețate (`v1-inghetat.jsonl`) | 4,9 % fals (exact 4,94 %); ρ = 0,2 ⇒ 7,7 %; putere la +1 %/perioadă **54,9 %** cu abaterea măsurată 2,40 % (cea veche, „85 % la +0,4 %/sesiune”, plantase ≈ +2 %/perioadă) | în probă; primul verdict ~17.06.2027 |
| Verdictul pieței | `docs/verdict-piata-protocol.md` · regula `v2.1` pe fiecare linie, din 27.10 cu amprentă din conținut (`rv-3e18543febee`); judecătorul `jv-ef4eca49d1b8` | 2026-10-17 | căderea maximă SPY în 5 sesiuni după „redus” față de „normal”, zile separate, Welch unilateral, ≥ 20 / grup; din 27.10 **o singură judecată** (rejudecarea nocturnă dădea 8,6–14,4 % fals) și doar liniile regulii v2.1 (16.10 iese) | din 27.10 **permutare pe episoade de etichetă** (studentizată): ≤ 4,0 % fals cu GARCH (Welch: până la 7,6 %); putere 13,6 % la +0,5 pp, 33,5 % la +1 pp | în probă (0 „redus” măsurate: 23.10 se închide pe 30.10); primul verdict ~2028 |
| Clasificatorul long / hold / short | `docs/clasificator-protocol.md` · judecătorul `jc-3ed212502e15` (`docs/clasificator-versiuni.md`) | 2026-10-16 | câștig ≥ 0,02 față de ambele repere, t pe 8 perioade cu pauze, Holm; eșantion fix 180 / 252 zile | 4,8–5,4 % (protocol); din 27.10 reprodusă în `tools/clasificator-jurnal.test.mjs` | în probă (2 / 180 la 27.10); feliile pe regim exploratorii (§ 1b) |
| Stopul Reversal în umbră | `docs/reversal-stop-umbra-protocol.md` · judecătorul `ju-0916cb874187` (27.10, umbra nu repornește) | 2026-10-19 | t unilateral prag 3,0 | 10–12 % fals la testul semnelor ⇒ înlocuit | în probă |
| Bilanț săptămânal Top Long (Discord) | anexa de monitorizare (I-717) | 2026-10-19 | alarmă −1,645 × 3,4 % / √k; 11,7 % alarme false până la 8 perioade ⇒ „de revăzut” | — | monitorizare, nu verdict |

## 3. Reguli de prudență neprobate (nu avantaj)

| Regula | Decizia | Data | Ce ar schimba statutul |
|---|---|---|---|
| Filtrul de piață (verdict ×1 / ×0,75 / defensiv fără plan nou / neverificat ×0,75) | aleasă de Marius dintre A / B / fără filtru | 2026-10-18; în Planuri 2026-10-20 | o probă în timp a draft-urilor și a planurilor pe verdict, cu pragurile scrise înainte |
| Căldura 4 %, corelație 0,7 / max 2 | prag prudent | 2026-10-19 | compararea cu dd95 pe blocuri după 30 de tranzacții |
| Stop −5 % sau 2 × ATR(14) între 3 % și 8 % | regula lui | 2026-10-17 | „Ce-ar fi fost dacă” din Raport, pe tranzacțiile de după |
| Regula 1,25 ATR / 2R pe Top Long | măsurată pe 4 ani: ~58 % stop, R mediu ≈ 0 | 2026-10-19 | limită de risc, nu promisiune (I-714) |

## 4. Cum se adaugă o încercare

1. Rândul se scrie **înainte** de a citi rezultatul: ipoteza, datele (perioada, universul, amprenta), nulul, pragul.
2. După rezultat: cifra, starea (`picată` / `trece` / `în probă` / `neaplicată`), **de ce s-a oprit** și sursa raportului.
3. Variantele de parametri ale aceleiași idei se numără separat în coloana „Total încercări”, chiar dacă stau pe un singur rând.
4. Probele în timp trimit la acest fișier din protocolul lor; verdictul unei probe nu se dă fără rândul de aici.
