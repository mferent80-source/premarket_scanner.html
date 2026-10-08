import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const c={};vm.createContext(c);for(const name of ['neural','neural-evaluation','knn','forecast'])vm.runInContext(readFileSync('lib/holdings-'+name+'.js','utf8'),c);
vm.runInContext(readFileSync('lib/daily-series.js','utf8'),c);
const K=c.HoldingsKNN,N=c.HoldingsNeural,plain=x=>JSON.parse(JSON.stringify(x));
const now=Date.parse('2026-10-07T22:00:00Z'),bars=N.demoBars(0,now),data=K.dataset(bars,now),current={t:bars.at(-1).t,close:bars.at(-1).c,x:data.latest};
const report=K.evaluate(data,current);
function synthetic(){const rows=Array.from({length:900},(_,i)=>{const y=Math.floor(i/11)%3,t=1000000+i*86400000;return {t,end:t+5*86400000,y,x:[0,y*4,0,0,0,0,0,50,1,1]};});return {rows,latest:rows.at(-1).x};}
test('KNN produces a reproducible real seven-model report with explained synthetic uncertainty',()=>{
 assert.equal(K.valid(report),true);assert.deepEqual(plain(K.evaluate(data,current)),plain(report));assert.equal(report.walk.status,'complete');assert.equal(report.walk.folds.length,3);assert.ok(['uncertain','no-edge','fragile'].includes(K.assess(report).state));assert.ok(report.current.neighbors.every(r=>r.end<current.t));assert.ok(report.current.support.every(v=>v>0&&v<1));assert.ok(!('probabilities' in report.current));
});
test('known separable classes can earn research only after all chronological controls pass',()=>{
 const d=synthetic(),r=K.evaluate(d,{t:d.rows.at(-1).end,close:100,x:d.latest});assert.equal(K.valid(r),true);assert.equal(r.walk.consistent,true);assert.equal(r.walk.summary.wins,3);assert.equal(K.assess(r).state,'research');assert.ok(r.walk.summary.nonOverlap.test.n>=50);
});
test('scaling and neighbor memory use only training, k only validation, and tests never select parameters',()=>{
 const parts=N.split(data.rows),first=K.fitPartitions(parts,current),changed=plain(parts);changed.test.forEach(r=>r.x[1]+=100);const second=K.fitPartitions(changed,current);
 assert.deepEqual(plain(first.model),plain(second.model));assert.deepEqual(plain(first.selection),plain(second.selection));assert.deepEqual(plain(first.current),plain(second.current));assert.deepEqual(plain(first.model.scale),plain(N.scaler(parts.train)));
 changed.validation.forEach(r=>r.x[1]+=1);const third=K.fitPartitions(changed,current);assert.deepEqual(plain(first.model.scale),plain(third.model.scale));assert.deepEqual(plain(first.model.memory),plain(third.model.memory));
});
test('purging and separate neighbor outcomes prevent leakage and repeated overlapping neighbors',()=>{
 let end=-Infinity;for(const r of report.model.memory){assert.ok(r.t>end);end=r.end;}assert.ok(end<report.report.periods.validation.from);
 let last=-Infinity;for(const f of report.walk.folds){assert.ok(f.periods.train.lastLabel<f.periods.validation.from);assert.ok(f.periods.validation.lastLabel<f.periods.test.from);assert.ok(f.periods.test.from>last);last=f.periods.test.lastLabel;}
 const parts=plain(N.split(data.rows));parts.train.at(-1).end=parts.validation[0].t;assert.throws(()=>K.fitPartitions(parts,current),/suprapun/);
 assert.throws(()=>K.predict(report.model,current.x,report.model.memory[0].t),/insuficienți/);
});
test('insufficient history, missing classes, bad OHLCV and future observations fail explicitly',()=>{
 assert.throws(()=>K.dataset(bars.slice(-400),now),/510/);for(const patch of [{v:0},{c:NaN},{t:now+1}]){const b=plain(bars);Object.assign(b.at(-1),patch);assert.throws(()=>K.dataset(b,now));}
 const d=synthetic(),parts=plain(N.split(d.rows));parts.train.forEach(r=>r.y=1);assert.throws(()=>K.fitPartitions(parts,{t:d.rows.at(-1).end,close:100,x:d.latest}),/clase/);
 const small={...data,rows:data.rows.slice(-500)},r=K.evaluate(small,current);assert.equal(K.valid(r),true);assert.equal(r.walk.status,'insufficient');assert.notEqual(K.assess(r).state,'research');
});
test('report tampering cannot change live class, provenance of neighbors or historical acceptance',()=>{
 for(const mutate of [r=>r.current.support[0]+=.01,r=>r.current.classIndex=(r.current.classIndex+1)%3,r=>r.current.neighbors[0].end=r.current.t,r=>r.model.memory[1].t=r.model.memory[0].end,r=>r.current.close=0,r=>r.selection.distanceLimit+=1,r=>r.model.k=7,r=>r.report.test.loss=-1,r=>r.walk.consistent=!r.walk.consistent,r=>r.walk.folds[1].periods.test.from=r.walk.folds[0].periods.test.lastLabel]){const r=plain(report);mutate(r);assert.equal(K.valid(r),false);}
});
test('far-away features and disagreement explicitly abstain, even with a previously strong history',()=>{
 const d=synthetic(),r=K.evaluate(d,{t:d.rows.at(-1).end,close:100,x:d.latest});r.current.maxZ=7;assert.equal(K.assess(r).state,'drift');r.current.maxZ=1;r.current.distance=r.selection.distanceLimit+1;assert.equal(K.assess(r).state,'drift');r.current.distance=0;r.current.support=[.3,.35,.35];assert.equal(K.assess(r).state,'uncertain');
});
test('KNN forecasts are frozen and evaluated as classes, without treating neighbor frequencies as calibrated probabilities',()=>{
 const F=c.HoldingsForecast,e={scope:'account',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'market'},t=Date.parse('2026-10-02T13:30:00Z'),capturedAt=t+8*3600000;
 const input={model:'knn',modelVersion:K.VERSION,trainedAt:capturedAt-1000,state:'no-edge',source:{t,asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960,close:100,atrPct:1},estimate:{classIndex:2,baselineClass:1}};
 const r=F.project(input,e,capturedAt);assert.ok(r);assert.ok(F.validEntry(r,e,capturedAt));input.estimate.classIndex=0;assert.equal(r.estimate.classIndex,2);
 const days=['02','05','06','07','08','09'],later=Date.parse('2026-10-09T22:00:00Z'),b=days.map((day,i)=>({t:Date.parse('2026-10-'+day+'T13:30:00Z'),o:100+i,h:102+i,l:99+i,c:100+i,v:10000})),out=F.verify(r,{symbol:e.symbol,currency:e.currency,timezone:r.source.timezone,bars:b,asOf:'2026-10-09',closeMinutes:960,retrievedAt:later},later);
 assert.equal(F.metric(out).correct,true);assert.equal(F.metric(out).baselineCorrect,false);assert.equal(F.report([out]).find(r=>r.model==='knn').n,1);
});
test('six-model legacy verdict ledgers remain valid and byte-identical after adding KNN',()=>{
 const F=c.HoldingsForecast,e={scope:'account',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'market'},t=Date.parse('2026-10-02T13:30:00Z'),at=t+8*3600000;
 const input={model:'verdict',modelVersion:F.VERSIONS.verdict,trainedAt:at-1000,state:'weak',source:{t,asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960,close:100,atrPct:1},estimate:{title:'Neconcludent',verdictState:'weak',direction:null,sourceFingerprint:'old-history',reasons:['Dovezi insuficiente.'],cards:Object.entries(F.VERSIONS).filter(([id])=>id!=='verdict').map(([id,version])=>({id,version,state:'no-edge',value:'Exploratoriu'}))}};
 const row=plain(F.project(input,e,at));row.modelVersion='holdings-verdict-v2';row.estimate.cards=row.estimate.cards.filter(c=>c.id!=='knn');const before=JSON.stringify(row);assert.equal(F.validEntry(row,e,at),true);assert.equal(JSON.stringify(row),before);
 row.modelVersion=F.VERSIONS.verdict;assert.equal(F.validEntry(row,e,at),false);
});
