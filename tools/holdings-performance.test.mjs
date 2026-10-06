import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {core,fixture,e,plain} from './holdings-learning-fixtures.mjs';

const c=core(['lib/holdings-neural.js','lib/holdings-neural-evaluation.js','lib/holdings-boosting.js','lib/holdings-model-comparison.js','lib/holdings-hmm.js','lib/holdings-isolation.js','lib/holdings-quantile.js','lib/holdings-garch.js','lib/holdings-verdict.js','lib/holdings-performance.js']);
const now=Date.parse('2026-10-06T03:30:00Z'),bars=c.HoldingsNeural.demoBars(0,now),t=bars.at(-1).t;
const expected={symbol:e.symbol,currency:e.currency,kind:e.kind,asOf:c.DailySeries.date(t,'America/New_York'),t,close:bars.at(-1).c,timezone:'America/New_York',closeMinutes:960,fingerprint:c.HoldingsVerdict.fingerprint(bars)};
const d=c.HoldingsNeural.dataset(bars,now),neural=c.HoldingsNeuralEvaluation.evaluate(d.rows,d.latest);
neural.comparison=c.HoldingsModelComparison.evaluate(d.rows,d.latest,neural);
const results={neural,hmm:c.HoldingsHMM.evaluate(c.HoldingsHMM.dataset(bars,now)),isolation:c.HoldingsIsolation.evaluate(c.HoldingsIsolation.dataset(bars,now)),quantile:c.HoldingsQuantile.evaluate(c.HoldingsQuantile.dataset(bars,now)),garch:c.HoldingsGarch.evaluate(c.HoldingsGarch.dataset(bars,now),{now})};
const snapshots=Object.fromEntries(Object.entries(results).map(([id,result])=>{
 const record={...expected,sourceTime:t,sourceClose:expected.close,sourceFingerprint:expected.fingerprint,trainedAt:now-1000,quantity:999,apiKey:'SECRET',accountId:'PRIVATE',result};
 const assessment=id==='neural'?c.HoldingsNeural.assess(record,{...expected,demo:true,now}):({hmm:c.HoldingsHMM,isolation:c.HoldingsIsolation,quantile:c.HoldingsQuantile,garch:c.HoldingsGarch}[id]).assess(result);
 return [id,{usable:true,record,assessment,...(id==='neural'?{comparison:c.HoldingsModelComparison.verdict(result)}:{})}];
}));
const item=()=>fixture(c),build=options=>c.HoldingsPerformance.build({expected,snapshots,item:item(),now,...options});

test('six real model cores expose their verified chronological tests without creating prospective evidence',()=>{
 const original=JSON.stringify(results),r=build();assert.equal(r.historical.available,6);assert.equal(r.historical.models.length,6);assert.equal(r.historical.complete,6);assert.equal(r.reviewOnly,true);
 for(const model of r.historical.models){assert.equal(model.windows.length,3);let last=-Infinity;for(const w of model.windows){assert.ok(w.from>last,model.id);assert.ok(w.lastOutcome<=expected.t);last=w.lastOutcome;}assert.ok(model.metrics.length>0);}
 assert.equal(r.prospective.models.find(x=>x.id==='neural').n,40);assert.equal(JSON.stringify(results),original);assert.equal(r.verdict.checkpoint,null);
 const n=r.historical.models[0].metrics.find(x=>x.label==='Log loss').value;assert.equal(n,results.neural.walk.summary.daily.test.loss);
 const q=r.historical.models.find(x=>x.id==='quantile'),fits=results.quantile.walk.folds;assert.equal(q.metrics.find(x=>x.label==='Exemple zilnice').value,fits.reduce((sum,f)=>sum+f.report.test.n,0));
});
test('model score families remain distinct and Isolation never claims a price or anomaly accuracy',()=>{
 const r=build(),i=r.historical.models.find(x=>x.id==='isolation'),h=r.historical.models.find(x=>x.id==='hmm'),g=r.historical.models.find(x=>x.id==='garch');
 assert.ok(i.metrics.some(x=>x.label==='Sesiuni semnalate'));assert.ok(!i.metrics.some(x=>/acuratețe|loss|profit/i.test(x.label)));assert.ok(h.metrics.some(x=>x.label==='NLL · HMM'));assert.ok(g.metrics.some(x=>x.label==='QLIKE · 20 sesiuni'));assert.equal(i.windows[0].baseline,null);
 assert.equal(r.globalAccuracy,undefined);assert.equal(r.ranking,undefined);
});
test('expired or revised-source reports disappear individually without hiding the other models',()=>{
 for(const mutate of [r=>r.sourceFingerprint='revised',r=>r.currency='EUR',r=>r.trainedAt=now-1800001]){const s={...snapshots,quantile:{...snapshots.quantile,record:{...snapshots.quantile.record}}};mutate(s.quantile.record);const r=build({snapshots:s});assert.equal(r.historical.available,5);const q=r.historical.models.find(x=>x.id==='quantile');assert.equal(q.available,false);assert.equal(q.metrics.length,0);assert.equal(q.windows.length,0);assert.equal(r.verdict.direction,null);}
});
test('pending, missing-probability and overlapping outcomes are not fabricated into a probability score',()=>{
 const ledger=fixture(c,40,{step:1});let r=c.HoldingsPerformance.prospective(ledger,now),n=r.models.find(x=>x.id==='neural');assert.equal(n.all,40);assert.ok(n.n<40);assert.equal(n.probability.n,n.n);
 const missing=item();missing.ledger.entries.filter(x=>x.model==='neural').slice(0,3).forEach(x=>delete x.estimate.probabilities);r=c.HoldingsPerformance.prospective(missing,now);n=r.models.find(x=>x.id==='neural');assert.equal(n.n,40);assert.equal(n.probability.n,37);
 const empty=c.HoldingsPerformance.prospective({identity:e,ledger:{ok:true,entries:[]}},now).models.find(x=>x.id==='verdict');assert.equal(empty.probability.loss,null);assert.equal(empty.probability.brier,null);assert.equal(empty.probability.n,0);
});
test('reliability bins and proper scores reflect the frozen probability and observed class',()=>{
 const r=c.HoldingsPerformance.prospective(item(),now),n=r.models.find(x=>x.id==='neural');assert.ok(Math.abs(n.probability.loss-(-.75*Math.log(.98)-.25*Math.log(.01)))<1e-10);assert.ok(Math.abs(n.probability.brier-.4856)<1e-10);
 for(const bins of n.probability.reliability){assert.equal(bins.reduce((sum,b)=>sum+b.n,0),40);assert.ok(bins.every(b=>b.n>0||b.predicted===null&&b.observed===null));}
 const bins=n.probability.reliability[2];assert.ok(bins[4].n>0);assert.ok(Math.abs(bins[4].predicted-.98)<1e-10);
});
test('restored forecasts remain available elsewhere and do not enter captured-time performance',()=>{
 const restored=item();restored.ledger.entries.forEach(x=>x.restoredAt=now);const before=JSON.stringify(restored),r=build({item:restored});assert.equal(r.prospective.restoredExcluded,80);assert.ok(r.prospective.models.every(x=>x.n===0));assert.equal(r.historical.available,6);assert.equal(JSON.stringify(restored),before);
});
test('an invalid ledger blocks measurement and a verification failure preserves dated old results',()=>{
 const broken=item();broken.ledger.entries[0].outcome.close+=1;assert.equal(c.HoldingsPerformance.prospective(broken,now).ok,false);
 const failed=item();failed.check={state:'error'};const r=c.HoldingsPerformance.prospective(failed,now);assert.equal(r.ok,true);assert.equal(r.checkState,'error');assert.match(r.reason,/a eșuat/);assert.equal(r.models.find(x=>x.id==='neural').probability.n,40);
});
test('exported performance is a projection with no account, broker positions or model weights',()=>{
 const r=build(),json=JSON.stringify(r);assert.ok(!/SECRET|PRIVATE|quantity|apiKey|accountId|private-account|committee|trees|network|scope/.test(json));assert.ok(json.includes('holdings-performance-v1'));assert.equal(r.identity,undefined);
});
test('historical performance and proper scores never promote an unvalidated probability verdict',()=>{
 const probabilistic={version:'holdings-learning-v1',...expected,sourceFingerprint:expected.fingerprint,probabilities:[.1,.2,.7],classIndex:2,eligible:false,checkpoint:null,reason:'Minimum 40 observații noi.'};const r=build({probabilistic});assert.equal(r.verdict.checkpoint,null);assert.equal(r.verdict.direction,null);assert.ok(r.verdict.reasons.some(x=>x.includes('40')));
});
test('performance UI requests the shared six-model runner and exports only the projected report',async()=>{
 c.Date=class extends Date{static now(){return now;}};
 let run,checked,exported,paints=0;const position={ticker:e.ticker},model={...expected,price:expected.close,bars},controls={};
 c.document={querySelectorAll:selector=>controls[selector]||[]};c.HoldingsForecastUI={snapshot:()=>item(),probabilistic:()=>null,check:async(...args)=>checked=args};
 for(const [id,name] of [['neural','Neural'],['hmm','HMM'],['isolation','Isolation'],['quantile','Quantile'],['garch','Garch']])c['Holdings'+name+'UI']={inspect:()=>snapshots[id],busy:()=>false};
 c.HoldingsNeuralUI.refresh=()=>paints++;c.HoldingsNeuralUI.exportReport=r=>exported=r;c.HoldingsAutoLearningUI={busy:()=>false,tick:async(...args)=>run=args};c.HoldingsVerdictUI={busy:()=>false};
 vm.runInContext(readFileSync('holdings/performance.js','utf8'),c);c.HoldingsPerformanceUI.setContext({scope:e.scope,demo:true,positions:[position],symbol:()=>expected.symbol,model:()=>model});
 const button=(name,index)=>({dataset:{[name]:String(index)}});const train=button('performanceRun',0),check=button('performanceCheck',0),save=button('performanceExport',0),select={...button('performanceClass',0),value:'0'};
 controls['[data-performance-run]']=[train];controls['[data-performance-check]']=[check];controls['[data-performance-export]']=[save];controls['[data-performance-class]']=[select];c.HoldingsPerformanceUI.bind();train.onclick();check.onclick();save.onclick();select.onchange();await Promise.resolve();
 assert.deepEqual(run,[true,e.ticker]);assert.equal(checked[0],position);assert.equal(checked[1],true);assert.equal(exported.result.version,'holdings-performance-v1');assert.equal(paints,1);assert.ok(!/SECRET|PRIVATE|private-account/.test(JSON.stringify(exported)));
 const html=c.HoldingsPerformanceUI.markup(position,0);assert.match(html,/Performanța AI/);assert.match(html,/DEMO · date fictive/);assert.match(html,/value="0" selected/);assert.match(html,/predicțiile urmărite/i);
});
