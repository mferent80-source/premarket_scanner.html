import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../lib/storage-write.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-14T22:30:00Z');
const quotaError = () => Object.assign(new Error('quota'), {name:'QuotaExceededError'});
const cache = (at, size = 180) => JSON.stringify({t:at, v:'x'.repeat(size)});
const sizeOf = data => [...data].reduce((sum, [key, raw]) => sum + key.length + raw.length, 0);
function load(){
  const context = {Date:class extends Date { static now(){ return NOW; } }, console:{log(){throw Error('No diagnostic logging is allowed');}}};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.TTStorageWrite;
}
function bounded(entries = [], limit = Infinity){
  const data = new Map(entries), calls = [], failures = [];
  const storage = {
    get length(){ return data.size; },
    key(index){ calls.push(['key', index]); return [...data.keys()][index] ?? null; },
    getItem(key){ calls.push(['get', key]); return data.get(key) ?? null; },
    setItem(key, raw){
      calls.push(['set', key, raw]);
      const next = new Map(data);next.set(String(key), String(raw));
      if (sizeOf(next) > limit) {const error=quotaError();failures.push(error);throw error;}
      data.set(String(key), String(raw));
    },
    removeItem(key){ calls.push(['remove', key]);data.delete(key); }
  };
  return {data, storage, calls, failures};
}
const removed = fixture => fixture.calls.filter(call => call[0] === 'remove').map(call => call[1]);
const originals = [
  ['tt_journal_v1', '[{"id":"journal-original"}]\n'],
  ['tt_trade_plans_v1', '[{"id":"plan-original"}]'],
  ['tt_journal_settings_v1', '{"workspaceV2":true}'],
  ['wl_stocks', '["AAPL"]'],
  ['ce_results_v2', '{"rows":[{"ticker":"MSFT"}]}'],
  ['tt_cloud_owner', 'original-owner'],
  ['tt_trading212_key', 'original-key'],
  ['unknown_market_cache', cache(NOW - 50000)]
];

test('quota detection accepts browser quota signals and rejects security, ordinary errors and message-only claims', () => {
  const api = load();
  for (const error of [quotaError(), {code:22}, {code:1014}, {name:'NS_ERROR_DOM_QUOTA_REACHED', code:1014}]) assert.equal(api.isQuotaError(error), true);
  for (const error of [null, undefined, {}, new Error('QuotaExceededError'), {code:'22'}, {name:'SecurityError'}, {name:'SecurityError', code:22}, {get name(){throw Error('denied');}}]) assert.equal(api.isQuotaError(error), false);
});

test('a successful write preserves exact raw content and does not inspect or remove any cache', () => {
  const api = load(), fixture = bounded([['ttd:old', cache(NOW - 1000)], ...originals]);
  const raw = '  [{"id":"fill-1","price":12.345600}]\n', set = fixture.storage.setItem;
  const result = api.setItem(fixture.storage, 'tt_trading212_fills_v1', raw);
  assert.equal(fixture.data.get('tt_trading212_fills_v1'), raw);
  assert.deepEqual(fixture.calls, [['set', 'tt_trading212_fills_v1', raw]]);
  assert.equal(result.evicted, 0);
  assert.equal(fixture.storage.setItem, set, 'the helper never monkey-patches storage');
});

test('broker fills exceeding capacity save unchanged after incremental oldest market-cache eviction', () => {
  const api = load(), target = 'tt_trading212_fills_v1', prior = '[{"id":"fill-original"}]\n';
  const caches = [['ttd:newest', cache(NOW - 1000, 400)], ['ttd:oldest', cache(NOW - 3000, 400)], ['ttd:middle', cache(NOW - 2000, 400)]];
  const entries = [[target, prior], ...originals, ...caches];
  const raw = JSON.stringify({version:1, executions:Array.from({length:30}, (_,i) => ({id:'fill-'+i, ticker:'AAPL_US_EQ', type:'MARKET', side:'BUY', quantity:10, price:101.25, currency:'USD', fees:0}))});
  const oldBytes = caches[1][0].length + caches[1][1].length, middleBytes = caches[2][0].length + caches[2][1].length;
  const fixture = bounded(entries, sizeOf(new Map(entries)) + raw.length - prior.length - oldBytes - Math.floor(middleBytes / 2));
  const result = api.setItem(fixture.storage, target, raw);
  assert.equal(fixture.data.get(target), raw, 'financial records are neither compressed nor truncated');
  assert.deepEqual(removed(fixture), ['ttd:oldest', 'ttd:middle']);
  assert.equal(fixture.data.get('ttd:newest'), caches[0][1], 'the next cache stays intact once the write succeeds');
  assert.equal(fixture.calls.filter(call => call[0] === 'set').length, 3);
  assert.equal(result.evicted, 2);
  assert.deepEqual(Object.keys(result), ['evicted']);
  assert.equal(typeof result.evicted, 'number', 'reports contain counts, never cache keys or URLs');
  for (const [key, value] of originals) assert.equal(fixture.data.get(key), value);
});

test('non-quota and security failures preserve all records and cache bytes without enumeration', () => {
  const api = load();
  for (const error of [new Error('blocked'), Object.assign(new Error('denied'), {name:'SecurityError'}), Object.assign(new Error('denied'), {name:'SecurityError', code:22})]) {
    const fixture = bounded([['tt_trading212_fills_v1', 'prior\n'], ['ttd:oldest', cache(NOW - 1000)], ...originals]), before = [...fixture.data];
    fixture.storage.setItem = () => {throw error;};
    assert.throws(() => api.setItem(fixture.storage, 'tt_trading212_fills_v1', 'new'), caught => caught === error);
    assert.deepEqual([...fixture.data], before);
    assert.deepEqual(fixture.calls, []);
  }
});

test('unsatisfiable quota rethrows its original error and preserves prior financial bytes and unknown-shaped values', () => {
  const api = load(), target = 'tt_trading212_fills_v1', prior = ' [ {"id":"original","price":12.3400} ]\n';
  const unknown = [['ttd:broken', '{broken'], ['ttd:missing-payload', JSON.stringify({t:NOW - 1000})], ['ttd:extra-fields', JSON.stringify({t:NOW - 1000, v:[], records:[]})], ['ttd:future', cache(NOW + 1)], ['ttd:string-time', JSON.stringify({t:String(NOW - 1), v:[]})], ['ttd:financial-shaped', '[{"id":"keep"}]']];
  const entries = [[target, prior], ...originals, ...unknown, ['ttd:disposable', cache(NOW - 1000)]];
  const fixture = bounded(entries, sizeOf(new Map(entries)));
  assert.throws(() => api.setItem(fixture.storage, target, 'x'.repeat(fixture.data.size * 1000)), caught => caught === fixture.failures[0]);
  assert.equal(fixture.data.get(target), prior);
  assert.deepEqual(removed(fixture), ['ttd:disposable']);
  for (const [key, value] of [...originals, ...unknown]) assert.equal(fixture.data.get(key), value);
});

test('cache names are snapshotted before removals so shifting storage indices cannot skip entries', () => {
  const api = load(), entries = [['ttd:newest', cache(NOW - 1000)], ['ttd:oldest', cache(NOW - 3000)], ['ttd:middle', cache(NOW - 2000)], ['tt_journal_v1', 'keep']];
  const fixture = bounded(entries, sizeOf(new Map(entries)));
  assert.throws(() => api.setItem(fixture.storage, 'tt_trading212_fills_v1', 'x'.repeat(2000)), caught => caught === fixture.failures[0]);
  assert.deepEqual(removed(fixture), ['ttd:oldest', 'ttd:middle', 'ttd:newest']);
  const firstRemoval = fixture.calls.findIndex(call => call[0] === 'remove');
  assert.equal(fixture.calls.slice(firstRemoval).some(call => call[0] === 'key'), false);
  assert.equal(fixture.calls.filter(call => call[0] === 'key').length, entries.length);
  assert.equal(fixture.data.get('tt_journal_v1'), 'keep');
});

test('unreadable caches and refused removals are skipped while another eligible cache can release capacity', () => {
  const api = load(), entries = [['ttd:unreadable', cache(NOW - 3000)], ['ttd:refused', cache(NOW - 2000)], ['ttd:usable', cache(NOW - 1000)], ['tt_journal_v1', 'prior']];
  const fixture = bounded(entries, sizeOf(new Map(entries))), get = fixture.storage.getItem, remove = fixture.storage.removeItem;
  fixture.storage.getItem = key => {if(key === 'ttd:unreadable')throw Error('denied');return get(key);};
  fixture.storage.removeItem = key => {if(key === 'ttd:refused')throw Error('denied');return remove(key);};
  const result = api.setItem(fixture.storage, 'tt_trading212_fills_v1', 'new fills');
  assert.equal(result.evicted, 1);
  assert.deepEqual(removed(fixture), ['ttd:usable']);
  assert.equal(fixture.data.get('ttd:unreadable'), entries[0][1]);
  assert.equal(fixture.data.get('ttd:refused'), entries[1][1]);
  assert.equal(fixture.data.get('tt_trading212_fills_v1'), 'new fills');
  assert.equal(fixture.data.get('tt_journal_v1'), 'prior');
});

test('the target cache key is never evicted, even when it is older than all other entries', () => {
  const api = load(), target = 'ttd:target', prior = cache(NOW - 5000), entries = [[target, prior], ['ttd:other', cache(NOW - 1000)], ...originals];
  const fixture = bounded(entries, sizeOf(new Map(entries)));
  assert.throws(() => api.setItem(fixture.storage, target, 'x'.repeat(3000)), caught => caught === fixture.failures[0]);
  assert.equal(fixture.data.get(target), prior);
  assert.deepEqual(removed(fixture), ['ttd:other']);
});

test('a cache replaced after enumeration remains untouched and only unchanged cache copies are evicted', () => {
  const api = load(), entries = [['ttd:changed', cache(NOW - 2000)], ['ttd:unchanged', cache(NOW - 1000)], ['tt_journal_v1', 'prior']];
  const fixture = bounded(entries, sizeOf(new Map(entries))), get = fixture.storage.getItem;
  let reads = 0;
  fixture.storage.getItem = key => {if(key === 'ttd:changed' && ++reads === 2)fixture.data.set(key, 'replacement-original');return get(key);};
  const result = api.setItem(fixture.storage, 'tt_trading212_fills_v1', 'new fills');
  assert.equal(result.evicted, 1);
  assert.equal(fixture.data.get('ttd:changed'), 'replacement-original');
  assert.deepEqual(removed(fixture), ['ttd:unchanged']);
});

test('enumeration failure preserves every entry and rethrows the original quota exception', () => {
  const api = load(), fixture = bounded([['ttd:old', cache(NOW - 1000)], ['tt_journal_v1', 'prior']], 0), before = [...fixture.data];
  fixture.storage.key = () => {throw Error('denied');};
  assert.throws(() => api.setItem(fixture.storage, 'tt_trading212_fills_v1', 'new fills'), caught => caught === fixture.failures[0]);
  assert.deepEqual([...fixture.data], before);
  assert.deepEqual(removed(fixture), []);
});

test('a retry rejected for another reason stops immediately without evicting further caches', () => {
  const api = load(), fixture = bounded([['ttd:old', cache(NOW - 2000)], ['ttd:new', cache(NOW - 1000)], ['tt_journal_v1', 'prior']]);
  const quota = quotaError(), denied = Object.assign(new Error('denied'), {name:'SecurityError'});let writes = 0;
  fixture.storage.setItem = () => {throw ++writes === 1 ? quota : denied;};
  assert.throws(() => api.setItem(fixture.storage, 'tt_journal_v1', 'new'), caught => caught === denied);
  assert.deepEqual(removed(fixture), ['ttd:old']);
  assert.equal(fixture.data.get('ttd:new'), cache(NOW - 1000));
  assert.equal(fixture.data.get('tt_journal_v1'), 'prior');
});
