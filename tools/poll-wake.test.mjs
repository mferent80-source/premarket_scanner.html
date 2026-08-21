// poll-wake.test.mjs — helperul de trezire rupe latch-ul hung și cheamă dropInflight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const listeners = { document: [], window: [] };
globalThis.document = {
  hidden: false,
  addEventListener: (ev, fn) => { listeners.document.push([ev, fn]); }
};
globalThis.window = {
  addEventListener: (ev, fn) => { listeners.window.push([ev, fn]); }
};
globalThis.D = {
  dropped: 0,
  dropInflight() { this.dropped++; }
};

new Function(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'poll-wake.js'), 'utf8'))();
const PollWake = globalThis.PollWake || (globalThis.window && globalThis.window.PollWake);

test('PollWake.bind + resume eliberează latch-ul și dropInflight', () => {
  let busy = true, busyTs = Date.now() - 200000, polls = 0, schedules = 0;
  const wake = PollWake.bind({
    getBusy: () => busy,
    setBusy: v => { busy = v; },
    getBusyTs: () => busyTs,
    setBusyTs: v => { busyTs = v; },
    poll: () => { polls++; },
    schedule: () => { schedules++; },
    isPaused: () => false,
    isShellHidden: () => false,
    isStale: () => false,
    intervalMs: 60 * 60 * 1000
  });
  wake.resume('test');
  assert.equal(busy, false, 'latch eliberat');
  assert.equal(busyTs, 0, 'busyTs reset');
  assert.equal(polls, 1);
  assert.equal(schedules, 1);
  assert.ok(globalThis.D.dropped >= 1, 'dropInflight apelat');
  assert.ok(listeners.document.some(([ev]) => ev === 'visibilitychange'));
  assert.ok(listeners.window.some(([ev]) => ev === 'pageshow'));
  wake.stop();
});

test('visibilitychange pe tab vizibil cheamă resume', () => {
  let polls = 0;
  const wake = PollWake.bind({
    setBusy: () => {},
    setBusyTs: () => {},
    poll: () => { polls++; },
    schedule: () => {},
    intervalMs: 60 * 60 * 1000
  });
  const vis = listeners.document.filter(([ev]) => ev === 'visibilitychange').pop();
  globalThis.document.hidden = false;
  vis[1]();
  assert.ok(polls >= 1);
  wake.stop();
});
