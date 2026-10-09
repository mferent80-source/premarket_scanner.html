# Account performance, data provenance, evidence and server monitoring

The Desk now distinguishes broker realised-fill P&L from the observed return of the entire Invest account. Existing `tt_trading212_account_history_v1` observations are used without reconstructing earlier dates. Each scope retains at most 500 daily observations. Demo examples stay in memory and never read or write the real account ledger.

## Account return

An observed interval requires two valid valuations in one account currency and a complete transaction import checked after the final valuation. Skipped pages, interrupted imports, incompatible IDs, unexplained transfers and external flows in another currency block returns. A new import suspends the previous `complete` flag. Invalid or contradictory originals remain preserved.

For external flows `F` (deposits positive, withdrawals negative), the monetary result is `V_end - V_start - sum(F)`. Modified Dietz divides that result by `V_start + sum(F * (end - flow_time)/(end - start))`. The UI labels it an estimate, highlights flows at least 10% of starting capital and does not call it exact TWR. Subinterval estimates are geometrically linked for an observed index and drawdown. This index is not a reconstructed daily equity curve.

MWR solves the actual discounted cashflow equation numerically for the observed interval. It is not annualised. A single cashflow sign change is required; alternating flows that may have several IRR roots leave MWR unavailable. Dividends, interest and fees remain reflected in account value and are not subtracted again as external flows.

Benchmark lookup requires exact instrument identity, account currency and closes on both endpoint calendar dates. Results are explicitly indicative, exclude dividends and never subtract an EOD benchmark return from a non-simultaneous account valuation. Exact TWR, simultaneous benchmark comparisons, complete inception history and unexplained securities transfers still need additional source data.

Calculation reference: [CFA Institute GIPS asset owner handbook, Modified Dietz](https://www.gipsstandards.org/wp-content/uploads/2021/03/gips_standards_handbook_for_asset_owners.pdf). Transaction kinds were checked against the official Trading 212 schema (`DEPOSIT`, `WITHDRAW`, `FEE`, `TRANSFER`, `INTEREST_ON_FREE_CASH`, `LENDING_INTEREST`); TRANSFER is intentionally not assigned an external-flow sign without an account-level explanation.

## Data provenance and real trade evidence

Yahoo OHLC metadata follows the source into scanner candidates, Desk handoffs and holdings analyses: provider, exchange, timezone, interval, completed session, browser read time, original cache/download time, provider quote time, declared delay and valid/received bar counts. A new scan does not relabel an old cache as a new provider download. Unknown delay, holiday calendars and corporate-action adjustment policies remain unknown. Verdict evidence includes provider, delay and coverage without advertising an executable live quote.

Prospective analysis captures and the existing chronological forecast validations remain immutable. The additional trade-outcome report counts only unambiguously associated closed positions, reports all matched executions' cost/FX coverage, shows Wilson 95% win-rate intervals and a deterministic subset of non-overlapping trade intervals. Thirty observations is a descriptive minimum, not a significance test or proof of independent observations. Model groups share trades and must never be summed or interpreted as causal attribution.

An editable additional account-currency cost per closed position is a sensitivity assumption applied to broker-reported P&L. Reported taxes and FX are never subtracted a second time. Original broker outcomes and model states are unchanged.

## Server monitor

The existing encrypted D1 Worker exposes authenticated `/api/cloud/monitor` GET/PUT and `/api/cloud/monitor/check` POST. Monitoring starts only after the user activates it in Cont & sincronizare with an existing live Invest connection saved in cloud. A five-minute Cron Trigger invokes the same monitor while the browser is closed. No new secrets, database tables, recipient or messaging service are needed.

Rules cover manual stop/target levels in the exact quote currency, proximity to stop, concentration ≥20%, manual earnings dates within seven days, changed quantities/new or removed positions and provider errors. Missing prices and missing comparable stops produce coverage alerts. Broker source, timestamp, scope and complete position list are validated. Broker requests are GET-only; no order route is reachable. AI verdicts are not recomputed on the server.

State and up to 200 alert events are encrypted using the existing subject/key/revision associated-data convention. Server-internal records are excluded from ordinary cloud sync. Persistent conditions are deduplicated, account/key rotation suspends old rules and compare-and-swap revisions stop an in-flight result from reversing a user's disable action. Scheduler invocations respect the configured Google subject and rotate up to ten active accounts per invocation to bound outbound requests.

The UI distinguishes requested activation from an observed scheduler heartbeat and a recent successful broker read. Alerts are available in the private inbox on reopening the app. Push notifications, outbound messages, tick-level monitoring and automatic stop execution are not configured. A five-minute observation can miss a crossing between reads; a provider price read lacks independently verified per-instrument quote timestamps.

Account valuations and cash histories join encrypted PC/phone sync only after the server advertises their supported keys. An older Worker keeps those registers local. Conflicting same-time observations or same-ID cash items require a choice and cannot silently replace one another.

Validation: account cashflow examples, MWR equation, blocked histories, currency/benchmark mismatch, drawdown, paginated import coverage, two-device merges, cost sensitivity, sample reuse/overlap, provenance escaping, authenticated monitor isolation, encrypted storage, scheduler execution, safe broker failures, key rotation and disabling during a pending read. The existing suite is also run before publication.

Release validation: full suite 1,523 tests passed with no failures. A subsequent numeric-overflow guard was checked with the account-return regression suite; Worker bundle freshness and syntax checks also passed.
