// 18.10.2026 (el: „fă audit la Premarket Scanner și fă să pornească automat și el căutarea în app”).
// Proba pe aplicația publicată: scanarea pornea singură, dar lista scria „Apasă «Scanează acum»” cât timp rula, eticheta rămânea
// „actualizat acum” oricât de veche era copia, iar la revenirea în pagină (cadru parcat) nu rescana până la următorul ceas de 5 minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const now=Date.parse('2026-10-09T09:00:00Z');
function bars(symbol){
 const stamps=[];for(let t=Date.parse('2026-10-08T14:00:00Z');stamps.length<240;t-=86400000)if(![0,6].includes(new Date(t).getUTCDay()))stamps.unshift(t);
 const out=stamps.map((t,i)=>{const c=100+i*.1;return {t,o:c-.1,h:c+.8,l:c-.8,c,v:i===239?1800000:1000000};});
 out.meta={symbol,currency:'USD',timezone:'America/New_York',regularEnd:Date.parse('2026-10-09T20:00:00Z')};return out;
}
function setup({search='',hold=false,failed=[],verdict='TRADE',watch=['TEST']}={}){
 const nodes={},store=new Map(),events={},calls=[],timers=[];let release=null;const gate=hold?new Promise(r=>{release=r;}):null;
 const node=id=>nodes[id]||(nodes[id]={value:'',checked:false,innerHTML:'',textContent:'',disabled:false,hidden:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},scrollIntoView(){}});
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const ctx={Date:Clock,Intl,console,URLSearchParams,location:{search,origin:'https://example.test'},document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){},hidden:false},localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){store.set(k,v);}},setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout(){},addEventListener:(n,fn)=>events[n]=fn,
  D:{fetchStock:async(sym)=>{calls.push(sym);if(gate)await gate;if(failed.includes(sym))throw Error('indisponibil');return bars(sym);}},
  MEB:{computeEarlyBird:()=>({isConfirmed:true,signals:{higherLow:true,stabilized:true,rsiRising:true}})},WL:{get:()=>watch},
  GV:{status:()=>({verdict,reasons:[]})},TTDecisionPanel:{set(){}},TTEntryAuto:{observe(){}},
  EL:{sectorOf:()=>'Technology',loadSectorMap:()=>({})},matchMedia:()=>({matches:false})};
 ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);
 for(const f of ['lib/indicators.js','lib/daily-series.js','lib/decision-verdict.js','lib/candidate-plan-handoff.js'])vm.runInContext(readFileSync(f,'utf8'),ctx);
 const source=readFileSync('candidate-engine/engine.js','utf8');vm.runInContext(source.slice(0,source.lastIndexOf('  validateDeps(); bind();'))+'bind();window.hooks={state,scan,render,loadCache,currentItems,coverage,renderDetail};})();',ctx);
 node('universe').value='watchlist';return {ctx,node,events,calls,timers,release:()=>release&&release()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('while the automatic scan runs, the list says it is scanning — never “press Scan now”',async()=>{
 const f=setup({hold:true});const run=f.ctx.hooks.scan();await flush();
 assert.equal(f.ctx.hooks.state.scanning,true);assert.match(f.node('rows').innerHTML,/Scanarea este în curs/);assert.doesNotMatch(f.node('rows').innerHTML,/Apasă/);
 f.release();await run;assert.equal(f.ctx.hooks.state.scanning,false);assert.match(f.node('rows').innerHTML,/TEST/);
});
test('the start page text does not ask for a button press: the scan starts by itself',()=>{
 const html=readFileSync('candidate-engine/index.html','utf8');assert.doesNotMatch(html,/Apasă „Scanează acum”/);assert.match(html,/pornește singură/);
});
test('returning to a parked page rescans when results are older than 5 minutes, not only when there are none',async()=>{
 const f=setup();await f.ctx.hooks.scan();const n=f.calls.length;const msg=d=>f.events.message({origin:'https://example.test',data:d});
 msg({ttShellVisible:false});f.ctx.hooks.state.updatedAt=now-2*60000;msg({ttShellVisible:true});await flush();assert.equal(f.calls.length,n,'copie de 2 minute: fără rescanare');
 msg({ttShellVisible:false});f.ctx.hooks.state.updatedAt=now-6*60000;msg({ttShellVisible:true});await flush();assert.ok(f.calls.length>n,'copie de 6 minute: rescanează la revenire');
});
test('the age label follows the real age of the results instead of staying “updated now”',async()=>{
 const f=setup();await f.ctx.hooks.scan();assert.match(f.node('updatedAt').textContent,/acum/);
 f.ctx.hooks.state.updatedAt=now-12*60000;f.ctx.hooks.render();assert.match(f.node('updatedAt').textContent,/12 min/);assert.match(f.node('ctxFreshness').textContent,/12 min/);
});
test('background runs (Piață ?fundal=1, the app shell ?background=1) scan once and do not re-arm the 5-minute timer',async()=>{
 for(const search of ['?fundal=1','?background=1']){const f=setup({search});await f.ctx.hooks.scan();assert.ok(!f.timers.includes(5*60*1000),search+' nu reprogramează');}
 const f=setup();await f.ctx.hooks.scan();assert.ok(f.timers.includes(5*60*1000),'pagina vizibilă își păstrează scanarea la 5 minute');
});
// „Rezolvă toate” (18.10): cele trei 🔵 din audit care țin de pagină.
test('Europe is compared with STOXX 600 (^STOXX, the same index as the Reguli V1 benchmark); reserves IVV and ^STOXX50E are named when used',async()=>{
 const f=setup({watch:['SAP.DE','TEST']});await f.ctx.hooks.scan();const b=f.ctx.hooks.state.benchmarks;
 assert.equal(b.map(x=>x.region+':'+x.symbol).join(','),'US:SPY,EU:^STOXX');assert.ok(f.calls.includes('^STOXX'));assert.ok(!f.calls.includes('^STOXX50E'),'rezerva nu se cere când primul răspunde');
 const g=setup({failed:['SPY','^STOXX']});await g.ctx.hooks.scan();const c=g.ctx.hooks.state.benchmarks;
 assert.equal(c.map(x=>x.region+':'+x.symbol).join(','),'US:IVV,EU:^STOXX50E');assert.match(c[0].asOf,/rezervă; SPY: indisponibil/);
 assert.equal(g.ctx.hooks.state.analyses.find(x=>x.mode==='momentum').benchmarkSymbol,'IVV','candidatul poartă reperul folosit');
});
test('an unreadable Governor explains the empty ranking instead of saying the stocks fail the strategy',async()=>{
 const f=setup({verdict:'INDISPONIBIL'});await f.ctx.hooks.scan();assert.equal(f.ctx.hooks.state.momentum.length,0);
 assert.match(f.node('rows').innerHTML,/Governor nu se poate citi/);assert.doesNotMatch(f.node('rows').innerHTML,/nu trec criteriile/);
});
