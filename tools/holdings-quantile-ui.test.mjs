import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-04T16:00:00Z'),core={};vm.createContext(core);for(const p of ['lib/holdings-neural.js','lib/holdings-quantile.js'])vm.runInContext(readFileSync(p,'utf8'),core);
const bars=core.HoldingsNeural.demoBars(0,Date.parse('2026-10-02T23:59:00Z')),result=core.HoldingsQuantile.evaluate(core.HoldingsQuantile.dataset(bars,now));
function setup({demo=true,blocked=false,price=result.current.close}={}){
 const writes=new Map(),workers=[],button={dataset:{quantileTrain:'0'}},cancel={},exportButton={dataset:{quantileExport:'0'}};let resolveFetch,emitted=null;
 const sandbox={HoldingsNeural:core.HoldingsNeural,HoldingsQuantile:core.HoldingsQuantile,Date:class extends Date{static now(){return now;}},document:{querySelectorAll:q=>q==='[data-quantile-train]'?[button]:q==='[data-quantile-cancel]'?[cancel]:q==='[data-quantile-export]'?[exportButton]:[]},localStorage:{getItem:k=>writes.get(k)||null,setItem:(k,v)=>writes.set(k,v)},DailySeries:{date:t=>new Date(t).toISOString().slice(0,10),read:()=>({bars,asOf:'2026-10-02',currency:'USD',timezone:'America/New_York'})},D:{fetchStock:()=>new Promise(r=>resolveFetch=r)},HoldingsNeuralUI:{busy:()=>blocked,refresh(){},exportReport:r=>emitted=r},setTimeout:()=>1,clearTimeout(){},Worker:class{constructor(){workers.push(this);}terminate(){this.terminated=true;}postMessage(payload){this.payload=payload;}}};
 vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/quantile.js','utf8'),sandbox);
 const context=scope=>({scope,demo,positions:[{ticker:'TEST_US_EQ',quantity:999,apiKey:'SECRET'}],symbol:()=> 'TEST',model:()=>({currency:'USD',asOf:'2026-10-02',price})}),ui=sandbox.HoldingsQuantileUI;
 const c=context('a');ui.setContext(c);ui.bind();return {ui,button,cancel,exportButton,workers,writes,context,sandbox,resolve:()=>resolveFetch([]),complete:()=>{const w=workers.at(-1);w.onmessage({data:{id:w.payload.id,result}});},emitted:()=>emitted,c};
}
test('worker gets public bars and request identity, without broker fields',()=>{
 const s=setup();s.button.onclick();assert.equal(s.workers.length,1);assert.deepEqual(Object.keys(s.workers[0].payload).sort(),['bars','id','now']);assert.ok(!/SECRET|apiKey|quantity/.test(JSON.stringify(s.workers[0].payload)));assert.equal(s.ui.busy(),true);
});
test('demo results stay in memory and can be exported only while current',()=>{
 const s=setup();s.button.onclick();s.complete();assert.equal(s.ui.busy(),false);assert.equal(s.writes.size,0);const p=s.c.positions[0];assert.equal(s.ui.inspect(p).usable,true);s.exportButton.onclick();assert.equal(s.emitted().result.version,'holdings-quantile-v1');
 s.sandbox.Date.now=()=>now+1800001;assert.equal(s.ui.inspect(p).usable,false);
});
test('account, symbol, currency, EOD, price and position removal cancel pending work',()=>{
 for(const change of ['account','symbol','currency','eod','removed']){const s=setup();s.button.onclick();const c=s.context('a');if(change==='account')c.scope='b';if(change==='symbol')c.symbol=()=> 'OTHER';if(change==='currency')c.model=()=>({currency:'EUR',asOf:'2026-10-02'});if(change==='eod')c.model=()=>({currency:'USD',asOf:'2026-10-01'});if(change==='removed')c.positions=[];s.ui.setContext(c);assert.equal(s.workers[0].terminated,true,change);s.complete();assert.equal(s.writes.size,0);assert.equal(s.ui.busy(),false);}
});
test('cancelled fetch cannot spawn a worker after account context changed',async()=>{
 const s=setup({demo:false});s.button.onclick();s.ui.setContext(s.context('b'));s.resolve();await new Promise(setImmediate);assert.equal(s.workers.length,0);assert.equal(s.writes.size,0);
});
test('real results persist by account and reject changed EOD close',async()=>{
 const s=setup({demo:false});s.button.onclick();s.resolve();await new Promise(setImmediate);s.complete();assert.equal(s.writes.size,1);assert.equal(s.ui.inspect(s.c.positions[0]).usable,true);
 const c=s.context('a');c.model=()=>({currency:'USD',asOf:'2026-10-02',price:result.current.close+1});s.ui.setContext(c);assert.equal(s.ui.inspect(c.positions[0]).usable,false);
});
test('other active models block quantile training',()=>{const s=setup({blocked:true});s.button.onclick();assert.equal(s.workers.length,0);});
test('mismatched worker request or source timestamp never saves a result',()=>{
 const s=setup();s.button.onclick();const w=s.workers[0];w.onmessage({data:{id:w.payload.id+1,result}});assert.equal(s.ui.busy(),true);
 const bad=JSON.parse(JSON.stringify(result));bad.current.t++;w.onmessage({data:{id:w.payload.id,result:bad}});assert.equal(s.ui.inspect(s.c.positions[0]).usable,false);assert.equal(s.writes.size,0);
});
test('chart describes only terminal close and escapes user-supplied currency text',()=>{
 const s=setup(),html=s.ui.chart(result.current,'USD<script>');assert.match(html,/Nu este traiectoria prețului/);assert.ok(html.includes('USD&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
