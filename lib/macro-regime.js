/* 17.10.2026 — Regimul macro, calculat singur (Macro Dashboard s-a mutat în Crypto Radar pe 12.10, deci md_risk_regime nu se mai
   scrie pe acest site). Scorul e COPIAT FIDEL din crypto/public/lib/macro.js (funcțiile bare, legatura, scor, TREPTE — aceleași
   praguri ca Macro Dashboard-ul vechi, v193): VIX + dobânda pe 10 ani + dolarul + legătura BTC–S&P + frica crypto.
   O schimbare de prag acolo se copiază și aici (testul tools/macro-regime.test.mjs fixează câteva cazuri).
   Datele: Yahoo (^VIX, ^TNX, DX-Y.NYB, SPY, BTC-USD, zilnic) + alternative.me (Fear & Greed). Fără histerezis (acela ține de alertele
   Radarului); aici e citirea zilei. */
(function (global) {
  'use strict';
  const TREPTE = [
    { min: 4, cod: 'riskon', text: 'pofta de risc mare (risk-on)', stare: 'bine', banda: 5 },
    { min: 1, cod: 'inclinat', text: 'înclinat spre risc', stare: 'bine', banda: 4 },
    { min: -2, cod: 'neutru', text: 'neutru', stare: 'info', banda: 3 },
    { min: -5, cod: 'prudent', text: 'prudent', stare: 'atentie', banda: 2 },
    { min: -8, cod: 'riskoff', text: 'fuga de risc (risk-off)', stare: 'rau', banda: 1 },
    { min: -Infinity, cod: 'stres', text: 'stres', stare: 'rau', banda: 0 },
  ];
  const PARTIAL = { cod: 'partial', text: 'date parțiale', stare: 'info', banda: null };
  const LUNA = 21;
  const fin = (x) => typeof x === 'number' && isFinite(x);
  const nr = (v, z) => Math.abs(v).toFixed(z).replace('.', ',');
  const sg = (v, z) => (v >= 0 ? '+' : '−') + nr(v, z);
  function bare(l) {
    return (Array.isArray(l) ? l : []).map((x) => ({ t: Number(x && (x.t != null ? x.t : x.time)), c: Number(x && (x.c != null ? x.c : x.close)) }))
      .filter((x) => fin(x.t) && fin(x.c) && x.c > 0).sort((a, b) => a.t - b.t);
  }
  const zi = (t) => new Date(t).toISOString().slice(0, 10);
  function legatura(spy, btc) {
    const m = new Map(btc.map((x) => [zi(x.t), x.c])), al = spy.filter((x) => m.has(zi(x.t))).map((x) => [x.c, m.get(zi(x.t))]).slice(-31);
    const a = [], b = []; for (let i = 1; i < al.length; i++) { a.push(al[i][0] / al[i - 1][0] - 1); b.push(al[i][1] / al[i - 1][1] - 1); }
    if (a.length < 10) return null;
    const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
    let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da > 0 && db > 0 ? n / Math.sqrt(da * db) : null;
  }
  function treaptaDin(s) { for (const t of TREPTE) if (s >= t.min) return t; return TREPTE[TREPTE.length - 1]; }
  // d = { vix, tnx, dxy, spy, btc (bare), fg: {valoare} }
  function scor(d) {
    if (!d || typeof d !== 'object') return null;
    const vixB = bare(d.vix), tnxB = bare(d.tnx), dxyB = bare(d.dxy), spyB = bare(d.spy), btcB = bare(d.btc), semne = [];
    const vix = vixB.length ? vixB[vixB.length - 1].c : null;
    semne.push(!fin(vix) ? { cod: 'vix', ce: 'VIX · frica bursei', ok: false, scor: 0, valoare: '—', text: 'lipsește' }
      : Object.assign({ cod: 'vix', ce: 'VIX · frica bursei', ok: true, valoare: nr(vix, 1), v: vix }, vix < 12 ? { scor: 1, text: 'liniște prea mare (atenție la întoarcere)' } : vix < 18 ? { scor: 2, text: 'calm' } : vix < 25 ? { scor: -1, text: 'prudență' } : vix < 30 ? { scor: -2, text: 'frică' } : { scor: -3, text: 'stres' }));
    const bp = tnxB.length > LUNA ? (tnxB[tnxB.length - 1].c - tnxB[tnxB.length - 1 - LUNA].c) * 100 : null;
    semne.push(!fin(bp) ? { cod: 'dobanda', ce: 'Dobânda SUA 10 ani', ok: false, scor: 0, valoare: '—', text: 'lipsește' }
      : Object.assign({ cod: 'dobanda', ce: 'Dobânda SUA 10 ani', ok: true, valoare: sg(Math.round(bp), 0) + ' pb într-o lună', v: bp }, bp < -25 ? { scor: -2, text: 'scade tare (teamă de recesiune)' } : bp < -10 ? { scor: -1, text: 'scade' } : bp > 25 ? { scor: -1, text: 'urcă tare (dobânzi mai mari)' } : bp > 10 ? { scor: 0, text: 'urcă puțin' } : { scor: 1, text: 'stabilă' }));
    const dx = dxyB.length > LUNA ? (dxyB[dxyB.length - 1].c / dxyB[dxyB.length - 1 - LUNA].c - 1) * 100 : null;
    semne.push(!fin(dx) ? { cod: 'dolar', ce: 'Dolarul (DXY)', ok: false, scor: 0, valoare: '—', text: 'lipsește' }
      : Object.assign({ cod: 'dolar', ce: 'Dolarul (DXY)', ok: true, valoare: sg(dx, 1) + '% într-o lună', v: dx }, dx > 1.5 ? { scor: -1, text: 'în creștere (apasă pe risc)' } : dx < -1.5 ? { scor: 1, text: 'în scădere (ajută riscul)' } : { scor: 0, text: 'plat' }));
    const rho = spyB.length && btcB.length ? legatura(spyB, btcB) : null;
    semne.push(!fin(rho) ? { cod: 'btcSp', ce: 'BTC față de S&P', ok: false, scor: 0, valoare: '—', text: 'lipsește' }
      : Object.assign({ cod: 'btcSp', ce: 'BTC față de S&P', ok: true, valoare: 'legătura ' + (rho < 0 ? '−' : '') + nr(rho, 2) + ' pe 30 de zile', v: rho }, rho > 0.6 ? { scor: 1, text: 'merg împreună (BTC = activ de risc)' } : rho > 0.2 ? { scor: 0, text: 'parțial legate' } : rho > -0.2 ? { scor: -1, text: 'decuplate' } : { scor: -2, text: 'în sens opus' }));
    const fg = d.fg && fin(Number(d.fg.valoare)) ? Number(d.fg.valoare) : null;
    semne.push(fg === null ? { cod: 'frica', ce: 'Frica / lăcomia crypto', ok: false, scor: 0, valoare: '—', text: 'lipsește' }
      : Object.assign({ cod: 'frica', ce: 'Frica / lăcomia crypto', ok: true, valoare: String(Math.round(fg)), v: fg }, fg > 70 ? { scor: 2, text: 'lăcomie' } : fg > 55 ? { scor: 1, text: 'spre lăcomie' } : fg >= 45 ? { scor: 0, text: 'neutru' } : fg >= 30 ? { scor: -1, text: 'spre frică' } : { scor: -2, text: 'frică' }));
    const valide = semne.filter((x) => x.ok).length, s = semne.reduce((a, x) => a + x.scor, 0), partial = valide < 3;
    return { semne, scor: s, valide, partial, treapta: partial ? PARTIAL : treaptaDin(s) };
  }
  /** Fear & Greed (alternative.me) → { valoare, la } sau null. */
  function fgDin(j) { const x = j && Array.isArray(j.data) ? j.data[0] : null, v = x ? Number(x.value) : NaN; return fin(v) ? { valoare: v, la: Number(x.timestamp) * 1000 || null } : null; }
  global.MacroRegime = { TREPTE, scor, bare, legatura, treaptaDin, fgDin };
})(typeof window !== 'undefined' ? window : globalThis);
