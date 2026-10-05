import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const sandbox={};vm.createContext(sandbox);vm.runInContext(readFileSync('lib/holdings-garch.js','utf8'),sandbox);const G=sandbox.HoldingsGarch;
const now=Date.parse('2026-10-05T08:00:00Z');
function simulated(n=1100){
 let seed=76321,close=100,h=1,t=Date.parse('2022-01-03T21:00:00Z');const bars=[];
 const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+1)/4294967297;};
 for(let i=0;i<n;i++){
  const z=Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform()),r=.02+Math.sqrt(h)*z,o=close;
  close*=Math.exp(r/100);bars.push({t,o,h:Math.max(o,close)*1.005,l:Math.min(o,close)*.995,c:close,v:100000+i});h=.04+.12*(r-.02)**2+.84*h;
  do{t+=86400000;}while([0,6].includes(new Date(t).getUTCDay()));
 }
 return bars;
}
const bars=simulated(),data=G.dataset(bars,now),result=G.evaluate(data,{now});
test('one-step shock recursion and multi-step expectation match hand calculations',()=>{
 const model={mu:.2,omega:.1,alpha:.1,beta:.8,initialVariance:1};
 assert.ok(Math.abs(G.next(model,1,2)-1.224)<1e-12);
 const path=G.path(model,1.224,20);assert.equal(path.length,20);assert.ok(Math.abs(path[1]-1.2016)<1e-12);
 for(let i=1;i<20;i++)assert.ok(Math.abs(path[i]-(.1+.9*path[i-1]))<1e-12);
 assert.ok(Math.abs(G.qlike(4,2)-(Math.log(2)+2))<1e-12);
 assert.throws(()=>G.qlike(1,0));assert.throws(()=>G.qlike(-1,2));
});
test('deterministic bounded fitting converges on simulated volatility clustering',()=>{
 const rows=data.rows.slice(0,619),a=G.fit(rows),b=G.fit(rows);
 assert.deepEqual(a,b);assert.equal(a.converged,true);assert.equal(a.boundary,false);
 assert.ok(a.omega>0&&a.alpha>0&&a.beta>0&&a.alpha+a.beta<G.CONFIG.persistenceCap);
 assert.ok(Math.abs(a.alpha-.12)<.1);assert.ok(Math.abs(a.beta-.84)<.15);
 assert.ok(Math.abs(a.nll-G.nll(a,rows))<1e-12);
});
test('expanding training prefixes end before three disjoint test windows',()=>{
 assert.equal(G.valid(result,now),true);assert.equal(result.walk.status,'evaluated');assert.equal(result.folds.length,3);
 for(const [i,f] of result.folds.entries()){
  assert.ok(f.periods.train.to<f.periods.test.from);assert.equal(f.periods.test.n,160);
  if(i)assert.ok(result.folds[i-1].periods.test.to<f.periods.test.from);
  assert.equal(f.metrics.daily.n,160);
  for(const horizon of [5,20]){
   const m=f.metrics.horizons[horizon];assert.equal(m.n,160/horizon);
   for(let k=0;k<m.blocks.length;k++){const b=m.blocks[k];assert.ok(b.origin<b.target);if(k)assert.equal(b.origin,m.blocks[k-1].target);}
  }
 }
});
test('future test returns never select training parameters or the forecast at their origin',()=>{
 const f=result.folds.at(-1),changed=structuredClone(data);changed.rows[f.start+2].r+=2;
 assert.deepEqual(G.fit(changed.rows.slice(0,f.start)),f.model);
 const metrics=G.testModel(f.model,changed,f.start,f.end);
 assert.equal(metrics.horizons[5].blocks[0].predicted,f.metrics.horizons[5].blocks[0].predicted);
 assert.notEqual(metrics.horizons[5].blocks[0].observed,f.metrics.horizons[5].blocks[0].observed);
 assert.notEqual(metrics.daily.model,f.metrics.daily.model);
});
test('current forecast filters all known returns using frozen pre-test parameters',()=>{
 const model=result.folds.at(-1).model,state=G.stateAt(model,data.rows),c=result.current;
 assert.equal(c.variancePath[0],state.variance);assert.equal(c.t,bars.at(-1).t);assert.equal(c.close,bars.at(-1).c);
 for(const h of c.horizons){const sum=c.variancePath.slice(0,h.horizon).reduce((a,b)=>a+b,0);assert.ok(Math.abs(h.cumulativePct**2-sum)<1e-10);assert.ok(Math.abs(h.dailyEquivalentPct**2-sum/h.horizon)<1e-10);assert.ok(Math.abs(h.ewmaPct**2-h.horizon*state.ewma)<1e-10);}
});
test('short histories keep one honest test and cannot become validated interpretation',()=>{
 const r=G.evaluate(G.dataset(bars.slice(0,600),now),{now});assert.equal(G.valid(r,now),true);assert.equal(r.folds.length,1);assert.equal(r.walk.status,'insufficient');assert.equal(G.assess(r).state,'limited');
 assert.throws(()=>G.dataset(bars.slice(0,509),now));
});
test('corrupted observations, jumps, chronology, missing sessions and future bars are rejected',()=>{
 for(const mutate of [b=>b[10].c=NaN,b=>b[10].v=0,b=>b[10].l=b[10].h+1,b=>b[10].t=b[9].t,b=>b[10].t+=10*86400000,b=>b[10].c*=2,b=>b.at(-1).t=now+1]){const copy=structuredClone(bars);mutate(copy);assert.throws(()=>G.dataset(copy,now));}
 const flat=bars.map(b=>({...b,o:100,h:101,l:99,c:100}));assert.throws(()=>G.evaluate(G.dataset(flat,now),{now}),/Variație insuficientă/);
});
test('validator recomputes return identity, train likelihood, test scores, blocks and current forecasts',()=>{
 const mutations=[r=>r.version='other',r=>r.config.lambda=.9,r=>r.data.rows[12].r++,r=>r.folds[0].model.nll++,r=>r.folds[0].model.alpha=-1,r=>r.folds[0].model.converged=!r.folds[0].model.converged,r=>r.folds[0].model.boundary=!r.folds[0].model.boundary,r=>r.folds[1].periods.train.to++,r=>r.folds[1].metrics.horizons[5].model++,r=>r.folds[1].metrics.horizons[20].blocks[0].origin++,r=>r.walk.wins[5]++,r=>r.current.horizons[0].cumulativePct++,r=>r.current.variancePath[0]++,r=>r.current.shockZ++];
 for(const mutate of mutations){const copy=structuredClone(result);mutate(copy);assert.equal(G.valid(copy,now),false,mutate.toString());}
 assert.equal(G.valid(result,bars.at(-1).t-1),false);
});
test('interpretation requires two winning folds including latest, both horizons and both baselines',()=>{
 const r=structuredClone(result);r.walk.status='evaluated';r.current.shockZ=1;
 for(const f of r.folds){f.model.converged=true;f.model.boundary=false;for(const h of [5,20])Object.assign(f.metrics.horizons[h],{model:1,constant:1.1,ewma:1.1});}
 r.walk.wins={5:3,20:3};assert.equal(G.assess(r).state,'descriptive');
 r.walk.wins[20]=1;assert.equal(G.assess(r).state,'no-edge');r.walk.wins[20]=2;r.folds.at(-1).metrics.horizons[20].ewma=1;assert.equal(G.assess(r).state,'no-edge');
 r.folds.at(-1).metrics.horizons[20].ewma=1.1;r.folds[0].model.boundary=true;assert.equal(G.assess(r).state,'limited');
 r.current.shockZ=6.01;assert.equal(G.assess(r).state,'drift');
});
