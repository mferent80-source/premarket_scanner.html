// ═══════════════════════════════════════════════════════════════════
// ledger.js — REGISTRU CROSS-SUITE DE SEMNALE („care scanner face bani?")
//
// Fiecare pagină consemnează semnalele ei de top printr-o singură linie:
//   LEDGER.log('wlm-strongbuy', 'NVDA', 142.31, '🚀 STRONG BUY')
// Dedupe: o intrare per (sursă, simbol, zi ET) — auto-scan-urile nu spamează.
// Evaluarea (+5/+20 zile de tranzacționare) se face la VIZUALIZARE, în
// scorecard-ul din Hub (fetch closes la cerere) — aici doar consemnăm.
//
// Surse active: wlm-strongbuy (Watchlist Monitor, STRONG BUY nou) ·
// me-early (Market Events, early-bird daily) · me-fire (FIRE 5m POST soft-gates) ·
// me-fire-raw (FIRE pre soft-gates — shadow OOS cap/RS) ·
// stl-ready (Smart Trade Long, verdict READY) · nasdaq-opp80 (nasdaq-scanner, buy score ≥80)
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_signal_ledger';
  const MAX = 500; // FIFO — cele mai vechi ies

  function etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }
  function all(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function log(src, sym, price, tier){
    if (!src || !sym || !(Number(price) > 0)) return false;
    const day = etDay();
    const a = all();
    if (a.some(e => e.src === src && e.sym === String(sym).toUpperCase() && e.day === day)) return false;
    a.push({ src, sym: String(sym).toUpperCase(), price: Number(price), tier: String(tier || ''), ts: Date.now(), day });
    while (a.length > MAX) a.shift();
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch(e){}
    return true;
  }
  function clear(){ try { localStorage.removeItem(KEY); } catch(e){} }

  global.LEDGER = { log, all, clear, etDay, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
