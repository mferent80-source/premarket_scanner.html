// 18.10.2026 — Proba în timp a Premarket Scanner, Top Long (protocolul: docs/premarket-proba-protocol.md, scris ÎNAINTE de date).
// Aceeași metodă ca proba Reguli V1 (lib/v1-proba.mjs): perioade care nu se suprapun, testul semnelor.
// 27.10.2026 — v2 (`premarket-proba-2`, I-741 / I-743, protocolul v2 scris ÎNAINTE în docs/premarket-proba-protocol.md): judecata UNICĂ la
// perioadele cerute de simularea puterii (16 la k = 5, 60 la k = 20), apoi doar monitorizare; versiunea acoperă și ajutoarele apelate din
// `analyze` (închiderea tranzitivă din engine.js, fără textele de afișaj) și evaluatorul; jurnalul v1 rămâne sub `pm-cb956aef5680`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PROTOCOL as V1, evalueaza as evalueazaV1, contract as contractV1, amprentaEvaluator } from './v1-proba.mjs';
import { inchidere, functieDinText } from './proba-contract.mjs';

export const PROTOCOL = Object.freeze({
  id: 'premarket-proba-2', scrisLa: '2026-10-27',
  precedent: Object.freeze({ id: 'premarket-proba-1', scrisLa: '2026-10-18', versiune: 'pm-cb956aef5680', perioadeMin: 8, zile: ['2026-10-16', '2026-10-23'] }),
  orizonturi: V1.orizonturi, principal: V1.principal, perioadeCerute: V1.perioadeCerute,
  univers: V1.univers, // aceleași 85 de acțiuni Core, înghețate
  // 19.10.2026 — I-720: calendarul de raportări în robot e OPRIT (fără calendar ⇒ aceeași penalizare „neverificat” pentru toate).
  // 27.10.2026 — rămâne OPRIT și în premarket-proba-2 (motivul în protocol: repornirea de azi e cerută de regula de judecată, iar
  // robotul tocmai pierduse 5 din 7 sesiuni; cheia Finnhub din Actions nu e verificată ⇒ un punct nou de cădere, cu umbra în același pas).
  calendar: false,
  // codul care decide Top Long; amprenta lui (+ ajutoarele lui + evaluatorul) e versiunea probei (o schimbare de regulă repornește proba)
  functii: Object.freeze(['momentumScore', 'analyze', 'capSectors', 'benchmarkReturns', 'rankResults']),
  // nu decid apartenența la Top Long: textul motivului și faptele afișate, graficul, DOM-ul, containerul de stare al paginii, scorul Reversal
  afisaj: Object.freeze(['fmt', 'signed', 'procente', 'fapteCandidat', 'sparkValues', '$', 'state', 'reversalScore']),
  // puterea Top Long la perioadele cerute (docs/proba-putere-2026-10-27.json; 66 verificate, 10 în top)
  putere: Object.freeze({ ...V1.putere, verificate: 66, grup: Object.freeze({ sus: 10, jos: 56 }),
    rezultate: Object.freeze({ 5: Object.freeze({ '0.5': 0.1875, '1': 0.526 }), 20: Object.freeze({ '0.5': 0.202, '1': 0.546 }) }) })
});
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const MARCAJ = '  validateDeps(); bind();';
const motorSrc = (src) => { const s = src ?? readFileSync('candidate-engine/engine.js', 'utf8'), cut = s.lastIndexOf(MARCAJ); return cut > 0 ? s.slice(0, cut) : s; };
/** Ajutoarele din engine.js de care depind funcțiile Top Long (închiderea tranzitivă, fără rădăcini și fără afișaj). */
export function FUNCTII_MOTOR(src) { const s = motorSrc(src); return inchidere(s, PROTOCOL.functii, { exclude: PROTOCOL.afisaj }).filter((n) => !PROTOCOL.functii.includes(n)); }

/** Amprenta regulilor: SHA-256 pe textul funcțiilor din PROTOCOL.functii (în ordine, din motorul care rulează), pe ajutoarele lor din
    engine.js și pe evaluator (v2). Capetele de rând se aduc la LF: copia de pe Windows e CRLF, robotul de pe GitHub citește LF — aceeași
    regulă trebuie să dea aceeași versiune (18.10: dădea pm-82e7… vs pm-cb95…). */
export function versiune(functii, src) {
  const h = createHash('sha256'), s = motorSrc(src);
  for (const n of PROTOCOL.functii) { if (typeof functii[n] !== 'function') throw Error('Lipsește funcția ' + n + ' din motorul Premarket.'); h.update(n + '\n' + functii[n].toString().replace(/\r\n?/g, '\n') + '\n'); }
  for (const n of FUNCTII_MOTOR(s)) h.update(n + '\n' + functieDinText(s, n) + '\n');
  h.update('judecator\n' + amprentaEvaluator() + '\n' + evalueaza.toString().replace(/\r\n?/g, '\n') + '\n' + JSON.stringify({ id: PROTOCOL.id, calendar: PROTOCOL.calendar, afisaj: PROTOCOL.afisaj }));
  return 'pm-' + h.digest('hex').slice(0, 12);
}
/** 19.10.2026 (audit Long & Reversal): clasamentul depinde și de cod din afara celor 5 funcții (penalizarea de earnings, indicatorii,
    harta de sectoare, seriile, calendarul, universul). Amprenta lor se NOTEAZĂ pe fiecare zi (câmpul `d`) — nu schimbă versiunea și
    nu repornește proba (o reparație mecanică, ex. viteza formatorului de dată, nu trebuie s-o reseteze), dar raportul arată deschis
    dacă dependențele s-au schimbat pe parcursul probei.
    27.10.2026 (auditul F): și restul bibliotecilor pe care robotul le încarcă (Early Bird, verdictul deciziei) și TOT textul motorului —
    o schimbare oriunde în engine.js (și în afara funcțiilor din versiune) rămâne la vedere, cu ziua ei. */
export const DEPENDINTE = Object.freeze(['lib/indicators.js', 'lib/early-long.js', 'lib/daily-series.js', 'lib/exchange-calendar.js', 'lib/me-early-bird.js', 'lib/decision-verdict.js', 'candidate-engine/engine.js']);
export function amprentaDependinte(citeste, functii) {
  const h = createHash('sha256');
  if (functii && typeof functii.earningsInfo === 'function') h.update('earningsInfo\n' + functii.earningsInfo.toString().replace(/\r\n?/g, '\n'));
  for (const f of DEPENDINTE) h.update(f + '\n' + String(citeste(f)).replace(/\r\n?/g, '\n'));
  h.update('univers\n' + PROTOCOL.univers.join(','));
  return 'dep-' + h.digest('hex').slice(0, 12);
}
/** Schimbările de amprentă a dependențelor de-a lungul zilelor unei versiuni: [{ de, pana, d }]. */
export function istoricDependinte(jurnal, v) {
  const out = [];
  for (const zi of (jurnal?.zile || []).filter((z) => z.v === v)) { const d = zi.d || null; if (!out.length || out.at(-1).d !== d) out.push({ de: zi.zi, pana: zi.zi, d }); else out.at(-1).pana = zi.zi; }
  return out;
}
/** Rândul zilei din starea motorului după scanare: { zi, v, la, r: [[simbol, 'm' în Top Long | 'n', scor, data EOD, reper, 'r' în Early Reversal | '']] }. */
export function inregistrare(state, v, at = Date.now()) {
  const top = new Set((state?.momentum || []).map((x) => x && x.symbol)), rev = new Set((state?.reversal || []).map((x) => x && x.symbol));
  const r = (state?.analyses || []).filter((x) => x && x.mode === 'momentum' && typeof x.symbol === 'string' && ziValida(x.sourceDate))
    .map((x) => [x.symbol, top.has(x.symbol) ? 'm' : 'n', Number.isFinite(x.score) ? x.score : 0, x.sourceDate, x.benchmarkSymbol || null, rev.has(x.symbol) ? 'r' : '']);
  const zile = r.map((x) => x[3]).sort();
  return { zi: zile.at(-1) || null, v: String(v || ''), la: new Date(at).toISOString(), r };
}
/** Evaluarea pe un orizont: grupul SUS = în Top Long; restul identic cu proba V1 (v2: judecata unică la perioadele cerute). */
export function evalueaza(jurnal, serii, { k, versiune: v, sesiuni, judecaLa = PROTOCOL.perioadeCerute[k] ?? null, inghetate = null, la = null }) {
  // 27.10.2026 (revizia F, 🔴2): cu `inghetate` (fișierul premarket-inghetat.jsonl), pe perioadele înghețate — același îngheț ca la V1
  const o = evalueazaV1(jurnal, serii, { k, versiune: v, sesiuni, inSus: (r) => r.cod === 'm', judecaLa, inghetate, la });
  const { indeplineste, ...descriptiv } = o.descriptiv;
  return { ...o, descriptiv };
}
/** Câmpurile de contract (putere / primulVerdict / judecata) pentru un orizont Top Long — puterea e a probei Top Long, nu a V1. */
export function contract(o, opt) { return contractV1(o, { ...opt, putere: PROTOCOL.putere }); }
