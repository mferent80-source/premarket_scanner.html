// poll-wake.js — trezire poll după sleep / tab hidden / bfcache.
// Folosire: <script src="../lib/poll-wake.js"></script> apoi
//   var wake = PollWake.bind({ getBusy, setBusy, getBusyTs, setBusyTs, poll, schedule, ... });
//   wake.resume('visibility');
(function (g) {
  'use strict';

  function dropInflight() {
    try {
      var d = g.D || (typeof globalThis !== 'undefined' && globalThis.D) || null;
      if (d && typeof d.dropInflight === 'function') d.dropInflight();
    } catch (e) {}
  }

  function bind(opts) {
    opts = opts || {};
    var hangMs = opts.hangMs != null ? opts.hangMs : 120000;
    var intervalMs = opts.intervalMs != null ? opts.intervalMs : 30000;

    function resume(why) {
      try { console.warn('[poll] resume', why || ''); } catch (e) {}
      if (opts.setBusy) opts.setBusy(false);
      if (opts.setBusyTs) opts.setBusyTs(0);
      dropInflight();
      if (opts.schedule) try { opts.schedule(); } catch (e) {}
      if (opts.poll) {
        try {
          var p = opts.poll();
          if (p && typeof p.catch === 'function') p.catch(function (err) { console.error('[poll] resume eșuat:', err); });
        } catch (e) { try { console.error('[poll] resume eșuat:', e); } catch (e2) {} }
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      resume('visibility');
      if (opts.onVisible) try { opts.onVisible(); } catch (e) {}
    });
    window.addEventListener('pageshow', function (e) {
      var stale = opts.isStale ? !!opts.isStale() : false;
      if (e.persisted || stale) resume('pageshow');
    });
    var timer = setInterval(function () {
      if (opts.isPaused && opts.isPaused()) return;
      if (opts.isShellHidden && opts.isShellHidden()) return;
      var busy = opts.getBusy ? opts.getBusy() : false;
      var busyTs = opts.getBusyTs ? opts.getBusyTs() : 0;
      if (busy && busyTs && Date.now() - busyTs > hangMs) {
        if (opts.setBusy) opts.setBusy(false);
        dropInflight();
      }
      if (document.hidden) return;
      if (!(opts.isStale && opts.isStale())) return;
      try {
        var age = opts.lastOkAgeMs ? opts.lastOkAgeMs() : null;
        console.warn('[poll] lanț mort de', age != null ? Math.round(age / 1000) : '?', 's → repornit de watchdog');
      } catch (e) {}
      resume('watchdog');
    }, intervalMs);
    if (timer && typeof timer.unref === 'function') timer.unref();

    return { resume: resume, stop: function () { try { clearInterval(timer); } catch (e) {} } };
  }

  g.PollWake = { bind: bind, dropInflight: dropInflight };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.PollWake;
})(typeof window !== 'undefined' ? window : globalThis);
