// 13.11.2026 (auditul Discordului): Finnhub company-news dă 403 pe acțiunile listate în afara SUA (planul gratuit) - de la ~07.10, la
// FIECARE rulare, ASM.AS / ABB.ST / DSY.PA / STMPA.PA … n-au mai adus nicio știre. Acum: în afara SUA ⇒ Yahoo RSS (sursa știrilor din
// Crypto Radar); în SUA Finnhub, iar refuzul lui ⇒ tot Yahoo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inAfaraSUA, articoleDinRss, urlYahoo } from './stiri-yahoo.mjs';

test('simbolurile din afara SUA: sufixul bursei (.AS .ST .PA .DE .L .BR .MI .SW); cele americane nu', () => {
  for (const s of ['ASM.AS', 'ABB.ST', 'DSY.PA', 'STMPA.PA', 'ARGX.BR', 'RHM.DE', 'BARC.L']) assert.equal(inAfaraSUA(s), true, s);
  for (const s of ['AAPL', 'NVDA', 'BRK.B', 'BF.B', 'MU', '']) assert.equal(inAfaraSUA(s), false, s);
  assert.equal(urlYahoo('ASM.AS'), 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=ASM.AS&region=US&lang=en-US');
});

test('RSS ⇒ articolele în forma Finnhub (headline, summary, url, datetime în secunde, source, id); entități și CDATA', () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Yahoo! Finance: ASM.AS News</title>
<item><title><![CDATA[ASM &amp; peers rally]]></title><link>https://finance.yahoo.com/a1</link><description>Chip &lt;b&gt;stocks&lt;/b&gt; up</description><guid>g1</guid><pubDate>Thu, 13 Nov 2026 10:00:00 +0000</pubDate></item>
<item><title>Second &#8217;story&#8217;</title><link>https://finance.yahoo.com/a2</link><pubDate>Wed, 12 Nov 2026 08:30:00 GMT</pubDate></item>
<item><title></title><link>https://x</link></item>
</channel></rss>`;
  const l = articoleDinRss(xml);
  assert.equal(l.length, 2, 'fără titlu ⇒ sărit');
  assert.deepEqual(l[0], { headline: 'ASM & peers rally', summary: 'Chip stocks up', url: 'https://finance.yahoo.com/a1', datetime: Date.UTC(2026, 10, 13, 10) / 1000, source: 'Yahoo Finance', id: 'g1' });
  assert.equal(l[1].headline, 'Second ’story’'); assert.equal(l[1].id, 'https://finance.yahoo.com/a2', 'fără guid ⇒ linkul');
  assert.equal(l[1].datetime, Date.UTC(2026, 10, 12, 8, 30) / 1000);
  assert.deepEqual(articoleDinRss(''), []); assert.deepEqual(articoleDinRss(null), []);
});

test('robotul: în afara SUA cere Yahoo (nu Finnhub); refuzul Finnhub cade pe Yahoo', () => {
  const s = readFileSync(new URL('./check-news-watch.mjs', import.meta.url), 'utf8');
  assert.match(s, /import \{ inAfaraSUA, articoleDinRss, urlYahoo \} from '\.\/stiri-yahoo\.mjs'/);
  assert.match(s, /if \(inAfaraSUA\(fetchSym\)\) \{\s*list = await stiriYahoo\(fetchSym\);/);
  assert.match(s, /if \(r\.status === 403 \|\| r\.status === 401\) \{ list = await stiriYahoo\(fetchSym\); \}/);
});
