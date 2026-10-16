import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const c={};vm.createContext(c);for(const name of ['neural','neural-evaluation','classifier'])vm.runInContext(readFileSync('lib/holdings-'+name+'.js','utf8'),c);
const C=c.HoldingsClassifier,N=c.HoldingsNeural,plain=x=>JSON.parse(JSON.stringify(x));
const now=Date.parse('2026-10-07T22:00:00Z'),bars=N.demoBars(0,now),data=C.dataset(bars,now),current={t:bars.at(-1).t,close:bars.at(-1).c,x:data.latest};
const report=C.evaluate(data,current);
// Mers aleator (mulberry32): viitorul nu se poate ghici; un model fără scurgere din viitor nu are voie să găsească avantaj.
function randomWalk(seed){let a=seed>>>0;const r=()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;},gauss=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());
 const days=[];for(let d=new Date(now-86400000);days.length<1100;d.setUTCDate(d.getUTCDate()-1))if(d.getUTCDay()>0&&d.getUTCDay()<6)days.unshift(d.getTime());let price=100;
 return days.map(t=>{const o=price;price*=Math.exp(.015*gauss());const c=price,h=Math.max(o,c)*(1+.006*r()),l=Math.min(o,c)*(1-.006*r());return {t,o,h,l,c,v:1e6*(0.6+r())};});}
const noise=randomWalk(7),noiseData=C.dataset(noise,now),noiseReport=C.evaluate(noiseData,{t:noise.at(-1).t,close:noise.at(-1).c,x:noiseData.latest});
function synthetic(){const rows=Array.from({length:900},(_,i)=>{const y=Math.floor(i/11)%3,t=1000000+i*86400000,x=Array(C.FEATURES.length).fill(0);x[1]=y*4;x[7]=50;x[8]=1;x[9]=1;return {t,end:t+5*86400000,y,x};});return {rows,latest:rows.at(-1).x};}

test('18 indicatori: cei 10 existenți + MACD, SMA și suport / rezistență, fără date din viitor',()=>{
 assert.equal(C.FEATURES.length,18);assert.deepEqual(plain(C.FEATURES.slice(0,10)),plain(N.FEATURES));
 assert.ok(data.rows.every(r=>r.x.length===18&&r.x.every(Number.isFinite)));
 const cut=bars.slice(0,900),prefix=C.dataset(cut,now);
 // Indicatorii unei zile nu se schimbă când se adaugă zilele de după ea.
 assert.deepEqual(plain(prefix.latest),plain(data.observations[900-1-199].x));
 const base=N.dataset(bars,now);assert.deepEqual(plain(data.rows.map(r=>r.y)),plain(base.rows.map(r=>r.y)));
 const i=600,x=data.observations[i-199].x,p=bars[i].c,hi20=Math.max(...bars.slice(i-20,i).map(b=>b.h)),lo60=Math.min(...bars.slice(i-60,i).map(b=>b.l));
 assert.ok(Math.abs(x[14]-(p/hi20-1)*100)<1e-9);assert.ok(Math.abs(x[17]-(p/lo60-1)*100)<1e-9);
});

test('raport reproductibil, verificabil, trei ferestre',()=>{
 assert.equal(C.valid(report),true);assert.deepEqual(plain(C.evaluate(data,current)),plain(report));
 assert.equal(report.walk.status,'complete');assert.equal(report.walk.folds.length,3);
 for(const a of C.ALGOS){const x=report.algos[a.id];assert.equal(x.support.length,3);assert.ok(Math.abs(x.support.reduce((s,v)=>s+v,0)-1)<1e-9);assert.equal(x.classIndex,x.support.indexOf(Math.max(...x.support)));}
});

test('pe mers aleator niciun algoritm nu primește avantaj (proba anti-lookahead), pe 3 serii',()=>{
 for(const seed of [7,11,23]){const b=seed===7?noise:randomWalk(seed),d=seed===7?noiseData:C.dataset(b,now),r=seed===7?noiseReport:C.evaluate(d,{t:b.at(-1).t,close:b.at(-1).c,x:d.latest});
  assert.equal(C.valid(r),true);
  for(const a of C.ALGOS){assert.notEqual(C.assess(r,a.id).state,'research',seed+' '+a.id);assert.ok(r.algos[a.id].test.balanced<.5,seed+' '+a.id+' '+r.algos[a.id].test.balanced);}}
});

test('clase separabile cunoscute: avantaj doar după ferestre, orizonturi separate și corecția Holm',()=>{
 const d=synthetic(),r=C.evaluate(d,{t:d.rows.at(-1).end,close:100,x:d.latest});assert.equal(C.valid(r),true);
 for(const a of ['boost','forest','vote']){assert.equal(r.walk.consistent[a],true,a);assert.equal(r.algos[a].holmPass,true,a);}
 assert.equal(C.assess(r).state,'research');assert.ok(r.walk.summary.vote.nonOverlap.test.n>=50);
});

test('testul nu alege nimic: schimbarea exemplelor de test nu schimbă parametrii și estimarea curentă',()=>{
 const parts=C.split(data.rows),first=C.fitPartitions(parts,current),changed=plain(parts);changed.test.forEach(r=>r.x[1]+=100);const second=C.fitPartitions(changed,current);
 for(const a of C.ALGOS){assert.deepEqual(plain(first.algos[a.id].support),plain(second.algos[a.id].support));assert.deepEqual(plain(first.algos[a.id].params),plain(second.algos[a.id].params));}
 assert.equal(first.current.maxZ,second.current.maxZ);
});

test('raportul modificat este respins',()=>{
 const report=noiseReport;assert.equal(C.valid(report),true);const bad=plain(report);bad.algos.vote.support=[.9,.05,.05];assert.equal(C.valid(bad),false);
 const bad2=plain(report);bad2.algos.boost.advantage=!bad2.algos.boost.advantage;assert.equal(C.valid(bad2),false);
 const bad3=plain(report);bad3.algos.svm.holmPass=!bad3.algos.svm.holmPass;assert.equal(C.valid(bad3),false);
 const bad4=plain(report);bad4.walk.consistent.vote=true;assert.equal(C.valid(bad4),false);
});

test('Holm: pragul se înăsprește pentru fiecare model în plus',()=>{
 assert.deepEqual(plain(C.holm([.01,.04,.03,.5])),[true,false,false,false]);
 assert.deepEqual(plain(C.holm([.001,.012,.02,.03])),[true,true,true,true]);
 assert.deepEqual(plain(C.holm([.2,.2,.2,.2])),[false,false,false,false]);
});

test('starea de abținere când indicatorii ies din domeniul antrenării',()=>{
 const r=plain(report);r.current.maxZ=7;assert.equal(C.assess(r).state,'drift');
});

test('valoarea p corespunde distribuției normale (revizia 16.10: forma veche dădea p cu ~25% prea mic)',()=>{
 // z = media / (sd/√n); n=100, sd≈1 ⇒ z≈1,96 ⇒ p≈0,025 și z≈2,326 ⇒ p≈0,010.
 const stat=z=>{const n=100,m=z/10;return {n,sum:m*n,sumSq:(n-1)*1+n*m*m};};
 assert.ok(Math.abs(C.pValue(stat(1.96))-.025)<.0005,String(C.pValue(stat(1.96))));
 assert.ok(Math.abs(C.pValue(stat(2.326))-.01)<.0003,String(C.pValue(stat(2.326))));
 assert.equal(C.holm([C.pValue(stat(2.15)),.5,.5,.5])[0],false);
});

test('parametrii afișați sunt verificați; ponderile pădurii vin doar din adâncimea aleasă',()=>{
 const bad=plain(noiseReport);bad.algos.boost.params.rounds='<img src=x onerror=alert(1)>';assert.equal(C.valid(bad),false);
 const bad2=plain(noiseReport);bad2.algos.svm.params.temperature=3;assert.equal(C.valid(bad2),false);
 const f=noiseReport.algos.forest;assert.ok(Math.abs(f.importance.reduce((a,b)=>a+b,0)-1)<1e-9);
});

test('I-642: rezultatul unei cumpărări — intrare la deschiderea următoare, stop la 1 ATR, gol sub stop la deschidere, minus 0,4%',()=>{
 const i=700,j=i-199,r=data.rows[j],entry=bars[i+1].o,stop=entry-data.observations[j].x[8]/100*bars[i].c;let out=null;
 for(let k=i+1;k<=i+5&&out===null;k++){const b=bars[k];if(k>i+1&&b.o<=stop)out=b.o;else if(b.l<=stop)out=stop;}
 assert.ok(Math.abs(r.pnl-(((out??bars[i+5].c)/entry-1)*100-.4))<1e-9);
 // Gol sub stop: deschiderea zilei a 3-a cade cu 20% ⇒ ieșire la deschidere, nu la stop.
 const b2=bars.map(b=>({...b}));for(let k=i+3;k<b2.length;k++){for(const f of ['o','h','l','c'])b2[k][f]*=.8;}
 const d2=C.dataset(b2.slice(0,i+30),now),e2=b2[i+1].o;assert.ok(Math.abs(d2.rows[j].pnl-((b2[i+3].o/e2-1)*100-.4))<1e-9);
});

test('I-642: banii se adună pe orizonturi separate, pe toate ferestrele; mereu Long ca reper',()=>{
 const m=noiseReport.walk.money;assert.ok(m.always.n>=50);for(const a of C.ALGOS){const x=m[a.id];assert.ok(x.long.n+x.short.n<=m.always.n);if(x.long.n){assert.ok(Number.isFinite(x.long.mean)&&x.long.win>=0&&x.long.win<=1);}}
 const bad=plain(noiseReport);bad.walk.money.vote.long.mean=99;assert.equal(C.valid(bad),false);
});
