// radar-ecran.js — sectiunile "Din Radar" de pe pagina alerts (v116, 27.09.2026): pozitiile Trading 212, botii Pionex si
// simbolurile tale, randate din poza colectorului (lib/radar-poza.js). Functiile de calcul sunt pure (testate in
// tools/radar-ecran.test.mjs); randeaza() doar construieste HTML si il pune in container. Aceleasi randuri ca in demo-ul aprobat.
var RadarEcran = (function () {
  'use strict';
  var NIV = { iesi: 'IEȘI', atentie: 'ATENȚIE', tine: 'ȚINE' };
  var RECOM = { strong_buy: 'cumpără hotărât', buy: 'cumpără', hold: 'ține', sell: 'vinde', none: 'fără', underperform: 'sub piață', strong_sell: 'vinde hotărât' };
  var LUNI = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'];
  var RADAR_ACASA = 'http://127.0.0.1:8788/';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nr(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function bani(v, m, z) { return nr(v) === null ? '—' : (m || '$') + v.toFixed(z == null ? 2 : z).replace('.', ','); }
  function lei(v) { return nr(v) === null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('ro-RO') + ' lei'; }
  function usdt(v) { return nr(v) === null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',') + ' USDT'; }
  function pct(v, z) { return nr(v) === null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(z == null ? 1 : z).replace('.', ',') + '%'; }
  function cls(v) { return nr(v) === null ? '' : v >= 0 ? 'good' : 'bad'; }
  function mii(v) { v = nr(v) || 0; return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mil.' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + ' k' : String(Math.round(v)); }
  function dataRo(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? String(+m[3]) + ' ' + LUNI[+m[2] - 1] : '—'; }
  // preturi crypto: 2 zecimale peste 100, pana la 4 (fara zerouri de umplutura) intre 1 si 100, 4 cifre semnificative sub 1
  function pretMic(v, m) { return nr(v) === null ? '—' : (m || '') + (Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 1 ? String(parseFloat(v.toFixed(4))) : v.toPrecision(4)).replace('.', ','); }
  function spark(v, w, h) {
    if (!Array.isArray(v) || v.length < 2) return ''; w = w || 120; h = h || 32;
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), r = (mx - mn) || 1;
    var pts = v.map(function (y, i) { return [(i / (v.length - 1)) * w, h - 3 - (y - mn) / r * (h - 6)]; });
    var d = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), col = v[v.length - 1] >= v[0] ? 'var(--good)' : 'var(--bad)', e = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,' + h + ' ' + d + ' ' + w + ',' + h + '" fill="' + col + '" opacity=".12"/><polyline points="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="' + e[0].toFixed(1) + '" cy="' + e[1].toFixed(1) + '" r="2.6" fill="' + col + '"/></svg>';
  }
  function baraAzi(v) { v = nr(v) || 0; var lat = Math.min(50, Math.abs(v) / 0.04 * 50).toFixed(1); return '<span class="azi" aria-hidden="true"><i class="' + (v < 0 ? 'n' : '') + '" style="' + (v < 0 ? 'right:50%' : 'left:50%') + ';width:' + lat + '%"></i></span>'; }
  function judecaT212(p) {
    var pret = nr(p.pret), plan = p.plan || null, stop = plan ? nr(plan.stop) : null;
    var dStop = stop !== null && pret ? stop / pret - 1 : null, depasit = stop !== null && pret !== null && pret < stop;
    var pctLei = nr(p.pctLei), pctPret = nr(p.pctPret);
    return { pret: pret, zi: pret && nr(p.prev) ? pret / p.prev - 1 : null, l30: pret && p.closes30 && p.closes30.length > 1 ? pret / p.closes30[0] - 1 : null, stop: stop, dStop: dStop, depasit: depasit,
      pct: pctLei !== null ? pctLei : pctPret, pctFel: pctLei !== null ? 'lei' : 'preț', tinta: plan ? nr(plan.tinta) : null, max: plan ? nr(plan.max) : null };
  }
  function insText(i, cuCheie) {
    if (!i) return cuCheie ? { t: '⚪ încă nimic', c: 'neut', m: 'vine cu poza următoare (sau Yahoo n-a dat nimic)' } : { t: '⚪ cere cheia', c: 'neut', m: 'insiderii vin din poza Radarului' };
    if (!i.form4) return { t: 'fără Form 4', c: 'neut', m: 'bursă germană, fără raportări SEC' };
    if (i.verdict === 'bull') return { t: '🟢 cumpără în grup', c: 'bull', m: i.bp + ' persoane · net +' + mii(i.net) + ' acț.' };
    if (i.verdict === 'bull1') return { t: '🟢 cumpără', c: 'bull1', m: i.bp + ' persoană · +' + mii(i.net) + ' acț.' };
    if (i.verdict === 'bear') return { t: '🔴 vând', c: 'bear', m: i.sells + ' vânzări · ' + i.sp + ' persoane · net −' + mii(-i.net) + ' acț.' };
    return { t: '⚪ liniște', c: 'neut', m: i.n60 ? i.buys + ' cumpărări · ' + i.sells + ' vânzări' : 'nicio tranzacție în 60 z' };
  }
  function pill(niv) { return niv && NIV[niv] ? '<span class="pill ' + niv + '">' + NIV[niv] + '</span>' : '<span class="pill fara">FĂRĂ DATE</span>'; }
  // pretul "acum": din poza; daca pagina are o cotatie mai noua pentru simbol, ea castiga
  function acumDin(p, live) {
    var l = live && live[String(p.s || '').toUpperCase()];
    if (l && nr(l.pret) !== null && (!nr(p.la) || !nr(l.la) || l.la >= p.la)) return { pret: l.pret, prev: nr(l.prev) !== null ? l.prev : p.prev, live: true, chip: l.chip || '' };
    return { pret: p.pret, prev: p.prev, live: false, chip: '' };
  }
  // I-459: pe pozitii castiga pretul din Trading 212 (poza) cat e proaspat (sub 10 min) - e cifra din aplicatia lor, la care se executa;
  // cand poza e veche, cotatia live a paginii (Yahoo, cu chip-ul ei de sesiune)
  var T212_PROASPAT = 10 * 60000;
  function acumT212(p, live, acum) {
    if (nr(p.pret) !== null && nr(p.la) !== null && acum - p.la < T212_PROASPAT) {
      var m = Math.max(0, Math.round((acum - p.la) / 60000));
      return { pret: p.pret, prev: p.prev, live: false, chip: '<span class="px-sess t212" title="prețul din Trading 212, citit acum ' + m + ' min">T212</span>' };
    }
    return acumDin(p, live);
  }
  // adresa tunelului vine din poza: in href intra DOAR http(s) (nu javascript:/data:), altfel adresa de acasa
  function radarAcasa(poza) {
    try { if (poza && poza.radarUrl) { var u = new URL(String(poza.radarUrl)); if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin + '/'; } } catch (e) {}
    return RADAR_ACASA;
  }
  function radarNota(poza, parola) {
    return (poza && poza.radarUrl ? 'merge și de pe telefon, prin tunelul Radarului' : 'merge doar acasă, pe PC-ul cu Radarul')
      + (parola ? '' : ' · pune parola Radarului sus (🔐), altfel Radarul ți-o cere la fiecare adresă nouă a tunelului');
  }
  // v126 (el, 28.09: „când dau clic Deschide în Radar îmi dă erori”): tunelul are adresă NOUĂ la fiecare pornire a lansatorului, deci
  // browserul n-are parola acolo (401 la tot). Parola pusă o dată aici pleacă în link DUPĂ # (nu ajunge la niciun server); Radarul
  // (v100.8) o ține minte, o scoate din bară și deschide ecranul cerut.
  function radarLink(poza, ecran, parola) {
    return radarAcasa(poza) + (parola ? '#parola=' + encodeURIComponent(parola) + '&ecran=' + ecran : '#ecran=' + ecran);
  }
  // insiderii pe 60 de zile, in randul desfacut (aceeasi regula la simboluri si, din v126, la pozitiile T212)
  function blocInsideri(i, cuCheie, sursa) {
    return '<div><h4>Insiderii, ultimele 60 de zile' + (sursa ? ' <span class="muted" style="text-transform:none;letter-spacing:0">· ai ' + esc(sursa) + ', compania din SUA</span>' : '') + '</h4>'
      + (i && i.top && i.top.length ? '<ul class="tx num">' + i.top.map(function (t) { return '<li><span class="muted">' + esc(String(t.d || '').replace('-', '.')) + '</span><span>' + esc(t.cine) + ' <span class="muted">· ' + esc(t.rol) + '</span></span><span class="' + (t.f === 'buy' ? 'good' : 'bad') + '">' + (t.f === 'buy' ? '▲ cumpără ' : '▼ vinde ') + mii(t.act) + ' · $' + mii(t.val) + '</span></li>'; }).join('') + '</ul>' : '<p class="sub" style="margin:0">' + (!cuCheie ? 'pune cheia de citire ca să vezi insiderii' : !i ? 'insiderii vin cu poza următoare' : i.form4 ? 'nicio cumpărare sau vânzare reală în 60 de zile (grant-urile nu se numără)' : 'bursa germană nu raportează Form 4') + '</p>')
      + (i ? '<p class="sub" style="margin:6px 0 0">' + i.buys + ' cumpărări · ' + i.sells + ' vânzări · regula suitei: cumpărările cu bani contează, acțiunile primite gratis nu</p>' : '') + '</div>';
  }
  // v129 (spec 2026-09-28-sl-tp-pe-alerts): SL / TP - planul lui bate sugestia Radarului (poza.t212[].sugestie, colector v101)
  function sltpT212(p) {
    var pl = p && p.plan && nr(p.plan.stop) !== null ? p.plan : null, sg = p && p.sugestie && nr(p.sugestie.stop) !== null && nr(p.sugestie.tinta) !== null ? p.sugestie : null;
    if (pl) return { sl: nr(pl.stop), tp: nr(pl.tinta) !== null ? nr(pl.tinta) : sg ? sg.tinta : null, intr: nr(p.mediu), intrEt: 'prețul tău mediu', sursa: 'plan', orient: false };
    if (sg) return { sl: sg.stop, tp: sg.tinta, intr: nr(p.mediu), intrEt: 'prețul tău mediu', sursa: 'sugerat', orient: false };
    return null;
  }
  function sltpSimbol(s) {
    var g = s && s.sugestie; if (!g || g.nivel || nr(g.stop) === null || nr(g.tinta) === null) return null;
    return { sl: g.stop, tp: g.tinta, intr: g.intrare ? nr(g.intrare.pret) : null, intrEt: 'intrare sugerată', sursa: g.intrare ? 'sugerat' : 'orientativ', orient: !g.intrare };
  }
  var SLET = { plan: 'PLANUL TĂU', sugerat: 'SUGERAT', orientativ: 'ORIENTATIV · TREND ÎN JOS' };
  function etSLTP(o) { return o ? '<span class="slEt ' + (o.sursa === 'plan' ? 'plan' : o.sursa === 'sugerat' ? 'sug' : 'orient') + '">' + SLET[o.sursa] + '</span>' : ''; }
  // bara SL <- acum -> TP (clasa slBara: „bara” e deja a coloanei „Din cont”); scala [min(SL, pret), max(TP, pret)];
  // f = (pret - SL) / (TP - SL); punctul r = ultimul sfert spre SL (sau sub), v = ultimul sfert spre TP
  function baraSLTP(o, pret, m) {
    var sl = o ? nr(o.sl) : null, tp = o ? nr(o.tp) : null, p = nr(pret);
    if (sl === null || tp === null) return '';
    // revizie finala 28.09: fara bara (TP <= SL - stopul care urca a trecut de tinta la o pozitie castigatoare - sau pret lipsa)
    // SL si TP raman la vedere ca text; inainte de v129 cifrele se vedeau, celula goala ar fi fost un pas inapoi
    if (p === null || !(tp > sl)) return '<div class="slBara slText"><div class="slCapText"><span class="slSL">SL <b>' + bani(sl, m) + '</b></span> · <span class="slTP">TP <b>' + bani(tp, m) + '</b></span>'
      + (p === null ? '' : p >= tp ? ' <span class="slAlarma v">ȚINTĂ ATINSĂ</span>' : p <= sl ? ' <span class="slAlarma">SUB STOP</span>' : '') + '</div></div>';
    var lo = Math.min(sl, p), hi = Math.max(tp, p), span = hi - lo, X = function (v) { return (v - lo) / span * 100; };
    var f = (p - sl) / (tp - sl), cul = p <= sl || f < 0.25 ? 'r' : f > 0.75 ? 'v' : 'n', lat = (tp - sl) / span * 100;
    var semn = p <= sl ? '<span class="slAlarma">SUB STOP</span>' : p >= tp ? '<span class="slAlarma v">ȚINTĂ ATINSĂ</span>' : '';
    return '<div class="slBara' + (o.orient ? ' orient' : '') + '"><div class="slCap"><span class="slSL">SL <b>' + bani(sl, m) + '</b>' + semn + '</span><span class="slTP">TP <b>' + bani(tp, m) + '</b></span></div>'
      + '<div class="pista"><i class="zSL" style="left:' + X(sl).toFixed(1) + '%;width:' + (lat / 4).toFixed(1) + '%"></i><i class="zTP" style="left:' + (X(tp) - lat / 4).toFixed(1) + '%;width:' + (lat / 4).toFixed(1) + '%"></i>'
      + (nr(o.intr) !== null ? '<i class="intr" style="left:' + Math.max(0, Math.min(100, X(o.intr))).toFixed(1) + '%"></i>' : '') + '<i class="punct ' + cul + '" style="left:' + X(p).toFixed(1) + '%"></i></div>'
      // la mai puțin de 0,05% de SL (AVGO, 28.09: $350,62 cu SL $350,63) procentul rotunjit ar fi „0,0%” ⇒ „chiar la SL”
      + '<div class="slJos"><span class="bad">' + (Math.abs(sl / p - 1) < 0.0005 ? 'chiar la SL' : p <= sl ? 'sub SL cu ' + pct(sl / p - 1).replace(/^[+−]/, '') : pct(sl / p - 1) + ' până la SL') + '</span>'
      + '<span class="slMij">' + (nr(o.intr) !== null ? '│ ' + esc(o.intrEt) + ' ' + bani(o.intr, m) : '') + '</span>'
      + '<span class="good">' + (p >= tp ? 'peste TP' : pct(tp / p - 1) + ' până la TP') + '</span></div></div>';
  }
  // dovada sugestiei: k x volatilitatea, pe ultimul an n intrari, % pe plus, media dupa comision; media negativa spusa pe fata
  function dovadaSLTP(g, sim) {
    if (!g || !g.proba || nr(g.proba.n) === null) return '';
    var pr = g.proba, rau = nr(pr.medie) !== null && pr.medie < 0;
    return '<p style="margin:0">Stop la <b>' + String(g.k).replace('.', ',') + ' × volatilitatea zilnică</b> a ' + esc(sim) + (nr(g.riscPct) !== null ? ' (≈ ' + pct(-g.riscPct) + ' de la intrare)' : '') + ', ținta la dublu.</p>'
      + '<p style="margin:6px 0 0">Pe ultimul an: <b>' + pr.n + ' intrări</b>, <b>' + Math.round((pr.pePlus || 0) * 100) + ' % pe plus</b>, în medie <b class="' + (rau ? 'bad' : 'good') + '">' + pct(pr.medie) + '</b> pe trade, după comision (ieșire la SL, la TP sau după 20 de zile).'
      + (rau ? ' <b class="bad">Pe istoricul ' + esc(sim) + ' regula asta a pierdut în medie</b> — stopul rămâne o limită de risc, nu o promisiune.' : '') + '</p>';
  }
  // revizie finala 28.09: la POZITII stopul afisat e mereu regula ta de −15 % de la maxim (stopPozitie = max − max(d, 15 % din max),
  // iar d <= 15 % din pret), nu k × volatilitatea; maximul = stopul / 0,85 cand planul nu-l da. Proba (n, % pe plus) e a regulii k.
  function dovadaPozitie(g, sim, max) {
    if (!g || nr(g.stop) === null) return '';
    var mx = nr(max) !== null ? max : g.stop / 0.85, pr = g.proba || {}, rau = nr(pr.medie) !== null && pr.medie < 0;
    return '<p style="margin:0">SL: <b>−15 % de la maximul de după cumpărare (' + bani(mx) + ')</b> = ' + bani(g.stop) + ' — regula ta; pe trade-urile tale (25.09), −15 % care urcă a ieșit cu +1.001 lei mai bine decât fără stop.</p>'
      + (nr(g.k) !== null ? '<p style="margin:6px 0 0">Ținta: 2 × ' + String(g.k).replace('.', ',') + ' × volatilitatea zilnică de la prețul de acum (k ales pe istoricul ' + esc(sim) + ').'
      + (nr(pr.n) !== null ? ' Pe ultimul an, regula cu stop la ' + String(g.k).replace('.', ',') + ' × volatilitatea: <b>' + pr.n + ' intrări</b>, <b>' + Math.round((pr.pePlus || 0) * 100) + ' % pe plus</b>, în medie <b class="' + (rau ? 'bad' : 'good') + '">' + pct(pr.medie) + '</b> pe trade, după comision.'
      + (rau ? ' <b class="bad">Pe istoricul ' + esc(sim) + ' regula asta a pierdut în medie</b> — ținta rămâne un reper, nu o promisiune.' : '') : '') + '</p>' : '');
  }
  // v131 (el, 28.09: ideea 4 „câte bucăți”): marimea calculata acasa de colector (ActiuniSemnale.marime: 1 % risc din contul T212,
  // plafon 20 % pe o actiune), doar la simbolul cu intrare sugerata; bucati fractionare, cum le permite Trading 212
  function blocMarime(g, m) {
    var z = g && g.intrare && g.marime; if (!z || nr(z.bucati) === null || !(z.bucati > 0)) return '';
    var lei0 = function (v) { return nr(v) === null ? '—' : Math.round(v).toLocaleString('ro-RO'); };
    return '<div><h4>Cât cumpăr</h4><p style="margin:0"><b>' + z.bucati.toFixed(2).replace('.', ',') + ' buc la ' + bani(g.intrare.pret, m) + '</b> (~' + lei0(z.suma) + ' lei). Dacă atinge SL-ul pierzi ~' + lei0(z.risc) + ' lei'
      + (z.plafonat ? ' — plafonat la 20 % din cont (o singură acțiune nu trece de atât), deci sub 1 % risc.' : ' = 1 % din contul Trading 212.') + '</p>'
      + '<p class="sub" style="margin:6px 0 0">Bucăți fracționare, cum le permite Trading 212; la cursul din pozițiile tale.</p></div>';
  }
  // ---------- Trading 212 ----------
  function randT212(p, live, poza, acum, o) {
    o = o || {}; var ins = p.insideri === undefined ? null : p.insideri, it = insText(o.cheie ? ins : null, !!o.cheie), sx = sltpT212(p);
    var a = acumT212(p, live, acum || Date.now()), j = judecaT212({ s: p.s, pret: a.pret, prev: a.prev, closes30: p.closes30, plan: p.plan, pctLei: a.live ? null : p.pctLei, pctPret: a.live && nr(p.mediu) ? a.pret / p.mediu - 1 : p.pctPret });
    var pond = nr(p.pondere), pw = pond === null ? '' : pond > .2 ? 'r' : pond > .15 ? 'w' : '';
    var pplLei = a.live && nr(p.pplLei) !== null && nr(p.pret) && nr(p.mediu) ? p.pplLei * (a.pret - p.mediu) / ((p.pret - p.mediu) || 1) : p.pplLei;
    return '<tr class="rand" tabindex="0" aria-expanded="false" data-s="' + esc(p.s) + '">'
      + '<td><div class="sim">' + pill(p.niv) + '<div><b>' + esc(p.s) + '</b> ' + etSLTP(sx) + '<span class="mic">' + (nr(p.buc) !== null ? (+p.buc.toFixed(2)) + ' buc · ' : '') + 'mediu ' + bani(p.mediu) + (p.t212 && p.t212.replace(/_US_EQ$/, '') !== p.s ? ' · în T212: ' + esc(p.t212.replace(/_US_EQ$/, '')) : '') + '</span>' + faRand(o.fa, p.s) + '</div></div></td>'
      // v128 (el, 28.09: „nu mai apare evoluția zilei pe pagina alerts, fă cu verde creșterea și roșu scăderea”): gros și colorat, ca la bot
      // (în .mic ieșea gri - .mic bate .good/.bad); dedesubt „azi” / „ultima zi” și de unde e prețul
      + '<td class="c-acum">' + bani(a.pret) + (j.zi === null ? '<span class="mic">—</span>' : '<b class="d24 ' + cls(j.zi) + '">' + (j.zi >= 0 ? '▲ ' : '▼ ') + pct(j.zi) + '</b>') + '<span class="mic">' + (a.chip ? 'azi ' + a.chip : a.live ? 'azi' : 'ultima zi') + '</span></td>'
      + '<td class="c-spark"><span class="sp">' + spark(p.closes30) + '</span><span class="spTxt">' + (j.l30 === null ? 'fără istoric' : pct(j.l30) + ' pe 30 z') + '</span></td>'
      + '<td class="c-rez"><b class="' + cls(pplLei) + '">' + lei(pplLei) + '</b><span class="mic">' + pct(j.pct) + ' pe ' + j.pctFel + '</span></td>'
      // v129: „Stop din plan” + „Țintă” -> o singură coloană, SL ← acum → TP (planul lui sau sugestia Radarului)
      + '<td class="c-sltp" data-et="SL / TP">' + (sx ? baraSLTP(sx, a.pret, '$') : '<span class="plan">fără plan</span><span class="mic">sugestia vine cu poza următoare</span>') + '</td>'
      + '<td class="c-trend">' + (p.trend === 'sus' ? '<span class="trend good">↑ sus</span>' : p.trend === 'jos' ? '<span class="trend bad">↓ jos</span>' : p.trend === 'lateral' ? '<span class="trend muted">→ lateral</span>' : '<span class="muted">—</span>') + '</td>'
      + '<td class="c-pond">' + (pond === null ? '—' : Math.round(pond * 100) + '%<span class="bara"><i class="' + pw + '" style="width:' + Math.min(100, pond / .3 * 100) + '%"></i></span>') + '</td>'
      // v126 (el, 28.09: „la Trading 212 de ce nu apar și aici insiderii”): aceeași coloană ca la simbolurile tale
      + '<td class="c-ins" data-et="Insideri"><span class="insV ' + it.c + '">' + it.t + '</span><span class="mic">' + it.m + (p.sursa ? ' · ai ' + esc(p.sursa) : '') + '</span></td>'
      + '<td class="c-chev"><span class="chev" aria-hidden="true">›</span></td></tr>'
      + '<tr class="det" hidden data-det="' + esc(p.s) + '"><td colspan="9"><div class="detGrila">'
      + '<div><h4>De ce ' + (NIV[p.niv] || 'așa') + '</h4>' + (p.motive && p.motive.length ? '<ul class="motive">' + p.motive.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '<p class="sub" style="margin:0">Radarul n-a scris motive pentru poziția asta.</p>') + (p.sfat ? '<p class="fac">' + (/^👉/.test(p.sfat) ? '' : '👉 ') + esc(p.sfat) + '</p>' : '') + '</div>'
      + '<div><h4>Planul tău, din Radar</h4><div class="kv num">' + (p.plan ? '<span>Ies la</span><b>' + (nr(p.plan.trailPct) !== null ? '−' + String(p.plan.trailPct).replace('.', ',') + '% de la maxim' : '—') + '</b><span>Maximul de după cumpărare</span><b>' + bani(j.max) + '</b><span>Stopul de acum</span><b class="' + (j.depasit ? 'bad' : '') + '">' + bani(j.stop) + '</b><span>Țintă</span><b class="good">' + bani(j.tinta) + '</b>' : '<span>Plan</span><b>fără plan · pune-l în Radar (Trading 212)</b>') + '<span>Rezultat</span><b class="' + cls(pplLei) + '">' + lei(pplLei) + (nr(p.costLei) ? ' <span class="muted">din ' + lei(p.costLei).replace('+', '') + '</span>' : '') + '</b></div>'
      + '<div class="detBtns"><a class="btnLinie" href="' + esc(radarLink(poza, 't212', o.parolaRadar)) + '" style="text-decoration:none">Deschide în Radar</a><span class="sub">' + radarNota(poza, o.parolaRadar) + '</span></div></div>'
      + (p.sugestie && p.sugestie.proba ? '<div><h4>' + (sx && sx.sursa === 'plan' ? 'Ce ar fi sugerat Radarul' : 'De ce acest SL / TP') + '</h4>' + dovadaPozitie(p.sugestie, p.s, p.plan && p.plan.max) + '</div>' : '')
      // v131 (el, 28.09: ideea 6 „Păstrează ca plan”): la pozitia FARA plan, Radarul se deschide pe ea cu planul completat; el apasa „Salvează planul”
      + (sx && sx.sursa === 'sugerat' ? '<div class="detBtns"><a class="btnLinie" href="' + esc(radarLink(poza, 't212', o.parolaRadar) + '&poz=' + encodeURIComponent(p.t212 || '')) + '" style="text-decoration:none">Păstrează ca plan</a><span class="sub">se deschide Radarul pe ' + esc(p.s) + ', cu planul completat; apeși „Salvează planul”</span></div>' : '')
      + blocInsideri(ins, !!o.cheie, p.sursa)
      + '</div></td></tr>';
  }
  // ---------- Boti Pionex ----------
  // v122 (el, 28.09: „procentul LIVE, acelasi cu cel din TradingView”): TradingView arata schimbarea fata de inchiderea de ieri
  // (lumanarea zilnica, 00:00 UTC). Intai citirea live a paginii (Binance futures, la 10 s, cat e mai noua de 2 min), apoi
  // lumanarea zilnica Pionex din poza (colectorul, la 2 min), abia apoi vechiul „pe N h” de la pornirea botului.
  function ziBot(b, live, acum) {
    var L = live && nr(live.deschidere) > 0 && nr(live.pret) > 0 && nr(live.la) !== null && acum - live.la < 120000 ? live : null;
    if (L) return { pct: L.pret / L.deschidere - 1, pret: L.pret, et: 'azi · ca în TradingView', live: true, sursa: L.sursa || 'Binance' };
    if (b.zi && nr(b.zi.pct) !== null) return { pct: b.zi.pct, pret: null, et: 'azi · Pionex, la 2 min', live: false };
    var d24 = nr(b.d24), ore = nr(b.d24Ore);
    return d24 === null ? null : { pct: d24, pret: null, et: 'pe ' + (ore === null || ore >= 24 ? '24 h' : ore + ' h'), live: false };
  }
  function randBot(b, poza, o) {
    var poz = nr(b.pozitie), inGrid = nr(b.inGrid), dZero = nr(b.zero) !== null && nr(b.pret) ? b.zero / b.pret - 1 : null;
    // v120 (28.09, „unde văd procentul la JTO?"): mișcarea pe 24 h GROS sub pret, ca la actiuni (d24 din poza, v99.6); fara d24 nu inventam
    var z = ziBot(b, o && o.botiLive ? o.botiLive[b.s] : null, o && o.acum || Date.now());
    var m24 = !z ? '' : '<b class="d24 ' + cls(z.pct) + '">' + (z.pct >= 0 ? '▲ ' : '▼ ') + pct(z.pct) + '</b><span class="mic">' + esc(z.et) + '</span>';
    var pretAcum = z && z.live ? z.pret : b.pret, chipLive = z && z.live ? ' <span class="px-sess live" title="prețul live de la ' + esc(z.sursa) + ', la 10 secunde">live</span>' : '';
    return '<tr class="rand bot" tabindex="0" aria-expanded="false" data-s="' + esc(b.s) + '">'
      + '<td><div class="sim">' + pill(b.niv) + '<div><b>' + esc(b.s) + '</b><span class="mic">' + esc(b.dir || '') + (nr(b.lev) ? ' ' + b.lev + '×' : '') + (nr(b.investit) !== null ? ' · ' + b.investit.toFixed(1).replace('.', ',') + ' USDT' : '') + (nr(b.jos) !== null && nr(b.sus) !== null ? ' · grid ' + pretMic(b.jos) + '–' + pretMic(b.sus) : '') + '</span>' + faRand(o.fa, b.s) + '</div></div></td>'
      + '<td class="c-acum">' + pretMic(pretAcum) + chipLive + m24 + '<span class="mic">' + (inGrid === null ? '' : Math.round(inGrid * 100) + '% în grid') + (nr(b.lichidarePct) !== null ? ' · lichidare la ' + Math.round(b.lichidarePct) + '%' : '') + '</span></td>'
      + '<td class="c-spark"><span class="sp">' + spark(b.pret30) + '</span><span class="spTxt">' + (b.pret30 && b.pret30.length > 1 ? pct(b.pret30[b.pret30.length - 1] / b.pret30[0] - 1) + ' pe ultimele ' + b.pret30.length + ' min' : 'puține citiri încă') + '</span></td>'
      + '<td class="c-rez"><b class="' + cls(b.total) + '">' + usdt(b.total) + '</b><span class="mic">' + (nr(b.total) !== null && nr(b.investit) ? pct(b.total / b.investit) + ' din investiție' : '') + '</span></td>'
      // v124 (el, 28.09: „lipsește profit per grilă, adică doar din grid”): GROS ce a adus DOAR gridul (Pionex „Grid profit”),
      // dedesubt perechile si cat aduce O grila dupa comision (Pionex „Profit/grid”, din poza: grila)
      + '<td class="c-grile" data-et="Din grid"><b class="' + cls(b.gridBrut) + '">' + usdt(b.gridBrut) + '</b><span class="mic">' + (nr(b.perechi) !== null ? b.perechi + ' perechi' : '')
      + (b.grila && nr(b.grila.pct) !== null ? (nr(b.perechi) !== null ? ' · ' : '') + 'pe grilă ' + (b.grila.pct * 100).toFixed(2).replace('.', ',') + '%' + (nr(b.grila.usdt) !== null ? ' ≈ ' + b.grila.usdt.toFixed(3).replace('.', ',') + ' USDT' : '') : '') + '</span></td>'
      + '<td class="c-poz" data-et="Poziția"><span class="' + cls(poz) + '">' + usdt(poz) + '</span><span class="mic">comisioane ' + usdt(b.comisioane) + '</span></td>'
      + '<td class="c-prag" data-et="Prag">' + (nr(b.zero) !== null ? '<span class="warn">pe zero la ' + pretMic(b.zero) + '</span><span class="mic">' + pct(dZero) + ' de acum' : '<span class="muted">zero necalculat</span><span class="mic">') + (b.plan ? ' · plan +' + b.plan.plus + ' % / −' + b.plan.minus + ' % / ' + b.plan.afaraOre + ' h' : ' · fără plan') + '</span></td>'
      + '<td class="c-chev"><span class="chev" aria-hidden="true">›</span></td></tr>'
      + '<tr class="det" hidden data-det="' + esc(b.s) + '"><td colspan="8"><div class="detGrila">'
      + '<div><h4>Ce spune Radarul</h4>' + (b.motive && b.motive.length ? '<ul class="motive">' + b.motive.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '<p class="sub" style="margin:0">Nimic de semnalat la poza asta.</p>') + (b.sfat ? '<p class="fac">👉 ' + esc(b.sfat) + '</p>' : '') + '</div>'
      + '<div><h4>Pragurile botului</h4><div class="kv num"><span>Iese pe zero la</span><b>' + pretMic(b.zero) + '</b><span>Marginea de jos a gridului</span><b>' + pretMic(b.jos) + (nr(b.jos) !== null && nr(b.pret) ? ' <span class="muted">(' + pct(b.jos / b.pret - 1) + ')</span>' : '') + '</b><span>Marginea de sus</span><b>' + pretMic(b.sus) + (nr(b.sus) !== null && nr(b.pret) ? ' <span class="muted">(' + pct(b.sus / b.pret - 1) + ')</span>' : '') + '</b><span>Planul tău</span><b>' + (b.plan ? '+' + b.plan.plus + '% / −' + b.plan.minus + '% / afară ' + b.plan.afaraOre + ' h' : 'fără plan · pune-l în Tabloul botului') + '</b></div>'
      + '<div class="detBtns"><a class="btnLinie" href="' + esc(radarLink(poza, 'tabloubot', o && o.parolaRadar)) + '" style="text-decoration:none">Deschide Tabloul botului</a><span class="sub">' + radarNota(poza, o && o.parolaRadar) + '</span></div></div>'
      + '</div></td></tr>';
  }
  // ---------- Simbolurile tale ----------
  function judecaSimbol(s, live) {
    var a = acumDin(s, live), c = s.closes30 || [], n = c.length, pret = nr(a.pret);
    return { pret: pret, moneda: s.moneda || '$', zi: pret && nr(a.prev) ? pret / a.prev - 1 : null, sapt: pret && n >= 6 ? pret / c[n - 6] - 1 : null, l30: pret && n >= 2 ? pret / c[0] - 1 : null, live: a.live, chip: a.chip };
  }
  function randSimbol(s, live, cuCheie) {
    var j = judecaSimbol(s, live), i = s.insideri === undefined ? null : s.insideri, it = insText(cuCheie ? i : null, !!cuCheie), rez = s.rezultate || null;
    // v129 (spec 2026-09-28-sl-tp-pe-alerts): SL / TP „dacă ai cumpăra la intrarea sugerată”; trend în jos = orientativ (de la prețul de acum)
    var sx = sltpSimbol(s), g = s.sugestie || null, pr = g && g.proba ? g.proba : null;
    return '<tr class="rand" tabindex="0" aria-expanded="false" data-s="' + esc(s.s) + '">'
      + '<td><div class="sim"><div><b>' + esc(s.s) + '</b> ' + etSLTP(sx) + '<span class="mic">' + (s.nota ? esc(s.nota) : (j.moneda === '€' ? 'bursă germană' : 'US')) + '</span></div></div></td>'
      + '<td class="c-acum">' + bani(j.pret, j.moneda) + '<span class="mic">' + (j.pret === null ? 'fără preț' : j.live ? (j.chip || 'acum') : 'ultima închidere') + '</span></td>'
      + '<td class="c-azi" data-et="Azi"><b class="' + cls(j.zi) + '">' + (j.zi === null ? '—' : (j.zi >= 0 ? '▲ ' : '▼ ') + pct(j.zi)) + '</b>' + baraAzi(j.zi) + '</td>'
      + '<td class="c-sapt" data-et="Săptămâna"><span class="' + cls(j.sapt) + '">' + pct(j.sapt) + '</span><span class="mic">5 zile</span></td>'
      + '<td class="c-spark"><span class="sp">' + spark(s.closes30) + '</span><span class="spTxt">' + (j.l30 === null ? (cuCheie ? 'fără istoric' : 'cere cheia') : pct(j.l30) + ' pe 30 z') + '</span></td>'
      + '<td class="c-sltp" data-et="SL / TP">' + (sx ? baraSLTP(sx, j.pret, j.moneda) : '<span class="muted">' + esc(g && g.nivel ? g.motiv : cuCheie ? 'vine cu poza următoare' : 'cere cheia') + '</span>') + '</td>'
      + '<td class="c-ist" data-et="Pe istoric">' + (pr && nr(pr.medie) !== null ? '<b class="' + (pr.medie < 0 ? 'bad' : 'good') + '">' + pct(pr.medie) + '</b><span class="mic">' + Math.round((pr.pePlus || 0) * 100) + ' % pe plus · ' + pr.n + ' intrări</span>' : '<span class="muted">—</span>') + '</td>'
      + '<td class="c-ins" data-et="Insideri"><span class="insV ' + it.c + '">' + it.t + '</span><span class="mic">' + it.m + (s.sursa ? ' · ai ' + esc(s.sursa) : '') + '</span></td>'
      + '<td class="c-rez2" data-et="Rezultate"><span class="' + (rez && nr(rez.zile) !== null && rez.zile <= 14 ? 'warn' : '') + '">' + (rez ? dataRo(rez.data) : (cuCheie ? '—' : 'cere cheia')) + '</span><span class="mic">' + (rez && nr(rez.zile) !== null ? 'în ' + rez.zile + ' zile' : '') + (rez && nr(rez.eps) !== null ? ' · EPS est. ' + rez.eps.toFixed(2).replace('.', ',') : '') + '</span></td>'
      + '<td class="c-chev"><span class="chev" aria-hidden="true">›</span></td></tr>'
      + '<tr class="det" hidden data-det="' + esc(s.s) + '"><td colspan="10"><div class="detGrila">'
      + (g && !g.nivel && nr(g.stop) !== null ? '<div><h4>' + (g.intrare ? 'Intrarea sugerată' : 'De ce e orientativ') + '</h4><p style="margin:0">' + (g.intrare ? esc(g.intrare.motiv) + ': <b>' + bani(g.intrare.pret, j.moneda) + '</b>' + (nr(j.pret) ? ' (' + pct(g.intrare.pret / j.pret - 1) + ' de acum)' : '') + '.' : 'Trend în jos pe zilnice: la acțiuni cumperi doar long, deci Radarul așteaptă întoarcerea. SL și TP sunt socotite de la prețul de acum, doar ca să vezi distanțele.') + '</p></div><div><h4>De ce acest SL / TP</h4>' + dovadaSLTP(g, s.s) + '</div>' : '')
      + blocMarime(g, j.moneda)
      + blocInsideri(i, cuCheie, s.sursa)
      + '<div><h4>Analiștii și short-ul</h4><div class="kv num"><span>Ținta medie</span><b>' + (s.analisti && nr(s.analisti.tinta) !== null ? bani(s.analisti.tinta, s.sursa ? '$' : j.moneda) + (!s.sursa && j.pret ? ' <span class="muted">(' + pct(s.analisti.tinta / j.pret - 1, 0) + ')</span>' : '') : '—') + '</b><span>Recomandarea</span><b>' + (s.analisti && s.analisti.recom ? (RECOM[s.analisti.recom] || esc(s.analisti.recom)) : '—') + (s.analisti && nr(s.analisti.n) ? ' <span class="muted">· ' + s.analisti.n + ' analiști</span>' : '') + '</b><span>Short din float</span><b class="' + (nr(s.shortFloat) !== null && s.shortFloat > .10 ? 'warn' : '') + '">' + (nr(s.shortFloat) !== null ? pct(s.shortFloat, 1).replace('+', '') : '—') + '</b><span>Rezultate</span><b>' + (rez ? dataRo(rez.data) + (nr(rez.eps) !== null ? ' <span class="muted">· EPS estimat ' + rez.eps.toFixed(2).replace('.', ',') + '</span>' : '') : '—') + '</b></div>'
      + '<div class="detBtns"><button class="btnLinie" type="button" data-fac="nota" data-s="' + esc(s.s) + '">Notiță</button><button class="btnLinie rau" type="button" data-fac="scoate" data-s="' + esc(s.s) + '">Scoate din listă</button></div></div>'
      + '</div></td></tr>';
  }
  // ---------- capul, sumarul, caseta cheii ----------
  function chipProspetime(pr) { pr = pr || { stare: 'lipsa', text: 'nicio poză încă' }; return '<span class="chip ' + esc(pr.stare) + '"><i></i>colectorul de acasă · ' + esc(pr.text) + '</span>'; }
  function caseta(o) {
    return '<div class="caseta" id="radCaseta"' + (o.deschisa ? '' : ' hidden') + '><b>🔑 Pune cheia de citire</b><span class="sub">O dată; rămâne în browserul ăsta. Cheia o ai de la Radar (worker-ul Paznicului). Fără ea, pagina arată doar ce știe singură. Parola Radarului (aceeași ca în Setările Radarului) e opțională: cu ea, „Deschide în Radar” intră direct, fără s-o mai ceară; câmpul lăsat gol o păstrează pe cea pusă.</span>'
      + '<form id="radCheieForm"><input id="radCheie" placeholder="cheia de citire" aria-label="Cheia de citire" autocomplete="off"><input id="radUrl" placeholder="adresa worker-ului (opțional)" aria-label="Adresa worker-ului"><input id="radParola" type="password" placeholder="🔐 parola Radarului (APP_API_TOKEN)" aria-label="Parola Radarului" autocomplete="off"><button class="btn" type="submit">Salvează</button></form>'
      + (o.eroare ? '<span class="sub bad">' + esc(o.eroare) + '</span>' : '') + '</div>';
  }
  function cheiaRea(o) { return !!(o.cheie && o.eroare && /cheia/.test(o.eroare)); }
  function cap(o) {
    return '<section class="cap" aria-label="Din Radar"><h2>📡 Din Radar</h2>' + chipProspetime(o.prospetime) + '<span class="chip">de pe telefon merge la fel · fără tunel</span>'
      + '<span class="cheie">🔑 cheia de citire: ' + (cheiaRea(o) ? '<b class="bad">nu e bună</b>' : o.cheie ? 'pusă' : '<b class="warn">lipsește</b>') + ' <button class="btnGhost" type="button" data-fac="cheie">' + (o.cheie ? 'Schimbă' : 'Pune cheia') + '</button></span>'
      + '<span class="cheie">🔐 parola Radarului: ' + (o.parolaRadar ? 'pusă' : '<b class="warn">lipsește</b>') + ' <button class="btnGhost" type="button" data-fac="cheie">' + (o.parolaRadar ? 'Schimbă' : 'Pune parola') + '</button></span></section>'
      + caseta({ deschisa: !o.cheie || cheiaRea(o), eroare: cheiaRea(o) ? o.eroare : '' });   // cheia gresita NU tace: caseta se deschide singura
  }
  function oraRo(t) { return nr(t) === null ? '—' : new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(new Date(t)); }
  function sumar(poza, o, st) {
    var t = poza && poza.t212 || [], tot = 0, plus = 0, are = false;
    t.forEach(function (p) { if (nr(p.pplLei) !== null) { tot += p.pplLei; are = true; if (p.pplLei > 0) plus++; } });
    var boti = poza && poza.boti || [];
    return '<section class="sum num" aria-label="Pe scurt">'
      + '<div><span class="et">Trading 212 · pe deschise</span><span class="big ' + (are ? cls(tot) : '') + '">' + (poza ? (are ? lei(tot) : (t.length ? '—' : '0')) : '—') + '</span><span class="sub">' + (poza ? t.length + ' poziții · ' + plus + ' pe plus' : (o.cheie ? 'aștept poza' : 'cere cheia')) + '</span></div>'
      + '<div><span class="et">Boți Pionex</span><span class="big">' + (poza ? boti.length + ' activ' + (boti.length === 1 ? '' : 'i') : '—') + '</span><span class="sub">' + (poza ? (boti.length ? boti.map(function (b) { return b.s; }).join(', ') : 'niciun bot activ acum') : (o.cheie ? 'aștept poza' : 'cere cheia')) + '</span></div>'
      + '<div><span class="et">Simbolurile tale</span><span class="big">' + st.n + ' simbol' + (st.n === 1 ? '' : 'uri') + '</span><span class="sub">' + (st.n ? 'azi: ' + st.plus + ' pe plus, ' + st.minus + ' pe minus' + (st.insV ? ' · insiderii vând la ' + st.insV : '') : 'adaugă unul mai jos') + '</span></div>'
      + '<div><span class="et">Colectorul de acasă</span><span class="big ' + (o.prospetime && o.prospetime.stare === 'viu' ? 'good' : o.prospetime && o.prospetime.stare === 'tace' ? 'warn' : 'bad') + '">' + (o.prospetime ? (o.prospetime.stare === 'viu' ? 'viu' : o.prospetime.stare === 'tace' ? 'tace' : o.prospetime.stare === 'oprit' ? 'oprit' : 'fără poză') : '—') + '</span><span class="sub">' + esc(o.prospetime ? o.prospetime.text : '') + (poza && poza.versiune ? ' · Radar ' + esc(poza.versiune) : '') + '</span></div>'
      + '</section>';
  }
  // I-460 / v127: ce are de facut fiecare pozitie si bot, din poza (rosu: iesi / stop depasit; galben: atentie, peste plafon,
  // bot fara plan; gri: rezultate in 7 zile) - din v127 pe randul lui (faRand), nu intr-un panou separat.
  function todoLista(poza, o) {
    var l = [], acum = o.acum || Date.now();
    (poza.t212 || []).forEach(function (p) {
      var a = acumT212(p, o.preturiLive, acum), j = judecaT212({ s: p.s, pret: a.pret, prev: a.prev, closes30: p.closes30, plan: p.plan, pctLei: p.pctLei, pctPret: p.pctPret });
      if (p.niv === 'iesi' || j.depasit) l.push({ c: 'r', s: p.s, t: p.s + (j.depasit ? ' a coborât sub stopul din plan (' + bani(j.stop) + ')' : ': ' + ((p.motive || [])[0] || 'de ieșit')), p: p.sfat || '' });
      if (nr(p.pondere) !== null && p.pondere > 0.2) l.push({ c: 'g', s: p.s, t: p.s + ' e ' + Math.round(p.pondere * 100) + '% din cont', p: 'Peste plafonul de 20%: o zi proastă a ei e ziua proastă a contului.' });
      if (p.niv === 'atentie' && !j.depasit) l.push({ c: 'g', s: p.s, t: p.s + ': ' + ((p.motive || [])[0] || 'atenție'), p: p.sfat || '' });
    });
    (poza.boti || []).forEach(function (b) {
      if (b.niv === 'iesi') l.push({ c: 'r', s: b.s, t: b.s + ': ' + ((b.motive || [])[0] || 'de ieșit'), p: b.sfat || '' });
      else if (b.niv === 'atentie') l.push({ c: 'g', s: b.s, t: b.s + ': ' + ((b.motive || [])[0] || 'atenție'), p: b.sfat || '' });
      if (!b.plan) l.push({ c: 'g', s: b.s, t: b.s + ' e fără plan', p: 'Pune planul din Tabloul botului: la ce plus ieși, la ce minus, câte ore afară din grid.' });
    });
    (poza.simboluri || []).forEach(function (s) {
      if (s.rezultate && nr(s.rezultate.zile) !== null && s.rezultate.zile >= 0 && s.rezultate.zile <= 7) l.push({ c: 'n', s: s.s, t: s.s + ' raportează ' + (s.rezultate.zile === 0 ? 'azi' : 'în ' + s.rezultate.zile + ' zile') + ' (' + dataRo(s.rezultate.data) + ')', p: 'Rezultatele mișcă mult; nu intri și nu adaugi chiar înainte.' });
    });
    var ord = { r: 0, g: 1, n: 2 };
    return l.sort(function (x, y) { return ord[x.c] - ord[y.c]; });
  }
  // v127 (el, 28.09: „în pagina alerts Ce ai de făcut să dispară și să rămână doar în linia botului sau a stock-ului cu ce are
  // de făcut, că încarcă pagina aiurea”): aceleasi lucruri ca panoul de dinainte, pe randul lor (sub nume, cel mult 2 randuri)
  function faPeRand(l) { var m = {}; l.forEach(function (x) { (m[x.s] = m[x.s] || []).push(x); }); return m; }
  function faRand(fa, s) {
    var l = fa && fa[s]; if (!l || !l.length) return '';
    var pref = String(s), fara = function (t) { t = String(t); return t.indexOf(pref + ': ') === 0 ? t.slice(pref.length + 2) : t.indexOf(pref + ' ') === 0 ? t.slice(pref.length + 1) : t; };
    return l.map(function (x) { var t = fara(x.t), p = String(x.p || '').replace(/^👉\s*/, ''); return '<span class="faRand ' + x.c + '" title="' + esc(t + (p ? ' — ' + p : '')) + '">' + esc(t) + (p ? ' <span class="faP">· 👉 ' + esc(p) + '</span>' : '') + '</span>'; }).join('');
  }
  function panouT212(poza, o) {
    // T212 n-a raspuns la poza asta: pozitiile sunt cele de la poza anterioara - se spune, cu ora lor (nu cifre fara varsta)
    var avert = poza && poza.t212Eroare ? '<span class="chip tace"><i></i>pozițiile de la ' + oraRo(poza.t212La) + ' · Trading 212 n-a răspuns la poza asta</span>' : '';
    var h = '<section class="panou" aria-label="Trading 212"><div class="panouCap"><h3>💼 Trading 212' + (poza ? ' · ' + (poza.t212 || []).length + ' poziții deschise' : '') + '</h3>' + avert + '<span class="sub">clic pe rând: motive, sfat, plan · stopul = planul tău din Radar</span></div>';
    if (cheiaRea(o)) return h + '<div class="pliat">Cheia de citire nu e bună. Pune-o din nou, sus.</div></section>';
    if (!o.cheie) return h + '<div class="pliat">Pozițiile vin cu poza Radarului. Pune cheia de citire.</div></section>';
    if (!poza) return h + '<div class="pliat">Aștept prima poză (colectorul o trimite la 5 minute).</div></section>';
    if (!(poza.t212 || []).length) return h + '<div class="gol"><b>' + esc(poza.gol && poza.gol.t212 || 'nicio poziție deschisă') + '</b></div></section>';
    return h + '<div style="overflow-x:auto"><table class="poz num"><thead><tr><th>Acțiune</th><th>Acum</th><th class="c-spark">30 de zile</th><th>Rezultat</th><th>SL ← acum → TP</th><th>Trend</th><th>Din cont</th><th>Insideri · 60 z</th><th></th></tr></thead><tbody id="radT212">' + poza.t212.map(function (p) { return randT212(p, o.preturiLive, poza, o.acum, o); }).join('') + '</tbody></table></div></section>';
  }
  function panouBoti(poza, o) {
    var h = '<section class="panou" aria-label="Boți Pionex"><div class="panouCap"><h3>🤖 Boți Pionex' + (poza ? (poza.boti && poza.boti.length ? ' · ' + poza.boti.length + ' activ' + (poza.boti.length === 1 ? '' : 'i') : ' · niciun bot activ acum') : '') + '</h3><span class="sub">când pornești unul, apare aici singur, cu grilele și pragurile lui</span></div>';
    if (cheiaRea(o)) return h + '<div class="pliat">Cheia de citire nu e bună. Pune-o din nou, sus.</div></section>';
    if (!o.cheie) return h + '<div class="pliat">Boții vin cu poza Radarului. Pune cheia de citire.</div></section>';
    if (!poza) return h + '<div class="pliat">Aștept prima poză (colectorul o trimite la 5 minute).</div></section>';
    if (!(poza.boti || []).length) return h + '<div class="gol"><b>' + esc(poza.gol && poza.gol.boti || 'niciun bot activ') + '</b> · la botul următor, pragurile din Radar și „iese pe zero” apar aici.</div></section>';
    return h + '<div style="overflow-x:auto"><table class="poz num"><thead><tr><th>Bot</th><th>Acum</th><th class="c-spark">Ultimele 30 min</th><th>Total</th><th class="c-grile">Din grid</th><th>Poziția</th><th>Prag</th><th></th></tr></thead><tbody id="radBoti">' + poza.boti.map(function (b) { return randBot(b, poza, o); }).join('') + '</tbody></table></div></section>';
  }
  function panouSimboluri(lista, o, st) {
    var h = '<section class="panou" aria-label="Simbolurile tale"><div class="panouCap"><h3>🎯 Simbolurile tale · ' + lista.length + '</h3><span class="sub">mișcarea reală (azi, săptămâna, 30 de zile) + insiderii pe 60 de zile, rezultatele, analiștii · fără praguri</span></div>'
      + '<div class="kpis num"><div>Simboluri<b>' + lista.length + '</b></div><div>US · Europa<b>' + st.us + ' · ' + st.eu + '</b></div><div>Insideri cumpără<b class="good">' + st.insC + '</b></div><div>Insideri vând<b class="bad">' + st.insV + '</b></div><div>Rezultate în 30 z<b>' + st.rez30 + '</b></div><div>Short peste 10 %<b>' + st.sh + '</b></div></div>'
      + '<div class="adaugaSlot" id="radAdaugaSlot"></div>';   // pagina muta aici formularul ei de adaugare (#addForm), cu ascultatorii lui
    if (!lista.length) return h + '<div class="gol">Nimic încă. Adaugă un simbol de mai sus; primește pe loc mișcarea, iar cu poza următoare insiderii, rezultatele și analiștii.</div></section>';
    return h + '<div style="overflow-x:auto"><table class="poz num"><thead><tr><th>Simbol</th><th>Acum</th><th>Azi</th><th>Săptămâna</th><th class="c-spark">30 de zile</th><th>SL ← intrare → TP</th><th>Pe istoric</th><th>Insideri · 60 z</th><th>Rezultate</th><th></th></tr></thead><tbody id="radSimboluri">' + lista.map(function (s) { return randSimbol(s, o.preturiLive, o.cheie); }).join('') + '</tbody></table></div></section>';
  }
  // lista paginii, imbogatita cu ce stie poza despre fiecare simbol
  function uneste(simboluri, poza) {
    var din = {}; ((poza && poza.simboluri) || []).forEach(function (x) { if (x && x.s) din[String(x.s).toUpperCase()] = x; });
    return (simboluri || []).map(function (x) { var s = String(x.s || '').toUpperCase(), p = din[s]; return p ? Object.assign({}, p, { s: s, nota: x.nota || p.nota || '' }) : { s: s, nota: x.nota || '', moneda: /\.(DE|MU|F|PA|AS|MI|SW)$/.test(s) ? '€' : '$', pret: null, prev: null, closes30: [] }; });
  }
  function statistici(lista, live) {
    var st = { n: lista.length, us: 0, eu: 0, plus: 0, minus: 0, insC: 0, insV: 0, rez30: 0, sh: 0 };
    lista.forEach(function (s) {
      var j = judecaSimbol(s, live); if (j.moneda === '€') st.eu++; else st.us++;
      if (j.zi !== null) { if (j.zi > 0) st.plus++; else if (j.zi < 0) st.minus++; }
      var i = s.insideri; if (i && (i.verdict === 'bull' || i.verdict === 'bull1')) st.insC++; if (i && i.verdict === 'bear') st.insV++;
      if (s.rezultate && nr(s.rezultate.zile) !== null && s.rezultate.zile >= 0 && s.rezultate.zile <= 30) st.rez30++;
      if (nr(s.shortFloat) !== null && s.shortFloat > .10) st.sh++;
    });
    return st;
  }
  function leaga(el) {
    if (!el || el.dataset.radLegat || typeof el.addEventListener !== 'function') return; el.dataset.radLegat = '1';
    el.addEventListener('click', function (e) {
      var t = e.target;
      var f = t.closest && t.closest('[data-fac]');
      if (f) {
        var fac = f.getAttribute('data-fac'), s = f.getAttribute('data-s') || '';
        if (fac === 'cheie') { var c = el.querySelector('#radCaseta'); if (c) { c.hidden = !c.hidden; var inp = el.querySelector('#radCheie'); if (!c.hidden && inp) inp.focus(); } return; }
        if (typeof CustomEvent !== 'undefined') el.dispatchEvent(new CustomEvent('radar:' + fac, { detail: { s: s }, bubbles: false }));
        return;
      }
      if (t.closest && t.closest('a,button,input,label,form')) return;
      var r = t.closest && t.closest('tr.rand'); if (!r) return;
      var d = r.nextElementSibling; if (!d || !d.classList.contains('det')) return;
      var des = r.getAttribute('aria-expanded') !== 'true'; r.setAttribute('aria-expanded', String(des)); d.hidden = !des;
    });
    el.addEventListener('keydown', function (e) { var r = e.target.closest && e.target.closest('tr.rand'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
    el.addEventListener('submit', function (e) {
      var f = e.target; if (!f || f.id !== 'radCheieForm') return; e.preventDefault();
      var ch = el.querySelector('#radCheie'), u = el.querySelector('#radUrl'), pa = el.querySelector('#radParola');
      if (typeof CustomEvent !== 'undefined') el.dispatchEvent(new CustomEvent('radar:cheie', { detail: { cheie: ch ? ch.value.trim() : '', url: u ? u.value.trim() : '', parola: pa ? pa.value.trim() : '' } }));
    });
  }
  // o = { simboluri:[{s, nota}], preturiLive:{SYM:{pret, prev, la}}, acum, cheie:boolean, prospetime:{stare,text}, eroare }
  function randeaza(el, poza, o) {
    o = o || {}; var lista = uneste(o.simboluri, poza), st = statistici(lista, o.preturiLive);
    o.fa = poza && o.cheie ? faPeRand(todoLista(poza, o)) : {};
    var h = cap(o) + sumar(poza, o, st) + panouT212(poza, o) + panouBoti(poza, o) + panouSimboluri(lista, o, st);
    if (o.eroare && !cheiaRea(o) && o.cheie) h = h.replace('</section>', '<span class="chip oprit"><i></i>' + esc(o.eroare) + '</span></section>');
    // randurile desfacute raman desfacute peste o re-randare (poll-ul randeaza des)
    var desfacute = {}; try { el.querySelectorAll('tr.rand[aria-expanded="true"]').forEach(function (r) { desfacute[r.getAttribute('data-s')] = true; }); } catch (e) {}
    el.innerHTML = h; leaga(el);
    try { Object.keys(desfacute).forEach(function (s) { el.querySelectorAll('tr.rand[data-s="' + s.replace(/"/g, '') + '"]').forEach(function (r) { r.setAttribute('aria-expanded', 'true'); var d = r.nextElementSibling; if (d && d.classList.contains('det')) d.hidden = false; }); }); } catch (e) {}
  }
  return { esc: esc, bani: bani, lei: lei, usdt: usdt, pct: pct, cls: cls, mii: mii, dataRo: dataRo, spark: spark, baraAzi: baraAzi, judecaT212: judecaT212, judecaSimbol: judecaSimbol, insText: insText, uneste: uneste, sltpT212: sltpT212, sltpSimbol: sltpSimbol, baraSLTP: baraSLTP, statistici: statistici, randeaza: randeaza, NIV: NIV, RECOM: RECOM, ziBot: ziBot };
})();
if (typeof window !== 'undefined') window.RadarEcran = RadarEcran;
