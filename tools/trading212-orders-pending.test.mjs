// 27.10.2026 (I-755): ruta `orders-pending` a releului Trading 212 (doar citire) avea doar testul modulului client — schema `pendingOrder`
// nu era probată pe releu. Plus: banii din Pies intră în sumar (reconcilierea I-759 îi adună la numerar) și anularea în masă nu mai pierde
// tăcut un ordin fără id valid (intră la „esuate”, oprirea nu e „completă”).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handle} from './trading212-worker.mjs';
import {summary} from '../lib/trading212-model.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ORIGIN='https://mferent80-source.github.io',env={T212_AUTH_MODE:'session'},basic='Basic '+btoa('cheie_test:secret_test');
const req=(path,{method='GET',origin=ORIGIN,body}={})=>new Request('https://relay.workers.dev'+path,{method,headers:{Origin:origin,Authorization:basic,'X-T212-Environment':'live',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('orders-pending: cere GET /api/v0/equity/orders cu cheia din antet și întoarce schema pendingOrder (vânzarea cu cantitate negativă ⇒ SELL, id-ul ca text)',async()=>{
  const calls=[];const r=await handle(req('/api/trading212/orders-pending'),env,async(url,options)=>{calls.push({url,options});return json([{id:77,type:'STOP',quantity:-5.5,stopPrice:800.5,status:'NEW',timeValidity:'GOOD_TILL_CANCEL',createdAt:'2026-10-27T10:00:00Z',instrument:{ticker:'MU_US_EQ',currency:'USD'}},{id:78,ticker:'AAPL_US_EQ',type:'LIMIT',quantity:2,limitPrice:150,status:'NEW'}]);});
  assert.equal(r.status,200);const out=await r.json();
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://live.trading212.com/api/v0/equity/orders');assert.equal(calls[0].options.headers.Authorization,basic);assert.equal(calls[0].options.redirect,'manual');
  assert.equal(out.source,'Trading 212');assert.equal(out.environment,'live');assert.ok(Number.isFinite(Date.parse(out.fetchedAt)));
  assert.deepEqual(out.data.map(o=>[o.id,o.ticker,o.type,o.side,o.quantity,o.stopPrice,o.limitPrice,o.currency]),[['77','MU_US_EQ','STOP','SELL',5.5,800.5,null,'USD'],['78','AAPL_US_EQ','LIMIT','BUY',2,null,150,null]]);
  assert.equal(JSON.stringify(out).includes('cheie_test'),false,'cheia nu se întoarce');
});
test('orders-pending: răspuns care nu e listă ⇒ broker_schema_mismatch; 403 ⇒ broker_permission_missing; parametru în URL ⇒ invalid_query fără apel; altă origine ⇒ 403 fără apel',async()=>{
  let r=await handle(req('/api/trading212/orders-pending'),env,async()=>json({items:[]}));assert.equal(r.status,502);assert.equal((await r.json()).error,'broker_schema_mismatch');
  r=await handle(req('/api/trading212/orders-pending'),env,async()=>new Response('{}',{status:403}));assert.equal((await r.json()).error,'broker_permission_missing');
  let called=false;r=await handle(req('/api/trading212/orders-pending?cursor=1'),env,async()=>{called=true;return json([]);});assert.equal(r.status,400);assert.equal((await r.json()).error,'invalid_query');
  r=await handle(req('/api/trading212/orders-pending',{origin:'https://evil.example'}),env,async()=>{called=true;return json([]);});assert.equal(r.status,403);assert.equal(called,false);
  r=await handle(req('/api/trading212/orders-pending',{method:'POST',body:{}}),env,async()=>{called=true;return json([]);});assert.equal(r.status,405);assert.equal(called,false);
});
test('sumarul păstrează banii din Pies (cash.inPies), ca valoarea contului să se închidă la reconciliere',()=>{
  const s=summary({currency:'RON',totalValue:10300,cash:{availableToTrade:2000,reservedForOrders:0,inPies:300},investments:{currentValue:8000}});
  assert.equal(s.inPies,300);assert.equal(summary({currency:'RON',totalValue:1,cash:{availableToTrade:1}}).inPies,null);
});
test('cancel-all: un ordin fără id valid nu dispare tăcut — intră la „esuate” și oprirea nu e completă',async()=>{
  const deletes=[];const r=await handle(req('/api/trading212/orders/cancel-all',{method:'POST',body:{confirm:'OPRESC-TOT'}}),env,async(url,options={})=>{if(options.method==='DELETE'){deletes.push(url);return new Response(null,{status:200});}return json([{id:77,ticker:'MU_US_EQ',type:'STOP',quantity:-1,stopPrice:10},{ticker:'AAPL_US_EQ',type:'LIMIT',quantity:2,limitPrice:150}]);});
  const out=await r.json();assert.equal(r.status,200);
  assert.equal(deletes.length,1);assert.equal(out.data.total,2);assert.equal(out.data.complet,false);
  assert.deepEqual(out.data.anulate.map(o=>o.id),['77']);assert.deepEqual(out.data.esuate.map(o=>[o.ticker,o.error]),[['AAPL_US_EQ','invalid_id']]);
});
