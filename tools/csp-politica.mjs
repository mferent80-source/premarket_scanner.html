// tools/csp-politica.mjs — 20.10.2026 (I-732): sursa UNICĂ a politicii Content-Security-Policy pentru paginile Decision App.
// GitHub Pages nu pune anteturi HTTP ⇒ politica stă în fiecare pagină ca <meta http-equiv="Content-Security-Policy">, primul element
// din <head> imediat după <meta charset>. Textul NU se scrie de mână în pagini: `node tools/csp-politica.mjs --scrie` îl pune (sau îl
// înlocuiește) în toate paginile din PAGINI, iar `node --test tools/csp.test.mjs` pică dacă o pagină are alt text sau dacă un script
// încărcat de o pagină numește o gazdă neclasificată aici.
// O gazdă nouă se adaugă CONȘTIENT, într-unul din trei locuri: SURSE (o cere codul: cu fișierul și motivul), NEAPELATE (apare doar ca
// link, citare sau comentariu — CSP nu privește navigarea) sau BLOCATE (o oprim cu bună știință); apoi --scrie și testul.
// O singură politică pentru toate paginile, fără variante: carcasa (app/index.html) servește iframe-urile prin parent.X(), iar o cerere
// pornită de o funcție a carcasei cade sub politica CARCASEI — cu politici diferite, o asemenea cerere s-ar rupe tăcut.
// Limitele unei politici din <meta>: frame-ancestors, report-uri și sandbox sunt ignorate; iar nicio politică CSP nu oprește scurgerea
// prin navigare (location.href / window.open), fiindcă navigate-to nu există în browsere. Politica oprește cererile (fetch, imagini,
// scripturi, cadre) spre gazde nelistate, <base> străin, formulare spre alte gazde și pluginurile.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Carcasa + fișierul fiecărei rute active din lib/app-routes.js (testul compară lista cu rutele, ca o rută nouă să nu rămână fără politică).
// app/mobile-preview.html nu e aici: nu e rută și nu o leagă nimic (pagină de demo care pune aplicația într-un iframe).
export const PAGINI = Object.freeze(['app/index.html', 'today/index.html', 'scanner-verdicts/index.html', 'holdings/index.html', 'desk/index.html',
  'journal/index.html', 'app/tools/index.html', 'health/index.html', 'app/settings/index.html', 'candidate-engine/index.html',
  'europe-stocks/index.html', 'broker/index.html', 'shadow-book/index.html', 'alerts/index.html', 'app/coach/index.html',
  'app/status/index.html', 'app/sync/index.html']);

// 'self' în producție = originea GitHub Pages (aceeași pentru toate aplicațiile de pe mferent80-source.github.io).
export const ORIGINEA = 'https://mferent80-source.github.io';

// Directivele, în ordinea din textul politicii; fiecare sursă cu `de` = fișierul care o cere și de ce.
export const SURSE = Object.freeze({
  'default-src': [{sursa: "'self'", de: 'tot ce nu are directivă proprie (media etc.) doar de pe site'}],
  'script-src': [
    {sursa: "'self'", de: 'scripturile din lib/ și din pagini; niciun CDN'},
    {sursa: "'unsafe-inline'", de: 'scripturile inline și on*= din pagini rămân (fără eval / new Function: testul o păzește)'},
    {sursa: 'https://accounts.google.com/gsi/client', de: 'app/sync/sync.js — Google Identity Services, încărcat la „Conectează Google”'}
  ],
  'style-src': [
    {sursa: "'self'", de: 'lib/*.css, app/*.css'},
    {sursa: "'unsafe-inline'", de: '<style> și style= din toate paginile'},
    {sursa: 'https://fonts.googleapis.com', de: 'health/index.html, shadow-book/index.html — fonturile DM Mono și Sora'},
    {sursa: 'https://accounts.google.com/gsi/style', de: 'app/sync/sync.js — foaia de stil pe care o adaugă Google Identity Services'}
  ],
  'img-src': [
    {sursa: "'self'", de: 'iconițele aplicației'},
    {sursa: 'data:', de: 'iconițele SVG inline (favicon, notificări)'},
    {sursa: 'blob:', de: 'imaginile create în pagină'}
  ],
  'font-src': [
    {sursa: "'self'", de: 'lib/fonts/*.woff2 (IBM Plex, prin lib/plex.css)'},
    {sursa: 'data:', de: 'fonturi inline'},
    {sursa: 'https://fonts.gstatic.com', de: 'fișierele fonturilor Google cerute de fonts.googleapis.com (health/, shadow-book/)'}
  ],
  'connect-src': [
    {sursa: "'self'", de: 'generated/*.json, version.json, configurările din app/, market-breadth/, tools/alerts.json'},
    {sursa: ORIGINEA, de: 'alerts/index.html — tools/alerts.json cu adresa absolută; e chiar „self” în producție, scrisă și explicit pentru proba locală'},
    {sursa: 'https://*.mferent80.workers.dev', de: 'workerii LUI (numai contul lui are subdomeniul mferent80): tt-proxy (lib/data.js, lib/setup-levels.js; și tt_custom_proxy / tt_custom_proxy2 din localStorage), premarket-scanner-html (app/cloud-sync.js, app/trading212-config.json ⇒ broker/broker.js, lib/t212-orders.js: contul, sincronizarea, releul Trading 212), paznic-radar (lib/radar-poza.js, lib/stop-setter.js, today/stop.js; și radar_url)'},
    {sursa: 'https://query1.finance.yahoo.com', de: 'lib/data.js fetchJSON — prin tt-proxy, iar „direct” e ultima rezervă; lib/price-day.js, lib/early-long.js, journal/, health/, alerts/'},
    {sursa: 'https://query2.finance.yahoo.com', de: 'alerts/index.html — căutarea simbolurilor (D.fetchJSON)'},
    {sursa: 'https://finnhub.io', de: 'cheia Finnhub, numai direct (I-698): lib/holdings-events.js, lib/early-long.js, lib/earnings.js, lib/journal-insights.js, lib/setup-levels.js, journal/, health/, alerts/'},
    {sursa: 'https://api.binance.com', de: 'lib/data.js (lumânări), lib/setup-levels.js, alerts/index.html'},
    {sursa: 'https://fapi.binance.com', de: 'lib/data.js (funding, open interest), alerts/index.html (Radar)'},
    {sursa: 'https://api.coingecko.com', de: 'lib/setup-levels.js, alerts/index.html'},
    {sursa: 'https://api.alternative.me', de: 'lib/market-verdict.js — Fear & Greed'},
    {sursa: 'https://api.twelvedata.com', de: 'lib/setup-levels.js — doar cu cheia TwelveData'},
    {sursa: 'https://api.frankfurter.dev', de: 'europe-stocks/finance.js — cursurile BCE'},
    {sursa: 'https://raw.githubusercontent.com', de: 'europe-stocks/finance.js (calendar.json), alerts/index.html (alerts.json, news-watch.json)'},
    {sursa: 'https://api.github.com', de: 'health/index.html (roboții din Actions, accesul la gist), alerts/index.html (alertele urcate cu tokenul GitHub)'},
    {sursa: 'https://api.anthropic.com', de: 'lib/ai.js prin lib/decision-panel.js — doar cu cheia Anthropic a lui'},
    {sursa: 'https://discord.com', de: 'lib/telegram.js — webhook-ul Discord al alertelor (alerts/, journal/ …)'},
    {sursa: 'https://discordapp.com', de: 'lib/telegram.js — forma veche a webhook-ului, acceptată de esteWebhook()'},
    {sursa: 'https://accounts.google.com/gsi/', de: 'Google Identity Services: starea butonului și FedCM (app/sync/sync.js)'},
    {sursa: 'https://*.tail9144fe.ts.net:*', de: 'PREVENTIV: radar_url (lib/radar-poza.js, lib/stop-setter.js, today/stop.js) acceptă orice adresă https și se poate pune de mână pe Radarul de acasă prin Tailscale; azi niciun cod nu cere de acolo (adresa *.ts.net apare doar ca link), iar caseta din Alerte nu mai schimbă adresa'}
  ],
  'frame-src': [
    {sursa: "'self'", de: 'modulele din carcasă, Trading 212 în fundal, Premarket Scanner în fundal (scanner-verdicts/, desk/)'},
    {sursa: 'https://accounts.google.com/gsi/', de: 'butonul „Sign in with Google” (app/sync/sync.js)'}
  ],
  'worker-src': [{sursa: "'self'", de: 'holdings/*-worker.js, lib/desk-classifier.js, sw-app.js, app/sw.js'}],
  'manifest-src': [{sursa: "'self'", de: 'app/manifest.webmanifest, alerts/manifest.webmanifest'}],
  'object-src': [{sursa: "'none'", de: 'fără pluginuri'}],
  'base-uri': [{sursa: "'self'", de: 'un <base> străin ar muta toate scripturile relative'}],
  'form-action': [{sursa: "'self'", de: 'formularele (fără action) rămân pe pagină'}]
});

// Gazde care apar în fișierele încărcate de pagini DOAR ca link (navigare), citare, comentariu, exemplu sau spațiu de nume.
// CSP nu privește navigarea, deci nu intră în politică; testul cere ca fiecare literal să fie ori în SURSE, ori aici, ori în BLOCATE.
export const NEAPELATE = Object.freeze([
  {gazda: 'https://finance.yahoo.com', de: 'linkuri spre pagina simbolului: holdings/holdings.js, europe-stocks/view.js, europe-stocks/finance.js, lib/holdings-events.js'},
  {gazda: 'https://www.tradingview.com', de: 'linkuri spre grafic: lib/portfolio-risk.js, alerts/index.html'},
  {gazda: 'https://github.com', de: 'linkuri Actions / docs și pagina de token (window.open): scanner-verdicts/view.js, health/index.html, alerts/index.html'},
  {gazda: 'https://www.ssga.com', de: 'link: holdings/holdings.js'},
  {gazda: 'https://proceedings.mlr.press', de: 'citare: holdings/calibration.js'},
  {gazda: 'https://www.gipsstandards.org', de: 'citare: desk/account-performance.js'},
  {gazda: 'https://www.nyse.com', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.londonstockexchange.com', de: 'sursa calendarului: lib/exchange-calendar.js; referință în europe-stocks/salt-list.js'},
  {gazda: 'https://cashmarket.deutsche-boerse.com', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.euronext.com', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.fese.eu', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.gov.uk', de: 'sursa calendarului (text, nu cerere): lib/exchange-calendar.js'},
  {gazda: 'https://www.bolsasymercados.es', de: 'sursa calendarului: lib/exchange-calendar.js; referință în europe-stocks/salt-list.js'},
  {gazda: 'https://www.six-group.com', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.nasdaq.com', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.wienerborse.at', de: 'sursa calendarului: lib/exchange-calendar.js'},
  {gazda: 'https://www.borsaitaliana.it', de: 'sursa calendarului: lib/exchange-calendar.js; referință în europe-stocks/salt-list.js'},
  {gazda: 'https://live.deutsche-boerse.com', de: 'referințe de corespondență în lista Salt: europe-stocks/salt-list.js'},
  {gazda: 'https://live.euronext.com', de: 'referințe de corespondență în lista Salt: europe-stocks/salt-list.js'},
  {gazda: 'https://www.boerse-frankfurt.de', de: 'referință în lista Salt: europe-stocks/salt-list.js'},
  {gazda: 'https://www.eurex.com', de: 'referință în lista Salt: europe-stocks/salt-list.js'},
  {gazda: 'https://salt.bank', de: 'sursa listei Salt (PDF): europe-stocks/salt-list.js'},
  {gazda: 'http://127.0.0.1:8788', de: 'link „Deschide în Radar” pe PC-ul de acasă: lib/radar-ecran.js'},
  {gazda: 'http://www.w3.org', de: 'spațiul de nume SVG din iconițele inline'},
  {gazda: 'https://nume.workers.dev', de: 'exemplu din comentariul lib/data.js (tt_custom_proxy)'},
  {gazda: 'https://nume-2.workers.dev', de: 'exemplu din comentariul lib/data.js (tt_custom_proxy2)'}
]);

// Gazde pe care codul le cere, dar pe care politica le OPREȘTE cu bună știință.
// Proxy-urile CORS publice trimit mai departe ORICE adresă: în connect-src, un XSS ar scoate cheile prin ele spre orice gazdă (exact ce
// oprește I-732). Măsurat 20.10.2026, cu Origin-ul suitei: corsproxy.io 401 („A valid API key is required”), api.cors.lol 429,
// api.codetabs.com 522 după 19,7 s — niciunul nu mai servea; tt-proxy (propriu) 200 și refuză alte gazde (403 host not allowed).
// Blocate, cad pe loc (TypeError) în loc să atârne, iar lanțul din lib/data.js trece la următoarea rezervă ca la orice eroare de rețea.
export const BLOCATE = Object.freeze([
  {gazda: 'https://corsproxy.io', de: 'proxy CORS public din lib/data.js și lib/setup-levels.js — 401 la 20.10.2026'},
  {gazda: 'https://api.codetabs.com', de: 'proxy CORS public din lib/data.js și lib/setup-levels.js — 522 după 19,7 s la 20.10.2026'},
  {gazda: 'https://api.cors.lol', de: 'proxy CORS public din lib/data.js și lib/setup-levels.js — 429 la 20.10.2026'}
]);

export function politica() {
  return Object.entries(SURSE).map(([directiva, surse]) => [directiva, ...surse.map(x => x.sursa)].join(' ')).join('; ');
}

export function meta() { return '<meta http-equiv="Content-Security-Policy" content="' + politica() + '">'; }

const META_CSP = /<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;
// Pune meta-ul imediat după <meta charset> (pe rândul următor, cu capătul de rând al fișierului, dacă acolo se trece la rând) sau înlocuiește
// meta-ul existent. Pagina rămâne neschimbată dacă are deja exact acest meta.
export function aplica(html) {
  const tag = meta(), existente = html.match(META_CSP) || [];
  if (existente.length > 1) throw Error('mai multe meta CSP în aceeași pagină');
  if (existente.length === 1) return html.replace(META_CSP, () => tag);
  const cs = /<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>/i.exec(html);
  if (!cs) throw Error('pagina nu are <meta charset>');
  const dupa = cs.index + cs[0].length, eol = html.startsWith('\r\n', dupa) ? '\r\n' : html.startsWith('\n', dupa) ? '\n' : '';
  return html.slice(0, dupa) + eol + tag + html.slice(dupa);
}

// node tools/csp-politica.mjs           ⇒ afișează politica
// node tools/csp-politica.mjs --scrie   ⇒ o scrie în toate paginile din PAGINI (doar meta-ul; restul fișierului rămâne cum e)
const rulatDirect = !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (rulatDirect) {
  if (!process.argv.includes('--scrie')) console.log(politica());
  else for (const pagina of PAGINI) {
    const cale = new URL('../' + pagina, import.meta.url), vechi = readFileSync(cale, 'utf8'), nou = aplica(vechi);
    if (nou !== vechi) writeFileSync(cale, nou, 'utf8');
    console.log((nou !== vechi ? 'scris   ' : 'la zi   ') + pagina);
  }
}
