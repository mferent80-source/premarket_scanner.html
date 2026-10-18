// INVENTARUL ECRANULUI — „nimic pierdut, ABSOLUT NIMIC” (regula lui Marius, 14.10.2026; adaptat din busola/probe/inventar-ecran.mjs
// pe 18.10.2026 pentru reașezarea paginii Planuri). NU e în suita de teste: cere browserul și rețeaua.
//
// Deschide pagina (de regulă adresa PUBLICATĂ) în câteva stări (--cazuri: sufixe de query, ex. ",demo=1"), desface TOATE pliurile
// (<details>, butoanele cu aria-expanded=false), apasă pe rând comutatoarele cerute (--file, ex. "REVERSAL|Simulări Shadow") și
// notează tot ce vede omul: titluri, propoziții, butoane, câmpuri, grafice. Cifrele devin „#”. Nu apasă butoane care SCHIMBĂ ceva.
// Cu `--fata-de <vechi.json>` arată ce rând din inventarul vechi NU se mai găsește în pagina de acum (ieșire 1 dacă lipsește ceva).
//
//   node tools/inventar-ecran.mjs <adresa> <iesire.json> [latime] [--cazuri ",demo=1"] [--file "A|B"] [--blocheaza "candidate-engine/"] [--fata-de vechi.json]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = process.argv.slice(2), opt = (n) => { const i = arg.indexOf(n); if (i < 0) return null; const v = arg[i + 1]; arg.splice(i, 2); return v; };
const BLOCHEAZA = (opt('--blocheaza') || '').split('|').filter(Boolean), FATA = opt('--fata-de'), CAZURI = (opt('--cazuri') ?? '').split(','), FILE = (opt('--file') || '').split('|').filter(Boolean);
const [ADRESA, IESIRE, LAT = '1440'] = arg;
if (!ADRESA || !IESIRE) { console.log('folosire: node tools/inventar-ecran.mjs <adresa> <iesire.json> [latime] [--cazuri ",demo=1"] [--file "A|B"] [--fata-de vechi.json]'); process.exit(2); }
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((c) => existsSync(c));
const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));
const lat = Number(LAT), mobil = lat < 700;
// butoane care SCHIMBĂ ceva — nu se apasă niciodată (pliurile da)
const INTERZIS = /păstrează|fixează|exportă|verifică|salvează|completează|rulează|pune |șterge|sterge|trimite|copiaz|instalează|conectează|sincroniz|scoate|adaug|★/i;

async function browser() {
  const port = 9600 + Math.floor(Math.random() * 300), profil = path.join(tmpdir(), 'inventar-' + port);
  const br = spawn(BROWSER, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 80 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); } catch {} if (!t) await asteapta(250); }
  if (!t) throw new Error('browserul nu a pornit');
  const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const m = new Map();
  const tr = (method, params = {}) => new Promise((res) => { const n = ++id; m.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  // cererile care se potrivesc cu --blocheaza (ex. cadrul scannerului) se opresc prin Fetch — Network.setBlockedURLs nu prindea cadrul
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && m.has(x.id)) { m.get(x.id)(x.result); m.delete(x.id); }
    if (x.method === 'Fetch.requestPaused') ws.send(JSON.stringify({ id: ++id, method: BLOCHEAZA.some((u) => x.params.request.url.includes(u)) ? 'Fetch.failRequest' : 'Fetch.continueRequest', params: { requestId: x.params.requestId, errorReason: 'BlockedByClient' } })); };
  await new Promise((r) => { ws.onopen = r; });
  await tr('Runtime.enable'); await tr('Page.enable');
  if (BLOCHEAZA.length) await tr('Fetch.enable', { patterns: [{ urlPattern: '*' }] });   // ex. scannerul, ca starea „fără date” să rămână fără date
  await tr('Emulation.setDeviceMetricsOverride', { width: lat, height: 1000, deviceScaleFactor: 1, mobile: mobil });
  const ev = async (x) => (await tr('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
  return { tr, ev, inchide: async () => { ws.close(); br.kill(); await asteapta(1200); try { rmSync(profil, { recursive: true, force: true }); } catch {} } };
}
const DESFA = `(() => { let n = 0;
  for (const d of document.querySelectorAll('details')) if (!d.open) { d.open = true; n++; }
  for (const b of document.querySelectorAll('button[aria-expanded="false"]')) { const t = (b.innerText || '').trim(); if (${INTERZIS}.test(t) || b.dataset.inventarApasat) continue; b.dataset.inventarApasat = '1'; b.click(); n++; }
  return n; })()`;
const CITESTE = `(() => {
  const vizibil = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const txt = (e) => (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim(), main = document.body;
  return { titluri: [...main.querySelectorAll('h1,h2,h3,h4,summary')].filter(vizibil).map(txt).filter(Boolean),
    butoane: [...main.querySelectorAll('button,a')].filter(vizibil).map(txt).filter(Boolean),
    campuri: [...main.querySelectorAll('input,select,textarea')].filter(vizibil).map((e) => e.getAttribute('aria-label') || e.placeholder || e.name || e.id || e.type),
    grafice: [...main.querySelectorAll('svg,canvas')].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 120 && r.height >= 60; }).length,
    text: main.innerText }; })()`;
const APASA = (eticheta) => `(() => { const b = [...document.querySelectorAll('button,[role=tab]')].find((x) => (x.innerText || '').replace(/\\s+/g, ' ').trim().toUpperCase() === ${JSON.stringify(eticheta.toUpperCase())}); if (!b) return false; b.click(); return true; })()`;
const norm = (t) => t.replace(/\s+/g, ' ').trim();
const fara = (t) => norm(t).replace(/[−-]?\d[\d.,]*/g, '#').replace(/#(\s*[:.\/]\s*#)+/g, '#');
const propozitii = (t) => [...new Set(t.split(/\n|(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ„])/).map(norm).filter((x) => x.length > 3).map(fara))];

const inventar = { adresa: ADRESA, latime: lat, la: new Date().toISOString(), cazuri: {} };
const b = await browser();
try {
  for (const caz of CAZURI) {
    await b.tr('Page.navigate', { url: ADRESA + (caz ? (ADRESA.includes('?') ? '&' : '?') + caz : '') });
    await asteapta(10000);
    const strans = { titluri: new Set(), butoane: new Set(), campuri: new Set(), grafice: 0, propozitii: new Set() };
    const citeste = async () => { for (let r = 0; r < 6; r++) { const n = await b.ev(DESFA); await asteapta(800); if (!n) break; } const c = await b.ev(CITESTE);
      c.titluri.forEach((x) => strans.titluri.add(fara(x))); c.butoane.forEach((x) => strans.butoane.add(fara(x))); c.campuri.forEach((x) => strans.campuri.add(x)); strans.grafice = Math.max(strans.grafice, c.grafice); propozitii(c.text).forEach((x) => strans.propozitii.add(x)); };
    await citeste();
    for (const f of FILE) { if (await b.ev(APASA(f))) { await asteapta(1500); await citeste(); } }
    const nume = caz || 'gol';
    inventar.cazuri[nume] = { titluri: [...strans.titluri], butoane: [...strans.butoane], campuri: [...strans.campuri], grafice: strans.grafice, propozitii: [...strans.propozitii] };
    console.log(`  ${nume}: ${strans.propozitii.size} propoziții · ${strans.titluri.size} titluri · ${strans.butoane.size} butoane · ${strans.campuri.size} câmpuri · ${strans.grafice} grafice`);
  }
} finally { await b.inchide(); }
mkdirSync(path.dirname(IESIRE), { recursive: true });
writeFileSync(IESIRE, JSON.stringify(inventar, null, 1));
console.log(`scris: ${IESIRE}`);

if (FATA) {
  const vechi = JSON.parse(readFileSync(FATA, 'utf8'));
  let lipsa = 0;
  for (const [caz, v] of Object.entries(vechi.cazuri)) {
    const n = inventar.cazuri[caz];
    if (!n) { console.log(`\n✗ ${caz}: cazul lipsește din pagina nouă`); lipsa++; continue; }
    const tot = new Set([...n.propozitii, ...n.titluri, ...n.butoane]), totText = [...tot].join(' | ');
    const lipsesc = (lista) => lista.filter((x) => !tot.has(x) && !totText.includes(x));
    const lp = lipsesc(v.propozitii), lt = lipsesc(v.titluri), lb = lipsesc(v.butoane), lc = v.campuri.filter((x) => !n.campuri.includes(x)), lg = Math.max(0, v.grafice - n.grafice);
    const s = lp.length + lt.length + lb.length + lc.length + lg; lipsa += s;
    console.log(`\n${s ? '✗' : '✓'} ${caz}: lipsesc ${lp.length} propoziții, ${lt.length} titluri, ${lb.length} butoane, ${lc.length} câmpuri, ${lg} grafice`);
    for (const x of [...lt, ...lp, ...lb].slice(0, 400)) console.log(`   ✗ ${x.slice(0, 160)}`);
    for (const x of lc) console.log(`   ✗ câmp: ${x}`);
  }
  console.log(lipsa ? `\n❌ NU e gata: ${lipsa} lucruri din ecranul vechi lipsesc` : '\n✅ NIMIC PIERDUT: tot ce era în ecranul vechi e și în cel nou');
  process.exit(lipsa ? 1 : 0);
}
