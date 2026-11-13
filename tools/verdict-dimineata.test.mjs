// 17.10.2026 — I-684: rezumatul de dimineață pe Discord.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mesaj, trimite } from './verdict-dimineata.mjs';

test('rezumatul: verdictul și schimbarea de ieri, futures, evenimentele zilei, marile companii de azi și mâine', () => {
  const j = { label: 'defensiv', score: -3, asOf: '2026-10-19', fraza: 'VIX a sărit și creditul slăbește.', istoric: [{ asOf: '2026-10-16', label: 'prudent' }, { asOf: '2026-10-19', label: 'defensiv' }], rezultateMari: [{ symbol: 'NFLX', date: '2026-10-20', cand: 'după închidere' }, { symbol: 'META', date: '2026-10-21' }, { symbol: 'PG', date: '2026-10-23' }] };
  const m = mesaj(j, { zi: '2026-10-20', ev: [{ d: new Date('2026-10-20T12:30:00Z'), event: 'Retail Sales MoM', impact: 'med' }], fut: { es: -0.4, nq: 0.62 }, oraRO: () => '15:30' });
  assert.match(m, /Prudent → \*\*Defensiv\*\* · scor −3/); assert.match(m, /Futures acum: S&P −0,4% · Nasdaq \+0,6%/); assert.match(m, /Azi: Vânzările cu amănuntul la 15:30/);
  assert.match(m, /Rezultate mari: NFLX \(după închidere\), META \(mâine\)/); assert.doesNotMatch(m, /PG/); assert.ok(m.length <= 1900);
  assert.equal(mesaj(null, { zi: '2026-10-20' }), null);
});

// 13.11.2026 (auditul Discordului): Discord refuză ⇒ robotul PICĂ (înainte scria doar „Discord: 404” și ieșea „success”)
test('trimite: 2xx ⇒ true; refuz (4xx / 5xx) sau rețea căzută ⇒ false, cu motivul în jurnal', async () => {
  const jurnal = [], j = (x) => jurnal.push(x);
  assert.equal(await trimite('m', 'https://discord.com/api/webhooks/1/a', { fetch: async () => ({ ok: true, status: 204 }), jurnal: j }), true);
  assert.equal(await trimite('m', 'https://discord.com/api/webhooks/1/a', { fetch: async () => ({ ok: false, status: 404 }), jurnal: j }), false);
  assert.equal(await trimite('m', 'https://discord.com/api/webhooks/1/a', { fetch: async () => { throw new Error('fetch failed'); }, jurnal: j }), false);
  assert.match(jurnal.join(' | '), /Discord: 204 \| Discord: 404 \| Discord: fetch failed/);
});

// 13.11.2026 (auditul Discordului): cronul de 12:00 UTC pornea la 16:13 → 19:26 UTC (întârzierea GitHub creștea, 20.10 → 12.11) ⇒ rezumatul
// „de dimineață” venea seara. Acum pornește după robotul verdictului (verdictul proaspăt), o singură dată pe zi; cronul rămâne rezervă.
test('fluxul: pornește după „Verdictul pieței”, doar la succes, o dată pe zi; cronul e rezervă; picarea Discord nu mai trece tăcut', () => {
  const y = readFileSync(new URL('../.github/workflows/verdict-dimineata.yml', import.meta.url), 'utf8');
  assert.match(y, /workflow_run:\s*\n\s*workflows: \["Verdictul pieței \(noaptea, pentru Astăzi\)"\]\s*\n\s*types: \[completed\]/);
  assert.match(y, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(y, /cron: '0 12 \* \* 1-5'/, 'cronul rămâne rezervă');
  assert.match(y, /actions: read/, 'citește rulările de azi');
  assert.match(y, /actions\/workflows\/verdict-dimineata\.yml\/runs\?created=>=/, 'o singură trimitere pe zi');
  assert.match(y, /if: steps\.azi\.outputs\.deja != '1'/);
  const v = readFileSync(new URL('./verdict-piata-robot.mjs', import.meta.url), 'utf8') && readFileSync(new URL('../.github/workflows/verdict-piata.yml', import.meta.url), 'utf8');
  assert.match(v, /^name: Verdictul pieței \(noaptea, pentru Astăzi\)$/m, 'numele robotului de care atârnă');
});
