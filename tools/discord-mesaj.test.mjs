// discord-mesaj.test.mjs — botul de știri trimite pe Discord, nu pe Telegram (11.10.2026).
// Marius: „aș vrea să se ducă tot pe Discord”. Mesajele botului sunt scrise în HTML-ul
// Telegram (<b>, <i>, <code>, <a href>); Discord vrea markdown și cel mult 2000 de caractere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlLaDiscord, bucatiDiscord, esteWebhookDiscord, trimiteDiscord } from './discord-mesaj.mjs';

test('etichetele Telegram devin markdown Discord', () => {
  assert.equal(
    htmlLaDiscord('<b>AAPL</b> · <i>Reuters</i> · <code>sc12</code> <a href="https://x.com/a?b=1&amp;c=2">citește</a>'),
    '**AAPL** · *Reuters* · `sc12` [citește](<https://x.com/a?b=1&c=2>)'
  );
});

test('entitățile HTML se întorc în caractere, alte etichete dispar', () => {
  assert.equal(htmlLaDiscord('P&amp;L &lt;5% &gt; 3 &quot;ok&quot; <span>x</span>'), 'P&L <5% > 3 "ok" x');
});

test('mesajul lung se taie la rând, sub 2000 de caractere pe bucată', () => {
  const rand = 'x'.repeat(150);
  const lung = Array.from({ length: 30 }, () => rand).join('\n');
  const b = bucatiDiscord(lung);
  assert.ok(b.length >= 3);
  for (const p of b) assert.ok(p.length <= 1900, p.length);
  assert.equal(b.join('\n'), lung);
});

test('webhook-ul are forma Discord', () => {
  assert.ok(esteWebhookDiscord('https://discord.com/api/webhooks/123/abc_DEF-9'));
  assert.ok(!esteWebhookDiscord('https://api.telegram.org/bot1/sendMessage'));
  assert.ok(!esteWebhookDiscord(''));
});

test('trimite fără @everyone, cu numele botului, și raportează eșecul', async () => {
  const cereri = [];
  const fetchFals = async (url, o) => { cereri.push({ url, corp: JSON.parse(o.body) }); return { ok: true, status: 204, text: async () => '' }; };
  const ok = await trimiteDiscord('<b>AAPL</b> @everyone', { webhook: 'https://discord.com/api/webhooks/1/a', fetch: fetchFals, pauzaMs: 0 });
  assert.equal(ok, true);
  assert.equal(cereri.length, 1);
  assert.deepEqual(cereri[0].corp.allowed_mentions, { parse: [] });
  assert.equal(cereri[0].corp.username, 'Alerts · știri');
  assert.equal(cereri[0].corp.content, '**AAPL** @everyone');

  const picat = await trimiteDiscord('x', { webhook: 'https://discord.com/api/webhooks/1/a', fetch: async () => ({ ok: false, status: 429, text: async () => 'rate' }), pauzaMs: 0, jurnal: () => {} });
  assert.equal(picat, false);
  const fara = await trimiteDiscord('x', { webhook: '', fetch: fetchFals, pauzaMs: 0, jurnal: () => {} });
  assert.equal(fara, false);
});

// 27.10.2026 (I-764): rezumatele trimise automat poartă eticheta „neverificat de om”, o singură dată, la capătul mesajului (sub-text Discord).
test('eticheta „neverificat de om” se pune o dată, pe ultima bucată, fără să treacă de limită; botul de știri o cere', async () => {
  const cereri = [];
  const fetchFals = async (url, o) => { cereri.push(JSON.parse(o.body).content); return { ok: true, status: 204, text: async () => '' }; };
  const { ETICHETA_NEVERIFICAT } = await import('./discord-mesaj.mjs');
  assert.match(ETICHETA_NEVERIFICAT, /neverificat de om/);
  await trimiteDiscord('<b>AAPL</b> rezumat', { webhook: 'https://discord.com/api/webhooks/1/a', fetch: fetchFals, pauzaMs: 0, eticheta: ETICHETA_NEVERIFICAT });
  assert.equal(cereri[0], '**AAPL** rezumat\n-# ' + ETICHETA_NEVERIFICAT);
  cereri.length = 0;
  await trimiteDiscord(Array.from({ length: 30 }, () => 'y'.repeat(150)).join('\n'), { webhook: 'https://discord.com/api/webhooks/1/a', fetch: fetchFals, pauzaMs: 0, eticheta: ETICHETA_NEVERIFICAT });
  assert.equal(cereri.filter((c) => c.includes('neverificat de om')).length, 1); assert.ok(cereri.at(-1).endsWith(ETICHETA_NEVERIFICAT)); for (const c of cereri) assert.ok(c.length <= 2000);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./check-news-watch.mjs', import.meta.url), 'utf8'), /eticheta:\s*ETICHETA_NEVERIFICAT/);
});
