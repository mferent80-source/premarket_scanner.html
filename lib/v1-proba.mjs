// 18.10.2026 — Proba în timp a Reguli V1 (protocolul: docs/v1-proba-protocol.md, scris ÎNAINTE de date). Funcții pure:
// înregistrarea zilei din raportul scannerului, excesul față de reper la k sesiuni, perioadele care nu se suprapun și testul semnelor.
export const PROTOCOL = Object.freeze({
  id: 'v1-proba-1', scrisLa: '2026-10-18', orizonturi: Object.freeze([5, 20]), principal: 20,
  perioadeMin: 8, minPeGrup: 3, alfa: 0.05, pragSus: 6,
  // lista Core a Premarket Scanner (candidate-engine/engine.js, US_CORE + EU_CORE) înghețată pe 18.10.2026
  univers: Object.freeze([
    'AAPL','MSFT','NVDA','AVGO','AMD','MU','INTC','WDC','AMAT','LRCX','KLAC','QCOM','TSM',
    'PLTR','CRWD','PANW','SNOW','AMZN','META','GOOGL','NFLX','TSLA','COIN','HOOD','SOFI',
    'JPM','BAC','XOM','CVX','CAT','BA','GE','RTX','UNH','LLY','PFE','NVO','PYPL','EL',
    'UPS','APLD','CIFR','MARA','RIOT','NKE','SBUX','DG','TGT','DIS','RIVN','LCID','ROKU',
    'ENPH','SEDG','ON','SMCI','MRVL','CRM','ADBE','PATH','U','DKNG','CHWY','ETSY','JD','BABA','PDD',
    'ASML.AS','SAP.DE','RHM.DE','VOW3.DE','MBG.DE','BAYN.DE','SIE.DE','AIR.PA','SU.PA',
    'MC.PA','TTE.PA','OR.PA','NOVO-B.CO','MIGA.MU','IFX.DE','ADS.DE','ALV.DE','DTE.DE'
  ])
});
const COD = { research_match: 'm', rules_not_met: 'n', unverifiable: 'u' };
const ziValida = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Rândul zilei: { zi, v, la, r: [[simbol, cod, verificări trecute, data EOD, reper]] }. zi = cea mai recentă dată EOD verificată. */
export function inregistrare(report, at = Date.now()) {
  const r = (report?.items || []).filter((i) => i && typeof i.symbol === 'string' && COD[i.verdict]).map((i) => [i.symbol, COD[i.verdict], Number.isFinite(i.passed) ? i.passed : 0, ziValida(i.sourceDate) ? i.sourceDate : null, i.metrics?.benchmarkSymbol || null]);
  const zile = r.filter((x) => x[1] !== 'u' && x[3]).map((x) => x[3]).sort();
  return { zi: zile.at(-1) || null, v: String(report?.version || ''), la: new Date(at).toISOString(), r };
}
/** Adaugă ziua; aceeași zi + aceeași versiune se înlocuiește (robotul poate rula de două ori). */
export function adauga(jurnal, rec) {
  const zile = (Array.isArray(jurnal?.zile) ? jurnal.zile : []).filter((z) => !(z.zi === rec.zi && z.v === rec.v));
  if (rec.zi) zile.push(rec);
  zile.sort((a, b) => (a.zi < b.zi ? -1 : a.zi > b.zi ? 1 : 0));
  return { protocol: PROTOCOL.id, zile };
}
/** Prețul la data d sau ultima dată ≤ d (reperul poate avea alt calendar). serie = [{ d, c }] crescător. */
function laData(serie, d) { let lo = 0, hi = serie.length - 1, out = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m].d <= d) { out = m; lo = m + 1; } else hi = m - 1; } return out; }
/** Excesul pe k sesiuni pentru fiecare acțiune verificată din zilele versiunii date. serii = { simbol: [{ d, c }] }. */
export function excese(jurnal, serii, k, versiune) {
  const out = [];
  for (const z of jurnal?.zile || []) {
    if (z.v !== versiune) continue;
    for (const [sym, cod, trecute, d, reper] of z.r) {
      if (cod === 'u' || !d || !reper) continue;
      const s = serii[sym], b = serii[reper]; if (!s || !b) continue;
      const i = s.findIndex((x) => x.d === d); if (i < 0 || i + k >= s.length) continue;
      const fin = s[i + k].d, b0 = laData(b, d), b1 = laData(b, fin); if (b0 < 0 || b1 <= b0 || b[b0].d !== d) continue;
      const rS = s[i + k].c / s[i].c - 1, rB = b[b1].c / b[b0].c - 1; if (!Number.isFinite(rS) || !Number.isFinite(rB)) continue;
      out.push({ zi: z.zi, sym, cod, trecute, ex: rS - rB });
    }
  }
  return out;
}
/** P(X ≥ pozitive | Bin(n, 1/2)) — testul semnelor, unilateral. */
export function pSemne(pozitive, n) { if (n <= 0) return 1; let p = 0, c = 1; for (let x = 0; x <= n; x++) { if (x > 0) c = (c * (n - x + 1)) / x; if (x >= pozitive) p += c; } return p / 2 ** n; }
/** Zilele de start care nu se suprapun: prima zi, apoi prima zi din jurnal aflată la ≥ k sesiuni după precedenta (sesiuni = calendarul SPY). */
export function starturi(zileJurnal, sesiuni, k) {
  const idx = new Map(sesiuni.map((d, i) => [d, i])), out = []; let ultim = -Infinity;
  for (const d of [...new Set(zileJurnal)].sort()) { const i = idx.get(d); if (i === undefined) continue; if (i - ultim >= k) { out.push(d); ultim = i; } }
  return out;
}
const medie = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/** Evaluarea pe un orizont: perioadele, testul semnelor, verdictul fixat în protocol și cifrele descriptive. */
export function evalueaza(jurnal, serii, { k, versiune, sesiuni }) {
  const rows = excese(jurnal, serii, k, versiune), peZi = new Map();
  for (const r of rows) { if (!peZi.has(r.zi)) peZi.set(r.zi, []); peZi.get(r.zi).push(r); }
  const perioade = [];
  for (const d of starturi([...peZi.keys()], sesiuni, k)) {
    const zi = peZi.get(d), sus = zi.filter((r) => r.trecute >= PROTOCOL.pragSus).map((r) => r.ex), jos = zi.filter((r) => r.trecute < PROTOCOL.pragSus).map((r) => r.ex);
    if (sus.length < PROTOCOL.minPeGrup || jos.length < PROTOCOL.minPeGrup) continue;
    const dif = medie(sus) - medie(jos); if (dif !== 0) perioade.push({ zi: d, dif, sus: sus.length, jos: jos.length });
  }
  const n = perioade.length, pozitive = perioade.filter((p) => p.dif > 0).length, p = pSemne(pozitive, n), medieDif = medie(perioade.map((x) => x.dif));
  const verdict = n < PROTOCOL.perioadeMin ? 'astept' : medieDif > 0 && p <= PROTOCOL.alfa ? 'ajuta' : 'fara-avantaj';
  const grup = (f) => { const a = rows.filter(f).map((r) => r.ex); return { n: a.length, medie: medie(a) }; };
  return { k, principal: k === PROTOCOL.principal, perioade: n, necesare: PROTOCOL.perioadeMin, pozitive, p, medieDif, verdict,
    descriptiv: { sus: grup((r) => r.trecute >= PROTOCOL.pragSus), jos: grup((r) => r.trecute < PROTOCOL.pragSus), indeplineste: grup((r) => r.cod === 'm') },
    ultimaPerioada: perioade.at(-1) || null };
}
