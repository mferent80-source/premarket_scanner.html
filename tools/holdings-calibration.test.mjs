import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core={};vm.createContext(core);
for(const file of ['lib/daily-series.js','lib/holdings-forecast.js','lib/holdings-calibration.js','holdings/calibration.js'])vm.runInContext(readFileSync(file,'utf8'),core);
const F=core.HoldingsForecast,C=core.HoldingsCalibration,U=core.HoldingsCalibrationUI,plain=x=>JSON.parse(JSON.stringify(x));
const now=Date.parse('2026-10-05T18:00:00Z'),identity={scope:'PRIVATE_ACCOUNT',ticker:'EXAMPLE_US_EQ',symbol:'EXAMPLE',currency:'USD',kind:'synthetic'};
const dates=[];for(let t=Date.parse('2024-01-02T13:30:00Z');dates.length<400;t+=86400000)if(![0,6].includes(new Date(t).getUTCDay()))dates.push(t);
function fixture(n=40,{step=6,perfect=false,onlyClass=null}={}){
 const entries=[];
 for(let i=0;i<n;i++){
  const at=i*step,t=dates[at],actualClass=onlyClass??i%3,predicted=perfect||i%4!==0?actualClass:(actualClass+1)%3,probabilities=[0,1,2].map(k=>k===predicted ? .98 : .01),capturedAt=t+8*3600000;
  const bars=dates.slice(at,at+6).map((t,j)=>{const c=100+(actualClass-1)*2*j/5;return {t,o:c,h:c+1,l:c-1,c,v:10000};});
  const source={t,asOf:core.DailySeries.date(t,'America/New_York'),timezone:'America/New_York',closeMinutes:960,close:100,atrPct:1};
  for(const model of ['neural','boosting']){
   const r=F.project({model,modelVersion:F.VERSIONS[model],trainedAt:capturedAt-1000,state:'research',source,estimate:{classIndex:predicted,baselineClass:1,probabilities}},identity,capturedAt);
   assert.ok(r);const done=F.verify(r,{symbol:identity.symbol,currency:identity.currency,timezone:source.timezone,bars,retrievedAt:now},now);assert.equal(done.verification.state,'resolved');assert.ok(F.validEntry(done,identity,now));entries.push(done);
  }
 }
 return {identity:{...identity},ledger:{ok:true,entries}};
}
const build=item=>C.build(item,{scope:identity.scope,kind:identity.kind,now});
function setOutcome(r,classIndex){r.outcome.path.forEach((b,i)=>b.c=100+(classIndex-1)*2*(i+1)/5);r.outcome.close=r.outcome.path.at(-1).c;}
test('empty and small registries show actual progress without fitted scores or a prediction',()=>{
 for(const n of [0,1,24,39]){const r=build(fixture(n));assert.equal(r.state,'collecting');assert.equal(r.available,n);assert.equal(r.parameters,null);assert.equal(r.scores,null);assert.equal(r.advantage,false);assert.equal(r.split.fit.n+r.split.test.n,n);assert.equal(r.direction,undefined);}
});
test('calibration uses an earlier block and compares exactly the same later test observations',()=>{
 const r=build(fixture());assert.equal(r.split.fit.n,20);assert.equal(r.split.test.n,20);assert.ok(r.split.fit.lastOutcome<r.split.test.from);assert.equal(r.available,40);assert.equal(r.paired,40);assert.deepEqual(plain(r.split.fit.counts),[7,7,6]);assert.ok(r.parameters);assert.ok(r.parameters.temperature>1);assert.equal(r.parameters.neuralWeight+r.parameters.boostingWeight,1);assert.equal(r.advantage,true);
 for(const m of Object.values(r.scores))assert.equal(m.n,20);assert.ok(r.scores.calibrated.loss<r.scores.average.loss);assert.ok(r.scores.calibrated.brier<r.scores.prior.brier);
});
test('changing every held-out label cannot change temperatures, weights, prior or fit loss',()=>{
 const data=fixture(),a=build(data);for(const r of data.ledger.entries.slice(40))setOutcome(r,(F.metric(r).actualClass+1)%3);
 const b=build(data);assert.deepEqual(plain(a.parameters),plain(b.parameters));assert.notEqual(a.scores.calibrated.loss,b.scores.calibrated.loss);assert.equal(b.advantage,false);assert.equal(b.state,'no-edge');
});
test('perfect original probabilities do not acquire a fabricated gain from calibration',()=>{
 const r=build(fixture(40,{perfect:true}));assert.equal(r.parameters.temperature,1);assert.equal(r.state,'no-edge');assert.equal(r.advantage,false);assert.equal(r.scores.calibrated.loss,r.scores.average.loss);
});
test('minimum sample size cannot hide missing actual classes in either chronological block',()=>{
 const data=fixture(),fitOnly=fixture(40,{onlyClass:1});assert.equal(build(fitOnly).state,'classes');assert.equal(build(fitOnly).scores,null);
 for(const r of data.ledger.entries.slice(40))setOutcome(r,1);const result=build(data);assert.equal(result.state,'classes');assert.equal(result.parameters,null);assert.deepEqual(plain(result.split.test.counts),[0,20,0]);assert.ok(result.split.fit.counts.every(n=>n>=4));
});
test('the split is fixed by chronology and count, without balancing or shuffling test classes',()=>{
 const a=fixture(45),b=plain(a);b.ledger.entries.reverse();const ra=build(a),rb=build(b);assert.equal(ra.split.fit.n,22);assert.equal(ra.split.test.n,23);assert.deepEqual(plain(ra),plain(rb));
});
test('legacy classes are kept but never turned into probability vectors',()=>{
 const data=fixture();for(const r of data.ledger.entries.slice(0,4))delete r.estimate.probabilities;const before=JSON.stringify(data),r=build(data);assert.equal(r.state,'collecting');assert.equal(r.available,38);assert.equal(r.excluded.legacy,2);assert.equal(JSON.stringify(data),before);assert.ok(data.ledger.entries.every(r=>F.validEntry(r,identity,now)));
});
test('pending, unverifiable and incomplete pairs have distinct excluded counts',()=>{
 const data=fixture(4),rows=data.ledger.entries;
 rows[0].outcome=null;rows[0].verification={state:'pending',checkedAt:now,sessions:0,reason:'În așteptare.'};
 rows[2].verification={state:'unverifiable',checkedAt:now,sessions:5,reason:'Sursă revizuită.'};
 rows.splice(5,1);const r=build(data);assert.equal(r.excluded.pending,1);assert.equal(r.excluded.unverifiable,1);assert.equal(r.excluded.incomplete,1);assert.equal(r.available,1);assert.equal(r.origins,4);
});
test('different initial ATR, close, timezone or later price path cannot be paired',()=>{
 for(const change of [r=>r.source.atrPct+=.000001,r=>r.source.close+=.001,r=>r.source.closeMinutes=1020,r=>setOutcome(r,2)]){
  const data=fixture(1);change(data.ledger.entries[1]);const result=build(data);assert.equal(result.excluded.mismatch,1);assert.equal(result.available,0);
 }
 const data=fixture(1);data.ledger.entries[1].source.timezone='UTC';const result=build(data);assert.equal(result.excluded.mismatch,1);
});
test('touching or overlapping five-session paths cannot inflate the calibration sample',()=>{
 const r=build(fixture(40,{step:1}));assert.equal(r.paired,40);assert.equal(r.available,7);assert.equal(r.excluded.overlap,33);assert.equal(r.scores,null);
});
test('future, invalid, duplicated or foreign records fail closed without altering the ledger',()=>{
 for(const change of [d=>d.ledger.entries[0].capturedAt=now+1,d=>d.ledger.entries.push(d.ledger.entries[0]),d=>d.ledger.entries[0].symbol='FOREIGN',d=>d.ledger.entries[0].estimate.probabilities=[.2,.2,.2],d=>d.ledger.entries[0].apiKey='SECRET',d=>d.ledger.ok=false]){
  const data=fixture(1);change(data);const before=JSON.stringify(data),r=build(data);assert.equal(r.state,'blocked');assert.equal(r.parameters,null);assert.equal(r.available,0);assert.equal(JSON.stringify(data),before);
 }
});
test('account and synthetic namespaces cannot be used as market calibration evidence',()=>{
 const data=fixture();for(const options of [{scope:'OTHER_ACCOUNT',kind:'synthetic'},{scope:identity.scope,kind:'market'},{kind:'synthetic'}])assert.equal(C.build(data,{...options,now}).state,'blocked');
});
test('report projects no account identity, raw records, private fields or price direction',()=>{
 const r=build(fixture());assert.ok(!/PRIVATE_ACCOUNT|EXAMPLE_US_EQ|source|capturedAt|apiKey|quantity/.test(JSON.stringify(r)));assert.equal(r.reviewOnly,true);assert.equal(r.direction,undefined);assert.equal(r.kind,'synthetic');assert.equal(r.modelVersions.neural,F.VERSIONS.neural);
});
test('a failed latest check is visible while prior confirmed outcomes remain historical',()=>{
 const data=fixture();data.check={state:'error'};const r=build(data);assert.match(r.warning,/istorice păstrate/);assert.equal(r.available,40);assert.equal(r.latestCheck,now);
});
test('log loss and multiclass Brier match an independent uniform-probability oracle',()=>{
 const rows=[0,1,2].map(actualClass=>({actualClass})),s=C.score(rows,()=>[1/3,1/3,1/3]);assert.ok(Math.abs(s.loss-Math.log(3))<1e-12);assert.ok(Math.abs(s.brier-2/3)<1e-12);assert.equal(s.accuracy,1/3);assert.equal(s.balanced,1/3);assert.equal(C.score([],()=>[]),null);
});
test('temperature softens finite normalized class distributions without changing their rank',()=>{
 const a=[.98,.01,.01],b=[.7,.2,.1],p=C.combine(a,b,.25,3);assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12);assert.equal(p.indexOf(Math.max(...p)),0);assert.ok(p[0]<C.combine(a,b,.25,1)[0]);const zeros=C.combine([0,0,1],[0,0,1],.5,3);assert.ok(zeros.every(Number.isFinite));
});
test('UI separates experimental evaluation from the final verdict and explains all exclusions',()=>{
 const small=U.markup(build(fixture(24)));assert.match(small,/24 \/ minimum 40/);assert.match(small,/fără probabilități/);assert.match(small,/DEMO/);assert.match(small,/nu modifică verdictul final/);assert.doesNotMatch(small,/<table/);
 const full=U.markup(build(fixture()));assert.match(full,/Calibrare · observații mai vechi/);assert.match(full,/Test · observații ulterioare/);assert.match(full,/aceleași 20 observații de test/);assert.match(full,/Log loss/);assert.match(full,/Brier/);assert.match(full,/frecvențe istorice/);assert.match(full,/nu sunt un test de semnificație/);assert.match(full,/Guo/);
});
test('compact UI keeps periods inside details and escapes all supplied report text',()=>{
 const r=build(fixture());r.label='<script>unsafe</script>';r.reason='<img src=x onerror=evil()>';const html=U.markup(r,{compact:true});assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/<details><summary>Perioade, comparații și limite/);
});
