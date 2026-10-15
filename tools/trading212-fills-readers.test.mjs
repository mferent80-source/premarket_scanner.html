import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const KEY='tt_trading212_fills_v1',SNAPSHOT='tt_trading212_portfolio_v1';
const NOW=Date.parse('2026-10-14T18:00:00Z'),at=new Date(NOW).toISOString();
function data(id,realized){return {accounts:{current:{environment:'live',complete:true,fetchedAt:at,items:[{id,ticker:'REAL_US_EQ',side:'SELL',type:'TRADE',quantity:2,price:100,priceCurrency:'USD',currency:'EUR',realized,date:'2026-10-13T15:00:00Z',taxes:[]}]}}};}
function boot({state='ready',dom=false}={}){
 const authoritative=data('authoritative',7),stale=data('stale-localStorage',999),reads=[],nodes=new Map(),listeners=new Map();let failure=state==='ready'?null:state,resolveReady;
 const readyPromise=new Promise(resolve=>{resolveReady=resolve;});if(!failure)resolveReady();
 const memory=new Map([[KEY,JSON.stringify(stale)],[SNAPSHOT,JSON.stringify({current:{environment:'live',active:true,fetchedAt:at,summary:{currency:'EUR',totalValue:1000},positions:[{ticker:'REAL_US_EQ',quantity:1,value:100,currency:'EUR'}]}})]]);
 const localStorage={getItem(key){reads.push(key);return memory.get(key)||null;},setItem(key,value){memory.set(key,value);}};
 const getNode=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,disabled:false,querySelectorAll:()=>[],elements:{instrument:{value:'20'},sector:{value:'35'}}});return nodes.get(id);};
 const c={localStorage,Date,URL,setInterval(){},addEventListener(type,callback){const list=listeners.get(type)||[];list.push(callback);listeners.set(type,list);},T212FillsStore:{peek(){if(failure)throw Object.assign(Error('Store is unavailable'),{code:failure});return {raw:JSON.stringify(authoritative),data:structuredClone(authoritative),state:'ready',revision:1};},ready:()=>readyPromise}};
 if(dom)c.document={getElementById:getNode,querySelector:selector=>selector.startsWith('[data-timeline=')?getNode('timeline'):null,querySelectorAll:()=>[]};
 vm.createContext(c);
 const load=path=>vm.runInContext(readFileSync(path,'utf8'),c,{filename:path});
 function hydrate(){failure=null;resolveReady();for(const callback of listeners.get('storage')||[])callback({key:KEY});}
 return {c,load,hydrate,nodes,getNode,reads,memory,authoritative,setFailure:code=>{failure=code;}};
}
test('performance and Coach use authoritative fills instead of stale localStorage',()=>{
 const b=boot();for(const path of ['lib/trading212-snapshot.js','lib/trading212-performance.js','lib/trading212-context.js'])b.load(path);
 const report=b.c.T212Performance.read({now:NOW});assert.equal(report.total,7);assert.equal(report.rows[0].id,'authoritative');assert.equal(b.c.T212C.insights()[0].currencies.EUR,7);assert.ok(!b.reads.includes(KEY));
 const exportedStorage={getItem:key=>b.memory.get(key)||null};assert.equal(b.c.T212Performance.read({storage:exportedStorage,now:NOW}).total,999);
});
test('performance blocks unhydrated and unreadable stores and resumes from actual fills after ready',async()=>{
 const b=boot({state:'fills_loading'});b.load('lib/trading212-snapshot.js');b.load('lib/trading212-performance.js');
 let report=b.c.T212Performance.read({now:NOW});assert.equal(report.state,'pending');assert.equal(report.total,null);assert.match(report.reason,/se încarcă/);
 b.setFailure('fills_unreadable');report=b.c.T212Performance.read({now:NOW});assert.equal(report.state,'error');assert.equal(report.total,null);assert.match(report.reason,/păstrate/);
 const ready=b.c.T212FillsStore.ready();b.hydrate();await ready;assert.equal(b.c.T212Performance.read({now:NOW}).total,7);assert.ok(!b.reads.includes(KEY));
});
test('Coach distinguishes unavailable history and refreshes its real results on hydration storage event',async()=>{
 const b=boot({state:'fills_loading',dom:true});b.load('lib/trading212-snapshot.js');b.load('lib/trading212-context.js');
 assert.equal(b.c.T212C.insights().state,'pending');assert.match(b.getNode('t212Coach').innerHTML,/se încarcă/);assert.doesNotMatch(b.getNode('t212Coach').innerHTML,/Conectează Trading 212|999/);
 b.setFailure('fills_unreadable');b.c.T212C.renderCoach();assert.equal(b.c.T212C.insights().state,'error');assert.match(b.getNode('t212Coach').innerHTML,/nu poate fi citit/);
 const ready=b.c.T212FillsStore.ready();b.hydrate();await ready;assert.match(b.getNode('t212Coach').innerHTML,/1 execuții importate/);assert.match(b.getNode('t212Coach').innerHTML,/7 EUR/);assert.ok(!b.reads.includes(KEY));
});
function workContext(){return {demo:false,scope:'current',positions:[{ticker:'REAL_US_EQ',quantity:1,currency:'EUR',value:100}],snapshot:{environment:'live',fetchedAt:at,summary:{currency:'EUR',totalValue:1000}},model:()=>null,note:()=>({}),events:()=>null,history:()=>[],symbol:p=>p.ticker.replace(/_US_EQ$/,'')};}
function workbench(b){b.c.PortfolioScenariosUI={render(){}};b.c.HoldingsAlerts={reconcile:()=>[],load:()=>[],save(){}};b.c.HoldingsWorkspace={attention:()=>[],calendar:()=>[],timeline:(_ticker,fills)=>fills.map(fill=>({date:fill.date,type:'Execuție broker',text:fill.id}))};b.load('holdings/workbench.js');return b.c.HoldingsWorkbench;}
test('portfolio sales and ticker timeline use the hydrated authoritative fill record',()=>{
 const b=boot({dom:true}),w=workbench(b);w.render(workContext());w.bind();assert.match(b.getNode('salesResults').innerHTML,/REAL_US_EQ/);assert.match(b.getNode('timeline').innerHTML,/authoritative/);assert.doesNotMatch(b.getNode('timeline').innerHTML,/stale-localStorage/);assert.ok(!b.reads.includes(KEY));
});
test('portfolio sales cannot turn loading or unreadable history into an empty account',async()=>{
 const b=boot({state:'fills_loading',dom:true}),w=workbench(b);w.render({...workContext(),positions:[]});assert.equal(b.getNode('workbench').hidden,false);assert.equal(b.getNode('reviewSales').disabled,true);assert.match(b.getNode('salesResults').innerHTML,/se încarcă/);assert.doesNotMatch(b.getNode('salesResults').innerHTML,/Nicio execuție/);
 b.setFailure('fills_unreadable');w.render(workContext());w.bind();assert.match(b.getNode('salesResults').innerHTML,/nu poate fi citit/);assert.match(b.getNode('timeline').innerHTML,/nu poate fi citit/);
 const ready=b.c.T212FillsStore.ready();b.hydrate();await ready;w.render(workContext());w.bind();assert.equal(b.getNode('reviewSales').disabled,false);assert.match(b.getNode('salesStatus').textContent,/1 execuții SELL/);assert.match(b.getNode('timeline').innerHTML,/authoritative/);assert.ok(!b.reads.includes(KEY));
});
test('import health reads authoritative history and preserves pending and error explanations',async()=>{
 const b=boot({state:'fills_loading',dom:true});b.load('holdings/management.js');const c=workContext();b.c.HoldingsManagement.render(c);assert.match(b.getNode('holdingManagement').innerHTML,/Execuții: Istoricul execuțiilor se încarcă/);
 b.setFailure('fills_unreadable');b.c.HoldingsManagement.render(c);assert.match(b.getNode('holdingManagement').innerHTML,/Execuții: Istoricul execuțiilor nu poate fi citit/);
 const ready=b.c.T212FillsStore.ready();b.hydrate();await ready;b.c.HoldingsManagement.render(c);assert.match(b.getNode('holdingManagement').innerHTML,/Execuții: 1 · paginile disponibile parcurse/);assert.ok(!b.reads.includes(KEY));
});
