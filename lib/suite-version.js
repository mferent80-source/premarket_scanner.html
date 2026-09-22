// suite-version.js — sursă unică badge hub + health (sync cu sw.js CACHE_VERSION)
(function (global) {
  'use strict';
  global.SUITE_VERSION = 'tt-v809-2026-09-22';
  global.SUITE_VERSION_SHORT = 'tt-v809';

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
