# Complete Breadth suite

Source: the user's uploaded `market-breadth-analyzer.zip`. All Python/PowerShell
modules, methodology, tests and source documentation are retained. Uploaded
July reports, personal account/thesis/configuration files and watchlists are not
published. They remain in the original uploaded ZIP.

The ZIP referenced a missing sibling `uptrend-analyzer`. Its complete code,
tests and license were restored from the primary upstream repository
https://github.com/tradermonty/claude-trading-skills at commit
`b981835f7c4cc06fb2ac09fab39b078085c9e972` (`skills/uptrend-analyzer`).

Run with Python 3.12 after `pip install requests pyyaml tzdata jsonschema`:

```
python tools/breadth-suite/run.py --backtests auto
```

`--backtests skip` updates all live market modules without rerunning historical
research. `auto` refreshes breadth research daily, RS/sector research weekly,
and stock rotation/early-buy research monthly, based on the JSON generation
DATE, not git checkout mtime. `all` forces all research. Original limitations
(survivorship bias, overlapping windows, sample universes and missing costs)
remain visible. These research results are not live entry confirmations.

The Pages workflow runs before the US session and after its close on weekdays;
manual `workflow_dispatch` runs the same calculation. The website supports
GitHub's authenticated Run workflow UI only. The scan link opens GitHub in
a new tab; sign in as the repository owner and select Run workflow. The
website has no token field and never collects credentials. The connected
GitHub account authorizes calculation; opening the link alone does not run it.
Workflow reference: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event

Data integrity:
- Every run downloads new quotes; an in-run cache avoids duplicate requests.
- Cache files live outside the repo; interval and symbol are part of the key.
- Only daily bars completed by 16:15 America/New_York are used for stocks
  (17:15 for futures/dollar macro proxies). Intraday prices belong to the
  existing Candidate Engine, which validates entry/stop separately.
- More than two weekdays old, future, insufficient MA200 history, missing
  benchmark, mismatched observation dates or <80% sample coverage are excluded.
- Weekday freshness is not a full exchange holiday calendar.
- The dated Uptrend timeseries drives all 11 sector summaries; an undated
  sector snapshot cannot silently mix dates.
- Original S&P six-component score stays tied to its source CSV date. The
  independent Yahoo S&P constituents sample is displayed separately with
  its own coverage/methodology; it does not replace that historical score.
- Nasdaq uses the approximate original company list, NOT certified current
  Nasdaq-100 membership. Small-cap is a proxy sample, NOT all Russell 2000.
- NH/NL is close within 2% of 252-session extremes, not actual exchange counts.
- Earnings unavailable = NEVERIFICAT, not a safe no-earnings window.

Original private portfolio/discipline/actionable/registration and email code
is preserved but not run against unknown account state or uploaded examples.
The report marks personal risk unverified; Decision Desk/Guardrail remain the
user's risk gate. No emails, orders or thesis registrations are sent.

`market-breadth/generated/report.html` is the complete five-tab original report.
`data/latest.json` is the dated shared contract read by Breadth/Desk/Status;
`generated/run-status.json` tracks the exact scan request and partial failures.
