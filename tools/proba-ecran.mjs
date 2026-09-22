// PROBA CU BROWSER REAL PENTRU SUITA trading-tools (22.09.2026).
//
// De ce: repo-ul avea 12 teste .mjs, toate pe cod și pe rețea simulată.
// NICIUNA nu pornea un browser. O pagină care nu mai primește date de la
// Finnhub / CryptoPanic / proxy nu strică niciun test — ea doar TACE, iar
// tăcerea se vede doar cu ochii pe ecran.
//
// Asta deschide paginile într-un Edge adevărat, le lasă să-și ceară datele,
// și se uită la:
//   · erorile din consolă și excepțiile aruncate
//   · cererile de rețea care au picat (fetch mort, 4xx/5xx) — cu gazda lor
//   · textul stricat pe ecran (NaN, undefined, [object Object])
//   · „se încarcă" rămas agățat
//   · taburile: le apasă și cere ca ecranul să se SCHIMBE
//
//   node tools/proba-ecran.mjs [gazda] [latime]
//     node tools/proba-ecran.mjs http://127.0.0.1:8777 1440
//     node tools/proba-ecran.mjs http://127.0.0.1:8777 390     (telefon)

import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAZDA = (process.argv[2] ?? 'http://127.0.0.1:8777').replace(/\/$/, '');
const LAT = +(process.argv[3] ?? 1440);

/** Paginile probate, cu ce trebuie apăsat pe fiecare. */
const PAGINI = [
  { cale: '/macro-dashboard/', nume: 'macro-dashboard', apasa: ['Calendar', 'Macro news', 'Crypto news', 'Oportunități', 'Watchlist', 'Jurnal', 'Ghid', 'Setări'] },
  { cale: '/sector-rotation/', nume: 'sector-rotation', apasa: [] },
];

const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9700 + Math.floor(Math.random() * 90);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-proba-${port}`;
const browser = spawn(EDGE, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`, `--window-size=${LAT},1200`,
  '--no-first-run', '--disable-features=Translate', 'about:blank',
], { stdio: 'ignore' });

let tinta;
for (let i = 0; i < 60 && !tinta; i++) {
  try {
    const lista = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    tinta = lista.find((x) => x.type === 'page');
  } catch { /* încă nu a pornit */ }
  if (!tinta) await asteapta(250);
}
if (!tinta) { console.error('browserul nu a pornit'); process.exit(2); }

const ws = new WebSocket(tinta.webSocketDebuggerUrl);
let id = 0;
const asteptari = new Map();
let consola = [];
let retea = [];
const cereri = new Map();

const trimite = (method, params = {}) => new Promise((res) => {
  const n = ++id; asteptari.set(n, res);
  ws.send(JSON.stringify({ id: n, method, params }));
});

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && asteptari.has(m.id)) { asteptari.get(m.id)(m.result); asteptari.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consola.push(`consolă: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 220)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    consola.push(`EXCEPȚIE: ${(d?.exception?.description ?? d?.text ?? '').slice(0, 220)}`);
  }
  if (m.method === 'Network.requestWillBeSent') {
    cereri.set(m.params.requestId, m.params.request.url);
  }
  if (m.method === 'Network.loadingFailed') {
    const u = cereri.get(m.params.requestId);
    if (u && !u.startsWith('data:')) retea.push({ url: u, cum: m.params.errorText || 'a picat' });
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    retea.push({ url: m.params.response.url, cum: `HTTP ${m.params.response.status}` });
  }
};

await new Promise((r) => { ws.onopen = r; });
await trimite('Runtime.enable');
await trimite('Page.enable');
await trimite('Network.enable');
await trimite('Emulation.setDeviceMetricsOverride', { width: LAT, height: 1200, deviceScaleFactor: 1, mobile: LAT < 500 });

const ev = async (expr) => (await trimite('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

const RAU = /(^|[^A-Za-zĂÂÎȘȚăâîșț0-9])(NaN|undefined|Infinity|\[object Object\])(?![A-Za-zĂÂÎȘȚăâîșț0-9])/;

const textRau = () => ev(`(() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const re = ${RAU.toString()};
  let n;
  while ((n = w.nextNode())) {
    if (!n.parentElement?.offsetParent && n.parentElement?.tagName !== 'BODY') continue;
    const t = n.textContent || '';
    if (re.test(t)) {
      const f = n.parentElement?.closest('section,article,[class*="card"],[class*="panel"]');
      const titlu = f?.querySelector('h2,h3')?.textContent?.trim() ?? '';
      out.push((titlu ? titlu.slice(0, 40) + ' → ' : '') + t.trim().slice(0, 90));
    }
  }
  return [...new Set(out)].slice(0, 12);
})()`);

/** Cate elemente mai spun „se încarcă" / „loading" și se VĂD. */
const seIncarca = () => ev(`(() => {
  const vaz = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent || e.tagName === 'BODY');
  return vaz.filter((e) => e.children.length === 0
    && /se (incarca|încarcă)|loading|aștept|astept|\\.\\.\\.$/i.test((e.textContent || '').trim())
  ).map((e) => (e.textContent || '').trim().slice(0, 50)).slice(0, 8);
})()`);

const amprenta = () => ev(`(() => {
  const t = document.body.innerText || '';
  return { lung: t.length, cheie: t.replace(/\\s+/g, ' ').slice(0, 400) };
})()`);

const apasa = (ce) => ev(`(() => {
  const el = [...document.querySelectorAll('button,[role="tab"],a,summary,.tab,[data-tab]')]
    .find((b) => (b.innerText || b.textContent || '').replace(/\\s+/g, ' ').includes(${JSON.stringify('')} + ${JSON.stringify(ce)}));
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
})()`);

const probleme = [];
const noteaza = (unde, ce) => { probleme.push({ unde, ce }); console.log(`     ❌ ${ce}`); };

console.log(`\n  PROBA CU BROWSER REAL · ${GAZDA} · lățime ${LAT}px\n`);

for (const p of PAGINI) {
  consola = []; retea = []; cereri.clear();
  console.log(`  ── ${p.nume}`);
  await trimite('Page.navigate', { url: GAZDA + p.cale });
  await asteapta(9000); // paginile își cer datele (Finnhub, proxy, Yahoo)

  const badge = await ev(`document.body.innerText.match(/tt-v\\d+|v\\d+\\.\\d+\\.\\d+/)?.[0] ?? '—'`);
  const titlu = await ev('document.title');
  const a0 = await amprenta();
  console.log(`     versiune ${badge} · „${titlu}" · ${a0?.lung ?? 0} caractere de text`);

  if (!a0?.lung || a0.lung < 200) noteaza(p.nume, `pagina e GOALĂ (${a0?.lung ?? 0} caractere)`);

  for (const c of consola) noteaza(p.nume, c);
  for (const r of await textRau() ?? []) noteaza(p.nume, `text stricat: „${r}"`);
  for (const s of await seIncarca() ?? []) noteaza(p.nume, `agățat pe „${s}"`);

  // rețeaua: grupată pe gazdă, ca să se vadă CINE tace
  const peGazda = new Map();
  for (const r of retea) {
    let g; try { g = new URL(r.url).host; } catch { g = r.url.slice(0, 40); }
    if (!peGazda.has(g)) peGazda.set(g, new Set());
    peGazda.get(g).add(r.cum);
  }
  for (const [g, cum] of peGazda) noteaza(p.nume, `rețea MOARTĂ: ${g} — ${[...cum].join(', ')}`);

  // butoanele/taburile: apasă și cere schimbare
  for (const ce of p.apasa) {
    consola = [];
    const inainte = (await amprenta())?.cheie ?? '';
    const ce_a_apasat = await apasa(ce);
    if (!ce_a_apasat) { noteaza(p.nume, `butonul „${ce}" NU EXISTĂ pe ecran`); continue; }
    await asteapta(2500);
    const dupa = (await amprenta())?.cheie ?? '';
    const s_a_schimbat = inainte !== dupa;
    for (const c of consola) noteaza(p.nume, `la „${ce}": ${c}`);
    for (const r of await textRau() ?? []) noteaza(p.nume, `la „${ce}" text stricat: „${r}"`);
    if (!s_a_schimbat) noteaza(p.nume, `„${ce_a_apasat}" apăsat — ecranul NU s-a schimbat`);
    else console.log(`     ✅ „${ce_a_apasat}" → ecranul s-a schimbat`);
  }
  console.log('');
}

ws.close(); browser.kill();

if (probleme.length) {
  console.log(`  ${probleme.length} PROBLEME:\n`);
  for (const p of probleme) console.log(`   · ${p.unde} — ${p.ce}`);
  console.log('');
  process.exit(1);
}
console.log('  nimic stricat pe ecran\n');
process.exit(0);
