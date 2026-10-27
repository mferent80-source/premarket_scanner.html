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

## 2. Probele în timp (pre-înregistrate)

| Proba | Protocol | Început | Pragurile scrise înainte | Mărimea testului | Stare |
|---|---|---|---|---|---|
| Top Long (Premarket) | `docs/premarket-proba-protocol.md` · amprenta `pm-cb956aef5680` (orice schimbare a funcțiilor înghețate repornește proba) | 2026-10-16 | testul semnelor pe perioade care nu se suprapun; 8 perioade | simulată | **închisă 27.10.2026 fără verdict** (2 zile, 0 / 8 și 1 / 8) ⇒ repornită ca v2 (rândul de mai jos); zilele rămân în jurnal sub amprenta veche |
| Top Long v2 (`premarket-proba-2`) | idem, § „Protocolul v2” · amprenta `pm-f9f254159993` (motor + ajutoarele din `analyze` + evaluator) | 2026-10-28 (prima zi v2) | judecată UNICĂ la 16 perioade (5 sesiuni) / 60 (20); testul semnelor; „cu rezerve” la persistență ≥ 0,2 | simulată înainte: 3,4–3,5 % fals; persistența ρ = 0,2 ⇒ 6,3–7,0 %; putere la +1 %/perioadă 52,6 % / 54,6 % | în probă; primul verdict ~02–05.2027 (5) / ~2031 (20) |
| Trend 12 luni | idem (Trend) | 2026-10 | idem | simulată | în probă |
| Reguli V1 (Piață) | `docs/v1-proba-protocol.md` · univers înghețat de 85 | 2026-10-16 | SUS (6–8 verificări) față de JOS (≤ 5), testul semnelor; verdict la 5 sesiuni după ~8 săptămâni | 1,45 % (2000 lumi), putere 85 % la +0,4 %/sesiune | **închisă 27.10.2026 fără verdict** (2 zile, versiunea `experimental-1.0.0`) ⇒ repornită ca v2; zilele rămân sub versiunea veche |
| Reguli V1 v2 (`v1-proba-2`) | idem, § „Protocolul v2” · amprenta `v1-2a71899d9bf5` (regulile V1 + evaluatorul, nu un șir) | 2026-10-28 (prima zi v2) | judecată UNICĂ la 16 / 60 perioade; restul ca v1 | 3,7–4,8 % fals; ρ = 0,2 ⇒ 6,3–7,0 %; putere la +1 %/perioadă 66,8 % / 66,4 % (cea veche, „85 % la +0,4 %/sesiune”, plantase ≈ +2 %/perioadă) | în probă; primul verdict ~02–05.2027 (5) / ~2031 (20) |
| Verdictul pieței | `docs/verdict-piata-protocol.md` | 2026-10-17 | treapta verdictului față de SPY la 5 / 20 sesiuni | — | în probă |
| Clasificatorul long / hold / short | `docs/clasificator-protocol.md` | 2026-10-16 | primul vot 23.10 | — | în probă |
| Stopul Reversal în umbră | `docs/reversal-stop-umbra-protocol.md` | 2026-10-19 | t unilateral prag 3,0 | 10–12 % fals la testul semnelor ⇒ înlocuit | în probă |
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
