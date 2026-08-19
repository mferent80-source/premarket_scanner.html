# factor-lab — bancul de probă pentru factori

Nu construiește semnale. **Măsoară dacă un factor are edge**, înainte să merite
construit ceva pe el. A apărut după ce MFX Screener a fost livrat pe bază de
metodologie și a picat la test (646 de aprinderi, `t` max 0,64).

## Cum se folosește

```bash
# 1. adu klines (exemplu: 4h, 1000 bare/simbol)
mkdir -p /tmp/k
for s in BTCUSDT ETHUSDT SOLUSDT; do
  curl -s "https://api.binance.com/api/v3/klines?symbol=$s&interval=4h&limit=1000" -o /tmp/k/$s.json
done

# 2. scanează 15 factori standard, orizont 10 bare
node tools/factor-lab/factor-scan.js /tmp/k 10

# 3. validează ce a supraviețuit
node tools/factor-lab/factor-validate.js /tmp/k 10
```

## Ce înseamnă coloanele

- **medie** — randamentul mediu la `H` bare după ce factorul s-a aprins
- **edge** — cât bate peste *baseline* (randamentul oricărei bare). **Asta contează**,
  nu media: într-o piață care urcă, orice semnal are medie pozitivă.
- **t** — semnificația statistică. Sub `|t| = 2` e zgomot. Cu 15 factori testați
  simultan, cere `|t| > 3`: la 15 încercări, un `t ≈ 2` apare din hazard cu ~50% șansă.

## De ce `factor-validate` e partea importantă

`factor-scan` găsește candidați. `validate` îi omoară:

1. **split temporal** — prima jumătate vs. a doua. Un factor care merge doar în a
   doua jumătate nu e un factor, e un regim de piață.
2. **acoperire per simbol** — pe câte coinuri din 50 e pozitiv. Sub ~60%, e adunat
   din câteva accidente.
3. **fără cele mai bune 3** — dacă edge-ul dispare când scoți 3 simboluri, edge-ul
   era al lor, nu al factorului.

Rulare 19.08.2026, 50 cripto, 4h: **squeeze ATR** (`t=4,76`) și **ROC 30**
(`t=6,29`) au trecut scanul și au **picat validarea** — ambii au semn de edge
diferit între cele două jumătăți. Niciun factor din 15 nu a supraviețuit.
