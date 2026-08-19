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

## `deriv-scan.js` — funding rate + open interest

```bash
node tools/factor-lab/deriv-scan.js <klines> <funding> <oi> 10
```
Aliniere fără lookahead (pentru bara T folosește ultimul funding publicat ≤ T).
⚠️ **Open interest: Binance păstrează doar ~31 de zile de istoric.** Nu se poate
valida temporal — orice rezultat pe OI rămâne orientativ.

Include două **CONTROALE**: `short mereu` și `long mereu`. Într-o piață care scade,
orice factor „short" pare bun; un factor real trebuie să bată controlul.

## `funding-decisive.js` — testul cel mai sever

```bash
node tools/factor-lab/funding-decisive.js <klines> <funding> 10
```
Compară **două grupuri care trăiesc aceeași perioadă** (Welch t-test): barele cu
funding pozitiv vs. cele cu funding negativ. Efectul de regim se anulează, fiindcă
ambele grupuri văd aceleași zile.

**Ăsta e testul care demontează cel mai mult.** Un factor poate arăta „edge pozitiv
în ambele jumătăți" față de baseline și totuși să nu prezică nimic — pentru că
baseline-ul negativ face orice short să pară bun. Grup-vs-grup nu se poate păcăli.

## De ce `factor-validate` e partea importantă

`factor-scan` găsește candidați. `validate` îi omoară:

1. **split temporal** — prima jumătate vs. a doua. Un factor care merge doar în a
   doua jumătate nu e un factor, e un regim de piață.
2. **acoperire per simbol** — pe câte coinuri din 50 e pozitiv. Sub ~60%, e adunat
   din câteva accidente.
3. **fără cele mai bune 3** — dacă edge-ul dispare când scoți 3 simboluri, edge-ul
   era al lor, nu al factorului.

## Rezultate 19.08.2026 (50 cripto, 4h, ~166 zile)

**Tehnici (15 factori):** squeeze ATR (`t=4,76`) și ROC 30 (`t=6,29`) au trecut
scanul și au **picat** validarea — semn de edge diferit între jumătăți. Forța
relativă vs BTC: `t=−4,07`, adică **inversul** intuiției (mean reversion).

**Funding (34.678 observații):** „funding 3 zile pozitiv → short" arăta `t=10,11`,
edge +0,449%, și trecea și split-ul pe edge-vs-baseline. La testul decisiv
grup-vs-grup: **prima jumătate `t=−7,03`, a doua `t=+0,53`** — efectul dispare
complet. În a doua jumătate, funding pozitiv (−0,372%) și negativ (−0,406%) dau
practic același randament.

**Open interest:** nevalidabil (31 de zile, toate în a doua jumătate).

**Concluzie: 0 factori utilizabili din 27 testați.**
