// CE S-A PIERDUT LA RESCRIERE? (22.09.2026)
//
// Raspunde la intrebarea „avem tot cum era, fara pierderi?" - cu o lista, nu cu o
// impresie. Compara fiecare varianta noua cu `clasic.html`-ul ei dupa CAPABILITATI,
// nu dupa numar de linii: fiecare capabilitate are un tipar de cautare si e numarata
// in ambele fisiere.
//
// De ce nu ajunge „merge si acum": o pagina care se incarca si arata cifre poate sa
// fi pierdut pe drum alarma care te anunta cand nu esti pe ea. Primul meu audit de
// azi verifica doar ce DECLARASEM eu ca am mutat - si trecea tot verde.
//
//   node tools/ce-lipseste.mjs

import { readFileSync, existsSync } from 'node:fs';

const PERECHI = [
  { nume: 'Pump Radar', vechi: 'pump-radar/clasic.html', nou: ['pump-radar/index.html', 'lib/pump.js'] },
  { nume: 'Earnings',   vechi: 'earnings-hub/clasic.html', nou: ['earnings-hub/index.html', 'lib/earnings.js'] },
  { nume: 'Hub',        vechi: 'hub-clasic/index.html', nou: ['index.html', 'lib/piata.js'] },
];

// Fiecare capabilitate: ce inseamna pentru om + cum se recunoaste in cod.
//
// ATENTIE: tiparul trebuie sa prinda si implementarea VECHE si pe cea NOUA. Prima
// versiune cauta `new Notification` si `AudioContext` - adica exact cum era scris in
// pagina veche - si raporta „LIPSESTE" dupa ce paginile noi au trecut pe modulele
// suitei (NT., SND., TG., WL.). O rigla care cauta o singura forma masoara forma,
// nu capabilitatea.
//
// A TREIA capcana, in directia CEALALTA: tiparele pe cuvinte („insider", „backtest")
// numarau si TEXTUL descriptiv. hub-clasic avea 12 astfel de aparitii - toate in
// catalogul de tool-uri, inclusiv randul „Pump Radar - MUTAT pe pagina dedicata (HMM
// + insider + backtest)" - dar ZERO apeluri si zero <script src> catre module. Rigla
// raporta „LIPSESTE" pentru ceva ce nu existase niciodata acolo.
// De aceea tiparele cauta acum APELURI (`INS.fetchTx`) si INCARCARI (`lib/insider.js`),
// nu cuvinte.
const CAPABILITATI = [
  { ce: 'auto-scan la interval',      re: /setInterval|autoSec|autoSel|porne\u0219teAuto|AUTO_MS/gi },
  { ce: 'notificări browser',         re: /new Notification|Notification\.requestPermission|notifBtn|NT\.(show|isOn|enable|disable|toggle)/gi },
  { ce: 'sunet la alertă',            re: /soundBtn|wl_sound|SOUND_KEY|playBeep|AudioContext|SND\.(beep|isEnabled|toggle)/gi },
  { ce: 'alerte Telegram',            re: /telegram|tgSave|tgChatId|TG_KEY|TG\.(send|getConfig|setConfig|test)/gi },
  { ce: 'watchlist (⭐)',              re: /wl_stocks|watchlist|toggleWl|WL\.(has|toggle|add|remove|get)|data-wl/gi },
  { ce: 'verdict insider',            re: /INS\.(fetchTx|analyze|classify)|lib\/insider\.js/gi },
  { ce: 'backtest semnal',            re: /BT\.(signal|verdict|horizonSweep)|lib\/backtest\.js/gi },
  { ce: 'notă AI',                    re: /AI\.(complete|stream|hasKey)|lib\/ai\.js/gi },
  { ce: 'filtru de regim (Markov)',   re: /__marketRegime|MK\.fitHMM|isVol/gi },
  { ce: 'praguri reglabile',          re: /thrMove|thrVol|thrPrice/gi },
  { ce: 'rând care se desface',       re: /toggleExpand|expanded-row|desfacut|\.det\b/gi },
  { ce: 'istoric reacții earnings',   re: /fetchReactionBias|EARN\.istoric/gi },
  { ce: 'filtre pe listă',            re: /filterBy|applyFilter|\bfiltru\b|data-filter/gi },
  { ce: 'trezire la poll (wake)',     re: /poll-wake|pollWake|PW\./gi },
  { ce: 'export / copiere',           re: /toCSV|download|clipboard/gi },
  { ce: 'setări proprii paginii',     re: /Setări|settingsPanel|cfgPanel|salveazaPraguri|pragurile se salveaz|cheie-btn|finnhub_api_key.*setItem/gi },
];

function numara(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

let totalLipsa = 0;
for (const p of PERECHI) {
  if (!existsSync(p.vechi)) { console.log(`\n  ${p.nume}: nu am cu ce compara (${p.vechi} lipseste)`); continue; }
  const vechi = readFileSync(p.vechi, 'utf8');
  const nou = p.nou.filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');

  console.log(`\n  ── ${p.nume} ── (${p.vechi} → ${p.nou.join(' + ')})`);
  const lipsa = [];
  for (const c of CAPABILITATI) {
    const a = numara(vechi, c.re), b = numara(nou, c.re);
    if (a === 0) continue;                 // n-a existat nici inainte
    const stare = b === 0 ? 'LIPSEȘTE' : (b < a / 4 ? 'parțial' : 'are');
    if (b === 0) { lipsa.push(c.ce); totalLipsa++; }
    const semn = b === 0 ? '❌' : (stare === 'parțial' ? '⚠️ ' : '✅');
    console.log(`  ${semn} ${c.ce.padEnd(28)} vechi ${String(a).padStart(3)} · nou ${String(b).padStart(3)}  ${stare}`);
  }
  if (!lipsa.length) console.log('     (nimic din ce se putea masura nu lipseste)');
}

console.log(totalLipsa
  ? `\n  ${totalLipsa} CAPABILITĂȚI LIPSESC cu totul.\n`
  : '\n  nimic nu lipseste cu totul\n');
process.exit(totalLipsa ? 1 : 0);
