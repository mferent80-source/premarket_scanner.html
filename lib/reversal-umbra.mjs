// 19.10.2026 — I-716: stopul Early Reversal „în umbră” (protocolul: docs/reversal-stop-umbra-protocol.md, scris ÎNAINTE de date).
// Funcții pure. Pentru fiecare candidat Early Reversal al zilei se notează ambele stopuri — A (de azi) = preț − 1,25 × ATR, exact
// `stop` din planul motorului; B (sub bază) = minimul pe 60 de zile − 0,25 × ATR — din ce a calculat DEJA motorul (`analyze` rămâne
// neatins), apoi se măsoară R la 20 de sesiuni sau la stop / țintă 2R, pe fiecare stop. Fără niciun efect pe aplicație.
// 27.10.2026 (auditul F, I-743 / contractul cu lotul D): fișierul umbrei poartă și amprenta JUDECĂTORULUI (funcțiile de mai jos care
// măsoară și judecă, scrisă în protocol) și câmpurile `putere` / `primulVerdict` / `judecata`. Regulile umbrei NU se schimbă (nu repornește).
import { createHash } from 'node:crypto';
import { adauga, starturi } from './v1-proba.mjs';
import { amprentaFunctii, primulVerdict, judecata, sesiuniIntre } from './proba-contract.mjs';

export const PROTOCOL = Object.freeze({
  id: 'reversal-umbra-1', scrisLa: '2026-10-19', k: 20, atrAzi: 1.25, atrBaza: 0.25, fereastraBaza: 60, tintaR: 2,
  perioadeMin: 8, minPeGrup: 1,
  // t unilateral pe diferențele perioadelor; pragul ales prin simulare sub H0 (testul semnelor mințea aici: vezi protocolul)
  pragT: 3,
  // regulile care aleg lista Early Reversal; amprenta lor e versiunea umbrei (o schimbare repornește umbra)
  functii: Object.freeze(['reversalScore', 'analyze', 'capSectors', 'rankResults'])
});
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

/** Amprenta regulilor listei Early Reversal (CRLF și LF dau aceeași versiune, ca la proba Top Long). */
export function versiune(functii) {
  const h = createHash('sha256');
  for (const n of PROTOCOL.functii) { if (typeof functii[n] !== 'function') throw Error('Lipsește funcția ' + n + ' din motorul Premarket.'); h.update(n + '\n' + functii[n].toString().replace(/\r\n?/g, '\n') + '\n'); }
  return 'ru-' + h.digest('hex').slice(0, 12);
}
/** Rândul zilei din lista Early Reversal: { zi, v, la, r: [[simbol, data EOD, intrare, ATR, minimul bazei, stop A, stop B, scor, stare]] }.
    Minimul bazei e cel din `analyze` (min60), citit înapoi din `metricB` = revenirea din minim în %. `zi` = ziua scanării (și fără candidați). */
export function inregistrare(state, v, zi, at = Date.now()) {
  const r = [];
  for (const x of state?.reversal || []) {
    if (!x || typeof x.symbol !== 'string' || !ziValida(x.sourceDate) || !fin(x.price) || !(x.price > 0) || !fin(x.atr) || !(x.atr > 0) || !fin(x.metricB) || !fin(x.stop)) continue;
    const min = x.price / (1 + x.metricB / 100);
    r.push([x.symbol, x.sourceDate, x.price, x.atr, min, x.stop, min - PROTOCOL.atrBaza * x.atr, fin(x.score) ? x.score : 0, String(x.state || '')]);
  }
  return { zi: ziValida(zi) ? zi : null, v: String(v || ''), la: new Date(at).toISOString(), r };
}
/** Barele Yahoo (cu `meta.timezone`) ⇒ [{ d, o, h, l, c }] datate în fusul bursei; fără fus orar ⇒ null (nu se ghicește ziua). */
export function bareZilnice(out) {
  const tz = out?.meta?.timezone; if (!tz || !Array.isArray(out)) return null;
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return out.map((b) => ({ d: f.format(new Date(b.t)), o: b.o, h: b.h, l: b.l, c: b.c }));
}
/** O tranzacție pe barele zilnice [{ d, o, h, l, c }]: intrare la închiderea zilei d, risc R = intrare − stop, țintă intrare + tintaR × R,
    cel mult k sesiuni. Deschiderea dincolo de stop / țintă ⇒ la deschidere; stop și țintă în aceeași bară ⇒ STOPUL; altfel închiderea
    sesiunii k. null dacă ziua lipsește, riscul nu e pozitiv sau nu există încă toate cele k sesiuni. */
export function rezultat(bare, d, intrare, stop, { k = PROTOCOL.k, tintaR = PROTOCOL.tintaR } = {}) {
  if (!Array.isArray(bare) || !(intrare - stop > 0)) return null;
  const i = bare.findIndex((b) => b.d === d); if (i < 0 || i + k >= bare.length) return null;
  const risc = intrare - stop, tinta = intrare + tintaR * risc;
  for (let j = i + 1; j <= i + k; j++) {
    const b = bare[j]; let ies = null, cum = null;
    if (b.o <= stop) { ies = b.o; cum = 'stop'; } else if (b.o >= tinta) { ies = b.o; cum = 'tinta'; }
    else if (b.l <= stop) { ies = stop; cum = 'stop'; } else if (b.h >= tinta) { ies = tinta; cum = 'tinta'; }
    if (ies !== null) return { r: (ies - intrare) / risc, iesire: cum, sesiuni: j - i };
  }
  return { r: (bare[i + k].c - intrare) / risc, iesire: 'timp', sesiuni: k };
}
/** Tranzacțiile cu rezultat ale versiunii date: [{ zi, sym, rA, rB, stopA, stopB }] — aceleași intrări, două stopuri. */
export function tranzactii(jurnal, bare, v) {
  const out = [];
  for (const z of jurnal?.zile || []) {
    if (z.v !== v) continue;
    for (const [sym, d, intrare, , , stopA, stopB] of z.r || []) {
      const a = rezultat(bare[sym], d, intrare, stopA), b = rezultat(bare[sym], d, intrare, stopB);
      if (!a || !b) continue;
      out.push({ zi: z.zi, sym, rA: a.r, rB: b.r, stopA: a.iesire === 'stop', stopB: b.iesire === 'stop' });
    }
  }
  return out;
}
const medie = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/** t pe media diferențelor (n − 1 grade); abatere 0 ⇒ ±99 după semn (ca la bilanțul Trend). */
export function tStat(a) {
  const n = a.length; if (n < 2) return null;
  const m = medie(a), sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  return sd > 0 ? Math.max(-99, Math.min(99, m / (sd / Math.sqrt(n)))) : m > 0 ? 99 : m < 0 ? -99 : 0;
}
/** Evaluarea după protocol: perioade care nu se suprapun (k sesiuni pe calendarul SPY), D = media R_B − media R_A pe ziua de start,
    t unilateral cu pragul fixat, minimum 8 perioade; plus R mediu și rata de stop pe fiecare stop (descriptiv). */
export function evalueaza(jurnal, bare, { versiune: v, sesiuni }) {
  const rows = tranzactii(jurnal, bare, v), peZi = new Map();
  for (const r of rows) { if (!peZi.has(r.zi)) peZi.set(r.zi, []); peZi.get(r.zi).push(r); }
  const perioade = [];
  for (const d of starturi([...peZi.keys()], sesiuni, PROTOCOL.k)) {
    const zi = peZi.get(d); if (zi.length < PROTOCOL.minPeGrup) continue;
    perioade.push({ zi: d, dif: medie(zi.map((x) => x.rB)) - medie(zi.map((x) => x.rA)), n: zi.length });
  }
  const difPerioade = perioade.map((p) => p.dif), n = difPerioade.length, medieDif = medie(difPerioade), t = tStat(difPerioade);
  const verdict = n < PROTOCOL.perioadeMin ? 'astept' : medieDif > 0 && t > PROTOCOL.pragT ? 'baza-ajuta' : 'fara-avantaj';
  const grup = (rk, sk) => ({ n: rows.length, rMediu: medie(rows.map((x) => x[rk])), rataStop: rows.length ? rows.filter((x) => x[sk]).length / rows.length : null });
  return { k: PROTOCOL.k, perioade: n, necesare: PROTOCOL.perioadeMin, pragT: PROTOCOL.pragT, t, medieDif, verdict, difPerioade,
    descriptiv: { A: grup('rA', 'stopA'), B: grup('rB', 'stopB') }, ultimaPerioada: perioade.at(-1) || null, starturi: perioade.map((p) => p.zi) };
}
/** 27.10.2026 (I-743): amprenta judecătorului umbrei — funcțiile care măsoară o tranzacție și judecă perioadele, plus regulile din
 *  PROTOCOL. Scrisă în docs/reversal-stop-umbra-protocol.md; o schimbare cere protocol nou (umbra repornește). */
export function amprentaJudecator() {
  const reguli = JSON.stringify({ k: PROTOCOL.k, atrAzi: PROTOCOL.atrAzi, atrBaza: PROTOCOL.atrBaza, fereastraBaza: PROTOCOL.fereastraBaza, tintaR: PROTOCOL.tintaR, perioadeMin: PROTOCOL.perioadeMin, minPeGrup: PROTOCOL.minPeGrup, pragT: PROTOCOL.pragT });
  return 'ju-' + amprentaFunctii({ rezultat, tranzactii, medie, tStat, evalueaza, starturi }, ['rezultat', 'tranzactii', 'medie', 'tStat', 'evalueaza', 'starturi'], reguli);
}
/** Puterea scrisă în protocol pe 19.10.2026 (simulare, +0,3 R pe tranzacție pentru stopul B): ~11 % la 8 perioade, ~27 % la 36. */
export const PUTERE = Object.freeze({ unitate: 'R pe tranzacție', laPlus: Object.freeze([Object.freeze({ pct: 0.3, putere: 0.11, perioade: 8 }), Object.freeze({ pct: 0.3, putere: 0.27, perioade: 36 })]),
  text: 'Dacă stopul sub bază ar aduce în medie +0,3 R pe tranzacție, verdictul „ajută” iese în ~11 % din cazuri la 8 perioade și ~27 % la 36: umbra prinde doar un avantaj mare; „nu s-a văzut un avantaj” e rezultatul cel mai probabil și nu înseamnă că stopul sub bază e rău.' });
/** Câmpurile de contract ale umbrei: verdictul e SECVENȚIAL (recalculat după fiecare perioadă, cu prag t > 3,0 ales pentru privirile repetate),
 *  deci `judecata.unic = false`; `data` = închiderea ultimei perioade judecate. */
function contractUmbra(evaluare, zileV, sesiuni, { cal, azi }) {
  const inceput = zileV[0]?.zi || null, zileN = [...new Set(zileV.map((z) => z.zi).filter(Boolean))].sort();
  const asteptate = cal && inceput ? sesiuniIntre(cal, inceput, zileN.at(-1)) + 1 : 0, gata = evaluare.perioade >= PROTOCOL.perioadeMin;
  const idx = (sesiuni || []).indexOf(evaluare.ultimaPerioada?.zi), data = gata && idx >= 0 && idx + PROTOCOL.k < sesiuni.length ? sesiuni[idx + PROTOCOL.k] : null;
  return { putere: { ...PUTERE, laPlus: PUTERE.laPlus.map((x) => ({ ...x })) },
    primulVerdict: cal && azi ? primulVerdict({ cal, azi, inceput, starturi: evaluare.starturi, k: PROTOCOL.k, perioade: PROTOCOL.perioadeMin, notate: zileN.length, asteptate }) : null,
    judecata: judecata({ la: PROTOCOL.perioadeMin, data, verdict: gata ? evaluare.verdict : null, unic: false }) };
}
/** Pasul zilnic al robotului: adaugă ziua în jurnalul umbrei și scrie evaluarea. bare = { simbol: [{ d, o, h, l, c }] }.
 *  27.10.2026: cu `cal` (calendarul NYSE) și `azi`, fișierul primește și data estimată a primului verdict. */
export function pasUmbra(vechi, state, v, zi, bare, sesiuni, at = Date.now(), { cal = null, azi = null } = {}) {
  const rec = inregistrare(state, v, zi, at);
  rec.r = rec.r.map((x) => [x[0], x[1], r4(x[2]), r4(x[3]), r4(x[4]), r4(x[5]), r4(x[6]), Math.round(x[7] * 10) / 10, x[8]]);
  const jurnal = { ...adauga(vechi, rec), protocol: PROTOCOL.id };
  const zileV = jurnal.zile.filter((z) => z.v === v), evaluare = evalueaza(jurnal, bare, { versiune: v, sesiuni });
  const proba = { protocol: PROTOCOL.id, scrisLa: PROTOCOL.scrisLa, versiune: v, judecator: amprentaJudecator(), inceput: zileV[0]?.zi || null, zile: zileV.length, ultimaZi: rec.zi, ultimaRulare: rec.la,
    azi: { candidati: rec.r.length, stopuri: rec.r.map((x) => ({ s: x[0], intrare: x[2], atr: x[3], minBaza: x[4], stopAzi: x[5], stopBaza: x[6] })) }, evaluare,
    ...contractUmbra(evaluare, zileV, sesiuni, { cal, azi }) };
  return { jurnal, proba, rec };
}
