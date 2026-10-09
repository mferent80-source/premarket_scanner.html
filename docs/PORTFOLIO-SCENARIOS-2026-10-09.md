# Portfolio price and currency sensitivity

Release: **26.10.09.2242**. Open **Analiza deținerilor → Control → Scenarii portofoliu · preț și curs valutar**.

The former uniform-loss slider is replaced with independent signed price and FX assumptions. Price changes can target the whole portfolio or a manually classified sector. FX changes target all foreign quote currencies or one chosen currency, regardless of the price sector. Same-account-currency positions receive no FX change. Currency selection groups GBp/GBX under GBP while retaining the original price/stop units.

For each position, the broker value in account currency is multiplied by `(1 + price change) × (1 + FX change)`. The price contribution is `value × price change`; the currency contribution is `value × (1 + price change) × FX change`, including the interaction. A price decline of 10% and a currency decline of 5% therefore produce a 14.5% decline on an affected foreign-currency position. Cash and reserved funds remain constant; pending orders are assumed not to execute.

The expanded contribution table names each instrument, manual sector, changes applied, monetary change, hypothetical price and exact-unit manual stop comparison. A reached stop is only an observation; it never caps losses, assumes execution or submits an order. Presets are deterministic examples without probability or recommended sizing.

Whole-account projection requires the selected account/environment, a valid ISO snapshot time no more than five minutes old, the authoritative complete raw position list, finite nonnegative account fields, unique position identifiers, positive quantities/prices/values for held positions and account-currency valuations. Same-currency prices/values, investments and account components must reconcile within 1%, with a minimum rounding tolerance of 0.02. Missing, duplicated, malformed, short or hidden invalid rows prevent a complete projection. A previous `lastComplete` copy is never substituted for a partial current snapshot.

Stale snapshots retain explicitly historical contributions but withhold the projected account value and impact percentage. Incomplete snapshots retain only a partial contribution sum. Invalid timestamps, missing account binding and oversized sources expose no aggregate change. Overflow cannot become a zero-risk result. Each row names its missing input.

The starting FX rate is implicit in the broker position valuation, not independently verified. Listing currency does not establish a company's economic currency exposure. Quantities stay fixed. Fees, taxes, dividends, liquidity, execution, hedges and probabilities are outside this calculation. This is a hypothetical sensitivity on the snapshot, not a forecast, VaR or guaranteed maximum loss.

Controls are temporary and reset on account, environment or currency changes. The feature reads the existing scoped snapshot and saved notes and makes no financial-storage writes, API requests or cloud schema changes. The independent browser example uses invented data and never reads user account registers.

Validation: 17 focused tests covering compounding, independent filters, pence, cash/reservations, stale/future/unbound sources, malformed/duplicate/hidden rows, incomplete imports, reconciliation, stops, zero/positive/extreme scenarios, overflow, immutable originals and omission of credentials. The complete repository suite passed 1,567 tests; the focused suite was rerun after the final timestamp and source-binding guards. Browser verification uses `tools/portfolio-scenarios-demo.html`.
