# Independent scanner: experimental EOD research

`lib/independent-scanner.js` implements a second, separately computed assessment alongside the restored Premarket / Candidate Engine. It does not consume that engine's scores, decisions, probabilities, plans, eligibility or ranking. The only shared selection is the requested universe of ticker symbols. It independently requests daily bars through `D.fetchStock` and validates them through `DailySeries.read` and the exchange calendar.

**Version: `experimental-1.0.0`.** These thresholds are unvalidated research hypotheses. `research_match` means that a ticker passed the documented rules; it is neither a buy recommendation nor evidence of a profitable strategy. The current research / negative-edge audit is not overridden by a match. There is no automatic trade or USD plan handoff from this module.

This is an **end-of-day scanner**, not a live premarket signal. It excludes an unfinished session and shows the last verified completed exchange-local date separately from the scan timestamp. A newly fetched stale series remains unverifiable. Its result does not establish current broker prices, executions, earnings clearance, portfolio suitability or risk capacity.

## Using the two windows

The app opens on `today/` for a concise account, risk and results overview. The `scanner-verdicts/` page shows **Rezultate Premarket Scanner** and **Verdict independent — reguli V1** side by side, or stacked on a phone. Run the original scanner in its existing `candidate-engine/` page; its restored rules and capabilities are preserved. The mirrored original window covers Top Long and Early Reversal, including the original top-list limit. Trend 12 luni remains available in the original page.

Run Reguli V1 separately with the shared ticker universe or an explicit list. Expand a result to inspect its eight checks, native-currency EOD close and data date. The fictional DEMO is opt-in, uses the real evaluator on synthetic data and is never saved. Cancelling preserves the preceding completed report.

Comparison requires fresh reports, verified current EOD data, the same symbol, session and currency. Old rule versions and unavailable evidence remain visible with explicit status but do not count as comparable. Complete coverage with no top candidates, partial coverage, total fetch failure and unknown coverage are distinct states. Absence from the original top list is not a negative verdict. The experimental technical result does not bypass the original scanner's account, earnings or risk gates.

## Eight gates

Every result exposes `checks` with stable IDs, a label, `pass` / `fail` / `unknown`, the observed value, a transparent rule and an explanation. All eight gates must pass for `research_match`. Valid, complete data with a failed gate produces `rules_not_met`. Any unknown gate produces `unverifiable`, even when other numerical gates pass.

| Gate | Experimental rule |
|---|---|
| `data` | Exact requested/provider symbol, interval `1d`, supported exchange/timezone and compatible known native currency; verified latest completed exchange session. A price discontinuity above 40% anywhere in the full stock history consumed by EMA / RSI / ATR is unverifiable because corporate actions / source continuity cannot be independently established. |
| `history` | At least 220 completed daily bars. The latest 21 observations must be consecutive official trading sessions; the calendar-covered part of all supplied indicator history must have no gaps. Weekend bars are rejected even in older years. The older part of the series uses the provider's dated OHLC history; calendars for unknown historic years are not fabricated. |
| `price` | Native-currency close at or above the documented currency threshold. |
| `liquidity` | Mean `close × volume` over the latest 20 completed days meets the native-currency threshold. Each of the latest 21 volumes must be finite and strictly positive. Zero / missing volume is unavailable evidence, not zero liquidity or an opportunity. |
| `trend` | EMA20 > EMA50 > EMA200, with EMA50 higher than five sessions earlier. Indicators use all verified supplied bars, not just the minimum 220; EMAs start with an N-period simple mean. |
| `relative_strength` | The equity's 20-session percentage **price** return minus its regional benchmark's return is at least zero. Both endpoints and every one of the 21 dates must align exactly. Missing or stale benchmark data remains unknown. |
| `setup` | One of the two structures below; Wilder RSI14 between 45 and 75, Wilder ATR14 between 0.3% and 8% of close, close no more than 1.5 ATR and 8% above EMA20, and close in the upper 40% of the day's high-low range. Null/zero ATR or a zero daily range makes this gate unverifiable. |
| `volume` | Final **completed-day** volume divided by the mean of the 20 **preceding** days: at least 1.2× for breakout, or 1× for the EMA20 pullback. |

Breakout: close strictly above the highest high of the preceding 20 completed sessions.

Constructive pullback: close at/above EMA20 and within 0.75 ATR of it; low at/below EMA20 + 0.5 ATR; close at/above the previous close. The common RSI, ATR, extension and close-location gates still apply. A breakout uses the stricter breakout volume rule when both structures qualify.

## Native currencies and regional benchmark

No FX conversion is performed. The price displayed is always the instrument's native-currency provider close, and traded value uses that same currency.

| Currency | Minimum close | Minimum average daily traded value |
|---|---:|---:|
| USD | 5 | 10,000,000 |
| EUR | 5 | 10,000,000 |
| GBP | 4 | 8,000,000 |
| GBX (provider `GBp`, pence) | 400 | 800,000,000 |
| CHF | 5 | 10,000,000 |
| DKK | 35 | 75,000,000 |

Supported exchange calendars come from `ExchangeCalendar`: US (USD); Xetra, Paris, Amsterdam, Brussels, Lisbon, Milan, Dublin, Madrid and Vienna (EUR); London (GBP / GBX); SIX (CHF); Copenhagen (DKK). Unknown exchanges, unsupported currencies or inconsistent exchange/currency metadata yield an explicit unverifiable reason. Updating official calendar coverage is a separate prerequisite for unsupported years.

Regional comparison uses `SPY` for US listings and `EXSA.DE` (STOXX Europe 600 ETF, Xetra, EUR) for supported European listings. This is a broad **regional** comparator, not a sector or country model. The benchmark is identified in every result. The comparison uses local percentage price returns; it does not claim total-return or currency-adjusted performance. Different market holidays can make exact date alignment unavailable; such comparisons stay unverifiable.

Both series use provider OHLC closes consistently. The scanner never mixes `adjustedClose` for one side with raw `close` for the other. It does not independently audit Yahoo's corporate-action history or proxy data. Splits, dividend treatments, revisions and large real price jumps can still limit this research comparison; the >40% discontinuity guard is conservative and does not resolve smaller unreported adjustments.

## Universe selection

`getUniverse({storage})` reads **only** ticker symbols from the Premarket cache's JSON `universeKey` in `ce_results_v2`, preserving the original universe even if no primary candidates passed. An explicitly empty universe stays empty. It does not infer the universe from the primary engine's winners.

If no valid primary universe is stored, it reads `wl_stocks`. With neither available it uses this explicitly documented static example universe:

`AAPL, MSFT, NVDA, AMZN, META, GOOGL, JPM, XOM, ASML.AS, SAP.DE, SIE.DE, AIR.PA`.

This small fallback is a selection of familiar liquid listings for trying the tool, not a recommendation, complete market screen, dynamically ranked basket or claim that those names pass. `scan({symbols})` can use an explicitly supplied list. Symbols are validated and deduplicated; evaluation still independently verifies the provider's exact identity.

## API and storage

The browser global is `window.IndependentScanner`; CommonJS consumers can also require the module. Public methods / fields:

- `VERSION`, immutable `RULES`, immutable `DEFAULT_UNIVERSE`.
- `getUniverse({storage})` returns a ticker array.
- `evaluate({symbol, bars, benchmarkBars, now})` is deterministic for the supplied inputs/time and loaded session calendar. It does not mutate data, fetch prices or use storage. Arrays require attached provider `.meta` with `symbol`, `currency`, `exchange`, `timezone`, `regularEnd` (milliseconds) and `interval: '1d'`.
- `scan({symbols, onProgress, signal})` independently fetches the selected equities and one regional benchmark per region. Benchmark requests are shared only within that scan. Scan failures remain result items with `unverifiable`; `failures` records the explicit reasons. A missing dependency rejects the scan.

A result includes:

```js
{
  symbol, currency, sourceDate, sourceTimezone, sourceCloseMinutes,
  ts, price, verdict, passed, total, checks, reason, metrics, dataQuality
}
```

The report includes:

```js
{
  version, provider, completedAt, items, failures,
  universe, universeSource, verifiedCount
}
```

`verifiedCount` counts all fully evaluable tickers, including `rules_not_met`; it is not the number of research matches. Progress callbacks receive `{done, total, item, symbol, phase: 'evaluating'}`. Caller exceptions in progress handling do not invalidate already computed data.

The scanner itself never saves reports. The dual-scanner UI stores **only a completed report** at `tt_independent_scanner_v1`. An aborted scan rejects with `AbortError`, promptly stops awaiting the current request, and never returns a partial report for saving. The shared `D.fetchStock` helper currently does not guarantee physical cancellation of an in-flight network request; the scanner discards that late response and starts no further requests. Simultaneous scans have separate reports and benchmark state.

Threshold changes require a new version and fresh numerical tests. Historical matches must not be reinterpreted as current matches after version, session or universe changes.

## Verification and next research step

Run `node tools/independent-scanner.test.mjs` for the numerical, native-currency, session, alignment, missing-data, storage-isolation and cancellation tests. Fixtures are explicitly synthetic. They verify implementation semantics and do not validate profitability or live provider availability.

Before making any performance claim, evaluate the versioned rules on historical point-in-time universes with delisted symbols, corporate actions, costs, slippage, independent chronological holdout periods and comparison with the same-universe baseline. The current module reports explainable second assessments and disagreement; it provides no win rate, success probability or claimed edge.
