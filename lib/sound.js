// ═══════════════════════════════════════════════════════════════════
// sound.js — Beep de alertă partajat (SND.*). Înlocuiește ~6 copii de beep().
// Stare partajată prin localStorage 'wl_sound' ('1'/'0').
//
// Folosire: <script src="../lib/sound.js"></script>
//   if (SND.isEnabled()) SND.beep();
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const SOUND_KEY = 'wl_sound';
  let _ctx = null;

  function isEnabled(){ try { return localStorage.getItem(SOUND_KEY) === '1'; } catch(e){ return false; } }
  function setEnabled(on){ try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch(e){} }
  function toggle(){ const v = !isEnabled(); setEnabled(v); if(v) beep(); return v; }

  // Beep cu 2 tonuri (default 880/1320 Hz) — sunet de alertă scurt, non-intruziv.
  function beep(freqs){
    freqs = freqs || [880, 1320];
    try {
      _ctx = _ctx || new (global.AudioContext || global.webkitAudioContext)();
      const ctx = _ctx, t = ctx.currentTime;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination);
        const st = t + i * 0.17;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.18, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2);
        o.start(st); o.stop(st + 0.22);
      });
    } catch(e){}
  }

  global.SND = { isEnabled, setEnabled, toggle, beep, KEY: SOUND_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
