/* 27.10.2026 (I-763, partea Jurnal): ziua ca unitate, nu doar tranzacția.
   - etichetele ZILEI (regim, stare, emoție; vocabular fix) și rezultatul zilelor pe fiecare etichetă (ziua New York a ieșirii);
   - „tranzacțiile ratate”: simbol, ziua, motivul, prețul de atunci (opțional) și ce a făcut prețul în 5 sesiuni după (barele zilnice);
   - heatmap-ul oră × zi al intrărilor din SUA (ora New York, aceleași trepte ca „Ora intrării”): media rezultatului și n pe celulă, culori
     divergente din token-urile Raportului (--jrr-gain / --jrr-loss, mijloc --jrr-mid; validate cu validatorul dataviz în ambele moduri),
     legendă, valoarea scrisă în fiecare celulă (tabelul e și vederea accesibilă), liniuță pe pierderi (nu doar culoarea).
   Etichetele și „ratatele” stau în setările sincronizate ale Jurnalului (zile, ratate). Pur; tools/journal-zile.test.mjs. */
(function (g) {
  'use strict';
  var fin = Number.isFinite, DAY = 86400000, MAX_ZILE = 400, MAX_RATATE = 300;
  var VOCAB = { regim: ['trend', 'lateral', 'volatil', 'zi cu știri'], stare: ['odihnit', 'obosit', 'grăbit', 'bolnav'], emotie: ['calm', 'FOMO', 'frică', 'frustrare', 'prea sigur'] };
  var NUME = { regim: 'Regimul pieței', stare: 'Starea ta', emotie: 'Emoția' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), LEI = { RON: 'lei', EUR: '€', USD: '$', GBP: '£' };
  var semn = function (v) { var r = Math.round(Math.abs(v) * 10) / 10; return r === 0 ? '' : v > 0 ? '+' : '−'; }; // după rotunjire: −0,03 ⇒ „0,0”
  var bani = function (v, m) { return fin(v) ? semn(v) + F1.format(Math.abs(v)) + ' ' + (LEI[m] || m || '') : '—'; };
  var pc = function (v) { return fin(v) ? semn(v) + F1.format(Math.abs(v)) + '%' : '—'; };
  var rr = function (v) { return fin(v) ? semn(v) + F1.format(Math.abs(v)) + ' R' : '—'; };
  var F_NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }), F_WD = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  var F_ORA = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  var ziNY = function (t) { return F_NY.format(new Date(t)); };
  var ORE = ['înainte de deschidere', '9:30–10:30', '10:30–12:00', '12:00–14:00', '14:00–16:00', 'după închidere'];
  function ora(t) { if (g.JournalReport && typeof g.JournalReport.ora === 'function') return g.JournalReport.ora(t); var p = F_ORA.format(t).split(':').map(Number), m = p[0] * 60 + p[1]; return m < 570 ? 0 : m < 630 ? 1 : m < 720 ? 2 : m < 840 ? 3 : m < 960 ? 4 : 5; }
  var ZILE_S = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri'], WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };
  var symYahoo = function (t) { var m = /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(t || ''); return m ? m[1].replace('.', '-') : null; };
  var medie = function (xs) { xs = xs.filter(fin); return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; };

  // ---------- etichetele zilei ----------
  function valideazaZi(o) {
    var chei = Object.keys(VOCAB).filter(function (k) { return o && o[k]; });
    var rau = chei.filter(function (k) { return VOCAB[k].indexOf(o[k]) < 0; });
    return { ok: chei.length > 0 && !rau.length, erori: !chei.length ? ['Alege măcar o etichetă a zilei.'] : rau.map(function (k) { return NUME[k] + ': valoare necunoscută.'; }) };
  }
  /** Patch pentru setări: ziua `zi` primește etichetele (golurile se scot); ultimele 400 de zile. */
  function cuZi(setari, zi, o) {
    var vechi = setari && setari.zile && typeof setari.zile === 'object' && !Array.isArray(setari.zile) ? setari.zile : {}, nou = {};
    Object.keys(VOCAB).forEach(function (k) { if (o && o[k]) nou[k] = o[k]; });
    var toate = Object.assign({}, vechi); toate[zi] = nou;
    var out = {}; Object.keys(toate).sort().slice(-MAX_ZILE).forEach(function (k) { out[k] = toate[k]; });
    return { zile: out };
  }
  /** Pe fiecare etichetă: câte zile, câte tranzacții închise în ele, rezultatul total și R mediu pe tranzacție. */
  function peEticheteZi(tr, zile) {
    zile = zile && typeof zile === 'object' ? zile : {};
    var peZi = {}; (tr || []).forEach(function (x) { if (!x || !fin(x.iesire)) return; var z = ziNY(x.iesire); (peZi[z] = peZi[z] || []).push(x); });
    var out = {};
    Object.keys(VOCAB).forEach(function (k) {
      var m = new Map();
      Object.keys(zile).forEach(function (z) { var v = zile[z] && zile[z][k]; if (!v || VOCAB[k].indexOf(v) < 0) return; var o = m.get(v) || { v: v, zile: 0, n: 0, rez: 0, Rs: [] }; var xs = peZi[z] || []; o.zile++; o.n += xs.length; xs.forEach(function (x) { if (fin(x.rez)) o.rez += x.rez; if (fin(x.R)) o.Rs.push(x.R); }); m.set(v, o); });
      out[k] = Array.from(m.values()).map(function (o) { return { v: o.v, zile: o.zile, n: o.n, rez: o.rez, R: medie(o.Rs) }; }).sort(function (a, b) { return a.rez - b.rez; });
    });
    return out;
  }

  // ---------- tranzacțiile ratate ----------
  function valideazaRatata(x, now) {
    now = fin(now) ? now : Date.now();
    var e = [], s = String(x && x.simbol || '').trim().toUpperCase(), z = String(x && x.zi || '');
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) e.push('Simbolul lipsește sau nu e un simbol (ex. NVDA).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(z) || !fin(Date.parse(z + 'T12:00:00Z'))) e.push('Ziua lipsește.');
    else if (z > ziNY(now)) e.push('Ziua e în viitor.');
    if (String(x && x.motiv || '').trim().length < 3) e.push('Scrie de ce n-ai intrat (cel puțin 3 caractere).');
    if (x && x.pret != null && x.pret !== '' && !(Number(x.pret) > 0)) e.push('Prețul, dacă îl scrii, e un număr pozitiv.');
    return { ok: !e.length, erori: e };
  }
  function adaugaRatata(setari, x, now) {
    var v = valideazaRatata(x, now); if (!v.ok) return v;
    var lista = Array.isArray(setari && setari.ratate) ? setari.ratate.slice() : [];
    lista.push({ id: 'rat_' + (fin(now) ? now : Date.now()) + '_' + Math.random().toString(36).slice(2, 6), simbol: String(x.simbol).trim().toUpperCase(), zi: x.zi, motiv: String(x.motiv).trim().slice(0, 300), pret: x.pret != null && x.pret !== '' ? Number(x.pret) : null });
    return { ok: true, ratate: lista.slice(-MAX_RATATE) };
  }
  /** Ce a făcut prețul în (cel mult) 5 sesiuni după ziua deciziei: față de prețul tău sau, fără el, de închiderea zilei. */
  function dupaRatata(r, bars) {
    var b = (Array.isArray(bars) ? bars : []).filter(function (x) { return x && fin(x.t) && fin(x.c) && x.c > 0; });
    var i0 = -1; for (var i = 0; i < b.length; i++) if (ziNY(b[i].t) <= r.zi) i0 = i;
    if (i0 < 0 || i0 >= b.length - 1) return null;
    var baza = fin(r.pret) && r.pret > 0 ? r.pret : b[i0].c, i5 = Math.min(b.length - 1, i0 + 5);
    if (baza > b[i0].c * 1.5 || baza < b[i0].c / 1.5) return { nepotrivit: true };
    return { pct: (b[i5].c / baza - 1) * 100, sesiuni: i5 - i0 };
  }

  // ---------- heatmap-ul oră × zi ----------
  function heatmap(tr) {
    var celule = ZILE_S.map(function () { return ORE.map(function () { return { n: 0, sum: 0, medie: null, sym: [] }; }); }), afara = 0;
    (tr || []).forEach(function (x) {
      if (!x || !fin(x.intrare) || !fin(x.rez) || !symYahoo(x.ticker)) return;
      var d = WD[F_WD.format(new Date(x.intrare))]; if (d == null) { afara++; return; }
      var c = celule[d][ora(x.intrare)]; c.n++; c.sum += x.rez; if (c.sym.length < 6) c.sym.push(x.sym || x.ticker);
    });
    var max = 0; celule.forEach(function (r) { r.forEach(function (c) { if (c.n) { c.medie = c.sum / c.n; max = Math.max(max, Math.abs(c.medie)); } }); });
    return { celule: celule, max: max, afara: afara, ore: ORE, zile: ZILE_S };
  }
  function htmlHeatmap(h, m) {
    var antet = '<tr><td></td>' + h.ore.map(function (o) { return '<th scope="col">' + esc(o) + '</th>'; }).join('') + '</tr>';
    var randuri = h.celule.map(function (r, i) {
      return '<tr><th scope="row">' + esc(h.zile[i]) + '</th>' + r.map(function (c, j) {
        if (!c.n) return '<td class="hm-gol">—</td>';
        var a = Math.round((0.2 + 0.35 * Math.min(1, Math.abs(c.medie) / (h.max || 1))) * 100) /* 20–55 %: cerneala --t1 rămâne ≥ 4,5:1 pe celulă în ambele moduri */, cls = c.medie < 0 ? 'hm-loss' : 'hm-gain';
        var tipT = h.zile[i] + ', ' + h.ore[j] + ' (ora New York)\n' + c.n + (c.n === 1 ? ' tranzacție' : ' tranzacții') + ' · media ' + bani(c.medie, m) + '\n' + c.sym.join(', ');
        return '<td class="' + cls + '" style="--a:' + a + '%" tabindex="0" data-tip="' + esc(tipT) + '"><b>' + bani(c.medie, m) + '</b><small>n = ' + c.n + '</small></td>';
      }).join('') + '</tr>';
    }).join('');
    return '<section class="jrr-panel" aria-labelledby="jrrHm"><header><h3 id="jrrHm">Când pierzi și când câștigi: ziua × ora intrării</h3><p>acțiunile din SUA · ora New York · media rezultatului pe tranzacție și câte tranzacții în fiecare celulă</p></header>' +
      '<div class="jrr-scroll"><table class="jrr-hm" aria-label="Media rezultatului pe zi a săptămânii și ora intrării">' + antet + randuri + '</table></div>' +
      '<div class="jrr-leg"><span><i class="k-gain"></i>câștig mediu</span><span><i class="k-loss"></i>pierdere medie (cu liniuță)</span><span><i class="k-mid"></i>fără tranzacții</span><span>mai intens = medie mai mare</span></div>' +
      '<p class="jrr-nota">Descriptiv: o celulă cu câteva tranzacții nu spune un obicei.' + (h.afara ? ' ' + h.afara + ' intrări în weekend nu intră în tabel.' : '') + '</p></section>';
  }

  // ---------- panoul zilei ----------
  function htmlZile(o) {
    o = o || {}; var azi = o.azi || '', ziAzi = (o.zile && o.zile[azi]) || {};
    var sel = function (k) { return '<label>' + NUME[k] + ' <select data-jrr-zi="' + k + '"><option value="">—</option>' + VOCAB[k].map(function (v) { return '<option value="' + esc(v) + '"' + (ziAzi[k] === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></label>'; };
    var h = '<section class="jrr-panel" aria-labelledby="jrrZile"><header><h3 id="jrrZile">Ziua ta: etichetele zilei și tranzacțiile ratate</h3><p>ce fel de zi a fost (ziua New York) și ce n-ai luat, cu ce a făcut prețul după — sincronizate între aparate</p></header>' +
      '<div class="jrr-tilt" role="group" aria-label="Etichetele zilei ' + esc(azi) + '">' + sel('regim') + sel('stare') + sel('emotie') + '<button type="button" class="btn ghost" data-jrr-zi-salveaza="' + esc(azi) + '">Salvează ziua</button></div>';
    var ag = o.agregat || {}, rand = [];
    Object.keys(VOCAB).forEach(function (k) { (ag[k] || []).forEach(function (x) { rand.push('<tr><td class="l">' + NUME[k] + ': <b>' + esc(x.v) + '</b></td><td>' + x.zile + '</td><td>' + x.n + '</td><td class="' + (x.rez < 0 ? 'neg' : x.rez > 0 ? 'pos' : '') + '">' + bani(x.rez, o.moneda) + '</td><td>' + rr(x.R) + '</td></tr>'); }); });
    h += rand.length ? '<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th class="l">Eticheta zilei</th><th>Zile</th><th>Tranzacții închise</th><th>Rezultat</th><th>R mediu</th></tr></thead><tbody>' + rand.join('') + '</tbody></table></div>' : '<p class="jrr-nota">Nicio zi etichetată încă: alege seara regimul, starea și emoția zilei.</p>';
    var rat = Array.isArray(o.ratate) ? o.ratate.slice().reverse() : [], dupa = o.dupa instanceof Map ? o.dupa : new Map();
    h += '<h4>Tranzacțiile ratate</h4><div class="jrr-tilt" role="group" aria-label="O tranzacție ratată">' +
      '<label>Simbol <input data-jrr-rat="simbol" maxlength="15" placeholder="NVDA" size="7"></label><label>Ziua <input data-jrr-rat="zi" type="date" value="' + esc(azi) + '"></label>' +
      '<label>Prețul de atunci <input data-jrr-rat="pret" type="number" min="0" step="0.01" inputmode="decimal" size="7"></label><label>De ce n-ai intrat <input data-jrr-rat="motiv" maxlength="300" placeholder="Governor HALTED, fără plan, ezitare…"></label>' +
      '<button type="button" class="btn ghost" data-jrr-rat-adauga="1">Notează</button></div>' + (o.mesaj ? '<p class="jrr-nota" role="status">' + esc(o.mesaj) + '</p>' : '');
    h += rat.length ? '<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th class="l">Simbol</th><th>Ziua</th><th class="l">De ce nu</th><th>Prețul</th><th>După (până la 5 sesiuni)</th><th></th></tr></thead><tbody>' +
      rat.slice(0, 30).map(function (r) { var d = dupa.get(r.id); return '<tr><td class="l"><b>' + esc(r.simbol) + '</b></td><td>' + esc(r.zi) + '</td><td class="l">' + esc(r.motiv) + '</td><td>' + (fin(r.pret) ? F1.format(r.pret) : '—') + '</td><td>' + (d ? (d.pending ? '<small>încă nicio sesiune după</small>' : d.eroare ? '<small>barele nu s-au putut citi acum</small>' : d.nepotrivit ? 'prețul nu se potrivește cu barele' : pc(d.pct) + ' <small>' + d.sesiuni + ' sesiuni</small>') : '<small>se citesc barele…</small>') + '</td><td><button type="button" class="btn ghost" data-jrr-rat-sterge="' + esc(r.id) + '" aria-label="Șterge ' + esc(r.simbol) + ' din ' + esc(r.zi) + '">✕</button></td></tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="jrr-nota">Nicio tranzacție ratată notată. Notează ce n-ai luat și de ce — după 5 sesiuni vezi ce a făcut prețul.</p>';
    return h + '</section>';
  }
  g.JournalZile = { VOCAB: VOCAB, ORE: ORE, valideazaZi: valideazaZi, cuZi: cuZi, peEticheteZi: peEticheteZi, valideazaRatata: valideazaRatata, adaugaRatata: adaugaRatata, dupaRatata: dupaRatata, heatmap: heatmap, htmlHeatmap: htmlHeatmap, htmlZile: htmlZile };
})(typeof window !== 'undefined' ? window : globalThis);
