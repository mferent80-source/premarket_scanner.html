import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core={};vm.createContext(core);vm.runInContext(readFileSync('lib/holdings-model-summary.js','utf8'),core);
const S=core.HoldingsModelSummary,now=Date.parse('2026-10-04T12:40:00Z');
function fixture(demo=false){
 const expected={symbol:'TEST',currency:'USD',asOf:'2026-10-02',demo};
 const record=result=>({...expected,kind:demo?'synthetic':'market',trainedAt:now-1000,result,quantity:900,apiKey:'DO-NOT-EXPORT',accountId:'private-account'});
 return {expected,now,busy:false,
  neural:{usable:true,record:record({version:'holdings-mlp-v3',classIndex:2,comparison:{status:'evaluated',boosting:{version:'holdings-gbt-v1',classIndex:2}}}),assessment:{state:'research',message:'Neural validat.'},comparison:{state:'research',message:'Acord experimental.'}},
  hmm:{usable:true,record:record({version:'holdings-hmm-v1',current:{state:0},profiles:[{label:'Ascendent'}]}),assessment:{state:'descriptive',message:'Regim descriptiv.'}},
  isolation:{usable:true,record:record({version:'holdings-isolation-v1',current:{score:.4,votes:0},threshold:.6}),assessment:{state:'ordinary',message:'Nu confirmă siguranța.'}}
 };
}
test('complete research context remains descriptive and never invents combined confidence',()=>{
 const r=S.build(fixture());assert.equal(r.state,'research');assert.equal(r.available,4);assert.equal(r.reviewOnly,true);
 assert.equal(r.cards[0].value,'Avans');assert.equal(r.cards[2].value,'Ascendent');assert.equal(r.cards[3].value,'În tiparul modelului');
 assert.equal('confidence' in r,false);assert.equal('probability' in r,false);assert.match(r.limits,/nu însumează voturi/);
});
test('anomaly takes review priority even when both direction models pass',()=>{
 const f=fixture();f.isolation.assessment.state='anomaly';f.isolation.record.result.current={score:.8,votes:3};
 const r=S.build(f);assert.equal(r.state,'review');assert.ok(r.notes.some(n=>n.id==='anomaly'));assert.equal(r.cards[0].value,'Avans');
});
test('opposite direction and descriptive regime produce an explicit tension',()=>{
 const f=fixture();f.hmm.record.result.profiles[0].label='Deteriorare';
 const r=S.build(f);assert.equal(r.state,'conflict');assert.ok(r.notes.some(n=>n.id==='regime-conflict'));
 f.hmm.assessment.state='transition';assert.equal(S.build(f).state,'context');assert.ok(!S.build(f).notes.some(n=>n.id==='regime-conflict'));
});
test('direction disagreement and failed repeated advantage cannot become research from HMM or Isolation',()=>{
 const f=fixture();f.neural.comparison.state='disagreement';f.neural.record.result.comparison.boosting.classIndex=0;
 assert.equal(S.build(f).state,'disagreement');f.neural.comparison.state='no-edge';f.neural.record.result.comparison.boosting.classIndex=2;
 assert.equal(S.build(f).state,'no-edge');
});
test('out-of-domain or internally disagreeing Neural blocks both direction displays',()=>{
 for(const state of ['drift','disagreement']){const f=fixture();f.neural.assessment.state=state;f.neural.comparison.state='blocked';const r=S.build(f);assert.equal(r.state,'blocked');assert.equal(r.cards[0].value,'Interpretare blocată');assert.equal(r.cards[1].value,'Interpretare blocată');}
});
test('expired, future, mismatched currency, ticker, session or demo records never contribute',()=>{
 const mutations=[r=>r.trainedAt=now-1800001,r=>r.trainedAt=now+1,r=>r.currency='EUR',r=>r.symbol='OTHER',r=>r.asOf='2026-10-01',r=>r.kind='synthetic',r=>r.result.version='other'];
 for(const mutate of mutations){const f=fixture();mutate(f.isolation.record);const r=S.build(f);assert.equal(r.available,3);assert.equal(r.cards[3].available,false);assert.equal(r.cards[3].score,undefined);assert.equal(r.state,'incomplete');}
 const f=fixture();f.neural.usable=false;assert.equal(S.build(f).available,2);
});
test('unvalidated snapshots and unsupported states fail closed',()=>{
 const f=fixture();f.hmm.usable=1;f.isolation.assessment.state='confirmed-buy';f.neural.record.result.comparison.boosting.version='unknown';
 const r=S.build(f);assert.equal(r.available,1);assert.equal(r.state,'incomplete');
});
test('missing or invalid EOD never exports future or impossible source dates',()=>{
 for(const asOf of [undefined,'2026-02-30','2026-13-01','2026-10-05']){const f=fixture();f.expected.asOf=asOf;const r=S.build(f);assert.equal(r.state,'missing-eod');assert.equal(r.available,0);assert.equal(r.asOf,null);}
 assert.equal(S.build().available,0);
});
test('demo fixture separation prevents a combined market interpretation',()=>{
 const f=fixture(true);f.hmm.record.result.profiles[0].label='Deteriorare';f.isolation.assessment.state='anomaly';f.isolation.record.result.current={score:.8,votes:3};
 const r=S.build(f);assert.equal(r.state,'demo');assert.equal(r.kind,'synthetic');assert.ok(!r.notes.some(n=>n.id==='regime-conflict'));assert.match(r.limits,/altul, cu anomalie introdusă/);
});
test('demo source explanation follows verified shared fingerprints without relabelling manual fixtures',()=>{const f=fixture(true);for(const id of ['neural','hmm','isolation'])f[id].record.sourceFingerprint='ohlcv-v1:1100:shared';assert.match(S.build(f).limits,/același istoric fictiv/);f.isolation.record.sourceFingerprint='ohlcv-v1:1100:other';assert.match(S.build(f).limits,/altul, cu anomalie introdusă/);});
test('running refresh cannot present a completed joint interpretation',()=>{
 const f=fixture();f.busy=true;const r=S.build(f);assert.equal(r.state,'running');assert.equal(r.available,4);assert.equal(r.busy,true);
});
test('a comparison alone cannot promote a fragile or no-edge Neural assessment',()=>{
 for(const state of ['fragile','no-edge']){const f=fixture();f.neural.assessment.state=state;const r=S.build(f);assert.equal(r.state,'no-edge');assert.ok(r.notes.some(n=>n.id==='neural'));}
});
test('export projection contains provenance without model parameters or private account fields',()=>{
 const f=fixture();f.neural.record.result.network={weights:['private-weights']};f.isolation.record.result.forests=['private-forest'];
 const r=S.build(f),json=JSON.stringify(r);assert.ok(!/DO-NOT-EXPORT|private-account|private-weights|private-forest|quantity|apiKey|accountId/.test(json));
 assert.equal(r.cards[0].trainedAt,now-1000);assert.equal(r.cards[1].version,'holdings-gbt-v1');assert.equal(r.cards[3].threshold,.6);assert.ok(json.length<6000);
});
test('summary export rebuilds the requested instrument instead of reusing an old visible record',()=>{
 let emitted=null;const button={dataset:{modelSummaryExport:'1'}},c={document:{querySelectorAll:q=>q==='[data-model-summary-export]'?[button]:[]},HoldingsNeuralUI:{exportReport:r=>emitted=r}};
 vm.createContext(c);vm.runInContext(readFileSync('holdings/model-summary.js','utf8'),c);let current='NEW';c.HoldingsModelSummaryUI.bind(index=>({...S.build(fixture()),symbol:current,index}));current='SWITCHED';button.onclick();
 assert.equal(emitted.symbol,'SWITCHED');assert.equal(emitted.result.index,1);assert.equal(emitted.result.version,S.VERSION);
});
