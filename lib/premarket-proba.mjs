// 18.10.2026 — Proba în timp a Premarket Scanner, Top Long (protocolul: docs/premarket-proba-protocol.md, scris ÎNAINTE de date).
// Aceeași metodă ca proba Reguli V1 (lib/v1-proba.mjs): perioade care nu se suprapun, testul semnelor, minimum 8 perioade.
import { createHash } from 'node:crypto';
import { PROTOCOL as V1, evalueaza as evalueazaV1 } from './v1-proba.mjs';

export const PROTOCOL = Object.freeze({
  id: 'premarket-proba-1', scrisLa: '2026-10-18', orizonturi: V1.orizonturi, principal: V1.principal, perioadeMin: V1.perioadeMin,
  univers: V1.univers, // aceleași 85 de acțiuni Core, înghețate
  // codul care decide Top Long; amprenta lui e versiunea probei (o schimbare de regulă repornește proba)
  functii: Object.freeze(['momentumScore', 'analyze', 'capSectors', 'benchmarkReturns', 'rankResults'])
});
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Amprenta regulilor: SHA-256 pe textul funcțiilor din PROTOCOL.functii (în ordine). */
export function versiune(functii) {
  const h = createHash('sha256');
  for (const n of PROTOCOL.functii) { if (typeof functii[n] !== 'function') throw Error('Lipsește funcția ' + n + ' din motorul Premarket.'); h.update(n + '\n' + functii[n].toString() + '\n'); }
  return 'pm-' + h.digest('hex').slice(0, 12);
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
