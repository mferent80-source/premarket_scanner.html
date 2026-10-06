import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

function setup(signal={isEarly:false,isConfirmed:false,signals:{}}){
  const c={console,Intl,Date,Map,Set,Math,Number,Array,Object,Error};c.window=c;
  vm.createContext(c);
  for(const file of ['lib/indicators.js','europe-stocks/universe.js','europe-stocks/model.js'])vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
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
  assert.ok(u.stocks.length>=70);assert.equal(Object.keys(u.markets).length,11);
  assert.equal(u.describe('SAP.DE').name,'SAP');assert.equal(u.describe('SAP.DE').country,'Germania');
  assert.equal(u.describe('SHEL.L').benchmark,'^FTSE');assert.equal(u.describe('NOVO-B.CO').currency,'DKK');
  assert.equal(u.describe('AAPL'),null);assert.equal(u.describe('SAP.DE<script>'),null);
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
