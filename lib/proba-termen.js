/* 27.10.2026 (I-744, „cât mai durează și ce poate vedea”): toate probele în timp arătau „în probă · k/8”, dar nu spuneau CÂND poate veni
   verdictul. Modulul estimează data primului verdict posibil din protocol (perioade necesare × k sesiuni care nu se suprapun) și din
   calendarul SUA (lib/exchange-calendar.js, când e încărcat; altfel zile lucrătoare, spus pe față), și citește puterea probei.
   Când lotul F scrie în JSON `primulVerdict` / `putere` / `judecata` (protocol v2, I-741), ele au întâietate. Fără `putere` ⇒ „putere nescrisă”
   (sau puterea spusă în protocol: opt.putereProtocol, ori fraza din `criterii` a bilanțului Trend). Citește: probele cu `orizonturi`
   (Top Long, Reguli V1), umbra Reversal (`evaluare`), bilanțul Trend 12-1 (12 ferestre de 20 de zile) și orice JSON cu doar `primulVerdict`.
   TTProbaTermen.estimeaza(json, {putereProtocol}) ⇒ {data, luna, k, necesare, ramase, sursa, calendar, putere, judecata, text} sau null;
   TTProbaTermen.linie(json, opt) ⇒ textul („primul verdict posibil: ~iunie 2027 (8 perioade de 20 de sesiuni care nu se suprapun); putere nescrisă”). */
(function (g) {
  'use strict';
  if (g.TTProbaTermen) return;
  var LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var VERDICT = { astept: 'încă nu se poate spune', ajuta: 'ajută', 'baza-ajuta': 'stopul sub bază ajută', 'fara-avantaj': 'nu s-a văzut un avantaj' };
  var ZI = /^\d{4}-\d{2}-\d{2}$/, TREND = { k: 20, necesare: 12 };
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function nr(v, d) { return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function deNr(n, cuv) { return n + (n >= 20 ? ' de ' : ' ') + cuv; }
  function ziUrmatoareLucratoare(zi) {
    var d = new Date(zi + 'T12:00:00Z');
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  }
  /* n sesiuni după `zi`: pe calendarul SUA cât e cunoscut (2026–2027), apoi zile lucrătoare; spune ce a folosit */
  function adaugaSesiuni(zi, n) {
    var EC = g.ExchangeCalendar, d = zi, us = false, aprox = false, i;
    for (i = 0; i < n; i++) {
      var nx = null;
      if (EC && typeof EC.next === 'function') { try { nx = EC.next(d, 'US'); } catch (_) { nx = null; } }
      if (nx && nx.day) { d = nx.day; us = true; } else { d = ziUrmatoareLucratoare(d); aprox = true; }
    }
    return { zi: d, calendar: us && aprox ? 'US+zile lucrătoare' : us ? 'US' : 'zile lucrătoare' };
  }
  function luna(zi) { if (!ZI.test(zi || '')) return null; return LUNI[Number(zi.slice(5, 7)) - 1] + ' ' + zi.slice(0, 4); }
  function dataRo(zi) { return ZI.test(zi || '') ? zi.slice(8, 10) + '.' + zi.slice(5, 7) + '.' + zi.slice(0, 4) : '—'; }
  function orizont(j) {
    if (!j || typeof j !== 'object') return null;
    if (Array.isArray(j.orizonturi)) return j.orizonturi.filter(function (o) { return o && o.principal; })[0] || j.orizonturi[0] || null;
    if (j.evaluare && typeof j.evaluare === 'object') return j.evaluare;
    /* bilanțul Trend 12-1 (candidate-engine/generated/trend-12-1-bilant.json): fără orizonturi — constantele protocolului lui
       („cel puțin 12 ferestre de 20 de zile care nu se suprapun”, tools/trend-12-1*); ferestrele nu au dată ⇒ termenul se numără de la început */
    if (fin(j.ferestre20) || (typeof j.criterii === 'string' && /ferestre de 20/.test(j.criterii))) return { k: TREND.k, necesare: TREND.necesare, perioade: Number.isInteger(j.ferestre20) && j.ferestre20 >= 0 ? j.ferestre20 : 0, ultimaPerioada: null };
    return null;
  }
  /* puterea spusă în cuvinte de protocol (bilanțul Trend: „trece în ~25 % din cazuri în 3 ani”) — când robotul nu scrie câmpul `putere` */
  function putereDinCriterii(j) {
    var m = j && typeof j.criterii === 'string' ? j.criterii.match(/trece în ~?\s*(\d+(?:[.,]\d+)?)\s*% din cazuri în (\d+) ani/) : null;
    return m ? { pct: null, putere: Number(m[1].replace(',', '.')) / 100, text: 'poate ieși „probat” în ~' + m[1].replace('.', ',') + ' % din cazuri în ' + m[2] + ' ani (din protocol)' } : null;
  }
  /* puterea: cel mai mic avantaj văzut cu putere ≥ 80 %; altfel cel mai bine văzut, spus cinstit („doar în N % din cazuri”) */
  function putere(p, unitate, sufix) {
    var lista = p && Array.isArray(p.laPlus) ? p.laPlus.filter(function (x) { return x && fin(x.pct) && fin(x.putere); }).sort(function (a, b) { return a.pct - b.pct; }) : [];
    if (!lista.length) return null;
    var per = unitate === 'R' ? 'tranzacție' : 'perioadă', u = unitate === 'R' ? ' R' : ' %';
    /* 28.10.2026 (revizia F3, 🔵11): banda pe regim, când fișierul o scrie (V1 / Top Long: abaterea fiecărui an; verdictul: cât urmează etichetele
       trendul SPY) — nu un singur număr; o zecimală, cu anul de acum */
    var b = p && p.banda && fin(p.banda.min) && fin(p.banda.max) ? p.banda : null;
    if (b) { var pb = fin(b.pct) ? b.pct : lista[lista.length - 1].pct; return { pct: pb, putere: b.min, banda: b, text: 'un avantaj de +' + nr(pb, 1) + u + '/' + per + ' l-ar vedea doar în ' + nr(b.min * 100, 1) + '–' + nr(b.max * 100, 1) + ' % din cazuri, după regim' + (b.an && fin(b.laAn) ? ' (pe ' + b.an + ': ' + nr(b.laAn * 100, 1) + ' %)' : '') + sufix }; }
    var bun = lista.filter(function (x) { return x.putere >= 0.8; })[0];
    if (bun) return { pct: bun.pct, putere: bun.putere, text: 'poate vedea un avantaj de cel puțin +' + nr(bun.pct, 1) + u + '/' + per + ' (putere ' + Math.round(bun.putere * 100) + ' %)' + sufix };
    var max = lista.slice().sort(function (a, b) { return b.putere - a.putere; })[0];
    return { pct: max.pct, putere: max.putere, text: 'un avantaj de +' + nr(max.pct, 1) + u + '/' + per + ' l-ar vedea doar în ' + Math.round(max.putere * 100) + ' % din cazuri' + sufix };
  }
  /* 27.10.2026 (lipirea F × D, revizia F): unitatea puterii vine din fișier (umbra Reversal scrie „R pe tranzacție”, nu %), iar când rândurile
     au `perioade` (puterea la mai multe praguri), se ia rândul de la perioadele cerute — umbra ajungea „+0,3 %/perioadă … 27 %” (la 36, nu la 8) */
  function unitateDin(p) { return p && typeof p.unitate === 'string' && /(^|\s)R(\s|$)/.test(p.unitate) ? 'R' : '%'; }
  function laNecesare(p, nec) {
    if (!p || !Array.isArray(p.laPlus) || !Number.isInteger(nec)) return p;
    var cu = p.laPlus.filter(function (x) { return x && Number.isInteger(x.perioade); }); if (!cu.length) return p;
    var la = cu.filter(function (x) { return x.perioade === nec; });
    return { unitate: p.unitate, banda: p.banda, laPlus: la.length ? la : p.laPlus.filter(function (x) { return x && !Number.isInteger(x.perioade); }) };
  }
  function estimeaza(j, opt) {
    opt = opt || {};
    var o = orizont(j), generic = false;
    /* un JSON fără protocolul probei, dar cu `primulVerdict` scris de robot (ex. clasificatorul, lotul F): data din fișier, fără perioade inventate */
    if (!o) { if (j && j.primulVerdict && typeof j.primulVerdict === 'object') { o = {}; generic = true; } else return null; }
    var k = generic ? null : fin(o.k) && o.k > 0 ? o.k : 20, nec = generic ? null : Number.isInteger(o.necesare) && o.necesare > 0 ? o.necesare : 8, p = generic ? null : Number.isInteger(o.perioade) && o.perioade >= 0 ? o.perioade : 0, ramase = generic ? null : Math.max(0, nec - p);
    var out = { k: k, necesare: nec, perioade: p, ramase: ramase, data: null, luna: null, sursa: 'protocol', calendar: null, putere: null, judecata: null, text: '' };
    var pv = j.primulVerdict && typeof j.primulVerdict === 'object' ? j.primulVerdict : null, scris = pv && (ZI.test(pv.realist || '') ? pv.realist : ZI.test(pv.optimist || '') ? pv.optimist : null);
    if (scris) { out.data = scris; out.sursa = 'fișier'; out.calendar = 'fișier'; }
    else if (ramase > 0) {
      /* de la ultima perioadă închisă (datată) mai trebuie (rămase + 1) × k sesiuni; fără ea, toate cele necesare de la începutul probei */
      var dinUltima = p > 0 && o.ultimaPerioada && ZI.test(o.ultimaPerioada.zi || '');
      var baza = dinUltima ? o.ultimaPerioada.zi : ZI.test(j.inceput || '') ? j.inceput : ZI.test(j.de || '') ? j.de : ZI.test(j.ultimaZi || '') ? j.ultimaZi : null;
      if (baza) { var r = adaugaSesiuni(baza, (dinUltima ? nec - p + 1 : nec) * k); out.data = r.zi; out.calendar = r.calendar; }
    }
    out.luna = luna(out.data);
    out.putere = putere(laNecesare(j.putere, nec), unitateDin(j.putere), '') || (opt.putereProtocol ? putere(laNecesare(opt.putereProtocol, nec), opt.putereProtocol.unitate === 'R' ? 'R' : unitateDin(opt.putereProtocol), ' (din protocol)') : null) || putereDinCriterii(j);
    var jd = j.judecata && typeof j.judecata === 'object' ? j.judecata : null;
    if (jd) out.judecata = { la: fin(jd.la) ? jd.la : null, data: typeof jd.data === 'string' && jd.data ? jd.data.slice(0, 10) : null, verdict: jd.verdict || null, unic: jd.unic === true };
    var parti = [];
    if (out.judecata && out.judecata.data) parti.push('judecată unică pe ' + dataRo(out.judecata.data) + ': ' + (VERDICT[out.judecata.verdict] || out.judecata.verdict || '—'));
    else if (ramase === 0) parti.push('cele ' + deNr(nec, 'perioade') + ' s-au strâns — verdictul e cel de mai sus');
    else if (generic) parti.push(out.luna ? 'primul verdict posibil: ~' + out.luna : 'primul verdict: data nescrisă în fișier');
    else if (out.luna) parti.push('primul verdict posibil: ~' + out.luna + ' (' + deNr(nec, 'perioade') + ' de ' + deNr(k, 'sesiuni') + ' care nu se suprapun' + (out.calendar === 'zile lucrătoare' ? '; zile lucrătoare, fără sărbătorile SUA' : out.calendar === 'US+zile lucrătoare' ? '; după 2027 zile lucrătoare, fără sărbătorile SUA' : '') + ')');
    else parti.push('primul verdict: după ' + deNr(nec, 'perioade') + ' de ' + deNr(k, 'sesiuni') + ' (data nu se poate estima — jurnalul n-are început)');
    if (out.judecata && out.judecata.unic && !out.judecata.data) parti.push('o singură judecată, la ' + (out.judecata.la || nec) + ' perioade');
    parti.push(out.putere ? out.putere.text : 'putere nescrisă');
    out.text = parti.join('; ');
    return out;
  }
  function linie(j, opt) { var e = estimeaza(j, opt); return e ? e.text : ''; }
  g.TTProbaTermen = { estimeaza: estimeaza, linie: linie, adaugaSesiuni: adaugaSesiuni, luna: luna, LUNI: LUNI };
})(typeof window !== 'undefined' ? window : globalThis);
