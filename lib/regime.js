// lib/regime.js — consumer READ-ONLY al regimului de risc publicat de Macro Dashboard.
// Macro scrie localStorage['md_risk_regime'] = { label, composite, color, ts }.
// Orice pagină: <script src="../lib/regime.js"></script> + <span data-regime-badge="../macro-dashboard/"></span>
// → badge-ul se montează singur la load (auto-mount). API manual: Regime.get() / Regime.badgeHTML() / Regime.mount(el, href).
(function (global) {
  'use strict';
  var KEY = 'md_risk_regime';
  var MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h — peste asta regimul e considerat „stale" (afișat estompat)

  // Citește regimul curent. Returnează null dacă lipsește / corupt.
  function get() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!r || !r.label) return null;
      var ts = r.ts || 0;
      var ageMs = Date.now() - ts;
      return {
        label: r.label,                                       // ex: "🔴 RISK-OFF"
        composite: typeof r.composite === 'number' ? r.composite : null,
        color: r.color || 'var(--t1,#fff)',
        ageMin: Math.max(0, Math.round(ageMs / 60000)),
        fresh: ageMs >= 0 && ageMs < MAX_AGE_MS
      };
    } catch (e) { return null; }
  }

  // HTML compact pentru un badge de regim. '' dacă nu există regim publicat încă.
  function badgeHTML() {
    var r = get();
    if (!r) return '';
    var sign = r.composite == null ? '' : (' ' + (r.composite >= 0 ? '+' : '') + r.composite);
    var age = r.ageMin >= 1440 ? (Math.round(r.ageMin / 1440) + 'z') : (r.ageMin + 'm');
    var stale = r.fresh ? '' : (' · ⏳' + age);
    var title = 'Regim de risc (din Macro Dashboard' + (r.fresh ? '' : ' — vechi de ' + age) + '). Click → Macro.';
    return '<span class="regime-badge" title="' + title + '" ' +
      'style="display:inline-flex;align-items:center;gap:5px;font-family:var(--mono,monospace);font-size:11px;font-weight:700;' +
      'padding:3px 9px;border-radius:999px;border:1px solid ' + r.color + '55;color:' + r.color + ';background:' + r.color + '14;' +
      (r.fresh ? '' : 'opacity:.6;') + 'white-space:nowrap;cursor:pointer">🛡 ' + r.label + sign + stale + '</span>';
  }

  // Montează badge-ul într-un element (id sau nod). Click → navighează la macroHref (dacă dat).
  function mount(target, macroHref) {
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    var html = badgeHTML();
    el.innerHTML = html; // gol dacă nu există regim → badge-ul dispare curat
    if (!html) return;
    var b = el.querySelector('.regime-badge');
    if (b && macroHref) b.addEventListener('click', function () { location.href = macroHref; });
  }

  // Auto-mount: orice element cu [data-regime-badge="<href-macro>"] primește badge-ul la load.
  function autoMount() {
    var els = document.querySelectorAll('[data-regime-badge]');
    for (var i = 0; i < els.length; i++) mount(els[i], els[i].getAttribute('data-regime-badge') || null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();

  global.Regime = { get: get, badgeHTML: badgeHTML, mount: mount, KEY: KEY };
})(window);
