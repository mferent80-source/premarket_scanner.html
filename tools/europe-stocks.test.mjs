import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

function setup(signal={isEarly:false,isConfirmed:false,signals:{}}){
  const c={console,Intl,Date,Map,Set,Math,Number,Array,Object,Error,AbortController};c.window=c;
  vm.createContext(c);
  for(const file of ['lib/indicators.js','europe-stocks/salt-list.js','europe-stocks/universe.js','europe-stocks/decision.js','europe-stocks/model.js','europe-stocks/finance.js','europe-stocks/history.js','europe-stocks/view.js'])vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
  c.MEB={computeEarlyBird:()=>signal,ebSignalText:()=> 'Structure test'};
  return c;
}
function series({currency='EUR',scale=1,deep=false}={}){
  const values=Array.from({length:120},(_,i)=>deep?(i<80?150-i*.7:94+(i-80)*.04):100+i*.15+Math.sin(i*.6)*2);
  const bars=values.map((price,i)=>({t:Date.parse('2026-01-01T12:00:00Z')+i*86400000,o:price*scale,c:price*scale,h:(price+.8)*scale,l:(price-.8)*scale,v:2000000}));
  return {bars,currency,asOf:'2026-10-06',timezone:'Europe/Berlin',closeMinutes:1050};
}
const guard={verdict:'TRADE',reasons:[]};
function build(c,sym='SAP.DE',source=series(),overrides={}){
  const instrument=c.EuropeUniverse.describe(sym);
  return c.EuropeModel.build(instrument,source,{symbol:instrument.benchmark,asOf:source.asOf,ret20:-2,...overrides},guard);
}
test('Europe is separate: only recognized European listings, company identity and market benchmark preserved',()=>{
  const c=setup(),u=c.EuropeUniverse;
  assert.equal(u.stocks.length,204);assert.equal(Object.keys(u.markets).length,10);
  assert.match(u.describe('SAP.DE').name,/SAP/);assert.equal(u.describe('SAP.DE').country,'Germania');
  assert.equal(u.describe('SHEL.L').benchmark,'^FTSE');assert.equal(u.describe('NOVO-B.CO').currency,'DKK');
  assert.equal(u.describe('AAPL'),null);assert.equal(u.describe('SAP.DE<script>'),null);
  assert.equal(u.describe('ABC.L'),null);assert.equal(u.describe('ROP.SW'),null);assert.equal(u.describe('SAAB-B.ST'),null);
  assert.ok(u.list('UK',['AAPL','SHEL.L','ABC.L']).every(x=>x.market==='UK'));
  assert.deepEqual(Array.from(u.list('all',['AAPL','SAP.DE'],true),x=>x.symbol),['SAP.DE']);
});
test('pence conversion preserves percentage signals and scales every price/level to GBP',()=>{
  const c=setup(),gbp=build(c,'SHEL.L',series({currency:'GBP'})),gbx=build(c,'SHEL.L',series({currency:'GBX',scale:100}));
  assert.ok(gbp&&gbx);assert.equal(gbx.currency,'GBP');assert.equal(gbx.normalizedPence,true);
  for(const key of ['price','stop','target','entryLow','entryHigh','atr','turnover','rs','rvol'])assert.ok(Math.abs(gbp[key]-gbx[key])<.000001,key);
  assert.equal(gbp.category,gbx.category);assert.equal(gbp.score,gbx.score);
});
test('an incorrect currency cannot silently become a European actionable price',()=>{
  const c=setup();assert.throws(()=>build(c,'SAP.DE',series({currency:'USD'})),/Moneda/);
  assert.throws(()=>build(c,'SHEL.L',series({currency:null})),/Moneda/);
});
test('growth needs a matching local benchmark and matching completed session',()=>{
  const c=setup();assert.ok(build(c));
  assert.equal(build(c,'SAP.DE',series(),{asOf:'2026-10-05'}),null);
  assert.equal(build(c,'SAP.DE',series(),{symbol:'SPY'}),null);
});
test('early reversal and confirmed reversal occupy different lists; early has no confirmed plan',()=>{
  const source=series({deep:true});
  const early=setup({isEarly:true,isConfirmed:false,signals:{higherLow:true,stabilized:true,rsiRising:true,nearEma:true}});
  const e=build(early,'SAP.DE',source);assert.equal(e.category,'earlyReversal');assert.equal(e.state,'EARLY');assert.equal(e.actionable,false);
  const confirmed=setup({isEarly:false,isConfirmed:true,signals:{higherLow:true,stabilized:true,rsiRising:true,nearEma:true}});
  const r=build(confirmed,'SAP.DE',source);assert.equal(r.category,'reversal');assert.equal(r.state,'ARMED');
  assert.equal(confirmed.EuropeModel.rank([e,r],'earlyReversal').length,1);
  assert.equal(confirmed.EuropeModel.rank([e,r],'reversal').length,1);
});
test('missing benchmark or Governor remains explicit and never bypasses USD plan protection',()=>{
  const c=setup({isConfirmed:true,signals:{higherLow:true,stabilized:true,rsiRising:true,nearEma:true}}),i=c.EuropeUniverse.describe('SAP.DE');
  const watch=c.EuropeModel.build(i,series({deep:true}),null,guard);assert.equal(watch.state,'WATCH');assert.equal(watch.rs,null);assert.equal(watch.actionable,false);
  const blocked=c.EuropeModel.build(i,series({deep:true}),{symbol:i.benchmark,asOf:'2026-10-06',ret20:-2},null);assert.equal(blocked.state,'BLOCKED');assert.equal(blocked.actionable,false);
  assert.match(blocked.planNote,/USD/);
});
test('zero volume, insufficient history and exhausted early signal are excluded',()=>{
  const c=setup(),s=series();s.bars.forEach(b=>b.v=0);assert.equal(build(c,'SAP.DE',s),null);
  const small=series();small.bars=small.bars.slice(-60);assert.throws(()=>build(c,'SAP.DE',small),/80/);
  const early=setup({isEarly:true,isRanBlocked:true,signals:{higherLow:true,stabilized:true,rsiRising:true}});assert.equal(build(early,'SAP.DE',series({deep:true})),null);
});
test('top lists enforce sector diversity and contain up to ten real results',()=>{
  const c=setup(),items=Array.from({length:30},(_,i)=>({symbol:'T'+i,category:'growth',sector:'Sector '+Math.floor(i/5),score:100-i}));
  const ranked=c.EuropeModel.rank(items,'growth');assert.equal(ranked.length,10);
  for(const sector of new Set(ranked.map(x=>x.sector)))assert.ok(ranked.filter(x=>x.sector===sector).length<=3);
  assert.equal(c.EuropeModel.rank(items.slice(0,2),'growth').length,2);
});
test('European module is reachable in the app and local scripts/styles resolve',()=>{
  const path='europe-stocks/index.html',html=readFileSync(path,'utf8');
  assert.ok(readFileSync('app/index.html','utf8').includes("u:'europe-stocks/',n:'Acțiuni Europa'"));
  for(const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g))assert.ok(existsSync(resolve(dirname(path),m[1].split('?')[0])),m[1]);
  for(const cat of ['growth','earlyLong','reversal','earlyReversal'])assert.ok(html.includes('data-category="'+cat+'"'));
});

test('Salt dataset accounts for every European issuer stock and preserves instrument classes',()=>{
  const c=setup(),u=c.EuropeUniverse,d=c.SaltEuropeData;
  assert.equal(d.source.totalInstruments,572);
  assert.equal(d.source.assetCounts['Common Stock'],370);assert.equal(d.source.assetCounts.ETF,166);
  assert.equal(d.rows.length,208);assert.equal(u.stocks.length+u.excluded.length,d.rows.length);
  assert.equal(new Set(d.rows.map(x=>x.isin)).size,d.rows.length);
  assert.equal(new Set(u.stocks.map(x=>x.symbol)).size,u.stocks.length);
  for(const row of d.rows){
    assert.equal(row.assetType,'Common Stock');assert.ok(row.page>=1&&row.page<=17);
    const digits=row.isin.replace(/[A-Z]/g,x=>String(x.charCodeAt(0)-55)).split('').map(Number).reverse();
    assert.equal(digits.reduce((sum,n,i)=>sum+(i%2?Math.floor(n*2/10)+n*2%10:n),0)%10,0,row.isin);
  }
  assert.equal(u.describe('HEN.DE').isin,'DE0006048408');assert.equal(u.describe('HEN3.DE').isin,'DE0006048432');
  assert.equal(u.describe('VOW.DE').isin,'DE0007664005');assert.equal(u.describe('VOW3.DE').isin,'DE0007664039');
  assert.equal(u.describe('ACT0.DE').isin,'DE000A41YHG1');assert.equal(u.describe('ACT.DE'),null);
  assert.equal(u.describe('AIR.PA').jurisdiction,'NL');assert.equal(u.describe('AIR.PA').country,'Franța');
  assert.equal(u.describe('RACE.MI').jurisdiction,'NL');assert.equal(u.describe('RACE.MI').currency,'EUR');
  assert.ok(u.excluded.every(x=>x.reason));assert.equal(u.excluded.length,4);
  assert.deepEqual(Array.from(u.excluded,x=>x.identifiedSymbol).sort(),['ACN','LIN','NXPI','SPOT']);
});
test('Salt membership applies to Watchlist and cache identity without mutating personal symbols',()=>{
  const c=setup(),u=c.EuropeUniverse,wl=['SAP.DE','SAP.DE','ABC.L','AAPL','ROP.SW','VOW3.DE'];
  const before=wl.slice();
  assert.deepEqual(Array.from(u.list('all',wl,true),x=>x.symbol),['SAP.DE','VOW3.DE']);
  assert.deepEqual(wl,before);assert.equal(u.list('all',wl).length,u.stocks.length);
  assert.equal(u.cacheIdentity('all',wl),u.cacheIdentity('all',[]));
  assert.notEqual(u.cacheIdentity('all',['SAP.DE'],true),u.cacheIdentity('all',['VOW3.DE'],true));
  assert.notEqual(u.cacheIdentity('all',wl,true),u.cacheIdentity('DE',wl,true));
  assert.equal(u.cacheIdentity('all',wl,true),u.cacheIdentity('all',wl.slice().reverse(),true));
  const candidate=build(c);assert.equal(candidate.isin,'DE0007164600');assert.equal(candidate.jurisdiction,'DE');
});
function bootCache(c,cache,watchlist=[],watchlistOnly=false){
  const nodes=new Map(),node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:['market','sectorFilter','stateFilter'].includes(id)?'all':id==='sortBy'?'score':id==='universe'?(watchlistOnly?'watchlist':'core'):'',textContent:'',innerHTML:'',dataset:{},style:{},setAttribute(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return []}});
    return nodes.get(id);
  };
  c.document={hidden:true,getElementById:node,createElement:()=>({}),querySelectorAll:()=>[],addEventListener(){}};
  c.storage=new Map([['tt_europe_scan_v3',JSON.stringify(cache)]]);c.localStorage={getItem:key=>c.storage.get(key)||null};c.WL={get:()=>watchlist,has:()=>false};
  c.DailySeries={usable:()=>true,date:t=>new Date(t).toISOString().slice(0,10)};c.events={};c.addEventListener=(type,fn)=>(c.events[type]??=[]).push(fn);c.setTimeout=()=>1;c.clearTimeout=()=>{};
  c.matchMedia=()=>({matches:false,addEventListener(){}});c.fetch=async()=>{throw Error('Offline test');};
  c.location={origin:'https://example.test'};
  vm.runInContext(readFileSync('europe-stocks/engine.js','utf8'),c,{filename:'engine.js'});
  return nodes;
}
test('cached results cannot escape Salt source, ISIN or Watchlist membership',()=>{
  function cache(c,item){return {schema:3,policy:c.EuropeDecision.VERSION,filter:c.EuropeUniverse.cacheIdentity(),items:[item],updatedAt:Date.now(),verified:1,scanned:1,failures:[],benchmarks:[]};}
  const valid=setup(),candidate=build(valid),ok=bootCache(valid,cache(valid,candidate));
  assert.equal(ok.get('candidateCount').textContent,1);
  for(const change of [x=>({...x,symbol:'UNKNOWN.L',isin:undefined}),x=>({...x,isin:'DE0007664039'})]){
    const c=setup(),nodes=bootCache(c,cache(c,change(build(c))));assert.notEqual(nodes.get('candidateCount')?.textContent,1);
  }
  const old=setup(),prior=cache(old,build(old));prior.filter='previous-source';
  assert.notEqual(bootCache(old,prior).get('candidateCount')?.textContent,1);
  const only=setup(),wrong=cache(only,build(only));wrong.filter=only.EuropeUniverse.cacheIdentity('all',['VOW3.DE'],true);
  assert.notEqual(bootCache(only,wrong,['VOW3.DE'],true).get('candidateCount')?.textContent,1);
});

test('Europa updates imported history immediately and accepts cloud status only from its own shell',()=>{
 const c=setup(),candidate=build(c),cache={schema:3,policy:c.EuropeDecision.VERSION,filter:c.EuropeUniverse.cacheIdentity(),items:[candidate],updatedAt:Date.now(),verified:1,scanned:1,failures:[],benchmarks:[]},nodes=bootCache(c,cache);
 const e={id:'DE0007164600:2026-10-01:earlyLong',symbol:'SAP.DE',isin:'DE0007164600',category:'earlyLong',currentCategory:'earlyLong',firstDate:'2026-10-01',lastDate:'2026-10-01',firstPrice:100,firstStop:90,support:92,createdAt:1790866800000,active:true,status:'ACTIVE',transitions:[{date:'2026-10-01',category:'earlyLong'}],outcomes:{}};
 c.storage.set(c.EuropeHistory.KEY,JSON.stringify({schema:1,entries:[e]}));c.events.storage.forEach(fn=>fn({key:c.EuropeHistory.KEY}));assert.match(nodes.get('signalHistory').innerHTML,/1 observații urmărite/);
 c.parent={};const event={source:c.parent,origin:c.location.origin,data:{ttCloudState:{ready:true,connected:true,conflicts:[],supportedKeys:[c.EuropeHistory.KEY,'tt_europe_risk_settings_v1'],lastSync:Date.now()}}};
 c.events.message.forEach(fn=>fn({...event,source:{}}));assert.match(nodes.get('europeSyncState').textContent,/salvate local/);
 c.events.message.forEach(fn=>fn(event));assert.match(nodes.get('europeSyncState').textContent,/ultima reconciliere/);
 event.data.ttCloudState.supportedKeys=[];c.events.message.forEach(fn=>fn(event));assert.match(nodes.get('europeSyncState').textContent,/rămân local/);
});
test('incoming risk settings preserve an active draft and invalidate an old quantity after applying',()=>{
 const c=setup(),candidate=build(c),cache={schema:3,policy:c.EuropeDecision.VERSION,filter:c.EuropeUniverse.cacheIdentity(),items:[candidate],updatedAt:Date.now(),verified:1,scanned:1,failures:[],benchmarks:[]},nodes=bootCache(c,cache);
 for(const id of ['riskBudget','riskLoss','riskFees','riskCurrency','riskStep','riskResult'])c.document.getElementById(id);
 const form=nodes.get('riskForm');form.contains=x=>x===nodes.get('riskBudget');nodes.get('riskBudget').value='777';c.document.activeElement=nodes.get('riskBudget');
 c.storage.set('tt_europe_risk_settings_v1',JSON.stringify({currency:'RON',budget:'1500',loss:'50',fees:'5',fractional:true}));
 c.events.storage.forEach(fn=>fn({key:'tt_europe_risk_settings_v1'}));assert.equal(nodes.get('riskBudget').value,'777');
 c.document.activeElement=null;c.events.storage.forEach(fn=>fn({key:'tt_europe_risk_settings_v1'}));assert.equal(nodes.get('riskBudget').value,'1500');assert.equal(nodes.get('riskCurrency').value,'RON');assert.match(nodes.get('riskResult').textContent,/Recalculează/);
});
