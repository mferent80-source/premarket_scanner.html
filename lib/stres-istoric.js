/* 20.10.2026 (I-730): stresul istoric pe portofoliul de acum — cele mai proaste 5 ferestre de 5 sesiuni ale SPY din ultimii 10 ani × beta pozițiilor
   (pe 1 an ȘI pe 6 luni ⇒ interval, nu cifră) ⇒ pierderea estimată față de bugetul săptămânii și plafonul DD din Governor (docs/politica-de-risc.md § 4).
   Pur: pagina (Jurnal → Portofoliu · risc, lib/portfolio-risk.js) dă seriile prin D.fetchStock. Estimare liniară, fără corelațiile din panică ⇒
   mai degrabă optimistă; ipoteză de risc, nu prognoză. */
(function (g) {
  'use strict';
  if (g.StresIstoric) return;
  var fin = Number.isFinite, ZILE = 5, FERESTRE = 5, MIN_ZILE = 40;
  function inchideri(bars) { return (Array.isArray(bars) ? bars : []).filter(function (b) { return b && fin(b.t) && fin(b.c) && b.c > 0; }).map(function (b) { return { t: b.t, c: b.adjustedClose > 0 ? b.adjustedClose : b.c }; }); }
  /** Cele mai proaste n ferestre de `zile` sesiuni (fără suprapunere), randament simplu, crescător (cea mai rea prima). */
  function ferestre(spyBars, zile, n) {
    zile = zile || ZILE; n = n || FERESTRE;
    var c = inchideri(spyBars), toate = [], i;
    for (i = zile; i < c.length; i++) toate.push({ de: c[i - zile].t, la: c[i].t, ret: c[i].c / c[i - zile].c - 1 });
    toate.sort(function (a, b) { return a.ret - b.ret; });
    var alese = [];
    for (i = 0; i < toate.length && alese.length < n; i++) { var w = toate[i]; if (!alese.some(function (a) { return w.de <= a.la && w.la >= a.de; })) alese.push(w); }
    return alese;
  }
  function randamente(bars) { var c = inchideri(bars), m = new Map(), i; for (i = 1; i < c.length; i++) m.set(new Date(c[i].t).toISOString().slice(0, 10), c[i].c / c[i - 1].c - 1); return m; }
  /** Beta față de SPY pe ultimele `zile` sesiuni comune (sub 40 ⇒ null, necunoscut). */
  function beta(bars, spyBars, zile) {
    var a = randamente(bars), s = randamente(spyBars), z = Array.from(a.keys()).filter(function (d) { return s.has(d); }).sort().slice(-zile);
    if (z.length < MIN_ZILE) return null;
    var x = z.map(function (d) { return s.get(d); }), y = z.map(function (d) { return a.get(d); }), n = x.length, mx = 0, my = 0, cov = 0, vx = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    for (i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) * (x[i] - mx); }
    return vx > 0 ? cov / vx : null;
  }
  /* o = { spy (bare 10 ani), pozitii: [{ sym, value (moneda contului), bars (1 an) }], cont, plafonDdPct, bugetSaptPct } */
  function calculeaza(o) {
    o = o || {};
    var fer = ferestre(o.spy, ZILE, FERESTRE); if (!fer.length) return { ok: false, text: 'Seria SPY pe 10 ani nu s-a citit; stresul istoric nu se poate calcula.' };
    var poz = (o.pozitii || []).map(function (p) { var b1 = beta(p.bars, o.spy, 252), b6 = beta(p.bars, o.spy, 126); return { sym: p.sym, value: p.value, beta1: b1, beta6: b6, necunoscut: b1 == null && b6 == null }; });
    var acoperit = poz.filter(function (p) { return !p.necunoscut && fin(p.value) && p.value > 0; }), total = acoperit.reduce(function (s, p) { return s + p.value; }, 0);
    if (!acoperit.length) return { ok: false, text: 'Beta nu s-a putut calcula pentru nicio poziție (sub 40 de sesiuni comune cu SPY).', necunoscute: poz.map(function (p) { return p.sym; }) };
    var bLo = 0, bHi = 0; acoperit.forEach(function (p) { var bs = [p.beta1, p.beta6].filter(fin); bLo += Math.min.apply(null, bs) * p.value; bHi += Math.max.apply(null, bs) * p.value; });
    var cont = fin(o.cont) && o.cont > 0 ? o.cont : null;
    var scenarii = fer.map(function (w) { var a = bLo * w.ret, b = bHi * w.ret, lo = Math.min(a, b), hi = Math.max(a, b); return { de: w.de, la: w.la, spyPct: w.ret * 100, pierdereMin: lo, pierdereMax: hi, pctMin: cont ? (lo / cont) * 100 : null, pctMax: cont ? (hi / cont) * 100 : null }; });
    var rea = scenarii[0], pierdere = -rea.pierdereMin, pct = cont ? (pierdere / cont) * 100 : null; // pierderea cea mai mare = scenariul cel mai negativ, la beta cea mai mare
    return { ok: true, scenarii: scenarii, pozitii: poz, acoperit: total, necunoscute: poz.filter(function (p) { return p.necunoscut; }).map(function (p) { return p.sym; }), betaLo: bLo / total, betaHi: bHi / total, pierdereMax: pierdere, pctMax: pct, cont: cont, plafonDdPct: fin(o.plafonDdPct) ? o.plafonDdPct : null, bugetSaptPct: fin(o.bugetSaptPct) ? o.bugetSaptPct : null,
      verdict: !fin(pct) ? 'necunoscut' : fin(o.plafonDdPct) && pct >= o.plafonDdPct ? 'peste-dd' : fin(o.bugetSaptPct) && pct >= o.bugetSaptPct ? 'peste-sapt' : 'sub' };
  }
  function n1(v) { return fin(v) ? v.toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'; }
  function zi(t) { return new Date(t).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function html(r, moneda) {
    if (!r || !r.ok) return '<h3>Stresul istoric</h3><p class="muted">' + esc(r && r.text ? r.text : 'Stresul istoric nu s-a putut calcula.') + '</p>';
    var bani = function (v) { return fin(v) ? n1(v) + (moneda ? ' ' + esc(moneda) : '') : '—'; };
    var rows = r.scenarii.map(function (s) { return '<tr><td>' + esc(zi(s.de)) + ' → ' + esc(zi(s.la)) + '</td><td class="neg">' + n1(s.spyPct) + ' %</td><td class="neg">' + bani(s.pierdereMin) + ' … ' + bani(s.pierdereMax) + '</td><td>' + (fin(s.pctMin) ? n1(s.pctMin) + ' … ' + n1(s.pctMax) + ' %' : '—') + '</td></tr>'; }).join('');
    var concl = r.verdict === 'peste-dd' ? '⚠ O săptămână ca cea mai rea din 10 ani ar depăși plafonul DD (' + n1(r.plafonDdPct) + ' %): pierdere estimată până la ' + bani(r.pierdereMax) + ' (' + n1(r.pctMax) + ' % din cont).'
      : r.verdict === 'peste-sapt' ? '⚠ O săptămână ca cea mai rea din 10 ani ar depăși bugetul săptămânii (' + n1(r.bugetSaptPct) + ' %), nu și plafonul DD: pierdere estimată până la ' + bani(r.pierdereMax) + ' (' + n1(r.pctMax) + ' % din cont).'
      : r.verdict === 'sub' ? '✓ Chiar și cea mai rea săptămână din 10 ani (estimat ' + bani(r.pierdereMax) + ', ' + n1(r.pctMax) + ' % din cont) rămâne sub bugetul săptămânii și sub plafonul DD.' : 'Contul nu e cunoscut: pierderea nu se poate pune față de praguri.';
    return '<h3>Stresul istoric · cele mai proaste 5 săptămâni ale SPY din 10 ani</h3><p class="muted">× beta portofoliului de acum (' + n1(r.betaLo) + ' … ' + n1(r.betaHi) + ', pe 1 an și pe 6 luni — interval, nu cifră)' + (r.necunoscute.length ? ' · fără beta: ' + esc(r.necunoscute.join(', ')) : '') + '.</p>' +
      '<table><thead><tr><th>Fereastra</th><th>SPY</th><th>Pierderea estimată</th><th>Din cont</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p><b>' + concl + '</b> Beta liniar, fără corelațiile din panică (în stres cresc ⇒ estimarea e mai degrabă optimistă). Ipoteză de risc, nu prognoză (docs/politica-de-risc.md § 4).</p>';
  }
  g.StresIstoric = { ferestre: ferestre, beta: beta, calculeaza: calculeaza, html: html, ZILE: ZILE, FERESTRE: FERESTRE, MIN_ZILE: MIN_ZILE };
})(typeof window !== 'undefined' ? window : globalThis);
