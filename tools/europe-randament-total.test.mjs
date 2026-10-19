// 19.10.2026 (I-707): Acțiuni Europa — dividendul nu mai e numărat ca pierdere (RS față de DAX, randamentele din istoric)
// și istoricul nu mai calculează datele barelor pentru acțiuni fără intrări.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
  const c={console,Intl,Date,Map,Set,Math,Number,Array,Object,Error,JSON,AbortController};c.window=c;vm.createContext(c);
  for(const file of ['lib/indicators.js','europe-stocks/salt-list.js','europe-stocks/universe.js','europe-stocks/decision.js','europe-stocks/model.js','europe-stocks/history.js'])vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
  c.MEB={computeEarlyBird:()=>({isEarly:false,isConfirmed:false,signals:{}}),ebSignalText:()=>'t'};
  c.dateCalls=0;c.DailySeries={date:t=>{c.dateCalls++;return new Date(t).toISOString().slice(0,10);}};
  return c;
}
// Serie în urcare; acum 10 sesiuni s-a plătit un dividend de 3 % ⇒ închiderea brută scade, cea ajustată nu.
function series({dividend=true,currency='EUR',scale=1}={}){
  const bars=Array.from({length:120},(_,i)=>{
    const total=100+i*.15+Math.sin(i*.6)*2,price=dividend&&i>=110?total*.97:total;
    return {t:Date.parse('2026-01-01T12:00:00Z')+i*86400000,o:price*scale,c:price*scale,h:(price+.8)*scale,l:(price-.8)*scale,v:2000000,adjustedClose:(dividend&&i<110?total*.97:total)*scale};
  });
  return {bars,currency,asOf:'2026-10-06',timezone:'Europe/Berlin',closeMinutes:1050};
}
const guard={verdict:'TRADE',reasons:[]};
const ret20=values=>(values.at(-1)/values.at(-21)-1)*100;

test('I-707: față de DAX (indice de performanță) forța relativă folosește randamentul total al acțiunii',()=>{
  const c=setup(),i=c.EuropeUniverse.describe('SAP.DE'),s=series(),bench={symbol:i.benchmark,asOf:s.asOf,ret20:-2};
  const x=c.EuropeModel.build(i,s,bench,guard);
  assert.ok(x,'candidat construit');
  const total=ret20(s.bars.map(b=>b.adjustedClose)),price=ret20(s.bars.map(b=>b.c));
  assert.ok(total-price>2,'dividendul face diferența');
  assert.ok(Math.abs(x.rs-(total+2))<1e-9,'RS = randament total − DAX, nu randament de preț − DAX');
  assert.equal(x.rsBasis,'total');
  assert.ok(Math.abs(x.ret20-price)<1e-9,'randamentul afișat rămâne cel de preț');
});

test('I-707: față de un indice de preț (CAC 40) forța relativă rămâne pe închiderea brută',()=>{
  const c=setup(),i=c.EuropeUniverse.list('FR')[0],s=series({dividend:false}),bench={symbol:i.benchmark,asOf:s.asOf,ret20:-2};
  s.bars.forEach(b=>b.adjustedClose=b.c*1.05);
  const x=c.EuropeModel.build(i,s,bench,guard);
  assert.ok(x);assert.equal(x.rsBasis,'price');assert.ok(Math.abs(x.rs-(ret20(s.bars.map(b=>b.c))+2))<1e-9);
});

test('I-707: fără închidere ajustată pe toată seria RS-ul DAX cade pe preț și o spune',()=>{
  const c=setup(),i=c.EuropeUniverse.describe('SAP.DE'),s=series({dividend:false});delete s.bars[5].adjustedClose;
  const x=c.EuropeModel.build(i,s,{symbol:i.benchmark,asOf:s.asOf,ret20:-2},guard);
  assert.equal(x.rsBasis,'price');
});

function observation(c,symbol,s,candidate=null){return {instrument:c.EuropeUniverse.describe(symbol),series:s,candidate};}
function entry(c,symbol,firstDate,firstPrice){
  const i=c.EuropeUniverse.describe(symbol);
  return {id:i.isin+':'+firstDate+':growth',symbol,isin:i.isin,name:i.name,market:i.market,sector:i.sector,currency:'EUR',category:'growth',currentCategory:'growth',firstDate,lastDate:firstDate,firstPrice,lastPrice:firstPrice,firstStop:1,support:1,createdAt:1,policy:'x',active:true,status:'ACTIVE',transitions:[{date:firstDate,category:'growth'}],outcomes:{}};
}

test('I-707: randamentele 5/10/20 din istoric includ dividendul (închiderea ajustată), cu baza notată',()=>{
  const c=setup(),s=series(),first=s.bars[105],date=new Date(first.t).toISOString().slice(0,10);
  const doc={schema:1,entries:[entry(c,'SAP.DE',date,first.c)]};
  const out=c.EuropeHistory.update(doc,[observation(c,'SAP.DE',s)],2);
  const o=out.document.entries[0].outcomes[10];
  const expected=(s.bars[115].adjustedClose/first.adjustedClose-1)*100,price=(s.bars[115].c/first.c-1)*100;
  assert.ok(Math.abs(o.pct-expected)<0.001,'randament total '+expected+' ≠ '+o.pct);
  assert.ok(Math.abs(o.pct-price)>2,'nu mai e randamentul de preț');
  assert.equal(o.basis,'total');
});

test('I-707: istoricul calculează datele barelor doar pentru acțiunile cu intrări (6,9 s dintr-o bucată)',()=>{
  const c=setup(),s=series(),symbols=c.EuropeUniverse.stocks.slice(0,60).map(x=>x.symbol);
  const first=s.bars[105],date=new Date(first.t).toISOString().slice(0,10);
  const doc={schema:1,entries:[entry(c,symbols[0],date,first.c)]};
  c.dateCalls=0;c.EuropeHistory.update(doc,symbols.map(sym=>observation(c,sym,s)),2);
  assert.ok(c.dateCalls<=s.bars.length,'apeluri de dată: '+c.dateCalls+' (înainte: '+symbols.length*s.bars.length+')');
});
