import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core={};vm.createContext(core);
for(const p of ['lib/holdings-neural.js','lib/holdings-quantile.js','lib/holdings-model-summary.js','lib/holdings-model-history.js','lib/holdings-model-analysis.js'])vm.runInContext(readFileSync(p,'utf8'),core);
const Q=core.HoldingsQuantile,N=core.HoldingsNeural,S=core.HoldingsModelSummary,H=core.HoldingsModelHistory,A=core.HoldingsModelAnalysis;
const now=Date.parse('2026-10-04T16:00:00Z'),bars=N.demoBars(0,Date.parse('2026-10-02T23:59:00Z')),data=Q.dataset(bars,now),result=Q.evaluate(data),copy=x=>JSON.parse(JSON.stringify(x));
const expected={symbol:'TEST',currency:'USD',asOf:'2026-10-02',demo:true},identity={scope:'demo',symbol:'TEST',currency:'USD',kind:'synthetic'};
const inspection=()=>({usable:true,record:{...expected,kind:'synthetic',trainedAt:now-1,result},assessment:Q.assess(result)});
const summary=q=>S.build({expected,quantile:q,now});
test('targets are continuous 5-session returns in current ATR, with causal features',()=>{
 const first=data.rows[0],i=bars.findIndex(b=>b.t===first.t);assert.equal(first.y,(bars[i+5].c/bars[i].c-1)*100/first.x[8]);assert.equal(first.end,bars[i+5].t);
 const changed=copy(bars);changed[i+5].c*=1.001;changed[i+5].h=Math.max(changed[i+5].h,changed[i+5].c);const other=Q.dataset(changed,now);assert.deepEqual(copy(other.rows[0].x),copy(first.x));assert.notEqual(other.rows[0].y,first.y);
});
test('every temporal boundary purges target overlap',()=>{
 const p=copy(Q.split(data.rows)),keys=['train','validation','reference','test'];for(let i=1;i<keys.length;i++)assert.ok(p[keys[i-1]].at(-1).end<p[keys[i]][0].t);
 p.train.at(-1).end=p.validation[0].t;assert.throws(()=>Q.fitPartitions(p),/suprapuse/);
});
test('non-overlap controls exclude shared closing boundaries',()=>{
 const xs=Q.blocks(data.rows);assert.ok(xs.length>50);for(let i=1;i<xs.length;i++)assert.ok(xs[i].t>xs[i-1].end);
});
test('test targets do not select parameters, stopping epochs, scaling or reference expansion',()=>{
 const p=Q.split(data.rows),a=Q.fitPartitions(p),mutated=copy(p);mutated.test.forEach(r=>r.y+=7);const b=Q.fitPartitions(mutated);
 assert.deepEqual(copy(a.model),copy(b.model));assert.deepEqual(copy(a.calibration),copy(b.calibration));assert.deepEqual(copy(a.baselineCalibration),copy(b.baselineCalibration));assert.notEqual(a.report.test.score,b.report.test.score);
});
test('reference targets adjust bounds without training the regression or changing validation selection',()=>{
 const p=Q.split(data.rows),a=Q.fitPartitions(p),b=copy(p);b.reference.forEach(r=>r.y+=8);const changed=Q.fitPartitions(b);assert.deepEqual(copy(a.model),copy(changed.model));assert.ok(changed.calibration.delta>a.calibration.delta);
});
test('pinball penalizes the appropriate tail and nominal interval is 80%, never 100%',()=>{
 assert.equal(Q.pinball(2,0,.1),.2);assert.equal(Q.pinball(0,2,.1),1.8);assert.equal(Q.pinball(1,1,.9),0);assert.equal(result.nominal,.8);
});
test('crossing raw quantiles are reordered consistently before calibration and evaluation',()=>{
 const m=copy(result.model);m.members.forEach((v,i)=>{v.w.fill(0);v.b=[3,-2,1][i];});assert.deepEqual(copy(Q.predict(m,data.current.x,1)),[-3,1,4]);
});
test('reference expansion uses a finite-sample order statistic and never shrinks bounds',()=>{
 assert.equal(Q.expansion([-2,-1,0,0,0,0]),0);assert.equal(Q.expansion([0,1,2,3,4,5]),5);
});
test('price bounds, median and width are derived from EOD and ATR, never manually populated',()=>{
 assert.ok(Q.valid(result));result.current.prices.forEach((p,i)=>assert.equal(p,data.current.close*(1+result.current.atrQuantiles[i]*data.current.atrPct/100)));assert.ok(result.current.prices[0]<=result.current.prices[1]&&result.current.prices[1]<=result.current.prices[2]);
});
test('three retrospective test windows are disjoint through the last future label',()=>{
 assert.equal(result.walk.folds.length,3);for(let i=1;i<3;i++)assert.ok(result.walk.folds[i-1].report.periods.test.lastLabel<result.walk.folds[i].report.periods.test.from);
});
test('serialized report recomputes test metrics, expansion and current predictions',()=>{
 assert.ok(Q.valid(copy(result)));
 for(const mutate of [r=>r.report.test.covered++,r=>r.report.test.score+=.1,r=>r.calibration.delta+=.1,r=>r.current.prices[0]+=1,r=>r.current.maxZ+=1,r=>r.current.t++,r=>r.walk.wins=99,r=>r.walk.folds[0].report.testRows[0].y+=1]){const r=copy(result);mutate(r);assert.equal(Q.valid(r),false);}
});
test('malformed coefficients, scales, quantiles and overlapping controls fail closed',()=>{
 for(const mutate of [r=>r.model.scale.scales[0]=0,r=>r.model.members[0].w[0]=null,r=>r.taus[0]=.05,r=>r.calibration.rows[1].t=r.calibration.rows[0].end,r=>r.report.periods.train.lastLabel=r.report.periods.validation.from]){const r=copy(result);mutate(r);assert.equal(Q.valid(r),false);}
});
test('invalid volume, future bars, out-of-order sessions and unadjusted jumps are rejected',()=>{
 for(const mutate of [b=>b[0].v=0,b=>b[0].t=now+1,b=>b[1].t=b[0].t,b=>{b[1].c=b[0].c*1.3;b[1].h=b[1].c*1.1;}]){const b=copy(bars);mutate(b);assert.throws(()=>Q.dataset(b,now));}
});
test('poor coverage, insufficient controls, drift and absent repeated advantage remain explicit',()=>{
 let r=copy(result);r.report.test.coverage=.5;assert.equal(Q.assess(r).state,'limited');r=copy(result);r.current.maxZ=7;assert.equal(Q.assess(r).state,'drift');r=copy(result);r.walk.wins=0;assert.equal(Q.assess(r).state,'no-edge');r=copy(result);r.calibration.rows=r.calibration.rows.slice(0,6);assert.equal(Q.assess(r).state,'limited');
});
test('fifth-model summary is separate, compact and excludes model parameters and broker fields',()=>{
 const q=inspection();q.record.apiKey='PRIVATE_KEY';q.record.quantity=999;const s=summary(q);assert.equal(s.version,'holdings-lab-summary-v2');assert.equal(s.total,5);assert.equal(s.available,1);assert.equal(s.cards[4].nominal,.8);assert.ok(!/PRIVATE_KEY|quantity|members|testRows/.test(JSON.stringify(s)));assert.equal('confidence' in s,false);
});
test('expired or mismatched fifth-model records never contribute',()=>{
 for(const mutate of [r=>r.trainedAt=now-1800001,r=>r.trainedAt=now+1,r=>r.currency='EUR',r=>r.asOf='2026-10-01',r=>r.symbol='OTHER',r=>r.kind='market']){const q=inspection();q.record={...q.record};mutate(q.record);assert.equal(summary(q).cards[4].available,false);}
});
test('four-model history stays readable after adding the fifth model without a migration write',()=>{
 const raw=new Map(),storage={getItem:k=>raw.get(k)||null,setItem:(k,v)=>raw.set(k,v)},store=H.createStore(storage);
 const old=S.build({expected,now,isolation:{usable:true,record:{...expected,kind:'synthetic',trainedAt:now-1,result:{version:'holdings-isolation-v1',current:{score:.4,votes:0},threshold:.6}},assessment:{state:'ordinary',message:'Descriptiv.'}}});
 assert.equal(store.save(old,identity,now).status,'saved');const initial=raw.get(H.key(identity)),fresh=H.createStore(storage);assert.equal(fresh.read(identity,now).entries[0].summary.total,4);assert.equal(raw.get(H.key(identity)),initial);
 const current=summary(inspection()),compared=H.compare(old,current,identity,now),newRow=compared.rows.find(r=>r.id==='quantile');assert.equal(newRow.added,true);assert.equal(newRow.changed,false);assert.equal(compared.beforeTotal,4);assert.equal(compared.afterTotal,5);
 assert.equal(fresh.save(current,identity,now+1).status,'saved');assert.deepEqual(copy(fresh.read(identity,now+1).entries.map(e=>e.summary.total)),[5,4]);
});
test('quantile history validates observed coverage and retains only projected results',()=>{
 const store=H.createStore({getItem:()=>null,setItem(){}}),s=summary(inspection());assert.equal(store.save(s,identity,now).status,'saved');s.cards[4].coverage=.123;assert.equal(store.save(s,identity,now).status,'blocked');
});
test('own analysis window receives intervals and honest test diagnostics, without model weights',()=>{
 const q=inspection(),r=A.build({summary:summary(q),quantile:q}),m=r.models[4];assert.equal(m.short,'Cuantile');assert.ok(m.available);assert.deepEqual(copy(m.chart.prices),copy(result.current.prices));assert.match(m.notes.join(' '),/80%/);assert.ok(!/members|testRows|apiKey/.test(JSON.stringify(m)));
 q.assessment.state='drift';const blocked=A.build({summary:summary(q),quantile:q}).models[4];assert.equal(blocked.chart,undefined);assert.equal(blocked.indicators.length,0);assert.equal(blocked.metrics.length,4);
});
test('all five tabs support End and cyclic arrow navigation',()=>{
 const tabs=['neural','boosting','hmm','isolation','quantile'].map(id=>({dataset:{modelAnalysisTab:id},setAttribute(){},focus(){this.focused=true;},click(){this.onclick();}})),nodes=new Map();
 const d={setAttribute(){},querySelector:q=>{if(!nodes.has(q))nodes.set(q,{setAttribute(){}});return nodes.get(q);},querySelectorAll:()=>tabs,showModal(){},close(){},remove(){}};
 const button={dataset:{modelAnalysisIndex:'0',modelAnalysisOpen:'quantile'}},sandbox={document:{querySelectorAll:()=>[button],querySelector:()=>button,createElement:()=>d,body:{appendChild(){}}}};vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/model-analysis.js','utf8'),sandbox);
 const ui=sandbox.HoldingsModelAnalysisUI;ui.setContext({scope:'demo',demo:true,positions:[{ticker:'TEST'}],symbol:()=> 'TEST',model:()=>({currency:'USD',asOf:'2026-10-02'})});ui.bind(()=>A.build({summary:summary(inspection()),quantile:inspection()}));button.onclick();
 tabs[0].onkeydown({key:'End',preventDefault(){}});assert.equal(tabs[4].focused,true);tabs[4].onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(tabs[0].focused,true);
});
