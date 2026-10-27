// 19.10.2026 — I-717: bilanțul săptămânal al probei Top Long pe Discord (sâmbăta, .github/workflows/premarket-bilant.yml).
// Citește evaluarea pe care robotul zilnic o scrie deja (scanner-verdicts/generated/premarket-proba.json) — fără prețuri noi, fără
// alt calcul de verdict — și trimite un mesaj DOAR când s-a închis o perioadă nouă. Alarma de abatere e cea scrisă ÎNAINTE de date în
// docs/premarket-proba-protocol.md, Anexa A: o alarmă de revăzut, NU un verdict; regulile probei rămân cele din 18.10.2026.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ETICHETA_NEVERIFICAT } from './discord-mesaj.mjs';

const DIR = 'scanner-verdicts/generated', PROBA = DIR + '/premarket-proba.json', STARE = DIR + '/premarket-bilant.json';
/** Abaterea diferenței SUS − JOS pe o perioadă de 20 de sesiuni: 3,4 % (cercetarea din 19.10.2026, H1·B: 47 de ferestre de 20 de
    sesiuni care nu se suprapun, 2022–2026, medie −0,38 %, Sharpe pe fereastră −0,109 ⇒ abatere ≈ 3,4 %). */
export const SIGMA_PERIOADA = 0.034;
/** Pragul alarmei după k perioade (k ≥ 3): −1,645 × σ / √k — media sub el face improbabil chiar și un avantaj ZERO (5 %, unilateral,
    la acea privire). Referința e 0, nu un avantaj din istorie (ca la Trend), pentru că Top Long n-are unul: H1 a dat −0,4 %. */
export function pragAbatere(k) { return k >= 3 ? -1.645 * SIGMA_PERIOADA / Math.sqrt(k) : null; }

const pc = (x) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' %';
const VERDICT = { ajuta: 'Top Long ajută', 'fara-avantaj': 'nu s-a văzut un avantaj' };
const orizont = (p, k) => (p?.orizonturi || []).find((o) => o && o.k === k) || null;

/** Textul mesajului (fără să decidă dacă se trimite). 27.10.2026 (revizia F, decizia (a)): orizontul principal e cel din fișier (în v2: 5 sesiuni,
 *  cu judecata unică); celelalte orizonturi apar pe rândul lor — cel fără `necesare` ca monitorizare, fără verdict. Alarma Anexei A e scrisă
 *  pentru perioadele de 20 de sesiuni, deci rămâne pe orizontul de 20 (principal sau nu). */
export function mesaj(p, acum = Date.now()) {
  const op = (p?.orizonturi || []).find((o) => o && o.principal) || orizont(p, 20), o20 = orizont(p, 20);
  if (!op) return '';
  const n = op.perioade || 0, med = Number.isFinite(op.medieDif) ? pc(op.medieDif) : '—', ses = (k) => k + (k >= 20 ? ' de' : '') + ' sesiuni';
  const parti = ['Top Long în probă · ' + n + '/' + op.necesare + ' perioade de ' + ses(op.k) + ' · media SUS − JOS până acum ' + med];
  for (const o of (p?.orizonturi || []).filter((x) => x && x !== op)) parti.push(o.necesare ? o.k + ' sesiuni: ' + (o.perioade || 0) + '/' + o.necesare + ' · ' + (Number.isFinite(o.medieDif) ? pc(o.medieDif) : '—') + (o.perioade >= o.necesare && VERDICT[o.verdict] ? ' · ' + VERDICT[o.verdict] : '')
    : ses(o.k) + ' (monitorizare, fără verdict): ' + (o.perioade || 0) + ' perioade · ' + (Number.isFinite(o.medieDif) ? pc(o.medieDif) : '—'));
  if (n >= op.necesare && VERDICT[op.verdict]) {
    parti.push('verdict: ' + VERDICT[op.verdict] + ' (p = ' + (Number.isFinite(op.p) ? op.p.toFixed(3).replace('.', ',') : '—') + ')' + (op.rezerve ? ' — cu rezerve: ' + op.rezerve : '') + (op.verdict === 'fara-avantaj' ? ' — asta NU înseamnă că s-a dovedit că nu ajută' : ' — o dovadă, nu un buton de cumpărat'));
  } else parti.push('nimic de hotărât încă');
  const linii = [parti.join(' · ')];
  const n20 = o20 ? o20.perioade || 0 : 0, prag = pragAbatere(n20);
  if (o20 && prag !== null && Number.isFinite(o20.medieDif) && o20.medieDif < prag)
    linii.push('⚠️ **ABATERE** (alarmă, nu verdict): media pe ' + n20 + ' perioade de 20 de sesiuni, ' + pc(o20.medieDif) + ', e sub pragul scris înainte (' + pc(prag) + ') — de revăzut, nu de cumpărat; regulile probei nu se schimbă');
  const ultima = Date.parse(p?.ultimaRulare || '');
  if (Number.isFinite(ultima) && acum - ultima > 4 * 864e5) linii.push('⚠️ robotul zilnic n-a mai notat din ' + p.ultimaRulare.slice(0, 10) + ' — bilanțul e vechi');
  return linii.join('\n');
}
/** Se trimite doar când s-a închis o perioadă nouă (pe oricare orizont) față de ultimul mesaj trimis; fără nicio perioadă, nimic. */
export function decide(p, prev, acum = Date.now()) {
  const o = p?.orizonturi || [];
  if (!o.some((x) => x && x.perioade > 0)) return { trimite: false, mesaj: '', stare: prev || null };
  const cheie = JSON.stringify(o.map((x) => [x.k, x.perioade, x.ultimaPerioada?.zi || null, x.verdict]));
  if (prev && prev.cheie === cheie) return { trimite: false, mesaj: '', stare: prev };
  // 27.10.2026 (I-764, revizia A–E): ce pleacă pe Discord poartă la final, pe rând separat, eticheta „generat automat · neverificat de om”
  return { trimite: true, mesaj: mesaj(p, acum) + '\n-# ' + ETICHETA_NEVERIFICAT, stare: { cheie, la: new Date(acum).toISOString(), versiune: p.versiune || null } };
}

async function main() {
  if (!existsSync(PROBA)) { console.log('premarket-proba.json lipsește ⇒ nimic de spus'); return; }
  const p = JSON.parse(readFileSync(PROBA, 'utf8'));
  let prev = null; try { prev = existsSync(STARE) ? JSON.parse(readFileSync(STARE, 'utf8')) : null; } catch { prev = null; }
  const d = decide(p, prev);
  if (!d.trimite) { console.log('Discord: nicio perioadă nouă față de ultimul bilanț ⇒ nu trimit'); return; }
  console.log(d.mesaj);
  if (!process.env.DISCORD_WEBHOOK) { console.log('Discord: fără webhook ⇒ doar în jurnal (starea nu se schimbă)'); return; }
  const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: d.mesaj }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error('Discord HTTP ' + r.status);
  writeFileSync(STARE, JSON.stringify(d.stare));
  console.log('Discord: trimis');
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/premarket-bilant.mjs')) main().catch((e) => { console.error(e.message || e); process.exit(1); });
