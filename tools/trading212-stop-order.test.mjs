// 18.10.2026 — ordinul de stop REAL în Trading 212: singura scriere a releului. Fiecare gardă trebuie să oprească ordinul ÎNAINTE de POST.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handle,STOP_ROUTE,STOP_CONFIRM,roundStop,roundQuantity} from './trading212-worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ORIGIN='https://mferent80-source.github.io';
const env={T212_AUTH_MODE:'session'};
// 27.10.2026 (I-755): fiecare apel are minutul lui — cheia de idempotență (ticker + stop + cantitate + minut) nu leagă testele între ele
let ceas=Date.parse('2026-10-27T10:00:00Z');const minut=()=>({now:(ceas+=120000)});
const basic='Basic '+btoa('cheie_test:secret_test');
const req=(body,{method='POST',origin=ORIGIN,auth=basic,type='application/json',envName='live'}={})=>new Request('https://relay.workers.dev'+STOP_ROUTE,{method,headers:{Origin:origin,...(auth?{Authorization:auth}:{}),'X-T212-Environment':envName,...(type?{'Content-Type':type}:{})},...(method==='POST'&&body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const order=(o={})=>({ticker:'MU_US_EQ',quantity:5.5,stopPrice:832.2,confirm:STOP_CONFIRM,...o});
function broker({positions=[{instrument:{ticker:'MU_US_EQ',currency:'USD'},quantity:5.5,quantityAvailableForTrading:5.5,currentPrice:876}],pending=[],post=()=>json({id:123,status:'NEW'})}={}){
  const calls=[];
  const upstream=async(url,options)=>{calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null,options});
    if(url.endsWith('/api/v0/equity/positions'))return json(positions);
    if(url.endsWith('/api/v0/equity/orders'))return json(pending);
    if(url.endsWith('/api/v0/equity/orders/stop'))return post();
    throw Error('neașteptat '+url);};
  return {calls,upstream,posts:()=>calls.filter(c=>c.method==='POST')};
}

test('a valid request places exactly one GTC SELL stop for the owned quantity, below the current price',async()=>{
  const b=broker(),r=await handle(req(order()),env,b.upstream,minut()),out=await r.json();
  assert.equal(r.status,200);assert.equal(out.source,'Trading 212');assert.equal(out.environment,'live');assert.equal(out.data.id,123);
  assert.equal(b.posts().length,1);const p=b.posts()[0];
  assert.equal(p.url,'https://live.trading212.com/api/v0/equity/orders/stop');
  assert.deepEqual(p.body,{ticker:'MU_US_EQ',quantity:-5.5,stopPrice:832.2,timeValidity:'GOOD_TILL_CANCEL'});
  assert.equal(p.options.redirect,'manual');assert.equal(p.options.headers.Authorization,basic);
  assert.deepEqual(b.calls.map(c=>c.method+' '+new URL(c.url).pathname),['GET /api/v0/equity/positions','GET /api/v0/equity/orders','POST /api/v0/equity/orders/stop']);
});
test('a buy can never be sent: the relay always sends a negative quantity and refuses non-positive requests',async()=>{
  for(const quantity of [-5,0,'abc',null]){const b=broker(),r=await handle(req(order({quantity})),env,b.upstream,minut());assert.equal(r.status,400);assert.equal(b.calls.length,0);}
});
test('without the explicit confirmation token nothing reaches Trading 212',async()=>{
  for(const confirm of [undefined,'',true,'pun-stopul']){const b=broker(),r=await handle(req(order({confirm})),env,b.upstream,minut());assert.equal(r.status,400);assert.equal(b.calls.length,0);}
});
test('quantity above the shares available for trading is refused before any order',async()=>{
  const b=broker({positions:[{instrument:{ticker:'MU_US_EQ'},quantity:5.5,quantityAvailableForTrading:3,currentPrice:876}]}),r=await handle(req(order()),env,b.upstream,minut()),out=await r.json();
  assert.equal(r.status,409);assert.equal(out.error,'quantity_exceeds_position');assert.equal(out.owned,3);assert.equal(b.posts().length,0);
});
test('a missing position, a stop at or above the price and a stop under half the price are refused',async()=>{
  for(const [o,code] of [[{ticker:'AAPL_US_EQ'},'position_not_found'],[{stopPrice:876},'stop_not_below_price'],[{stopPrice:900},'stop_not_below_price'],[{stopPrice:400},'stop_too_far']]){
    const b=broker(),r=await handle(req(order(o)),env,b.upstream,minut());assert.equal(r.status,409);assert.equal((await r.json()).error,code);assert.equal(b.posts().length,0);}
});
test('an existing pending sell on the same ticker blocks a second stop (both API shapes)',async()=>{
  for(const pending of [[{ticker:'MU_US_EQ',type:'STOP',quantity:-5.5,stopPrice:830}],[{instrument:{ticker:'MU_US_EQ'},side:'SELL',type:'LIMIT',quantity:5.5}]]){
    const b=broker({pending}),r=await handle(req(order()),env,b.upstream,minut());assert.equal(r.status,409);assert.equal((await r.json()).error,'sell_order_exists');assert.equal(b.posts().length,0);}
  const other=broker({pending:[{ticker:'AVGO_US_EQ',type:'STOP',quantity:-2,stopPrice:300},{ticker:'MU_US_EQ',type:'LIMIT',quantity:1}]});
  assert.equal((await handle(req(order()),env,other.upstream,minut())).status,200,'alte acțiuni sau o cumpărare în așteptare nu blochează');
});
test('a key without order permission, invalid credentials and broker rejections are reported, never retried',async()=>{
  for(const [status,code] of [[403,'broker_permission_missing'],[401,'broker_credentials_invalid'],[500,'broker_unavailable']]){
    const b=broker({post:()=>json({},status)}),r=await handle(req(order()),env,b.upstream,minut());assert.equal((await r.json()).error,code);assert.equal(b.posts().length,1);}
  const rej=broker({post:()=>json({code:'InsufficientResources',message:'Not enough <shares>'},400)}),r=await handle(req(order()),env,rej.upstream,minut()),out=await r.json();
  assert.equal(out.error,'broker_rejected');assert.doesNotMatch(out.detail,/[<>]/);
  const p403=broker({positions:[]});p403.upstream=async()=>json({},403);assert.equal((await (await handle(req(order()),env,p403.upstream,minut())).json()).error,'broker_permission_missing');
});
test('wrong method, origin, content type, credentials or oversized body never reach the broker',async()=>{
  const cases=[req(order(),{method:'GET'}),req(order(),{origin:'https://evil.example'}),req(order(),{type:'text/plain'}),req(order(),{auth:''}),req(order(),{envName:'real'}),req('x'.repeat(1200)),req('{nu e json')];
  for(const r0 of cases){const b=broker(),r=await handle(r0,env,b.upstream,minut());assert.ok(r.status>=400,String(r.status));assert.equal(b.calls.length,0);}
});
test('preflight allows POST only on the stop route; every other route stays read-only',async()=>{
  const r=await handle(req(undefined,{method:'OPTIONS'}),env,undefined,minut());assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');assert.match(r.headers.get('Access-Control-Allow-Headers'),/Content-Type/);
  const other=new Request('https://relay.workers.dev/api/trading212/positions',{method:'POST',headers:{Origin:ORIGIN,Authorization:basic,'X-T212-Environment':'live'}});let called=false;
  assert.equal((await handle(other,env,()=>{called=true;},minut())).status,405);assert.equal(called,false);
});
test('prices round DOWN to the tick and fractional quantities never round up past what you own',()=>{
  assert.equal(roundStop(832.2099),832.2);assert.equal(roundStop(832.2),832.2);assert.equal(roundStop(0.123456),0.1234);
  assert.equal(roundQuantity(5.123456789),5.12345678);assert.equal(roundQuantity(5.5),5.5);
});
// 27.10.2026 (audit E 🟡 Y1, I-755): clientul așteaptă 25 s, releul lucra până la 60 s (20 s pe FIECARE din cele trei apeluri) ⇒ ordinul putea
// fi pus după ce aplicația spusese „timeout”. Acum cele trei apeluri împart UN singur termen de 20 s (AbortSignal.timeout), sub termenul clientului.
test('I-755: cele trei apeluri către broker împart un singur termen (același semnal de anulare), ca releul să răspundă înaintea clientului',async()=>{
  const b=broker(),r=await handle(req(order()),env,b.upstream,minut());assert.equal(r.status,200);
  const semnale=b.calls.map(c=>c.options.signal);assert.equal(semnale.length,3);
  assert.ok(semnale.every(s=>s instanceof AbortSignal),'fiecare apel are semnal de anulare');
  assert.equal(new Set(semnale).size,1,'un singur termen comun, nu câte 20 s pe apel');
});
// 27.10.2026 (audit E 🔵 B2, I-755): cheie de idempotență ticker + stop + cantitate + minut, ținută 10 minute în memoria releului ⇒ același ordin
// retrimis (răspuns pierdut, dublu clic) nu se pune de două ori: se întoarce răspunsul primei plasări, fără niciun apel nou la broker.
test('I-755: același ordin în același minut se pune O dată — a doua cerere primește răspunsul primei (idempotent), fără alt apel la broker',async()=>{
  const memory=new Map(),now=Date.parse('2026-10-27T14:30:10Z');
  const b=broker(),first=await handle(req(order()),env,b.upstream,{now,memory}),o1=await first.json();assert.equal(first.status,200);assert.equal(b.posts().length,1);
  const again=await handle(req(order()),env,b.upstream,{now:now+20000,memory}),o2=await again.json();
  assert.equal(again.status,200);assert.equal(o2.idempotent,true);assert.equal(o2.data.id,o1.data.id);assert.equal(o2.placedAt,o1.placedAt);
  assert.equal(b.calls.length,3,'a doua cerere nu mai atinge brokerul deloc');
  const other=await handle(req(order({stopPrice:830})),env,b.upstream,{now:now+20000,memory});assert.equal(other.status,200);assert.equal(b.posts().length,2,'alt stop = alt ordin');
  const later=await handle(req(order()),env,broker().upstream,{now:now+11*60000,memory});assert.equal((await later.json()).idempotent,undefined,'după 10 minute memoria a uitat');
  const refused=broker({post:()=>json({},403)}),m2=new Map();await handle(req(order()),env,refused.upstream,{now,memory:m2});
  const retry=await handle(req(order()),env,refused.upstream,{now:now+1000,memory:m2});assert.equal(retry.status,502);assert.equal(refused.posts().length,2,'un refuz nu se ține minte: reîncercarea ajunge la broker');
  const alt=broker();await handle(req(order(),{auth:'Basic '+btoa('alt_cont:secret')}),env,alt.upstream,{now,memory});assert.equal(alt.posts().length,1,'alt cont = alt ordin, chiar cu aceleași cifre');
});
