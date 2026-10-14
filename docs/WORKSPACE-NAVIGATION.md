# Workspace navigation and layout

The active workspace uses five primary tasks: **Astăzi, Piață, Portofoliu, Jurnal, Risc & capital**. Instrumente lists the other active modules; Setări exposes the existing theme API and links to account, synchronization and data checks. The original Premarket Scanner remains available from Piață and Instrumente with its rules unchanged.

`lib/app-routes.js` defines active routes, canonical Journal tabs, legacy aliases and unavailable destinations. The shell, shared navigation and generated Hub links use this registry. A file containing a stopped/moved notice is not an active tool. Router and Cockpit have no page files; the registry rejects them. External Crypto Radar links remain explicitly external. The old Shell entry forwards to the current app without deleting saved tabs, settings or financial records.

The live design follows the approved isolated prototype's navy/mint palette, clear hierarchy, readable controls and mobile list/detail workflow. Market results retain separate original/V1 labels, source dates, currency, freshness and coverage. Fictional demo values, simulated scans and example account balances are not part of the production UI.

Closed Journal execution details open in the current workspace, for both desktop/mobile ledgers and the classic Scorecard. The dialog rereads the execution by ID, displays native quote prices and explicitly USD fees/net results via existing JR functions, and closes if the record is removed or reopened. It does not mutate an execution. Keyboard dismissal and focus restoration are supported.

Canonical URL helpers place queries before Journal hashes. Handoff context continues to travel in frame/private history state and is not added to the outer application URL. Unknown or retired stored modules recover to an available task with an explanatory status.

Checks: `tools/app-routes.test.mjs`, `tools/navigation-links.test.mjs`, `tools/decision-app-navigation.test.mjs`, `tools/workspace-pages.test.mjs`, `tools/scanner-results.test.mjs`, `tools/journal-layout.test.mjs`, and the existing financial, FX, broker and handoff checks. Browser visual verification requires a browser-capable environment.
