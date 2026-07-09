// finnhub-key.js — cheie Finnhub unificată (fh_key Nasdaq + finnhub_api_key restul suitei)
(function(global){
  'use strict';
  const PRIMARY = 'finnhub_api_key';
  const LEGACY = 'fh_key';

  function get(){
    try {
      return localStorage.getItem(PRIMARY) || localStorage.getItem(LEGACY) || '';
    } catch (e) { return ''; }
  }

  function set(key){
    const v = String(key || '').trim();
    if (!v) return false;
    try {
      localStorage.setItem(PRIMARY, v);
      localStorage.setItem(LEGACY, v);
      return true;
    } catch (e) { return false; }
  }

  function migrate(){
    try {
      const p = localStorage.getItem(PRIMARY);
      const l = localStorage.getItem(LEGACY);
      if (p && !l) localStorage.setItem(LEGACY, p);
      else if (l && !p) localStorage.setItem(PRIMARY, l);
    } catch (e) {}
    return get();
  }

  global.FH_KEY = { get, set, migrate, PRIMARY, LEGACY };
})(typeof window !== 'undefined' ? window : globalThis);