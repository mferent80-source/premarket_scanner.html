# Trading Tools — calendar, performance, push and audit

This release completes the five implementation priorities from the professional controls roadmap. It preserves existing account, journal, plan, forecast and strategy registers. New results remain prospective; older executions never receive a retroactive prediction.

## Published cash-equity calendars

`lib/exchange-calendar.js` records closures, published short sessions and exchange timezones. Source review: 9 October 2026. Coverage: US and Xetra 2026–2027; London, Euronext Paris/Amsterdam/Brussels/Lisbon/Milan/Dublin, Madrid, SIX, Copenhagen and Vienna 2026. Unsupported years are explicitly unavailable. Refresh the calendar before its covered year expires.

Sources: [NYSE](https://www.nyse.com/trade/hours-calendars), [London Stock Exchange](https://www.londonstockexchange.com/equities-trading/business-days), [Xetra](https://cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours), [Euronext](https://www.euronext.com/en/trading/trading-hours-holidays), [FESE calendar](https://www.fese.eu/app/uploads/2024/07/trading-calendar-2026.pdf) and [FESE hours](https://www.fese.eu/app/uploads/2024/07/trading-hours-2026.pdf). The relevant source and review date appear in data quality.

Calendar confirmation requires recognized provider venue metadata and the matching timezone. Legacy forecast records infer their calendar from their original timezone and close time. Ordinary cash-equity hours include the closing auction margin; extended retail sessions and derivatives are outside this calendar. US short sessions use 13:00 New York time and London short sessions 12:30 London time. Capture waits a further 15 minutes after a known close. European short sessions without a published closing hour block same-day capture until the hour is confirmed; they are never assigned an invented regular close. Missing actual exchange sessions block five-session outcomes. New forecast capture is allowed only before the next actual exchange open. Unsupported legacy calendars retain their conservative weekday cutoff.

## Observed account performance

Modified Dietz, MWR, complete-flow requirements and observed history remain available. Exact TWR is available when there are no external flows, or when each group of simultaneous external flows has a same-currency account valuation immediately before and after the flow. These values are not interpolated from daily snapshots. Flow IDs, timestamp and before/after reconciliation must agree. Missing coverage leaves TWR unavailable.

Desk → performance → comparison and sources → supplementary valuations accepts this JSON format:

```json
{
  "scope": "live:your-account-scope",
  "currency": "EUR",
  "valuations": [{
    "at": "2026-10-05T12:00:00Z",
    "before": 1100,
    "after": 1600,
    "currency": "EUR",
    "flowIds": ["actual-deposit-id"],
    "reference": "Broker statement identifying this valuation"
  }]
}
```

The example is fictitious. Use only actual account-boundary valuations, scope and transaction IDs. The app does not certify an imported document's authenticity. Imports preserve contradictory originals and show an error; cloud merges require a choice for conflicting observations. Up to 500 boundary valuations per account are retained and included in account sync and backups.

Yahoo adjusted-close values and dividend/split metadata are retained when supplied. A benchmark uses adjusted closes only when both endpoints are available and labelled by the provider; otherwise it remains a price reference. Adjustment policy is not independently certified. Benchmark returns remain indicative, with no excess-return claim against account observations taken at different times. OHLC-based strategies remain price simulations excluding dividends, fixed fees and intraday execution.

## US and European prospective validation

Supported native quote units: USD, EUR, GBP, GBX, CHF and DKK, with a matching supported venue. GBP and pence/GBX remain distinct. Each native policy fixes 1,000 quote units, its original cost assumptions and identity. Results are grouped by instrument, currency and policy; there is no fictitious USD conversion. Legacy USD policies and outcomes remain readable without rewriting.

A new holdings verdict can capture broker evidence only with a current complete Invest position list from the same account. Only a later BUY in its fixed 30-minute window can be associated. Preexisting positions, additions, conflicting events and incomplete execution histories remain excluded from attributed closed results. Yahoo instrument mapping is declared locally and must be verified by the user. Supported instruments are not proof of model profitability.

## Push on each device

Use Cont & sincronizare → Alerte pe telefon și PC → Activează notificările aici. Chrome on Android must grant notification permission. Then send a test and use Verifică livrarea: service acceptance, browser receipt and notification opening have separate timestamps. Offline or blocked devices can lack receipt confirmation. Enabling software support does not enable notification permission on the user's phone.

Automatic alerts additionally require the existing Invest server monitor to be enabled with its cloud broker connection. The five-minute scheduler rotates at most five active accounts per invocation and sends to at most five devices per account, within the outbound request budget. More accounts can therefore have a longer observation interval. Repeated conditions are deduplicated; failed delivery can retry up to three attempts, five minutes apart, while its event remains recent. Disabling monitoring cancels reserved notifications before dispatch. HTTP 404/410 marks a subscription expired; explicit reenrollment clears that state. Notifications contain a generic message; account details stay in the authenticated inbox.

Push subscriptions, their owner, delivery receipts and VAPID key material are encrypted in the existing D1 table and excluded from ordinary cloud sync. No new secrets or database schema are required. RFC [8291](https://www.rfc-editor.org/rfc/rfc8291.html) payload encryption and [8292](https://www.rfc-editor.org/rfc/rfc8292.html) VAPID use Web Crypto. Endpoint host/path validation rejects arbitrary URLs; redirects are not followed. Receipt tokens are encrypted, expire after one hour and cannot read account data. Device removal cannot be undone by an in-flight send.

Google logout preserves previously enabled server monitoring and push. Stop each explicitly before changing accounts. No order route, tick feed or server AI recalculation is introduced.

## Decision chronology and server fingerprints

Desk → entry evidence shows the original analysis, compatible simulation-plan context, manual thesis changes, matched broker fills and derived closed result. Plans require the same account, symbol, session and levels before the associated BUY. Their inclusion is contextual and does not certify that the broker executed that plan. Local timestamps remain local declarations.

Authenticated server fingerprints preserve the first digest received for an analysis ID, with server acceptance time and a chained receipt. Changed content returns a conflict and keeps the original receipt. This proves first receipt by this server; it does not certify original creation time, independent notarization or that the analysis preceded the trade. Server fingerprints are optional and activated explicitly from Desk. They do not send the analysis content or place trades.

## Verification and operation

Cont & sincronizare now displays current-device internet, Google, sync, broker snapshot, scheduler, push and audit availability. Availability of IndexedDB/Web Crypto is a capability check, not proof of successful durable writes. A real PC ↔ Android check still requires a harmless personal change seen on both devices using the same Google account. Real Android notification delivery must be confirmed on the device; isolated fixtures cannot validate the user's session or permission.

Automated tests cover exchange holidays/DST/short sessions, unknown hours and years, TWR boundaries and rejection cases, native-currency policies, missing sessions, prospective broker evidence, plan context, independent cryptographic payload/signature verification, encrypted account isolation, delivery races, subscription limits, origin checks and immutable server receipts. `tools/professional-upgrade-demo.html` is a fictitious browser fixture, including a 390-pixel preview, with no broker writes or personal-ledger access. Release regression: 1,593 tests passed, zero failures. Changed JavaScript syntax and generated Worker bundle checks also passed. The full suite is required by the Pages publication workflow.

Deployment updates GitHub Pages and the existing Cloudflare Worker through its connected build. A missing push/audit capability on a still-old Worker keeps controls unavailable until deployment finishes. Reverting code does not delete or migrate stored journals, settings or encrypted account records; retain a complete personal backup before any data restoration.
