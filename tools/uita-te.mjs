// Se uită la o pagină: face poză, listează ce e apăsabil, numără cifrele de pe
// primul ecran și spune ce cereri au picat (cu URL întreg).
//   node tools/uita-te.mjs <url> <latime> <poza.png>

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = process.argv[2];
const LAT = +(process.argv[3] ?? 1440);
const POZA = process.argv[4];

const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));
// Curata profilul pe care L-A CREAT proba. 15 rulari au lasat 922 MB in %TEMP%, iar in
// alt proiect profilurile orfane ajunseseră la 7,5 GB cu discul la 10% liber. Stergerea
// sta in `finally`: daca proba pica la jumatate, folderul dispare oricum.
function curata(profil) {
  try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ramane pe disc, nu e fatal */ }
}

const port = 9500 + Math.floor(Math.random() * 90);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-uita-${port}`;
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`,
  `--window-size=${LAT},1200`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let tinta;
for (let i = 0; i < 60 && !tinta; i++) {
  try { tinta = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!tinta) await asteapta(250);
}
if (!tinta) { console.error('browserul nu a pornit'); curata(profil); process.exit(2); }

const ws = new WebSocket(tinta.webSocketDebuggerUrl);
let id = 0; const asteptari = new Map(); const picate = []; const cereri = new Map();
const trimite = (method, params = {}) => new Promise((res) => { const n = ++id; asteptari.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && asteptari.has(m.id)) { asteptari.get(m.id)(m.result); asteptari.delete(m.id); }
  if (m.method === 'Network.requestWillBeSent') cereri.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed') { const u = cereri.get(m.params.requestId); if (u) picate.push(`${m.params.errorText} ← ${u.slice(0, 150)}`); }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) picate.push(`HTTP ${m.params.response.status} ← ${m.params.response.url.slice(0, 150)}`);
};
await new Promise((r) => { ws.onopen = r; });
await trimite('Runtime.enable'); await trimite('Page.enable'); await trimite('Network.enable');
await trimite('Emulation.setDeviceMetricsOverride', { width: LAT, height: 1200, deviceScaleFactor: 1, mobile: LAT < 500 });

const ev = async (expr) => (await trimite('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

await trimite('Page.navigate', { url: URL0 });
await asteapta(15000);

console.log('\n=== APĂSABILE VIZIBILE ===');
const butoane = await ev(`(() => [...document.querySelectorAll('button,[role="tab"],a,summary,[data-tab],.tab')]
  .filter((e) => e.offsetParent)
  .map((e) => e.tagName.toLowerCase() + (e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : '') + ' » ' + (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48))
  .slice(0, 60))()`);
for (const b of butoane ?? []) console.log('  ' + b);

console.log('\n=== PRIMUL ECRAN (1200px) ===');
const prim = await ev(`(() => {
  const inRama = (e) => { const r = e.getBoundingClientRect(); return r.top < 1200 && r.bottom > 0 && e.offsetParent; };
  const toate = [...document.querySelectorAll('body *')].filter(inRama);
  const text = toate.filter((e) => e.children.length === 0 && (e.textContent || '').trim());
  const cifre = text.filter((e) => /[0-9]/.test(e.textContent)).length;
  const culori = new Set(toate.map((e) => getComputedStyle(e).color).concat(toate.map((e) => getComputedStyle(e).backgroundColor)).filter((c) => c && c !== 'rgba(0, 0, 0, 0)'));
  const fonturi = new Set(toate.map((e) => getComputedStyle(e).fontSize));
  return { elemente: toate.length, bucati_de_text: text.length, bucati_cu_cifre: cifre, culori_distincte: culori.size, marimi_de_font: fonturi.size, inaltime_totala: document.documentElement.scrollHeight };
})()`);
console.log(JSON.stringify(prim, null, 2));

console.log('\n=== SECȚIUNI (toată pagina) ===');
const sect = await ev(`(() => [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ' ' + (h.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60)).slice(0,40))()`);
for (const s of sect ?? []) console.log('  ' + s);

if (picate.length) { console.log('\n=== CERERI PICATE ==='); for (const p of [...new Set(picate)]) console.log('  ' + p); }

if (POZA) {
  const r = await trimite('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(POZA, Buffer.from(r.data, 'base64'));
  console.log(`\npoză: ${POZA}`);
}
ws.close(); browser.kill();
await asteapta(400);
curata(profil);
process.exit(0);
