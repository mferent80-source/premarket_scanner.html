# Backup and selective recovery — 26.10.09.1822

The remaining backup/recovery item from the accepted professional-controls work is now available in **Cont & sincronizare → Backup complet și restaurare**.

## Scope

The archive includes explicitly named local account histories, broker fills and snapshots, the manual journal, plans, pre-entry evidence, paper simulations, holdings notes and preferences, watchlists and risk settings. It also reads the durable plan authority, AI report fallback database and forecast/strategy/risk histories in IndexedDB. The original strings are exported without recalculating source timestamps. Invalid originals remain in the archive for recovery but their import is disabled.

Credentials, Google sessions/identity bindings, cloud baselines, infrastructure/network configuration, quote/scan caches, ephemeral model jobs and server-only monitor alerts are excluded. API connections are recovered through the existing Google-bound vault flow. The archive contains personal financial data and is a plain JSON file.

Each address has an exact target/key pair, byte count, record count and SHA-256 content hash. An aggregate manifest binds all addresses and hashes. Import recomputes these values and checks the allowlist and supported schemas instead of trusting the exported validation flag. Limits are 128 MiB per file, 64 MiB per payload and 10,000 addresses. Hashes detect alteration; they do not prove capture authenticity.

## Restoration

File selection is read-only. Missing registers can be added; different registers require explicit selection; identical and invalid ones are disabled. Unselected registers and registers absent from the file remain unchanged. Plans reconcile their archived legacy/durable copies and restore both addresses as one coherent selection, preventing an older mirror from reviving after reload.

Forecast and research-strategy imports retain local originals and add missing IDs. Imported forecasts acquire `restoredAt` and reset their verification; they remain excluded from probabilistic learning even after reverification. New imported research-strategy entries are marked unverifiable until their original forecast/source is checked. Restoring an archive never makes an old source recent.

A recovery journal commits before any app mutation. IndexedDB batches compare original values inside the same readwrite transaction and complete atomically. Local writes compare each original immediately before writing. If a later store/local write fails, completed changes are recovered. Journal states retain interrupted operations for the recovery button after reopening. Undo compares restored values with current values and preserves later edits, reporting unresolved recovery instead of overwriting them. This is recoverable multi-store work, not a single transaction across localStorage and several databases. Close other editing windows for restoration.

Web Locks serialize recovery with cloud reconciliation, plans, original trade captures and Europe history writes. Browsers lacking these locks can export but cannot confirm a restoration. Automatic cloud reconciliation is persistently suspended before import/undo. The shell's hidden broker is unloaded while paused. After reviewing the result and reloading, **Sincronizează acum** explicitly resumes reconciliation. Other running app windows must be closed; pause does not stop the remote monitor.

Only the latest recovery operation is retained. Beginning another restore replaces that operation's recovery journal after ensuring the preceding operation is complete. Forecast imports have their own existing per-instrument archives in addition to this recovery journal.

## Validation

- Full Node regression suite: **1,550 passed**, zero failures, cancellations or skipped tests.
- New cases cover manifests, multibyte text, disallowed addresses, semantic revalidation, damaged originals, owner mismatch, expired previews, quota failures, journal refusal, cross-store rollback, interruption/reopening, later edits, plan-copy coherence, restored forecast provenance and persistent cloud suspension.
- `tools/system-backup-browser-check.html` runs an additional isolated real-browser/IndexedDB verification. It uses an in-memory local register and uniquely named temporary databases, never the user's financial registers or sessions. It checks durable capture/recovery and an aborted multi-record transaction, as well as the archive controller's failure paths.

Real-account authentication and a physical phone remain separate from these automated fixtures.
