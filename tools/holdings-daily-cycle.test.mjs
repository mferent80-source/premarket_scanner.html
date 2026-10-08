import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function setup({enabled=true,hidden=false,deferRestore=false}={}){
 const saved=new Map(),listeners={},p={ticker:'TEST_US_EQ',instrumentCurrency:'USD'};
 let model=null,eod='2026-10-05',loads=0,checks=0,captures=0,sourceChecks=0,release,timer;
 const reference={symbol:'TEST',currency:'GBX',asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960};
 const runs=[],c={setInterval:fn=>(timer=fn,1),document:{hidden,addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:()=>[]}};
 vm.createContext(c);for(const file of ['lib/holdings-forecast.js','lib/holdings-auto-learning.js'])vm.runInContext(readFileSync(file,'utf8'),c);
 const identity={scope:'account',ticker:p.ticker,symbol:'TEST',currency:'GBX',kind:'market'};
 saved.set(c.HoldingsAutoLearning.key(identity),JSON.stringify({version:c.HoldingsAutoLearning.VERSION,enabled,asOf:'2026-10-02',phase:'done',at:1}));
 const restore=deferRestore?new Promise(r=>release=r):Promise.resolve();
 c.DailySeries={expected:()=>eod};c.HoldingsForecastUI={restore:()=>restore,autoStorage:()=>({getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}),learning:()=>null,check:async()=>{checks++;return {state:'checked'};},checkSource:()=>sourceChecks++,capture:()=>captures++,captureVerdict(){},probabilistic:()=>null};
 c.HoldingsVerdict={IDS:['neural','boosting','hmm','isolation','quantile','garch','knn'],build:()=>({available:7,total:7})};
 for(const name of ['Neural','HMM','Isolation','Quantile','Garch','KNN'])c['Holdings'+name+'UI']={busy:()=>false,refresh(){},restore:async()=>{},inspect:()=>({}),run:async(_,options)=>{runs.push({name,source:options.source});return {state:'ready'};},cancelManaged(){}};
 const context={scope:'account',demo:false,positions:[p],symbol:()=>reference.symbol,model:()=>model,reference:()=>reference,refresh(){},loadVerdict:async()=>{loads++;model={...reference,asOf:eod,price:100};return {...model,close:100,kind:'market',fingerprint:'verified-'+eod};}};
 vm.runInContext(readFileSync('holdings/learning.js','utf8'),c);c.HoldingsAutoLearningUI.setContext(context);
 await new Promise(r=>setImmediate(r));
 return {c,context,p,identity,saved,runs,release:()=>release?.(),timer:()=>timer(),visible:()=>{c.document.hidden=false;listeners.visibilitychange();},counts:()=>({loads,checks,captures,sourceChecks}),setEod:value=>{eod=value;model=null;},settle:()=>new Promise(r=>setImmediate(r))};
}
test('an expired technical analysis still triggers all seven models on one freshly verified EOD and listing currency',async()=>{
 const s=await setup();assert.deepEqual(s.counts(),{loads:1,checks:0,captures:1,sourceChecks:1});assert.equal(s.runs.length,6);
 assert.ok(s.runs.every(r=>r.source.asOf==='2026-10-05'&&r.source.currency==='GBX'));assert.ok(s.runs.every(r=>r.source===s.runs[0].source));
 const state=JSON.parse(s.saved.get(s.c.HoldingsAutoLearning.key(s.identity)));assert.equal(state.phase,'done');assert.equal(state.asOf,'2026-10-05');
 await s.c.HoldingsAutoLearningUI.tick();assert.equal(s.counts().loads,1);
 s.setEod('2026-10-06');await s.c.HoldingsAutoLearningUI.tick();assert.equal(s.counts().loads,2);assert.equal(s.runs.length,12);
});
test('stopping retraining preserves automatic outcome verification, including with an expired analysis',async()=>{
 const s=await setup({enabled:false});assert.deepEqual(s.counts(),{loads:0,checks:1,captures:0,sourceChecks:0});assert.equal(s.runs.length,0);
 s.setEod('2026-10-06');s.timer();await s.settle();assert.equal(s.counts().checks,2);assert.equal(s.counts().loads,0);
 assert.equal(JSON.parse(s.saved.get(s.c.HoldingsAutoLearning.key(s.identity))).enabled,false);
});
test('a hidden page makes no background requests and resumes when visible',async()=>{
 const s=await setup({enabled:false,hidden:true});assert.equal(s.counts().checks,0);await s.timer();assert.equal(s.counts().checks,0);
 s.visible();await s.settle();assert.equal(s.counts().checks,1);
});
test('an account change during restore cannot train or verify the old account',async()=>{
 const s=await setup({deferRestore:true});s.c.HoldingsAutoLearningUI.setContext({...s.context,scope:'other-account',positions:[]});s.release();await s.settle();
 assert.deepEqual(s.counts(),{loads:0,checks:0,captures:0,sourceChecks:0});assert.equal(s.saved.size,1);
});
test('last verified listing metadata can schedule a refresh, but never turns an expired analysis into a current one',()=>{
 const code=readFileSync('holdings/holdings.js','utf8'),p={ticker:'TEST_US_EQ'},now=Date.parse('2026-10-06T06:30:00Z'),last={t:Date.parse('2026-10-02T13:30:00Z'),c:100};
 const c={Date:class extends Date{static now(){return now;}},cache:{'account|TEST_US_EQ':{symbol:'TEST',currency:'GBX',fetchedAt:now-86400000,model:{asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960,price:100,bars:[last]}}},isDemo:false,key:()=> 'account|TEST_US_EQ',symbol:()=> 'TEST',DailySeries:{date:()=> '2026-10-02',expected:()=> '2026-10-05'}};
 vm.createContext(c);vm.runInContext(code.slice(code.indexOf('function marketReference('),code.indexOf('function demoBars(')),c);
 assert.equal(c.marketReference(p).currency,'GBX');assert.equal(c.marketReference(p).asOf,'2026-10-02');assert.equal(c.marketReference(p).price,undefined);
 c.symbol=()=> 'OTHER';assert.equal(c.marketReference(p),null);c.symbol=()=> 'TEST';c.cache['account|TEST_US_EQ'].model.timezone=null;assert.equal(c.marketReference(p),null);
 assert.match(code,/reference:marketReference/);assert.match(code,/model:p=>\{const m=currentModel\(p\)/);
});
