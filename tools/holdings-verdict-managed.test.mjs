import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-05T08:00:00Z');
const core={Date:class extends Date{static now(){return now;}}};vm.createContext(core);for(const file of ['holdings-neural','holdings-neural-evaluation','holdings-boosting','holdings-model-comparison','holdings-hmm','holdings-isolation','holdings-quantile','holdings-verdict'])vm.runInContext(readFileSync('lib/'+file+'.js','utf8'),core);
const bars=core.HoldingsNeural.demoBars(0,Date.parse('2026-10-02T23:59:00Z'));
const source={bars,fingerprint:core.HoldingsVerdict.fingerprint(bars),symbol:'TEST',currency:'USD',kind:'synthetic',asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960,t:bars.at(-1).t,close:bars.at(-1).c};
function setup(name){
 const button={dataset:{[name+'Train']:'0'}},workers=[],writes=[],c={scope:'demo',demo:true,positions:[{ticker:'TEST_US_EQ',quantity:123,apiKey:'SECRET'}],symbol:()=> 'TEST',model:()=>({asOf:source.asOf,currency:source.currency,price:source.close})};
 const sandbox={...core,Date:class extends Date{static now(){return now;}},document:{querySelectorAll:q=>q==='[data-'+name+'-train]'?[button]:[],querySelector:()=>null,addEventListener(){}},location:{search:''},URLSearchParams,localStorage:{getItem:()=>null,setItem:(...args)=>writes.push(args)},DailySeries:{date:()=>source.asOf},D:{fetchStock(){throw Error('Duplicate fetch');}},setTimeout:()=>1,setInterval:()=>1,clearTimeout(){},Worker:class{constructor(){workers.push(this);}postMessage(payload){this.payload=payload;}terminate(){this.terminated=true;}}};
 vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/'+name+'.js','utf8'),sandbox);const api=sandbox['Holdings'+(name==='hmm'?'HMM':name[0].toUpperCase()+name.slice(1))+'UI'];api.setContext(c);return {api,c,workers,writes,button};
}
test('managed workers share exactly one source, settle after persistence, and feed all five verdict cards',async()=>{
 const data=core.HoldingsNeural.dataset(bars,now),neural=core.HoldingsNeuralEvaluation.evaluate(data.rows,data.latest);neural.comparison=core.HoldingsModelComparison.evaluate(data.rows,data.latest,neural);
 const results={neural,hmm:core.HoldingsHMM.evaluate(core.HoldingsHMM.dataset(bars,now)),isolation:core.HoldingsIsolation.evaluate(core.HoldingsIsolation.dataset(bars,now)),quantile:core.HoldingsQuantile.evaluate(core.HoldingsQuantile.dataset(bars,now))};
 const snapshots={};
 for(const name of Object.keys(results)){
  const s=setup(name),promise=s.api.run(s.c.positions[0],{source});let settled=false;promise.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false,name);
  const worker=s.workers[0];assert.equal(worker.payload.bars,source.bars);assert.deepEqual(Object.keys(worker.payload).sort(),['bars','id','now']);assert.ok(!/SECRET|quantity/.test(JSON.stringify(worker.payload)));
  worker.onmessage({data:{id:worker.payload.id,result:results[name]}});const result=await promise;assert.equal(result.state,'ready',name+': '+result.error);assert.equal(s.writes.length,0);
  snapshots[name]=s.api.inspect(s.c.positions[0]);assert.equal(snapshots[name].usable,true,name);
 }
 const result=core.HoldingsVerdict.build({expected:source,snapshots,now});assert.equal(result.available,5);assert.notEqual(result.state,'incomplete');assert.ok(result.cards.every(c=>c.trainedAt===now));
});
test('each managed cancellation settles and rejects delayed worker messages',async()=>{for(const name of ['neural','hmm','isolation','quantile']){const s=setup(name),pending=s.api.run(s.c.positions[0],{source});s.api.cancelManaged();assert.equal((await pending).state,'cancelled');assert.equal(s.workers[0].terminated,true);s.workers[0].onmessage({data:{id:s.workers[0].payload.id,result:{}}});assert.equal(s.writes.length,0);assert.equal(s.api.busy(),false);}});
test('verdict cancellation does not terminate a manual analysis',()=>{for(const name of ['neural','hmm','isolation','quantile']){const s=setup(name);s.api.bind();s.button.onclick();assert.equal(s.api.busy(),true);s.api.cancelManaged();assert.equal(s.api.busy(),true);assert.ok(!s.workers[0].terminated);s.api.cancel();}});
test('a shared source with a different listing, currency, EOD or close starts no worker',async()=>{for(const name of ['neural','hmm','isolation','quantile'])for(const patch of [{symbol:'OTHER'},{currency:'EUR'},{asOf:'2026-10-01'},{bars:[{...bars.at(-1),c:source.close+1}]}]){const s=setup(name),r=await s.api.run(s.c.positions[0],{source:{...source,...patch}});assert.equal(r.state,'error');assert.equal(s.workers.length,0);}});
