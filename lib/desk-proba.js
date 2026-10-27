/* 19.10.2026 (I-709, prudență — nu avantaj dovedit): Top Long e în proba în timp (scanner-verdicts/generated/premarket-proba.json,
   protocolul docs/premarket-proba-protocol.md) dar primea FIRE verde și plan cu riscul obișnuit. Până la verdictul „Top Long ajută”
   eticheta „în probă · N/8” stă lângă stare, iar riscul unui plan Top Long e plafonat la 0,25 %. Fișierul lipsă sau ilizibil
   NU ridică plafonul (închis la eroare). 27.10.2026 (I-742): Early Reversal nu e judecat de nicio probă în timp (doar notat descriptiv;
   pe istoric, 14.10 și 19.10, fără avantaj) ⇒ același plafon de 0,25 % și eticheta „în probă · nejudecat”, ca Top Long — prudență, nu verdict.
   I-744: s.termen (TTProbaTermen, când e încărcat) = primul verdict posibil și puterea, lipite la s.text.
   27.10.2026 (revizia F, 🟡11; politica F § 2): un „ajută” CU REZERVE (persistența perioadelor ≥ 0,2 — testul semnelor ar avea ~6–7 %, nu 5 %)
   NU ridică plafonul fără o decizie scrisă în politica F § 6; eticheta spune „ajută cu rezerve”.
   TTProbaTopLong.load(url)   — citește fișierul (cel mult o dată pe oră); TTProbaTopLong.set(json) — direct, din fișierul citit;
   TTProbaTopLong.state()     — {known, verdict, perioade, necesare, dovedit, eticheta, text, plafon};
   TTProbaTopLong.cap(riscPct, candidat) — riscul plafonat pentru Top Long ('momentum') sau Early Reversal ('reversal'); restul neschimbat;
   TTProbaTopLong.tag(candidat) — eticheta pentru un rând Top Long / Early Reversal, '' pentru restul; TTProbaTopLong.text(candidat) — nota probei lui. */
(function (g) {
  'use strict';
  if (g.TTProbaTopLong) return;
  var PLAFON = 0.25, ORA = 3600000, stare = null, citit = 0, zbor = null, json = null;
  var REVERSAL = Object.freeze({ eticheta: 'în probă · nejudecat', plafon: PLAFON, text: 'Early Reversal nu e judecat de nicio probă în timp (doar notat descriptiv în jurnalul Top Long; pe istoric, 14.10 și 19.10, fără avantaj văzut) — riscul unui plan Early Reversal e plafonat la 0,25 %, ca Top Long. Stopul lui se judecă „în umbră” (Piață). Prudență, nu un avantaj dovedit.' });
  var subs = [];
  function din(j) {
    var o = j && Array.isArray(j.orizonturi) ? j.orizonturi.filter(function (x) { return x && x.principal; })[0] : null;
    if (!o) return { known: false, verdict: 'necunoscut', perioade: null, necesare: 8, k: 20 };
    var nec = Number.isInteger(o.necesare) && o.necesare > 0 ? o.necesare : 8;
    return { known: true, verdict: String(o.verdict || 'astept'), rezerve: o.rezerve ? String(o.rezerve) : null, perioade: Number.isInteger(o.perioade) && o.perioade >= 0 ? o.perioade : 0, necesare: nec, k: Number(o.k) || 20, ultimaZi: j.ultimaZi || null };
  }
  function complet(s, j) {
    s.cuRezerve = s.known && s.verdict === 'ajuta' && !!s.rezerve;
    s.dovedit = s.known && s.verdict === 'ajuta' && !s.cuRezerve;
    s.plafon = s.dovedit ? null : PLAFON;
    s.eticheta = s.dovedit ? '' : !s.known ? 'în probă · neverificat' : s.cuRezerve ? 'ajută cu rezerve · plafonat' : s.verdict === 'fara-avantaj' ? 'fără avantaj văzut · ' + s.perioade + '/' + s.necesare : 'în probă · ' + s.perioade + '/' + s.necesare;
    s.text = s.dovedit ? 'Top Long: proba în timp spune „ajută” — riscul obișnuit.'
      : s.cuRezerve ? 'Top Long: proba în timp spune „ajută”, dar cu rezerve (' + s.rezerve + ') — riscul unui plan Top Long rămâne plafonat la 0,25 % până la o decizie scrisă (politica F § 6).'
      : !s.known ? 'Top Long e în proba în timp; fișierul probei nu s-a putut citi, așa că riscul unui plan Top Long rămâne plafonat la 0,25 %.'
      : 'Top Long e în proba în timp: ' + s.perioade + ' din ' + s.necesare + ' perioade de ' + s.k + ' sesiuni' + (s.verdict === 'fara-avantaj' ? ', fără avantaj văzut' : ', verdict abia după ' + s.necesare) + '. Până atunci riscul unui plan Top Long e plafonat la 0,25 %. Prudență, nu un avantaj dovedit.';
    s.termen = s.known && g.TTProbaTermen && typeof g.TTProbaTermen.linie === 'function' ? g.TTProbaTermen.linie(j) : '';
    if (s.termen && !s.dovedit) s.text += ' ' + s.termen.charAt(0).toUpperCase() + s.termen.slice(1) + '.';
    return s;
  }
  function set(j) { json = j; stare = complet(din(j), j); citit = Date.now(); subs.slice().forEach(function (f) { try { f(stare); } catch (_) {} }); return stare; }
  function state() { return stare || complet(din(null), null); }
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
  function eReversal(x) { return !!x && x.mode === 'reversal'; }
  function cap(risc, x) { var s = state(); if (eReversal(x)) return risc > REVERSAL.plafon ? REVERSAL.plafon : risc; return eTopLong(x) && s.plafon != null && risc > s.plafon ? s.plafon : risc; }
  function tag(x) { return eTopLong(x) ? state().eticheta : eReversal(x) ? REVERSAL.eticheta : ''; }
  function text(x) { return eReversal(x) ? REVERSAL.text : eTopLong(x) ? state().text : ''; }
  function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  g.TTProbaTopLong = { load: load, set: set, state: state, cap: cap, tag: tag, text: text, onChange: onChange, PLAFON: PLAFON, REVERSAL: REVERSAL };
})(typeof window !== 'undefined' ? window : globalThis);
