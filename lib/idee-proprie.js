/* 19.10.2026 (I-718): calculatorul de risc pentru ideile TALE (orice acțiune SUA în USD) în Planuri.
   NU e semnal și nici recomandare: ia simbolul, stopul scris de tine sau ATR(14) × k pe seria zilnică, prețul de acum (TTPretViu)
   și calendarul de raportări (EARN, închis la eroare). Planuri aplică apoi aceleași gărzi și aceeași dimensionare ca pentru
   candidații scannerului (Governor, contul T212, costul de schimb, căldura portofoliului) și salvează planul cu sursa „manual”.
   Partea pură (simbolUS, atr, nivele, earnings, candidat, pret) e folosită și de teste; pregateste() citește rețeaua. */
(function (g) {
  'use strict';
  if (g.TTIdeeProprie) return;
  var F_NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  var MESAJ_USD = 'Doar acțiuni SUA în USD (ex. AAPL, BRK-B) — Planurile dimensionează în USD, ca pentru candidații scannerului; pentru alte piețe calculează separat.';
  function poz(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function bani(v) { return Math.round(v * 100) / 100; }
  function fmt(v) { return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ziNY(t) { return F_NY.format(new Date(t)); }
  /* clasele de acțiuni SUA (BRK.B = BRK-B la Yahoo) — doar A/B/C, ca „VUSA.L” (Londra) să nu treacă drept american */
  function simbolUS(s) {
    var x = String(s == null ? '' : s).trim().toUpperCase().replace(/\.(?=[ABC]$)/, '-');
    return /^[A-Z][A-Z0-9]{0,4}(-[ABC])?$/.test(x) ? x : null;
  }
  /* ATR Wilder pe True Range — aceeași formulă ca TI.calcATR (lib/indicators.js) și ca scannerul */
  function atr(bars, n) {
    n = n || 14;
    if (!Array.isArray(bars) || bars.length < n + 1) return null;
    var trs = [], a = 0, i;
    for (i = 1; i < bars.length; i++) { var h = +bars[i].h, l = +bars[i].l, pc = +bars[i - 1].c; trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))); }
    for (i = 0; i < n; i++) a += trs[i];
    a = a / n;
    for (i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
    return poz(a) ? a : null;
  }
  /* intrarea = limita scrisă de tine, altfel prețul de acum; stopul = scris de tine, altfel intrare − k × ATR(14);
     ținta = scrisă de tine, altfel 2R (doar ca dimensionarea să aibă o țintă — nu e o promisiune) */
  function nivele(o) {
    o = o || {};
    var entry = poz(o.intrare) ? o.intrare : poz(o.pret) ? o.pret : null;
    if (!entry) return { ok: false, mesaj: 'Prețul de acum nu s-a putut citi — scrie intrarea (limita) ta ca să calculez riscul.' };
    var stop, metoda;
    if (poz(o.stop)) { stop = o.stop; metoda = 'scris'; }
    else if (poz(o.atrK)) {
      if (!poz(o.atr)) return { ok: false, mesaj: 'ATR(14) nu s-a putut calcula din seria zilnică — scrie stopul tău.' };
      stop = bani(entry - o.atrK * o.atr); metoda = 'atr';
      if (!(stop > 0)) return { ok: false, mesaj: 'Stopul ATR × k iese sub zero — micșorează k sau scrie stopul.' };
    } else return { ok: false, mesaj: 'Scrie stopul tău sau k pentru stopul ATR(14) × k.' };
    if (stop >= entry) return { ok: false, mesaj: 'Stopul (' + fmt(stop) + ') trebuie să fie sub intrare (' + fmt(entry) + ') — planurile sunt doar Long.' };
    var implicita = !poz(o.tinta), target = implicita ? bani(entry + 2 * (entry - stop)) : o.tinta;
    if (target <= entry) return { ok: false, mesaj: 'Ținta trebuie să fie peste intrare.' };
    return { ok: true, entry: entry, stop: stop, target: target, metoda: metoda, tintaImplicita: implicita, atr: poz(o.atr) ? o.atr : null, atrK: metoda === 'atr' ? o.atrK : null };
  }
  /* aceeași gardă ca scannerul (candidate-engine/engine.js, gardaEarnings): calendar necitit ⇒ blocat; raportare în fereastra de
     14 zile ⇒ blocat (planul ține zile, nu ore, și ar traversa raportarea) */
  function earnings(cal, sym, now) {
    now = now || Date.now();
    if (!cal || !cal.ok) return { blocat: true, text: 'earnings neverificat' + (cal && cal.motiv ? ' (' + cal.motiv + ')' : '') + ' — fără calendarul de raportări nu se construiește plan (aceeași gardă ca la scanner)' };
    var e = (cal.items || []).filter(function (x) { return x && x.symbol === sym && x.date; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    if (!e) return { blocat: false, text: 'fără raportări în 14 zile (calendar Finnhub)' };
    var zile = Math.round((Date.parse(e.date + 'T12:00:00Z') - Date.parse(ziNY(now) + 'T12:00:00Z')) / 86400000);
    return { blocat: true, zile: zile, text: sym + ' raportează în ' + Math.max(0, zile) + ' zile (' + e.date + ') — planul (zile, nu ore) ar traversa raportarea; aceeași gardă ca la scanner' };
  }
  /* candidatul pentru TradePlans: sursa „manual”, nu un candidat al scannerului */
  function candidat(sym, niv, la) {
    return { symbol: sym, mode: 'manual', source: 'manual', currency: 'USD', region: 'US', actionable: true, state: 'MANUAL', ts: la, sourceDate: ziNY(la), sourceTimezone: 'America/New_York',
      entryLow: niv.entry, entryHigh: niv.entry, stop: niv.stop, target: niv.target,
      reason: 'Idee proprie — calculul riscului pentru ideea ta, nu o recomandare' + (niv.metoda === 'atr' ? ' · stop = intrare − ' + niv.atrK + ' × ATR(14) ' + fmt(niv.atr) : ' · stop scris de tine') + (niv.tintaImplicita ? ' · ținta 2R doar pentru calcul' : '') };
  }
  /* prețul de acum față de intrarea ta (TTPretViu.evalueaza); sub stop ⇒ blocat */
  function pret(niv, q, now) {
    var P = g.TTPretViu;
    if (!niv || !P || typeof P.evalueaza !== 'function') return null;
    var r = P.evalueaza({ entryLow: niv.entry, entryHigh: niv.entry, stop: niv.stop }, q && q.pret > 0 ? q : null, now);
    if (!r) return null;
    if (r.stare === 'sub') r.text = 'prețul de acum ' + fmt(r.pret) + ' e sub intrarea ta (' + fmt(niv.entry) + ') — riscul e calculat la intrarea ta';
    else if (r.stare === 'in-zona') r.text = 'prețul de acum ' + fmt(r.pret) + ' e la intrarea ta';
    r.blocat = r.stare === 'sub-stop';
    return r;
  }
  /* 20.10.2026 (I-733): aceeași gardă de lichiditate ca scannerul (candidate-engine/engine.js: avgDollarVol ≥ 3 M $): media pe 20 de sesiuni a închidere × volum */
  var ADV_MIN = 3000000;
  function advUsd(bars, n) {
    n = n || 20; if (!Array.isArray(bars) || bars.length < n) return null;
    var s = 0, k = 0; for (var i = bars.length - n; i < bars.length; i++) { var b = bars[i]; if (!b || !poz(+b.c) || !(+b.v >= 0)) return null; s += (+b.c) * (+b.v); k++; }
    return k === n ? s / n : null;
  }
  function sigur(p) { return Promise.resolve().then(p).catch(function () { return null; }); }
  async function pregateste(sym, o) {
    o = o || {};
    var D = o.D || g.D, E = o.EARN || g.EARN, PV = o.PV || g.TTPretViu, la = Date.now(), s = simbolUS(sym);
    if (!s) return { sym: String(sym || ''), ok: false, mesaj: MESAJ_USD };
    var r = await Promise.all([
      sigur(function () { return D && typeof D.fetchStock === 'function' ? D.fetchStock(s, { range: '6mo', interval: '1d' }) : null; }),
      sigur(function () { return PV && typeof PV.cotatie === 'function' ? PV.cotatie(s) : null; }),
      sigur(function () { return E && typeof E.calendar === 'function' ? E.calendar({ zile: 14, toate: true }) : null; })
    ]);
    var serie = r[0], q = r[1], moneda = serie && serie.meta ? serie.meta.currency : null;
    if (!Array.isArray(serie) || !serie.length) return { sym: s, ok: false, mesaj: 'Seria zilnică pentru ' + s + ' nu s-a putut citi — nu pot verifica moneda și ATR-ul. Reîncearcă peste un minut.' };
    if (moneda !== 'USD') return { sym: s, ok: false, mesaj: s + ' e cotat în ' + (moneda || 'monedă necunoscută') + ' — Planurile dimensionează doar acțiuni în USD (ca restul planurilor).' };
    var adv = advUsd(serie, 20);
    if (adv !== null && adv < ADV_MIN) return { sym: s, ok: false, mesaj: s + ' schimbă în medie ' + (Math.round(adv / 1e5) / 10).toLocaleString('ro-RO') + ' M $ pe zi (20 de sesiuni) — sub pragul de 3 M $ al scannerului: prea ilichid pentru un plan (aceeași gardă de lichiditate).' };
    return { sym: s, ok: true, la: la, pret: q && q.pret > 0 ? q.pret : null, cotLa: q && q.la || null, atr: atr(serie, 14), moneda: moneda, earnings: earnings(r[2], s, la) };
  }
  g.TTIdeeProprie = { simbolUS: simbolUS, atr: atr, nivele: nivele, earnings: earnings, candidat: candidat, pret: pret, pregateste: pregateste, advUsd: advUsd, ADV_MIN: ADV_MIN, MESAJ_USD: MESAJ_USD };
})(typeof window !== 'undefined' ? window : globalThis);
