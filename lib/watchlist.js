// ═══════════════════════════════════════════════════════════════════
// watchlist.js — Watchlist de stocks PARTAJAT între pagini (WL.*).
// localStorage 'wl_stocks' (array de simboluri). Sync cross-tab inclus.
//
// Folosire: <script src="../lib/watchlist.js"></script>
//   WL.toggle('AAPL'); WL.onSync(() => render());
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'wl_stocks';

  function get(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function save(arr){
    try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch(e){}
  }
  function has(sym){ return get().indexOf(sym) >= 0; }
  function add(sym){ const a = get(); if(a.indexOf(sym) < 0){ a.push(sym); save(a); } return a; }
  function remove(sym){ const a = get().filter(s => s !== sym); save(a); return a; }
  function toggle(sym){ return has(sym) ? remove(sym) : add(sym); }

  // onSync — apelează cb când watchlist-ul se schimbă în ALT tab (storage event).
  function onSync(cb){
    global.addEventListener('storage', e => { if(e.key === KEY) try { cb(get()); } catch(_){} });
  }

  global.WL = { get, save, has, add, remove, toggle, onSync, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
