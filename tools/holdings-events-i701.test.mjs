// 19.10.2026 (I-701) — HoldingsEvents: răspunsul GOL al proxy-ului Yahoo ({"news":[],…}) nu mai înseamnă „fără titluri”:
// se încearcă sursa următoare (Finnhub, cu cheia existentă), altfel „sursă indisponibilă”. Data rezultatelor lipsă vine cu motivul ei.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const NOW = Date.now();
function events({ yahoo = async () => ({ quotes: [{ symbol: 'NVDA' }], news: [] }), finnhub = async () => ({ ok: true, json: async () => [] }) } = {}) {
  const calls = [], c = { Date, URL, setTimeout, clearTimeout, AbortController, D: { fetchJSON: async (u) => { calls.push(u); return yahoo(u); } }, fetch: async (u, o) => { calls.push(u); return finnhub(u, o); } };
  vm.createContext(c); vm.runInContext(readFileSync('lib/daily-series.js', 'utf8'), c); vm.runInContext(readFileSync('lib/holdings-events.js', 'utf8'), c);
  return { E: c.HoldingsEvents, calls, c };
}
const stire = { headline: 'NVDA results', url: 'https://example.com/n', source: 'Company', datetime: Math.floor(NOW / 1000) - 60, related: 'NVDA' };

test('Yahoo gol (proxy) + cheie Finnhub ⇒ se încearcă Finnhub; titlurile vin de acolo', async () => {
  const { E, calls } = events({ finnhub: async (u) => ({ ok: true, json: async () => (u.includes('company-news') ? [stire] : []) }) });
  const r = await E.fetchNews('NVDA', 'cheie', NOW);
  assert.equal(r.source, 'Finnhub'); assert.equal(r.news.length, 1); assert.equal(r.available, true);
  assert.ok(calls.some((u) => u.includes('company-news')));
});

test('Yahoo gol și fără cheie ⇒ „sursă indisponibilă”, nu „fără titluri”', async () => {
  const { E } = events();
  const r = await E.fetchNews('NVDA', '', NOW);
  assert.equal(r.available, false); assert.equal(r.news.length, 0);
});

test('Yahoo cu titluri rămâne prima sursă (Finnhub nu e întrebat)', async () => {
  const { E, calls } = events({ yahoo: async () => ({ quotes: [{ symbol: 'NVDA' }], news: [{ title: 'NVDA earnings', link: 'https://example.com/y', publisher: 'P', relatedTickers: ['NVDA'], providerPublishTime: Math.floor(NOW / 1000) - 60 }] }) });
  const r = await E.fetchNews('NVDA', 'cheie', NOW);
  assert.equal(r.source, 'Yahoo Finance'); assert.equal(r.news.length, 1); assert.ok(!calls.some((u) => u.includes('finnhub')));
});

test('data rezultatelor lipsă vine cu motivul ei: fără cheie / calendar fără dată / calendar indisponibil', async () => {
  const fara = events(); assert.equal((await fara.E.fetchEvents('NVDA')).earningsMotiv, 'fără cheie Finnhub');
  const gol = events(); gol.c.FH_KEY = { get: () => 'cheie' }; assert.match((await gol.E.fetchEvents('NVDA')).earningsMotiv, /calendarul Finnhub nu dă o dată/);
  const cazut = events({ finnhub: async (u) => (u.includes('calendar') ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, json: async () => [] }) }); cazut.c.FH_KEY = { get: () => 'cheie' };
  assert.match((await cazut.E.fetchEvents('NVDA')).earningsMotiv, /indisponibil/);
});
