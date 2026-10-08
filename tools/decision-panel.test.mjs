import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function setup({module='candidate',hasKey=true}={}){
 const clock={now:Date.parse('2026-10-03T12:00:00Z')};class Clock extends Date{static now(){return clock.now;}}
 const events={},timers=[];let html='',writes=0,controls=new Map(),request,resolve;
 const host={dataset:{},setAttribute(){},querySelector(selector){if(!controls.has(selector))controls.set(selector,{value:'',hidden:false});return controls.get(selector);},set innerHTML(value){html=value;writes++;controls=new Map();},get innerHTML(){return html;}};
 const c={Date:Clock,Intl,AbortController,location:{origin:'https://app.test',hash:''},document:{currentScript:{dataset:{decisionModule:module}},readyState:'complete',hidden:false,createElement:()=>host,querySelector:()=>({prepend(){}})},AI:{hasKey:()=>hasKey,DEFAULT_MODEL:'claude-opus-5',complete:opts=>{request=opts;return new Promise(r=>{resolve=r;});}},localStorage:{getItem:()=>null,setItem(){}},setInterval:fn=>{timers.push(fn);},addEventListener:(name,fn)=>{events[name]=fn;},console};c.window=c;c.parent=c;vm.createContext(c);for(const file of ['lib/daily-series.js','lib/decision-verdict.js','lib/decision-panel.js'])vm.runInContext(readFileSync(file,'utf8'),c);
 function candidate(symbol='TEST'){const bars=Array.from({length:240},(_,i)=>({t:i+1,o:88.05+i*.05,h:88.35+i*.05,l:87.85+i*.05,c:88.05+i*.05,v:1e6}));return {symbol,currency:'USD',sourceDate:'2026-10-02',sourceTimezone:'America/New_York',sourceCloseMinutes:960,ts:clock.now,price:100,atr:2,rs:2,rvol:1.2,actionable:true,state:'ARMED',mode:'momentum',entryLow:99,entryHigh:101,stop:95,target:113,trend:c.TTDecisionVerdict.trend(bars)};}
 const set=symbol=>c.TTDecisionPanel.set({purpose:'entry',candidate:candidate(symbol),risk:{verdict:'TRADE'}});set('TEST');return {c,clock,host,timers,set,request:()=>request,resolve:value=>resolve(value),writes:()=>writes};
}
test('periodic refresh retains typed API setup and focused controls when evidence is unchanged',()=>{const t=setup();t.host.querySelector('[data-ai-toggle]').onclick();t.host.querySelector('[data-ai-config]').onclick();const field=t.host.querySelector('[data-ai-key]');field.value='TEST_DRAFT_ONLY';const count=t.writes();t.timers[0]();assert.equal(t.writes(),count);assert.equal(t.host.querySelector('[data-ai-key]'),field);assert.equal(field.value,'TEST_DRAFT_ONLY');});
test('a changed instrument cancels and discards an explanation of the earlier snapshot',async()=>{const t=setup(),old=t.c.TTDecisionPanel.report();const pending=t.host.querySelector('[data-ai-run]').onclick();assert.equal(t.request().signal.aborted,false);t.set('OTHER');assert.equal(t.request().signal.aborted,true);t.resolve(JSON.stringify({snapshotId:old.snapshotId,verdictCode:old.code,summary:'OLD_EXPLANATION',priorities:[{comment:'Verifică trendul.',evidenceIds:['medium'],nextStepIds:[]}]}));await pending;assert.doesNotMatch(t.host.innerHTML,/OLD_EXPLANATION/);assert.equal(t.c.TTDecisionPanel.report().symbol,'OTHER');});
test('expiry removes plan permission and disables the external AI action',()=>{const t=setup();assert.equal(t.c.TTDecisionPanel.report().canPlan,true);t.clock.now+=1800001;t.timers[0]();assert.equal(t.c.TTDecisionPanel.report().code,'VERIFY');assert.match(t.host.innerHTML,/data-ai-toggle disabled/);});

test('all five analytical pages expose a conclusion and next step outside the collapsed evidence',()=>{
 for(const module of ['desk','candidate','europe','holdings','breadth']){
  const t=setup({module});const beforeDetails=t.host.innerHTML.split('<details')[0];
  assert.match(beforeDetails,/data-verdict-summary/);assert.match(beforeDetails,/Următorul pas/);
  assert.match(beforeDetails,/data-verdict-invalidation/);assert.match(beforeDetails,/Ce susține scenariul/);
  assert.equal(t.request(),undefined);
 }
});
test('unconfigured external AI is labelled explicitly without hiding the technical conclusion',()=>{
 const t=setup({hasKey:false});assert.match(t.host.innerHTML,/Necesită cheia API Anthropic/);
 assert.match(t.host.innerHTML,/trend ascendent aliniat/);assert.equal(t.request(),undefined);
});
test('the holdings action runs the existing seven-model workflow for the selected holding',()=>{
 const t=setup({module:'holdings'});let opened=0;
 const candidate={...t.c.TTDecisionPanel.report().source,symbol:'TEST',currency:'USD',sourceDate:'2026-10-02',sourceTimezone:'America/New_York',sourceCloseMinutes:960,ts:t.clock.now,price:100,trend:t.c.TTDecisionPanel.report().technical};
 t.c.TTDecisionPanel.set({purpose:'holding',candidate,modelAction:()=>opened++});
 assert.match(t.host.innerHTML,/Calculează cele 7 modele AI/);
 t.host.querySelector('[data-verdict-action="0"]').onclick();assert.equal(opened,1);
});
test('current Breadth can request a public evidence explanation without an individual stock symbol',async()=>{
 const t=setup({module:'breadth'});
 t.c.TTDecisionPanel.set({purpose:'market',context:{ready:true,title:'Piață selectivă',summary:'Participare în creștere.',evidence:[{id:'participation',label:'Uptrend',value:'42%',role:'support'}]}});
 assert.doesNotMatch(t.host.innerHTML,/data-ai-toggle disabled/);assert.equal(t.request(),undefined);
 const pending=t.host.querySelector('[data-ai-run]').onclick(),r=t.c.TTDecisionPanel.report();
 assert.match(t.request().prompt,/participation/);
 t.resolve(JSON.stringify({snapshotId:r.snapshotId,verdictCode:r.code,summary:'Participarea susține selecția strictă.',priorities:[{comment:'Verifică separat instrumentul.',evidenceIds:['participation'],nextStepIds:['scope']}]}));
 await pending;assert.match(t.host.innerHTML,/Participarea susține selecția strictă/);
});
