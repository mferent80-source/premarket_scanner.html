// 18.10.2026 — Proba în timp a Premarket Scanner, Top Long (protocolul: docs/premarket-proba-protocol.md, scris ÎNAINTE de date).
// Aceeași metodă ca proba Reguli V1 (lib/v1-proba.mjs): perioade care nu se suprapun, testul semnelor, minimum 8 perioade.
import { createHash } from 'node:crypto';
import { PROTOCOL as V1, evalueaza as evalueazaV1 } from './v1-proba.mjs';

export const PROTOCOL = Object.freeze({
  id: 'premarket-proba-1', scrisLa: '2026-10-18', orizonturi: V1.orizonturi, principal: V1.principal, perioadeMin: V1.perioadeMin,
  univers: V1.univers, // aceleași 85 de acțiuni Core, înghețate
  // 19.10.2026 — I-720: calendarul de raportări în robot e OPRIT pentru proba aceasta (protocolul din 18.10: fără calendar ⇒ aceeași
  // penalizare „neverificat” pentru toate). Se pune `true` doar într-o probă nouă, la o repornire planificată (protocolul rescris înainte).
  calendar: false,
  // codul care decide Top Long; amprenta lui e versiunea probei (o schimbare de regulă repornește proba)
  functii: Object.freeze(['momentumScore', 'analyze', 'capSectors', 'benchmarkReturns', 'rankResults'])
});
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Amprenta regulilor: SHA-256 pe textul funcțiilor din PROTOCOL.functii (în ordine). Capetele de rând se aduc la LF: copia de pe
    Windows e CRLF, robotul de pe GitHub citește LF — aceeași regulă trebuie să dea aceeași versiune (18.10: dădea pm-82e7… vs pm-cb95…). */
export function versiune(functii) {
  const h = createHash('sha256');
  for (const n of PROTOCOL.functii) { if (typeof functii[n] !== 'function') throw Error('Lipsește funcția ' + n + ' din motorul Premarket.'); h.update(n + '\n' + functii[n].toString().replace(/\r\n?/g, '\n') + '\n'); }
  return 'pm-' + h.digest('hex').slice(0, 12);
}
/** 19.10.2026 (audit Long & Reversal): clasamentul depinde și de cod din afara celor 5 funcții (penalizarea de earnings, indicatorii,
    harta de sectoare, seriile, calendarul, universul). Amprenta lor se NOTEAZĂ pe fiecare zi (câmpul `d`) — nu schimbă versiunea și
    nu repornește proba (o reparație mecanică, ex. viteza formatorului de dată, nu trebuie s-o reseteze), dar raportul arată deschis
    dacă dependențele s-au schimbat pe parcursul probei. */
export const DEPENDINTE = Object.freeze(['lib/indicators.js', 'lib/early-long.js', 'lib/daily-series.js', 'lib/exchange-calendar.js']);
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
/** Evaluarea pe un orizont: grupul SUS = în Top Long; restul identic cu proba V1. */
export function evalueaza(jurnal, serii, { k, versiune: v, sesiuni }) {
  const o = evalueazaV1(jurnal, serii, { k, versiune: v, sesiuni, inSus: (r) => r.cod === 'm' });
  const { indeplineste, ...descriptiv } = o.descriptiv;
  return { ...o, descriptiv };
}
