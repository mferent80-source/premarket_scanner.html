# Clasificator — aduc ceva indicatorii noi? (I-640, 2026-10-16)

Universul scannerului: 67 simboluri, 40 calculate, 27 picate. Votul celor trei algoritmi, eroarea (log loss) pe orizonturi separate, adunată pe cele 3 ferestre. Mai mic = mai bun.

**Încercări: 5 variante** (toate sunt raportate, inclusiv cele care ies mai rău). Simbolurile au aceleași zile, deci NU sunt 40 dovezi independente: tabelul descrie, nu dovedește.

| Variantă | Față de 18: mediana diferenței | mai bun / mai rău (simboluri) | Față de frecvențe: mediana | bat frecvențele cu 0,02 | „experimental” | Long în bani: medie pe simbol (simboluri, zile) |
|---|---|---|---|---|---|---|
| Toți cei 18 | — | — | +0,0131 | 6 din 40 | 0 | +1,6% (13, 44) |
| Doar cei 10 vechi | -0,0022 | 24 / 16 | +0,0108 | 7 din 40 | 0 | -0,4% (11, 43) |
| Fără MACD | -0,0012 | 22 / 18 | +0,0141 | 5 din 40 | 0 | -1,1% (15, 39) |
| Fără SMA20 / SMA50 | +0,0006 | 15 / 25 | +0,0157 | 4 din 40 | 0 | +0,1% (16, 48) |
| Fără suport / rezistență | -0,0025 | 23 / 17 | +0,0137 | 4 din 40 | 0 | +0,0% (12, 33) |

**Picate (27) — Salt zilnic peste 25%: verifică ajustările și evenimentele înainte de antrenare.** INTC, PLTR, PANW, SNOW, META, NFLX, COIN, SOFI, APLD, CIFR, MARA, RIOT, DG, RIVN, LCID, ROKU, ENPH, SEDG, SMCI, MRVL, PATH, U, DKNG, CHWY, JD, BABA, PDD

## Concluzie (16.10.2026)

- Cei 8 indicatori noi (MACD, SMA20/50, suport/rezistență) **nu aduc un câștig vizibil**: fără ei eroarea e la fel (diferențe sub 0,003, în ambele sensuri, la aproape jumătate din acțiuni fiecare).
- **Nicio variantă nu bate frecvențele claselor** pe mediana acțiunilor și niciuna nu ajunge „experimental”.
- Banii din ultima coloană stau pe 11–16 acțiuni și 33–48 de zile: prea puțin ca să însemne ceva.
- Indicatorii rămân (au fost ceruți); judecata finală o dă registrul estimărilor (I-637), pe zile care nu existau la antrenare.
- 27 din 67 de acțiuni sunt refuzate de garda moștenită „salt zilnic peste 25%” (rezultate trimestriale, știri): clasificatorul nu le vede deloc.
