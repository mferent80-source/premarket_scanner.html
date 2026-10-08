import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('desk/index.html','utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('var CANDIDATE_FRESH_MS'))[1];
const NOW=Date.parse('2026-10-08T04:15:00Z');
function boot({demo=true,seed={}}={}){
 const nodes={},intervals=[],events={},listeners={},memory=new Map(Object.entries(seed).map(([k,v])=>[k,JSON.stringify(v)]));
 class Clock extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}}
 function node(id,dataset={}){return nodes[id]||(nodes[id]={id,dataset,style:{setProperty(){}},classList:{toggle(){},remove(){},add(){}},setAttribute(k,v){this[k]=v;},querySelector(){return null;},querySelectorAll(){return[];},contains(){return false;},focus(){},textContent:'',innerHTML:'',value:'',open:false,hidden:false,showModal(){this.open=true;},close(){this.open=false;}});}
 const modes=['momentum','reversal'].map(m=>node('mode-'+m,{signalMode:m}));
 const tabs=['scenario','metrics','checks','ai'].map((t,i)=>node(['focusTabScenario','focusTabMetrics','focusTabChecks','focusTabAI'][i],{focusTab:t}));
 const sources=['broker','shadow'].map(source=>node('source-'+source,{performanceSource:source}));
 let rows=[],mini=[];
 function buttons(markup,type){return [...markup.matchAll(/<button[^>]*data-(?:mini-)?symbol="([^"]+)"([^>]*)>/g)].map((m,i)=>node(type+i,{symbol:m[1],miniSymbol:m[1],miniMode:m[2].match(/data-mini-mode="([^"]+)"/)?.[1]}));}
 const c={Date:Clock,URLSearchParams,Intl,console,Number,Math,Map,Array,location:{origin:'https://desk.test',search:demo?'?demo=1':'',hash:''},document:{addEventListener(){},getElementById:node,activeElement:null,hidden:false,querySelectorAll(q){if(q==='[data-signal-mode]')return modes;if(q==='[data-focus-tab]')return tabs;if(q==='[data-performance-source]')return sources;if(q==='#signalRows .row')return rows=buttons(node('signalRows').innerHTML,'row');if(q==='[data-mini-symbol]')return mini=buttons(node('miniLong').innerHTML+node('miniReversal').innerHTML,'mini');return[];}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},TTBreadth:{load:async()=>null},setInterval:(fn,ms)=>intervals.push({fn,ms}),setTimeout(){},addEventListener:(n,f)=>{events[n]=f;(listeners[n]||(listeners[n]=[])).push(f);},GV:{status:()=>({verdict:'HALTED'})}};
 c.window=c;c.parent=c;vm.createContext(c);
 for(const f of ['lib/daily-series.js','lib/candidate-plan-handoff.js','lib/trade-plans.js','lib/trade-plan-store.js','lib/decision-verdict.js','desk/insight.js','lib/trading212-snapshot.js','lib/trading212-performance.js','desk/performance.js'])vm.runInContext(readFileSync(f,'utf8'),c);
 vm.runInContext(script,c);
 return {c,nodes,tabs,modes,intervals,events,memory,sources,emit:(name,e)=>listeners[name]?.forEach(f=>f(e)),rows:()=>rows,mini:()=>mini};
}
test('Desk has no automatically mounted large verdict panel',()=>{
 assert.doesNotMatch(html,/src="[^"\n]*decision-panel\.js|href="[^"\n]*decision-panel\.css/);
 assert.match(html,/role="tabpanel"/);
});
test('selected Watch signal shows numeric volume and price obstacles and keeps plan disabled',()=>{
 const b=boot();b.rows().find(r=>r.dataset.symbol==='FICTIV-C').onclick();
 assert.equal(b.nodes.focusSymbol.textContent,'FICTIV-C');assert.equal(b.nodes.focusAction.disabled,true);
 assert.match(b.nodes.focusDetail.innerHTML,/0,65×/);assert.match(b.nodes.focusDetail.innerHTML,/3,92%/);
 assert.match(b.nodes.briefText.textContent,/0,65×/);assert.match(b.nodes.coachTitle.textContent,/FICTIV-C/);
});
test('mode switch changes all selected details and radar selection returns to the right mode',()=>{
 const b=boot();b.modes[1].onclick();assert.equal(b.nodes.focusSymbol.textContent,'FICTIV-B');assert.match(b.nodes.focusEntry.textContent,/50,00–51,00/);
 b.mini().find(r=>r.dataset.miniSymbol==='FICTIV-A').onclick();assert.equal(b.nodes.focusSymbol.textContent,'FICTIV-A');assert.match(b.nodes.signalRows.innerHTML,/FICTIV-A/);assert.equal(b.modes[0]['aria-pressed'],'true');
});
test('search filters candidates by symbol and keeps the selected analysis',()=>{
 const b=boot();b.nodes.signalSearch.value='fictiv-c';b.nodes.signalSearch.oninput();
 assert.match(b.nodes.signalRows.innerHTML,/FICTIV-C/);assert.doesNotMatch(b.nodes.signalRows.innerHTML,/FICTIV-A/);assert.equal(b.nodes.signalCount.textContent,'1/2');assert.equal(b.nodes.focusSymbol.textContent,'FICTIV-A');
 b.nodes.signalSearch.value='absent';b.nodes.signalSearch.oninput();assert.match(b.nodes.signalRows.innerHTML,/Niciun rezultat/);assert.equal(b.nodes.focusAction.disabled,false);
});
test('indicator tab and periodic refresh retain selection, tab and valid controls',()=>{
 const b=boot();b.tabs[1].onclick();assert.match(b.nodes.focusDetail.innerHTML,/EMA200/);assert.doesNotMatch(b.nodes.focusDetail.innerHTML,/id="focusWhy"/);
 b.intervals.find(i=>i.ms===30000).fn();assert.match(b.nodes.focusDetail.innerHTML,/EMA200/);assert.equal(b.tabs[1]['aria-selected'],'true');assert.equal(b.nodes.focusAction.disabled,false);
 b.rows().find(r=>r.dataset.symbol==='FICTIV-C').onclick();assert.match(b.nodes.focusDetail.innerHTML,/0,65×/);assert.equal(b.nodes.focusAction.disabled,true);
});
test('conditions retain blockers and AI explicitly reports absent compatible models',()=>{
 const b=boot();b.rows().find(r=>r.dataset.symbol==='FICTIV-C').onclick();b.tabs[2].onclick();assert.match(b.nodes.focusDetail.innerHTML,/participare sub medie/);
 b.tabs[3].onclick();assert.match(b.nodes.focusDetail.innerHTML,/Niciun raport AI compatibil pentru FICTIV-C/);assert.equal(b.nodes.focusAction.disabled,true);
});
test('keyboard navigation activates the detail tab and updates its accessible label',()=>{
 const b=boot();let prevented=false;b.tabs[0].onkeydown({key:'ArrowRight',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(b.nodes.focusDetail['aria-labelledby'],'focusTabMetrics');assert.match(b.nodes.focusDetail.innerHTML,/EMA21/);
});
test('expired sources cannot present usable confirmation or R:R',()=>{
 const b=boot(),x={symbol:'OLD',currency:'USD',entryLow:100,entryHigh:102,stop:95,target:116};
 const d=b.c.TTDeskInsight.build(x,{code:'VERIFY',canPlan:false,blockers:[{id:'source',text:'Sursă veche'}],cautions:[],evidence:[],nextSteps:[],source:{asOf:'2020-01-01'}},null);
 assert.match(d.scenario[0].value,/excluse/);assert.match(d.scenario[1].value,/analiză nouă/);assert.match(d.scenario[3].value,/neverificat/);assert.match(d.source,/sursă exclusă/);
});
test('unknown numeric indicators are explicit rather than fabricated',()=>{
 const b=boot(),d=b.c.TTDeskInsight.build({symbol:'TEST',currency:'USD'},{code:'WATCH',blockers:[],cautions:[],evidence:[],nextSteps:[]},null);
 assert.equal(d.metrics.find(m=>m.label==='Volum relativ').value,'Neverificat');assert.match(d.metrics.find(m=>m.label==='ATR / RSI14').value,/RSI neverificat/);
});
test('AI tab renders all seven compatible models including KNN and rejects another history',()=>{
 const b=boot(),ids=['neural','boosting','hmm','isolation','quantile','garch','knn'];
 b.c.TTDecisionBridge={find:s=>({...s,generatedAt:NOW,available:7,total:7,title:'Raport test',direction:2,state:'aligned',cards:ids.map(id=>({id,name:id==='knn'?'KNN':id,available:true,eligible:true,direction:id==='knn'?1:2}))})};
 b.events['tt-decision-ai-updated']();b.tabs[3].onclick();assert.match(b.nodes.focusDetail.innerHTML,/7\/7/);assert.match(b.nodes.focusDetail.innerHTML,/KNN<\/dt><dd>Mixt/);
 const find=b.c.TTDecisionBridge.find;b.c.TTDecisionBridge.find=s=>({...find(s),historyKey:'ohlcv60:12345678'});
 b.events['tt-decision-ai-updated']();assert.match(b.nodes.focusDetail.innerHTML,/Niciun raport AI compatibil/);
});
test('broker performance is default and Shadow retains its own USD outcomes and R',async()=>{
 const b=boot();await new Promise(setImmediate);assert.equal(b.nodes.perfClosed.textContent,3);assert.equal(b.nodes.perfPnl.textContent,'+22,7 EUR');assert.equal(b.nodes.perfAvgLabel.textContent,'MEDIE / VÂNZARE');assert.match(b.nodes.performanceScope.textContent,/DEMO FICTIV/);
 b.sources[1].onclick();assert.equal(b.nodes.brokerPerformance.hidden,true);assert.equal(b.nodes.strategyPerformance.hidden,false);assert.equal(b.nodes.perfClosed.textContent,1);assert.match(b.nodes.perfAvgR.textContent,/2,15R/);assert.equal(b.nodes.perfAvgLabel.textContent,'AVG R');
 b.sources[0].onclick();assert.equal(b.nodes.perfPnl.textContent,'+22,7 EUR');assert.equal(b.nodes.strategyPerformance.hidden,true);
});
test('broker history imported by another frame automatically refreshes Desk without touching Shadow records',()=>{
 const b=boot({demo:false});assert.match(b.nodes.performanceStatus.textContent,/Conectează/);
 const P=b.c.T212Performance,d=P.demo(NOW);d.account.items=d.account.items.slice(0,1);d.account.items[0].realized=12;
 b.memory.set(P.SNAPSHOT_KEY,JSON.stringify({account:d.snapshot}));b.memory.set(P.KEY,JSON.stringify({accounts:{account:d.account}}));b.emit('storage',{key:P.KEY});assert.equal(b.nodes.perfPnl.textContent,'+12 EUR');assert.equal(b.nodes.perfClosed.textContent,1);
 d.account.items.push({...d.account.items[0],id:'new-fill',realized:-3});b.memory.set(P.KEY,JSON.stringify({accounts:{account:d.account}}));b.emit('storage',{key:P.KEY});assert.equal(b.nodes.perfPnl.textContent,'+9 EUR');assert.equal(b.nodes.perfClosed.textContent,2);assert.equal(b.nodes.perfWinRate.textContent,'50%');assert.equal(b.memory.has('tt_trade_plans_v1'),false);
});
test('Performance currency selector and period filter recalculate only compatible broker results',()=>{
 const b=boot({demo:false}),P=b.c.T212Performance,d=P.demo(NOW);d.account.items=[{...d.account.items[0],realized:4},{...d.account.items[0],id:'USD',currency:'USD',realized:20},{...d.account.items[0],id:'old',realized:100,date:'2026-01-01T15:00:00Z'}];b.memory.set(P.SNAPSHOT_KEY,JSON.stringify({account:d.snapshot}));b.memory.set(P.KEY,JSON.stringify({accounts:{account:d.account}}));b.emit('storage',{key:P.KEY});assert.equal(b.nodes.perfPnl.textContent,'+104 EUR');
 b.nodes.performancePeriod.value='30';b.nodes.performancePeriod.onchange();assert.equal(b.nodes.perfPnl.textContent,'+4 EUR');b.nodes.performanceCurrency.value='USD';b.nodes.performanceCurrency.onchange();assert.equal(b.nodes.perfPnl.textContent,'+20 USD');assert.equal(b.nodes.brokerSells.textContent,1);
});
