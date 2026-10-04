import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core={HoldingsNeural:{FEATURES:['R5','R20','R60','EMA21','EMA50','EMA200','Slope','RSI','ATR','RVOL']},HoldingsHMM:{FEATURES:['R5','EMA21','ATR']},HoldingsIsolation:{FEATURES:['R1','R5','EMA21','ATR','RVOL','Gap']}};vm.createContext(core);
for(const p of ['lib/holdings-model-summary.js','lib/holdings-model-analysis.js'])vm.runInContext(readFileSync(p,'utf8'),core);
const now=Date.parse('2026-10-04T13:00:00Z');
function fixture(demo=false){
 const expected={symbol:'TEST',currency:'USD',asOf:'2026-10-02',demo},record=result=>({...expected,kind:demo?'synthetic':'market',trainedAt:now-1000,result,quantity:900,apiKey:'SECRET',accountId:'PRIVATE'});
 const neural={usable:true,record:record({version:'holdings-mlp-v3',classIndex:2,latest:[1,2,3,4,5,6,7,55,3,1.2],maxZ:2,network:{weights:['PRIVATE']},report:{test:{loss:.3,balanced:.7}},walk:{summary:{wins:3}},comparison:{status:'evaluated',boosting:{version:'holdings-gbt-v1',classIndex:2,rounds:20,importance:[.5,.3,.2,0,0,0,0,0,0,0],report:{test:{loss:.4,balanced:.6}},walk:{summary:{wins:2}}}}}),assessment:{state:'research',message:'Neural validat.'},comparison:{state:'no-edge',message:'Avantajul ambelor modele nu este confirmat.'}};
 const hmm={usable:true,record:record({version:'holdings-hmm-v1',current:{state:0,streak:3,switching:.15},profiles:[{label:'Ascendent'}],latest:[3,2,1],quality:{separation:.8},report:{test:{hmm:-1,independent:-.8,gaussian:.1}}}),assessment:{state:'descriptive',message:'Regim descriptiv.'}};
 const isolation={usable:true,record:record({version:'holdings-isolation-v1',current:{score:.8,votes:3,outside:2},threshold:.6,forests:['PRIVATE'],explanations:[{feature:4,value:7,median:1,outside:true}],report:{test:{flagged:15,n:180}}}),assessment:{state:'anomaly',message:'Nu stabilește cauza.'}};
 const f={expected,now,neural,hmm,isolation};return {...f,summary:core.HoldingsModelSummary.build(f)};
}
const A=core.HoldingsModelAnalysis,clone=x=>JSON.parse(JSON.stringify(x));
test('every model has its own full name, interpretation, objective and analysis metrics',()=>{
 const r=A.build(fixture());assert.equal(r.models.length,4);assert.equal(r.models[0].name,'Rețea neuronală · ansamblu MLP');assert.match(r.models[1].name,/Gradient Boosting/);assert.match(r.models[2].name,/Hidden Markov Model/);assert.match(r.models[3].name,/Isolation Forest/);
 assert.ok(r.models.every(x=>x.available&&x.purpose&&x.detail&&x.limits&&x.metrics.length===4));assert.equal(r.models[0].value,'Avans');assert.equal(r.models[2].value,'Ascendent');assert.equal(r.models[3].value,'Anomalie de revizuit');
});
test('mismatched source identity, timestamp, version and unvalidated records cannot show metrics',()=>{
 for(const mutate of [r=>r.symbol='OTHER',r=>r.currency='EUR',r=>r.asOf='2026-10-01',r=>r.kind='synthetic',r=>r.trainedAt=now-2000,r=>r.result.version='other']){const f=fixture();mutate(f.hmm.record);const r=A.build(f);assert.equal(r.models[2].available,false);assert.equal(r.models[2].metrics.length,0);assert.equal(r.models[2].value,'Rezultat indisponibil');}
 const f=fixture();f.isolation.usable=false;assert.equal(A.build(f).models[3].available,false);
});
test('expired or missing cards never recover details from an old source record',()=>{
 const f=fixture();for(const c of f.summary.cards)c.available=false;const r=A.build(f);assert.ok(r.models.every(x=>!x.available&&!x.metrics.length&&!x.indicators.length));
});
test('future or more than 30-minute-old training cannot show analysis metrics',()=>{
 for(const t of [now+1,now-1800001]){const f=fixture();f.hmm.record.trainedAt=t;f.summary.cards[2].trainedAt=t;assert.equal(A.build(f).models[2].available,false);}
});
test('null, nonnumeric or unavailable metrics stay unavailable rather than becoming zero',()=>{
 const f=fixture();f.neural.record.result.report.test.balanced=null;f.neural.record.result.comparison.boosting.report.test.balanced=null;f.hmm.record.result.report.test.hmm=Infinity;
 const r=A.build(f);assert.equal(r.models[0].metrics[1].value,null);assert.equal(r.models[1].metrics[1].value,null);assert.equal(r.models[2].metrics[0].value,null);
});
test('analysis projection excludes private account fields and model parameters',()=>{
 const raw=JSON.stringify(A.build(fixture()));assert.ok(!/SECRET|PRIVATE|quantity|apiKey|accountId|weights|forests/.test(raw));assert.ok(raw.length<12000);
});
test('classifier, HMM and Isolation metrics retain separate meanings',()=>{
 const r=A.build(fixture());assert.equal(r.models[2].metrics[0].value,-1);assert.match(r.models[2].limits,/NLL nu se compară/);assert.match(r.models[3].limits,/nu este acuratețe/);assert.equal('confidence' in r,false);assert.equal('profitProbability' in r,false);assert.equal(r.models[3].indicators[0].unit,'×');assert.match(r.models[0].notes[0],/nu este confirmat/);
});
test('blocked interpretation stays blocked even though historical metrics are available',()=>{
 const f=fixture();f.neural.assessment.state='drift';f.neural.comparison.state='blocked';f.summary=core.HoldingsModelSummary.build(f);const r=A.build(f);assert.equal(r.models[0].value,'Interpretare blocată');assert.equal(r.models[1].value,'Interpretare blocată');assert.equal(r.models[0].state,'drift');
});
test('demo and running flags remain explicit; original objects are not mutated',()=>{
 const f=fixture(true),before=clone(f);f.summary.busy=true;const r=A.build(f);assert.equal(r.kind,'synthetic');assert.equal(r.busy,true);assert.equal(f.neural.record.result.network.weights[0],before.neural.record.result.network.weights[0]);assert.equal(A.build(),null);
});
test('model analysis controls expose each model explicitly in the summary',()=>{
 const c={};vm.createContext(c);vm.runInContext(readFileSync('holdings/model-summary.js','utf8'),c);const html=c.HoldingsModelSummaryUI.markup(fixture().summary,2);
 for(const id of ['neural','boosting','hmm','isolation'])assert.ok(html.includes('data-model-analysis-open="'+id+'"'));
 assert.ok(html.includes('data-model-analysis-index="2"'));assert.ok(html.includes('Vezi analiza Gradient Boosting'));
});
function uiSetup(){
 const elements=()=>({dataset:{},setAttribute(){},focus(){},innerHTML:'',textContent:''}),nodes=new Map(),tabs=['neural','boosting','hmm','isolation'].map(id=>({...elements(),dataset:{modelAnalysisTab:id}}));let closed=0,removed=0,calls=0;const queries=[];
 const d={setAttribute(){},querySelector:q=>{if(!nodes.has(q))nodes.set(q,elements());return nodes.get(q);},querySelectorAll:()=>tabs,showModal(){this.open=true;},close(){closed++;this.open=false;this.onclose?.();},remove(){removed++;}};
 const opener={dataset:{modelAnalysisIndex:'0',modelAnalysisOpen:'neural'},isConnected:true,focus(){}},context=scope=>({scope,demo:false,positions:[{ticker:'TEST_US_EQ'}],symbol:()=> 'TEST',model:()=>({currency:'USD',asOf:'2026-10-02'})});
 const sandbox={document:{querySelectorAll:()=>[opener],querySelector:q=>{queries.push(q);return opener;},createElement:()=>d,body:{appendChild(){}}}};vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/model-analysis.js','utf8'),sandbox);const ui=sandbox.HoldingsModelAnalysisUI;ui.setContext(context('a'));ui.bind(()=>{calls++;return A.build(fixture());});return {ui,opener,d,nodes,tabs,context,queries,stats:()=>({closed,removed,calls})};
}
test('analysis window rebuilds current results on opening and tab changes',()=>{
 const s=uiSetup();s.opener.onclick();assert.equal(s.d.open,true);assert.ok(s.stats().calls>=2);assert.match(s.nodes.get('#model-analysis-title').textContent,/Rețea neuronală/);s.tabs[2].onclick();assert.match(s.nodes.get('#model-analysis-title').textContent,/Hidden Markov Model/);assert.match(s.nodes.get('[data-model-analysis-body]').innerHTML,/NLL HMM/);s.nodes.get('[data-model-analysis-refresh]').onclick();assert.ok(s.stats().calls>=4);
});
test('account or instrument context changes close the open analysis window',()=>{
 for(const change of ['account','symbol','currency','eod','removed']){const s=uiSetup();s.opener.onclick();const c=s.context('a');if(change==='account')c.scope='b';if(change==='symbol')c.symbol=()=> 'OTHER';if(change==='currency')c.model=()=>({currency:'EUR',asOf:'2026-10-02'});if(change==='eod')c.model=()=>({currency:'USD',asOf:'2026-10-03'});if(change==='removed')c.positions=[];s.ui.setContext(c);assert.equal(s.d.open,false,change);assert.equal(s.stats().removed,1);}
});

test('closing after a tab change and a rerender restores the original opener, not the last model tab',()=>{
 const s=uiSetup();s.opener.onclick();s.opener.isConnected=false;s.tabs[2].onclick();s.nodes.get('[data-model-analysis-close]').onclick();assert.ok(s.queries[0].includes('data-model-analysis-open="neural"'));assert.equal(s.d.open,false);
});
