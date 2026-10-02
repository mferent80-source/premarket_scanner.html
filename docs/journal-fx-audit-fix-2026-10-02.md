# Journal FX audit patch — 2026-10-02

Branch: fix/shadow-evaluation-audit-20261002, continuing the isolated Shadow fix.

Journal stores quoteCurrency, fxEntryUsd and fxExitUsd (USD per native price unit). Historical rates are manual inputs from broker records, not network lookups or current-rate substitutes. Closed PnL converts both fill cash flows separately and deducts legacy fees in USD. Initial notional and stop risk convert at entry FX. R uses net USD PnL divided by initial USD risk. GBp quotes are treated as GBX (pence), not GBP.

Missing FX preserves records but excludes them from valued performance samples; statistics expose nAll/missingFx. Journal warning marks partial USD totals. Missing open or recent closed valuation blocks Risk Governor and new-risk checks. Foreign live PnL/exposure are unavailable until a synchronized quote/FX feed exists; no entry-FX fallback. Quick close for non-USD positions routes to the full form so exit FX can be supplied. Tracker synchronization and webhook closes preserve currency/rates. Updated asset query versions prevent mixed old/new APIs.

Validation: 14 FX behavioral tests and previous 14 Shadow tests pass. Full suite: 203/205 pass; the same two pre-existing failures remain (proxy navigation and obsolete corssh expectation). Inline journal scripts compile, interactive demo computes 218 USD with entry FX 1.10 and exit FX 1.20, and missing-FX toggle hides valuation. git diff --check passes. No real browser integration or live brokerage reconciliation was performed.

Limits: multi-currency live valuation, automatic historical FX, financing/dividends, multiple/partial fills and other broker-specific cash flows remain outside this patch. Unknown foreign exchange suffixes need explicit currency; unqualified US symbols keep legacy USD behavior. Older incomplete trades leave equity history partial and must be corrected from broker statements. GitHub publication remains blocked by integration write access (403) and missing CLI credentials; commits are local.

Demo: tools/journal-fx-audit-demo.html (synthetic, self-contained, uses the patched journal calculation).
