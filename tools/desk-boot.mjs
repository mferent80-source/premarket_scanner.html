// 19.10.2026 — pornirea paginii Planuri (desk/index.html) într-un context vm, pentru testele I-700 / I-702 / I-709.
// Aceeași schemă ca tools/desk-interactive.test.mjs, cu ceas mutabil, fișiere în plus și context în plus.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const html = readFileSync('desk/index.html', 'utf8');
export const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find((m) => m[1].includes('var CANDIDATE_FRESH_MS'))[1];
const BAZA = ['lib/daily-series.js', 'lib/candidate-plan-handoff.js', 'lib/trade-plans.js', 'lib/trade-plan-store.js', 'lib/decision-verdict.js', 'lib/decision-insights.js', 'desk/insight.js', 'lib/trading212-snapshot.js', 'lib/trading212-performance.js', 'lib/trading212-capital.js', 'lib/trading212-capital-ui.js', 'desk/performance.js', 'desk/analytics.js', 'lib/holdings-forecast.js', 'lib/holdings-forecast-storage.js', 'lib/holdings-forecast-monitor.js', 'lib/decision-validation.js', 'desk/validation.js', 'lib/trade-review.js', 'desk/review.js', 'lib/desk-alerts.js', 'desk/alerts.js', 'lib/trade-evidence-schema.js', 'lib/trade-evidence.js', 'desk/evidence.js'];

export function boot({ demo = true, seed = {}, now = Date.parse('2026-10-08T04:15:00Z'), files = [], extra = {}, before = null } = {}) {
  const ceas = { now }, nodes = {}, intervals = [], timeouts = [], listeners = {}, appended = [], memory = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [ceas.now])); } static now() { return ceas.now; } }
  function node(id, dataset = {}) { return nodes[id] || (nodes[id] = { id, dataset, style: { setProperty() {} }, classList: { toggle() {}, remove() {}, add() {} }, setAttribute(k, v) { this[k] = v; }, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; }, focus() {}, textContent: '', innerHTML: '', value: '', open: false, hidden: false, showModal() { this.open = true; }, close() { this.open = false; } }); }
  const modes = ['momentum', 'reversal'].map((m) => node('mode-' + m, { signalMode: m }));
  const tabs = ['scenario', 'metrics', 'checks', 'ai'].map((t, i) => node(['focusTabScenario', 'focusTabMetrics', 'focusTabChecks', 'focusTabAI'][i], { focusTab: t }));
  const sources = ['broker', 'shadow'].map((source) => node('source-' + source, { performanceSource: source }));
  const buttons = (markup, type) => [...markup.matchAll(/<button[^>]*data-(?:mini-)?symbol="([^"]+)"([^>]*)>/g)].map((m, i) => node(type + i, { symbol: m[1], miniSymbol: m[1], miniMode: m[2].match(/data-mini-mode="([^"]+)"/)?.[1] }));
  const document = { addEventListener: (n, f) => (listeners['doc:' + n] || (listeners['doc:' + n] = [])).push(f), getElementById: node, activeElement: null, hidden: false,
    querySelectorAll(q) { if (q === '[data-signal-mode]') return modes; if (q === '[data-focus-tab]') return tabs; if (q === '[data-performance-source]') return sources; if (q === '#signalRows .row') return buttons(node('signalRows').innerHTML, 'row'); if (q === '[data-mini-symbol]') return buttons(node('miniLong').innerHTML + node('miniReversal').innerHTML, 'mini'); return []; },
    createElement: (tag) => ({ tag, src: '', async: true, onload: null, onerror: null, setAttribute() {} }), body: { appendChild: (el) => appended.push(el) } };
  const c = { Date: Clock, URLSearchParams, Intl, console, Number, Math, Map, Array, Promise, JSON, location: { origin: 'https://desk.test', search: demo ? '?demo=1' : '', hash: '' }, document,
    localStorage: { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)) }, TTBreadth: { load: async () => null },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {}, setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; }, clearTimeout() {},
    addEventListener: (n, f) => (listeners[n] || (listeners[n] = [])).push(f), GV: { status: () => ({ verdict: 'HALTED' }) }, ...extra };
  c.window = c; c.parent = c; c.globalThis = c; vm.createContext(c);
  for (const f of BAZA.concat(files)) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  if (before) before(c);
  vm.runInContext(script, c, { filename: 'desk-inline.js' });
  return { c, ceas, nodes, node, tabs, modes, intervals, timeouts, listeners, appended, memory, sources, emit: (name, e) => (listeners[name] || []).forEach((f) => f(e)), rows: () => buttons(node('signalRows').innerHTML, 'row') };
}
export const flush = () => new Promise((r) => setImmediate(r));
