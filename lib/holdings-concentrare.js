/* 27.10.2026 (audit B 🟡 [6]): limita de concentrare pe instrument — O SINGURĂ definiție pentru Astăzi și Portofoliu, aceeași regulă ca Governor.cfg():
   tt_governor_cfg_v1.maxInstrumentPct, număr finit, > 0 și ≤ 100; altfel implicitul Governor (20 %). Doar citire; T212Capital o primește prin cfg.
   Înainte: Astăzi alerta la ≥ 25 % fix, Portofoliul la ≥ 20 % fix, T212Capital la limita din Governor. Echivalența e păzită în tools/lot-b-astazi-portofoliu.test.mjs. */
(function (g) {
  'use strict';
  const KEY = 'tt_governor_cfg_v1', IMPLICIT = 20;
  function prag(storage = g.localStorage) {
    try {
      const raw = JSON.parse(storage.getItem(KEY) || '{}'), v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.maxInstrumentPct : undefined;
      return Number.isFinite(v) && v > 0 && v <= 100 ? v : IMPLICIT;
    } catch (_) { return IMPLICIT; }
  }
  g.HoldingsConcentrare = { KEY, IMPLICIT, prag };
})(typeof window !== 'undefined' ? window : globalThis);
