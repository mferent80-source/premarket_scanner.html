// toast-stack.js — plafon stivă popup-uri + digest când sar multe deodată.
// Folosire: <script src="../lib/toast-stack.js"></script> apoi ToastStack.plan(...)
(function (g) {
  'use strict';

  var MAX = 3;

  function plan(existingCount, maxVisible) {
    var max = maxVisible == null ? MAX : maxVisible;
    var next = (existingCount || 0) + 1;
    return {
      removeOldest: Math.max(0, next - max),
      visibleAfter: Math.min(next, max),
      showDismissAll: next > 1
    };
  }

  function digestInstead(n, threshold) {
    return n > (threshold == null ? 2 : threshold);
  }

  function pauseOnHover(hoverFine) {
    return !!hoverFine;
  }

  var api = { MAX: MAX, plan: plan, digestInstead: digestInstead, pauseOnHover: pauseOnHover };
  g.ToastStack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
