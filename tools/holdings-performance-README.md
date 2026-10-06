# Performanța AI

`lib/holdings-performance.js` projects verified reports into a per-instrument
dashboard. It reuses the actual chronological evaluations in the six existing
model cores, with their original train/validation/reference/test rules and
blocked windows. `Recalculează testele istorice` invokes the shared-source
six-model runner, preserving the first forecast for each model/EOD.

Historical Neural/Boosting log loss, Brier and balanced accuracy are compared
with their linear/class-frequency baselines. HMM uses held-out density NLL;
Isolation reports signal rates without external anomaly labels. Quantiles use
coverage and interval score; GARCH uses QLIKE against constant variance and
EWMA separately at 5/20 sessions. Each score family keeps its own units and
periods. There is no model leaderboard or pooled portfolio accuracy.

Captured-time performance checks the scoped forecast ledger, excludes restored
records, and separates overlapping horizons within each model. Log loss/Brier
use only probabilities present in the original frozen estimate; older records
remain in directional measures without invented probabilities. Verdict
abstentions with probabilities are scored. Reliability tables keep empty bins
empty and show all three classes in 20-point intervals. Model sample counts
are explicit; they can differ, so those scores are not a matched-cohort ranking.

Historical results never create an operational checkpoint. The learning module
still requires prospective paired observations and its untouched acceptance
protocol. Source verification failures leave dated retained measures visible
with a warning; unreadable/incompatible ledgers have no computed measures.

Export includes projected metrics, periods and verdict reasons, without account
scope, positions, balances, broker identifiers, credentials or model weights.
Demo uses the same code and remains explicitly synthetic.

Checks: `node --test tools/holdings-performance.test.mjs`.
