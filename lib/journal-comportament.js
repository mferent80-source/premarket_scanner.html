/* 27.10.2026 (I-761): tiparele de comportament din execuțiile reale — reguli DETERMINISTE pe ordinele Trading 212 (nu etichete puse de mână):
   - răzbunare: o cumpărare la mai puțin de 30 de minute după o ieșire pe pierdere;
   - mărime crescută după 2 pierderi: după două ieșiri pe pierdere la rând, o cumpărare mai mare de 1,25 × mediana ultimelor 5 cumpărări (în moneda contului);
   - pierdere peste stop: R sub −1,25 față de stopul PLANULUI (analiza salvată sau stopul pus la intrare), adică pierderea a depășit riscul cu peste 25 %;
   - „din frig”: prima cumpărare a fiecărei zile New York.
   Fiecare: n, R mediu (și al restului), trendul pe 4 săptămâni (ziua New York), id-urile tranzacțiilor pentru filtrul Raportului.
   Tiltmeter: 3 note pe zi (somn, concentrare, stres, 1–5) lângă R-ul zilei. Pragurile sunt CONVENȚII scrise înainte (docs/politica-adaugiri-C.md),
   nu avantaj dovedit; sub 10 cazuri cifrele nu spun nimic. Pur; testat în tools/journal-comportament.test.mjs. */
(function (g) {
  'use strict';
  var fin = Number.isFinite, MIN = 60000, DAY = 86400000;
  var PRAG = { revengeMin: 30, marire: 1.25, marireFereastra: 5, pesteStopR: -1.25, saptamani: 4, putine: 10 };
  var SURSE_PLAN = ['analiza', 'la-intrare'], NOTE = ['somn', 'concentrare', 'stres'];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var n1 = function (v) { return fin(v) ? F1.format(v) : '—'; };
  var semn = function (v) { var r = Math.round(Math.abs(v) * 10) / 10; return r === 0 ? '' : v > 0 ? '+' : '−'; }; // după rotunjire: −0,03 ⇒ „0,0”
  var rr = function (v) { return fin(v) ? semn(v) + n1(Math.abs(v)) + ' R' : '—'; };
  var F_NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  var ziNY = function (t) { return F_NY.format(new Date(t)); };
  function luni(zi) { var d = new Date(zi + 'T12:00:00Z'), dow = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - (dow - 1)); return d.toISOString().slice(0, 10); }
  var medie = function (xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; };
  var mediana = function (xs) { if (!xs.length) return null; var s = xs.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  /** Ordinele de cumpărare: fill-urile cu același orderId însumate; suma în moneda contului (|amount|) doar dacă e știută pe toate. */
  function ordine(rows, now) {
    var m = new Map();
    (rows || []).filter(function (x) { return x && x.id != null && (x.type == null || x.type === 'TRADE') && x.side === 'BUY' && typeof x.ticker === 'string' && fin(Date.parse(x.date)) && Date.parse(x.date) <= now; })
      .sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); })
      .forEach(function (f) {
        var k = f.ticker + '|' + String(f.orderId || f.id), o = m.get(k), a = Math.abs(Number(f.amount));
        if (!o) m.set(k, { ticker: f.ticker, t: Date.parse(f.date), ids: [String(f.id)], suma: fin(a) && a > 0 ? a : null });
        else { o.ids.push(String(f.id)); o.suma = o.suma != null && fin(a) && a > 0 ? o.suma + a : null; }
      });
    return Array.from(m.values()).sort(function (a, b) { return a.t - b.t; });
  }
  function trend(evenimente, now) {
    var w0 = luni(ziNY(now)), out = [];
    for (var k = PRAG.saptamani - 1; k >= 0; k--) { var d = new Date(w0 + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * k); out.push({ de: d.toISOString().slice(0, 10), n: 0 }); }
    evenimente.forEach(function (t) { var w = luni(ziNY(t)), o = out.find(function (x) { return x.de === w; }); if (o) o.n++; });
    return out;
  }
  function rezumat(cheie, titlu, regula, ev, tr, now) {
    // ev: [{ t, ids:[id tranzacție] }]
    var ids = []; ev.forEach(function (e) { e.ids.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); });
    var marcate = tr.filter(function (x) { return ids.indexOf(String(x.id)) >= 0; }), rest = tr.filter(function (x) { return ids.indexOf(String(x.id)) < 0; });
    var rM = marcate.map(function (x) { return x.R; }).filter(fin), rR = rest.map(function (x) { return x.R; }).filter(fin);
    return { cheie: cheie, titlu: titlu, regula: regula, n: ev.length, ids: ids, R: medie(rM), nR: rM.length, rez: marcate.reduce(function (a, x) { return a + (fin(x.rez) ? x.rez : 0); }, 0),
      restR: medie(rR), restN: rR.length, trend: trend(ev.map(function (e) { return e.t; }), now) };
  }
  /** Cele 4 detectoare. tr = tranzacțiile închise (JournalReport.calatorii + stopuriR); rows = execuțiile Trading 212. */
  function detectoare(tr, rows, opts) {
    opts = opts || {};
    var now = fin(opts.now) ? opts.now : Date.now(); tr = (tr || []).filter(function (x) { return x && fin(x.iesire); });
    var iesiri = tr.slice().sort(function (a, b) { return a.iesire - b.iesire; }), cmp = ordine(rows, now);
    var tranzDin = function (o) { return tr.filter(function (x) { return (x.buyIds || []).some(function (id) { return o.ids.indexOf(String(id)) >= 0; }); }).map(function (x) { return String(x.id); }); };
    var inainte = function (t) { return iesiri.filter(function (x) { return x.iesire < t; }); };
    var rev = [], mar = [], frig = [], zile = {};
    cmp.forEach(function (o, i) {
      var pre = inainte(o.t), ult = pre[pre.length - 1];
      if (ult && fin(ult.rez) && ult.rez < 0 && o.t - ult.iesire < PRAG.revengeMin * MIN) rev.push({ t: o.t, ids: tranzDin(o) });
      var doua = pre.slice(-2), sume = cmp.slice(0, i).map(function (x) { return x.suma; }).filter(function (v) { return v != null; }).slice(-PRAG.marireFereastra), med = mediana(sume);
      if (doua.length === 2 && doua.every(function (x) { return fin(x.rez) && x.rez < 0; }) && o.suma != null && med != null && o.suma > PRAG.marire * med) mar.push({ t: o.t, ids: tranzDin(o) });
      var z = ziNY(o.t); if (!zile[z]) { zile[z] = true; frig.push({ t: o.t, ids: tranzDin(o) }); }
    });
    var peste = tr.filter(function (x) { return SURSE_PLAN.indexOf(x.stopSursa) >= 0 && fin(x.R) && x.R < PRAG.pesteStopR; }).map(function (x) { return { t: x.iesire, ids: [String(x.id)] }; });
    var out = {
      revenge: rezumat('revenge', 'Răzbunare după pierdere', 'cumpărare la < ' + PRAG.revengeMin + ' min după o ieșire pe pierdere', rev, tr, now),
      marire: rezumat('marire', 'Mărime crescută după 2 pierderi', 'după 2 ieșiri pe pierdere la rând, cumpărare > ' + String(PRAG.marire).replace('.', ',') + ' × mediana ultimelor ' + PRAG.marireFereastra + ' cumpărări', mar, tr, now),
      pesteStop: rezumat('pesteStop', 'Pierdere peste stop', 'R sub −' + String(Math.abs(PRAG.pesteStopR)).replace('.', ',') + ' față de stopul planului (pierderea a depășit riscul cu peste 25 %)', peste, tr, now),
      frig: rezumat('frig', 'Din frig', 'prima cumpărare a zilei (ziua New York)', frig, tr, now)
    };
    out.lista = [out.revenge, out.marire, out.pesteStop, out.frig];
    return out;
  }
  function valideazaNota(n) {
    var ok = !!n && NOTE.every(function (k) { var v = Number(n[k]); return Number.isInteger(v) && v >= 1 && v <= 5; });
    return { ok: ok, erori: ok ? [] : ['Fiecare notă (somn, concentrare, stres) e un număr întreg de la 1 la 5.'] };
  }
  /** Tiltmeter: zilele notate, cu R-ul zilei (suma R a ieșirilor din ziua New York), și comparația jos (1–2) / sus (4–5) pe fiecare notă. */
  function tilt(tr, note, opts) {
    note = note && typeof note === 'object' ? note : {};
    var peZi = {};
    (tr || []).forEach(function (x) { if (!x || !fin(x.iesire)) return; var z = ziNY(x.iesire), o = peZi[z] || (peZi[z] = { R: 0, nR: 0, n: 0, rez: 0 }); o.n++; if (fin(x.R)) { o.R += x.R; o.nR++; } if (fin(x.rez)) o.rez += x.rez; });
    var zile = Object.keys(note).filter(function (z) { return /^\d{4}-\d{2}-\d{2}$/.test(z) && valideazaNota(note[z]).ok; }).sort().map(function (z) {
      var o = peZi[z]; return { zi: z, somn: +note[z].somn, concentrare: +note[z].concentrare, stres: +note[z].stres, n: o ? o.n : 0, R: o && o.nR ? o.R : null, rez: o ? o.rez : null };
    });
    var pe = {};
    NOTE.forEach(function (k) {
      var cu = zile.filter(function (z) { return z.n > 0 && fin(z.R); }), jos = cu.filter(function (z) { return z[k] <= 2; }), sus = cu.filter(function (z) { return z[k] >= 4; });
      pe[k] = { jos: { n: jos.length, R: medie(jos.map(function (z) { return z.R; })) }, sus: { n: sus.length, R: medie(sus.map(function (z) { return z.R; })) } };
    });
    return { zile: zile, pe: pe, nZile: zile.length };
  }
  /** Panoul din Raport (text HTML, totul trecut prin esc). opts: { activ: cheia filtrului activ, azi: ziua NY, notaAzi }. */
  function html(det, t, opts) {
    opts = opts || {};
    var rand = function (d) {
      var putine = d.n < PRAG.putine, tr = d.trend.map(function (w) { return w.n; }).join(' · '), on = opts.activ === d.cheie;
      return '<tr><td class="l"><b>' + esc(d.titlu) + '</b><br><small>' + esc(d.regula) + '</small></td><td>' + d.n + '</td><td class="' + (Math.round(d.R * 10) / 10 < 0 ? 'neg' : Math.round(d.R * 10) / 10 > 0 ? 'pos' : '') + '">' + rr(d.R) + (d.nR < d.n ? '<br><small>R știut la ' + d.nR + '</small>' : '') + '</td><td>' + rr(d.restR) + '<br><small>restul, n = ' + d.restN + '</small></td>' +
        '<td aria-label="Pe săptămâni, de la cea mai veche: ' + esc(tr) + '">' + esc(tr) + '</td><td>' + (putine ? '<small>prea puține cazuri (n &lt; ' + PRAG.putine + ')</small><br>' : '') +
        '<button type="button" class="btn ghost" data-jrr-det="' + esc(d.cheie) + '" aria-pressed="' + on + '"' + (d.n || on ? '' : ' disabled') + '>' + (on ? 'Arată toate' : 'Arată-le în raport') + '</button></td></tr>';
    };
    var o = '<section class="jrr-panel" aria-labelledby="jrrComp"><header><h3 id="jrrComp">Tiparele tale de comportament</h3><p>reguli deterministe pe ordinele Trading 212 — convenții scrise înainte (docs/politica-adaugiri-C.md), nu avantaj dovedit; „nu s-a dovedit” nu înseamnă „s-a dovedit că nu”</p></header>' +
      '<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th class="l">Tiparul</th><th>n</th><th>R mediu</th><th>Restul</th><th>4 săptămâni</th><th></th></tr></thead><tbody>' + det.lista.map(rand).join('') + '</tbody></table></div>';
    var na = opts.notaAzi || {}, sel = function (k, et) { var opt = '<option value="">—</option>'; for (var v = 1; v <= 5; v++) opt += '<option value="' + v + '"' + (Number(na[k]) === v ? ' selected' : '') + '>' + v + '</option>'; return '<label>' + et + ' <select data-jrr-tilt="' + k + '" aria-label="' + et + ' azi, de la 1 la 5">' + opt + '</select></label>'; };
    o += '<h4>Tiltmeter — somnul, concentrarea și stresul față de R-ul zilei</h4><div class="jrr-tilt" role="group" aria-label="Notele zilei ' + esc(opts.azi || '') + '">' + sel('somn', 'Somn') + sel('concentrare', 'Concentrare') + sel('stres', 'Stres') +
      '<button type="button" class="btn ghost" data-jrr-tilt-salveaza="' + esc(opts.azi || '') + '">Salvează notele zilei</button></div>';
    var grup = function (et, x) { return et + ' — ' + (x.n ? rr(x.R) + ' pe ' + x.n + (x.n === 1 ? ' zi' : ' zile') : 'fără zile'); };
    var cmp = function (k, et, jos, sus) { var p = t.pe[k]; return '<li>' + et + ': ' + grup(jos, p.jos) + ' · ' + grup(sus, p.sus) + (p.jos.n + p.sus.n < PRAG.putine ? ' · <small>prea puține zile ca să spună ceva</small>' : '') + '</li>'; };
    o += t.nZile ? '<ul class="jrr-lista">' + cmp('somn', 'Somn', 'slab (1–2)', 'bun (4–5)') + cmp('concentrare', 'Concentrare', 'slabă (1–2)', 'bună (4–5)') + cmp('stres', 'Stres', 'mic (1–2)', 'mare (4–5)') + '</ul>' +
      '<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th class="l">Ziua</th><th>Somn</th><th>Concentrare</th><th>Stres</th><th>R-ul zilei</th><th>Tranzacții</th></tr></thead><tbody>' +
      t.zile.slice(-14).reverse().map(function (z) { return '<tr><td class="l">' + esc(z.zi) + '</td><td>' + z.somn + '</td><td>' + z.concentrare + '</td><td>' + z.stres + '</td><td>' + rr(z.R) + '</td><td>' + z.n + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="jrr-nota">Nicio zi notată încă. Notează seara somnul, concentrarea și stresul (1–5); după 10 zile cu tranzacții apare comparația.</p>';
    return o + '</section>';
  }
  g.JournalComportament = { PRAG: PRAG, NOTE: NOTE, ordine: ordine, detectoare: detectoare, tilt: tilt, valideazaNota: valideazaNota, html: html };
})(typeof window !== 'undefined' ? window : globalThis);
