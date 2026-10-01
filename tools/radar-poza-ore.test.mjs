// Garda (el, 01.10): pagina alerts citește poza Radarului la 1 minut între 16:30 și 23:00 (ora României), deloc între 23:00 și 08:00
// (colectorul nu urcă nimic noaptea; cota KV de pe Cloudflare), la 5 minute în rest. Testul încarcă lib/radar-poza.js REAL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function incarca(cuCache) {
  const store = new Map([['radar_cheie', 'cheie-de-proba-0123456789']]);
  if (cuCache) store.set('radar_poza', JSON.stringify({ la: 1, t212: [] }));
  const apeluri = [];
  const ctx = {
    window: {}, document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    fetch: async (u) => { apeluri.push(u); return { status: 304, ok: false, headers: { get: () => null }, json: async () => ({}) }; },
    location: { hash: '', search: '', href: 'https://x/alerts/' }, history: { replaceState() {} }, console,
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'lib', 'radar-poza.js'), 'utf8'), ctx);
  return { RP: ctx.RadarPoza, apeluri, store };
}
const T = (s) => Date.parse(s);

test('citireMs (el, 01.10): 08–16 la 3 min, 16–17 la 30 s, 17–23 la 1,5 min, 23–08 nimic (ora Romaniei, si iarna)', () => {
  const { RP } = incarca(true);
  assert.equal(typeof RP.citireMs, 'function', 'lipseste RadarPoza.citireMs');
  assert.equal(RP.citireMs(T('2026-10-01T09:00:00Z')), 180000, '12:00 RO');
  assert.equal(RP.citireMs(T('2026-10-01T13:00:00Z')), 30000, '16:00 RO');
  assert.equal(RP.citireMs(T('2026-10-01T14:00:00Z')), 90000, '17:00 RO');
  assert.equal(RP.citireMs(T('2026-10-01T20:00:00Z')), null, '23:00 RO');
  assert.equal(RP.citireMs(T('2026-10-02T04:59:00Z')), null, '07:59 RO');
  assert.equal(RP.citireMs(T('2026-12-01T14:30:00Z')), 30000, 'iarna 16:30 RO');
  assert.match(readFileSync(join(ROOT, 'lib', 'radar-poza.js'), 'utf8'), /setInterval\(function \(\) \{ f\(false\); \}, 30000\)/, 'ceasul paginii la 30 s');
});
test('noaptea nu citeste (nici la revenirea pe pagina) cand are deja o poza; fara nicio poza citeste o data', async () => {
  const noapte = T('2026-10-02T00:00:00Z');
  const a = incarca(true); await a.RP.citeste({ acum: noapte, vizibil: true, fortat: true }); assert.equal(a.apeluri.length, 0, 'noaptea, cu poza in cache: nicio cerere');
  const b = incarca(false); await b.RP.citeste({ acum: noapte }); assert.equal(b.apeluri.length, 1, 'fara poza: o citire');
  const c = incarca(true); await c.RP.citeste({ acum: T('2026-10-01T14:00:00Z') }); assert.equal(c.apeluri.length, 1, 'ziua: citeste');
});
test('noaptea pagina nu zice „tace / oprit”: pauza de noapte (23:00–08:00 si primele 10 minute dupa 08:00); ziua ramane ca inainte', () => {
  const { RP } = incarca(true);
  const p = RP.prospetime({ la: T('2026-10-01T19:59:00Z') }, T('2026-10-01T23:00:00Z'));   // poza 22:59 RO, acum 02:00 RO
  assert.equal(p.stare, 'noapte', JSON.stringify(p)); assert.match(p.text, /pauză de noapte/);
  assert.equal(RP.prospetime({ la: T('2026-10-01T19:59:00Z') }, T('2026-10-02T05:05:00Z')).stare, 'noapte', '08:05 RO: colectorul abia porneste');
  assert.equal(RP.prospetime({ la: T('2026-10-02T07:00:00Z') }, T('2026-10-02T09:00:00Z')).stare, 'oprit', '12:00 RO, poza de la 10:00: oprit, ca inainte');
  assert.match(readFileSync(join(ROOT, 'lib', 'radar-ecran.js'), 'utf8'), /stare === 'noapte'/, 'ecranul stie starea noapte');
});
