# Dated Market Breadth import

`python tools/market-breadth/update.py` imports two public sources without credentials:

- TraderMonty Uptrend Dashboard: dated aggregate and sector timeseries.
- TraderMonty Market Breadth Analysis: S&P500 percentage above SMA200/SMA50.

Only the original observation date determines freshness. Successful downloads do
not refresh that date. On network/validation failure the previous observation is
retained with `fetchStatus: ERROR`, excluded by `lib/breadth.js`. Failed sources do
not prevent publishing the failure status. Future dates, mismatched ratios,
non-finite values and regressing source dates are rejected.

`market-breadth/data/latest.json` is the shared versioned contract consumed by the
Breadth page, Decision Desk and Data Status. Context rules are documented in the
page; they are not the original composite score. Aggregate ratios are fractions;
UI participation is percentage. Sector rotations are MA slope, not price returns.

The existing Pages workflow imports on every deploy and at 12:20/22:20 UTC Monday
to Friday, commits the observation/status JSON, then deploys directly. The bot's
commit does not trigger a recursive deploy. Schedules can be delayed by GitHub.
The two public providers can themselves stop updating: freshness remains visible.

Stock suggestions require a fresh local Candidate Engine scan (maximum 30 minutes),
US region and a dated matching sector. They are not individual stocks from the
aggregate CSV. Original NDX/Russell/macroeconomic measurements and stock ideas are
preserved in `archive-2026-09-22.html`, not relabelled as current measurements.

Checks:
`python -m unittest discover -s tools/market-breadth -p 'test_*.py'`
`node --test tools/breadth-contract.test.cjs`

Source definitions:
https://github.com/tradermonty/uptrend-dashboard
https://github.com/tradermonty/market-breadth-analysis
