# Clasificator — aduc ceva indicatorii noi? (I-640, 2026-10-16)

Universul scannerului: 67 simboluri, 53 calculate, 14 picate. Votul celor trei algoritmi, eroarea (log loss) pe orizonturi separate, adunată pe cele 3 ferestre. Mai mic = mai bun.

**Încercări: 2 variante** (toate sunt raportate, inclusiv cele care ies mai rău). Simbolurile au aceleași zile, deci NU sunt 53 dovezi independente: tabelul descrie, nu dovedește.

| Variantă | Față de 18: mediana diferenței | mai bun / mai rău (simboluri) | Față de frecvențe: mediana | bat frecvențele cu 0,02 | „experimental” | Long în bani: medie pe simbol (simboluri, zile) |
|---|---|---|---|---|---|---|
| Toți cei 18 | — | — | +0,0152 | 8 din 53 | 0 | +1,4% (16, 62) |
| Cu contextul pieței (SPY) | -0,0022 | 30 / 23 | +0,0182 | 6 din 53 | 0 | -0,3% (12, 40) |

**Picate (1) — Ultimul salt peste 25% (2026-08-04, +29,5%) lasă doar 52 sesiuni după el; modele** PLTR
**Picate (1) — Ultimul salt peste 25% (2026-05-28, +36,5%) lasă doar 98 sesiuni după el; modele** SNOW
**Picate (1) — Ultimul salt peste 25% (2024-11-06, +31,1%) lasă doar 486 sesiuni după el; model** COIN
**Picate (1) — Ultimul salt peste 25% (2026-02-06, +25,5%) lasă doar 174 sesiuni după el; model** APLD
**Picate (1) — Ultimul salt peste 25% (2026-07-30, +28,1%) lasă doar 55 sesiuni după el; modele** CIFR
**Picate (1) — Ultimul salt peste 25% (2024-11-11, +29,9%) lasă doar 483 sesiuni după el; model** MARA
**Picate (1) — Ultimul salt peste 25% (2024-11-06, +26,2%) lasă doar 486 sesiuni după el; model** RIOT
**Picate (1) — Ultimul salt peste 25% (2026-02-13, +26,6%) lasă doar 169 sesiuni după el; model** RIVN
**Picate (1) — Ultimul salt peste 25% (2026-07-15, +28,8%) lasă doar 66 sesiuni după el; modele** LCID
**Picate (1) — Ultimul salt peste 25% (2026-02-04, +38,6%) lasă doar 176 sesiuni după el; model** ENPH
**Picate (1) — Ultimul salt peste 25% (2026-08-05, -30,5%) lasă doar 51 sesiuni după el; modele** SEDG
**Picate (1) — Ultimul salt peste 25% (2026-06-10, -28,0%) lasă doar 89 sesiuni după el; modele** SMCI
**Picate (1) — Ultimul salt peste 25% (2026-06-02, +32,5%) lasă doar 95 sesiuni după el; modele** MRVL
**Picate (1) — Ultimul salt peste 25% (2026-02-11, -26,3%) lasă doar 171 sesiuni după el; model** U

## Concluzie I-651 (16.10.2026)

Regula scrisă înaintea probei: contextul SPY rămâne doar dacă mediana scade loss-ul cu ≥0,005 ȘI ajută la ≥60% din acțiuni.
Rezultat pe 53 de acțiuni: mediana −0,0022, ajută la 30 din 53 (57%) ⇒ **nu trece; contextul NU intră în modele**. Motorul îl poate folosi (`spec.context`), dar nu e activat. Încercări în total pe indicatori: 5 (I-640) + 1 (I-651).
