# `lib/` — module comune trading-tools

Module shared între `crypto-scanner`, `nasdaq-scanner` și `trading-journal`. Fără build step — doar `<script src="../lib/X.js">`.

## Conținut

| Fișier | Namespace | Conținut |
|---|---|---|
| `indicators.js` | `window.TI` | calcRSI (Wilder), calcEMA, calcSMA, calcATR, calcMACD, calcBB, calcADX, calcVWAP, detectRSIDivergence (cu swing-points) |
| `utils.js` | `window.U` | escHtml, safeSymbol, safeCoin, formatP, formatUSD, timeAgo, fetchSafe (cu AbortController + backoff 429/418), trimLiveBar |
| `theme.css` | (CSS variables) | Paletă light + dark mode unificat |

## Status integrare

**Module sunt pregătite, dar scanner-ele nu le folosesc încă** — se evită rupturi sintactice fără teste runtime.

**Plan de migrare graduală** (fiecare scanner separat, după test browser local):

1. **crypto-scanner**: include `<script src="../lib/indicators.js">` în `<head>`. Înlocuiește local `calcRSI` cu `TI.calcRSI`. Test pump radar — semnalele trebuie să fie identice. Apoi treci la `calcATR`, `calcEMA`, etc.
2. **nasdaq-scanner**: idem.
3. **theme.css**: include în toate 3 scannerele + hub. Șterge variabilele duplicate din fiecare `<style>`.
4. **utils.js**: extract escapeHtmlNT, fetchSafe ultimul (cele mai folosite, cea mai mare risc).

## Convenție

- Biblioteci pe `window.X` (no module bundler)
- Fără side effects la load (doar definire)
- Backwards compat: dacă scanner mai folosește local `calcRSI`, lib-ul nu interferează (nume diferit `TI.calcRSI`)
