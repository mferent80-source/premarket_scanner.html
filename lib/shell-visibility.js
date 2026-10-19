/* 19.10.2026 (I-702): o pagină parcată în aplicație e doar ascunsă, nu oprită — `document.hidden` rămâne fals, iar ceasurile ei
   lucrau mai departe pe același fir cu pagina de pe ecran. Aplicația anunță fiecare pagină cu postMessage({ttShellVisible}).
   TTShell.visible()       — pagina e chiar pe ecran (aplicația o arată și tabul e vizibil);
   TTShell.onChange(cb)    — cb(visible) la fiecare schimbare; întoarce funcția de dezabonare;
   TTShell.every(fn, ms)   — ca setInterval, dar nu rulează cât pagina e ascunsă; dacă a ratat un pas, rulează o dată la revenire.
   O pagină deschisă direct (în afara aplicației) e vizibilă după `document.hidden`, ca înainte. */
(function (g) {
  'use strict';
  if (g.TTShell) return;
  let shell = true, last = null;
  const subs = new Set();
  const visible = () => shell && !(g.document && g.document.hidden);
  function notify() { const now = visible(); if (now === last) return; last = now; subs.forEach((f) => { try { f(now); } catch (_) {} }); }
  g.addEventListener && g.addEventListener('message', (e) => {
    if (!e || e.origin !== (g.location && g.location.origin) || !e.data || typeof e.data.ttShellVisible !== 'boolean') return;
    shell = e.data.ttShellVisible; notify();
  });
  g.document && g.document.addEventListener && g.document.addEventListener('visibilitychange', notify);
  function onChange(cb) { if (last === null) last = visible(); subs.add(cb); return () => subs.delete(cb); }
  function every(fn, ms) {
    let missed = false;
    const id = setInterval(() => { if (visible()) { missed = false; fn(); } else missed = true; }, ms);
    const off = onChange((v) => { if (v && missed) { missed = false; fn(); } });
    return () => { clearInterval(id); off(); };
  }
  g.TTShell = { visible, onChange, every };
})(typeof window !== 'undefined' ? window : globalThis);
