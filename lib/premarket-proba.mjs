// 18.10.2026 — Proba în timp a Premarket Scanner, Top Long (protocolul: docs/premarket-proba-protocol.md, scris ÎNAINTE de date).
// Aceeași metodă ca proba Reguli V1 (lib/v1-proba.mjs): perioade care nu se suprapun, testul semnelor.
// 27.10.2026 — v2 (`premarket-proba-2`, I-741 / I-743, protocolul v2 scris ÎNAINTE în docs/premarket-proba-protocol.md): judecata UNICĂ la
// perioadele cerute de simularea puterii (16 la k = 5, 60 la k = 20), apoi doar monitorizare; versiunea acoperă și ajutoarele apelate din
// `analyze` (închiderea tranzitivă din engine.js, fără textele de afișaj) și evaluatorul; jurnalul v1 rămâne sub `pm-cb956aef5680`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PROTOCOL as V1, evalueaza as evalueazaV1, contract as contractV1, amprentaEvaluator } from './v1-proba.mjs';
import { inchidere, functieDinText, declaratii, amprentaText } from './proba-contract.mjs';

export const PROTOCOL = Object.freeze({
  id: 'premarket-proba-2', scrisLa: '2026-10-27',
  precedent: Object.freeze({ id: 'premarket-proba-1', scrisLa: '2026-10-18', versiune: 'pm-cb956aef5680', perioadeMin: 8, zile: ['2026-10-16', '2026-10-23'] }),
  // 27.10.2026 (revizia F, decizia (a)): același orizont principal (5 sesiuni) ca V1, dar N-ul Top Long din puterea LUI (grupul de sus e de
  // 10 acțiuni, abaterea pe perioadă mai mare) — evaluatorul e comun, pragul de perioade nu mai trebuie să fie același
  orizonturi: V1.orizonturi, principal: V1.principal, perioadeCerute: Object.freeze({ 5: 30 }),
  univers: V1.univers, // aceleași 85 de acțiuni Core, înghețate
  // 19.10.2026 — I-720: calendarul de raportări în robot e OPRIT (fără calendar ⇒ aceeași penalizare „neverificat” pentru toate).
  // 27.10.2026 — rămâne OPRIT și în premarket-proba-2 (motivul în protocol: repornirea de azi e cerută de regula de judecată, iar
  // robotul tocmai pierduse 5 din 7 sesiuni; cheia Finnhub din Actions nu e verificată ⇒ un punct nou de cădere, cu umbra în același pas).
  calendar: false,
  // codul care decide Top Long; amprenta lui (+ ajutoarele lui + evaluatorul) e versiunea probei (o schimbare de regulă repornește proba)
  functii: Object.freeze(['momentumScore', 'analyze', 'capSectors', 'benchmarkReturns', 'rankResults']),
  // nu decid apartenența la Top Long: textul motivului și faptele afișate, graficul, DOM-ul, containerul de stare al paginii, scorul Reversal
  afisaj: Object.freeze(['fmt', 'signed', 'procente', 'fapteCandidat', 'sparkValues', '$', 'state', 'reversalScore']),
  // 27.10.2026 (revizia F, 🟡7): bibliotecile ale căror funcții, apelate din codul Top Long (`TI.x`, `EL.x`), intră în versiune cu închiderea
  // lor tranzitivă — RSI / EMA / ATR decid scorul și `eligible`, harta de sectoare decide `capSectors`. Lista apelurilor se află din textul
  // motorului, nu se scrie de mână. `exclude`: CFG din early-long.js (pragurile Early Long și cheia hărții în localStorage; robotul pornește
  // cu stocarea goală, deci harta e SECTOR_SEED) nu decide Top Long.
  // 28.10.2026 (revizia F3, 🟡1): seriile zilnice (`lib/daily-series.js`) NU sunt în versiune — bibliotecă comună, se notează pe zi în `d`
  biblioteci: Object.freeze([Object.freeze({ obiect: 'TI', fisier: 'lib/indicators.js', exclude: Object.freeze([]) }), Object.freeze({ obiect: 'EL', fisier: 'lib/early-long.js', exclude: Object.freeze(['CFG']) })]),
  // puterea Top Long la N cerut (revizia F, 🟡6: abaterea măsurată pe motorul real, 2,27 % pe 5 sesiuni; grupurile medii măsurate 10 / 75)
  putere: Object.freeze({ ...V1.putere, sigmaZi: 0.03016, verificate: 85, grup: Object.freeze({ sus: 10, jos: 75 }), sigmaPerioada: Object.freeze({ 5: 0.0227, 20: 0.0489 }),
    rezultate: Object.freeze({ 5: Object.freeze({ '0.5': 0.239, '1': 0.5925 }) }),
    // 28.10.2026 (revizia F2, 🔵7): banda pe ani a Top Long (abaterea pe perioadă a fiecărui an 2022–2026, revizia F2; binomial exact, prag 20 / 30)
    banda: Object.freeze({ 5: Object.freeze({ pct: 1, sigmaPeAn: Object.freeze({ 2022: 0.0326, 2023: 0.0192, 2024: 0.0224, 2025: 0.0206, 2026: 0.0265 }), min: 0.375, max: 0.725, an: 2026, laAn: 0.494 }) }) })
});
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const MARCAJ = '  validateDeps(); bind();';
const motorSrc = (src) => { const s = src ?? readFileSync('candidate-engine/engine.js', 'utf8'), cut = s.lastIndexOf(MARCAJ); return cut > 0 ? s.slice(0, cut) : s; };
/** Ajutoarele din engine.js de care depind funcțiile Top Long (închiderea tranzitivă, fără rădăcini și fără afișaj). */
export function FUNCTII_MOTOR(src) { const s = motorSrc(src); return inchidere(s, PROTOCOL.functii, { exclude: PROTOCOL.afisaj }).filter((n) => !PROTOCOL.functii.includes(n)); }

/** Amprenta regulilor: SHA-256 pe textul funcțiilor din PROTOCOL.functii (în ordine, din motorul care rulează), pe ajutoarele lor din
    engine.js și pe evaluator (v2). Capetele de rând se aduc la LF: copia de pe Windows e CRLF, robotul de pe GitHub citește LF — aceeași
    regulă trebuie să dea aceeași versiune (18.10: dădea pm-82e7… vs pm-cb95…). */
const textTL = (functii, s) => PROTOCOL.functii.map((n) => functii[n].toString()).concat(FUNCTII_MOTOR(s).map((n) => functieDinText(s, n))).join('\n');
const apelate = (text, obiect) => [...new Set([...text.matchAll(new RegExp('\\b' + obiect + '\\.([A-Za-z_$][\\w$]*)', 'g'))].map((m) => m[1]))].sort();
/** 27.10.2026 (revizia F, 🟡7): rădăcinile din fiecare bibliotecă = funcțiile ei apelate din codul Top Long (și declarate în ea). */
function radaciniBiblioteci(functii, s, citeste) { const t = textTL(functii, s); return PROTOCOL.biblioteci.map((b) => { const lib = citeste(b.fisier), decl = new Set(declaratii(lib)); return { ...b, lib, rad: apelate(t, b.obiect).filter((n) => decl.has(n)) }; }); }
/** Părțile versiunii Top Long, în ordine (pentru citire și teste): funcțiile, ajutoarele din engine.js, apelurile în biblioteci, înregistrarea, judecătorul. */
export function partiVersiune(functii, src, citeste = (f) => readFileSync(f, 'utf8')) {
  const s = motorSrc(src); return [...PROTOCOL.functii, ...FUNCTII_MOTOR(s), ...radaciniBiblioteci(functii, s, citeste).flatMap((b) => b.rad.map((n) => b.obiect + '.' + n)), 'inregistrare', 'judecator'];
}
export function versiune(functii, src, citeste = (f) => readFileSync(f, 'utf8')) {
  const h = createHash('sha256'), s = motorSrc(src);
  for (const n of PROTOCOL.functii) { if (typeof functii[n] !== 'function') throw Error('Lipsește funcția ' + n + ' din motorul Premarket.'); h.update(n + '\n' + functii[n].toString().replace(/\r\n?/g, '\n') + '\n'); }
  for (const n of FUNCTII_MOTOR(s)) h.update(n + '\n' + functieDinText(s, n) + '\n');
  // 27.10.2026 (revizia F, 🟡7): indicatorii și harta de sectoare apelate de Top Long (închiderea lor), apoi înregistrarea zilei (codul „m”)
  for (const b of radaciniBiblioteci(functii, s, citeste)) if (b.rad.length) h.update('biblioteca ' + b.fisier + '\n' + b.rad.join(',') + '\n' + amprentaText(b.lib, inchidere(b.lib, b.rad, { exclude: b.exclude })) + '\n');
  h.update('inregistrare\n' + inregistrare.toString().replace(/\r\n?/g, '\n') + '\n');
  h.update('judecator\n' + amprentaEvaluator(citeste) + '\n' + evalueaza.toString().replace(/\r\n?/g, '\n') + '\n' + JSON.stringify({ id: PROTOCOL.id, calendar: PROTOCOL.calendar, afisaj: PROTOCOL.afisaj, biblioteci: PROTOCOL.biblioteci, principal: PROTOCOL.principal, perioadeCerute: PROTOCOL.perioadeCerute }));
  return 'pm-' + h.digest('hex').slice(0, 12);
}
/** 19.10.2026 (audit Long & Reversal): clasamentul depinde și de cod din afara celor 5 funcții (penalizarea de earnings, indicatorii,
    harta de sectoare, seriile, calendarul, universul). Amprenta lor se NOTEAZĂ pe fiecare zi (câmpul `d`) — nu schimbă versiunea și
    nu repornește proba (o reparație mecanică, ex. viteza formatorului de dată, nu trebuie s-o reseteze), dar raportul arată deschis
    dacă dependențele s-au schimbat pe parcursul probei.
    27.10.2026 (auditul F): și restul bibliotecilor pe care robotul le încarcă (Early Bird, verdictul deciziei) și TOT textul motorului —
    o schimbare oriunde în engine.js (și în afara funcțiilor din versiune) rămâne la vedere, cu ziua ei. */
// 28.10.2026 (revizia F3, 🔵7): și roboții (noaptea Top Long, aducătorul de bare din V1) și contractul comun al probelor
export const DEPENDINTE = Object.freeze(['lib/indicators.js', 'lib/early-long.js', 'lib/daily-series.js', 'lib/exchange-calendar.js', 'lib/me-early-bird.js', 'lib/decision-verdict.js', 'candidate-engine/engine.js', 'tools/premarket-jurnal.mjs', 'tools/v1-jurnal.mjs', 'lib/proba-contract.mjs']);
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
