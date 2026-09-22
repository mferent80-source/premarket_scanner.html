// AUDIT: s-a pierdut ceva pe drum? (22.09.2026)
//
// Ziua asta a mutat functii dintr-o pagina in alta si a sters doua pagini. Un „merge
// si acum" nu e de ajuns: intrebarea e daca fiecare lucru MUTAT se vede la destinatie
// si daca fiecare lucru STERS nu a lasat o gaura.
//
// Verifica pe ecran, nu in cod. Pentru fiecare lucru, o dovada anume - un text, o
// cifra, un element - nu simpla prezenta a paginii.
//
//   node tools/audit-mutari.mjs [gazda]

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const GAZDA = (process.argv[2] ?? 'http://127.0.0.1:8777').replace(/\/$/, '');
const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 40; i++) {
  try { if ((await fetch(GAZDA + '/lib/piata.js', { method: 'HEAD' })).ok) break; } catch {}
  await asteapta(250);
}

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9600 + Math.floor(Math.random() * 90);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-aud-${port}`;
const curata = () => { try { rmSync(profil, { recursive: true, force: true, maxRetries: 3 }); } catch {} };
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`, '--window-size=1600,1200', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let tinta;
for (let i = 0; i < 60 && !tinta; i++) {
  try { tinta = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!tinta) await asteapta(250);
}
if (!tinta) { console.error('browserul nu a pornit'); curata(); process.exit(2); }

const ws = new WebSocket(tinta.webSocketDebuggerUrl);
let id = 0; const asteptari = new Map(); let erori = [];
const s = (m, p = {}) => new Promise((r) => { const n = ++id; asteptari.set(n, r); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.id && asteptari.has(d.id)) { asteptari.get(d.id)(d.result); asteptari.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') erori.push((d.params.exceptionDetails?.exception?.description || '').slice(0, 150));
};
await new Promise((r) => { ws.onopen = r; });
await s('Runtime.enable'); await s('Page.enable');
const ev = async (x) => (await s('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
const text = () => ev(`document.body.innerText`);

const lipsa = [];
const cer = (ce, ok, dovada) => {
  console.log(`  ${ok ? '✅' : '❌'} ${ce}${dovada ? '  · ' + String(dovada).replace(/\s+/g, ' ').slice(0, 64) : ''}`);
  if (!ok) lipsa.push(ce);
};
const du = async (cale, ms) => { erori = []; await s('Page.navigate', { url: GAZDA + cale }); await asteapta(ms || 11000); };

console.log('\n  ── CE S-A MUTAT DIN COCKPIT ÎN HUB ──');
await du('/', 14000);
{
  const t = await text();
  cer('verdictul e pe hub', /RISC PORNIT|RISC OPRIT|SE CONTRAZIC|NIMIC CLAR|NU ȘTIU|Piața e închisă/i.test(t),
    (t.match(/RISC PORNIT|RISC OPRIT|SE CONTRAZIC|NIMIC CLAR|NU ȘTIU|Piața e închisă/i) || [''])[0]);
  const dovezi = await ev(`document.querySelectorAll('#dovezi .pf').length`);
  cer('cele 4 dovezi numărate', dovezi === 4, dovezi + ' dovezi');
  cer('rândul „ce fac acum"', /jumătate de mărime|mărime întreagă|stau|nu tranzacționez/i.test(t),
    (t.match(/(jumătate de mărime|mărime întreagă|stau[^\n]*|nu tranzacționez)[^\n·]*/i) || [''])[0]);
  cer('fereastra Macro (regim, VIX, curbă)', /MACRO/.test(t) && /VIX/.test(t) && /CURBA|Curba/.test(t));
  cer('fereastra Sectoare (toate 11)', (await ev(`document.querySelectorAll('#sectoare tbody tr').length`)) === 11);
  cer('fereastra Piața (SPY, QQQ)', /SPY/.test(t) && /QQQ/.test(t));
  cer('fereastra Calendar', /CALENDAR/.test(t));
  cer('fereastra „Se mișcă acum" (pump)', /SE MIȘCĂ ACUM/i.test(t));
  cer('fereastra „Raportează" (earnings)', /RAPORTEAZĂ/i.test(t));
  cer('link către hub clasic', (await ev(`!!document.querySelector('a[href*="hub-clasic"]')`)));
}

console.log('\n  ── CE S-A ÎNTORS ÎN PUMP RADAR ──');
await du('/pump-radar/', 13000);
{
  cer('lista celor 24', (await ev(`document.querySelectorAll('tr[data-sym]').length`)) === 24);
  await ev(`document.querySelector('tr[data-sym]')?.click()`);
  await asteapta(2200);
  const d = await ev(`document.querySelector('tr.desfacut')?.innerText ?? ''`);
  cer('backtest (tabel cu orizonturi)', /15 min/.test(d) && /30 min/.test(d) && /60 min/.test(d));
  cer('backtest are verdict', /Edge|edge|Prea puține semnale/i.test(d));
  cer('secțiunea insider', /interior/i.test(d));
  cer('secțiunea AI', /AI/.test(d));
  cer('praguri reglabile', (await ev(`!!document.getElementById('thrMove')`)));
  cer('link varianta veche', (await ev(`!!document.querySelector('a[href*="clasic"]')`)));
}

console.log('\n  ── CE S-A ÎNTORS ÎN EARNINGS ──');
await du('/earnings-hub/', 11000);
{
  const t = await text();
  const cheie = await ev(`!!(window.EARN && EARN.cheie && EARN.cheie())`);
  cer('modulul EARN.istoric există', (await ev(`typeof (window.EARN && EARN.istoric)`)) === 'function');
  cer('ferestrele 7/14/30 zile', (await ev(`document.querySelectorAll('#zile button').length`)) === 3);
  cer(cheie ? 'calendarul are rânduri' : 'fără cheie: o cere, nu tace',
    cheie ? (await ev(`document.querySelectorAll('.rand[data-sym]').length`)) > 0 : /cheia|Finnhub/i.test(t));
  cer('link varianta veche', (await ev(`!!document.querySelector('a[href*="clasic"]')`)));
}

console.log('\n  ── PAGINILE VECHI, PĂSTRATE ──');
for (const [cale, ce] of [['/hub-clasic/', 'hub clasic'], ['/pump-radar/clasic.html', 'pump clasic'], ['/earnings-hub/clasic.html', 'earnings clasic']]) {
  await du(cale, 9000);
  const n = await ev(`(document.body.innerText || '').length`);
  cer(ce + ' se încarcă', n > 400, n + ' caractere');
}

console.log('\n  ── CE AM ȘTERS: a rămas vreun link mort? ──');
await du('/', 12000);
{
  const moarte = await ev(`(() => {
    const re = /(cockpit|router)\\//;
    return [...document.querySelectorAll('a[href]')]
      .filter(a => re.test(a.getAttribute('href') || ''))
      .filter(a => a.offsetParent)
      .map(a => (a.innerText || '').trim().slice(0, 20) + ' -> ' + a.getAttribute('href'));
  })()`);
  cer('hub: niciun link către paginile șterse', (moarte || []).length === 0, (moarte || []).join(' | '));
}

ws.close(); browser.kill(); await asteapta(400); curata();
console.log(lipsa.length ? `\n  ${lipsa.length} LUCRURI LIPSĂ:\n` + lipsa.map((x) => '   · ' + x).join('\n') + '\n'
                         : '\n  nimic pierdut pe drum\n');
process.exit(lipsa.length ? 1 : 0);
