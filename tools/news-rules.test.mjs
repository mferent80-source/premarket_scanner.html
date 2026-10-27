// 27.10.2026 (I-756, audit E Y5): regulile News Watch (cuvintele „big”, zgomotul, sursele, pragurile pe mod, severitatea) într-un singur
// modul, lib/news-rules.js, încărcat și de pagina Alerte și de robotul de pe server — înainte, robotul avea 8 cuvinte în plus și aceeași știre
// era „big” pe server și zgomot în pagină.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../lib/news-rules.js';

const NR = globalThis.NewsRules;
test('modulul are lista completă (și cele 8 cuvinte care lipseau din pagină) și pragurile pe mod', () => {
  const kw = new Map(NR.BIG_KW);
  for (const k of ['antitrust', 'sanction', 'cut to sell', 'raised to buy', 'secondary offering', 'all-stock deal', 'listing on', 'approval']) assert.ok(kw.has(k), k);
  assert.deepEqual({ ...NR.MODE_MIN }, { strict: 8, normal: 5, loose: 3 });
  assert.ok(NR.NOISE_RE.length >= 28); assert.ok(NR.STRICT_SOURCES.includes('reuters'));
});
test('scorul: zgomotul și sursa nepermisă în strict dau 0; cuvintele și sursa adună; titlul scurt și lista de tickere scad; severitatea', () => {
  const a = (headline, source = 'Reuters', summary = '') => ({ headline, source, summary });
  assert.deepEqual(NR.scoreArticle(a('5 stocks to watch this week'), { minScore: 5 }).tags, ['noise']);
  assert.equal(NR.scoreArticle(a('ACME raises guidance after strong quarter', 'Blog'), { minScore: 8, strict: true }).score, 0);
  const g = NR.scoreArticle(a('ACME raises guidance after strong quarter'), { minScore: 5 });
  assert.equal(g.score, 9 + 6 + 3); assert.equal(g.big, true); assert.equal(g.sev, 'GUIDANCE'); assert.equal(g.sentiment, 'bull');
  const l = NR.scoreArticle(a('Regulators open antitrust case against ACME Corp'), { minScore: 5 });
  assert.equal(l.sev, 'LEGAL'); assert.ok(l.big);
  assert.equal(NR.scoreArticle(a('ACME up'), { minScore: 5 }).score, 3 - 2, 'titlu scurt: −2');
  assert.equal(NR.resolveNewsSymbol({ symbol: 'nfc.de' }), 'NFLX'); assert.equal(NR.resolveNewsSymbol({ symbol: 'BTC-USD' }), 'BTC'); assert.equal(NR.resolveNewsSymbol({ symbol: 'X', newsSymbol: 'y' }), 'Y');
});
test('pagina Alerte și robotul folosesc modulul, nu copii proprii ale listelor', () => {
  const page = readFileSync('alerts/index.html', 'utf8'), bot = readFileSync('tools/check-news-watch.mjs', 'utf8');
  assert.match(page, /<script src="\.\.\/lib\/news-rules\.js\?v=[^"]+"><\/script>/);
  for (const nume of ['NW_BIG_KW', 'NW_NOISE_RE', 'NW_QUALITY_SRC', 'NW_STRICT_SRC', 'NW_MODE_MIN']) assert.doesNotMatch(page, new RegExp('const ' + nume + '\\s*='), nume);
  assert.match(page, /NewsRules\.scoreArticle\(/);
  assert.match(bot, /import '\.\.\/lib\/news-rules\.js';/);
  for (const nume of ['BIG_KW', 'NOISE_RE', 'QUALITY_SRC', 'STRICT_SOURCES', 'MODE_MIN']) assert.doesNotMatch(bot, new RegExp('^const ' + nume + '\\s*=', 'm'), nume);
});
test('robotul nu mai scrie alerte de gap (kind „day”) în tools/alerts.json: nimeni nu le evalua, iar workflow-ul nici nu le mai comite (Y6)', () => {
  const bot = readFileSync('tools/check-news-watch.mjs', 'utf8');
  assert.doesNotMatch(bot, /ensureGapAlert\s*\(/); assert.doesNotMatch(bot, /writeFileSync\(ALERTS_FILE/); assert.doesNotMatch(bot, /kind: 'day'/);
});
