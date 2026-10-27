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

/** Textul mesajului (fără să decidă dacă se trimite). */
export function mesaj(p, acum = Date.now()) {
  const o20 = (p?.orizonturi || []).find((o) => o && o.principal) || orizont(p, 20), o5 = orizont(p, 5);
  if (!o20) return '';
  const n = o20.perioade || 0, med = Number.isFinite(o20.medieDif) ? pc(o20.medieDif) : '—';
  const parti = ['Top Long în probă · ' + n + '/' + o20.necesare + ' perioade de ' + o20.k + (o20.k >= 20 ? ' de' : '') + ' sesiuni · media SUS − JOS până acum ' + med];
  if (o5) parti.push('5 sesiuni: ' + (o5.perioade || 0) + '/' + o5.necesare + ' · ' + (Number.isFinite(o5.medieDif) ? pc(o5.medieDif) : '—') + (o5.perioade >= o5.necesare && VERDICT[o5.verdict] ? ' · ' + VERDICT[o5.verdict] : ''));
  if (n >= o20.necesare && VERDICT[o20.verdict]) {
    parti.push('verdict: ' + VERDICT[o20.verdict] + ' (p = ' + (Number.isFinite(o20.p) ? o20.p.toFixed(3).replace('.', ',') : '—') + ')' + (o20.verdict === 'fara-avantaj' ? ' — asta NU înseamnă că s-a dovedit că nu ajută' : ' — o dovadă, nu un buton de cumpărat'));
  } else parti.push('nimic de hotărât încă');
  const linii = [parti.join(' · ')];
  const prag = pragAbatere(n);
  if (prag !== null && Number.isFinite(o20.medieDif) && o20.medieDif < prag)
    linii.push('⚠️ **ABATERE** (alarmă, nu verdict): media pe ' + n + ' perioade, ' + pc(o20.medieDif) + ', e sub pragul scris înainte (' + pc(prag) + ') — de revăzut, nu de cumpărat; regulile probei nu se schimbă');
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
