// 27.10.2026 (I-757, kill switch): a DOUA putere de scriere a releului Trading 212 — anularea ordinelor în așteptare.
// `DELETE /api/trading212/orders/{id}` anulează un ordin; `POST /api/trading212/orders/cancel-all` (cu confirmarea OPRESC-TOT) le anulează pe toate.
// Doar din originea suitei, doar cu cheia din seif (antetul Authorization, niciodată în URL), fără cumpărări, fără alte scrieri.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handle} from './trading212-worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ORIGIN='https://mferent80-source.github.io',env={T212_AUTH_MODE:'session'},basic='Basic '+btoa('cheie_test:secret_test');
const ALL='/api/trading212/orders/cancel-all',ONE=id=>'/api/trading212/orders/'+id;
const req=(path,{method='DELETE',origin=ORIGIN,auth=basic,envName='live',body,type='application/json'}={})=>new Request('https://relay.workers.dev'+path,{method,headers:{Origin:origin,...(auth?{Authorization:auth}:{}),'X-T212-Environment':envName,...(body!==undefined&&type?{'Content-Type':type}:{})},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const pending=()=>[{id:77,ticker:'MU_US_EQ',type:'STOP',quantity:-5.5,stopPrice:800.5,status:'NEW'},{id:78,ticker:'AAPL_US_EQ',type:'LIMIT',quantity:2,limitPrice:150,status:'NEW'}];
function broker({orders=pending(),cancel=()=>new Response(null,{status:200})}={}){
  const calls=[];
  const upstream=async(url,options={})=>{calls.push({url,method:options.method||'GET',options});
    if(options.method==='DELETE')return cancel(url);
    if(url.endsWith('/api/v0/equity/orders'))return json(orders);
    throw Error('neașteptat '+url);};
  return {calls,upstream,deletes:()=>calls.filter(c=>c.method==='DELETE')};
}

test('DELETE /orders/{id} anulează exact acel ordin la broker, cu cheia din antet, și răspunde cu id-ul anulat',async()=>{
  const b=broker(),r=await handle(req(ONE(77)),env,b.upstream),out=await r.json();
  assert.equal(r.status,200);assert.equal(out.source,'Trading 212');assert.equal(out.environment,'live');assert.equal(out.data.id,'77');assert.ok(Number.isFinite(Date.parse(out.cancelledAt)));
  assert.equal(b.deletes().length,1);const d=b.deletes()[0];
  assert.equal(d.url,'https://live.trading212.com/api/v0/equity/orders/77');assert.equal(d.options.headers.Authorization,basic);assert.equal(d.options.redirect,'manual');
  assert.ok(!JSON.stringify(out).includes('secret_test'));
});
test('un id care nu e numeric, prea lung sau cu cale în el nu ajunge la broker',async()=>{
  for(const id of ['abc','77;x','../positions','7'.repeat(21),'77%2F1']){const b=broker(),r=await handle(req(ONE(id)),env,b.upstream);assert.ok(r.status>=400,id+' → '+r.status);assert.equal(b.calls.length,0,id);}
});
test('ordinul care nu mai există ⇒ order_not_found (409); cheia fără „Orders: Execute” ⇒ broker_permission_missing; nimic nu se reîncearcă',async()=>{
  const gone=broker({cancel:()=>json({code:'NotFound'},404)}),r1=await handle(req(ONE(77)),env,gone.upstream);assert.equal(r1.status,409);assert.equal((await r1.json()).error,'order_not_found');assert.equal(gone.deletes().length,1);
  const noperm=broker({cancel:()=>json({},403)}),r2=await handle(req(ONE(77)),env,noperm.upstream);assert.equal(r2.status,502);assert.equal((await r2.json()).error,'broker_permission_missing');
  const down=broker({cancel:()=>new Response('SECRET BODY',{status:500})}),r3=await handle(req(ONE(77)),env,down.upstream);assert.equal(r3.status,502);assert.ok(!(await r3.text()).includes('SECRET'));
});
test('cancel-all: citește ordinele în așteptare și le anulează pe toate (vânzări și cumpărări), în ordine, cu un singur termen comun',async()=>{
  const b=broker(),r=await handle(req(ALL,{method:'POST',body:{confirm:'OPRESC-TOT'}}),env,b.upstream),out=await r.json();
  assert.equal(r.status,200);assert.equal(out.source,'Trading 212');assert.equal(out.data.total,2);assert.equal(out.data.complet,true);
  assert.deepEqual(out.data.anulate.map(o=>[o.id,o.ticker,o.stopPrice,o.side]),[['77','MU_US_EQ',800.5,'SELL'],['78','AAPL_US_EQ',null,'BUY']]);assert.deepEqual(out.data.esuate,[]);
  assert.deepEqual(b.calls.map(c=>c.method+' '+new URL(c.url).pathname),['GET /api/v0/equity/orders','DELETE /api/v0/equity/orders/77','DELETE /api/v0/equity/orders/78']);
  assert.equal(new Set(b.calls.map(c=>c.options.signal)).size,1,'un singur termen pentru toată oprirea');
});
test('cancel-all fără confirmarea explicită, cu alt tip de conținut sau cu GET nu atinge brokerul',async()=>{
  for(const r0 of [req(ALL,{method:'POST',body:{}}),req(ALL,{method:'POST',body:{confirm:'opresc-tot'}}),req(ALL,{method:'POST',body:'{nu e json'}),req(ALL,{method:'POST',body:{confirm:'OPRESC-TOT'},type:'text/plain'}),req(ALL,{method:'GET'}),req(ALL,{method:'DELETE'})]){
    const b=broker(),r=await handle(r0,env,b.upstream);assert.ok(r.status>=400,String(r.status));assert.equal(b.calls.length,0);}
});
test('cancel-all: un ordin care nu se lasă anulat intră la „esuate”, restul se anulează, iar răspunsul spune că oprirea NU e completă',async()=>{
  const b=broker({cancel:url=>url.endsWith('/77')?json({},500):new Response(null,{status:200})}),r=await handle(req(ALL,{method:'POST',body:{confirm:'OPRESC-TOT'}}),env,b.upstream),out=await r.json();
  assert.equal(r.status,200);assert.equal(out.data.complet,false);assert.deepEqual(out.data.anulate.map(o=>o.id),['78']);assert.deepEqual(out.data.esuate.map(o=>[o.id,o.error]),[['77','broker_unavailable']]);
  const empty=broker({orders:[]}),r2=await handle(req(ALL,{method:'POST',body:{confirm:'OPRESC-TOT'}}),env,empty.upstream),o2=await r2.json();assert.equal(r2.status,200);assert.equal(o2.data.total,0);assert.equal(o2.data.complet,true);assert.equal(empty.deletes().length,0);
  const bad=broker({orders:{nu:'lista'}}),r3=await handle(req(ALL,{method:'POST',body:{confirm:'OPRESC-TOT'}}),env,bad.upstream);assert.equal(r3.status,502);assert.equal((await r3.json()).error,'broker_schema_mismatch');
});
test('altă origine, fără cheie, mediu greșit sau fără permisiune ⇒ nimic nu ajunge la broker; preflight-ul permite DELETE și POST doar pe aceste rute',async()=>{
  for(const r0 of [req(ONE(77),{origin:'https://evil.example'}),req(ONE(77),{auth:''}),req(ONE(77),{envName:'real'}),req(ALL,{method:'POST',body:{confirm:'OPRESC-TOT'},origin:'https://evil.example'})]){
    const b=broker(),r=await handle(r0,env,b.upstream);assert.ok(r.status>=400);assert.equal(b.calls.length,0);}
  const p=await handle(req(ONE(77),{method:'OPTIONS'}),env);assert.equal(p.status,204);assert.equal(p.headers.get('Access-Control-Allow-Methods'),'DELETE, POST, OPTIONS');
  const read=await handle(new Request('https://relay.workers.dev/api/trading212/positions',{method:'OPTIONS',headers:{Origin:ORIGIN}}),env);assert.equal(read.headers.get('Access-Control-Allow-Methods'),'GET, OPTIONS','rutele de citire rămân doar GET');
  let called=false;const posted=await handle(new Request('https://relay.workers.dev/api/trading212/positions',{method:'DELETE',headers:{Origin:ORIGIN,Authorization:basic,'X-T212-Environment':'live'}}),env,()=>{called=true;});assert.equal(posted.status,405);assert.equal(called,false,'DELETE pe o rută de citire rămâne refuzat');
});
