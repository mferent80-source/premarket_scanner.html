// ═══════════════════════════════════════════════════════════════════
// utils.js — Helper-uri comune pentru toate scannerele + journal
// Folosire: <script src="../lib/utils.js"></script> apoi U.escHtml(...) etc.
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  // Escape HTML pentru câmpuri user-typed/extern (XSS apărare la render)
  function escHtml(s){
    return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // Sanitize ticker crypto/stocks (apărare XSS la sursă)
  function safeSymbol(sym){
    return /^[A-Z0-9]{2,20}USDT$/.test(sym||'') ? sym : null;
  }
  function safeCoin(c){
    return /^[A-Z0-9.\-]{1,15}$/.test(c||'') ? c : '';
  }

  // Format preț cu zecimale adaptive
  function formatP(p){
    if(!p || isNaN(p)) return '—';
    if(p >= 10000) return '$' + p.toLocaleString('en', {maximumFractionDigits: 0});
    if(p >= 100) return '$' + p.toFixed(2);
    if(p >= 1) return '$' + p.toFixed(4);
    return '$' + p.toFixed(6);
  }

  // Format USD cu zecimale fixe + sign
  function formatUSD(v, decimals){
    if(v === null || v === undefined || isNaN(v)) return '—';
    decimals = decimals === undefined ? 2 : decimals;
    return (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Time ago format ("5m", "2h", "3d")
  function timeAgo(ts){
    const d = Math.floor((Date.now() - ts) / 1000);
    if(d < 60) return d + 's';
    if(d < 3600) return Math.floor(d/60) + 'm';
    if(d < 86400) return Math.floor(d/3600) + 'h';
    return Math.floor(d/86400) + 'd';
  }

  // fetchSafe cu AbortController real + backoff per-host la 429/418 (Binance/equivalent)
  const _rlState = new Map();
  function _rlHost(url){ try { return new URL(url).host; } catch(e) { return url; } }
  function _rlIsBlocked(url){
    const s = _rlState.get(_rlHost(url));
    return s && s.backoffUntil > Date.now() ? Math.ceil((s.backoffUntil - Date.now())/1000) : 0;
  }
  function _rlMark(url, retryAfterSec){
    const ms = (retryAfterSec || 60) * 1000;
    _rlState.set(_rlHost(url), { backoffUntil: Date.now() + ms });
  }
  async function fetchSafe(url, ms){
    ms = ms || 8000;
    const blocked = _rlIsBlocked(url);
    if(blocked) throw new Error('rate-limited (' + blocked + 's)');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if(!r.ok){
        if(r.status === 429 || r.status === 418){
          const ra = parseInt(r.headers.get('Retry-After') || '60', 10);
          _rlMark(url, ra);
        }
        throw new Error(r.status);
      }
      return r;
    } finally {
      clearTimeout(t);
    }
  }

  // Trim bara curentă (incompletă) dacă mode = closed bar (anti-repaint)
  function trimLiveBar(klines, useClosedOnly){
    if(!Array.isArray(klines) || klines.length < 2) return klines;
    return useClosedOnly ? klines.slice(0, -1) : klines;
  }

  global.U = {
    escHtml, safeSymbol, safeCoin,
    formatP, formatUSD, timeAgo,
    fetchSafe, trimLiveBar
  };
})(typeof window !== 'undefined' ? window : globalThis);
