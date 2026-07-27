// quote-bus.js — bus unificat de cotații live cross-pagini (I-214 / QB.*)
// Un writer (hub / orice pagină) scrie SPY/QQQ/VIX (+ opțional WL); restul
// citesc sync din LS + BroadcastChannel, re-fetch doar la miss/stale.
// Nu înlocuiește D.fetchJSON — e strat deasupra, pe simbol.
(function (global) {
  'use strict';

  const LS_KEY = 'tt_quotes_v1';
  const BC_NAME = 'tt-quotes-v1';
  const DEFAULT_MAX_AGE = 45000; // 45s — aliniat hub refresh
  const MAX_SYMS = 80; // plafon LS ca să nu umplem quota cu WL mare

  let mem = { quotes: {}, ts: 0 };
  let bc = null;
  const listeners = new Set();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw && raw.quotes && typeof raw.quotes === 'object') {
        mem = { quotes: raw.quotes, ts: raw.ts || 0 };
      }
    } catch (e) {}
    return mem;
  }

  function persist() {
    try {
      // trim: păstrează cele mai proaspete MAX_SYMS
      const entries = Object.entries(mem.quotes || {});
      if (entries.length > MAX_SYMS) {
        entries.sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        const keep = {};
        entries.slice(0, MAX_SYMS).forEach(([k, v]) => { keep[k] = v; });
        mem.quotes = keep;
      }
      mem.ts = Date.now();
      localStorage.setItem(LS_KEY, JSON.stringify(mem));
    } catch (e) {}
  }

  function normSym(sym) {
    return String(sym || '').trim().toUpperCase().replace(/^\^/, '');
  }

  function isFresh(q, maxAge) {
    if (!q || !Number.isFinite(q.price)) return false;
    const age = Date.now() - (q.ts || 0);
    return age >= 0 && age <= (maxAge != null ? maxAge : DEFAULT_MAX_AGE);
  }

  function get(sym, maxAge) {
    if (!mem.quotes || !Object.keys(mem.quotes).length) load();
    const k = normSym(sym);
    // VIX aliases
    const q = mem.quotes[k] || (k === 'VIX' ? mem.quotes['%5EVIX'] : null) || mem.quotes['^' + k];
    if (!q) return null;
    if (maxAge === false) return q; // ignore age
    return isFresh(q, maxAge === undefined ? DEFAULT_MAX_AGE : maxAge) ? q : null;
  }

  function getAny(sym) {
    return get(sym, false);
  }

  function ageMs(sym) {
    const q = getAny(sym);
    if (!q || !q.ts) return null;
    return Date.now() - q.ts;
  }

  function set(sym, quote, opts) {
    opts = opts || {};
    const k = normSym(sym);
    if (!k || !quote || !Number.isFinite(quote.price)) return false;
    if (!mem.quotes) mem.quotes = {};
    const prev = mem.quotes[k];
    // Nu moșteni chgPct vechi pe un preț nou fără % — dădea Δ zi 0% sau % greșit
    // pe alt tab/device (ex. COKE 0% pe telefon, 0.7% pe desk).
    const next = {
      price: quote.price,
      chgPct: Number.isFinite(quote.chgPct) ? quote.chgPct : undefined,
      ts: Date.now(),
      src: quote.src || opts.src || 'bus'
    };
    if (next.chgPct === undefined && prev && Number.isFinite(prev.chgPct)
        && Number.isFinite(prev.price) && Math.abs(prev.price - quote.price) / quote.price < 0.0003) {
      next.chgPct = prev.chgPct; // același preț ±0.03% → păstrează %
    }
    mem.quotes[k] = next;
    // alias VIX
    if (k === 'VIX' || k === '%5EVIX') {
      mem.quotes.VIX = next;
    }
    if (!opts.skipPersist) persist();
    if (!opts.silent) {
      emit({ type: 'set', sym: k, quote: next });
      try {
        if (bc) bc.postMessage({ type: 'set', sym: k, quote: next, ts: next.ts });
      } catch (e) {}
    }
    return true;
  }

  function setMany(map, opts) {
    opts = opts || {};
    let n = 0;
    Object.keys(map || {}).forEach(k => {
      if (set(k, map[k], { silent: true, skipPersist: true, src: opts.src })) n++;
    });
    if (n) {
      persist();
      emit({ type: 'setMany', n });
      try {
        if (bc) bc.postMessage({ type: 'setMany', quotes: mem.quotes, ts: mem.ts });
      } catch (e) {}
    }
    return n;
  }

  function all(maxAge) {
    if (!mem.quotes || !Object.keys(mem.quotes).length) load();
    if (maxAge === false) return Object.assign({}, mem.quotes);
    const out = {};
    Object.keys(mem.quotes).forEach(k => {
      const q = get(k, maxAge);
      if (q) out[k] = q;
    });
    return out;
  }

  function emit(ev) {
    listeners.forEach(fn => {
      try { fn(ev); } catch (e) {}
    });
    try {
      global.dispatchEvent(new CustomEvent('tt:quotes', { detail: ev }));
    } catch (e) {}
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  // ensure: returnează fresh din bus sau apelează fetcher și scrie
  async function ensure(sym, fetcher, maxAge) {
    const hit = get(sym, maxAge != null ? maxAge : DEFAULT_MAX_AGE);
    if (hit) return hit;
    if (typeof fetcher !== 'function') return getAny(sym);
    const q = await fetcher(sym);
    if (q && Number.isFinite(q.price)) set(sym, q, { src: 'ensure' });
    return q || null;
  }

  // hydrate din vechiul tt_hub_mkt_v1 (o dată) dacă bus-ul e gol
  function seedFromHubMkt() {
    if (mem.quotes && Object.keys(mem.quotes).length) return;
    try {
      const cached = JSON.parse(localStorage.getItem('tt_hub_mkt_v1') || 'null');
      if (!cached || !cached.quotes) return;
      const map = {};
      Object.entries(cached.quotes).forEach(([k, q]) => {
        if (q && Number.isFinite(q.price)) map[k] = q;
      });
      if (Object.keys(map).length) setMany(map, { src: 'hub-mkt-seed' });
    } catch (e) {}
  }

  function init() {
    load();
    seedFromHubMkt();
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(BC_NAME);
        bc.onmessage = function (ev) {
          const d = ev && ev.data;
          if (!d) return;
          if (d.type === 'set' && d.sym && d.quote) {
            if (!mem.quotes) mem.quotes = {};
            // accept only if newer
            const cur = mem.quotes[normSym(d.sym)];
            if (cur && cur.ts && d.quote.ts && d.quote.ts <= cur.ts) return;
            mem.quotes[normSym(d.sym)] = d.quote;
            if (normSym(d.sym) === 'VIX') mem.quotes.VIX = d.quote;
            persist();
            emit({ type: 'remote', sym: d.sym, quote: d.quote });
          } else if (d.type === 'setMany' && d.quotes) {
            mem.quotes = Object.assign({}, mem.quotes, d.quotes);
            mem.ts = d.ts || Date.now();
            persist();
            emit({ type: 'remote-many' });
          }
        };
      }
    } catch (e) { bc = null; }
    // storage event (alt tab fără BC sau Safari edge)
    try {
      global.addEventListener('storage', function (e) {
        if (e.key !== LS_KEY || !e.newValue) return;
        try {
          const raw = JSON.parse(e.newValue);
          if (raw && raw.quotes) {
            mem = { quotes: raw.quotes, ts: raw.ts || 0 };
            emit({ type: 'storage' });
          }
        } catch (err) {}
      });
    } catch (e) {}
  }

  init();

  const QB = {
    get, getAny, set, setMany, all, ageMs, ensure, subscribe, isFresh,
    DEFAULT_MAX_AGE, LS_KEY
  };
  global.QB = QB;
  // alias pe D dacă există deja
  if (global.D) global.D.quotes = QB;
  else {
    try {
      Object.defineProperty(global, '__tt_qb_pending', { value: QB, configurable: true });
    } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : global);
