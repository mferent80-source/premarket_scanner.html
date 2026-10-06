import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {core,e,dates,fixture,plain} from './holdings-learning-fixtures.mjs';

const c=core(),L=c.HoldingsLearning,now=Date.parse('2026-10-05T18:00:00Z');
test('progress uses the operational latest-twenty split and counts pending pairs without treating them as outcomes',()=>{
 const item=fixture(c,39),before=JSON.stringify(item),r=L.update(null,item,now).progress;
 assert.equal(r.available,39);assert.equal(r.current,39);assert.equal(r.target,40);assert.equal(r.remaining,1);assert.equal(r.phase,'collecting');
 assert.equal(r.split.fit.n,19);assert.equal(r.split.test.n,20);assert.equal(r.classesReady,false);assert.equal(r.latest,null);assert.equal(JSON.stringify(item),before);
 const pending=fixture(c,40);for(let i=pending.ledger.entries.length-2;i<pending.ledger.entries.length;i++){const f=pending.ledger.entries[i];pending.ledger.entries[i]=c.HoldingsForecast.project({model:f.model,modelVersion:f.modelVersion,trainedAt:f.trainedAt,state:f.state,source:f.source,estimate:f.estimate},e,f.capturedAt);}
 const p=L.update(null,pending,now).progress;assert.equal(p.available,39);assert.equal(p.pending,1);assert.equal(p.remaining,1);
});
test('forty observations with a missing class show the actual class shortage and cannot create a checkpoint',()=>{
 const out=L.update(null,fixture(c,40,{onlyClass:1}),now),r=out.progress;
 assert.equal(out.state.champion,null);assert.equal(r.phase,'classes');assert.equal(r.current,40);assert.equal(r.remaining,0);assert.equal(r.classesReady,false);
 assert.deepEqual(plain(r.split.fit.counts),[0,20,0]);assert.deepEqual(plain(r.split.test.counts),[0,20,0]);assert.equal(r.classMinimum,4);assert.equal(r.latest,null);
});
test('a verified candidate exposes exactly its held-out periods and scores, then starts collecting twenty new results',()=>{
 const item=fixture(c),out=L.update(null,item,now),r=out.progress,champion=out.state.champion;
 assert.equal(r.phase,'validated');assert.equal(r.reviewed,true);assert.equal(r.current,0);assert.equal(r.target,20);assert.equal(r.remaining,20);assert.equal(r.latest.promoted,true);
 assert.equal(r.latest.id,champion.id);assert.deepEqual(plain(r.latest.scores),plain(champion.scores));assert.equal(r.latest.fit.n,20);assert.equal(r.latest.test.n,20);
 assert.equal(r.latest.fit.to,champion.fitOrigins.at(-1));assert.equal(r.latest.test.from,champion.testOrigins[0]);assert.ok(r.latest.fit.lastOutcome<r.latest.test.from);
 assert.equal(r.reviewOnly,true);assert.equal(r.direction,undefined);assert.equal(r.eligible,undefined);assert.doesNotMatch(JSON.stringify(r),/private-account|scope|capturedAt|evidence|quantity|apiKey/);
});
test('progress tracks genuinely new origins and preserves the incumbent after an unsuccessful replacement',()=>{
 const first=L.update(null,fixture(c),dates[239]+9*3600000),before=JSON.stringify(first.state),nineteen=L.update(first.state,fixture(c,59),now);
 assert.equal(nineteen.progress.current,19);assert.equal(nineteen.progress.remaining,1);assert.equal(nineteen.progress.target,20);assert.equal(nineteen.changed,false);
 const twenty=L.update(first.state,fixture(c,60),now);assert.equal(twenty.changed,true);assert.equal(twenty.progress.current,0);assert.equal(twenty.progress.latest.promoted,false);assert.equal(twenty.progress.latest.eligible,true);
 assert.equal(twenty.progress.checkpoint,first.state.champion.id);assert.equal(twenty.state.champion.id,first.state.champion.id);assert.equal(JSON.stringify(first.state),before);
});
test('a rejected candidate shows its failed held-out comparison without activating a direction',()=>{
 const item=fixture(c);item.ledger.entries.forEach(r=>{r.estimate.classIndex=0;r.estimate.probabilities=[1/3,1/3,1/3];});
 const out=L.update(null,item,now);assert.equal(out.changed,true);assert.equal(out.state.champion,null);assert.equal(out.progress.phase,'rejected');assert.equal(out.progress.latest.promoted,false);assert.equal(out.progress.latest.eligible,false);
 assert.equal(out.progress.latest.scores.candidate.n,20);assert.ok(out.progress.latest.scores.candidate.loss>=out.progress.latest.scores.prior.loss-L.POLICY.lossMargin);
});
test('restored estimates remain visible as exclusions and never count toward operational readiness',()=>{
 const item=fixture(c);item.ledger.entries.forEach(r=>r.restoredAt=now);const out=L.update(null,item,now),r=out.progress;
 assert.equal(r.available,0);assert.equal(r.current,0);assert.equal(r.remaining,40);assert.equal(r.excluded.restored,40);assert.equal(r.latest,null);assert.equal(out.state.champion,null);
});
test('changed evidence and malformed saved state block readiness without showing unverified scores',()=>{
 const item=fixture(c),state=L.update(null,item,now).state;item.ledger.entries[0].estimate.probabilities=[.1,.85,.05];
 const changed=L.update(state,item,now);assert.equal(changed.ok,false);assert.equal(changed.progress.phase,'blocked');assert.equal(changed.progress.latest,null);assert.equal(changed.progress.checkpoint,null);
 const malformed=L.update({...plain(state),reviews:{}},fixture(c),now);assert.equal(malformed.ok,false);assert.equal(malformed.progress.phase,'blocked');assert.equal(malformed.progress.latest,null);
});
test('a source error preserves historical counts but marks readiness as requiring a new source check',()=>{
 const item=fixture(c),state=L.update(null,item,now).state;item.check={state:'error'};const out=L.update(state,item,now);
 assert.equal(out.progress.available,40);assert.equal(out.progress.sourceError,true);assert.equal(out.progress.phase,'source-error');assert.equal(out.state.champion.id,state.champion.id);
});
test('the real learning panel renders collection, class shortages and verified held-out scores',()=>{
 const ui=core(['lib/holdings-auto-learning.js']);ui.document={hidden:false,addEventListener(){},querySelectorAll:()=>[]};ui.setInterval=()=>1;
 let out=ui.HoldingsLearning.update(null,fixture(ui,39),now);ui.HoldingsForecastUI={autoStorage:()=>({getItem:()=>null}),learning:()=>out};
 vm.runInContext(readFileSync('holdings/learning.js','utf8'),ui);const p={ticker:e.ticker};ui.HoldingsAutoLearningUI.setContext({scope:e.scope,demo:true,positions:[p],symbol:()=>e.symbol,model:()=>({currency:e.currency})});
 let html=ui.HoldingsAutoLearningUI.markup(p,0);assert.match(html,/aria-label="Progres către verdict probabilistic"/);assert.match(html,/39 \/ 40/);assert.match(html,/Mai sunt necesare cel puțin 1 rezultat nou/);assert.doesNotMatch(html,/\+progressMarkup|<th>Log loss/);
 out=ui.HoldingsLearning.update(null,fixture(ui,40,{onlyClass:1}),now);html=ui.HoldingsAutoLearningUI.markup(p,0);assert.match(html,/Clase insuficient reprezentate/);assert.match(html,/class="learning-shortage">0 \/ 4/);assert.doesNotMatch(html,/Candidatul a fost adoptat/);
 out=ui.HoldingsLearning.update(null,fixture(ui),now);html=ui.HoldingsAutoLearningUI.markup(p,0);assert.match(html,/Rezultate noi pentru următoarea evaluare · 0 \/ 20/);assert.match(html,/Candidatul a fost adoptat/);assert.match(html,/Log loss/);assert.match(html,/Frecvențe din calibrare/);assert.match(html,/Demo separat/);
 out=ui.HoldingsLearning.update({...plain(out.state),champion:{id:'broken'},reviews:{}},fixture(ui),now);html=ui.HoldingsAutoLearningUI.markup(p,0);assert.match(html,/Învățare de verificat/);assert.doesNotMatch(html,/Candidatul a fost adoptat|<th>Log loss/);
});
