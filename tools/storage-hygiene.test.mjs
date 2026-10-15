import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {LIMIT,usage,regenerable,clean}=createRequire(import.meta.url)('../lib/storage-hygiene.js');
const fake=entries=>{const m=new Map(entries);return {m,get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.has(k)?m.get(k):null,removeItem:k=>m.delete(k)};};
const NOW=Date.parse('2026-10-15T12:00:00Z');

test('sub prag nu se șterge nimic',()=>{
 const s=fake([['ttd:pd:y1m:MU','x'.repeat(1000)],['tt_journal_v1','[]']]);const r=clean(s,{now:NOW});
 assert.equal(r.cleaned,0);assert.equal(s.m.size,2);assert.ok(usage(s).ratio<0.8);
});
test('peste prag se șterg doar cache-urile care se refac singure; datele rămân',()=>{
 const big='x'.repeat(Math.ceil(LIMIT*0.85));
 const s=fake([['wl_hist_cache',big],['ttd:pd:y1m:MU','abc'],['salt_eb2_2026-05-26','old'],['salt_eb2_2026-10-15','today'],['tt_journal_v1','[1]'],['tt_trading212_fills_v1','{}'],['tt_holdings_analysis_v1','{}'],['mercato_auth_uid','u'],['radar_poza','p']]);
 const r=clean(s,{now:NOW});
 assert.equal(r.cleaned,3);assert.ok(r.after.ratio<0.8);
 assert.deepEqual([...s.m.keys()].sort(),['mercato_auth_uid','radar_poza','salt_eb2_2026-10-15','tt_holdings_analysis_v1','tt_journal_v1','tt_trading212_fills_v1']);
});
test('regula e aceeași cu cea a butonului din Health (isDeepCandidate)',()=>{
 const html=readFileSync('health/index.html','utf8').replace(/\r\n/g,'\n'),body=/const isDeepCandidate = k => \{\n([\s\S]*?)\n    \};/.exec(html)[1];
 const todayMinus=d=>new Date(NOW-d*864e5).toISOString().slice(0,10),health=new Function('todayMinus','return k => {\n'+body+'\n};')(todayMinus);
 for(const k of ['ttd:pd:y1m:AVGO','wl_hist_cache','ce_eb_cache_x','salt_eb2_2026-05-26','salt_eb2_2026-10-15','stl_ticker_cache_v1','pump_radar_ticker_cache_v1','stl_results_v1','tt_journal_v1','radar_poza','mercato_auth_uid','tt_holdings_analysis_v1'])
  assert.equal(regenerable(k,NOW),health(k),k);
});
