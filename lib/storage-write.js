/* Confirmed localStorage writes may reclaim only lib/data.js market caches. */
(function(g){
  'use strict';
  const CACHE_PREFIX = 'ttd:';

  function isQuotaError(error){
    try {
      if (!error || error.name === 'SecurityError') return false;
      return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
    } catch (_) { return false; }
  }

  function cacheTime(raw){
    if (typeof raw !== 'string') return null;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          Object.keys(value).length !== 2 || !Object.hasOwn(value, 't') || !Object.hasOwn(value, 'v') ||
          !Number.isSafeInteger(value.t) || value.t <= 0 || value.t > Date.now()) return null;
      return value.t;
    } catch (_) { return null; }
  }

  function cacheSnapshot(storage, target){
    const names = [], seen = new Set();
    // Collect names before any deletion; Storage.key indices shift on removal.
    const length = storage.length;
    if (!Number.isSafeInteger(length) || length < 0) return [];
    for (let i = 0; i < length; i++) {
      const key = storage.key(i);
      if (typeof key === 'string' && key.startsWith(CACHE_PREFIX) && key !== target && !seen.has(key)) {
        seen.add(key);
        names.push(key);
      }
    }
    const candidates = [];
    for (const key of names) {
      try {
        const raw = storage.getItem(key), at = cacheTime(raw);
        if (at != null) candidates.push({key, raw, at});
      } catch (_) { /* Unreadable entries stay untouched. */ }
    }
    return candidates.sort((a, b) => a.at - b.at);
  }

  function setItem(storage, key, raw){
    let quota;
    try {
      storage.setItem(key, raw);
      return {evicted:0};
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      quota = error;
    }
    let candidates;
    try { candidates = cacheSnapshot(storage, String(key)); }
    catch (_) { throw quota; }
    let evicted = 0;
    for (const candidate of candidates) {
      try {
        // Another tab may have replaced a cache since enumeration. Keep it.
        if (storage.getItem(candidate.key) !== candidate.raw) continue;
        storage.removeItem(candidate.key);
        evicted++;
      } catch (_) { continue; }
      try {
        storage.setItem(key, raw);
        return {evicted};
      } catch (error) {
        if (!isQuotaError(error)) throw error;
      }
    }
    // localStorage quota failures are atomic: the target's prior raw is intact.
    throw quota;
  }

  g.TTStorageWrite = Object.freeze({setItem, isQuotaError});
})(typeof window !== 'undefined' ? window : globalThis);
