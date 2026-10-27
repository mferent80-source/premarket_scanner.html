// 27.10.2026 (I-760): inventarul gărzilor și modelelor, GENERAT DIN COD (SR 11-7: ce există, cine îl dovedește viu, când s-a validat).
// Gărzile = fiecare motiv care schimbă verdictul Governor (reasons.push în computeStatus, inclusiv textele din textLuna / textOprire /
// textReconciliere) și fiecare bad()/warn() din contul Trading 212. Pentru fiecare: testul care o DECLANȘEAZĂ = testul din tools/*.test.mjs
// care verifică motivul ei (o bucată de 4+ cuvinte din mesaj, unică printre gărzi). O gardă fără test = „FĂRĂ TEST” ⇒ testul de acoperire
// (tools/inventar-garzi.test.mjs) e roșu. Folosire:
//   node tools/inventar-garzi.mjs            ⇒ scrie docs/inventar-modele.md
//   node tools/inventar-garzi.mjs --verifica ⇒ iese cu 1 dacă documentul e vechi sau o gardă n-are test (nu scrie nimic)
//   node tools/inventar-garzi.mjs --ruleaza  ⇒ rulează testele care declanșează gărzile și scrie data validării (rularea trimestrială)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DOC = 'docs/inventar-modele.md';
export const SURSE = [
  { fisier: 'lib/governor.js', modul: 'Governor (jurnal manual + verdictul comun)', fel: 'governor' },
  { fisier: 'lib/trading212-capital.js', modul: 'Contul Trading 212 (T212Capital)', fel: 'apel', nume: ['bad', 'warn'] }
];
// modelele aplicației: ce sunt, unde stau, cum se judecă (protocolul) — fișierele trebuie să existe, altfel generatorul se oprește
export const MODELE = [
  { nume: 'Verdictul pieței (favorabil / neutru / prudent / defensiv)', fisier: 'lib/market-verdict.js', protocol: 'docs/verdict-piata-protocol.md', stare: 'regulă de prudență aleasă de el (18.10), nu avantaj dovedit' },
  { nume: 'Proba premarket Top Long', fisier: 'lib/premarket-proba.mjs', protocol: 'docs/premarket-proba-protocol.md', stare: 'în probă — judecata și puterea în protocol' },
  { nume: 'Proba Reguli V1', fisier: 'lib/v1-proba.mjs', protocol: 'docs/v1-proba-protocol.md', stare: 'în probă' },
  { nume: 'Umbra stopului Reversal', fisier: 'lib/reversal-umbra.mjs', protocol: 'docs/reversal-stop-umbra-protocol.md', stare: 'în probă' },
  { nume: 'Clasificatorul Long / Hold / Short', fisier: 'lib/holdings-classifier.js', protocol: 'docs/clasificator-protocol.md', stare: 'în probă — versiunile în docs/clasificator-versiuni.md' },
  { nume: 'Căldura portofoliului + corelația', fisier: 'lib/caldura-portofoliu.js', protocol: 'docs/politica-de-risc.md', stare: 'prag prudent, nu optim' },
  { nume: 'Bootstrap pe blocuri „Cât de sigur” (Raport)', fisier: 'lib/journal-report.js', protocol: 'docs/politica-de-risc.md', stare: 'mulberry32, sămânță fixă; verdict doar de la n ≥ 30' },
  { nume: 'Detectoarele de comportament + Tiltmeter (Raport, I-761)', fisier: 'lib/journal-comportament.js', protocol: 'docs/politica-adaugiri-C.md', stare: 'convenții deterministe, nu avantaj dovedit' }
];

// ---------- citirea codului: argumentele apelurilor, cu ghilimele, șabloane și paranteze ----------
function argument(src, i) { // i = poziția de după „(”; întoarce [text, sfârșit]
  let d = 1, j = i;
  while (j < src.length && d > 0) {
    const c = src[j];
    if (c === "'" || c === '"') { j = sfarsitSir(src, j); continue; }
    if (c === '`') { j = sfarsitSablon(src, j); continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    j++;
  }
  return [src.slice(i, j - 1), j];
}
function sfarsitSir(src, j) { const q = src[j]; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } return j + 1; }
function sfarsitSablon(src, j) {
  j++;
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '$' && src[j + 1] === '{') { let d = 1; j += 2; while (j < src.length && d > 0) { const c = src[j]; if (c === "'" || c === '"') { j = sfarsitSir(src, j); continue; } if (c === '`') { j = sfarsitSablon(src, j); continue; } if (c === '{') d++; else if (c === '}') d--; j++; } continue; }
    j++;
  }
  return j + 1;
}
/** Bucățile fixe de text dintr-o expresie (literalele '…' / "…" și părțile fixe ale șabloanelor `…${x}…`). */
export function bucatiFixe(expr) {
  const out = [];
  for (let j = 0; j < expr.length;) {
    const c = expr[j];
    if (c === "'" || c === '"') { const e = sfarsitSir(expr, j); out.push(expr.slice(j + 1, e - 1)); j = e; continue; }
    if (c === '`') {
      const e = sfarsitSablon(expr, j); let k = j + 1, cur = '';
      while (k < e - 1) { if (expr[k] === '$' && expr[k + 1] === '{') { out.push(cur); cur = ''; let d = 1; k += 2; while (k < e - 1 && d > 0) { if (expr[k] === '{') d++; else if (expr[k] === '}') d--; k++; } continue; } cur += expr[k]; k++; }
      out.push(cur); j = e; continue;
    }
    j++;
  }
  return out.map((s) => s.replace(/\\(.)/g, '$1')).filter((s) => s.trim().length);
}
const linia = (src, i) => src.slice(0, i).split('\n').length;
function corpFunctie(src, nume) {
  const i = src.indexOf('function ' + nume + '(');
  if (i < 0) return null;
  const a = src.indexOf('{', src.indexOf(')', i));
  let d = 1, j = a + 1;
  while (j < src.length && d > 0) { const c = src[j]; if (c === "'" || c === '"') { j = sfarsitSir(src, j); continue; } if (c === '`') { j = sfarsitSablon(src, j); continue; } if (c === '{') d++; else if (c === '}') d--; j++; }
  return { text: src.slice(a + 1, j - 1), de: a + 1 };
}
function efect(enunt) {
  if (/verdict\s*=\s*'HALTED'/.test(enunt)) return 'HALTED';
  if (/verdict\s*=\s*'NEVERIFICAT'/.test(enunt)) return 'NEVERIFICAT';
  if (/verdict\s*=\s*'CAUTION'/.test(enunt)) return 'CAUTION';
  return null;
}
/** Gărzile dintr-un fișier sursă. */
export function garzi(src, sursa) {
  const out = [];
  if (sursa.fel === 'governor') {
    const cs = corpFunctie(src, 'computeStatus');
    if (!cs) throw Error('computeStatus lipsește din ' + sursa.fisier);
    const re = /reasons\.push\(/g; let m;
    while ((m = re.exec(cs.text))) {
      const [arg] = argument(cs.text, m.index + m[0].length), abs = cs.de + m.index;
      // enunțul: de la începutul rândului (sau al blocului if) până la apel ⇒ efectul asupra verdictului
      const inceput = Math.max(cs.text.lastIndexOf('\n', m.index), 0), enunt = cs.text.slice(Math.max(0, inceput - 260), m.index);
      const ultimIf = enunt.lastIndexOf('if ('), fereastra = ultimIf >= 0 ? enunt.slice(ultimIf) : enunt.slice(-160);
      let ef = efect(fereastra);
      if (/^\.\.\.broker\.reasons/.test(arg.trim())) { out.push({ fisier: sursa.fisier, modul: sursa.modul, linie: linia(src, abs), efect: 'după contul Trading 212', mesaj: 'motivele contului Trading 212 („Invest: …”)', bucati: [], delegat: 'lib/trading212-capital.js' }); continue; }
      if (/^\.\.\.broker\.notes/.test(arg.trim())) continue; // notele nu schimbă verdictul
      if (/^o\.stare === 'activ'/.test(arg.trim())) continue; // relaxările de limite: notă, verdictul nu se schimbă
      const fn = /^(text[A-Z]\w*)\(/.exec(arg.trim());
      if (fn) {
        const corp = corpFunctie(src, fn[1]);
        const rets = corp ? [...corp.text.matchAll(/return\s+(`(?:\\.|[^`\\])*`)/g)] : [];
        for (const r of rets) {
          const b = bucatiFixe(r[1]), cond = corp.text.slice(Math.max(0, r.index - 120), r.index);
          const st = /stare === '(\w+)'/.exec(cond.split('\n').pop() || '')?.[1];
          out.push({ fisier: sursa.fisier, modul: sursa.modul, linie: linia(src, corp.de + r.index), efect: fn[1] === 'textLuna' ? (st === 'depasit' ? 'HALTED' : 'CAUTION') : fn[1] === 'textOprire' ? 'HALTED' : 'CAUTION', mesaj: b.join('…').trim(), bucati: b });
        }
        continue;
      }
      if (!ef && /Oprirea de urgență .* a fost re-armată/.test(bucatiFixe(arg).join(' '))) continue; // notă 24 h după re-armare
      out.push({ fisier: sursa.fisier, modul: sursa.modul, linie: linia(src, abs), efect: ef || 'notă', mesaj: bucatiFixe(arg).join('…').trim(), bucati: bucatiFixe(arg) });
    }
  } else {
    const re = new RegExp('(?<![\\w.])(' + sursa.nume.join('|') + ')\\(', 'g'); let m;
    while ((m = re.exec(src))) {
      const dupa = src.slice(m.index + m[0].length, m.index + m[0].length + 12);
      if (/^\s*\w+\s*\)\s*=>/.test(dupa) || /^\s*m\s*\)/.test(dupa)) continue; // definiția (bad=(m)=>…)
      const [arg] = argument(src, m.index + m[0].length);
      let b = bucatiFixe(arg);
      const fnA = /^\s*(text[A-Z]\w*)\(/.exec(arg); // warn(textReconciliere(r)): textul vine din funcția din același fișier
      if (!b.length && fnA) { const corp = corpFunctie(src, fnA[1]); b = corp ? bucatiFixe(corp.text).filter((x) => x.trim().length >= 3) : []; }
      if (!b.length) continue;
      out.push({ fisier: sursa.fisier, modul: sursa.modul, linie: linia(src, m.index), efect: m[1] === 'bad' ? 'HALTED' : 'CAUTION', mesaj: b.join('…').trim(), bucati: b });
    }
  }
  const vazute = new Set(); // textLuna e chemat din două ramuri: aceeași gardă o singură dată
  return out.filter((x) => (x.delegat || x.mesaj.length >= 6) && !vazute.has(x.fisier + ':' + x.linie) && vazute.add(x.fisier + ':' + x.linie));
}

// ---------- testele care declanșează: eticheta «modul · fragment» din numele testului ----------
// Fiecare test de declanșare (tools/garzi-declansare.test.mjs, sau orice alt test) poartă în nume eticheta gărzii pe care o declanșează:
// «governor · Pierdere zilnică». Modulul = numele fișierului sursă fără .js; fragmentul = o bucată din motiv care trebuie să fie în mesajul
// UNEI singure gărzi din acel modul. Legătura e deterministă (nu ghicită din cuvinte): o etichetă care nu prinde nicio gardă sau prinde
// două e o greșeală și testul de acoperire o spune.
const norm = (s) => String(s).replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim();
const baza = (f) => f.split('/').pop().replace(/\.(m?js)$/, '');
export function teste(dir = join(ROOT, 'tools'), exclude = ['inventar-garzi.test.mjs']) {
  return readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && !exclude.includes(f)).map((f) => {
    const src = readFileSync(join(dir, f), 'utf8'), nume = [];
    for (const m of src.matchAll(/\btest\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) nume.push(m[2].replace(/\\(.)/g, '$1'));
    return { fisier: 'tools/' + f, nume };
  });
}
export function etichete(tst) {
  const out = [];
  for (const t of tst) for (const n of t.nume) for (const m of n.matchAll(/«([^»·]+?)\s*·\s*([^»]+)»/g)) out.push({ fisier: t.fisier, nume: n, modul: m[1].trim(), fragment: norm(m[2]) });
  return out;
}
/** Pentru fiecare gardă: testele care o declanșează (după etichetă); plus etichetele orfane și cele ambigue. */
export function acoperire(lista, tst) {
  const et = etichete(tst), potriviri = new Map(lista.map((g) => [g, []])), orfane = [], ambigue = [];
  for (const e of et) {
    const prinse = lista.filter((g) => !g.delegat && baza(g.fisier) === e.modul && g.bucati.some((b) => norm(b).includes(e.fragment)) || (!g.delegat && baza(g.fisier) === e.modul && norm(g.mesaj).includes(e.fragment)));
    if (!prinse.length) orfane.push(e); else if (prinse.length > 1) ambigue.push({ ...e, garzi: prinse.map((g) => g.fisier + ':' + g.linie) }); else potriviri.get(prinse[0]).push({ fisier: e.fisier, nume: e.nume });
  }
  const garziCuTeste = lista.map((g) => (g.delegat ? { ...g, teste: [{ fisier: g.delegat, nume: 'fiecare gardă a contului, mai jos' }] } : { ...g, teste: potriviri.get(g) }));
  garziCuTeste.orfane = orfane; garziCuTeste.ambigue = ambigue;
  return garziCuTeste;
}

// ---------- documentul ----------
const escMd = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function genereaza({ root = ROOT, validari = null } = {}) {
  const lista = [];
  for (const s of SURSE) lista.push(...garzi(readFileSync(join(root, s.fisier), 'utf8'), s));
  const ac = acoperire(lista, teste(join(root, 'tools')));
  for (const m of MODELE) for (const f of [m.fisier, m.protocol]) if (!existsSync(join(root, f))) throw Error('Modelul „' + m.nume + '” trimite la un fișier care nu există: ' + f);
  const fara = ac.filter((g) => !g.teste.length);
  let md = '# Inventarul modelelor și gărzilor — Decision App\r\n\r\n';
  md += '> GENERAT de `node tools/inventar-garzi.mjs` din cod (nu se editează de mână). I-760 / SR 11-7: fiecare gardă cu testul care o declanșează; ';
  md += '`tools/inventar-garzi.test.mjs` e roșu dacă o gardă nouă n-are test sau dacă documentul nu mai e la zi. Rularea trimestrială: `node tools/inventar-garzi.mjs --ruleaza` (scrie data și rezultatul).\r\n\r\n';
  md += `**${ac.length} gărzi** · ${ac.length - fara.length} cu test care le declanșează · ${fara.length} fără test.\r\n\r\n`;
  md += '## Modele\r\n\r\n| Model | Fișier | Protocol | Stare / limite de folosire |\r\n|---|---|---|---|\r\n';
  for (const m of MODELE) md += `| ${escMd(m.nume)} | \`${m.fisier}\` | \`${m.protocol}\` | ${escMd(m.stare)} |\r\n`;
  for (const s of SURSE) {
    const g = ac.filter((x) => x.fisier === s.fisier);
    md += `\r\n## Gărzi · ${escMd(s.modul)} (\`${s.fisier}\`, ${g.length})\r\n\r\n| # | Efect | Motivul (bucățile fixe) | Testul care o declanșează |\r\n|---|---|---|---|\r\n`;
    g.forEach((x, i) => { md += `| ${i + 1} | ${x.efect} | ${escMd(x.mesaj.slice(0, 160))} | ${x.teste.length ? x.teste.slice(0, 2).map((t) => '`' + t.fisier + '` · ' + escMd(t.nume.slice(0, 120))).join('<br>') : '**FĂRĂ TEST**'} |\r\n`; });
  }
  md += '\r\n## Ultima validare (rularea testelor de declanșare)\r\n\r\n' + (validari ? validari : '_Nerulată încă: `node tools/inventar-garzi.mjs --ruleaza`._') + '\r\n';
  return { md, garzi: ac, fara, orfane: ac.orfane, ambigue: ac.ambigue };
}
export const fara_validare = (md) => md.replace(/## Ultima validare[\s\S]*$/, '');
function ruleaza(ac) {
  const fisiere = [...new Set(ac.flatMap((g) => g.teste.map((t) => t.fisier)).filter((f) => f.endsWith('.test.mjs')))].sort();
  let ok = 0, rau = []; const zi = new Date().toISOString().slice(0, 10);
  for (const f of fisiere) { try { execFileSync(process.execPath, ['--test', f], { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }); ok++; } catch (e) { rau.push(f); } }
  return `${zi}: ${ok} din ${fisiere.length} fișiere de test trecute${rau.length ? ' · PICATE: ' + rau.map((f) => '`' + f + '`').join(', ') : ''}.`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.slice(2), cale = join(ROOT, DOC);
  const vechi = existsSync(cale) ? readFileSync(cale, 'utf8') : '';
  const valVeche = /## Ultima validare[^\n]*\n\s*\n([^\n]*)/.exec(vechi)?.[1]?.trim() || null;
  const g0 = genereaza({ validari: valVeche && !/Nerulată/.test(valVeche) ? valVeche : null });
  if (arg.includes('--verifica')) {
    const lavechi = fara_validare(vechi).replace(/\r\n/g, '\n') === fara_validare(g0.md).replace(/\r\n/g, '\n');
    if (!lavechi) console.error('docs/inventar-modele.md nu mai e la zi: rulează node tools/inventar-garzi.mjs');
    if (g0.fara.length) console.error('Gărzi fără test: ' + g0.fara.map((g) => g.fisier + ':' + g.linie + ' ' + g.mesaj.slice(0, 60)).join(' | '));
    if (g0.orfane.length || g0.ambigue.length) console.error('Etichete orfane / ambigue: ' + g0.orfane.concat(g0.ambigue).map((e) => e.modul + ' · ' + e.fragment).join(' | '));
    process.exit(lavechi && !g0.fara.length && !g0.orfane.length && !g0.ambigue.length ? 0 : 1);
  }
  const g = arg.includes('--ruleaza') ? genereaza({ validari: ruleaza(g0.garzi) }) : g0;
  writeFileSync(cale, g.md);
  console.log(DOC + ': ' + g.garzi.length + ' gărzi, ' + g.fara.length + ' fără test.');
  for (const x of g.fara) console.log('  FĂRĂ TEST · ' + x.fisier + ':' + x.linie + ' · ' + x.efect + ' · ' + x.mesaj.slice(0, 100));
}
