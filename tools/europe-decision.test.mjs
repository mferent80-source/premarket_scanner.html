import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
  const c={console,Intl,Date,Map,Set,Math,Number,Array,Object,Error};c.window=c;vm.createContext(c);
  for(const file of ['lib/daily-series.js','europe-stocks/salt-list.js','europe-stocks/universe.js','europe-stocks/decision.js','europe-stocks/finance.js','europe-stocks/history.js'])vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
  return c;
}
const plain=x=>JSON.parse(JSON.stringify(x));
const now=Date.parse('2026-10-06T20:00:00Z');
function bars(n=60){return Array.from({length:n},(_,i)=>{const c=100+Math.sin(i*.6)*5+i*.1;return {t:Date.parse('2026-07-01T15:00:00Z')+i*86400000,o:c,c,h:c+1,l:c-1,v:1000000};});}
test('structural levels use completed prior sessions and a confirmed support pivot',()=>{
  const c=setup(),b=bars(),p=c.EuropeDecision.structure(b,2,'growth');
  assert.equal(p.trigger,Math.max(...b.slice(-11,-1).map(x=>x.h))+.1);
  assert.equal(p.entryHigh,p.trigger+1);assert.equal(p.stop,p.support-.5);assert.equal(p.supportKind,'pivot');
  assert.ok(p.supportDate<=b.at(-3).t);assert.ok(p.support<b.at(-1).c);assert.notEqual(p.stop,b.at(-1).c-2.5);
  const q=b.map(x=>({...x}));q.at(-1).h=9999;assert.equal(c.EuropeDecision.structure(q,2,'growth').trigger,p.trigger);
});
test('unconfirmed last-two-bar extrema are not accepted as pivots',()=>{
  const c=setup(),b=bars(20);b.at(-1).l=.01;
  assert.ok(c.EuropeDecision.pivots(b,'l',true).every(p=>p.index<b.length-2));
  const p=c.EuropeDecision.structure(b,2,'growth');assert.ok(p.supportDate===null||p.supportDate<b.at(-2).t);
});
test('extension, insufficient structure and absent resistance remain explicit',()=>{
  const c=setup(),b=bars();b.at(-1).c=300;b.at(-1).h=301;
  assert.equal(c.EuropeDecision.structure(b,2,'growth').state,'EXTENDED');
  assert.equal(c.EuropeDecision.structure(b.slice(0,10),2,'growth').state,'INVALID');
  const p=c.EuropeDecision.structure(b,2,'growth');assert.equal(p.target,null);assert.equal(p.rr,null);
});
test('context includes non-candidates but never combines different completed-session dates',()=>{
  const c=setup(),rows=[{sourceDate:'2026-10-06',market:'DE',sector:'Tech',price:110,ema50:100,ema21:105,dayChg:1,ret20:4},{sourceDate:'2026-10-06',market:'FR',sector:'Energy',price:90,ema50:100,ema21:95,dayChg:-1,ret20:-2},{sourceDate:'2026-10-05',market:'DK',sector:'Health',price:130,ema50:100,ema21:105,dayChg:1,ret20:5}];
  const b=c.EuropeDecision.breadth(rows,3);assert.equal(b.count,2);assert.equal(b.verified,3);assert.equal(b.excludedDates,1);assert.equal(b.above50,50);assert.equal(b.ret20,1);assert.equal(b.regime,'PARTIAL');assert.equal(b.markets.length,2);
});
test('risk is constrained by both allocation and loss, including round-trip costs',()=>{
  const c=setup(),p={stop:95,target:120};
  const r=c.EuropeDecision.calculateRisk({budget:1000,loss:30,fees:5,entry:100,currency:'EUR'},p,{rate:1});
  assert.equal(r.ok,true);assert.equal(r.quantity,5);assert.equal(r.risk,30);assert.equal(r.total,505);assert.equal(r.reward,95);assert.equal(r.rr,95/30);
  const allocation=c.EuropeDecision.calculateRisk({budget:250,loss:100,fees:5,entry:100,currency:'EUR'},p,{rate:1});assert.equal(allocation.quantity,2);
});
test('fractional rounding never exceeds the budget or loss limit after conversion',()=>{
  const c=setup();
  for(let i=1;i<=100;i++){
    const input={budget:100+i,loss:10+i*.07,fees:1.17,entry:37.31,fractional:true,currency:'RON'},rate={rate:5.351},p={stop:34.27,target:45};
    const r=c.EuropeDecision.calculateRisk(input,p,rate);assert.equal(r.ok,true);assert.ok(r.risk<=input.loss+1e-8);assert.ok(r.total<=input.budget+1e-8);assert.ok(Number.isInteger(Math.round(r.quantity*1000)));
  }
});
test('invalid inputs, missing FX and impossible long stops block sizing',()=>{
  const c=setup(),base={budget:1000,loss:20,fees:0,entry:100,currency:'EUR'};
  for(const patch of [{budget:''},{loss:1200},{fees:''},{fees:20},{entry:90},{entry:NaN}])assert.equal(c.EuropeDecision.calculateRisk({...base,...patch},{stop:95,target:120},{rate:1}).ok,false);
  assert.equal(c.EuropeDecision.calculateRisk(base,{stop:95},{}).ok,false);
});
function rates(){return ['USD','GBP','CHF','DKK','RON'].map((quote,i)=>({base:'EUR',quote,date:'2026-10-06',rate:[1.1269,.8488,.9359,7.4747,5.351][i]}));}
test('ECB conversions preserve orientation, date and identity; same currency is exactly one',()=>{
  const c=setup(),table=c.EuropeFinance.parseRates(rates(),now);
  const r=c.EuropeFinance.conversion(table,'GBP','RON',now);assert.equal(r.rate,5.351/.8488);assert.equal(r.date,'2026-10-06');
  assert.equal(c.EuropeFinance.conversion(null,'GBP','GBP',now).rate,1);
  assert.throws(()=>c.EuropeFinance.conversion(table,'GBX','RON',now),/Monedă/);
});
test('stale, future, mixed-date, negative or duplicate FX rows are rejected',()=>{
  const c=setup();
  for(const rows of [rates().slice(1),rates().map((r,i)=>i===1?{...r,date:'2026-10-05'}:r),rates().map(r=>({...r,date:'2026-10-07'})),rates().map(r=>({...r,date:'2026-09-20'})),rates().map((r,i)=>i===1?{...r,rate:-1}:r),rates().map((r,i)=>i===1?{...r,quote:'USD'}:r)])assert.throws(()=>c.EuropeFinance.parseRates(rows,now));
  const t=c.EuropeFinance.parseRates(rates(),now);assert.throws(()=>c.EuropeFinance.conversion(t,'GBP','RON',now+7*3600000),/verificat/);
});
function calendar(c,status='estimated'){
  const i=c.EuropeUniverse.describe('SAP.DE');return {schema:1,sourceId:c.EuropeUniverse.source.id,generatedAt:new Date(now).toISOString(),rows:[{symbol:i.symbol,isin:i.isin,status,estimateFlag:status==='estimated',dates:['2026-10-09'],sourceUrl:'https://finance.yahoo.com/quote/SAP.DE/',checkedAt:new Date(now).toISOString()}]};
}
test('earnings keep estimates, proximity, unknown and stale status distinct',()=>{
  const c=setup(),i=c.EuropeUniverse.describe('SAP.DE'),d=c.EuropeFinance.parseCalendar(calendar(c),c.EuropeUniverse,now);
  const e=c.EuropeFinance.earnings(d,i,now);assert.equal(e.status,'estimated');assert.equal(e.days,3);assert.equal(e.near,true);
  assert.equal(c.EuropeFinance.earnings(d,c.EuropeUniverse.describe('SHEL.L'),now).status,'unknown');
  assert.equal(c.EuropeFinance.earnings(d,i,now+6*86400000).status,'stale');
  const future=c.EuropeFinance.earnings(d,i,now+4*86400000);assert.equal(future.status,'unknown');assert.equal(future.near,false);
});
test('a calendar cannot substitute another ISIN, symbol or source version',()=>{
  const c=setup();
  for(const edit of [d=>d.sourceId='old',d=>d.rows[0].isin='DE0007664039',d=>d.rows[0].sourceUrl='https://example.com/',d=>d.rows.push(d.rows[0])]){const d=calendar(c);edit(d);assert.throws(()=>c.EuropeFinance.parseCalendar(d,c.EuropeUniverse,now));}
});
function observation(c,n=1,cat='earlyLong',price=100){
  const instrument=c.EuropeUniverse.describe('SAP.DE'),b=Array.from({length:n},(_,i)=>({t:Date.parse('2026-10-01T15:00:00Z')+i*86400000,c:100+i,o:100+i,h:101+i,l:99+i,v:1000000}));
  b.at(-1).c=price;
  const series={bars:b,asOf:new Date(b.at(-1).t).toISOString().slice(0,10),timezone:'Europe/Berlin',currency:'EUR'};
  return {instrument,series,candidate:cat?{symbol:instrument.symbol,isin:instrument.isin,category:cat,sourceDate:series.asOf,price,plan:{stop:90,support:92,version:c.EuropeDecision.VERSION}}:null};
}
test('history starts prospectively and repeated same-session scans create no duplicates',()=>{
  const c=setup(),o=observation(c),h=c.EuropeHistory.update(c.EuropeHistory.empty(),[o],now);
  assert.equal(h.document.entries.length,1);assert.deepEqual(plain(h.document.entries[0].outcomes),{});
  const repeat=c.EuropeHistory.update(h.document,[o],now+1000);assert.equal(repeat.document.entries.length,1);
  assert.equal(c.EuropeHistory.badge(repeat.document,o.candidate),'Nou în această sesiune');
});
test('Early to confirmed stays one observation and retains its initial category',()=>{
  const c=setup(),first=c.EuropeHistory.update(c.EuropeHistory.empty(),[observation(c)],now).document;
  const o=observation(c,2,'growth',101),next=c.EuropeHistory.update(first,[o],now).document,e=next.entries[0];
  assert.equal(next.entries.length,1);assert.equal(e.category,'earlyLong');assert.equal(e.currentCategory,'growth');assert.equal(e.transitions.length,2);assert.equal(e.confirmedAt,o.series.asOf);assert.equal(c.EuropeHistory.badge(next,o.candidate),'Early → confirmat');
});
test('forward returns count completed sessions; no immature horizons or double counting',()=>{
  const c=setup(),first=c.EuropeHistory.update(c.EuropeHistory.empty(),[observation(c)],now).document;
  const next=c.EuropeHistory.update(first,[observation(c,11,'growth',110)],now).document,e=next.entries[0];
  assert.ok(Math.abs(e.outcomes[5].pct-5)<1e-8);assert.ok(Math.abs(e.outcomes[10].pct-10)<1e-8);assert.equal(e.outcomes[20],undefined);
  const stats=c.EuropeHistory.stats(next.entries);assert.equal(stats.find(s=>s.category==='earlyLong').outcomes[10].n,1);assert.equal(stats.find(s=>s.category==='growth').outcomes[10].n,0);
});
test('lost support invalidates; no-candidate leaves criteria; data failures do neither',()=>{
  const c=setup(),first=c.EuropeHistory.update(c.EuropeHistory.empty(),[observation(c)],now).document;
  const failed=c.EuropeHistory.update(first,[],now).document;assert.equal(failed.entries[0].active,true);
  const invalid=c.EuropeHistory.update(first,[observation(c,2,null,91)],now).document;assert.equal(invalid.entries[0].status,'INVALIDATED');assert.equal(invalid.entries[0].active,false);
  const left=c.EuropeHistory.update(first,[observation(c,2,null,103)],now).document;assert.equal(left.entries[0].status,'LEFT');
});
test('historical price revisions suspend outcomes rather than fabricating performance',()=>{
  const c=setup(),first=c.EuropeHistory.update(c.EuropeHistory.empty(),[observation(c)],now).document,o=observation(c,11,'growth',110);o.series.bars[0].c=50;
  const next=c.EuropeHistory.update(first,[o],now).document;assert.ok(next.entries[0].review);assert.deepEqual(plain(next.entries[0].outcomes),{});assert.equal(c.EuropeHistory.stats(next.entries)[1].count,0);
});
test('history storage is isolated; malformed existing data is reported and never silently replaced',()=>{
  const c=setup(),storage={getItem:key=>key===c.EuropeHistory.KEY?'invalid-json':null};
  const read=c.EuropeHistory.read(storage,c.EuropeUniverse);assert.match(read.error,/nu va fi suprascris/);
  assert.notEqual(c.EuropeHistory.KEY,'tt_journal_v1');
  assert.match(c.EuropeHistory.save({setItem(){throw Error('quota');}},c.EuropeHistory.empty()),/nu a putut fi salvat/);
});
test('published calendar rows all use exact Salt identities and explicit provenance',()=>{
  const c=setup(),data=JSON.parse(readFileSync('europe-stocks/calendar.json','utf8')),stamp=Date.parse(data.generatedAt)+1000;
  const parsed=c.EuropeFinance.parseCalendar(data,c.EuropeUniverse,stamp);assert.equal(parsed.items.size,204);
  for(const row of data.rows){assert.equal(c.EuropeUniverse.describe(row.symbol).isin,row.isin);if(row.status==='confirmed')assert.equal(row.estimateFlag,false);if(row.status==='estimated')assert.ok(row.estimateFlag===true||row.dates.length>1);if(row.status!=='unknown')assert.ok(row.dates.length);}
});
