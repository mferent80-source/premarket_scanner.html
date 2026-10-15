import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const NOW=Date.parse('2026-10-15T18:00:00Z'), DAY=86400000, SCOPE='live:main';
const ISO=t=>new Date(t).toISOString(), plain=x=>JSON.parse(JSON.stringify(x));
const PORTFOLIO='tt_trading212_portfolio_v1', HISTORY='tt_trading212_account_history_v1', FILLS='tt_trading212_fills_v1';
function context(extra={}) {
 const c={Date,Intl,URL,AbortController,setTimeout,clearTimeout,...extra}; vm.createContext(c);
 for(const path of ['lib/trading212-snapshot.js','lib/exchange-calendar.js','lib/daily-series.js','lib/indicators.js','lib/holdings-events.js','lib/breadth.js','lib/today-dashboard.js'])vm.runInContext(readFileSync(path,'utf8'),c,{filename:path});
 return c;
}
const C=context();
function storage(values={}) { const map=new Map(Object.entries(values).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])),reads=[];return {map,reads,getItem(k){reads.push(k);return map.get(k)??null;},setItem(){throw Error('Financial writes are forbidden in the preview.');},removeItem(){throw Error('Financial deletion is forbidden in the preview.');}}; }
const snapshot=(extra={})=>({environment:'live',active:true,fetchedAt:ISO(NOW-60000),summary:{currency:'RON',totalValue:27000,available:7000,invested:20000,unrealized:-200,realized:350},positions:[{ticker:'UHS_US_EQ',name:'Universal Health Services',quantity:2,value:2000,unrealized:-25,currency:'RON',instrumentCurrency:'USD'}],...extra});
const observations=()=>[{at:ISO(NOW-8*DAY),total:21000,currency:'RON'},{at:ISO(NOW-DAY),total:27000,currency:'RON'}];
function make(options={}) {return C.TodayDashboardModel.create({storage:storage(),now:()=>NOW,loadBreadth:async()=>breadthFixture(),...options});}
function breadthFixture() {return {schemaVersion:1,checkedAt:ISO(NOW-6*3600000),sources:{sp500:{fetchStatus:'OK',asOf:'2026-10-14',latest:{above50:.358,above200:.512},history:[{date:'2026-10-13',above50:.35,above200:.50},{date:'2026-10-14',above50:.358,above200:.512}]},sp500Price:{fetchStatus:'OK',asOf:'2026-10-14',valid:433,total:500,latest:{above50:.344,above200:.471}}},full:{status:'PARTIAL',sources:{sp:{fetchStatus:'OK',usable:true,asOf:'2026-10-14'},uptrend:{fetchStatus:'OK',usable:true,asOf:'2026-10-14'}},engine:{data:{sp:{data_date:'2026-10-14'},uptrend:{data_date:'2026-10-14'}},master:{score:-4,stance:'RISK-OFF'}}}};}
function bars(symbol,extra={}) {
 const out=[];let value=symbol==='^TNX'?4:symbol==='^VIX'?16:100;
 for(let t=Date.parse('2026-06-15T13:30:00Z');t<=Date.parse('2026-10-15T13:30:00Z');t+=DAY){if([0,6].includes(new Date(t).getUTCDay()))continue;value+=symbol==='^TNX'?.001:.1;out.push({t,o:value,h:value+.05,l:value-.05,c:value,v:1000});}
 out.at(-1).c=999;out.at(-1).h=1000;
 Object.defineProperty(out,'meta',{value:{symbol,currency:['SPY','QQQ'].includes(symbol)?'USD':null,exchange:'PCX',timezone:'America/New_York',regularEnd:Date.parse('2026-10-15T20:00:00Z'),provider:'Yahoo Finance',interval:'1d',readAt:NOW,retrievedAt:NOW-30000,quoteAt:NOW-60000,delayMinutes:15,...extra}}); return out;
}
const fill=(id='u1',extra={})=>({id,ticker:'UHS_US_EQ',side:'SELL',date:ISO(NOW-DAY),quantity:2,price:230,priceCurrency:'USD',currency:'RON',realized:120,...extra});
const ledger=items=>({accounts:{[SCOPE]:{environment:'live',complete:true,syncStatus:'complete',items}}});
const record=value=>({revision:2,raw:JSON.stringify(value),localRaw:null});

test('account preserves an older valid amount as stale and never mutates account/history/settings',()=>{
 const s=storage({[PORTFOLIO]:{[SCOPE]:snapshot({fetchedAt:ISO(NOW-DAY)})},[HISTORY]:{[SCOPE]:observations()},settings:{keep:true}}),before=[...s.map];
 const a=make({storage:s}).account();assert.equal(a.state,'stale');assert.equal(a.fresh,false);assert.equal(a.total,27000);assert.equal(a.available,7000);assert.equal(a.chartCurrency,'RON');assert.equal(a.points.length,2);assert.equal(a.positions[0].weight,2000/27000*100);assert.deepEqual(plain(a.newsSymbols),['UHS']);assert.match(a.cashWarning,/nu reprezintă randamentul/);assert.equal(a.returnPct,undefined);assert.deepEqual([...s.map],before);
});
test('active live account stays selected even if partial; no other account or demo fills its missing amount',()=>{
 const s=storage({[PORTFOLIO]:{other:snapshot({active:false,fetchedAt:ISO(NOW),summary:{currency:'USD',totalValue:99999}}),demo:snapshot({environment:'demo',summary:{currency:'RON',totalValue:88888}}),[SCOPE]:snapshot({summary:null,positions:null})},[HISTORY]:{other:observations()}});
 const a=make({storage:s}).account();assert.equal(a.state,'partial');assert.equal(a.scope,SCOPE);assert.equal(a.total,null);assert.equal(a.points.length,0);assert.equal(a.positions.length,0);
});
test('future snapshots, invalid amount strings and negative cash cannot be displayed as valid values',()=>{
 const future=make({storage:storage({[PORTFOLIO]:{[SCOPE]:snapshot({fetchedAt:ISO(NOW+120000)})}})}).account();assert.equal(future.state,'error');assert.equal(future.total,null);
 const s=snapshot();s.summary.totalValue='27000';s.summary.available=-10;const a=make({storage:storage({[PORTFOLIO]:{[SCOPE]:s}})}).account();assert.equal(a.state,'partial');assert.equal(a.total,null);assert.equal(a.available,null);
});
test('raw account chart rejects mixed currencies, future observations and conflicting same-time valuations',()=>{
 for(const xs of [[...observations(),{at:ISO(NOW-2*DAY),total:40,currency:'USD'}],[...observations(),{at:ISO(NOW+120000),total:28000,currency:'RON'}],[...observations(),{...observations()[0],total:1}]]){
  const a=make({storage:storage({[PORTFOLIO]:{[SCOPE]:snapshot()},[HISTORY]:{[SCOPE]:xs}})}).account();assert.equal(a.points.length,0);assert.ok(a.historyReason);assert.ok(a.issues.length);assert.equal(a.total,27000);
 }
});
test('zero equity remains a valid reported balance and mixed-wallet positions have no fabricated weight',()=>{
 const x=snapshot();x.summary.totalValue=0;x.positions[0].currency='USD';const a=make({storage:storage({[PORTFOLIO]:{[SCOPE]:x}})}).account();assert.equal(a.state,'ready');assert.equal(a.total,0);assert.equal(a.positions[0].weight,null);
});
test('blocked storage getters do not prevent loading the demo adapter or manufacture missing financial records',()=>{
 const c=context();Object.defineProperty(c,'localStorage',{get(){throw Error('Denied');}});Object.defineProperty(c,'indexedDB',{get(){throw Error('Denied');}});const m=c.TodayDashboardModel.create({now:()=>NOW});assert.equal(m.account().state,'error');
});
test('market uses completed provider-identified bars and keeps Treasury yield in percent and VIX in points',async()=>{
 const calls=[],m=make({data:{fetchStock:async(s,o)=>{calls.push([s,o]);return bars(s);}}}),r=await m.market();
 assert.deepEqual(calls.map(x=>x[0]),['SPY','QQQ','^VIX','^TNX']);assert.ok(calls.every(([,o])=>o.range==='1y'&&o.interval==='1d'&&o.ttl===0));
 for(const x of r.items){assert.equal(x.state,'ready');assert.equal(x.asOf,'2026-10-14');assert.ok(x.price<999);assert.equal(x.readAt,NOW-30000);assert.equal(x.points.at(-1).value,x.price);assert.match(x.reason,/nu este/);assert.notEqual(x.indicators.rsi14,null);assert.notEqual(x.indicators.sma50,null);}
 const t=r.items.find(x=>x.symbol==='^TNX');assert.equal(t.unit,'%');assert.ok(t.price>4&&t.price<5);assert.equal(t.currency,null);assert.equal(r.items.find(x=>x.symbol==='^VIX').unit,'puncte');assert.match(r.items[0].label,/ETF SPY/);
});
test('market cache is isolated in memory, force bypasses it and caller edits do not corrupt cached data',async()=>{
 let calls=0;const m=make({data:{fetchStock:async s=>{calls++;return bars(s);}}});const first=await m.market();first.items[0].price=0;assert.ok((await m.market()).items[0].price>0);assert.equal(calls,4);await m.market({force:true});assert.equal(calls,8);
});
test('the ten-minute market cache expires at a newly completed US session instead of keeping yesterday marked latest',async()=>{
 let clock=Date.parse('2026-10-15T20:10:00Z'),calls=0;const m=make({now:()=>clock,data:{fetchStock:async s=>{calls++;return bars(s);}}});
 const before=await m.market();assert.equal(before.items[0].asOf,'2026-10-14');assert.equal(calls,4);
 clock=Date.parse('2026-10-15T20:16:00Z');const after=await m.market();assert.equal(calls,8);assert.equal(after.items[0].asOf,'2026-10-15');assert.equal(after.breadth.state,'stale');assert.equal(after.breadth.stance,null);
});
test('unverified source identity or currency produces no chart or zero-price fallback',async()=>{
 const r=await make({data:{fetchStock:async s=>bars(s,{symbol:s==='SPY'?'QQQ':s,currency:s==='QQQ'?'EUR':null})}}).market();assert.equal(r.items[0].state,'error');assert.equal(r.items[0].price,null);assert.equal(r.items[0].points.length,0);assert.equal(r.items[1].state,'error');
});
test('a stale closed-series rejection is explicit and current breadth survives slow or failed Yahoo providers',async()=>{
 const r=await make({requestTimeout:10,data:{fetchStock:()=>new Promise(()=>{})}}).market();assert.ok(r.items.every(x=>x.state==='error'&&x.price===null));assert.equal(r.breadth.state,'ready');assert.equal(r.breadth.points.at(-1).value,35.8);
 const stale=await make({data:{fetchStock:async s=>bars(s)},series:{read(){throw Error('DATE STALE: old session');},expected:()=> '2026-10-14'}}).market();assert.ok(stale.items.every(x=>x.state==='stale'&&x.price===null));
});
test('breadth keeps original S&P500 history and percentages separate from a differently covered Yahoo sample',async()=>{
 const r=await make({data:{fetchStock:async()=>{throw Error('offline');}}}).market(),b=r.breadth;assert.equal(b.above50,35.8);assert.equal(b.above200,51.2);assert.equal(b.points.at(-1).value,35.8);assert.equal(b.stance,'RISK-OFF');assert.equal(b.score,-4);assert.match(b.coverage,/2\/4/);assert.match(b.source,/originală/);
});
test('old or malformed breadth is marked stale/error without fabricating a current verdict',async()=>{
 const old=breadthFixture();old.sources.sp500.asOf='2026-10-13';old.sources.sp500.history.pop();const r=await make({loadBreadth:async()=>old,data:{fetchStock:async()=>{throw Error('offline');}}}).market();assert.equal(r.breadth.state,'stale');assert.equal(r.breadth.stance,null);
 const bad=breadthFixture();bad.sources.sp500.history[1].above50=2;const x=await make({loadBreadth:async()=>bad,data:{fetchStock:async()=>{throw Error('offline');}}}).market();assert.equal(x.breadth.state,'error');assert.equal(x.breadth.points.length,0);assert.equal(x.breadth.above50,null);
});
const article=(name='SPY',extra={})=>({title:'Market report',link:'https://publisher.test/story',publisher:'Publisher',providerPublishTime:(NOW-60000)/1000,relatedTickers:[name],...extra});
test('news keeps real publication timestamps, exact symbols, safe links and deduplicates across symbols',async()=>{
 const calls=[],m=make({data:{fetchJSON:async u=>{calls.push(u);const s=new URL(u).searchParams.get('q');return {quotes:[{symbol:s}],news:[article(s),article(s,{link:'javascript:alert(1)'}),article(s,{link:'https://user:pass@publisher.test/private'}),article(s,{providerPublishTime:(NOW+120000)/1000}),article('OTHER',{link:'https://publisher.test/other'})]};}}});
 const r=await m.news({symbols:['SPY','QQQ','SPY','IWM','AAPL','bad-token']});assert.equal(calls.length,3);assert.equal(r.state,'ready');assert.equal(r.items.length,1);assert.equal(r.items[0].publishedAt,NOW-60000);assert.equal(r.items[0].source,'Yahoo Finance');assert.equal(r.items[0].url,'https://publisher.test/story');
});
test('null/malformed news responses stay unavailable, valid empty responses stay empty and partial outages are labeled',async()=>{
 const no=await make({data:{fetchJSON:async()=>null}}).news();assert.equal(no.state,'error');assert.equal(no.items.length,0);
 const empty=await make({data:{fetchJSON:async u=>({quotes:[{symbol:new URL(u).searchParams.get('q')}],news:[]})}}).news();assert.equal(empty.state,'empty');
 const partial=await make({data:{fetchJSON:async u=>new URL(u).searchParams.get('q')==='SPY'?{quotes:[{symbol:'SPY'}],news:[article()]}:null}}).news();assert.equal(partial.state,'partial');assert.equal(partial.items.length,1);
});
test('news fallback reuses only an existing key and ignores wrapper false-availability with a Yahoo null result',async()=>{
 let calls=0;const m=make({data:{fetchJSON:async u=>{assert.ok(!u.includes('existing-secret'));return null;}},newsKey:()=> 'existing-secret',events:{news:()=>[],fetchNews:async(s,key)=>{calls++;assert.equal(key,'existing-secret');return {source:'Yahoo Finance',available:true,news:[]};}}});assert.equal((await m.news()).state,'error');assert.equal(calls,2);
});
test('activity selects exact live scope and preserves instrument-price versus wallet-P&L currency',async()=>{
 const l=ledger([fill()]);l.accounts.other={environment:'live',complete:true,items:[fill('other')]};const s=storage();const r=await make({storage:s,readFillsRecord:async()=>record(l)}).activity({scope:SCOPE});assert.equal(r.state,'ready');assert.equal(r.items.length,1);assert.equal(r.items[0].id,'u1');assert.equal(r.items[0].currency,'USD');assert.equal(r.items[0].realizedCurrency,'RON');assert.equal(r.items[0].realized,120);assert.equal((await make({storage:s,readFillsRecord:async()=>record(l)}).activity({scope:'unrelated'})).items.length,0);
});
test('each activity read observes the current durable revision without reading credentials or opening a writer store',async()=>{
 let stored=record(ledger([fill('before')]));const c=context({T212Vault:new Proxy({}, {get(){throw Error('Broker credentials must stay with the controlled connection.');}})});
 const s=storage(),m=c.TodayDashboardModel.create({storage:s,now:()=>NOW,readFillsRecord:async()=>stored});assert.equal((await m.activity({scope:SCOPE})).items[0].id,'before');
 stored={...record(ledger([fill('after')])),revision:3};assert.equal((await m.activity({scope:SCOPE})).items[0].id,'after');assert.deepEqual([...s.map],[]);
});
test('recent SELL filter runs before the limit so newer purchases cannot hide the latest UHS sale',async()=>{
 const items=[fill('sale'),...Array.from({length:5},(_,i)=>fill('buy'+i,{side:'BUY',date:ISO(NOW-(i+1)*60000)}))];const r=await make({readFillsRecord:async()=>record(ledger(items))}).activity({scope:SCOPE,side:'SELL',limit:1});assert.equal(r.items.length,1);assert.equal(r.items[0].id,'sale');assert.equal(r.items[0].side,'SELL');
});
test('unreadable IndexedDB never falls back to an older localStorage ledger',async()=>{
 const s=storage({[FILLS]:ledger([fill('stale')])});const r=await make({storage:s,readFillsRecord:async()=>{throw Error('IDB unavailable');}}).activity({scope:SCOPE});assert.equal(r.state,'error');assert.equal(r.items.length,0);assert.equal(s.reads.includes(FILLS),false);
});
test('a missing database record permits valid legacy data while a confirmed null ledger remains authoritative',async()=>{
 const s=storage({[FILLS]:ledger([fill('legacy')])});const a=await make({storage:s,readFillsRecord:async()=>null}).activity({scope:SCOPE});assert.equal(a.items[0].id,'legacy');const b=await make({storage:s,readFillsRecord:async()=>({revision:3,raw:null,localRaw:s.getItem(FILLS)})}).activity({scope:SCOPE});assert.equal(b.items.length,0);assert.equal(b.state,'missing');
});
test('incompatible later legacy edits and malformed durable record never display an older confirmed-looking activity',async()=>{
 const s=storage({[FILLS]:ledger([fill('later')])});for(const rec of [record(ledger([fill('older')])),{revision:2,raw:'broken',localRaw:s.getItem(FILLS)}]){const r=await make({storage:s,readFillsRecord:async()=>rec}).activity({scope:SCOPE});assert.equal(r.state,'error');assert.equal(r.items.length,0);}
});
test('future/malformed fills are excluded with partial status, valid confirmed executions remain visible',async()=>{
 const r=await make({readFillsRecord:async()=>record(ledger([fill(),fill('future',{date:ISO(NOW+120000)}),fill('invalid',{quantity:null})]))}).activity({scope:SCOPE});assert.equal(r.state,'partial');assert.equal(r.items.length,1);assert.equal(r.items[0].id,'u1');
});
function idbFactory({existing=true,record:stored=null,fail=false}={}){
 const modes=[],calls={open:0,upgrade:0,abort:0,close:0};
 const factory={open(name){assert.equal(name,'tt-broker-fills-v1');calls.open++;const req={};queueMicrotask(()=>{if(!existing){calls.upgrade++;req.transaction={abort(){calls.abort++;queueMicrotask(()=>req.onerror?.());}};req.onupgradeneeded?.();return;}if(fail){req.onerror?.();return;}req.result={objectStoreNames:{contains:x=>x==='records'},close(){calls.close++;},transaction(store,mode){assert.equal(store,'records');modes.push(mode);const tx={objectStore(){return {get(key){assert.equal(key,FILLS);const get={};queueMicrotask(()=>{get.result=stored;get.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return get;}};}};return tx;}};req.onsuccess?.();});return req;}};return {factory,modes,calls};
}
test('native existing-IDB read requests readonly transaction and creates no object stores or ledger mutations',async()=>{
 const f=idbFactory({record:record(ledger([fill()]))});const r=await C.TodayDashboardModel.readExistingFills(f.factory);assert.equal(r.revision,2);assert.deepEqual(f.modes,['readonly']);assert.equal(f.calls.upgrade,0);assert.equal(f.calls.close,1);
});
test('native read of absent IndexedDB aborts the upgrade rather than creating an empty durable ledger',async()=>{
 const f=idbFactory({existing:false});assert.equal(await C.TodayDashboardModel.readExistingFills(f.factory),null);assert.equal(f.calls.upgrade,1);assert.equal(f.calls.abort,1);assert.deepEqual(f.modes,[]);
});
test('missing IndexedDB API is an explicit read failure and does not authorize an unverified legacy fallback',async()=>{
 const s=storage({[FILLS]:ledger([fill('legacy')])}),m=make({storage:s,indexedDB:null});const r=await m.activity({scope:SCOPE});assert.equal(r.state,'error');assert.equal(r.items.length,0);assert.equal(s.reads.includes(FILLS),false);
});
test('blocked IndexedDB discovery times out without opening or creating a ledger',async()=>{
 let opens=0;await assert.rejects(C.TodayDashboardModel.readExistingFills({databases:()=>new Promise(()=>{}),open(){opens++;throw Error('Must not open.');}},5),/nu a răspuns/);assert.equal(opens,0);
});
