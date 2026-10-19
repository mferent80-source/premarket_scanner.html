/* 19.10.2026 (I-709, prudență — nu avantaj dovedit): Top Long e în proba în timp (scanner-verdicts/generated/premarket-proba.json,
   protocolul docs/premarket-proba-protocol.md) dar primea FIRE verde și plan cu riscul obișnuit. Până la verdictul „Top Long ajută”
   eticheta „în probă · N/8” stă lângă stare, iar riscul unui plan Top Long e plafonat la 0,25 %. Fișierul lipsă sau ilizibil
   NU ridică plafonul (închis la eroare). Early Reversal nu e judecat de probă (doar descriptiv) — modulul nu-l atinge.
   TTProbaTopLong.load(url)   — citește fișierul (cel mult o dată pe oră); TTProbaTopLong.set(json) — direct, din fișierul citit;
   TTProbaTopLong.state()     — {known, verdict, perioade, necesare, dovedit, eticheta, text, plafon};
   TTProbaTopLong.cap(riscPct, candidat) — riscul plafonat pentru un candidat Top Long (mode 'momentum'); restul neschimbat;
   TTProbaTopLong.tag(candidat) — eticheta pentru un rând Top Long, '' pentru restul. */
(function (g) {
  'use strict';
  if (g.TTProbaTopLong) return;
  var PLAFON = 0.25, ORA = 3600000, stare = null, citit = 0, zbor = null;
  var subs = [];
  function din(j) {
    var o = j && Array.isArray(j.orizonturi) ? j.orizonturi.filter(function (x) { return x && x.principal; })[0] : null;
    if (!o) return { known: false, verdict: 'necunoscut', perioade: null, necesare: 8, k: 20 };
    var nec = Number.isInteger(o.necesare) && o.necesare > 0 ? o.necesare : 8;
    return { known: true, verdict: String(o.verdict || 'astept'), perioade: Number.isInteger(o.perioade) && o.perioade >= 0 ? o.perioade : 0, necesare: nec, k: Number(o.k) || 20, ultimaZi: j.ultimaZi || null };
  }
  function complet(s) {
    s.dovedit = s.known && s.verdict === 'ajuta';
    s.plafon = s.dovedit ? null : PLAFON;
    s.eticheta = s.dovedit ? '' : !s.known ? 'în probă · neverificat' : s.verdict === 'fara-avantaj' ? 'fără avantaj văzut · ' + s.perioade + '/' + s.necesare : 'în probă · ' + s.perioade + '/' + s.necesare;
    s.text = s.dovedit ? 'Top Long: proba în timp spune „ajută” — riscul obișnuit.'
      : !s.known ? 'Top Long e în proba în timp; fișierul probei nu s-a putut citi, așa că riscul unui plan Top Long rămâne plafonat la 0,25 %.'
      : 'Top Long e în proba în timp: ' + s.perioade + ' din ' + s.necesare + ' perioade de ' + s.k + ' sesiuni' + (s.verdict === 'fara-avantaj' ? ', fără avantaj văzut' : ', verdict abia după ' + s.necesare) + '. Până atunci riscul unui plan Top Long e plafonat la 0,25 %. Prudență, nu un avantaj dovedit.';
    return s;
  }
  function set(j) { stare = complet(din(j)); citit = Date.now(); subs.slice().forEach(function (f) { try { f(stare); } catch (_) {} }); return stare; }
  function state() { return stare || complet(din(null)); }
  function load(url) {
    if (zbor) return zbor;
    if (stare && Date.now() - citit < ORA) return Promise.resolve(stare);
    if (typeof g.fetch !== 'function') return Promise.resolve(state());
    zbor = g.fetch((url || '../scanner-verdicts/generated/premarket-proba.json') + '?x=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (j) { zbor = null; return set(j); });
    return zbor;
  }
  function eTopLong(x) { return !!x && x.mode === 'momentum'; }
  function cap(risc, x) { var s = state(); return eTopLong(x) && s.plafon != null && risc > s.plafon ? s.plafon : risc; }
  function tag(x) { return eTopLong(x) ? state().eticheta : ''; }
  function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  g.TTProbaTopLong = { load: load, set: set, state: state, cap: cap, tag: tag, onChange: onChange, PLAFON: PLAFON };
})(typeof window !== 'undefined' ? window : globalThis);
