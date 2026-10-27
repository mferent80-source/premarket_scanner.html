/* 19.10.2026 (I-719): căldura portofoliului, verificată înainte de orice plan nou (din scanner sau idee proprie).
   Riscul deschis până la stopuri = pozițiile reale Trading 212 cu stop valabil (stopRisk din T212Capital.build, care folosește
   StopSetter.stopValabil) + planurile Shadow deschise (PLANNED / TRIGGERED) + planul nou ≤ plafonul din Governor
   (maxHeatPct, implicit 4 % din cont). O poziție fără stop valabil = risc NECUNOSCUT, nu 0 ⇒ planul nou se blochează.
   Corelația pe 90 de zile (randamente zilnice log, seriile din D.fetchStock cu cache) ⇒ cel mult 2 poziții din același grup
   (r ≥ 0,7 cu simbolul nou). Pragurile (4 %, 0,7, 2) sunt alegeri PRUDENTE, nu un optim măsurat.
   27.10.2026 (I-753, auditul D): o pereche cu seria lipsă nu mai trece tăcut — e numită („corelație neverificată cu X”) și riscul planului
   se înmulțește cu 0,75 (MULT_NEVERIFICAT, regulă de prudență scrisă în docs/politica-adaugiri-D.md); ca înainte, seria simbolului NOU lipsă cu
   ≥ 2 poziții ⇒ blocat, acum cu `reincearca` (Planuri recitește singur după 30 s). */
(function (g) {
  'use strict';
  if (g.TTCaldura) return;
  var PRAG = 0.7, MAX_GRUP = 2, ZILE = 90, MIN_ZILE = 60, PLAFON = 4, MULT_NEVERIFICAT = 0.75;
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function usd(v) { return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function pct(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
  function r2(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  function simbolDinTicker(t) { var m = /^([A-Z][A-Z0-9.]{0,6})_US_EQ$/.exec(String(t || '')); return m ? m[1].replace('.', '-') : null; }
  function riscPlan(p) {
    if (!p || (p.status !== 'PLANNED' && p.status !== 'TRIGGERED') || !(p.shares > 0) || !(p.stop > 0)) return 0;
    var v = p.status === 'TRIGGERED' ? ((p.fillEntry != null ? p.fillEntry : p.entry) - p.stop) * p.shares : p.risk;
    return fin(v) && v > 0 ? v : 0;
  }
  /* o = { broker (T212Capital.build sau null), rate (1 USD în moneda contului), plans, contUsd, plafonPct, peHartie (I-723: tickerele cu stop documentat fără ordin la broker; null = necitit) } — totul în USD */
  function riscDeschis(o) {
    o = o || {};
    var plafonPct = fin(o.plafonPct) && o.plafonPct > 0 && o.plafonPct <= 100 ? o.plafonPct : PLAFON, cont = o.contUsd;
    if (!(cont > 0)) return { ok: false, necunoscute: [], text: 'Căldura portofoliului: capitalul contului nu e cunoscut — plafonul nu poate fi verificat.' };
    var real = 0, necunoscute = [], planuri = 0;
    if (o.broker) (o.broker.rows || []).forEach(function (r) { if (fin(r.stopRisk) && r.stopRisk >= 0 && o.rate > 0) real += r.stopRisk / o.rate; else necunoscute.push(r.ticker); });
    (o.plans || []).forEach(function (p) { planuri += riscPlan(p); });
    var deschis = real + planuri, plafon = cont * plafonPct / 100, loc = Math.max(0, plafon - deschis);
    var hartie = Array.isArray(o.peHartie) ? o.peHartie.filter(Boolean) : null;
    var out = { ok: false, necunoscute: necunoscute, realUsd: real, planuriUsd: planuri, deschisUsd: deschis, plafonUsd: plafon, plafonPct: plafonPct, locUsd: loc, contUsd: cont, peHartie: hartie };
    var notaHartie = hartie && hartie.length ? ' · stop doar pe hârtie (fără ordin la broker): ' + hartie.map(function (t) { return simbolDinTicker(t) || t; }).join(', ') + ' — riscul lor e socotit aici, dar nu se execută singur' : '';
    var baza = 'Căldura portofoliului: deschis până la stopuri ' + usd(deschis) + ' USD (' + pct(deschis / cont * 100) + ' % din cont: reale ' + usd(real) + ' + Shadow ' + usd(planuri) + ') · plafon ' + pct(plafonPct) + ' % = ' + usd(plafon) + ' USD';
    if (necunoscute.length) { out.text = 'Căldura portofoliului: ' + necunoscute.length + (necunoscute.length === 1 ? ' poziție' : ' poziții') + ' fără stop valabil (' + necunoscute.map(function (t) { return simbolDinTicker(t) || t; }).join(', ') + ') — riscul lor e necunoscut, nu zero; pune stopurile în Analiza deținerilor înainte de un plan nou.'; return out; }
    if (loc <= 0) { out.text = baza + ' — fără loc pentru risc nou.' + notaHartie; return out; }
    out.ok = true; out.text = baza + ' · loc pentru planul nou ' + usd(loc) + ' USD (prag prudent, nu optim).' + notaHartie;
    return out;
  }
  function inchideri(bars) {
    var m = new Map();
    (Array.isArray(bars) ? bars : []).forEach(function (b) { var c = b && (b.adjustedClose > 0 ? b.adjustedClose : b.c); if (b && fin(b.t) && c > 0) m.set(new Date(b.t).toISOString().slice(0, 10), c); });
    return m;
  }
  /* Pearson pe ultimele `zile` randamente zilnice comune (aliniate pe dată); sub 60 de zile comune ⇒ null (necunoscut) */
  function corelatie(a, b, zile) {
    zile = zile || ZILE;
    var A = inchideri(a), B = inchideri(b), comune = Array.from(A.keys()).filter(function (k) { return B.has(k); }).sort();
    if (comune.length < MIN_ZILE + 1) return null;
    comune = comune.slice(-(zile + 1));
    var x = [], y = [], i;
    for (i = 1; i < comune.length; i++) { x.push(Math.log(A.get(comune[i]) / A.get(comune[i - 1]))); y.push(Math.log(B.get(comune[i]) / B.get(comune[i - 1]))); }
    var n = x.length, mx = 0, my = 0, sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    for (i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    if (!(sxx > 0) || !(syy > 0)) return null;
    var r = sxy / Math.sqrt(sxx * syy);
    return fin(r) ? { r: r, n: n } : null;
  }
  function unice(xs) { var s = new Set(), out = []; (xs || []).forEach(function (x) { if (x && !s.has(x)) { s.add(x); out.push(x); } }); return out; }
  /* serii: Map simbol → bare zilnice (sau null); peers: simbolurile pozițiilor deschise (reale + Shadow) */
  function evalueazaGrup(sym, serii, peers) {
    var nou = serii.get(sym) || null, lista = unice(peers), corelate = [], necunoscute = [];
    lista.forEach(function (p) {
      if (p === sym) { corelate.push({ sym: p, r: 1 }); return; }
      var c = nou && serii.get(p) ? corelatie(nou, serii.get(p)) : null;
      if (!c) necunoscute.push(p); else if (c.r >= PRAG) corelate.push({ sym: p, r: c.r });
    });
    var nume = corelate.map(function (c) { return c.sym + ' ' + r2(c.r); }).join(', '), nec = necunoscute.length ? ' · corelație neverificată cu ' + necunoscute.join(', ') + ' (seria zilnică nu s-a citit): risc ×0,75, regulă de prudență' : '';
    if (corelate.length >= MAX_GRUP) return { blocat: true, corelate: corelate, necunoscute: necunoscute, text: sym + ' e corelat (r ≥ 0,7 pe 90 de zile) cu ' + nume + ' — ar fi a ' + (corelate.length + 1) + '-a poziție din același grup (maximum ' + MAX_GRUP + ', prag prudent); fără plan nou.' };
    if (!nou && lista.length >= MAX_GRUP) return { blocat: true, reincearca: true, corelate: corelate, necunoscute: necunoscute, text: 'Corelația nu s-a putut verifica: seria zilnică pentru ' + sym + ' nu s-a citit și ai ' + lista.length + ' poziții deschise — blocat până se poate verifica (se reîncearcă după 30 de secunde).' };
    if (!lista.length) return { blocat: false, neverificat: false, mult: 1, corelate: corelate, necunoscute: necunoscute, text: 'Corelație: nicio poziție deschisă.' };
    return { blocat: false, neverificat: necunoscute.length > 0, mult: necunoscute.length ? MULT_NEVERIFICAT : 1, corelate: corelate, necunoscute: necunoscute, text: 'Corelație pe 90 de zile: ' + (corelate.length ? 'legat de ' + nume + ' (1 din maximum ' + MAX_GRUP + ' în grup)' : 'nicio poziție deschisă legată (r ≥ 0,7)') + nec + '.' };
  }
  /* serieFn(simbol) ⇒ Promise<bare zilnice> (D.fetchStock cu cache); erorile devin „necunoscut” */
  async function grup(sym, peers, serieFn) {
    var lista = unice(peers);
    if (!lista.length) return evalueazaGrup(sym, new Map(), []);
    var toate = unice([sym].concat(lista)), rez = await Promise.all(toate.map(function (s) { return Promise.resolve().then(function () { return serieFn(s); }).catch(function () { return null; }); })), m = new Map();
    toate.forEach(function (s, i) { m.set(s, Array.isArray(rez[i]) && rez[i].length ? rez[i] : null); });
    return evalueazaGrup(sym, m, lista);
  }
  g.TTCaldura = { riscDeschis: riscDeschis, corelatie: corelatie, evalueazaGrup: evalueazaGrup, grup: grup, simbolDinTicker: simbolDinTicker, PRAG: PRAG, MAX_GRUP: MAX_GRUP, ZILE: ZILE, PLAFON: PLAFON, MULT_NEVERIFICAT: MULT_NEVERIFICAT };
})(typeof window !== 'undefined' ? window : globalThis);
