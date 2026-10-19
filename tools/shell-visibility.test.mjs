// 19.10.2026 — I-702: paginile parcate în aplicație se opresc cu adevărat (lib/shell-visibility.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function pagina() {
  const ev = {}, doc = {hidden: false, addEventListener: (t, f) => (ev['doc:' + t] = f)}, timers = [];
  const c = {document: doc, location: {origin: 'https://x.test'}, addEventListener: (t, f) => (ev[t] = f), setInterval: (f) => (timers.push(f), timers.length), clearInterval: (id) => (timers[id - 1] = null)};
  c.window = c; vm.createContext(c); vm.runInContext(readFileSync(new URL('../lib/shell-visibility.js', import.meta.url), 'utf8'), c);
  const tick = () => timers.forEach((f) => f && f());
  const shell = (v, origin = 'https://x.test') => ev.message({origin, data: {ttShellVisible: v}});
  return {c, doc, ev, tick, shell};
}
test('ascunsă de aplicație ⇒ ceasul nu rulează; la revenire rulează o dată ce a ratat', () => {
  const p = pagina(); let n = 0; p.c.TTShell.every(() => n++, 1000);
  p.tick(); assert.equal(n, 1);
  p.shell(false); assert.equal(p.c.TTShell.visible(), false); p.tick(); p.tick(); assert.equal(n, 1);
  p.shell(true); assert.equal(n, 2, 'la revenire, o singură rulare de recuperare'); p.tick(); assert.equal(n, 3);
});
test('tab ascuns (document.hidden) oprește și el; mesajele din altă origine sunt ignorate', () => {
  const p = pagina(); let n = 0; p.c.TTShell.every(() => n++, 1000);
  p.doc.hidden = true; p.ev['doc:visibilitychange'](); p.tick(); assert.equal(n, 0);
  p.doc.hidden = false; p.ev['doc:visibilitychange'](); assert.equal(n, 1);
  p.shell(false, 'https://rau.test'); assert.equal(p.c.TTShell.visible(), true);
});
test('onChange anunță doar schimbările; dezabonarea oprește anunțurile', () => {
  const p = pagina(), seen = []; const off = p.c.TTShell.onChange((v) => seen.push(v));
  p.shell(true); p.shell(false); p.shell(false); p.shell(true); off(); p.shell(false);
  assert.deepEqual(seen, [false, true]);
});
