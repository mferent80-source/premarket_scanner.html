// I-704 (19.10.2026): fixturile comune pentru testele cache-ului de serii zilnice (lib/data.js) — un răspuns Yahoo `chart`
// sintetic și încărcarea lui data.js într-un context vm, cu IndexedDB fals opțional (vezi idb-fals.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'lib/data.js'), 'utf8');

/** Răspuns Yahoo `chart` cu bare zilnice (zile lucrătoare, 13:30 UTC) pe `luni` luni, închis acum 2 ore. */
export function yahoo(sym, luni, { now = Date.now(), end = now - 7200000 } = {}) {
  const start = new Date(now); start.setUTCMonth(start.getUTCMonth() - luni);
  const ts = [];
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 13, 30)); d.getTime() <= now - 86400000; d = new Date(d.getTime() + 86400000)) {
    if (d.getTime() < start.getTime()) continue;
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    ts.push(d.getTime() / 1000);
  }
  const close = ts.map((_, i) => 100 + i * 0.1);
  return { chart: { result: [{
    meta: { symbol: sym, currency: 'USD', exchangeName: 'NMS', exchangeTimezoneName: 'America/New_York', range: luni >= 24 ? '2y' : '1y', regularMarketTime: Math.floor(end / 1000), currentTradingPeriod: { regular: { start: Math.floor((end - 23400000) / 1000), end: Math.floor(end / 1000) } } },
    timestamp: ts,
    events: { dividends: { [ts[2]]: { amount: 0.25, date: ts[2] }, [ts[ts.length - 3]]: { amount: 0.26, date: ts[ts.length - 3] } } },
    indicators: { quote: [{ open: close.slice(), high: close.map((c) => c + 1), low: close.map((c) => c - 1), close, volume: ts.map(() => 1e6) }], adjclose: [{ adjclose: close.map((c) => c * 0.99) }] },
  }] } };
}

export function loadData({ idb = null, store = new Map(), responder, Date: DateCtx = Date } = {}) {
  const cerute = [];
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise, JSON, Date: DateCtx, Math, isFinite, parseInt, Map, Object, Array, Number, structuredClone,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } },
    fetch: async (url) => {
      cerute.push(String(url));
      const u = decodeURIComponent(String(url)), m = /chart\/([^?]+)\?range=([a-z0-9]+)/.exec(u);
      const body = responder ? responder(u) : m ? yahoo(m[1], { '5d': 1, '1mo': 1, '3mo': 3, '6mo': 6, '1y': 12, '2y': 24, '5y': 60, max: 120 }[m[2]] || 12) : null;
      return { ok: !!body, status: body ? 200 : 500, headers: { get: () => null }, json: async () => body };
    },
  };
  if (idb) { ctx.indexedDB = idb.indexedDB; ctx.IDBKeyRange = idb.IDBKeyRange; }
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'data.js' });
  return { D: ctx.D, cerute, store };
}
