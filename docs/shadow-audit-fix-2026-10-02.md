# Shadow Book audit fix — 2026-10-02

Base: origin/main 45938a7a. Separate branch: fix/shadow-evaluation-audit-20261002.

Fixed: premature forward evaluations; stop/gap handling; daily duplicate bars; truncated history; silent removal beyond 800 signals; fabricated $100 per R; sample warnings based on pending count; attempts mistaken for completed evaluations. Legacy records remain stored, but must be recomputed before entering current statistics. The UI exposes older history in batches of 40.

Method: signal price is a hypothetical entry; only later daily bars are used. Today's UTC daily bar is excluded until the following UTC date (conservative completion). The full horizon is required before evaluation, even if a stop occurred sooner. Daily stop fills use the stop price or a worse opening gap. No fees, slippage, intraday path, FX conversion or causal filter-edge inference are modeled. R attribution is dimensionless, not USD P&L. Fetch failures and insufficient history leave records pending. Storage failures are reported rather than pruning history.

Validation: 14 focused behavioral tests pass; 189/191 full-suite tests pass. The two existing failures were reproduced on the prior checkout: proxy navigation missing and obsolete corssh chain expectation. Inline page scripts compile; git diff --check passes.

Not complete: broader audit remediation, FX correctness, proxy navigation/test alignment, real browser integration and GitHub publication. CLI push lacks credentials; connector branch creation returned 403 Resource not accessible by integration.

Demo: tools/shadow-audit-demo.html, synthetic examples only.
