// INVENTARUL SUITEI (22.09.2026) - cat de obositoare e FIECARE pagina, masurat.
//
// De ce: „care pagina o luam prima?" e o intrebare care merita o cifra, nu o impresie.
// Deschide fiecare pagina intr-un browser adevarat si numara, pe primul ecran:
//   · cate lucruri APASABILE sunt, si cate dintre ele n-au NICIO eticheta (doar emoji)
//   · cate marimi de font si cate culori distincte (= cat de mult sistem are designul)
//   · cate bucati de text, si cate dintre ele au cifre (= informatie vs decor)
//   · inaltimea totala (cat scroll)
//   · cererile de retea picate, grupate pe gazda
//   · textul stricat (NaN / undefined / [object Object])
//   · „se incarca" ramas agatat
//
// Scorul e o SUMA DE ABATERI de la tinte declarate, nu o nota data din burta. Fiecare
// componenta e afisata separat, ca sa se vada din ce se compune.
//
//   node tools/inventar.mjs [gazda] [latime]

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAZDA = (process.argv[2] ?? 'http://127.0.0.1:8777').replace(/\/$/, '');
const LAT = +(process.argv[3] ?? 1440);

const PAGINI = [
  'cockpit/', 'macro-dashboard/', 'sector-rotation/', 'nasdaq-scanner/', 'watchlist-monitor/',
  'market-events/', 'smart-trade-long/', 'pump-radar/', 'markov-lab/', 'earnings-hub/',
  'factor-lab/', 'alerts/', 'journal/', 'portfolio/', 'weekly/', 'health/', 'router/',
  'equity/', 'shadow-book/', 'postmortem/', 'governor/', 'guide/', 'mfx-screener/', '',
];

// Tintele. Sunt ale mele, declarate, nu universale - dar macar sunt scrise.
const TINTA = { apasabile: 12, fonturi: 5, culori: 6, inaltime: 2000 };

const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9100 + Math.floor(Math.random() * 90);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-inv-${port}`;
const curata = () => { try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch {} };

const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`, `--window-size=${LAT},1200`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let tinta;
for (let i = 0; i < 60 && !tinta; i++) {
  try { tinta = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!tinta) await asteapta(250);
}
if (!tinta) { console.error('browserul nu a pornit'); curata(); process.exit(2); }

const ws = new WebSocket(tinta.webSocketDebuggerUrl);
let id = 0; const asteptari = new Map();
let consola = [], retea = [], cereri = new Map();
const trimite = (m, p = {}) => new Promise((res) => { const n = ++id; asteptari.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && asteptari.has(m.id)) { asteptari.get(m.id)(m.result); asteptari.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consola.push('consolă');
  if (m.method === 'Runtime.exceptionThrown') consola.push('EXCEPȚIE');
  if (m.method === 'Network.requestWillBeSent') cereri.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed') { const u = cereri.get(m.params.requestId); if (u && !/favicon/.test(u)) retea.push(u); }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !/favicon/.test(m.params.response.url)) retea.push(m.params.response.url);
};
await new Promise((r) => { ws.onopen = r; });
await trimite('Runtime.enable'); await trimite('Page.enable'); await trimite('Network.enable');
await trimite('Emulation.setDeviceMetricsOverride', { width: LAT, height: 1200, deviceScaleFactor: 1, mobile: false });
const ev = async (x) => (await trimite('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

const masoara = () => ev(`(() => {
  const seVede = (e) => !!e.offsetParent && !e.closest('details:not([open])');
  const inRama = (e) => { const r = e.getBoundingClientRect(); return r.top < 1200 && r.bottom > 0 && seVede(e); };
  const toate = [...document.querySelectorAll('body *')].filter(inRama);
  const text = toate.filter((e) => e.children.length === 0 && (e.textContent || '').trim());
  // Un buton fara litere si fara aria-label nu spune ce face. Asta numaram.
  const apasabile = [...document.querySelectorAll('button,[role="tab"],a,summary,[data-tab]')].filter(inRama);
  const mute = apasabile.filter((e) => {
    const t = (e.innerText || e.textContent || '').replace(/[^\\p{L}\\p{N}]/gu, '').trim();
    return !t && !e.getAttribute('aria-label') && !e.getAttribute('title');
  });
  const culori = new Set();
  const fonturi = new Set();
  for (const e of toate) {
    const s = getComputedStyle(e);
    if (s.color) culori.add(s.color);
    if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') culori.add(s.backgroundColor);
    fonturi.add(s.fontSize);
  }
  const re = /(^|[^A-Za-z0-9])(NaN|undefined|\\[object Object\\])(?![A-Za-z0-9])/;
  const stricat = text.filter((e) => re.test(e.textContent || '')).length;
  const agatat = text.filter((e) => /se (incarca|încarcă)|loading|\\.\\.\\.$/i.test((e.textContent || '').trim())).length;
  return {
    apasabile: apasabile.length, mute: mute.length,
    fonturi: fonturi.size, culori: culori.size,
    text: text.length, cuCifre: text.filter((e) => /[0-9]/.test(e.textContent)).length,
    inaltime: document.documentElement.scrollHeight,
    stricat, agatat,
  };
})()`);

const rez = [];
console.log(`\n  INVENTARUL SUITEI · ${GAZDA} · ${LAT}px · ${PAGINI.length} pagini\n`);

for (const cale of PAGINI) {
  consola = []; retea = []; cereri.clear();
  await trimite('Page.navigate', { url: GAZDA + '/' + cale });
  await asteapta(9000);
  const m = await masoara();
  const gazde = new Set(retea.map((u) => { try { return new URL(u).host; } catch { return u.slice(0, 30); } }));
  if (!m) { console.log(`  ${(cale || 'hub').padEnd(22)} nu s-a putut măsura`); continue; }

  // Scorul = suma abaterilor peste tinta. Fiecare bucata se vede separat mai jos.
  const ab = (v, t) => Math.max(0, v - t);
  const scor = ab(m.apasabile, TINTA.apasabile) * 1.5
    + m.mute * 3
    + ab(m.fonturi, TINTA.fonturi) * 4
    + ab(m.culori, TINTA.culori) * 2
    + ab(m.inaltime, TINTA.inaltime) / 250
    + gazde.size * 6 + m.stricat * 10 + m.agatat * 5 + consola.length * 4;

  rez.push({ cale: cale || '(hub)', scor: Math.round(scor), ...m, gazde: gazde.size, consola: consola.length });
  console.log(`  ${(cale || '(hub)').padEnd(22)} scor ${String(Math.round(scor)).padStart(4)}`
    + ` · ${String(m.apasabile).padStart(3)} apăsabile (${m.mute} mute)`
    + ` · ${String(m.fonturi).padStart(2)} fonturi · ${String(m.culori).padStart(2)} culori`
    + ` · ${String(m.inaltime).padStart(5)}px`
    + (gazde.size ? ` · ${gazde.size} gazde moarte` : '')
    + (m.stricat ? ` · ${m.stricat} TEXT STRICAT` : '')
    + (m.agatat ? ` · ${m.agatat} agățat` : '')
    + (consola.length ? ` · ${consola.length} erori` : ''));
}

ws.close(); browser.kill(); await asteapta(400); curata();

console.log('\n  ── CLASAMENT (cele mai obositoare primele) ──\n');
rez.sort((a, b) => b.scor - a.scor);
for (const [i, r] of rez.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. ${r.cale.padEnd(22)} ${String(r.scor).padStart(4)}`);
}
console.log(`\n  ținte: ≤${TINTA.apasabile} apăsabile · ≤${TINTA.fonturi} fonturi · ≤${TINTA.culori} culori · ≤${TINTA.inaltime}px\n`);
process.exit(0);
