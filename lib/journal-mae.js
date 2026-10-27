/* 27.10.2026 (I-762): MAE / MFE și „cea mai bună ieșire” din barele intraday Yahoo, pentru fiecare tranzacție închisă din SUA.
   - intervalul: 1 minut când intrarea are cel mult 7 zile, 5 minute până la 60 de zile; mai vechi Yahoo nu mai are barele ⇒ se calculează la
     închidere (la cerere, butonul din Raport), nu retroactiv, iar rezultatul rămâne în cache-ul local (tt_journal_mae_v1, pe aparat);
   - fereastra: doar barele aflate INTEGRAL între intrare și ieșire, plus prețurile tale (bara intrării are și prețuri de dinainte de cumpărare,
     bara ieșirii și de după vânzare) ⇒ MAE / MFE pot fi ușor mai mici decât extremele reale din acele două bare (prudent, fără privit în viitor);
   - în R față de stopul tranzacției (intrare − stop); fără stop ⇒ doar procente; prețuri Yahoo nepotrivite (split / altă bursă) ⇒ „nepotrivit”.
   „Cea mai bună ieșire” = cel mai mare maxim din fereastră: se vede doar după, nu e o regulă realizabilă. Pur; tools/journal-mae.test.mjs. */
(function (g) {
  'use strict';
  var fin = Number.isFinite, DAY = 86400000, KEY = 'tt_journal_mae_v1', MAX = 2000, PAS = { '1m': 60000, '5m': 300000 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var semn = function (v) { return v > 0 ? '+' : v < 0 ? '−' : ''; };
  var rr = function (v) { return fin(v) ? semn(v) + F1.format(Math.abs(v)) + ' R' : '—'; };
  var pc = function (v) { return fin(v) ? semn(v) + F1.format(Math.abs(v)) + '%' : '—'; };
  var medie = function (xs) { xs = xs.filter(fin); return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; };
  var F_ZI = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Bucharest' });
  var symYahoo = function (t) { var m = /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(t || ''); return m ? m[1].replace('.', '-') : null; };

  function eligibil(row, now) {
    now = fin(now) ? now : Date.now();
    var s = row && symYahoo(row.ticker);
    if (!s) return { ok: false, motiv: 'doar acțiunile din SUA au barele intraday la Yahoo' };
    if (row.partial || row.corp || !fin(row.entry) || !fin(row.exit) || !fin(row.intrare) || !fin(row.iesire)) return { ok: false, motiv: 'intrarea sau ieșirea nu sunt întregi (vânzare parțială / split)' };
    var v = now - row.intrare;
    if (v <= 7 * DAY) return { ok: true, interval: '1m', range: '7d', simbol: s };
    if (v <= 60 * DAY) return { ok: true, interval: '5m', range: '60d', simbol: s };
    return { ok: false, motiv: 'intrarea e mai veche de 60 de zile: Yahoo nu mai are barele de 5 minute' };
  }
  function calcul(row, bars, interval) {
    var pas = PAS[interval] || 300000;
    var in_ = (Array.isArray(bars) ? bars : []).filter(function (b) { return b && fin(b.t) && fin(b.h) && fin(b.l) && b.t >= row.intrare && b.t + pas <= row.iesire; });
    if (!in_.length) return null;
    var hiB = Math.max.apply(null, in_.map(function (b) { return b.h; })), loB = Math.min.apply(null, in_.map(function (b) { return b.l; }));
    if (row.entry > hiB * 1.3 || row.entry < loB * 0.7) return { nepotrivit: true, interval: interval };
    var hi = Math.max(hiB, row.entry, row.exit), lo = Math.min(loB, row.entry, row.exit), barMax = null;
    in_.forEach(function (b) { if (b.h === hi && barMax == null) barMax = b.t; });
    var risc = fin(row.stop) && row.stop > 0 && row.stop < row.entry ? row.entry - row.stop : null, R = function (px) { return risc ? (px - row.entry) / risc : null; };
    var realR = risc ? (row.exit - row.entry) / risc : null, bestR = R(hi);
    return { interval: interval, bare: in_.length, mae: (lo / row.entry - 1) * 100, mfe: (hi / row.entry - 1) * 100, maeR: R(lo), mfeR: bestR, bestR: bestR, bestLa: barMax != null ? barMax : (hi === row.exit ? row.iesire : row.intrare),
      realR: realR, lasatR: fin(bestR) && fin(realR) ? bestR - realR : null };
  }
  function citesteCache(storage) { try { var o = JSON.parse((storage || g.localStorage).getItem(KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function scrieCache(storage, obj) {
    var chei = Object.keys(obj || {}).sort(function (a, b) { return (obj[a] && obj[a].la || 0) - (obj[b] && obj[b].la || 0); }).slice(-MAX), out = {};
    chei.forEach(function (k) { out[k] = obj[k]; });
    try { (storage || g.localStorage).setItem(KEY, JSON.stringify(out)); return true; } catch (e) { return false; }
  }
  function agregate(tr, cache) {
    var cu = (tr || []).filter(function (x) { var c = cache && cache[x.id]; return c && !c.nepotrivit; }).map(function (x) { return { x: x, c: cache[x.id] }; });
    var sum = function (xs) { return { n: xs.length, mae: medie(xs.map(function (o) { return o.c.mae; })), mfe: medie(xs.map(function (o) { return o.c.mfe; })), maeR: medie(xs.map(function (o) { return o.c.maeR; })), mfeR: medie(xs.map(function (o) { return o.c.mfeR; })), lasatR: medie(xs.map(function (o) { return o.c.lasatR; })) }; };
    var m = new Map();
    cu.forEach(function (o) { (o.x.etichete || []).forEach(function (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(o); }); });
    var castig = cu.filter(function (o) { return fin(o.x.rez) && o.x.rez > 0; });
    return { toate: sum(cu), castigatoare: sum(castig), peEticheta: Array.from(m.entries()).map(function (e) { var s = sum(e[1]); s.k = e[0]; return s; }).sort(function (a, b) { return b.n - a.n; }) };
  }
  function html(tr, cache, opts) {
    opts = opts || {};
    var a = agregate(tr, cache), ET = g.JournalReport && Array.isArray(g.JournalReport.ETICHETE) ? Object.fromEntries(g.JournalReport.ETICHETE) : {};
    var buton = '<button type="button" class="btn ghost" data-jrr-mae="1"' + (opts.eligibile ? '' : ' disabled') + '>' + (opts.eligibile ? 'Calculează din barele intraday (' + opts.eligibile + ' tranzacții de calculat)' : 'Nimic nou de calculat') + '</button>';
    var o = '<section class="jrr-panel" aria-labelledby="jrrMae"><header><h3 id="jrrMae">Cât a mers împotriva ta și în favoarea ta, din barele de 1 / 5 minute</h3><p>MAE = cea mai mare scădere, MFE = cea mai mare urcare între intrare și ieșire; la cerere, ținut pe aparat (Yahoo: 1 minut 7 zile, 5 minute 60 de zile)</p></header>' +
      '<div class="jrr-btns">' + buton + (opts.stare ? ' <span role="status">' + esc(opts.stare) + '</span>' : '') + '</div>';
    if (!a.toate.n) return o + '<p class="jrr-nota">Nicio tranzacție calculată încă. Apasă butonul după ce închizi o tranzacție (cel târziu în 60 de zile).</p></section>';
    o += '<ul class="jrr-lista"><li>' + a.toate.n + ' tranzacții: au coborât în medie <b>' + rr(a.toate.maeR) + '</b> (' + pc(a.toate.mae) + ') și au urcat <b>' + rr(a.toate.mfeR) + '</b> (' + pc(a.toate.mfe) + '); față de cea mai bună ieșire au rămas pe masă în medie <b>' + rr(a.toate.lasatR) + '</b>.</li>' +
      (a.castigatoare.n ? '<li>Câștigătoarele (' + a.castigatoare.n + ') au coborât în medie ' + rr(a.castigatoare.maeR) + ' înainte să urce — aproape de −1 R înseamnă că stopul a fost aproape atins.</li>' : '') +
      '<li><small>Cea mai bună ieșire se vede doar după: arată cât spațiu a avut prețul, nu o regulă pe care o puteai urma. ' + (a.toate.n < 10 ? 'Sub 10 tranzacții: prea puține ca să spună ceva.' : '') + '</small></li></ul>';
    if (a.peEticheta.length) o += '<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th class="l">Eticheta</th><th>n</th><th>MAE</th><th>MFE</th><th>Rămas pe masă</th></tr></thead><tbody>' +
      a.peEticheta.map(function (e) { return '<tr><td class="l">' + esc(ET[e.k] || e.k) + '</td><td>' + e.n + '</td><td>' + rr(e.maeR) + '</td><td>' + rr(e.mfeR) + '</td><td>' + rr(e.lasatR) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var ult = (tr || []).filter(function (x) { return cache && cache[x.id]; }).slice(-15).reverse();
    o += '<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th class="l">Simbol</th><th>Ieșire</th><th>Bare</th><th>MAE</th><th>MFE</th><th>Cea mai bună ieșire</th><th>Realizat</th><th>Rămas pe masă</th></tr></thead><tbody>' +
      ult.map(function (x) { var c = cache[x.id]; if (c.nepotrivit) return '<tr><td class="l"><b>' + esc(x.sym) + '</b></td><td>' + esc(F_ZI.format(x.iesire)) + '</td><td colspan="6" class="l">prețurile Yahoo nu se potrivesc (split / altă bursă)</td></tr>';
        return '<tr><td class="l"><b>' + esc(x.sym) + '</b></td><td>' + esc(F_ZI.format(x.iesire)) + '</td><td>' + esc(c.interval) + ' · ' + c.bare + '</td><td>' + pc(c.mae) + '<br><small>' + rr(c.maeR) + '</small></td><td>' + pc(c.mfe) + '<br><small>' + rr(c.mfeR) + '</small></td><td>' + rr(c.bestR) + '</td><td>' + rr(c.realR) + '</td><td>' + rr(c.lasatR) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return o + '</section>';
  }
  g.JournalMae = { KEY: KEY, eligibil: eligibil, calcul: calcul, citesteCache: citesteCache, scrieCache: scrieCache, agregate: agregate, html: html };
})(typeof window !== 'undefined' ? window : globalThis);
