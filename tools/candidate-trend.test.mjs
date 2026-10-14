// Candidate Engine, modul „Trend 12 luni” (14.10.2026): pagina citeste clasamentul robotului din generated/trend-12-1.json,
// il arata ca al treilea mod, fara plan (actionable = false), cu starea „ÎN PROBĂ” / „FĂRĂ REGIM” / „VECHI”.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const now = Date.parse('2026-10-14T09:00:00Z');
function bars(symbol) {
  const stamps = []; for (let t = Date.parse('2026-10-13T14:00:00Z'); stamps.length < 240; t -= 86400000) if (![0, 6].includes(new Date(t).getUTCDay())) stamps.unshift(t);
  const out = stamps.map((t, i) => { const c = 100 + i * .1; return { t, o: c - .1, h: c + .8, l: c - .8, c, v: 1000000 }; });
  out.meta = { symbol, currency: 'USD', timezone: 'America/New_York', regularEnd: Date.parse('2026-10-14T20:00:00Z') }; return out;
}
function json(dataUltimei, peste = true) {
  return {
    versiune: 1, la: '2026-10-14T06:30:00Z', dataUltimei, regim: { inchidere: 650, sma200: 600, peste }, univers: { n: 480, minCap: 2e9, sursa: 'screener' },
    metoda: 'top 20 % după randamentul pe lunile 2–12', eticheta: 'selecție probată față de acțiunile din aceeași zi; neprobată pe listă istorică; în probă',
    clasament: Array.from({ length: 25 }, (_, i) => ({ s: 'T' + i, nume: 'Nume ' + i, sector: i % 2 ? 'Technology' : 'Energy', cap: 1e10 - i, pret: 50 + i, m12: 1.5 - i / 20, m6: 0.4 - i / 50, rang: i / 480, dolari20: 5e7 })),
  };
}
function setup({ trend = json('2026-10-13'), fetchOk = true } = {}) {
  const nodes = {}, store = new Map(), reports = [], calls = [];
  const node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, title: '', className: '', classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = {
    Date: Clock, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' },
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) || null, setItem(k, v) { store.set(k, v); } }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    fetch: async (url) => { calls.push(String(url)); if (!fetchOk) throw Error('offline'); return { ok: true, json: async () => trend }; },
    D: { fetchStock: async (sym) => bars(sym) }, MEB: { computeEarlyBird: () => ({ isConfirmed: false, signals: {} }) }, WL: { get: () => ['TEST'] },
    GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set: (r) => reports.push(r) }, EL: { sectorOf: () => 'Technology', loadSectorMap: () => ({}) }, matchMedia: () => ({ matches: false }),
  };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const source = readFileSync('candidate-engine/engine.js', 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,render,loadTrend,currentItems,renderDetail,coverage};})();', ctx);
  node('universe').value = 'watchlist';
  return { ctx, node, store, reports, calls, hooks: ctx.hooks };
}

test('modul trend se incarca din generated/trend-12-1.json, cu cache-bust, si arata cel mult 20 de randuri', async () => {
  const f = setup(); await f.hooks.loadTrend();
  assert.equal(f.calls.length, 1); assert.match(f.calls[0], /^generated\/trend-12-1\.json\?x=\d+$/);
  const s = f.hooks.state; assert.equal(s.trend.length, 20); assert.equal(String(f.node('countTrend').textContent), '20');
  assert.equal(s.trendMeta.dataUltimei, '2026-10-13'); assert.equal(s.trendMeta.regim.peste, true);
  s.mode = 'trend'; f.hooks.render();
  assert.match(f.node('tableHead').innerHTML, /MOM 12-1/); assert.match(f.node('rows').innerHTML, /T0/); assert.match(f.node('rows').innerHTML, /ÎN PROBĂ/);
  assert.ok(!/T20/.test(f.node('rows').innerHTML), 'al 21-lea nu apare');
});

test('candidatii trend nu primesc plan: actionable false, butonul de plan oprit, panoul explica proba', async () => {
  const f = setup(); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend'; f.hooks.render();
  assert.ok(s.trend.every((x) => x.actionable === false && x.mode === 'trend' && x.eligible === true));
  assert.equal(f.node('setupBtn').disabled, true); assert.match(f.node('setupBtn').title, /Trend/);
  assert.equal(f.node('dStop').textContent, '—'); assert.equal(f.node('dTarget').textContent, '—');
  const ultimul = f.reports[f.reports.length - 1]; assert.equal(ultimul.candidate, null); assert.match(ultimul.empty.title, /Trend 12 luni/); assert.match(ultimul.empty.reason, /neprobată/);
  assert.match(f.node('dReason').textContent, /probată față de acțiunile din aceeași zi/);
});

test('fara regim si date vechi: starile FĂRĂ REGIM si VECHI; cand fisierul nu vine, modul ramane gol si spune de ce', async () => {
  const f1 = setup({ trend: json('2026-10-13', false) }); await f1.hooks.loadTrend(); f1.hooks.state.mode = 'trend'; f1.hooks.render();
  assert.match(f1.node('rows').innerHTML, /FĂRĂ REGIM/); assert.ok(f1.hooks.state.trend.every((x) => x.state === 'FĂRĂ REGIM'));
  const f2 = setup({ trend: json('2026-09-20') }); await f2.hooks.loadTrend(); f2.hooks.state.mode = 'trend'; f2.hooks.render();
  assert.ok(f2.hooks.state.trend.every((x) => x.state === 'VECHI')); assert.match(f2.node('scanDetailsBody').innerHTML, /2026-09-20/);
  const f3 = setup({ fetchOk: false }); await f3.hooks.loadTrend(); f3.hooks.state.mode = 'trend'; f3.hooks.render();
  assert.equal(f3.hooks.state.trend.length, 0); assert.equal(String(f3.node('countTrend').textContent), '0'); assert.match(f3.node('rows').innerHTML, /robot/i);
});

test('cautarea si filtrele merg pe trend; copia locala a scanarii (ce_results_v2) nu primeste trend', async () => {
  const f = setup(); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend';
  f.node('search').value = 'T1'; const items = f.hooks.currentItems(); assert.ok(items.length >= 1 && items.every((x) => /T1/.test(x.symbol)));
  f.node('search').value = ''; f.node('onlyActionable').checked = true; assert.equal(f.hooks.currentItems().length, 0);
  assert.equal(f.store.get('ce_results_v2'), undefined);
});
