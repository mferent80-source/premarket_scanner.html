// suite-version.js — sursă unică badge hub + health (sync cu sw.js CACHE_VERSION)
(function (global) {
  'use strict';
  global.SUITE_VERSION = 'tt-v713-2026-07-27';
  global.SUITE_VERSION_SHORT = 'tt-v713';

  function paintSuiteBadge() {
    const sb = document.getElementById('suiteBadge');
    if (sb) sb.textContent = global.SUITE_VERSION_SHORT;
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', paintSuiteBadge);
    } else {
      paintSuiteBadge();
    }
  }
})(typeof window !== 'undefined' ? window : global);
