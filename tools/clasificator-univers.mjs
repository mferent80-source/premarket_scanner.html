// I-641 (16.10.2026) — un singur clasificator antrenat pe TOT universul scannerului (nu pe un simbol), cu împărțirea pe DATE:
// toate acțiunile sunt în aceeași fereastră de timp, iar dovada se numără PE ZILE (o zi = media pe acțiunile ei), nu pe acțiuni —
// 60 de acțiuni în aceeași zi nu sunt 60 de dovezi. IPOTEZĂ: mai multe date ⇒ un tipar care se repetă între acțiuni.
// Aceiași algoritmi și aceleași reguli ca pe un simbol (fitModels din lib/holdings-classifier.js); 3 ferestre, corecție Holm pe 4.
export const VERSIUNE = 'clasificator-univers-v1';
const IDS = ['boost', 'forest', 'svm', 'vote'], H = 5;

function zi(t) { return new Date(t).toISOString().slice(0, 10); }
function statZile(perZi) { const n = perZi.length, sum = perZi.reduce((a, b) => a + b, 0), sumSq = perZi.reduce((a, b) => a + b * b, 0); return { n, sum, sumSq }; }

/** serii: { SIMBOL: { bars } } (aceeași sesiune EOD). Întoarce verdictul modelului comun + estimarea de azi pe fiecare simbol. */
export function univers(c, serii, { now = Date.now(), svmEpochs = 5, log = () => {}, spy = null, dateOf = null } = {}) {
  const C = c.HoldingsClassifier, N = c.HoldingsNeural, E = c.HoldingsNeuralEvaluation, rows = [], latest = {};
  for (const [s, { bars }] of Object.entries(serii)) { try { const d = C.dataset(bars, now); for (const r of d.rows) rows.push({ ...r, sym: s, day: zi(r.t), endDay: zi(r.end) }); latest[s] = d.latest; } catch { /* simbolul rămâne doar fără model comun */ } }
  const zile = [...new Set(rows.map((r) => r.day))].sort(), D = zile.length, idx = new Map(zile.map((d, i) => [d, i]));
  if (Object.keys(latest).length < 10 || D < 600) throw new Error('Prea puține simboluri sau zile pentru modelul comun.');
  // I-647: regimul zilei = SPY peste / sub media lui de 200 de zile, la închiderea zilei (știut la vot).
  const regimSpy = new Map(); if (Array.isArray(spy) && dateOf) { let s = 0; spy.forEach((b, i) => { s += b.c; if (i >= 200) s -= spy[i - 200].c; if (i >= 199) regimSpy.set(dateOf(b.t), b.c > s / 200 ? 'sus' : 'jos'); }); }
  const regimDe = (d) => regimSpy.get(d) || null;
  rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.sym < b.sym ? -1 : 1));
  // Aceleași proporții ca E.plan, dar pe DATE: 3 ferestre, etichetele eliminate la granițe.
  const ends = [Math.floor(D * 0.64), Math.floor(D * 0.8), D], starts = ends.map((e) => Math.floor(e * 0.8));
  const folds = [];
  let final = null;
  for (let i = 0; i < 3; i++) {
    const a = zile[Math.floor(ends[i] * 0.6)], b = zile[starts[i]], next = i < 2 ? zile[starts[i + 1]] : null, end = zile[ends[i] - 1];
    const parts = { train: rows.filter((r) => r.day < a && r.endDay < a), validation: rows.filter((r) => r.day >= a && r.day < b && r.endDay < b), test: rows.filter((r) => r.day >= b && r.day <= end && (!next || r.endDay < next)) };
    log(`fereastra ${i + 1}: antrenare ${parts.train.length} · validare ${parts.validation.length} · test ${parts.test.length}`);
    const f = C.fitModels(parts, { svmEpochs }), constant = C.prior(parts.train);
    // Zilele de test pe orizonturi separate: o zi, apoi următoarea la cel puțin 6 sesiuni distanță.
    const testZile = [...new Set(parts.test.map((r) => r.day))]; let ultim = -Infinity; const blocZile = new Set();
    for (const d of testZile) { if (idx.get(d) >= ultim + H + 1) { blocZile.add(d); ultim = idx.get(d); } }
    const bloc = parts.test.filter((r) => blocZile.has(r.day)), peZi = new Map(); for (const r of bloc) { if (!peZi.has(r.day)) peZi.set(r.day, []); peZi.get(r.day).push(r); }
    const ll = (p, y) => -Math.log(Math.max(1e-12, p[y]));
    const refs = { test: { constant: N.metrics(parts.test, () => constant), momentum: N.metrics(parts.test, C.momentum) }, bloc: { constant: N.metrics(bloc, () => constant), momentum: N.metrics(bloc, C.momentum) } };
    const refFn = refs.bloc.momentum.loss < refs.bloc.constant.loss ? C.momentum : () => constant;
    const algos = {};
    for (const id of IDS) {
      const p = f[id].predict, cache = new Map(), pr = (r) => { if (!cache.has(r)) cache.set(r, p(r.x)); return cache.get(r); };
      const test = N.metrics(parts.test, p), diff = [...peZi.values()].map((rs) => rs.reduce((s, r) => s + ll(refFn(r.x), r.y) - ll(pr(r), r.y), 0) / rs.length);
      const zileBani = (k) => [...peZi.values()].map((rs) => C.trades(rs, p, k)).filter((xs) => xs.length).map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
      const regimZi = [...peZi.keys()].map((d) => regimDe(d)), felie = (r) => statZile(diff.filter((_, k) => regimZi[k] === r));
      algos[id] = { test, advantage: N.edge(test, refs.test.constant, refs.test.momentum), zile: statZile(diff), regim: { sus: felie('sus'), jos: felie('jos') }, bani: { long: zileBani(2), short: zileBani(0) } };
    }
    const toate = [...peZi.values()].map((rs) => rs.map((r) => r.pnl).filter(Number.isFinite)).filter((xs) => xs.length).map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
    folds.push({ id: i + 1, de: parts.test[0]?.day, pana: parts.test.at(-1)?.day, randuriTest: parts.test.length, zileSeparate: peZi.size, refs: { constant: refs.test.constant.loss, momentum: refs.test.momentum.loss }, algos, toate });
    if (i === 2) final = f;
  }
  // Adunat pe cele 3 ferestre: p pe zile + Holm pe cele 4 modele; „experimental” = avantaj în toate 3 ferestrele ȘI Holm.
  const ps = IDS.map((id) => { const z = folds.map((f) => f.algos[id].zile), st = { n: z.reduce((a, s) => a + s.n, 0), sum: z.reduce((a, s) => a + s.sum, 0), sumSq: z.reduce((a, s) => a + s.sumSq, 0) }; return C.pValue(st); });
  const holm = C.holm(ps), rez = {};
  IDS.forEach((id, k) => {
    const wins = folds.filter((f) => f.algos[id].advantage).length;
    rez[id] = { wins, p: ps[k], holmPass: holm[k], consistent: wins === 3 && holm[k], loss: folds.map((f) => f.algos[id].test.loss), balanced: folds.map((f) => f.algos[id].test.balanced),
      bani: { long: C.money(folds.flatMap((f) => f.algos[id].bani.long)), short: C.money(folds.flatMap((f) => f.algos[id].bani.short)) } };
  });
  // Pe regim: votul pe cele două felii, p pe zile, Holm pe 2.
  const pReg = ['sus', 'jos'].map((r) => { const z = folds.map((f) => f.algos.vote.regim[r]); return C.pValue({ n: z.reduce((a, s) => a + s.n, 0), sum: z.reduce((a, s) => a + s.sum, 0), sumSq: z.reduce((a, s) => a + s.sumSq, 0) }); }), hReg = C.holm(pReg);
  const regimRez = regimSpy.size ? Object.fromEntries(['sus', 'jos'].map((r, k) => { const z = folds.map((f) => f.algos.vote.regim[r]), n = z.reduce((a, s) => a + s.n, 0); return [r, { zile: n, medie: n ? z.reduce((a, s) => a + s.sum, 0) / n : null, p: pReg[k], holmPass: hReg[k] }]; })) : null;
  const v = rez.vote, state = v.consistent ? 'research' : v.wins > 0 || v.holmPass ? 'fragile' : 'no-edge';
  const message = state === 'research' ? 'Modelul comun bate frecvențele și momentum în toate cele 3 ferestre și trece corecția Holm pe zile. Direcție experimentală.' : state === 'fragile' ? 'Modelul comun are avantaj doar în unele ferestre sau doar într-o verificare; nu e confirmat pe zile.' : 'Modelul comun nu bate frecvențele claselor și momentum pe zile. Mai multe date nu au adus un tipar care se repetă.';
  const curent = {}; for (const [s, x] of Object.entries(latest)) { curent[s] = Object.fromEntries(IDS.map((id) => { const p = final[id].predict(x); return [id, { support: p, classIndex: p.indexOf(Math.max(...p)) }]; })); }
  return { version: VERSIUNE, regim: regimRez, simboluri: Object.keys(latest).length, randuri: rows.length, zile: D, state, message, algos: rez, toate: C.money(folds.flatMap((f) => f.toate)), ferestre: folds.map((f) => ({ id: f.id, de: f.de, pana: f.pana, randuriTest: f.randuriTest, zileSeparate: f.zileSeparate, refs: f.refs, castiga: Object.fromEntries(IDS.map((id) => [id, f.algos[id].advantage])) })), curent };
}
