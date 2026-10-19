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
function json(dataUltimei, peste = true, extra = {}) {
  return {
    versiune: 1, la: '2026-10-14T06:30:00Z', dataUltimei, regim: { inchidere: 650, sma200: 600, peste }, univers: { n: 480, minCap: 2e9, sursa: 'screener' },
    metoda: 'top 20 % după randamentul pe lunile 2–12', eticheta: 'indiciu față de acțiunile din aceeași zi (t ≈ 1,5); neprobat pe listă istorică; în probă',
    clasament: Array.from({ length: 25 }, (_, i) => ({ s: 'T' + i, nume: 'Nume ' + i, sector: i % 2 ? 'Technology' : 'Energy', cap: 1e10 - i, pret: 50 + i, m12: 1.5 - i / 20, m6: 0.4 - i / 50, r60: 0.3 - i / 100, rang: i / 480, dolari20: 5e7 })),
    ...extra,
  };
}
function setup({ trend = json('2026-10-13'), bilant = null, fetchOk = true } = {}) {
  const nodes = {}, store = new Map(), reports = [], calls = [];
  const node = (id) => nodes[id] || (nodes[id] = { value: '', checked: false, innerHTML: '', textContent: '', disabled: false, hidden: false, dataset: {}, style: {}, title: '', className: '', classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {} });
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = {
    Date: Clock, Intl, console, URLSearchParams, location: { search: '', origin: 'https://example.test' },
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    localStorage: { getItem: (k) => store.get(k) || null, setItem(k, v) { store.set(k, v); } }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    fetch: async (url) => { calls.push(String(url)); if (/bilant/.test(String(url))) return bilant ? { ok: true, json: async () => bilant } : { ok: false, status: 404 }; if (!fetchOk) throw Error('offline'); return { ok: true, json: async () => trend }; },
    D: { fetchStock: async (sym) => bars(sym) }, MEB: { computeEarlyBird: () => ({ isConfirmed: false, signals: {} }) }, WL: { get: () => ['TEST'] },
    GV: { status: () => ({ verdict: 'TRADE', reasons: [] }) }, TTDecisionPanel: { set: (r) => reports.push(r) }, EL: { sectorOf: () => 'Technology', loadSectorMap: () => ({}) }, matchMedia: () => ({ matches: false }),
  };
  ctx.window = ctx; ctx.parent = ctx; vm.createContext(ctx);
  for (const f of ['lib/indicators.js', 'lib/daily-series.js', 'lib/decision-verdict.js', 'lib/candidate-plan-handoff.js']) vm.runInContext(readFileSync(f, 'utf8'), ctx);
  const source = readFileSync('candidate-engine/engine.js', 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('  validateDeps(); bind();')) + 'bind();window.hooks={state,render,loadTrend,currentItems,renderDetail,coverage,peadPesteTrend};})();', ctx);
  node('universe').value = 'watchlist';
  return { ctx, node, store, reports, calls, hooks: ctx.hooks };
}

test('modul trend se incarca din generated/trend-12-1.json, cu cache-bust, si arata cel mult 20 de randuri', async () => {
  const f = setup(); await f.hooks.loadTrend();
  assert.equal(f.calls.length, 2); assert.match(f.calls[0], /^generated\/trend-12-1\.json\?x=\d+$/); assert.match(f.calls[1], /^generated\/trend-12-1-bilant\.json\?x=\d+$/);
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
  const ultimul = f.reports[f.reports.length - 1]; assert.equal(ultimul.candidate, null); assert.match(ultimul.empty.title, /Trend 12 luni/); assert.match(ultimul.empty.reason, /indiciu.*neprobat pe listă/); assert.ok(!/probată/.test(ultimul.empty.reason), 'auditul de seară 14.10: nu mai e „probată”');
  assert.match(f.node('dReason').textContent, /indiciu față de acțiunile din aceeași zi/);
});

test('fara regim si date vechi: starile FĂRĂ REGIM si VECHI; cand fisierul nu vine, modul ramane gol si spune de ce', async () => {
  const f1 = setup({ trend: json('2026-10-13', false) }); await f1.hooks.loadTrend(); f1.hooks.state.mode = 'trend'; f1.hooks.render();
  assert.match(f1.node('rows').innerHTML, /FĂRĂ REGIM/); assert.ok(f1.hooks.state.trend.every((x) => x.state === 'FĂRĂ REGIM'));
  const f2 = setup({ trend: json('2026-09-20') }); await f2.hooks.loadTrend(); f2.hooks.state.mode = 'trend'; f2.hooks.render();
  assert.ok(f2.hooks.state.trend.every((x) => x.state === 'VECHI')); assert.match(f2.node('scanDetailsBody').innerHTML, /2026-09-20/);
  const f3 = setup({ fetchOk: false }); await f3.hooks.loadTrend(); f3.hooks.state.mode = 'trend'; f3.hooks.render();
  assert.equal(f3.hooks.state.trend.length, 0); assert.equal(String(f3.node('countTrend').textContent), '0'); assert.match(f3.node('rows').innerHTML, /robot/i);
});

test('earnings peste clasamentul trend: cu cheia, cine raporteaza in 14 zile primeste starea RAPORTEAZĂ si ziua; fara cheie, spune „neverificat”', async () => {
  const ziNY = (plus) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now + plus * 86400000));
  const f = setup(); f.ctx.EARN = { calendar: async (o) => ({ ok: true, items: [{ symbol: 'T3', date: ziNY(3), hour: 'amc', epsEstimate: 1 }, { symbol: 'T0', date: ziNY(0), hour: 'bmo' }], motiv: '' }) };
  await f.hooks.loadTrend(); const s = f.hooks.state;
  const t3 = s.trend.find((x) => x.symbol === 'T3'), t0 = s.trend.find((x) => x.symbol === 'T0'), t5 = s.trend.find((x) => x.symbol === 'T5');
  assert.equal(t3.state, 'RAPORTEAZĂ'); assert.match(t3.reason, /raportează în 3z/); assert.match(t3.earnings, /3z/);
  assert.equal(t0.state, 'RAPORTEAZĂ'); assert.match(t0.reason, /raportează în 0z/);
  assert.equal(t5.state, 'ÎN PROBĂ'); assert.match(t5.earnings, /fără raportare în 14z/);
  s.mode = 'trend'; f.hooks.render(); assert.match(f.node('rows').innerHTML, /RAPORTEAZĂ/);
  const g = setup(); g.ctx.EARN = { calendar: async () => ({ ok: false, items: [], motiv: 'fără cheie' }) };
  await g.hooks.loadTrend(); assert.ok(g.hooks.state.trend.every((x) => x.state === 'ÎN PROBĂ' && /neverificat/.test(x.earnings)));
});

test('I-621: raportarile din JSON-ul robotului dau RAPORTEAZĂ fara cheie in browser; cand robotul a avut calendar, cine n-are raportare spune „fără raportare în 14z”', async () => {
  const t = json('2026-10-13', true, { raportari: { sursa: 'finnhub', la: '2026-10-14T06:30:00Z', fereastraZile: 14, n: 800 } });
  t.clasament[2].raporteaza = { d: '2026-10-18', ora: 'amc', zile: 5 };   // robotul a numărat de la 13.10; azi (14.10 NY) sunt 4
  const f = setup({ trend: t }); await f.hooks.loadTrend(); const s = f.hooks.state;
  const t2 = s.trend.find((x) => x.symbol === 'T2'), t0 = s.trend.find((x) => x.symbol === 'T0');
  assert.equal(t2.state, 'RAPORTEAZĂ'); assert.match(t2.earnings, /raportează în 4z/); assert.match(t2.earnings, /după închidere/);
  assert.equal(t0.state, 'ÎN PROBĂ'); assert.match(t0.earnings, /fără raportare până la \d{4}-\d{2}-\d{2}/);
  assert.ok(t2.fapte.some((p) => p.k === 'raportează' && p.rol === 'block'), 'faptul „raportează” e blocant');
});

test('revizie 14.10: zilele pana la raportare se recalculeaza fata de AZI (nu de la data clasamentului); o raportare trecuta nu mai e RAPORTEAZĂ; doua incarcari in paralel nu dubleaza cipurile', async () => {
  const ziNY = (plus) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now + plus * 86400000));
  const t = json('2026-10-13', true, { raportari: { sursa: 'finnhub', la: '2026-10-14T06:30:00Z', fereastraZile: 14, n: 800 } });
  t.clasament[1].raporteaza = { d: ziNY(1), ora: 'amc', zile: 2 };       // robotul a numărat 2 de la 13.10; azi e 14.10 ⇒ 1
  t.clasament[2].raporteaza = { d: ziNY(-2), ora: 'bmo', zile: 0 };      // a raportat alaltăieri
  const f = setup({ trend: t }); await Promise.all([f.hooks.loadTrend(), f.hooks.loadTrend()]); const s = f.hooks.state;
  const t1 = s.trend.find((x) => x.symbol === 'T1'), t2 = s.trend.find((x) => x.symbol === 'T2');
  assert.equal(t1.state, 'RAPORTEAZĂ'); assert.match(t1.earnings, /raportează în 1z/);
  assert.equal(t2.state, 'ÎN PROBĂ'); assert.match(t2.earnings, /a raportat acum 2z/); assert.ok(t2.fapte.some((p) => p.k === 'a raportat'));
  assert.equal(t1.fapte.filter((p) => p.k === 'raportează').length, 1, 'un singur cip, nu două');
  assert.equal((t1.reason.match(/raportează în/g) || []).length, 1, 'motivul nu se dublează');
});

test('revizie 14.10: cautarea in modul Trend gaseste simbolul chiar daca e si in scanarea Top Long; VECHI de la 5 zile', async () => {
  const f = setup(); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend';
  s.analyses = [{ symbol: 'T1', mode: 'momentum', sector: 'Technology', actionable: false }];
  f.node('search').value = 'T1'; assert.ok(f.hooks.currentItems().some((x) => x.symbol === 'T1' && x.mode === 'trend'));
  const g = setup({ trend: json('2026-10-10') }); await g.hooks.loadTrend(); assert.ok(g.hooks.state.trend.every((x) => x.state === 'ÎN PROBĂ'), '3 zile (weekend) = proaspăt');
  const h = setup({ trend: json('2026-10-08') }); await h.hooks.loadTrend(); assert.ok(h.hooks.state.trend.every((x) => x.state === 'VECHI'), '5 zile = VECHI');
});

test('I-615: iesirile din JSON se arata sub clasament ca IEȘIT, fara buton, fara sa intre in contor', async () => {
  const t = json('2026-10-13', true, { iesiri: [{ s: 'X9', nume: 'Fost favorit', sector: 'Energy', motiv: 'a căzut la top 35,0 %', rangAzi: 0.35, m12: 0.4 }] });
  const f = setup({ trend: t }); await f.hooks.loadTrend(); const s = f.hooks.state;
  assert.equal(s.trendIesiri.length, 1); assert.equal(s.trend.length, 20); assert.equal(String(f.node('countTrend').textContent), '20');
  s.mode = 'trend'; f.hooks.render();
  assert.match(f.node('rows').innerHTML, /X9/); assert.match(f.node('rows').innerHTML, /IEȘIT/); assert.match(f.node('rows').innerHTML, /ce-row-iesit/); assert.match(f.node('rows').innerHTML, /a căzut la top 35,0 %/);
  assert.equal(f.hooks.currentItems().length, 20, 'ieșiții nu sunt candidați');
});

test('I-616 + I-614: nota modului spune concentrarea pe sector si bilantul probei; fara bilant spune ca nu e inca', async () => {
  const t = json('2026-10-13', true, { sectoare: { Technology: 11, Energy: 5, 'Health Care': 4 } });
  const b = { versiune: 1, zile: 37, n20: 17, n60: 0, exces20: 0.8, exces60: null, nulB20: -0.1, diferenta20: { medie: 0.9, interval: [0.2, 1.6] }, verdict: 'în probă' };
  const f = setup({ trend: t, bilant: b }); await f.hooks.loadTrend(); const s = f.hooks.state;
  assert.equal(JSON.stringify(s.trendMeta.concentrare), JSON.stringify({ sector: 'Technology', n: 11, din: 20 }));
  assert.equal(s.trendMeta.bilant.n20, 17);
  s.mode = 'trend'; f.hooks.render();
  const nota = f.node('trendNota').innerHTML;
  assert.match(nota, /11 din 20 Technology/); assert.match(nota, /un singur pariu/); assert.match(nota, /17 zile cu rezultat/); assert.match(nota, /\+0,8 %/); assert.match(nota, /în probă/);
  assert.equal(f.node('trendNota').hidden, false);
  assert.ok(s.trend.find((x) => x.symbol === 'T1').fapte.some((p) => p.k === 'sector' && /11\/20/.test(p.v)), 'cei din sectorul concentrat primesc faptul');
  assert.ok(!s.trend.find((x) => x.symbol === 'T0').fapte.some((p) => p.k === 'sector'));
  const g = setup({ trend: t }); await g.hooks.loadTrend(); g.hooks.state.mode = 'trend'; g.hooks.render();
  assert.match(g.node('trendNota').innerHTML, /fără bilanț încă/);
  g.hooks.state.mode = 'momentum'; g.hooks.render(); assert.equal(g.node('trendNota').hidden, true, 'nota se ascunde in celelalte moduri');
});

test('I-618: randul arata faptele ca cipuri (EOD, 12-1, rang, regim), nu sirul lipit', async () => {
  const f = setup(); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend'; f.hooks.render();
  const t0 = s.trend[0];
  assert.equal(t0.fapte.slice(0, 4).map((p) => p.k).join(','), 'EOD,12-1,6-1,rang');
  assert.match(f.node('rows').innerHTML, /ce-chip/); assert.match(f.node('rows').innerHTML, /12-1/);
  assert.ok(!f.node('rows').innerHTML.includes(t0.reason), 'șirul întreg rămâne în detaliu, nu în rând');
});

test('I-620 (ipoteza): dupa raportare cu reactie pozitiva in ultimele 7 zile, candidatul Trend primeste faptul „după raportare”', async () => {
  const ziNY = (plus) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now + plus * 86400000));
  const f = setup(); const cereri = [];
  f.ctx.EARN = { cheie: () => 'cheie', calendar: async () => ({ ok: true, items: [] }), istoric: async (s) => { cereri.push(s); return s === 'T1' ? { ok: true, items: [{ date: ziNY(-2), hour: 'amc', reactie: 4.2, surpriza: 10.5 }] } : s === 'T2' ? { ok: true, items: [{ date: ziNY(-20), hour: 'bmo', reactie: 6, surpriza: 3 }] } : { ok: true, items: [] }; } };
  await f.hooks.loadTrend(); f.hooks.state.mode = 'trend'; await f.hooks.peadPesteTrend();
  const t1 = f.hooks.state.trend.find((x) => x.symbol === 'T1'), t2 = f.hooks.state.trend.find((x) => x.symbol === 'T2');
  assert.equal(t1.pead.reactie, 4.2); assert.ok(t1.fapte.some((p) => p.k === 'după raportare' && /\+4,2 %/.test(p.v) && /ipotez/.test(p.nota || '')));
  assert.equal(t2.pead, undefined, 'raportarea de acum 20 de zile nu conteaza');
  assert.equal(cereri.length, 20, 'doar primele 20, o cerere pe simbol');
  await f.hooks.peadPesteTrend(); assert.equal(cereri.length, 20, 'nu se repeta pentru aceeasi zi de date');
  await f.hooks.loadTrend(); assert.equal(f.hooks.state.trend.find((x) => x.symbol === 'T1').pead.reactie, 4.2, 'revizie 14.10: reîncărcarea de la 5 minute păstrează faptul „după raportare”');
  const g = setup(); g.ctx.EARN = { cheie: () => '', istoric: async () => { throw Error('nu trebuia chemat'); } }; await g.hooks.loadTrend(); await g.hooks.peadPesteTrend();
  assert.ok(g.hooks.state.trend.every((x) => !x.pead), 'fara cheie nu se cere nimic');
});

test('I-613: la Trend, coloana SCOR devine randamentul pe 60 de zile (antet „60 Z”), in rand si in detaliu', async () => {
  const f = setup(); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend'; f.hooks.render();
  assert.match(f.node('tableHead').innerHTML, /60 Z/); assert.ok(!/SCOR/.test(f.node('tableHead').innerHTML));
  assert.equal(s.trend[0].r60, 0.3); assert.match(f.node('rows').innerHTML, /\+30,0 %/);
  assert.match(f.node('dScore').textContent, /\+30,0 %/);
  const t = json('2026-10-13'); delete t.clasament[0].r60; const g = setup({ trend: t }); await g.hooks.loadTrend(); g.hooks.state.mode = 'trend'; g.hooks.render();
  assert.match(g.node('rows').innerHTML, /ce-score">—</, 'fără r60 în JSON (robot vechi) ⇒ liniuță, nu scor inventat');
});

test('cautarea si filtrele merg pe trend; copia locala a scanarii (ce_results_v2) nu primeste trend', async () => {
  const f = setup(); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend';
  f.node('search').value = 'T1'; const items = f.hooks.currentItems(); assert.ok(items.length >= 1 && items.every((x) => /T1/.test(x.symbol)));
  f.node('search').value = ''; f.node('onlyActionable').checked = true; assert.equal(f.hooks.currentItems().length, 0);
  assert.equal(f.store.get('ce_results_v2'), undefined);
});

test('tt-v882: saltul intr-o zi din JSON-ul robotului e fapt „salt” (atentie) cu o zecimala si ziua; sub 50 % nu apare; fara camp nu crapa', async () => {
  const j = json('2026-10-13'); j.clasament[2].salt = { pct: 1.77, d: '2026-05-12' }; j.clasament[3].salt = { pct: 0.2, d: '2026-03-03' };
  const f = setup({ trend: j }); await f.hooks.loadTrend(); const s = f.hooks.state; s.mode = 'trend'; f.hooks.render();
  const t2 = s.trend[2], t3 = s.trend[3], t0 = s.trend[0];
  const salt = t2.fapte.find((p) => p.k === 'salt'); assert.ok(salt, 'T2 are faptul salt'); assert.equal(salt.rol, 'attention'); assert.equal(salt.v, '+177,0 % într-o zi (2026-05-12) — verifică seria');
  const rows = f.node('rows').innerHTML, i2 = rows.indexOf('<b>T2 <em>'), i3 = rows.indexOf('<b>T3 <em>'); assert.ok(i2 > 0 && i3 > i2, 'randurile T2 si T3 exista');
  const rand2 = rows.slice(i2, i3); assert.ok(rand2.indexOf('verifică seria') > 0 && rand2.indexOf('verifică seria') < rand2.indexOf('12-1'), 'in rand, cipul de atentie vine inaintea suportului (fapteHtml ordoneaza pe prioritate)');
  assert.ok(!t3.fapte.some((p) => p.k === 'salt'), '20 % nu e salt'); assert.ok(!t0.fapte.some((p) => p.k === 'salt')); assert.equal(t0.salt, null);
  assert.match(f.node('rows').innerHTML, /verifică seria/);
});
