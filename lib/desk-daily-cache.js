/* 19.10.2026 (I-702): istoricul de 5 ani (SPY pentru randamentul contului, simbolul pentru validarea modelelor și pentru clasificator) se cerea
   cu ttl:0 la fiecare deschidere / verificare. Acum o dată pe sesiune de bursă: o copie e bună cât timp sesiunea EOD așteptată e aceeași cu cea
   de la citire (DailySeries.expected, pe fusul și ora de închidere ale seriei) — bara zilei în curs nu devine „închisă” din copie.
   O citire care n-a avut încă bara așteptată (Yahoo întârzie) se repetă cel mult o dată la 10 minute. Memorie + IndexedDB (cel mult 40 de serii);
   fără IndexedDB merge doar din memorie. TTDeskDailyCache.fetchStock(simbol, {range, interval}) întoarce barele cu `meta`, ca D.fetchStock. */
(function (g) {
  'use strict';
  if (g.TTDeskDailyCache) return;
  var DB = 'tt_desk_daily_cache_v1', STORE = 'serii', MAX = 40, REINCERCARE = 10 * 60000;
  var mem = new Map(), zbor = new Map(), dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        if (!g.indexedDB) return res(null);
        var r = g.indexedDB.open(DB, 1);
        r.onupgradeneeded = function () { try { r.result.createObjectStore(STORE); } catch (_) {} };
        r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; r.onblocked = function () { res(null); };
      } catch (_) { res(null); }
    });
    return dbp;
  }
  function cerere(db, mod, fn) { return new Promise(function (res) { try { var q = fn(db.transaction(STORE, mod).objectStore(STORE)); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; } catch (_) { res(null); } }); }
  function citesteDisc(k) { return idb().then(function (db) { return db ? cerere(db, 'readonly', function (s) { return s.get(k); }) : null; }); }
  function scrieDisc(k, v) {
    return idb().then(function (db) {
      if (!db) return;
      return cerere(db, 'readwrite', function (s) { return s.put(v, k); }).then(function () {
        return cerere(db, 'readonly', function (s) { return s.getAll(); }).then(function (toate) {
          if (!Array.isArray(toate) || toate.length <= MAX) return;
          var vechi = toate.slice().sort(function (a, b) { return (a.fetchedAt || 0) - (b.fetchedAt || 0); }).slice(0, toate.length - MAX);
          return Promise.all(vechi.map(function (x) { return cerere(db, 'readwrite', function (s) { return s.delete(x.key); }); }));
        });
      });
    }).catch(function () {});
  }
  function sesiune(bars, simbol, now) {
    try { var src = g.DailySeries.read(bars, simbol, now); return { sesiune: src.expected, tz: src.timezone, close: src.closeMinutes }; } catch (_) { return null; }
  }
  function buna(v, now) {
    if (!v || !Array.isArray(v.bars)) return false;
    if (v.sesiune) { try { return g.DailySeries.expected(now, v.tz, v.close) === v.sesiune; } catch (_) { return false; } }
    return now - v.fetchedAt < REINCERCARE;   // citirea n-a avut bara așteptată: aceeași eroare cel mult 10 minute, fără să bată sursa
  }
  function bare(v) { var a = v.bars.slice(); Object.defineProperty(a, 'meta', { value: Object.freeze(Object.assign({}, v.meta || {})), enumerable: false }); return a; }
  async function adu(simbol, o, k, now) {
    var raw = await g.D.fetchStock(simbol, { range: o.range, interval: o.interval, ttl: 0 });
    var s = sesiune(raw, simbol, now), v = { key: k, bars: Array.from(raw), meta: raw && raw.meta ? Object.assign({}, raw.meta) : null, fetchedAt: now, sesiune: s && s.sesiune, tz: s && s.tz, close: s && s.close };
    mem.set(k, v); scrieDisc(k, v);
    return raw;
  }
  async function fetchStock(simbol, opts) {
    var o = { range: (opts && opts.range) || '5y', interval: (opts && opts.interval) || '1d' }, k = String(simbol).toUpperCase() + '|' + o.range + '|' + o.interval, now = Date.now();
    if (!g.DailySeries || !g.D || typeof g.D.fetchStock !== 'function') return g.D.fetchStock(simbol, { range: o.range, interval: o.interval, ttl: 0 });
    var v = mem.get(k);
    if (buna(v, now)) return bare(v);
    if (zbor.has(k)) return zbor.get(k);
    var p = (async function () {
      if (!v) { var d = await citesteDisc(k); if (d && Array.isArray(d.bars)) { mem.set(k, d); if (buna(d, now)) return bare(d); } }
      return adu(simbol, o, k, now);
    })();
    zbor.set(k, p);
    try { return await p; } finally { zbor.delete(k); }
  }
  g.TTDeskDailyCache = { fetchStock: fetchStock, _mem: mem };
})(typeof window !== 'undefined' ? window : globalThis);
