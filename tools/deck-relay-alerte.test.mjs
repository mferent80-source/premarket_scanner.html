// 27.10.2026 (I-756, audit E Y3 + B4): pagina Alerte nu mai ține în browser un token GitHub cu scriere pe tot depozitul. Releul deck-relay
// scrie DOAR tools/alerts.json și tools/news-watch.json, cu tokenul lui (GH_ALERTE_TOKEN), după poarta Origin + X-Alerte-Cheie;
// unirea (istoricul `triggered`, `seen`/`eventSeen` ai robotului) se face pe server. Plus: tokenele webhook-ului comparate în timp constant,
// CORS fără localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { alerteStare } from './cf-worker-deck-relay.js';

const ORIGIN = 'https://mferent80-source.github.io', CHEIE = 'k'.repeat(40), GH = 'github_pat_SECRET_TOKEN_123';
const env = { GH_ALERTE_TOKEN: GH, ALERTE_CHEIE: CHEIE };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64'), deb64 = (s) => Buffer.from(s, 'base64').toString('utf8');
const req = (method, { fisier, continut, body, origin = ORIGIN, cheie = CHEIE, query = '' } = {}) => new Request('https://deck-relay.test/alerte/stare' + query, {
  method, headers: { ...(origin ? { Origin: origin } : {}), ...(cheie ? { 'X-Alerte-Cheie': cheie } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
  ...(method === 'POST' ? { body: body !== undefined ? body : JSON.stringify({ fisier, continut }) } : {})
});
function github(files, { conflicte = 0 } = {}) {
  const calls = [], state = { ...files }, sha = {};
  for (const k of Object.keys(state)) sha[k] = 'sha-' + k;
  const upstream = async (url, o = {}) => {
    calls.push({ url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body ? JSON.parse(o.body) : null });
    const path = new URL(url).pathname.replace(/^\/repos\/mferent80-source\/premarket_scanner\.html\/contents\//, '');
    if ((o.method || 'GET') === 'GET') return state[path] === undefined ? new Response('{}', { status: 404 }) : Response.json({ sha: sha[path], content: b64(JSON.stringify(state[path])) });
    if (conflicte > 0) { conflicte--; return new Response('{}', { status: 409 }); }
    const b = JSON.parse(o.body); state[path] = JSON.parse(deb64(b.content)); sha[path] = 'sha2';
    return Response.json({ commit: { sha: 'abcdef1234567' } });
  };
  return { calls, upstream, state };
}

test('alerts: urcă lista prin releu, păstrează istoricul `triggered` de pe GitHub, cu tokenul releului; tokenul nu iese în răspuns', async () => {
  const g = github({ 'tools/alerts.json': { _doc: 'doc', alerts: [{ symbol: 'OLD', kind: 'watch' }], triggered: [{ symbol: 'X' }] } });
  const r = await alerteStare(req('POST', { fisier: 'alerts', continut: { alerts: [{ symbol: 'NVDA', kind: 'watch', note: 'țintă după raport' }] } }), env, g.upstream);
  assert.equal(r.status, 200); const out = await r.json();
  assert.equal(out.ok, true); assert.equal(out.commit, 'abcdef1'); assert.equal(JSON.stringify(out).includes(GH), false);
  const put = g.calls.find((c) => c.method === 'PUT'); assert.equal(put.headers.Authorization, 'Bearer ' + GH); assert.ok(put.headers['User-Agent']); assert.equal(put.body.sha, 'sha-tools/alerts.json'); assert.equal(put.body.branch, 'main');
  assert.deepEqual(g.state['tools/alerts.json'], { _doc: 'doc', alerts: [{ symbol: 'NVDA', kind: 'watch', note: 'țintă după raport' }], triggered: [{ symbol: 'X' }] });
  assert.ok(g.calls.every((c) => c.url.startsWith('https://api.github.com/repos/mferent80-source/premarket_scanner.html/contents/tools/')));
});
test('poarta: altă origine, fără cheie, cheie greșită ⇒ 403 fără niciun apel la GitHub; releu neconfigurat ⇒ 503', async () => {
  for (const o of [{ origin: 'https://evil.example' }, { origin: null }, { cheie: null }, { cheie: 'x'.repeat(40) }]) {
    const g = github({}); const r = await alerteStare(req('POST', { fisier: 'alerts', continut: { alerts: [] }, ...o }), env, g.upstream);
    assert.equal(r.status, 403, JSON.stringify(o)); assert.equal(g.calls.length, 0);
  }
  for (const e of [{}, { GH_ALERTE_TOKEN: GH }, { GH_ALERTE_TOKEN: GH, ALERTE_CHEIE: 'scurta' }]) {
    const g = github({}); const r = await alerteStare(req('POST', { fisier: 'alerts', continut: { alerts: [] } }), e, g.upstream);
    assert.equal(r.status, 503); assert.equal(g.calls.length, 0);
  }
});
test('schema: alt fișier, listă greșită, simbol cu caractere străine, obiecte în alertă sau corp prea mare ⇒ 400, fără scriere', async () => {
  for (const [fisier, continut] of [['../.github/workflows/x.yml', { alerts: [] }], ['alerts', { alerts: 'nu' }], ['alerts', { alerts: [{ symbol: 'A/B' }] }], ['alerts', { alerts: [{ symbol: 'A', x: { y: 1 } }] }], ['news-watch', { watches: [{ id: 1 }] }], ['news-watch', { watches: [{ id: 'a', symbol: 'A', seen: [1] }] }]]) {
    const g = github({}); const r = await alerteStare(req('POST', { fisier, continut }), env, g.upstream);
    assert.equal(r.status, 400, fisier + JSON.stringify(continut)); assert.equal(g.calls.filter((c) => c.method === 'PUT').length, 0);
  }
  const g = github({}); const r = await alerteStare(req('POST', { body: JSON.stringify({ fisier: 'alerts', continut: { alerts: [{ symbol: 'A', note: 'x'.repeat(300000) }] } }) }), env, g.upstream);
  assert.equal(r.status, 413); assert.equal(g.calls.length, 0);
});
test('news-watch: seen / eventSeen uniți cu ce a acumulat robotul, _meta al robotului păstrat, lastCheck completat; o reîncercare la 409', async () => {
  const remote = { version: 2, settings: { mode: 'normal' }, _meta: { lastRun: '2026-10-27T10:00:00Z' }, watches: [{ id: 'w1', symbol: 'MU', seen: ['a', 'b'], eventSeen: ['earn:MU:2026-12-17:disc'], lastCheck: '2026-10-27T10:00:00Z', nextEarnings: { date: '2026-12-17', hour: 'amc', dLeft: 51 } }] };
  const g = github({ 'tools/news-watch.json': remote }, { conflicte: 1 });
  const local = { version: 2, settings: { mode: 'strict' }, _meta: { lastRun: 'falsificat' }, watches: [{ id: 'w1', symbol: 'MU', kind: 'stock', keywords: [], intervalMin: 15, sources: ['finnhub'], seen: ['b', 'c'], eventSeen: [], nextEarnings: null, lastCheck: null, armed: true }] };
  const r = await alerteStare(req('POST', { fisier: 'news-watch', continut: local }), env, g.upstream); const out = await r.json();
  assert.equal(r.status, 200); assert.equal(g.calls.filter((c) => c.method === 'PUT').length, 2, 'o reîncercare după 409');
  const w = g.state['tools/news-watch.json'].watches[0];
  assert.deepEqual(w.seen.sort(), ['a', 'b', 'c']); assert.deepEqual(w.eventSeen, ['earn:MU:2026-12-17:disc']); assert.equal(w.lastCheck, '2026-10-27T10:00:00Z'); assert.equal(w.nextEarnings.date, '2026-12-17');
  assert.equal(g.state['tools/news-watch.json']._meta.lastRun, '2026-10-27T10:00:00Z', 'meta-ul robotului nu se rescrie din pagină'); assert.equal(g.state['tools/news-watch.json'].settings.mode, 'strict');
  assert.deepEqual(out.continut.watches[0].seen.sort(), ['a', 'b', 'c'], 'pagina primește înapoi starea unită');
  const g2 = github({ 'tools/news-watch.json': remote }, { conflicte: 5 });
  assert.equal((await alerteStare(req('POST', { fisier: 'news-watch', continut: local }), env, g2.upstream)).status, 409);
});
test('GET: citește proaspăt (fără lagul Pages), cu diacriticele întregi; fișier lipsă ⇒ 404; preflight-ul cere antetul cheii', async () => {
  const g = github({ 'tools/news-watch.json': { watches: [], _doc: 'știri — „big”' } });
  const r = await alerteStare(req('GET', { query: '?fisier=news-watch' }), env, g.upstream); assert.equal(r.status, 200); assert.equal((await r.json()).continut._doc, 'știri — „big”');
  assert.equal((await alerteStare(req('GET', { query: '?fisier=alerts' }), env, github({}).upstream)).status, 404);
  const pre = await worker.fetch(new Request('https://deck-relay.test/alerte/stare', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(pre.status, 204); assert.match(pre.headers.get('Access-Control-Allow-Headers'), /X-Alerte-Cheie/); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});
test('B4: webhook-ul TradingView cu token greșit ⇒ 403; CORS nu mai deschide localhost', async () => {
  const r = await worker.fetch(new Request('https://deck-relay.test/?t=gresit', { method: 'POST', body: '{}' }), { WRITE_TOKEN: 'corect-token' });
  assert.equal(r.status, 403);
  const ok = await worker.fetch(new Request('https://deck-relay.test/?t=corect-token', { method: 'POST', body: JSON.stringify({ deck: 'JMA', ticker: 'X', tf: '1D', event: 'PING' }) }), { WRITE_TOKEN: 'corect-token' });
  assert.equal(ok.status, 200);
  const loc = await worker.fetch(new Request('https://deck-relay.test/latest', { headers: { Origin: 'http://localhost:8080' } }), {});
  assert.notEqual(loc.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8080');
});
test('docs/automation.md descrie releul așa cum e în cod (ruta, secretele, pragul de 6 h al robotului), nu numele vechi', async () => {
  const { readFileSync } = await import('node:fs');
  const doc = readFileSync('docs/automation.md', 'utf8');
  for (const s of ['/alerte/stare', 'GH_ALERTE_TOKEN', 'ALERTE_CHEIE', 'nwBotActiv', '6 ore', 'generat automat · neverificat de om']) assert.ok(doc.includes(s), s);
  for (const s of ['/github/save', '/github/file', 'GH_CONTENTS_TOKEN', 'NewsRules.botActiv', 'Node 20']) assert.ok(!doc.includes(s), s);
});
