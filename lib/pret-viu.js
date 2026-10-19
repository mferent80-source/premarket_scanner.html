/* 19.10.2026 (audit Long & Reversal): planul scannerului e calculat pe închiderea de ieri (EOD), iar tichetul din Planuri nu vedea
   prețul de acum ⇒ cu bursa deschisă, „PLAN VALIDABIL” putea însemna un risc real de 1,6× cel afișat (AAPL: 14,91 față de 9,40).
   TTPretViu.verifica(candidat) citește ultimul preț (Yahoo, bare de 1 minut, prin D.fetchStock, cel mult o dată pe minut) și spune:
   e în zona de intrare? cât e riscul pe acțiune la prețul de acum față de cel planificat? Fără preț ⇒ „neverificat”, nu „în regulă”.
   TTPretViu.evalueaza(candidat, {pret, la}) — partea pură (fără rețea), folosită și de teste. */
(function (g) {
  'use strict';
  if (g.TTPretViu) return;
  var cache = new Map(), MIN = 60000, VECHI = 20 * 60000;
  function fmt(v) { return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function evalueaza(x, q, now) {
    now = now || Date.now();
    if (!x || !(x.entryLow > 0) || !(x.entryHigh > 0) || !(x.stop > 0)) return null;
    if (!q || !(q.pret > 0)) return { stare: 'neverificat', text: 'prețul de acum nu s-a putut citi — verifică-l în Trading 212 înainte de ordin' };
    var vechi = q.la && now - q.la > VECHI;
    var planat = x.entryHigh - x.stop, real = q.pret - x.stop, raport = planat > 0 ? real / planat : null;
    var cand = vechi ? ' (cotația are ' + Math.round((now - q.la) / 60000) + ' min — piața e probabil închisă)' : '';
    if (real <= 0) return { stare: 'sub-stop', pret: q.pret, raport: raport, text: 'prețul de acum ' + fmt(q.pret) + ' e SUB stop (' + fmt(x.stop) + ') — planul nu mai e valabil' + cand };
    if (q.pret > x.entryHigh * 1.0005) return { stare: 'peste', pret: q.pret, raport: raport, text: 'prețul de acum ' + fmt(q.pret) + ' e PESTE zona de intrare (' + fmt(x.entryLow) + '–' + fmt(x.entryHigh) + '): la piață riscul pe acțiune ar fi ' + fmt(real) + ' în loc de ' + fmt(planat) + ' (×' + raport.toFixed(2).replace('.', ',') + ') — pune ordin limită în zonă sau sari' + cand };
    if (q.pret < x.entryLow * 0.9995) return { stare: 'sub', pret: q.pret, raport: raport, text: 'prețul de acum ' + fmt(q.pret) + ' e sub zona de intrare — setup-ul s-a slăbit de la închidere; reverifică în scanner' + cand };
    return { stare: 'in-zona', pret: q.pret, raport: raport, text: 'prețul de acum ' + fmt(q.pret) + ' e în zona de intrare' + cand };
  }
  async function cotatie(sym) {
    var c = cache.get(sym);
    if (c && Date.now() - c.citit < MIN) return c;
    var bars = await g.D.fetchStock(sym, { range: '1d', interval: '1m', ttl: 60 });
    var last = Array.isArray(bars) && bars.length ? bars[bars.length - 1] : null, m = bars && bars.meta || {};
    var q = { pret: last && last.c > 0 ? Number(last.c) : null, la: Number(m.quoteAt) > 0 ? Number(m.quoteAt) : last && last.t || null, citit: Date.now() };
    cache.set(sym, q);
    return q;
  }
  async function verifica(x) {
    if (!x || !x.symbol) return null;
    var q = null;
    try { q = g.D && typeof g.D.fetchStock === 'function' ? await cotatie(x.symbol) : null; } catch (_) { q = null; }
    var r = evalueaza(x, q);
    if (r) r.symbol = x.symbol;
    return r;
  }
  g.TTPretViu = { evalueaza: evalueaza, verifica: verifica };
})(typeof window !== 'undefined' ? window : globalThis);
