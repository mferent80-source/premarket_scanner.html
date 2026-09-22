// Cheama EL.enrichSectorsYahoo cu simboluri reale si cere SECTOARE, nu „a mers".
// Yahoo v10/quoteSummary da 401 Invalid Crumb din 22.09; asta verifica inlocuitorul.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9600 + Math.floor(Math.random() * 90);
const profil = `C:/Users/Cimin/AppData/Local/Temp/tt-sec-${port}`;
const b = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profil}`, '--window-size=1440,1200', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let t; for (let i = 0; i < 60 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page'); } catch {} if (!t) await w(250); }
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const m = new Map();
const s = (me, pa = {}) => new Promise(r => { const n = ++id; m.set(n, r); ws.send(JSON.stringify({ id: n, method: me, params: pa })); });
ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && m.has(d.id)) { m.get(d.id)(d.result); m.delete(d.id); } };
await new Promise(r => { ws.onopen = r; }); await s('Page.enable'); await s('Runtime.enable');
await s('Page.navigate', { url: 'http://127.0.0.1:8777/market-events/' }); await w(15000);
const ev = async (x) => (await s('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

console.log('EL incarcat?', await ev(`!!(window.EL && EL.enrichSectorsYahoo)`));
// harta locala se goleste, altfel raspunde din cache si proba nu masoara nimic
await ev(`(() => { try { for (const k of Object.keys(localStorage)) if (/el:sec|sectorMap|el_sector/i.test(k)) localStorage.removeItem(k); } catch(e){} return 1; })()`);
// Simbolurile din SECTOR_SEED sunt SARITE inadins (se stiu deja), deci o proba care
// le cere masoara lista fixa, nu reteaua. Prima varianta cerea XOM si JPM si a dat
// „2 din 4" - codul era bun, proba gresita.
const CERUTE = ['CROX', 'ELF', 'DKS', 'WSM'];
const r = await ev(`(async () => await EL.enrichSectorsYahoo(${JSON.stringify(CERUTE)}, {}))()`);
console.log('sectoare intoarse:', JSON.stringify(r));
const primite = CERUTE.filter((s) => r && r[s]);
ws.close(); b.kill(); await w(300); try { rmSync(profil, { recursive: true, force: true }); } catch {}
if (primite.length < CERUTE.length) {
  console.error('PICAT: %d din %d au primit sector (lipsesc: %s)',
    primite.length, CERUTE.length, CERUTE.filter((s) => !(r && r[s])).join(', '));
  process.exit(1);
}
console.log('OK - toate %d simbolurile au primit sector de la retea', CERUTE.length);
process.exit(0);
