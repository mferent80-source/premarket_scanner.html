import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const code=readFileSync('holdings/holdings.js','utf8'),load=code.slice(code.indexOf('async function loadVerdict('),code.indexOf('async function scan('));
function setup(){
 const requests=[],writes=[],raw=[{t:100,o:100,h:101,l:99,c:100,v:1000}];raw.meta={symbol:'TEST',currency:'USD'};let resolve;
 const c={positions:[{ticker:'TEST_US_EQ'}],scope:'account-a',isDemo:false,cache:{},benchmarkPrefs:{},sectorPrefs:{},symbol:()=> 'TEST',key:p=>c.scope+'|'+p.ticker,HoldingsVerdict:{fingerprint:()=> 'history-id'},localStorage:{setItem:(...x)=>writes.push(x)},D:{fetchStock:(symbol,options)=>{requests.push({symbol,...options});return symbol==='TEST'?new Promise(r=>resolve=r):Promise.resolve(null);}},DailySeries:{read:()=>({bars:raw,asOf:'2026-10-02',currency:raw.meta.currency,timezone:'America/New_York',closeMinutes:960})},HoldingsAnalysis:{analyze:()=>({asOf:'2026-10-02',price:100,medium:'Ascendent',regime:{confirmed:'up'}})}};
 vm.createContext(c);vm.runInContext(load,c);return {c,raw,requests,writes,resolve:()=>resolve(raw)};
}
test('single stock source is fetched once at 5y, verified, and caches only that position',async()=>{const s=setup(),pending=s.c.loadVerdict(s.c.positions[0],{isCurrent:()=>true});s.resolve();const source=await pending;assert.equal(s.requests.filter(r=>r.symbol==='TEST').length,1);assert.equal(s.requests[0].range,'5y');assert.equal(source.close,100);assert.equal(source.fingerprint,'history-id');assert.equal(Object.keys(s.c.cache).join(),'account-a|TEST_US_EQ');assert.equal(s.writes.length,1);});
test('the cached chart model retains provenance of the full verified history when its displayed bars are truncated',async()=>{
 const s=setup();s.raw.unshift({t:50,o:90,h:91,l:89,c:90,v:900});s.c.HoldingsVerdict.fingerprint=bars=>JSON.stringify(bars.map(b=>[b.t,b.c]));
 s.c.HoldingsAnalysis.analyze=()=>({asOf:'2026-10-02',price:100,bars:s.raw.slice(-1)});
 const pending=s.c.loadVerdict(s.c.positions[0],{isCurrent:()=>true});s.resolve();const source=await pending,model=s.c.cache['account-a|TEST_US_EQ'].model;
 assert.equal(model.sourceFingerprint,source.fingerprint);assert.notEqual(model.sourceFingerprint,s.c.HoldingsVerdict.fingerprint(model.bars));
 assert.equal(JSON.parse(s.writes[0][1])['account-a|TEST_US_EQ'].model.sourceFingerprint,source.fingerprint);
});
test('a simultaneous chart refresh preserves only recent full-source provenance for unchanged chart data and identity',()=>{
 const now=Date.parse('2026-10-06T03:40:00Z'),bars=[{t:1,o:99,h:101,l:98,c:100,v:1000}],prior={asOf:'2026-10-05',price:100,timezone:'America/New_York',closeMinutes:960,bars,sourceFingerprint:'full-five-year-history',sourceVerifiedAt:now-1000},old={symbol:'TEST',currency:'USD',model:prior};
 const c={HoldingsVerdict:{fingerprint:bars=>JSON.stringify(bars)}};vm.createContext(c);vm.runInContext(code.slice(code.indexOf('function retainVerifiedSource('),code.indexOf('async function loadVerdict(')),c);
 for(const change of ['none','symbol','currency','session','history','expired','future']){
  const model=structuredClone(prior);delete model.sourceFingerprint;delete model.sourceVerifiedAt;const previous=structuredClone(old);
  if(change==='symbol')previous.symbol='OTHER';if(change==='currency')previous.currency='EUR';if(change==='session')model.asOf='2026-10-02';if(change==='history')model.bars[0].o=98;if(change==='expired')previous.model.sourceVerifiedAt=now-1800001;if(change==='future')previous.model.sourceVerifiedAt=now+1;
  assert.equal(c.retainVerifiedSource(model,previous,'TEST','USD',now),change==='none',change);assert.equal(model.sourceFingerprint,change==='none'?prior.sourceFingerprint:undefined,change);
 }
 assert.match(code,/retainVerifiedSource\(model,old,s,currency==='GBp'\?'GBX':currency\);cache\[entry\]/);
});
test('closing, account or mapping changes and position removal prevent delayed cache writes',async()=>{for(const change of ['close','account','mapping','removed','sector']){const s=setup();let active=true;const pending=s.c.loadVerdict(s.c.positions[0],{isCurrent:()=>active});if(change==='close')active=false;if(change==='account')s.c.scope='account-b';if(change==='mapping')s.c.symbol=()=> 'OTHER';if(change==='removed')s.c.positions=[];if(change==='sector')s.c.sectorPrefs.TEST_US_EQ='XLK';s.resolve();await assert.rejects(pending,/anulată/);assert.equal(s.writes.length,0);assert.equal(Object.keys(s.c.cache).length,0);}});
test('wrong listing, missing currency or mismatched technical close fail before persistence',async()=>{for(const change of ['symbol','currency','price']){const s=setup(),pending=s.c.loadVerdict(s.c.positions[0],{isCurrent:()=>true});if(change==='symbol')s.raw.meta.symbol='OTHER';if(change==='currency')s.raw.meta.currency=null;if(change==='price')s.c.HoldingsAnalysis.analyze=()=>({asOf:'2026-10-02',price:105});s.resolve();await assert.rejects(pending);assert.equal(s.writes.length,0);assert.equal(Object.keys(s.c.cache).length,0);}});
test('a full analysis cache cannot block a validated common source or overwrite the previous stored data',async()=>{
 const s=setup();s.c.localStorage.setItem=()=>{throw Object.assign(Error('PRIVATE account key'),{name:'QuotaExceededError'});};const pending=s.c.loadVerdict(s.c.positions[0],{isCurrent:()=>true});s.resolve();const source=await pending;
 assert.equal(source.close,100);assert.equal(source.fingerprint,'history-id');assert.equal(s.c.cache['account-a|TEST_US_EQ'].model.price,100);assert.match(source.cacheWarning,/nu a putut salva/);assert.doesNotMatch(source.cacheWarning,/PRIVATE/);assert.equal(s.writes.length,0);
});
