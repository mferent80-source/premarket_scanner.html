// PROBA RANDULUI CARE SE DESFACE (22.09.2026)
//
// Lucrurile scoase la rescriere - backtest, insider, nota AI - s-au intors in randul
// care se desface la click pe un simbol. Garda asta verifica DACA SE VEDE, nu daca
// exista in cod: apasa un rand, cere ca randul de detalii sa apara, si cere ca
// sectiunea de backtest sa contina CIFRE, nu doar titlul.
//
// Un „se calculeaza..." ramas pe ecran trece de orice verificare care se uita doar
// dupa titlu - de asta cere aici un procent si un numar de semnale.
//
//   node tools/proba-detalii.mjs [gazda]

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAZDA = (process.argv[2] ?? 'http://127.0.0.1:8777').replace(/\/$/, '');
const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

// Serverul trebuie sa fie GATA inainte de prima cerere. Fara asta, o proba pornita
// imediat dupa repornirea lui raporta „modulul de backtest nu e incarcat" - adica un
// esec inventat de nerabdarea ei, nu de pagina. O garda care minte asa e mai rea
// decat lipsa ei: te invata sa-i ignori rosul.
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(GAZDA + '/lib/backtest.js', { method: 'HEAD' });
    if (r.ok) break;
  } catch {}
  await asteapta(250);
}

const port = 9050 + Math.floor(Math.random() * 90);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-det-${port}`;
const curata = () => { try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch {} };
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`, '--window-size=1440,1200', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let tinta;
for (let i = 0; i < 60 && !tinta; i++) {
  try { tinta = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!tinta) await asteapta(250);
}
if (!tinta) { console.error('browserul nu a pornit'); curata(); process.exit(2); }

const ws = new WebSocket(tinta.webSocketDebuggerUrl);
let id = 0; const asteptari = new Map(); const erori = [];
const s = (m, p = {}) => new Promise((r) => { const n = ++id; asteptari.set(n, r); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.id && asteptari.has(d.id)) { asteptari.get(d.id)(d.result); asteptari.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') erori.push((d.params.exceptionDetails?.exception?.description || '').slice(0, 200));
};
await new Promise((r) => { ws.onopen = r; });
await s('Runtime.enable'); await s('Page.enable');
const ev = async (x) => (await s('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

const probleme = [];
const cer = (ce, ok, detaliu) => {
  console.log(`  ${ok ? '✅' : '❌'} ${ce}${detaliu ? ' · ' + detaliu : ''}`);
  if (!ok) probleme.push(ce);
};

await s('Page.navigate', { url: GAZDA + '/pump-radar/' });
await asteapta(12000);

const nrRanduri = await ev(`document.querySelectorAll('tr[data-sym]').length`);
cer('lista are rânduri', nrRanduri > 0, nrRanduri + ' simboluri');

if (nrRanduri > 0) {
  const sym = await ev(`document.querySelector('tr[data-sym]').dataset.sym`);
  await ev(`document.querySelector('tr[data-sym]').click()`);
  await asteapta(1200);

  cer('rândul se desface', (await ev(`document.querySelectorAll('tr.desfacut').length`)) === 1, sym);
  cer('are cele trei secțiuni',
    (await ev(`document.querySelectorAll('tr.desfacut .det > div').length`)) === 3);

  // backtest-ul trebuie sa contina CIFRE, nu doar titlul: un „se calculeaza..." ramas
  // pe ecran ar trece de o verificare care cauta doar sectiunea
  const bt = await ev(`document.getElementById('d-bt')?.innerText ?? ''`);
  cer('backtest are cifre', /\d+\s*min/.test(bt) && /%/.test(bt), bt.replace(/\s+/g, ' ').slice(0, 70));
  cer('backtest are verdict', /Edge|edge|semnal|Prea puține/i.test(bt));

  // insider si AI: fara chei, trebuie sa spuna DE CE, nu sa taca
  const ins = await ev(`document.getElementById('d-ins')?.innerText ?? ''`);
  cer('insider spune ceva', ins.trim().length > 3 && ins.trim() !== '…', ins.replace(/\s+/g, ' ').slice(0, 60));
  const ai = await ev(`document.getElementById('d-ai')?.innerText ?? ''`);
  cer('AI spune ceva', ai.trim().length > 3, ai.replace(/\s+/g, ' ').slice(0, 60));

  // al doilea click pe acelasi rand il inchide
  await ev(`document.querySelector('tr[data-sym]').click()`);
  await asteapta(600);
  cer('al doilea click închide', (await ev(`document.querySelectorAll('tr.desfacut').length`)) === 0);
}

// ── Earnings: acelasi tipar, click pe un simbol din calendar ──
await s('Page.navigate', { url: GAZDA + '/earnings-hub/' });
await asteapta(9000);
const areCheie = await ev(`!!(window.EARN && EARN.cheie && EARN.cheie())`);
const randuri = await ev(`document.querySelectorAll('.rand[data-sym]').length`);
if (!areCheie) {
  console.log(`  ⚪ Earnings: fara cheie Finnhub in acest profil, deci lista e goala - normal`);
  cer('Earnings cere cheia in loc sa taca',
    /cheia|Finnhub/i.test(await ev(`document.body.innerText`)));
} else {
  cer('calendarul are rânduri', randuri > 0, randuri + ' raportări');
  if (randuri > 0) {
    const sym2 = await ev(`document.querySelector('.rand[data-sym]').dataset.sym`);
    await ev(`document.querySelector('.rand[data-sym]').click()`);
    await asteapta(6000);
    cer('istoricul se desface', (await ev(`document.querySelectorAll('.det').length`)) === 1, sym2);
    const h = await ev(`document.getElementById('d-h')?.innerText ?? ''`);
    cer('istoricul are cifre', /%/.test(h) || /nu ştiu|nu știu/.test(h), h.replace(/\s+/g, ' ').slice(0, 70));
  }
}

for (const e of erori) cer('fără excepții', false, e);

ws.close(); browser.kill(); await asteapta(400); curata();
console.log(probleme.length ? `\n  ${probleme.length} PROBLEME\n` : '\n  detaliile se văd\n');
process.exit(probleme.length ? 1 : 0);
