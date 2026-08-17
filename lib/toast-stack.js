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
    if (threshold === true) return n > 1;
    if (threshold === false) return n > 2;
    return n > (threshold == null ? 2 : threshold);
  }

  function maxVisible(isMobile) {
    return isMobile ? 1 : MAX;
  }

  function pauseOnHover(hoverFine) {
    return !!hoverFine;
  }

  function dayKeyRO(ts) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(ts));
  }

  function alreadyShownToday(event, history, now) {
    if (!event || !event.sym) return false;
    var t0 = now == null ? Date.now() : now;
    var day = dayKeyRO(t0);
    var kind = event.kind || 'price';
    var list = history || [];
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (!h || !h.ts || h.sym !== event.sym) continue;
      if (dayKeyRO(h.ts) !== day) continue;
      var hk = h.kind || 'price';
      if (hk !== kind) continue;
      if (kind === 'ref' || kind === 'anchor') {
        if (event.step != null && h.step != null) {
          if (h.step === event.step) return true;
          continue;
        }
        return true;
      }
      if (kind === 'pct' || kind === 'day') {
        var hv = h.moved != null ? h.moved : h.dc;
        var ev = event.moved != null ? event.moved : event.dc;
        if (hv == null || ev == null) return true;
        if (Math.sign(hv) === Math.sign(ev)) return true;
        continue;
      }
      if ((event.lvl == null || h.lvl == null || h.lvl === event.lvl) &&
          (!event.dir || !h.dir || h.dir === event.dir)) return true;
    }
    return false;
  }

  var api = {
    MAX: MAX, plan: plan, digestInstead: digestInstead, maxVisible: maxVisible,
    pauseOnHover: pauseOnHover, dayKeyRO: dayKeyRO, alreadyShownToday: alreadyShownToday
  };
  g.ToastStack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
