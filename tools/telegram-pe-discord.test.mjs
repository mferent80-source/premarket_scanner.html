// telegram-pe-discord.test.mjs — lib/telegram.js (TG.*) trimite pe DISCORD (11.10.2026).
// Marius: „aș vrea să se ducă tot pe Discord”. Cele 13 pagini care cheamă TG.send / TG.getConfig
// rămân neatinse: interfața TG se păstrează, se schimbă doar canalul (webhook Discord).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../lib/telegram.js', import.meta.url), 'utf8');
const WH = 'https://discord.com/api/webhooks/123/abc_DEF-9';

function incarca(stocare = {}) {
  const st = { ...stocare };
  const cereri = [];
  const ctx = {
    localStorage: { getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); } },
    fetch: async (url, o) => { cereri.push({ url, corp: JSON.parse(o.body) }); return { ok: true, status: 204, json: async () => ({}), text: async () => '' }; },
    setTimeout: (f) => { f(); return 0; },
    console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { TG: ctx.TG, st, cereri };
}

test('fără webhook nu trimite nimic, iar „configurat” e fals', async () => {
  const { TG, cereri } = incarca();
  const c = TG.getConfig();
  assert.equal(!!(c.token && c.chatId), false);
  assert.equal(await TG.send('x', { force: true }), false);
  assert.equal(cereri.length, 0);
});

test('cu webhook salvat și pornit: trimite pe Discord, markdown, fără @everyone', async () => {
  const { TG, st, cereri } = incarca();
  TG.setConfig(WH, '', true);
  assert.ok(st.tt_dc_config.includes('webhooks'));
  const c = TG.getConfig();
  assert.ok(c.enabled && c.token && c.chatId, 'paginile vechi verifică token && chatId');
  assert.equal(await TG.send('🔔 <b>AAPL</b> · <i>200 $</i> <a href="https://x.com/?a=1&amp;b=2">grafic</a>'), true);
  assert.equal(cereri.length, 1);
  assert.ok(cereri[0].url.startsWith(WH));
  assert.equal(cereri[0].corp.content, '🔔 **AAPL** · *200 $* [grafic](<https://x.com/?a=1&b=2>)');
  assert.deepEqual(cereri[0].corp.allowed_mentions, { parse: [] });
  assert.ok(!cereri.some(r => /telegram/.test(r.url)));
});

test('oprit: trimite doar cu force (butonul Test)', async () => {
  const { TG, cereri } = incarca();
  TG.setConfig(WH, '', false);
  assert.equal(await TG.send('x'), false);
  assert.equal(await TG.send('x', { force: true }), true);
  assert.equal(cereri.length, 1);
});

test('un token Telegram vechi dat la setConfig nu strică webhook-ul salvat', () => {
  const { TG } = incarca();
  TG.setConfig(WH, '', true);
  TG.setConfig('123456:ABC-telegram', '555', true);
  assert.equal(TG.getConfig().webhook, WH);
});

test('override-ul de webhook din opts (Test din modal înainte de Salvează)', async () => {
  const { TG, cereri } = incarca();
  assert.equal(await TG.send('x', { webhook: WH, force: true }), true);
  assert.equal(cereri.length, 1);
});

test('„pornit” din configurația Telegram veche se păstrează la prima citire', () => {
  const { TG } = incarca({ tt_tg_config: JSON.stringify({ token: 't', chatId: 'c', enabled: true }) });
  const c = TG.getConfig();
  assert.equal(c.enabled, true);
  assert.equal(c.webhook, '');
});
