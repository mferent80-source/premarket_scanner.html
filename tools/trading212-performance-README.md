# Trading 212 → Decision Desk Performance Control

The app keeps its broker frame alive while navigating. After reconnecting an existing saved connection, the first orders-history page is merged into `tt_trading212_fills_v1` immediately. The importer follows every cursor, including pages containing previously known fills. Account/positions refresh every 60 seconds; completed history is revisited after five minutes, subject to API cooldowns. Synchronization requires an open, active app, an available network, and automatic synchronization enabled.

Decision Desk defaults to Trading 212 Invest. It reads only the selected live snapshot's account scope and updates on broker storage events or its regular render cycle. It never falls back to another account or demo history. The optional `?demo=1` preview uses explicitly fictitious fixtures without changing the real journal. Shadow statistics remain available through their own source selector.

## Calculation contract

- Count distinct `TRADE` SELL fills with a finite broker-reported `walletImpact.realisedProfitLoss` in the selected wallet currency. Partial sales are separate exit executions, not inferred closed positions.
- Sum the broker P&L directly. Display reported fees and FX rates separately; do not subtract fees again, infer missing results, or convert currencies.
- Win rate = positive reported exits / eligible exits, including zero-result exits. Average = total / eligible exits. Profit factor = positive results / absolute negative results; infinity only when there are gains and no losses.
- Reject malformed/future fills and conflicting duplicate IDs; exclude unknown result/currency/type from trading statistics. Preserve the journal and show partial/error coverage explicitly.
- Deposits, dividends and corporate actions do not become trading P&L. R and Long/Reversal classification require independently documented initial stops and strategies and are not inferred from broker history.

The implementation consumes the existing read-only normalized worker response; it adds no order placement or credential handling.

Official schema and pagination: [Trading 212 API](https://docs.trading212.com/api), [historical orders](https://docs.trading212.com/api/historical-events/orders_1). The source model separates instrument price currency from wallet-impact currency. The API field is presented as reported P&L, without asserting an independently reconciled net/fiscal result.

Validation: `tools/trading212-performance.test.mjs` checks currencies, partial fills, duplicates, data validity, account isolation, costs and FX. Desk tests check source switching, filters and immediate updates from broker storage; client tests check the initial import and cursor/backfill behavior.

## Capital and risk controls

`T212Capital` reads the selected live snapshot, its full position list, complete current execution history and the documented stops in `tt_holdings_theses_v1`. Capital, cash, exposure, concentration, daily/weekly realised-loss budgets and stop risk remain in the account's wallet currency. Governor incorporates the stricter status without adding the manual USD journal's P&L to the broker's results or changing the configured manual capital.

Missing/stale account data, partial history, unknown stops, reserved orders without documented risk, breached stops or exhausted limits block new research-plan sizing. Missing risk is never zero. Limits are editable in Risk Desk. For foreign-quoted holdings, wallet value divided by quantity times current instrument price gives only an estimated same-position conversion; it excludes fees and gap risk. GBp stops retain their pence denomination.

USD research plans require an explicit manual wallet-per-USD sizing rate for a foreign wallet. The saved plan pins that assumption, selected account and snapshot timestamp. Broker cash, remaining instrument-concentration capacity, day/week loss allowance and total-stop allowance constrain the persisted quantity, alongside existing Shadow reservations. Triggering a simulation rechecks the selected account and current capacity. No broker orders are submitted.

Official account/position definitions: [account summary](https://docs.trading212.com/api/accounts/getaccountsummary), [positions](https://docs.trading212.com/api/positions).

## Realised curve and contributions

The curve starts at zero and cumulatively sums eligible reported SELL-fill results after applying period, wallet currency and instrument filters. Equal timestamps form one point. Drawdown is the maximum peak-to-trough decline of this realised-result series in currency units, including the zero baseline; it is not the drawdown of account equity. A range control exposes individual dated points. Symbol contributions use the same population as the headline totals. Reported costs across filtered BUY/SELL executions are shown separately by currency and never deducted twice.

## Pre-entry evidence and later outcomes

Select a current USD candidate and press “Păstrează analiza” before buying. Saving a valid Shadow research plan also attempts to preserve that exact selected analysis. The immutable local ledger `tt_trade_evidence_v1` stores the source identity, levels, capture time, account/baseline quantity, verdict and seven compatible model states including KNN. The public model-summary cache bridges browser frames only for the exact source/history identity and a maximum age of 30 minutes. An absent/incompatible report records unavailable models rather than invented model signals. This new analysis ledger stays on the current device and has its own JSON export; it is not yet part of cloud synchronization.

The first subsequent BUY must fall after capture and within the original candidate's remaining 30-minute validity window. The latest eligible capture owns the entry. Old trades cannot receive hindsight verdicts. Existing holdings, intervening fills, another BUY order, corporate events, uncertain timestamp order, overselling or missing/mixed-currency realised results remain ambiguous and excluded. Partial fills of the same BUY order belong to one entry; partial sales stay open until the quantity is fully closed. A complete current history is required before classification as closed.

Broker P&L comes only from the associated reported exits. Quote-price R is separately labelled gross USD and uses actual entry prices against the saved initial stop, excluding fees and FX. Groups by verdict/model are descriptive outcomes of associated closed trades; they do not measure five-session forecast accuracy or establish that a model caused profit. Exports retain the original snapshots. Demo captures and model results are isolated in memory and never enter the real ledger.

Additional validation: `tools/trading212-capital.test.mjs`, `tools/trade-evidence.test.mjs`, `tools/decision-bridge.test.mjs` and Desk interaction tests cover missing stops, scope rotation, FX, capacity persistence, future-fill rejection, immutable KNN capture, partial exits and ambiguous attribution.
