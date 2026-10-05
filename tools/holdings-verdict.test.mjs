import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const core={HoldingsNeural:{valid:()=>true},HoldingsModelComparison:{valid:()=>true},HoldingsHMM:{valid:()=>true},HoldingsIsolation:{valid:()=>true},HoldingsQuantile:{valid:()=>true},HoldingsGarch:{valid:()=>true,CONFIG:{elevatedRatio:1.5}}};
vm.createContext(core);vm.runInContext(readFileSync('lib/holdings-verdict.js','utf8'),core);const V=core.HoldingsVerdict,now=Date.parse('2026-10-05T08:00:00Z');
vm.runInContext(readFileSync('lib/holdings-verdict-diagnostics.js','utf8'),core);const explain=(r,options)=>core.HoldingsVerdictDiagnostics.build(r,options);
function fixture(){
 const expected={symbol:'TEST',currency:'USD',asOf:'2026-10-02',kind:'market',t:now-3*86400000,close:100,timezone:'America/New_York',closeMinutes:960,fingerprint:'fixture'};
 const record=result=>({...expected,sourceTime:expected.t,sourceFingerprint:expected.fingerprint,sourceClose:100,trainedAt:now-1000,result,quantity:999,apiKey:'SECRET',accountId:'PRIVATE'});
 return {expected,now,snapshots:{
  neural:{usable:true,record:record({version:'holdings-mlp-v3',classIndex:2,report:{periods:{test:{lastLabel:expected.t}}},comparison:{status:'evaluated',boosting:{version:'holdings-gbt-v1',classIndex:2}}}),assessment:{state:'research',message:'Validat.'},comparison:{state:'research',message:'Validat.'}},
  hmm:{usable:true,record:record({version:'holdings-hmm-v1',current:{t:expected.t,state:0},profiles:[{label:'Ascendent'}]}),assessment:{state:'descriptive',message:'Validat.'}},
  isolation:{usable:true,record:record({version:'holdings-isolation-v1',current:{t:expected.t,close:100,score:.4},threshold:.6}),assessment:{state:'ordinary',message:'În tipar.'}},
  quantile:{usable:true,record:record({version:'holdings-quantile-v1',current:{t:expected.t,close:100,prices:[98,102,106],atrPct:1}}),assessment:{state:'descriptive',message:'Interval validat.'}},
  garch:{usable:true,record:record({version:'holdings-garch-v1',current:{t:expected.t,close:100,horizons:[{horizon:5,cumulativePct:2,ratio:1},{horizon:20,cumulativePct:4,ratio:1}]}}),assessment:{state:'descriptive',message:'Volatilitate validată.'}}
 }};
}
test('six compatible validated models produce an explained experimental direction',()=>{const r=V.build(fixture());assert.equal(r.available,6);assert.equal(r.state,'up');assert.equal(r.direction,2);assert.equal(r.cards[4].medianReturnPct,2.0000000000000018);assert.match(r.limits,/HMM, Isolation și GARCH.*fără voturi/);assert.equal(r.confidence,undefined);});
test('missing, failed or running models cannot produce a directional final verdict',()=>{const f=fixture();delete f.snapshots.hmm;assert.equal(V.build(f).state,'incomplete');const full=fixture();full.statuses={neural:{state:'error',error:'Eroare'}};assert.equal(V.build(full).available,5);full.running=true;assert.equal(V.build(full).state,'running');});
test('direction, quantile and regime conflicts are explicit',()=>{let f=fixture();f.snapshots.neural.record.result.comparison.boosting.classIndex=0;assert.equal(V.build(f).state,'conflict');f=fixture();f.snapshots.quantile.record.result.current.prices=[94,98,101];assert.equal(V.build(f).state,'conflict');f=fixture();f.snapshots.hmm.record.result.profiles[0].label='Deteriorare';assert.equal(V.build(f).state,'conflict');});
test('anomaly and marginal Isolation do not cast directional votes',()=>{for(const state of ['anomaly','uncertain']){const f=fixture();f.snapshots.isolation.assessment.state=state;assert.equal(V.build(f).state,'caution');assert.equal(V.build(f).direction,null);assert.equal(V.build(f).cards[3].direction,null);}});
test('historical no-edge, weak calibration and drift block combined direction',()=>{for(const [id,state] of [['neural','no-edge'],['neural','fragile'],['neural','drift'],['hmm','weak'],['quantile','limited'],['quantile','no-edge']]){const f=fixture();f.snapshots[id].assessment.state=state;assert.equal(V.build(f).state,'weak',id+state);assert.equal(V.build(f).direction,null);}});
test('provenance, session, price, age, version and validated payload must all match',()=>{const mutations=[r=>r.symbol='OTHER',r=>r.currency='EUR',r=>r.asOf='2026-10-01',r=>r.kind='synthetic',r=>r.sourceFingerprint='other',r=>r.sourceTime++,r=>r.sourceClose++,r=>r.timezone='Europe/London',r=>r.closeMinutes=1000,r=>r.trainedAt=now-1800001,r=>r.trainedAt=now+1,r=>r.result.version='unknown',r=>r.result.current.t++,r=>r.result.current.close++];for(const mutate of mutations){const f=fixture();mutate(f.snapshots.quantile.record);assert.equal(V.build(f).available,5);assert.equal(V.build(f).direction,null);}const f=fixture();f.snapshots.hmm.usable=1;assert.equal(V.build(f).available,5);});
test('cancellation cannot promote previously cached results to final verdict',()=>{const f=fixture();f.statuses=Object.fromEntries(V.IDS.map(id=>[id,{state:'cancelled'}]));assert.equal(V.build(f).available,0);assert.equal(V.build(f).state,'incomplete');});
test('combined output projects no brokerage, credentials or private parameters',()=>{const f=fixture();f.snapshots.neural.record.result.weights='SECRET-WEIGHTS';assert.ok(!/SECRET|PRIVATE|quantity|apiKey|weights/.test(JSON.stringify(V.build(f))));assert.equal(V.build().state,'incomplete');});

test('fingerprint distinguishes adjusted historical data even with identical latest close',()=>{const bars=[{t:1,o:100,h:101,l:99,c:100,v:10},{t:2,o:100,h:102,l:99,c:101,v:11}],copy=structuredClone(bars);assert.equal(V.fingerprint(bars),V.fingerprint(copy));copy[0].c=99.5;assert.notEqual(V.fingerprint(bars),V.fingerprint(copy));});
test('validated high volatility adds caution without changing direction or becoming a vote',()=>{const f=fixture();f.snapshots.garch.record.result.current.horizons[0].ratio=1.6;const r=V.build(f);assert.equal(r.state,'up-volatile');assert.equal(r.direction,2);assert.equal(r.cards[5].direction,null);assert.match(r.title,/volatilitate ridicată/);f.snapshots.isolation.assessment.state='anomaly';assert.equal(V.build(f).state,'caution');f.snapshots.neural.assessment.state='no-edge';f.snapshots.isolation.assessment.state='ordinary';assert.equal(V.build(f).state,'weak');});
test('exploratory or hidden GARCH is explained and cannot change an otherwise validated direction',()=>{for(const state of ['no-edge','limited','drift']){const f=fixture();f.snapshots.garch.assessment.state=state;f.snapshots.garch.record.result.current.horizons[0].ratio=3;const r=V.build(f);assert.equal(r.state,'up');assert.match(r.reasons.at(-1),/GARCH rămâne exploratoriu/);assert.equal(r.cards[5].eligible,false);if(state==='drift')assert.equal(r.cards[5].volatilityRatio,undefined);}});
test('missing, stale, mismatched or invalid GARCH cannot complete six-model verdict',()=>{const f=fixture();delete f.snapshots.garch;assert.equal(V.build(f).state,'incomplete');for(const mutate of [r=>r.sourceFingerprint='bad',r=>r.result.current.close++,r=>r.trainedAt=now-1800001]){const x=fixture();mutate(x.snapshots.garch.record);assert.equal(V.build(x).available,5);}const original=core.HoldingsGarch.valid;try{core.HoldingsGarch.valid=()=>false;assert.equal(V.build(fixture()).state,'incomplete');}finally{core.HoldingsGarch.valid=original;}});

test('expired, changed and invalid completed reports explain why reanalysis is needed',()=>{
 for(const [mutate,reason] of [[r=>r.trainedAt=now-1800001,/expirat/],[r=>r.sourceClose++,/închidere/i],[r=>r.sourceFingerprint='changed',/istoric/i],[r=>r.asOf='2026-10-01',/EOD/],[r=>r.result.version='unknown',/versiune/]]){
  const f=fixture();mutate(f.snapshots.isolation.record);f.statuses={isolation:{state:'cached'}};const r=V.build(f),card=r.cards[3];assert.equal(card.available,false);assert.equal(card.state,'unavailable');assert.match(card.detail,reason);assert.match(card.detail,/Reanalizează/);assert.equal(r.direction,null);
 }
 const f=fixture();f.snapshots.isolation.usable=false;f.statuses={isolation:{state:'ready'}};assert.equal(V.build(f).cards[3].state,'unavailable');assert.match(V.build(f).cards[3].detail,/verific/);
});
test('report diagnostics preserve worker failures and hide internal exceptions',()=>{const f=fixture();f.snapshots.isolation.record.sourceClose++;f.statuses={isolation:{state:'error',error:'Mesaj worker'}};assert.equal(V.build(f).cards[3].detail,'Mesaj worker');const old=core.HoldingsIsolation.valid;try{core.HoldingsIsolation.valid=()=>{throw Error('SECRET INTERNAL');};const x=fixture();assert.equal(V.build(x).cards[3].state,'unavailable');assert.ok(!JSON.stringify(V.build(x)).includes('SECRET'));}finally{core.HoldingsIsolation.valid=old;}});

test('a one-of-six technical failure diagnoses every missing model and preserves the one usable result',()=>{
 const f=fixture();f.statuses=Object.fromEntries(['neural','boosting','hmm','quantile','garch'].map(id=>[id,{state:'error',error:'Calcul nereușit.'}]));
 const r=V.build(f),before=JSON.stringify(r),d=explain(r,{phase:'done'});
 assert.equal(r.available,1);assert.equal(r.direction,null);assert.equal(d.title,'Rezultate de recalculat');assert.equal(d.blockers.length,5);assert.ok(d.blockers.every(x=>x.code==='error'&&x.remedy==='recalculate'));
 assert.deepEqual(Array.from(d.retryIds),['neural','boosting','hmm','quantile','garch']);assert.equal(d.panels[1].rows[1].value,'În tiparul modelului');assert.ok(d.panels[0].rows.every(x=>x.value==='Indisponibil'));assert.equal(JSON.stringify(r),before);
});
test('complete reports with weak validation explain evidence limits without suggesting another same-history calculation',()=>{
 const f=fixture();f.snapshots.neural.assessment.state='no-edge';f.snapshots.neural.comparison.state='no-edge';f.snapshots.quantile.assessment.state='limited';
 const r=V.build(f),d=explain(r,{phase:'done'});assert.equal(r.state,'weak');assert.equal(d.available,6);assert.equal(d.title,'Dovezi istorice insuficiente');assert.equal(d.retryIds.length,0);
 assert.deepEqual(Array.from(d.blockers,x=>x.code),['no-edge','no-edge','limited']);assert.deepEqual(Array.from(d.actions,x=>x.id),['evidence']);assert.match(d.actions[0].text,/același istoric.*nu adaugă dovezi/);
 assert.equal(d.panels[0].rows[0].value,'Avans');assert.equal(d.panels[0].rows[0].validation,'Avantaj istoric neconfirmat');assert.equal(r.direction,null);
});
test('available direction estimates remain separate when a context report is missing',()=>{
 const f=fixture();delete f.snapshots.garch;const r=V.build(f),d=explain(r,{phase:'done'});
 assert.equal(r.state,'incomplete');assert.equal(r.direction,null);assert.ok(d.panels[0].rows.every(x=>x.available));assert.equal(d.panels[1].rows[2].value,'Indisponibil');assert.deepEqual(Array.from(d.retryIds),['garch']);assert.equal(d.direction,undefined);
});
test('expiry, identity, historical revisions and malformed results carry distinct diagnostic codes and hide the rejected values',()=>{
 for(const [mutate,code] of [[r=>r.trainedAt=now-1800001,'expired'],[r=>r.symbol='OTHER','identity'],[r=>r.currency='EUR','identity'],[r=>r.sourceFingerprint='other','history'],[r=>r.sourceClose++,'close'],[r=>r.asOf='2026-10-01','session'],[r=>r.result.version='unknown','version']]){
  const f=fixture();mutate(f.snapshots.quantile.record);const r=V.build(f),d=explain(r);assert.equal(r.cards[4].rejectionCode,code);assert.equal(d.blockers[0].code,code);assert.equal(d.panels[0].rows[2].value,'Indisponibil');assert.equal(d.blockers[0].remedy,'recalculate');
 }
});
test('direction and regime conflicts call for review while context models never become new price votes',()=>{
 for(const mutate of [f=>f.snapshots.neural.record.result.comparison.boosting.classIndex=0,f=>f.snapshots.quantile.record.result.current.prices=[94,98,101],f=>f.snapshots.hmm.record.result.profiles[0].label='Deteriorare']){
  const f=fixture();mutate(f);const r=V.build(f),d=explain(r);assert.equal(r.state,'conflict');assert.ok(d.blockers.some(x=>x.code==='conflict'));assert.equal(d.title,'Estimări de revizuit');assert.equal(d.retryIds.length,0);assert.match(d.panels[1].note,/fără voturi de preț/);
 }
});
test('anomalies, drift and uncertain classification explain review rather than a technical retry',()=>{
 for(const state of ['anomaly','uncertain']){const f=fixture();f.snapshots.isolation.assessment.state=state;const r=V.build(f),d=explain(r);assert.equal(d.blockers[0].code,state);assert.equal(d.blockers[0].remedy,'review');assert.equal(d.retryIds.length,0);assert.equal(r.direction,null);}
 const f=fixture();f.snapshots.neural.assessment.state='drift';const r=V.build(f),d=explain(r);assert.equal(d.panels[0].rows[0].value,'Interpretare neconcludentă');assert.equal(d.blockers[0].remedy,'review');
});
test('exploratory GARCH and temporary retention remain notes and cannot create a blocker for an otherwise validated direction',()=>{
 const f=fixture();f.snapshots.garch.assessment.state='no-edge';for(const s of Object.values(f.snapshots))s.persistence={state:'session'};
 const r=V.build(f),d=explain(r);assert.equal(r.state,'up');assert.equal(d.blockers.length,0);assert.equal(d.retryIds.length,0);assert.equal(d.title,'Verificări încheiate');assert.deepEqual(Array.from(d.notes,x=>x.code),['exploratory','retention']);assert.match(d.notes[1].detail,/doar în această sesiune/);
 f.snapshots.garch.persistence={state:'pending'};assert.match(explain(V.build(f)).notes[1].detail,/în curs/);
});
test('source failure and running analysis have explicit global actions rather than six invented model failures',()=>{
 const f=fixture();f.expected=null;const r=V.build(f),d=explain(r,{phase:'error',sourceVerified:false,error:'Sesiunea EOD nu este verificată.'});assert.equal(d.title,'Date EOD necesare');assert.equal(d.blockers.length,1);assert.equal(d.blockers[0].code,'source-error');assert.match(d.blockers[0].detail,/EOD/);assert.ok(d.panels.every(p=>p.rows.every(r=>!r.available)));
 f.running=true;const busy=explain(V.build(f),{phase:'loading',sourceVerified:false});assert.equal(busy.busy,true);assert.equal(busy.blockers.length,0);assert.equal(busy.retryIds.length,0);assert.deepEqual(Array.from(busy.actions,x=>x.id),['wait']);
});
test('diagnostic output projects out portfolio data, credentials and private model parameters',()=>{const f=fixture();f.snapshots.neural.record.result.weights='PRIVATE-WEIGHTS';const d=explain(V.build(f));assert.ok(!/SECRET|PRIVATE|quantity|apiKey|weights|accountId/.test(JSON.stringify(d)));});
