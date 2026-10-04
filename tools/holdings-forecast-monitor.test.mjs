import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-04T17:00:00Z'),core={};vm.createContext(core);for(const path of ['lib/daily-series.js','lib/holdings-neural.js','lib/holdings-forecast.js','lib/holdings-forecast-monitor.js'])vm.runInContext(readFileSync(path,'utf8'),core);
const F=core.HoldingsForecast,M=core.HoldingsForecastMonitor,plain=x=>JSON.parse(JSON.stringify(x));
function item(symbol='AAA',{n=24,model='neural',pending=false,kind='synthetic'}={}){
 const identity={scope:'private-account',ticker:symbol+'_US_EQ',symbol,currency:'USD',kind},bars=core.HoldingsNeural.demoBars(0,now),entries=[];
 for(let i=0;i<n;i++){const at=bars.length-300+i*6,b=bars[at],asOf=core.DailySeries.date(b.t,'America/New_York'),capture=b.t+7*3600000;
  const estimate=model==='quantile'?{prices:[b.c*.97,b.c,b.c*1.03],baselinePrices:[b.c*.96,b.c,b.c*1.04]}:model==='hmm'?{state:0,label:'Ascendent',means:[1,1,2]}:model==='isolation'?{label:'anomaly',score:.7,threshold:.6,votes:3}:{classIndex:2,baselineClass:1};
  let r=F.project({model,modelVersion:F.VERSIONS[model],trainedAt:capture-60000,state:'simulation',source:{t:b.t,asOf,timezone:'America/New_York',closeMinutes:960,close:b.c,atrPct:2},estimate},{...identity,kind:'synthetic'},capture);
  if(!pending)r=F.verify(r,{symbol,currency:'USD',timezone:'America/New_York',bars:bars.slice(at,at+6),retrievedAt:now},now);r.kind=kind;entries.push(r);
 }
 return {identity,asOf:'2026-10-02',ledger:{ok:true,entries},check:null,quantity:999,apiKey:'SECRET'};
}
const build=(items,options={})=>M.build(items,{scope:'private-account',kind:'synthetic',model:'neural',now,...options});
test('portfolio keeps separate denominators for each instrument and never pools accuracy',()=>{const r=build([item(),item('BBB')]);assert.equal(r.totals.positions,2);assert.equal(r.totals.withResults,2);assert.deepEqual(plain(r.rows.map(x=>x.report.n)),[24,24]);assert.equal(r.accuracy,undefined);assert.equal(r.totals.n,undefined);assert.ok(!/SECRET|quantity|apiKey|private-account/.test(JSON.stringify(r)));});
test('pending five-session observations remain waiting rather than incorrect predictions',()=>{const r=build([item('AAA',{pending:true})]);assert.equal(r.rows[0].state,'waiting');assert.equal(r.rows[0].report.n,0);assert.equal(r.rows[0].report.pending,24);assert.equal(r.totals.waiting,1);assert.equal(r.totals.withResults,0);});
test('changing model displays missing evidence without borrowing another model results',()=>{const r=build([item()],{model:'quantile'});assert.equal(r.rows[0].state,'missing');assert.equal(r.rows[0].report.n,0);assert.equal(r.rows[0].entries,0);assert.equal(r.rows[0].reports.find(x=>x.model==='neural').n,24);});
test('incompatible accounts, currencies and record kinds block evaluation while preserving source',()=>{for(const mutate of [x=>x.identity.scope='other',x=>x.identity.currency='EUR',x=>x.identity.kind='market',x=>x.ledger.ok=false,x=>x.ledger.entries[0].capturedAt=now+1,x=>x.ledger.entries[0].apiKey='SECRET']){const x=item();mutate(x);const before=JSON.stringify(x),r=build([x]);assert.equal(r.rows[0].state,'blocked');assert.equal(r.rows[0].report,null);assert.equal(r.totals.blocked,1);assert.equal(JSON.stringify(x),before);assert.ok(!/SECRET/.test(JSON.stringify(r)));}});
test('duplicate ticker and duplicate observation ids cannot inflate evidence',()=>{const x=item();assert.equal(build([x,x]).totals.positions,1);x.ledger.entries.push(x.ledger.entries[0]);assert.equal(build([x]).rows[0].state,'blocked');});
test('network failure preserves historical evidence but raises a visible review state',()=>{const x=item();x.check={state:'error',at:now};const r=build([x]);assert.equal(r.rows[0].state,'blocked');assert.equal(r.rows[0].report.n,24);assert.equal(r.totals.withResults,1);assert.equal(r.totals.review,1);});
test('missing current EOD does not erase historical forecasts or relabel them as current',()=>{const x=item();x.asOf=null;const r=build([x]);assert.equal(r.rows[0].report.n,24);assert.equal(r.rows[0].asOf,null);assert.ok(r.rows[0].lastForecast<'2026-10-02');});
test('filters and search affect visible rows, while totals and full report keep all holdings',()=>{const a=item('AAA'),b=item('BBB',{pending:true}),c=item('CCC',{n:0}),r=build([a,b,c],{filter:'waiting',query:'BBB'});assert.equal(r.visible.length,1);assert.equal(r.visible[0].symbol,'BBB');assert.equal(r.rows.length,3);assert.equal(r.totals.positions,3);assert.equal(build([a,b,c],{filter:'missing'}).visible[0].symbol,'CCC');assert.equal(build([a,b,c],{sort:'ticker'}).visible[0].symbol,'AAA');});
test('descriptive models never present predictive accuracy, and an anomaly demands review',()=>{for(const model of ['hmm','isolation']){const r=build([item('AAA',{model})],{model}),row=r.rows[0];assert.equal(row.report.accuracy,undefined);assert.equal(row.report.descriptive,true);assert.equal(row.state,model==='hmm'?'context':'review');}});
test('structured coverage flags only activate after sufficient separated observations',()=>{const x=item('AAA',{model:'quantile'});for(const row of x.ledger.entries)row.estimate.prices=[row.source.close*.7,row.source.close*.71,row.source.close*.72];const r=build([x],{model:'quantile'});assert.equal(r.rows[0].report.flags.enough,true);assert.equal(r.rows[0].report.flags.underCoverage,true);assert.equal(r.rows[0].state,'review');x.ledger.entries=x.ledger.entries.slice(0,19);const s=build([x],{model:'quantile'});assert.equal(s.rows[0].report.flags.underCoverage,false);assert.equal(s.rows[0].state,'limited');});
test('a deterioration between two complete twenty-observation blocks has its own flag',()=>{const x=item('AAA',{n:40});x.ledger.entries.forEach((r,i)=>{const outcome=r.outcome.close,ret=(outcome/r.source.close-1)*100,actual=ret<=-2?0:ret>=2?2:1;r.estimate.classIndex=i<20?actual:(actual+1)%3;});const report=build([x]).rows[0].report;assert.equal(report.n,40);assert.equal(report.flags.degraded,true);assert.match(report.warning,/Degradare/);});
test('a new completed EOD marks historical results due without dropping evidence or changing forecasts',()=>{
 const x=item('AAA',{kind:'market',model:'hmm'}),before=JSON.stringify(x),later=Date.parse('2026-10-05T21:00:00Z');
 const r=build([x],{kind:'market',model:'hmm',now:later}),row=r.rows[0];
 assert.equal(row.state,'stale');assert.equal(row.freshness.expectedAsOf,'2026-10-05');assert.equal(row.freshness.checkedAsOf,'2026-10-02');assert.equal(row.freshness.needsCheck,true);
 assert.equal(row.report.n,24);assert.equal(r.totals.due,1);assert.equal(JSON.stringify(x),before);
});
test('weekends and the next unfinished session do not create false overdue checks',()=>{
 const x=item('AAA',{kind:'market',model:'hmm'});
 for(const time of [now,Date.parse('2026-10-05T17:00:00Z'),Date.parse('2026-10-05T20:14:00Z')]){
  const row=build([x],{kind:'market',model:'hmm',now:time}).rows[0];assert.equal(row.state,'context');assert.equal(row.freshness.needsCheck,false);
 }
 const row=build([x],{kind:'market',model:'hmm',now:Date.parse('2026-10-05T20:15:00Z')}).rows[0];assert.equal(row.freshness.needsCheck,true);
});
test('a current saved forecast waits normally, while an older unchecked forecast needs review of its progress',()=>{
 const x=item('AAA',{kind:'market',pending:true,n:1}),r=build([x],{kind:'market'});assert.equal(r.rows[0].state,'stale');assert.equal(r.rows[0].report.pending,1);
 const sourceTime=Date.parse('2026-10-02T13:30:00Z'),capture=Date.parse('2026-10-02T21:00:00Z'),record=x.ledger.entries[0];record.source={...record.source,t:sourceTime,asOf:'2026-10-02'};record.id='neural|2026-10-02';record.capturedAt=capture;record.trainedAt=capture-60000;
 const fresh=build([x],{kind:'market'}).rows[0];assert.equal(fresh.state,'waiting');assert.equal(fresh.freshness.needsCheck,false);assert.equal(fresh.freshness.checkedAsOf,null);
});
test('refreshing all saved verifications clears the due filter while keeping source EOD separate',()=>{
 const x=item('AAA',{kind:'market',model:'hmm'}),later=Date.parse('2026-10-05T21:00:00Z');
 assert.equal(build([x],{kind:'market',model:'hmm',now:later,filter:'due'}).visible.length,1);
 x.ledger.entries.forEach(r=>r.verification.checkedAt=later);
 const r=build([x],{kind:'market',model:'hmm',now:later,filter:'due'});assert.equal(r.visible.length,0);assert.equal(r.rows[0].state,'context');assert.equal(r.rows[0].asOf,'2026-10-02');assert.equal(r.rows[0].freshness.expectedAsOf,'2026-10-05');assert.equal(r.rows[0].freshness.checkedAsOf,'2026-10-05');
});
test('due counts cover all positions and remain independent of visible filters and review priority',()=>{
 const a=item('AAA',{kind:'market',model:'hmm'}),b=item('BBB',{kind:'market',model:'hmm'}),later=Date.parse('2026-10-05T21:00:00Z');a.check={state:'error',at:later};
 const r=build([a,b],{kind:'market',model:'hmm',now:later,filter:'due',query:'AAA'});assert.equal(r.visible.length,1);assert.equal(r.rows[0].state,'blocked');assert.equal(r.totals.due,2);
 const simulation=build([item()],{now:later});assert.equal(simulation.totals.due,0);assert.equal(simulation.rows[0].freshness.state,'simulation');
});
test('a missing selected model does not hide another model registry from batch checking',()=>{
 const row=build([item()],{model:'quantile'}).rows[0];assert.equal(row.state,'missing');assert.equal(row.entries,0);assert.equal(row.hasRegistry,true);
});
