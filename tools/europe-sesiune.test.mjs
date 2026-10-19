// 19.10.2026 (I-707): Acțiuni Europa scanează o dată pe sesiune (nu ~5,2 MB la 5 minute), recalculează local Governor-ul,
// intrarea din calculator nu mai intră în setările sincronizate, iar la „Preț extins” intrarea pornește de la prețul curent.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const RISK='tt_europe_risk_settings_v1',ENTRY='tt_europe_risk_entry_v1';
function setup(){
  const c={console,Intl,Date,Map,Set,Math,Number,Array,Object,Error,JSON,AbortController,Promise};c.window=c;vm.createContext(c);
  for(const file of ['lib/exchange-calendar.js','lib/indicators.js','europe-stocks/salt-list.js','europe-stocks/universe.js','europe-stocks/decision.js','europe-stocks/model.js','europe-stocks/finance.js','europe-stocks/history.js','europe-stocks/view.js','europe-stocks/cache.js'])vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
  c.MEB={computeEarlyBird:()=>({isEarly:false,isConfirmed:false,signals:{}}),ebSignalText:()=>'t'};
  return c;
}
function series(){
  const values=Array.from({length:120},(_,i)=>100+i*.15+Math.sin(i*.6)*2);
  return {bars:values.map((p,i)=>({t:Date.parse('2026-01-01T12:00:00Z')+i*86400000,o:p,c:p,h:p+.8,l:p-.8,v:2000000})),currency:'EUR',asOf:'2026-10-06',timezone:'Europe/Berlin',closeMinutes:1050};
}
const watch=['SAP.DE'];
function candidate(c,guard={verdict:'TRADE'}){const i=c.EuropeUniverse.describe('SAP.DE'),s=series();return c.EuropeModel.build(i,s,{symbol:i.benchmark,asOf:s.asOf,ret20:-2},guard);}
function snapshot(c,item,{updatedAt=Date.now()-2*3600000,sessions}={}){
  return {schema:3,policy:c.EuropeDecision.VERSION,filter:c.EuropeUniverse.cacheIdentity('all',watch,true),sessions:sessions??c.EuropeUniverse.sessionKey(c.EuropeUniverse.list('all',watch,true)),items:[item],updatedAt,verified:1,scanned:1,failures:[],benchmarks:[]};
}
function boot(c,cache,storage=[]){
  const nodes=new Map(),node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:['market','sectorFilter','stateFilter'].includes(id)?'all':id==='sortBy'?'score':id==='universe'?'watchlist':'',textContent:'',innerHTML:'',dataset:{},style:{},setAttribute(){},appendChild(){},after(){},scrollIntoView(){},contains:()=>false,querySelector(){return null;},querySelectorAll(){return []}});
    return nodes.get(id);
  };
  c.document={hidden:false,getElementById:node,createElement:()=>({}),querySelectorAll:()=>[],addEventListener(){}};
  c.storage=new Map([['tt_europe_scan_v3',JSON.stringify(cache)],...storage]);
  c.localStorage={getItem:k=>c.storage.get(k)??null,setItem:(k,v)=>c.storage.set(k,String(v))};
  c.WL={get:()=>watch,has:()=>false};
  c.DailySeries={usable:()=>true,date:t=>new Date(t).toISOString().slice(0,10),read:v=>v};
  c.fetches=0;c.D={fetchStock:async()=>{c.fetches++;return series();}};
  c.TI=c.TI||{};c.events={};c.addEventListener=(type,fn)=>(c.events[type]??=[]).push(fn);
  c.timers=[];c.setTimeout=(fn,ms)=>{c.timers.push({fn,ms});return c.timers.length;};c.clearTimeout=()=>{};
  c.matchMedia=()=>({matches:false,addEventListener(){}});c.fetch=async()=>{throw Error('offline');};
  c.location={origin:'https://example.test'};c.EuropeScanCache.create=(storage)=>({read:async()=>null,save:async s=>{storage.setItem('tt_europe_scan_v3',JSON.stringify(s));}});
  vm.runInContext(readFileSync('europe-stocks/engine.js','utf8'),c,{filename:'engine.js'});
  return nodes;
}
const settle=()=>new Promise(r=>setImmediate(r));
const show=c=>c.events.message.forEach(fn=>fn({origin:c.location.origin,data:{ttShellVisible:true}}));
async function fiveMinutes(c){const t=c.timers.filter(x=>x.ms===5*60000).at(-1);assert.ok(t,'tick de 5 minute programat');t.fn();await settle();await settle();}

test('I-707: rezultatele aceleiași sesiuni (vechi de 2 ore) se refolosesc; revenirea și tick-ul de 5 minute nu mai descarcă nimic',async()=>{
  const c=setup(),nodes=boot(c,snapshot(c,candidate(c)));
  assert.equal(nodes.get('candidateCount').textContent,1,'scanarea din aceeași sesiune e păstrată');
  show(c);await settle();await fiveMinutes(c);
  assert.equal(c.fetches,0,'nicio cerere de rețea în aceeași sesiune');
});

test('I-707: verificarea locală reîmprospătează ora analizei pentru panoul de decizie (regula lui de 30 de minute), păstrând ora scanării',async()=>{
  const c=setup(),panels=[];c.TTDecisionPanel={set:v=>panels.push(v)};
  const x=candidate(c),scannedAt=Date.now()-2*3600000;x.ts=scannedAt;
  boot(c,snapshot(c,x));await fiveMinutes(c);
  const last=panels.filter(p=>p.candidate).at(-1).candidate;
  assert.ok(Date.now()-last.ts<60000,'ora analizei = ultima verificare a sesiunii și a Governor-ului');
  assert.equal(last.scannedAt,scannedAt);assert.equal(c.fetches,0);
});

test('I-707: o sesiune nouă așteptată (după închidere + 15 min) pornește scanarea din rețea',async()=>{
  const c=setup(),nodes=boot(c,snapshot(c,candidate(c),{updatedAt:Date.now()-60000,sessions:'XETRA:2000-01-01'}));
  assert.notEqual(nodes.get('candidateCount')?.textContent,1,'rezultatele altei sesiuni nu se arată ca actuale');
  show(c);await settle();await settle();
  assert.ok(c.fetches>0,'sesiune nouă ⇒ rețea');
});

test('I-707: la 5 minute se recalculează local starea Governor (fără rețea)',async()=>{
  const c=setup();c.GV={status:()=>({verdict:'TRADE'})};
  const nodes=boot(c,snapshot(c,candidate(c)));
  assert.doesNotMatch(nodes.get('results').innerHTML,/Governor blocat/);
  c.GV={status:()=>({verdict:'NO_TRADE'})};await fiveMinutes(c);
  assert.match(nodes.get('results').innerHTML,/Governor blocat/);assert.equal(c.fetches,0);
  c.GV={status:()=>({verdict:'TRADE'})};await fiveMinutes(c);
  assert.doesNotMatch(nodes.get('results').innerHTML,/Governor blocat/);
});

test('I-707 (b): intrarea calculatorului stă local pe acțiune; setările sincronizate păstrează intrarea stabilă',async()=>{
  const c=setup(),previous={currency:'EUR',budget:'1000',loss:'20',fees:'2',entry:'50',fractional:false};
  const nodes=boot(c,snapshot(c,candidate(c)),[[RISK,JSON.stringify(previous)]]);
  for(const [id,v] of [['riskCurrency','EUR'],['riskBudget','2000'],['riskLoss','20'],['riskFees','2'],['riskEntry','123.45'],['riskStep','whole']])nodes.get(id)||c.document.getElementById(id),nodes.get(id).value=v;
  await nodes.get('riskForm').onsubmit({preventDefault(){}});
  const synced=JSON.parse(c.storage.get(RISK));
  assert.equal(synced.budget,'2000');assert.equal(synced.entry,'50','intrarea unei acțiuni nu mai intră în valoarea sincronizată');
  const local=JSON.parse(c.storage.get(ENTRY));assert.equal(local['SAP.DE'].entry,'123.45');
});

test('I-707 (a): la „Preț extins” intrarea implicită e prețul curent, nu limita de sus a zonei (sub preț)',()=>{
  const c=setup();c.DailySeries={date:t=>new Date(t).toISOString().slice(0,10)};
  const x=candidate(c),plan={...x.plan,state:'EXTENDED',entryHigh:x.price*.95};
  const html=c.EuropeView.detail({...x,plan},{earnings:{status:'unknown'},settings:{}});
  const value=Number(/id="riskEntry"[^>]*value="([^"]*)"/.exec(html)[1]);
  assert.equal(value,Number(x.price.toFixed(4)));
});
