// Cele 7 comenzi mutate sub butonul ⚙ din market-events chiar functioneaza acolo?
//
// Mutarea s-a facut fara sa se scoata nimic din DOM (doar infasurate intr-un
// <details>), tocmai ca legaturile JS pe id sa ramana. Dar „n-am scos nimic din DOM"
// e o afirmatie despre cod, nu despre ecran: proba DESCHIDE panoul, se uita ca
// fiecare comanda e vizibila, si APASA una ca sa vada ca inca deschide ceva.
//
//   node tools/proba-setari-me.mjs
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9450 + Math.floor(Math.random() * 40);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-set-${port}`;
const b = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`, '--window-size=1440,1200', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let t; for (let i = 0; i < 60 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page'); } catch {} if (!t) await w(250); }
if (!t) { console.error('browserul nu a pornit'); process.exit(2); }
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const m = new Map();
const s = (me, pa = {}) => new Promise(r => { const n = ++id; m.set(n, r); ws.send(JSON.stringify({ id: n, method: me, params: pa })); });
ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && m.has(d.id)) { m.get(d.id)(d.result); m.delete(d.id); } };
await new Promise(r => { ws.onopen = r; }); await s('Page.enable'); await s('Runtime.enable');
await s('Page.navigate', { url: 'http://127.0.0.1:8777/market-events/' });

const ev = async (x) => (await s('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
let gata = false;
for (let i = 0; i < 60 && !gata; i++) { gata = await ev(`!!document.querySelector('details.setari')`); if (!gata) await w(500); }
if (!gata) { console.error('PICAT: butonul ⚙ nu exista pe pagina'); ws.close(); b.kill(); process.exit(1); }

const greseli = [];

// 1) inchis, comenzile NU trebuie sa fie pe primul ecran.
//
// `offsetParent` NU e bun aici: un <details> inchis isi ascunde continutul cu
// `content-visibility`, care lasa elementul cu cutie (295x300) si cu offsetParent
// nenul, desi nu se deseneaza. Prima varianta a probei a raportat „panoul se vede"
// pentru un panou care nu se vedea. Se intreaba `checkVisibility()`, si in plus
// `elementFromPoint` - adica ce ar apasa degetul acolo.
const inchis = await ev(`(() => {
  const d = document.querySelector('details.setari');
  const p = d.querySelector('.setari-panou');
  const r = p.getBoundingClientRect();
  const sus = document.elementFromPoint(Math.round(r.left + 5), Math.round(r.top + 5));
  return {
    deschis: d.open,
    panouVizibil: p.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
    panouApasabil: !!(sus && p.contains(sus)),
    sumarVizibil: d.querySelector('summary').checkVisibility()
  };
})()`);
console.log('  inchis ->', JSON.stringify(inchis));
if (inchis.deschis) greseli.push('panoul e deschis din start');
if (inchis.panouVizibil) greseli.push('panoul se vede desi <details> e inchis');
if (inchis.panouApasabil) greseli.push('panoul prinde clicuri desi <details> e inchis');
if (!inchis.sumarVizibil) greseli.push('butonul ⚙ nu se vede');

// 2) deschis, fiecare din cele 7 comenzi trebuie sa fie acolo SI vizibila
await ev(`(() => { document.querySelector('details.setari').open = true; return 1; })()`);
await w(500);
const CERUTE = [
  ['ghid', 'a[href*="page=market-events"]'],
  ['functionalitati', 'button[onclick*="showMeFeatures"]'],
  ['proxy', '#proxyUrl'],
  ['sizer', 'button[onclick*="showPositionSizer"]'],
  ['analize salvate', 'button[onclick*="showSavedAnalyses"]'],
  ['AI scan', '#autoScanSel'],
  ['cheia AI', '#aiKeyBtn'],
];
const deschis = await ev(`(() => {
  const cer = ${JSON.stringify(CERUTE)};
  return cer.map(([n, sel]) => { const e = document.querySelector(sel); return { n, exista: !!e, seVede: !!(e && e.checkVisibility({ contentVisibilityAuto: true })) }; });
})()`);
for (const c of deschis) {
  console.log('  ' + (c.seVede ? 'OK  ' : 'LIPSA') + '  ' + c.n);
  if (!c.exista) greseli.push(c.n + ': elementul nu mai exista in DOM');
  else if (!c.seVede) greseli.push(c.n + ': exista dar nu se vede in panou');
}

// 3) proxy-ul si-a pastrat valoarea (JS-ul o citeste de acolo)
const proxy = await ev(`(document.getElementById('proxyUrl')||{}).value || ''`);
console.log('  valoarea proxy ->', JSON.stringify(String(proxy).slice(0, 48)));
if (!/^https?:\/\//.test(String(proxy))) greseli.push('campul proxy e gol sau stricat');

// 4) o comanda chiar face ceva: cheia AI trebuie sa deschida o fereastra
await ev(`(() => { document.getElementById('aiKeyBtn').click(); return 1; })()`);
await w(900);
const modal = await ev(`!!document.querySelector('.ai-modal-bg, .modal-bg, [class*="modal"]')`);
console.log('  apasat „cheia AI" -> fereastra deschisa:', modal);
if (!modal) greseli.push('butonul cheii AI nu mai deschide nimic');

ws.close(); b.kill(); await w(300); try { rmSync(profil, { recursive: true, force: true }); } catch {}
if (greseli.length) { console.error('\nPICAT:'); for (const g of greseli) console.error('  - ' + g); process.exit(1); }
console.log('\nOK - cele 7 comenzi sunt sub ⚙, ascunse cand e inchis, intregi cand se deschide.');
process.exit(0);
