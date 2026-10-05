import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const now=Date.parse('2026-10-04T17:00:00Z'),plain=x=>JSON.parse(JSON.stringify(x));
const core={Date:class extends Date{static now(){return now;}}};vm.createContext(core);
for(const path of ['lib/daily-series.js','lib/holdings-forecast.js','lib/holdings-forecast-backup.js'])vm.runInContext(readFileSync(path,'utf8'),core);
const F=core.HoldingsForecast,B=core.HoldingsForecastBackup,e={scope:'private-account',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'market'};
function row(model='neural',day='2026-09-25',horizon=5,identity=e){
 const at=Date.parse(day+'T21:00:00Z'),estimate=model==='garch'?{mu:.05,predictedVariance:4,constantVariance:6,ewmaVariance:5}:model==='quantile'?{prices:[98,100,104],baselinePrices:[96,99,103]}:{classIndex:2,baselineClass:1};
 return F.project({model,modelVersion:F.VERSIONS[model],horizon,trainedAt:at-1000,state:'limited',source:{t:Date.parse(day+'T13:30:00Z'),asOf:day,timezone:'America/New_York',closeMinutes:960,close:100,atrPct:2},estimate},identity,at);
}
function resolved(){const bars=['2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'].map((d,i)=>({t:Date.parse(d+'T13:30:00Z'),o:100+i,h:102+i,l:99+i,c:100+i,v:1000}));return F.verify(row(),{symbol:e.symbol,currency:e.currency,timezone:'America/New_York',closeMinutes:960,asOf:'2026-10-02',retrievedAt:now,bars},now);}
function setup(entries=[]){const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};if(entries.length)data.set(F.key(e),JSON.stringify({version:F.VERSION,entries}));return {data,storage,r:B.createRestorer(storage),entries:()=>JSON.parse(data.get(F.key(e))||'{"entries":[]}').entries};}
const backup=(rows,identity=e)=>JSON.stringify(B.create(identity,rows,now));

test('backup round trip has a checked manifest for every model and horizon without account fields',()=>{
 const rows=[row(),row('quantile'),row('garch',undefined,5),row('garch',undefined,20)],b=B.create(e,rows,now);
 assert.equal(b.result.manifest.count,4);assert.equal(b.result.manifest.models.length,4);assert.deepEqual(plain(B.parse(JSON.stringify(b),{...e,scope:'another-account'},now)),plain(rows));
 assert.ok(!/private-account|scope|apiKey|quantity/.test(JSON.stringify(b)));
});
test('the original registry export without a manifest or broker ticker remains importable',()=>{
 const b=B.create(e,[row()],now);delete b.ticker;delete b.exportedAt;delete b.result.manifest;
 assert.equal(B.parse(JSON.stringify(b),e,now).length,1);
});
test('probabilities round-trip through backup and restore without backfilling or replacing a legacy forecast',()=>{
 const r=row();r.estimate.probabilities=[.1,.2,.7];const b=B.create(e,[r],now),parsed=B.parse(JSON.stringify(b),e,now);assert.deepEqual(plain(parsed[0].estimate.probabilities),[.1,.2,.7]);const s=setup(),plan=s.r.preview(JSON.stringify(b),e,now);assert.equal(s.r.restore(plan,e,[r.id],now).ok,true);assert.deepEqual(s.entries()[0].estimate.probabilities,[.1,.2,.7]);const old=setup([row()]),before=old.data.get(F.key(e)),conflict=old.r.preview(JSON.stringify(b),e,now);assert.equal(conflict.conflicts.length,1);assert.equal(conflict.additions.length,0);assert.equal(old.data.get(F.key(e)),before);
});
test('preview is read-only and identifies new forecasts, duplicates and immutable conflicts',()=>{
 const old=row(),changed=plain(old);changed.estimate.classIndex=0;const s=setup([old,row('quantile')]),before=new Map(s.data),plan=s.r.preview(backup([changed,row('quantile'),row('garch')]),e,now);
 assert.equal(plan.ok,true);assert.equal(plan.duplicates,1);assert.equal(plan.conflicts.length,1);assert.equal(plan.additions.length,1);assert.deepEqual(s.data,before);
 const out=s.r.restore(plan,e,[plan.additions[0].id],now);assert.equal(out.saved,1);assert.equal(s.entries().find(r=>r.model==='neural').estimate.classIndex,2);assert.equal(s.entries().length,3);
});
test('key ordering and later verification times do not turn an identical forecast into a conflict',()=>{
 const r=resolved(),b=plain(r);b.estimate={baselineClass:1,classIndex:2};b.outcome.checkedAt-=1000;b.outcome.retrievedAt-=1000;b.verification.checkedAt-=1000;
 const s=setup([r]),plan=s.r.preview(backup([b]),e,now);assert.equal(plan.ok,true);assert.equal(plan.duplicates,1);assert.equal(plan.conflicts.length,0);
});
test('a different frozen outcome is a conflict and never overwrites the local result',()=>{
 const r=resolved(),b=plain(r);b.outcome.close=104;b.outcome.path.at(-1).c=104;const s=setup([r]),plan=s.r.preview(backup([b]),e,now);
 assert.equal(plan.conflicts.length,1);assert.equal(plan.additions.length,0);assert.equal(s.entries()[0].outcome.close,105);
});
test('restoration preserves origin and first outcome but requires public reverification before scoring',()=>{
 const r=resolved(),s=setup(),plan=s.r.preview(backup([r]),e,now),out=s.r.restore(plan,e,[r.id],now),restored=s.entries()[0];
 assert.equal(out.ok,true);assert.deepEqual(restored.estimate,plain(r.estimate));assert.equal(restored.capturedAt,r.capturedAt);assert.deepEqual(restored.outcome,plain(r.outcome));
 assert.equal(restored.verification.state,'unverifiable');assert.equal(restored.verification.checkedAt,null);assert.equal(F.aggregate(out.entries,'neural').n,0);assert.ok(F.validEntry(restored,e,now));
});
test('selected models and GARCH horizons restore independently',()=>{
 const rows=[row(),row('garch',undefined,5),row('garch',undefined,20)],s=setup(),plan=s.r.preview(backup(rows),e,now);
 assert.equal(s.r.restore(plan,e,[rows[2].id],now).saved,1);assert.equal(s.entries()[0].horizon,20);assert.equal(s.r.status(e,now).undoCount,1);
});
test('unknown selections, duplicated selections and fabricated previews cannot mutate the registry',()=>{
 for(const choice of ['unknown','duplicate','fabricated']){const s=setup(),plan=s.r.preview(backup([row()]),e,now),out=s.r.restore(choice==='fabricated'?plain(plan):plan,e,choice==='unknown'?['bad']:choice==='duplicate'?[row().id,row().id]:[row().id],now);assert.equal(out.ok,false);assert.equal(s.data.size,0);}
});
test('wrong listing, currency, synthetic kind and incompatible protocol are refused before any write',()=>{
 for(const mutate of [b=>b.ticker='OTHER_US_EQ',b=>b.symbol='OTHER',b=>b.currency='EUR',b=>b.kind='synthetic',b=>b.result.version='unknown',b=>b.result.reviewOnly=false]){const b=B.create(e,[row()],now);mutate(b);const s=setup(),out=s.r.preview(JSON.stringify(b),e,now);assert.equal(out.ok,false);assert.equal(s.data.size,0);}
});
test('invalid entries, duplicate IDs, future timestamps, private fields and a false manifest are blocked',()=>{
 const cases=[b=>b.result.entries.push(b.result.entries[0]),b=>b.result.entries[0].estimate.classIndex=7,b=>b.result.entries[0].capturedAt=now+1,b=>b.result.entries[0].apiKey='SECRET',b=>b.result.entries[0].source.quantity=99,b=>b.apiKey='SECRET',b=>b.result.manifest.count=2,b=>b.result.manifest.models[0].modelVersion='fake',b=>b.exportedAt=now+1,b=>b.exportedAt=1];
 for(const mutate of cases){const b=B.create(e,[row()],now);mutate(b);const s=setup(),out=s.r.preview(JSON.stringify(b),e,now);assert.equal(out.ok,false);assert.equal(s.data.size,0);}
});
test('malformed and oversize files preserve an existing registry byte for byte',()=>{
 for(const raw of ['{broken','x'.repeat(B.MAX_FILE_BYTES+1)]){const s=setup([row()]),before=s.data.get(F.key(e));assert.equal(s.r.preview(raw,e,now).ok,false);assert.equal(s.data.get(F.key(e)),before);}
});
test('corrupt local registry or archive cannot be replaced by a valid backup',()=>{
 for(const target of [F.key(e),B.archiveKey(e)]){const s=setup();s.data.set(target,'{broken');assert.equal(s.r.preview(backup([row()]),e,now).ok,false);assert.equal(s.data.get(target),'{broken');}
 const s=setup();s.data.set(F.key(e),JSON.stringify({version:F.VERSION,entries:[],apiKey:'SECRET'}));assert.equal(s.r.preview(backup([row()]),e,now).ok,false);
});
test('changes after preview and changing account block a stale restore without overwriting new data',()=>{
 for(const change of ['registry','archive','account']){const s=setup(),plan=s.r.preview(backup([row()]),e,now);if(change==='registry')s.data.set(F.key(e),JSON.stringify({version:F.VERSION,entries:[row('quantile')]}));if(change==='archive')s.data.set(B.archiveKey(e),JSON.stringify({version:B.ARCHIVE_VERSION,records:[]}));const before=new Map(s.data),out=s.r.restore(plan,change==='account'?{...e,scope:'other'}:e,[row().id],now);assert.equal(out.ok,false);assert.deepEqual(s.data,before);}
});
test('the archive must be saved before the live registry is changed; quota failure leaves it untouched',()=>{
 const s=setup([row()]),before=s.data.get(F.key(e));s.storage.setItem=(k,v)=>{if(k===B.archiveKey(e))throw Error('QuotaExceededError');s.data.set(k,v);};const plan=s.r.preview(backup([row('quantile')]),e,now),out=s.r.restore(plan,e,[row('quantile').id],now);assert.equal(out.ok,false);assert.equal(s.data.get(F.key(e)),before);assert.equal(s.data.has(B.archiveKey(e)),false);
});
test('failure of the live write retains an exact pre-write archive without claiming success',()=>{
 const s=setup([row()]),before=s.data.get(F.key(e));s.storage.setItem=(k,v)=>{if(k===F.key(e))throw Error('QuotaExceededError');s.data.set(k,v);};const plan=s.r.preview(backup([row('quantile')]),e,now),out=s.r.restore(plan,e,[row('quantile').id],now);
 assert.equal(out.ok,false);assert.equal(s.data.get(F.key(e)),before);assert.equal(JSON.parse(s.data.get(B.archiveKey(e))).records[0].before,before);assert.equal(s.r.status(e,now).undoCount,0);
});
test('undo survives reload, removes only imported rows, and archives later checks and forecasts',()=>{
 const old=resolved(),s=setup([old]),added=row('quantile'),plan=s.r.preview(backup([added]),e,now);assert.equal(s.r.restore(plan,e,[added.id],now).ok,true);
 const later=row('boosting','2026-09-28'),rows=s.entries();rows.push(later);rows[0].verification.reason='Reverificat după restaurare.';s.data.set(F.key(e),JSON.stringify({version:F.VERSION,entries:rows}));
 const reloaded=B.createRestorer(s.storage),out=reloaded.undo(e,now);assert.equal(out.ok,true);assert.equal(out.removed,1);assert.equal(s.entries().length,2);assert.ok(s.entries().some(r=>r.id===later.id));assert.equal(s.entries().find(r=>r.id===old.id).verification.reason,'Reverificat după restaurare.');
 const archive=reloaded.exportArchive(e,now);assert.equal(archive.result.records.length,2);assert.equal(JSON.parse(archive.result.records[1].before).entries.length,3);assert.ok(!JSON.stringify(archive).includes(e.scope));assert.equal(reloaded.status(e,now).undoCount,0);
});
test('multiple restorations retain every previous archive and undo in reverse order',()=>{
 const s=setup([row()]);for(const added of [row('quantile'),row('garch')]){const p=s.r.preview(backup([added]),e,now);assert.equal(s.r.restore(p,e,[added.id],now).ok,true);}
 assert.equal(s.r.undo(e,now).removed,1);assert.equal(s.entries().length,2);assert.equal(s.r.undo(e,now).removed,1);assert.equal(s.entries().length,1);assert.equal(s.r.status(e,now).undoCount,0);assert.equal(s.r.exportArchive(e,now).result.records.length,4);
});
test('undo never removes a restored ID whose original forecast was edited',()=>{
 const s=setup(),r=row(),plan=s.r.preview(backup([r]),e,now);s.r.restore(plan,e,[r.id],now);const changed=s.entries();changed[0].estimate.classIndex=0;s.data.set(F.key(e),JSON.stringify({version:F.VERSION,entries:changed}));const before=s.data.get(F.key(e));assert.equal(s.r.undo(e,now).ok,false);assert.equal(s.data.get(F.key(e)),before);
});
test('synthetic backup uses a separate storage namespace and cannot enter real performance',()=>{
 const simulated={...e,kind:'synthetic'},r=row('neural',undefined,5,simulated),s=setup(),plan=s.r.preview(backup([r],simulated),simulated,now);assert.equal(s.r.restore(plan,simulated,[r.id],now).ok,true);assert.equal(s.data.has(F.key(e)),false);assert.equal(s.r.preview(backup([r],simulated),e,now).ok,false);
});
test('a concurrent write during archival prevents the restore from replacing the newer registry',()=>{
 const s=setup([row()]),newer=JSON.stringify({version:F.VERSION,entries:[row(),row('boosting')]}),plan=s.r.preview(backup([row('quantile')]),e,now);
 s.storage.setItem=(k,v)=>{s.data.set(k,v);if(k===B.archiveKey(e))s.data.set(F.key(e),newer);};
 assert.equal(s.r.restore(plan,e,[row('quantile').id],now).ok,false);assert.equal(s.data.get(F.key(e)),newer);
});
test('backup respects the advertised capacity without truncating; a smaller selection can fit',()=>{
 const actualMax=F.MAX;F.MAX=500;try{
 const simulated={...e,kind:'synthetic'},rows=[];let day=Date.parse('2023-01-02T00:00:00Z');
 for(let i=0;i<499;i++){while([0,6].includes(new Date(day).getUTCDay()))day+=86400000;rows.push(row('neural',new Date(day).toISOString().slice(0,10),5,simulated));day+=86400000;}
 const s=setup();s.data.set(F.key(simulated),JSON.stringify({version:F.VERSION,entries:rows}));const incoming=[row('quantile',undefined,5,simulated),row('garch',undefined,20,simulated)],plan=s.r.preview(backup(incoming,simulated),simulated,now),before=s.data.get(F.key(simulated));
 assert.equal(plan.ok,true);assert.equal(s.r.restore(plan,simulated,incoming.map(r=>r.id),now).ok,false);assert.equal(s.data.get(F.key(simulated)),before);assert.equal(s.data.has(B.archiveKey(simulated)),false);
 assert.equal(s.r.restore(plan,simulated,[incoming[0].id],now).saved,1);assert.equal(JSON.parse(s.data.get(F.key(simulated))).entries.length,500);
 }finally{F.MAX=actualMax;}
});
