import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('hundreds of worker progress messages keep the existing model panels responsive',async()=>{
 const p={ticker:'TEST_US_EQ'},model={currency:'USD',price:100,asOf:'2026-10-02'},source={...model,close:100,symbol:'TEST',kind:'market'},stored=new Map();let paints=0,config,target;
 const c={setInterval:()=>1,document:{hidden:false,addEventListener(){},querySelectorAll:()=>[]}};vm.createContext(c);for(const f of ['lib/holdings-forecast.js','lib/holdings-auto-learning.js'])vm.runInContext(readFileSync(f,'utf8'),c);
 c.DailySeries={expected:()=>model.asOf};c.HoldingsForecastUI={restore:async()=>{},autoStorage:()=>({getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}),learning:()=>null};
 for(const name of ['Neural','HMM','Isolation','Quantile','Garch','KNN'])c['Holdings'+name+'UI']={busy:()=>false,refresh:()=>paints++,cancelManaged(){}};
 c.HoldingsAutoLearning.create=options=>{config=options;return {busy:()=>false,stop(){},start:async t=>{target=t;}};};
 vm.runInContext(readFileSync('holdings/learning.js','utf8'),c);c.HoldingsAutoLearningUI.setContext({scope:'account',demo:false,positions:[p],symbol:()=>source.symbol,model:()=>model,refresh(){},loadVerdict:async()=>source});await new Promise(r=>setImmediate(r));assert.ok(config&&target);
 const run={target,source,phase:'running',statuses:{neural:{state:'running'},boosting:{state:'running'}}};for(let i=0;i<650;i++){run.progress={epoch:i};config.update(run);}assert.ok(paints<10,'Progress events must not rebuild the entire model lab');
 run.statuses.neural.state='ready';run.statuses.boosting.state='ready';config.update(run);run.phase='done';config.update(run);assert.ok(paints>=3,'State transitions and completion remain visible');assert.ok(paints<10);
});
