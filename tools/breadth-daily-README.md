# Breadth at first app opening

Implementation is ready; the public endpoint is deliberately disabled until the
dedicated Worker is deployed and verified. GitHub Pages cannot run Python or
authenticate a workflow dispatch itself. No GitHub token belongs in Pages,
localStorage, the config JSON or the browser.

The app starts one request on its first opening in each **Europe/Bucharest** day.
The dedicated Durable Object reserves that day before calling GitHub. Tabs,
phones and laptops share one server reservation. A timeout or a crash does not
retry an ambiguous dispatch; manual **Run workflow** remains the recovery path.
An accepted request is not a completed scan: the app waits for the matching
`open-YYYY-MM-DD` requestId in the published run-status.json (up to 45 minutes).
The underlying original engine and source freshness rules are preserved.

## One-time activation

1. Connect the owner's Cloudflare account, then deploy the separate Worker:
   `npx wrangler deploy --config tools/breadth-daily-wrangler.jsonc`.
   This does not replace the existing quotation proxy or alert worker.
2. Put an Actions-write credential for **only this repository** in the Worker's
   secret `GH_DISPATCH_TOKEN`:
   `npx wrangler secret put GH_DISPATCH_TOKEN --config tools/breadth-daily-wrangler.jsonc`.
   Enter it through the authenticated provider/CLI, never through chat or git.
3. Verify `/daily` from the application's origin: first POST queues one workflow;
   a repeated POST returns the same requestId without another dispatch.
4. Set the verified HTTPS `/daily` URL and `enabled: true` in
   `app/breadth-daily-config.json`, then publish the app.
5. Remove the existing `schedule` block from `.github/workflows/pages.yml` after
   activation to make normal scans run only on opening. Push deployments and
   manual Run workflow can still rebuild/scan intentionally.

Until activation, the existing scheduled scans stay available. The app does not
claim that merely loading the published report executes a new scan.

Scan and publication now have separate job reservations. A queued publication
cannot block the scheduled/manual EOD scan. After a scan, publication checks out
main again, including the completed data commit and concurrent app changes.
An engine ERROR is published explicitly only when that request's own finished
manifest exists; an unexpected crash cannot reuse an older successful manifest.
Public CSV rows after the last completed US weekday (16:15 New York cutoff)
are excluded with their count recorded. This does not assume an exchange holiday
calendar or relabel an observation date.

## Checks

`node --test tools/breadth-daily.test.mjs tools/decision-app-navigation.test.mjs`

The endpoint allows only the app origin, hard-codes the repository/ref/workflow,
ignores client body parameters, exposes no credentials and permits at most one
automatic dispatch attempt per Bucharest day. Origin checking is not user
authentication; the fixed daily cap bounds this public trigger's workload.
