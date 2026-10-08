import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-03T12:00:00Z');
function setup(){const c={Date,Intl,Number,Object,Array,Math,Set,Map,Error};vm.createContext(c);for(const f of ['lib/daily-series.js','lib/decision-verdict.js'])vm.runInContext(readFileSync(f,'utf8'),c);return c.TTDecisionVerdict;}
const V=setup();
function bars(n=240,down=false){return Array.from({length:n},(_,i)=>{const c=down?120-i*.05:88.05+i*.05;return {t:i+1,o:c,h:c+.3,l:c-.2,c,v:1e6};});}
function candidate(overrides={}){const trend=V.trend(bars());return {symbol:'TEST',currency:'USD',mode:'momentum',region:'US',kind:'market',ts:now,sourceDate:'2026-10-02',sourceTimezone:'America/New_York',sourceCloseMinutes:960,price:trend.price,atr:2,rs:3,rvol:1.4,actionable:true,state:'ARMED',entryLow:99,entryHigh:101,stop:95,target:113,trend,...overrides};}
const risk={verdict:'TRADE'};
function build(overrides={},extra={}){return V.build({purpose:'entry',candidate:candidate(overrides),risk,...extra},now);}
function model(x=candidate()){return {symbol:x.symbol,currency:x.currency,asOf:x.sourceDate,kind:x.kind,historyKey:x.trend.historyKey,generatedAt:now,available:7,total:7,direction:2,state:'up',title:'Înclinare ascendentă · experimentală',cards:['neural','boosting','hmm','isolation','quantile','garch','knn'].map(id=>({id,available:true,eligible:true,direction:id==='garch'||id==='isolation'?null:2}))};}

test('completed, aligned evidence permits a conditional plan without claiming probability',()=>{const r=build();assert.equal(r.code,'PLAN');assert.equal(r.canPlan,true);assert.equal(r.model,null);assert.ok(r.nextSteps.some(x=>x.id==='ai'));assert.equal(r.evidence.find(x=>x.id==='ai').role,'unknown');});
test('fresh scan cannot promote stale EOD, missing currency or future scan timestamp',()=>{for(const x of [{sourceDate:'2026-10-01'},{currency:null},{ts:now+60001},{ts:now-V.MAX_AGE-1}]){assert.equal(build(x).code,'VERIFY');assert.equal(build(x).canPlan,false);}});
test('risk denial wins over score and bullish models',()=>{assert.equal(build({}, {risk:{verdict:'HALTED'},ai:model()}).code,'BLOCKED');assert.equal(build({}, {risk:null}).canPlan,false);assert.equal(build({}, {risk:{verdict:'CAUTION'}}).code,'CAUTION');});
test('early reversal remains monitoring even with otherwise valid levels',()=>{assert.equal(build({mode:'reversal',actionable:false,state:'EARLY'}).code,'WATCH');});
test('reward is checked at upper entry boundary instead of midpoint',()=>{const r=build({target:111});assert.equal(r.code,'WATCH');assert.ok(r.cautions.some(c=>c.id==='reward'));assert.equal(r.canPlan,false);});
test('misaligned Long, negative RS, missing volume and weak volume cannot enable a plan',()=>{for(const x of [{trend:{...candidate().trend,short:'mixed'}},{rs:-1},{rs:null},{rvol:null},{rvol:.8}])assert.equal(build(x).canPlan,false);});
test('extension beyond two ATR requires a new entry structure',()=>{const r=build({atr:.1});assert.equal(r.code,'WATCH');assert.ok(r.cautions.some(c=>c.id==='extension'));});
test('trend with a different close cannot be attached to a packet',()=>{assert.equal(build({trend:{...candidate().trend,price:101}}).code,'VERIFY');});
test('long horizon stays unknown until two hundred actual closes exist',()=>{assert.equal(V.trend(bars(90)).long,'unknown');assert.equal(V.trend(bars()).long,'up');assert.equal(V.trend(bars(240,true)).medium,'down');assert.equal(V.trend(bars(59)),null);assert.equal(V.trend([{t:1,c:100},...bars(60)]),null);});
test('compatible seven-model report influences conflict and volatility checks',()=>{assert.ok(build({}, {ai:model()}).model);for(const ai of [{...model(),direction:0,state:'down'},{...model(),state:'weak'},{...model(),state:'up-volatile'}])assert.equal(build({}, {ai}).canPlan,false);});
test('wrong symbol, currency, session, kind, history and age reject model reuse',()=>{for(const mismatch of [{symbol:'OTHER'},{currency:'EUR'},{asOf:'2026-10-01'},{kind:'synthetic'},{historyKey:'different'},{generatedAt:now-V.MAX_AGE-1},{generatedAt:now+1}])assert.equal(build({}, {ai:{...model(),...mismatch}}).model,null);});
test('duplicating a model ID cannot satisfy seven-model coverage',()=>{const ai=model();ai.cards[5]=ai.cards[0];assert.equal(build({}, {ai}).model,null);});
test('one-year and five-year histories match only when their last sixty OHLCV bars match',()=>{const a=bars(300),b=structuredClone(a.slice(-240));assert.equal(V.seriesKey(a),V.seriesKey(b));b.at(-1).v+=1;assert.notEqual(V.seriesKey(a),V.seriesKey(b));});
test('model summary drops portfolio and credentials and tolerates malformed cards',()=>{const x=candidate(),raw={...model(x),secret:'NEVER_SEND',positions:[1],balance:5000};const r=V.modelSummary(raw,{symbol:x.symbol,currency:x.currency,asOf:x.sourceDate,kind:x.kind,bars:bars()},now);assert.ok(r);assert.doesNotMatch(JSON.stringify(r),/NEVER_SEND|positions|balance/);assert.equal(V.modelSummary({...raw,cards:null},{},now),null);});
test('native European confirmation remains separate from USD execution',()=>{const x={currency:'EUR',region:'EU',actionable:false,category:'growth',plan:{state:'CONFIRMED'}};assert.equal(build(x).canPlan,false);assert.equal(build(x,{executionMode:'native'}).canPlan,true);assert.equal(build({...x,category:'earlyLong'},{executionMode:'native'}).canPlan,false);});
test('earnings block and unknown calendar cannot be overridden by AI',()=>{assert.equal(build({}, {earnings:{known:true,blocked:true},ai:model()}).code,'BLOCKED');assert.equal(build({}, {earnings:{known:false},ai:model()}).code,'WATCH');});
test('holding and breadth assessments never authorize an entry',()=>{assert.equal(build({}, {purpose:'holding'}).canPlan,false);const r=V.build({purpose:'market',context:{ready:true,title:'Piață',evidence:[{id:'breadth',label:'Piață',value:'RISK-ON',role:'support'}]}},now);assert.equal(r.canPlan,false);assert.equal(r.code,'REVIEW');});
test('risk page reports blocked permissions but preserves review scope',()=>{const r=V.build({purpose:'risk',context:{ready:true,blocked:true}},now);assert.equal(r.code,'BLOCKED');assert.equal(r.canPlan,false);});
test('AI public payload excludes broker risk, notes, positions and account budgets',()=>{const r=build({notes:'PRIVATE',positions:['PRIVATE']},{risk:{...risk,balance:'PRIVATE',budgetLeftUsd:10}});const payload=JSON.stringify(V.publicFacts(r));assert.doesNotMatch(payload,/PRIVATE|budgetLeftUsd|positions|notes|"risk"/);assert.match(payload,/TEST/);});
test('AI explanation must reference current verdict, actual evidence and allowed actions',()=>{const r=build(),valid={snapshotId:r.snapshotId,verdictCode:r.code,summary:'Trendul susține un scenariu condițional.',priorities:[{comment:'Verifică separat execuția și contextul.',evidenceIds:['medium'],nextStepIds:['plan']}]};assert.ok(V.explanation(JSON.stringify(valid),r));for(const change of [{snapshotId:'old'},{verdictCode:'BLOCKED'},{summary:'Profit sigur 90%'},{summary:'<script>'},{priorities:[{comment:'Cumpără',evidenceIds:['invented'],nextStepIds:[]}]}])assert.throws(()=>V.explanation(JSON.stringify({...valid,...change}),r));assert.throws(()=>V.explanation('{"summary":"truncated',r));});
test('snapshot is stable across time checks but changes when evidence or source changes',()=>{const x=candidate(),a=V.build({purpose:'entry',candidate:x,risk},now),b=V.build({purpose:'entry',candidate:x,risk},now+1000);assert.equal(a.snapshotId,b.snapshotId);assert.notEqual(a.snapshotId,build({rvol:.5}).snapshotId);});

test('initial empty selection produces a verification result without crashing',()=>{const r=V.build({purpose:'entry'},now);assert.equal(r.code,'VERIFY');assert.equal(r.canPlan,false);assert.equal(r.symbol,null);});

test('a monitored bullish candidate explains its structure and the actual missing confirmation',()=>{
 const r=build({actionable:false,state:'WATCH'});
 assert.equal(r.canPlan,false);assert.match(r.briefing.summary,/trend ascendent aliniat/);
 assert.ok(r.briefing.supports.some(s=>s.id==='medium'));
 assert.ok(r.briefing.obstacles.some(s=>s.id==='setup'));
 assert.match(r.briefing.confirmation,/99 USD.*101 USD/);
 assert.match(r.briefing.invalidation,/95 USD/);
 assert.doesNotMatch(r.briefing.confirmation,/Reper structural de confirmare/);
});
test('expired analysis and wrong EOD give distinct explanations without enabling a plan',()=>{
 const expired=build({ts:now-V.MAX_AGE-1}),wrongSession=build({sourceDate:'2026-10-01'});
 assert.match(expired.briefing.obstacles[0].text,/30 de minute/);
 assert.match(wrongSession.briefing.obstacles[0].text,/2026-10-01/);
 assert.equal(expired.canPlan,false);assert.equal(wrongSession.canPlan,false);
});
test('empty filtered pages explain their own state instead of inventing failed technical checks',()=>{
 const r=V.build({purpose:'entry',empty:{title:'Niciun candidat Europa',reason:'Acțiunile verificate nu trec filtrul.',next:'Schimbă strategia și filtrele.'}},now);
 assert.equal(r.code,'VERIFY');assert.equal(r.evidence.length,0);
 assert.equal(r.briefing.summary,'Acțiunile verificate nu trec filtrul.');
 assert.equal(r.briefing.next,'Schimbă strategia și filtrele.');
 assert.equal(r.blockers.length,1);
});
test('a bearish holding calls for thesis review and does not invent a trade stop',()=>{
 const t=V.trend(bars(240,true));const r=build({trend:t,price:t.price},{purpose:'holding'});
 assert.equal(r.canPlan,false);assert.match(r.briefing.assessment,/descendent/);
 assert.match(r.briefing.invalidation,/deja deteriorată/);
 assert.doesNotMatch(r.briefing.invalidation,/95 USD/);
 assert.match(r.briefing.next,/teza, evenimentele și limita de risc/);
});
test('defensive Breadth with complete sources uses its market action instead of a missing-data instruction',()=>{
 const r=V.build({purpose:'market',context:{ready:true,caution:true,cautionReason:'Participare defensivă.',next:'Selectează strict și verifică instrumentul.'}},now);
 assert.equal(r.code,'CAUTION');assert.equal(r.briefing.next,'Selectează strict și verifică instrumentul.');
});
test('Breadth explanations include public participation and sector evidence but exclude account fields',()=>{
 const r=V.build({purpose:'market',context:{ready:true,summary:'Piață selectivă.',evidence:[{id:'participation',label:'Uptrend',value:'42%',role:'support'},{id:'market-trend',label:'Trend',value:'RISING',role:'support'},{id:'sectors',label:'Sectoare',value:'Tech',role:'support'},{id:'account',label:'Sold privat',value:'PRIVATE',role:'support'}]}},now);
 const facts=V.publicFacts(r);assert.equal(facts.purpose,'market');assert.equal(facts.symbol,null);
 assert.deepEqual(Array.from(facts.evidence,e=>e.id),['participation','market-trend','sectors']);
 assert.doesNotMatch(JSON.stringify(facts),/PRIVATE/);assert.equal(r.canPlan,false);
});
