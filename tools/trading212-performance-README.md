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
