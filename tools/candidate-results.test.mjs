import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const now=Date.parse('2026-10-09T09:00:00Z');
function bars(symbol,{stale=false,reversal=false}={}){
 const stamps=[];for(let t=Date.parse('2026-10-08T14:00:00Z');stamps.length<240;t-=86400000)if(![0,6].includes(new Date(t).getUTCDay()))stamps.unshift(t);
 const out=stamps.map((t,i)=>{const c=reversal?(i<180?155+i*.02:100+(i-180)*.15):100+i*.1;return {t,o:c-.1,h:c+.8,l:c-.8,c,v:i===239?1800000:1000000};});if(stale)out.pop();
 out.meta={symbol,currency:'USD',timezone:'America/New_York',regularEnd:Date.parse('2026-10-09T20:00:00Z')};return out;
}
function setup({governor='TRADE',sectors=null,failed=[],stale=[],quota=false,search='',reversal=false}={}){
 const nodes={},store=new Map(),messages=[],reports=[],calls=[],events={};let watch=['TEST'],risk=governor;
 const node=id=>nodes[id]||(nodes[id]={value:'',checked:false,innerHTML:'',textContent:'',disabled:false,hidden:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},scrollIntoView(){}});
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const ctx={Date:Clock,Intl,console,URLSearchParams,location:{search,origin:'https://example.test'},document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){},hidden:false},localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){if(quota)throw Error('quota');store.set(k,v);}},setTimeout:()=>1,clearTimeout(){},addEventListener:(n,fn)=>events[n]=fn,
  D:{fetchStock:async(sym,opts)=>{calls.push({sym,opts});if(failed.includes(sym))throw Error('Source <unavailable>');return bars(sym,{stale:stale.includes(sym),reversal:reversal&&opts.range==='1y'});}},
  MEB:{computeEarlyBird:()=>({isConfirmed:true,signals:{higherLow:true,stabilized:true,rsiRising:true}})},WL:{get:()=>watch},
  GV:{status:()=>({verdict:risk,reasons:risk==='HALTED'?['Limita de risc este atinsă.']:[]})},
  TTDecisionPanel:{set:r=>reports.push(r)},TTEntryAuto:{observe:c=>messages.push(c)},
  EL:{sectorOf:(sym,map)=>map?.[sym]||(sectors?'Necunoscut':'Technology'),loadSectorMap:()=>({}),enrichSectorsYahoo:sectors},matchMedia:()=>({matches:false})};
 ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);
 for(const f of ['lib/indicators.js','lib/daily-series.js','lib/decision-verdict.js','lib/candidate-plan-handoff.js'])vm.runInContext(readFileSync(f,'utf8'),ctx);
 const source=readFileSync('candidate-engine/engine.js','utf8');vm.runInContext(source.slice(0,source.lastIndexOf('  validateDeps(); bind();'))+'bind();window.hooks={state,scan,render,loadCache,currentItems,coverage,renderDetail};})();',ctx);
 node('universe').value='watchlist';return {ctx,node,store,reports,messages,calls,setWatch:x=>{watch=x;},setRisk:x=>{risk=x;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('market results finish and render even if optional sector lookups never resolve',async()=>{
 const f=setup({sectors:()=>new Promise(()=>{})});await f.ctx.hooks.scan();const s=f.ctx.hooks.state;
 assert.equal(s.scanning,false);assert.equal(s.verified,1);assert.equal(s.momentum.length,1);assert.match(f.node('rows').innerHTML,/TEST/);assert.match(f.node('scanDetailsBody').innerHTML,/completare în fundal/);assert.equal(f.node('scanBtn').disabled,false);assert.equal(f.messages.length,1);
});
test('Governor HALTED keeps genuine market candidates visible and disables the plan at every entry point',async()=>{
 const f=setup({governor:'HALTED'});await f.ctx.hooks.scan();const x=f.ctx.hooks.state.momentum[0];assert.ok(x);assert.equal(x.eligible,true);assert.equal(x.actionable,false);assert.equal(x.state,'BLOCKED');assert.equal(f.node('setupBtn').disabled,true);assert.equal(f.ctx.CandidatePlanHandoff.read(x).ok,false);assert.equal(f.ctx.TTDecisionVerdict.build({purpose:'entry',candidate:x,risk:f.ctx.GV.status()},now).canPlan,false);f.node('setupBtn').onclick();assert.match(f.node('alert').textContent,/Planul este blocat/);assert.match(f.node('scanDetailsBody').innerHTML,/Limita de risc/);
});
test('technical reversals remain observable under a risk halt without creating a trade permission',async()=>{
 const f=setup({governor:'HALTED',reversal:true});await f.ctx.hooks.scan();const x=f.ctx.hooks.state.reversal[0];assert.ok(x);assert.equal(x.eligible,true);assert.equal(x.actionable,false);assert.equal(x.state,'BLOCKED');assert.equal(f.ctx.CandidatePlanHandoff.read(x).ok,false);
});
test('missing or unknown Governor stays blocked rather than permitting a market plan',async()=>{
 const f=setup({governor:'UNKNOWN'});await f.ctx.hooks.scan();assert.equal(f.ctx.hooks.state.momentum.length,0);assert.equal(f.ctx.hooks.state.analyses[0].eligible,false);assert.equal(f.ctx.hooks.state.analyses[0].actionable,false);assert.equal(f.node('setupBtn').disabled,true);
});
test('live Governor changes revoke an existing selection before plan handoff',async()=>{
 const f=setup();await f.ctx.hooks.scan();const x=f.ctx.hooks.state.momentum[0];f.setRisk('HALTED');f.ctx.hooks.renderDetail(x);assert.equal(f.node('setupBtn').disabled,true);assert.equal(f.node('dGovernor').textContent,'Governor: HALTED');f.node('setupBtn').onclick();assert.match(f.node('alert').textContent,/Planul este blocat/);
});
test('the confirmation filter explains an empty list and reset reveals monitoring candidates',async()=>{
 const f=setup({governor:'HALTED'});await f.ctx.hooks.scan();f.node('onlyActionable').checked=true;f.ctx.hooks.render();assert.match(f.node('rows').innerHTML,/doar confirmate/);assert.equal(f.ctx.hooks.currentItems().length,0);f.node('resetFilters').onclick();assert.equal(f.node('onlyActionable').checked,false);assert.equal(f.ctx.hooks.currentItems().length,1);
});
test('exact ticker lookup uses the analyzed mode even if it did not enter the top rankings',async()=>{
 const f=setup();await f.ctx.hooks.scan();f.ctx.hooks.state.mode='reversal';f.node('search').value='TEST';f.ctx.hooks.render();assert.equal(f.ctx.hooks.currentItems()[0].mode,'reversal');assert.equal(f.ctx.hooks.state.selected.mode,'reversal');assert.match(f.node('rows').innerHTML,/data-mode="reversal"/);f.node('search').value='<absent>';f.ctx.hooks.render();assert.match(f.node('rows').innerHTML,/&lt;absent&gt;/);assert.doesNotMatch(f.node('rows').innerHTML,/<absent>/);
});
test('late sector replies from a previous scan cannot replace the current universe results',async()=>{
 const waiters=[];const f=setup({sectors:()=>new Promise(resolve=>waiters.push(resolve))});await f.ctx.hooks.scan();f.setWatch(['OTHER']);await f.ctx.hooks.scan();const original=f.node('rows').innerHTML;waiters[0]({TEST:'Old sector'});await flush();assert.equal(f.node('rows').innerHTML,original);assert.equal(f.ctx.hooks.state.momentum[0].symbol,'OTHER');waiters[1]({OTHER:'New sector'});await flush();assert.equal(f.ctx.hooks.state.momentum[0].sector,'New sector');assert.match(f.node('rows').innerHTML,/New sector/);
});
test('failed series and benchmarks expose their actual reasons without claiming verified prices',async()=>{
 const f=setup({failed:['TEST','SPY','^STOXX50E']});await f.ctx.hooks.scan();assert.equal(f.ctx.hooks.state.verified,0);assert.equal(f.ctx.hooks.state.momentum.length,0);assert.equal(f.node('ctxFreshness').textContent,'Nicio serie verificată');assert.equal(f.node('scanState').textContent,'DATE INDISPONIBILE');assert.match(f.node('scanDetailsBody').innerHTML,/SPY/);assert.match(f.node('scanDetailsBody').innerHTML,/Source &lt;unavailable&gt;/);assert.match(f.node('rows').innerHTML,/Nicio serie verificată/);
});
test('stale price histories never become candidates simply because the scan is new',async()=>{
 const f=setup({stale:['TEST']});await f.ctx.hooks.scan();assert.equal(f.ctx.hooks.state.momentum.length,0);assert.equal(f.ctx.hooks.state.verified,0);assert.match(f.node('scanDetailsBody').innerHTML,/DATE STALE/);
});
test('empty watchlists explain how to select a nonempty universe',async()=>{
 const f=setup();f.setWatch([]);await f.ctx.hooks.scan();assert.equal(f.ctx.hooks.state.scanned,0);assert.match(f.node('alert').textContent,/Watchlist-ul selectat este gol/);assert.equal(f.node('scanBtn').disabled,false);
});
test('cache scope prevents another watchlist from being shown as the selected universe',async()=>{
 const f=setup();await f.ctx.hooks.scan();const c=JSON.parse(f.store.get('ce_results_v2'));assert.equal(c.verifiedCount,1);assert.equal(c.analyses.length,0);f.ctx.hooks.state.momentum=[];f.ctx.hooks.loadCache();assert.equal(f.ctx.hooks.state.momentum.length,1);f.setWatch(['OTHER']);f.ctx.hooks.state.momentum=[];f.ctx.hooks.loadCache();assert.equal(f.ctx.hooks.state.momentum.length,0);
});
test('an unsavable scan keeps current results and passes the same top candidates to existing evidence capture',async()=>{
 const f=setup({quota:true});await f.ctx.hooks.scan();assert.equal(f.ctx.hooks.state.momentum.length,1);assert.equal(f.messages.length,1);assert.equal(f.messages[0].momentum[0].symbol,'TEST');assert.equal(f.messages[0].analyses.length,0);assert.match(f.node('alert').textContent,/Copia locală/);
});
test('a watchlist edited during a scan cannot relabel its cached universe',async()=>{
 const f=setup(),fetch=f.ctx.D.fetchStock;let resolve;f.ctx.D.fetchStock=(sym,opts)=>sym==='TEST'?new Promise(r=>{resolve=r;}):fetch(sym,opts);
 const scanning=f.ctx.hooks.scan();await flush();f.setWatch(['OTHER']);resolve(bars('TEST'));await scanning;
 const c=JSON.parse(f.store.get('ce_results_v2'));assert.deepEqual(JSON.parse(c.universeKey),['watchlist',['TEST']]);f.ctx.hooks.state.momentum=[];f.ctx.hooks.loadCache();assert.equal(f.ctx.hooks.state.momentum.length,0);
});
