import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const daily=fs.readFileSync('lib/daily-series.js','utf8');
const handoff=fs.readFileSync('lib/candidate-plan-handoff.js','utf8');
const engine=fs.readFileSync('candidate-engine/engine.js','utf8');
const deskHtml=fs.readFileSync('desk/index.html','utf8');
const deskScript=[...deskHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('var CANDIDATE_FRESH_MS'))[2];
const shellScript=[...fs.readFileSync('app/index.html','utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('var GROUPS='))[2];
const NOW=Date.parse('2026-10-05T13:00:00Z');
const candidate={symbol:'QCOM',mode:'momentum',currency:'USD',region:'US',actionable:true,state:'ARMED',ts:NOW,sourceDate:'2026-10-02',sourceTimezone:'America/New_York',sourceCloseMinutes:960,score:80,entryLow:100,entryHigh:102,stop:95,target:116,price:101,reason:'EOD verificat',sector:'Information Technology'};

function boot({search='?symbol=QCOM&mode=momentum&ticket=1&handoff=1',hash='',cache=null,quota=true,governor='TRADE',page='desk',standalone=false}={}){
  let clock=NOW,writes=0;const nodes={},events={},timeouts=[],intervals=[],messages=[];
  class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  function node(id){return nodes[id]||(nodes[id]={value:'',textContent:'',innerHTML:'',open:false,hidden:false,dataset:{},style:{setProperty(){}},classList:{toggle(){},remove(){},add(){}},querySelectorAll:()=>[],contains:()=>false,focus(){},blur(){},showModal(){this.open=true;this.opens=(this.opens||0)+1;},close(){this.open=false;}});}
  const parent={postMessage:(data,origin)=>messages.push({data,origin})};
  const localStorage={getItem:key=>key.startsWith('ce_results_')&&cache?JSON.stringify(cache):null,setItem(){writes++;if(quota)throw new DOMException('quota','QuotaExceededError');}};
  const ctx={Date:Clock,URLSearchParams,URL,Intl,DOMException,console,document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){},activeElement:null,hidden:false,documentElement:{dataset:{appVersion:'test'}}},location:{origin:'https://example.test',href:'https://example.test/project/'+page+'/',search,hash},localStorage,parent,addEventListener:(n,fn)=>events[n]=fn,setTimeout:(fn,ms)=>{timeouts.push({fn,ms});return timeouts.length;},clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});},GV:{status:()=>({verdict:governor,reasons:[],openCount:0,budgetLeftUsd:200,maxLossWeekUsd:300,weekPnl:0,cfg:{maxOpenPositions:4}})},TTBreadth:{load:async()=>null}};
  ctx.window=ctx;if(standalone)ctx.parent=ctx;
  vm.createContext(ctx);vm.runInContext(daily+handoff,ctx);
  if(page==='desk'){
    vm.runInContext(fs.readFileSync('lib/trade-plans.js','utf8'),ctx);
    vm.runInContext(deskScript,ctx);
  }else if(page==='scanner'){
    vm.runInContext(engine.slice(0,engine.lastIndexOf('  validateDeps(); bind();'))+'  bind();window.scannerState=state;})();',ctx);
    ctx.scannerState.selected={...candidate};
  }else if(page==='app'){
    for(const id of ['frame','brokerFrame'])node(id).contentWindow={postMessage:(data,origin)=>messages.push({data,origin,frame:id})};
    vm.runInContext(shellScript,ctx);
  }
  return {ctx,nodes,events,timeouts,intervals,messages,get writes(){return writes;},setCache(value){cache=value;},advance(ms){clock+=ms;},send(data,origin=ctx.location.origin,source=ctx.parent){events.message({data,origin,source});}};
}
function cacheFor(x,updatedAt=x.ts){return {momentum:[x],reversal:[],analyses:[],updatedAt};}

test('scanner button carries the current selected analysis despite full local storage',()=>{
  const b=boot({page:'scanner'});b.nodes.setupBtn.onclick();
  assert.equal(b.writes,0);assert.equal(b.messages.length,1);
  assert.equal(b.messages[0].data.ttOpenModule,'desk/');
  assert.match(b.messages[0].data.ttQuery,/symbol=QCOM&mode=momentum&ticket=1&handoff=1/);
  assert.equal(b.messages[0].data.ttPlanCandidate.entryHigh,102);
  const d=boot();d.send(b.messages[0].data);
  assert.equal(d.nodes.ticketWrap.open,true);assert.equal(d.nodes.ticketSymbol.textContent,'QCOM');
  assert.equal(d.nodes.ticketShares.textContent,'7 unități');assert.equal(d.nodes.ticketSave.disabled,false);assert.equal(d.writes,0);
});
test('standalone scanner uses the same Desk with a bounded public snapshot',()=>{
  const b=boot({page:'scanner',standalone:true});b.ctx.scannerState.selected.apiKey='secret';b.ctx.scannerState.selected.governor={verdict:'TRADE',account:'private'};b.nodes.setupBtn.onclick();
  const url=new URL(b.ctx.location.href,b.ctx.location.origin+'/project/candidate-engine/');
  assert.equal(url.pathname,'/project/desk/');assert.doesNotMatch(url.hash,/secret|private|governor|apiKey/);
  const d=boot({search:url.search,hash:url.hash});assert.equal(d.nodes.ticketSymbol.textContent,'QCOM');assert.equal(d.nodes.ticketWrap.open,true);
});
test('stale selected data produces an explicit scanner error without navigation',()=>{
  const b=boot({page:'scanner'});b.ctx.scannerState.selected.ts=NOW-1800001;b.nodes.setupBtn.onclick();
  assert.equal(b.messages.length,0);assert.match(b.nodes.alert.textContent,/expirat/);assert.equal(b.nodes.alert.hidden,false);
});
test('Desk waits for the selected snapshot instead of opening an older cached plan',()=>{
  const b=boot({cache:cacheFor({...candidate,entryHigh:101,ts:NOW-1000})});assert.equal(b.nodes.ticketWrap.open,false);assert.equal(b.nodes.focusSymbol.textContent,'QCOM');
  b.send({ttPlanCandidate:candidate});assert.equal(b.nodes.ticketEntry.textContent,'102,00');assert.equal(b.nodes.ticketWrap.opens,1);
  b.send({ttPlanCandidate:candidate});assert.equal(b.nodes.ticketWrap.opens,1);
});
test('wrong origin and sender cannot supply a plan snapshot',()=>{
  const b=boot();b.send({ttPlanCandidate:candidate},'https://attacker.test');b.send({ttPlanCandidate:candidate},b.ctx.location.origin,{});
  assert.equal(b.nodes.ticketWrap.open,false);
});
test('mismatched symbol and mode do not fall back to other candidates',()=>{
  for(const other of [{...candidate,symbol:'AAPL'},{...candidate,mode:'reversal'}]){
    const b=boot({cache:cacheFor({...candidate,symbol:'NVDA'})});b.send({ttPlanCandidate:other});
    assert.equal(b.nodes.ticketWrap.open,true);assert.equal(b.nodes.ticketSymbol.textContent,'—');assert.equal(b.nodes.ticketSave.disabled,true);assert.match(b.nodes.ticketVerdict.textContent,/nu corespunde/);
  }
});
test('expiry, future timestamps, stale EOD and blocked candidates cannot enable saving',()=>{
  for(const patch of [{ts:NOW-1800001},{ts:NOW+60001},{sourceDate:'2026-10-01'},{actionable:false},{state:'BLOCKED'},{stop:110}]){
    const b=boot();b.send({ttPlanCandidate:{...candidate,...patch}});assert.equal(b.nodes.ticketSave.disabled,true);assert.equal(b.nodes.ticketSymbol.textContent,'—');
  }
});
test('Governor is recomputed in Desk and currency checks still block USD sizing',()=>{
  const halted=boot({governor:'HALTED'});halted.send({ttPlanCandidate:{...candidate,governor:{verdict:'TRADE'}}});assert.equal(halted.nodes.ticketSave.disabled,true);assert.match(halted.nodes.ticketVerdict.textContent,/Governor/);
  const eur=boot();eur.send({ttPlanCandidate:{...candidate,currency:'EUR',region:'EU'}});assert.equal(eur.nodes.ticketWrap.open,true);assert.equal(eur.nodes.ticketSave.disabled,true);assert.match(eur.nodes.ticketVerdict.textContent,/USD/);
});
test('in-memory selection survives a storage reload and expires on schedule',()=>{
  const b=boot();b.send({ttPlanCandidate:candidate});b.setCache(cacheFor({...candidate,symbol:'AAPL'},NOW-1800001));b.events.storage({key:'ce_results_v2'});
  assert.equal(b.nodes.ticketSymbol.textContent,'QCOM');assert.equal(b.nodes.ticketSave.disabled,false);assert.doesNotMatch(b.nodes.signalRows.innerHTML,/AAPL/);
  b.advance(1800001);b.intervals.find(x=>x.ms===30000).fn();assert.equal(b.nodes.ticketSave.disabled,true);
});
test('a missing handoff opens an explanatory ticket with saving disabled',()=>{
  const b=boot();b.timeouts.find(x=>x.ms===2000).fn();assert.equal(b.nodes.ticketWrap.open,true);assert.equal(b.nodes.ticketSave.disabled,true);assert.match(b.nodes.ticketVerdict.textContent,/nu a fost transmisă/);
});
test('legacy ticket requests with no candidate show a clear failure',()=>{
  const b=boot({search:'?symbol=QCOM&mode=momentum&ticket=1'});assert.equal(b.nodes.ticketWrap.open,true);assert.match(b.nodes.ticketVerdict.textContent,/QCOM/);assert.equal(b.nodes.ticketSave.disabled,true);
});
test('saving a calculated plan must not claim persistence when quota refuses it',async()=>{
  const b=boot();b.send({ttPlanCandidate:candidate});await b.nodes.ticketSave.onclick();assert.match(b.nodes.ticketVerdict.textContent,/SALVARE RESPINSĂ/);assert.doesNotMatch(b.nodes.ticketVerdict.textContent,/PLAN SALVAT/);
});
test('shell forwards the validated snapshot once after Desk loads',()=>{
  const b=boot({page:'app'}),sender=b.nodes.frame.contentWindow;
  b.send({ttOpenModule:'desk/',ttQuery:'symbol=QCOM&mode=momentum&ticket=1&handoff=1',ttPlanCandidate:{...candidate,apiKey:'secret'}},b.ctx.location.origin,sender);
  assert.equal(b.writes,2);assert.match(b.nodes.frame.src,/desk\/\?.*handoff=1/);
  b.nodes.brokerFrame.onload.call(b.nodes.brokerFrame);assert.equal(b.messages.length,0);
  b.send({ttPlanReady:{symbol:'QCOM',mode:'momentum'}},b.ctx.location.origin,sender);assert.equal(b.messages.length,1);assert.equal(b.messages[0].data.ttPlanCandidate.symbol,'QCOM');assert.equal(b.messages[0].data.ttPlanCandidate.apiKey,undefined);
  b.send({ttPlanReady:{symbol:'QCOM',mode:'momentum'}},b.ctx.location.origin,sender);assert.equal(b.messages.length,1);
});
test('shell rejects mismatched candidates and clears pending data on unrelated navigation',()=>{
  const b=boot({page:'app'}),sender=b.nodes.frame.contentWindow;
  const go=(symbol)=>b.send({ttOpenModule:'desk/',ttQuery:'symbol=QCOM&mode=momentum&ticket=1&handoff=1',ttPlanCandidate:{...candidate,symbol}},b.ctx.location.origin,sender);
  go('AAPL');b.send({ttPlanReady:{symbol:'QCOM',mode:'momentum'}},b.ctx.location.origin,sender);assert.equal(b.messages.length,0);
  go('QCOM');b.send({ttOpenModule:'journal/'},b.ctx.location.origin,sender);b.send({ttPlanReady:{symbol:'QCOM',mode:'momentum'}},b.ctx.location.origin,sender);assert.equal(b.messages.length,0);
});
test('malformed standalone snapshot cannot open a different symbol or enable saving',()=>{
  for(const hash of ['#plan=%7Bbad', '#plan='+encodeURIComponent('x'.repeat(5001)), '#plan='+encodeURIComponent(JSON.stringify({...candidate,symbol:'AAPL'}))]){
    const b=boot({hash});assert.equal(b.nodes.ticketSave.disabled,true);assert.equal(b.nodes.ticketSymbol.textContent,'—');assert.equal(b.nodes.ticketWrap.open,true);
  }
});
