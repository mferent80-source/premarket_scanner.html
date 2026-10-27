import {summary, position, historyItem, pendingOrder} from '../lib/trading212-model.mjs';
// 20.10.2026 (I-723): `orders-pending` = ordinele în așteptare (GET /api/v0/equity/orders), DOAR citire — ca aplicația să vadă dacă stopul documentat e și ordin la broker.
export const ROUTES = Object.freeze({summary:'/api/v0/equity/account/summary',positions:'/api/v0/equity/positions',orders:'/api/v0/equity/history/orders',dividends:'/api/v0/equity/history/dividends',transactions:'/api/v0/equity/history/transactions','orders-pending':'/api/v0/equity/orders'});
const ORIGIN='https://mferent80-source.github.io';
async function equalSecret(a,b) {
  const hash=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [x,y]=await Promise.all([hash(a),hash(b)]);let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;
}
// Trading 212 poate pune în nextPagePath și alți parametri în afară de cursor (de ex. `time` la tranzacții). Fără ei pagina
// următoare e respinsă; ei călătoresc împachetați într-un cursor opac „p1.” și se întorc neschimbați la Trading 212.
const PACKED='p1.',plainCursor=c=>typeof c==='string'&&!!c&&c.length<=256&&/^[-\w:.]+$/.test(c);
const extraParam=(k,v)=>/^[a-zA-Z]{1,24}$/.test(k)&&k!=='cursor'&&k!=='limit'&&typeof v==='string'&&!!v&&v.length<=120&&/^[-\w:.+]+$/.test(v);
export function nextCursor(path,route,base) {
  if (!path) return null;
  const u=new URL(path,base);
  if (u.origin!==new URL(base).origin||u.pathname!==route) throw new Error('pagination');
  const c=u.searchParams.get('cursor');if(!plainCursor(c)||c.startsWith(PACKED))throw new Error('pagination');
  const extra=[...u.searchParams].filter(([k])=>k!=='cursor'&&k!=='limit');
  if(!extra.length)return c;
  if(extra.some(([k,v])=>!extraParam(k,v))||new Set(extra.map(([k])=>k)).size!==extra.length)throw new Error('pagination');
  const packed=PACKED+btoa(JSON.stringify(Object.fromEntries([['cursor',c],...extra]))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(packed.length>256)throw new Error('pagination');return packed;
}
function cursorParams(c) {
  if(!plainCursor(c))throw new Error('cursor');
  if(!c.startsWith(PACKED))return {cursor:c};
  const b=c.slice(PACKED.length).replace(/-/g,'+').replace(/_/g,'/'),value=JSON.parse(atob(b+'='.repeat((4-b.length%4)%4)));
  if(!value||typeof value!=='object'||Array.isArray(value)||!plainCursor(value.cursor)||value.cursor.startsWith(PACKED))throw new Error('cursor');
  for(const [k,v] of Object.entries(value))if(k!=='cursor'&&!extraParam(k,v))throw new Error('cursor');
  return value;
}
async function credentials(request,env){
  const authorization=request.headers.get('Authorization')||'',no=(error,status)=>({error,status});
  if(env.T212_AUTH_MODE==='session'){
    if(!authorization.startsWith('Basic ')||authorization.length>1500)return no('broker_credentials_required',401);
    let credentials;
    try{credentials=atob(authorization.slice(6));}catch(_){return no('broker_credentials_required',401);}
    const colon=credentials.indexOf(':');
    if(colon<1||colon>256||credentials.length-colon-1<1||credentials.length-colon-1>512||!/^[\x21-\x7e]+$/.test(credentials))return no('broker_credentials_required',401);
    const environment=request.headers.get('X-T212-Environment');
    if(environment!=='live'&&environment!=='demo')return no('invalid_environment',400);
    return {brokerAuthorization:authorization,environment};
  }
  if(!env.T212_API_KEY||!env.T212_API_SECRET||!env.T212_CLIENT_TOKEN||env.T212_CLIENT_TOKEN.length<32)return no('backend_not_configured',503);
  if(authorization.length>520||!authorization.startsWith('Bearer ')||!await equalSecret(authorization.slice(7),env.T212_CLIENT_TOKEN))return no('session_unauthorized',401);
  if(env.T212_ENV!=='live'&&env.T212_ENV!=='demo')return no('environment_not_configured',503);
  return {brokerAuthorization:'Basic '+btoa(env.T212_API_KEY+':'+env.T212_API_SECRET),environment:env.T212_ENV};
}
// 18.10.2026 (Marius, „fă tot” — butonul care pune stopul ca ordin REAL în Trading 212). Prima scriere a releului: un ordin STOP de VÂNZARE,
// GTC, pe o poziție care există, cel mult cât deții, cu stopul sub prețul de acum și nu sub jumătatea lui, și numai dacă nu ai deja o vânzare
// în așteptare pe aceeași acțiune. Nicio cumpărare. Singura altă scriere e anularea (I-757, mai jos). Fără permisiunea „Orders: execute” pe cheie,
// Trading 212 refuză (403) și aplicația spune exact ce lipsește.
export const STOP_ROUTE='/api/trading212/stop-order';
export const STOP_CONFIRM='PUN-STOPUL';
export function roundStop(price){const decimals=price>=1?2:4,f=10**decimals;return Math.floor(price*f+1e-7)/f;}
export function roundQuantity(q){return Math.floor(q*1e8+1e-6)/1e8;}
// 27.10.2026 (audit E, I-755): (1) cele trei apeluri ale unui ordin împart UN termen de 20 s (sub cele 25 s ale clientului — altfel ordinul putea fi pus
// după ce aplicația spusese „timeout” și o reîncercare îl dubla); (2) cheie de idempotență ticker + stop + cantitate + minut (+ contul), ținută
// 10 minute în memoria releului: aceeași cerere retrimisă primește răspunsul primei plasări, fără niciun apel nou la broker. Memoria e a izolatei
// (best effort); plasa a doua rămâne verificarea ordinelor în așteptare de la broker (sell_order_exists).
const BUDGET_MS=20000,IDEMPOTENT_MS=600000,recentOrders=new Map();
async function idempotencyKey(auth,ticker,stop,quantity,now){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.brokerAuthorization)));return auth.environment+'|'+Array.from(h.slice(0,12),x=>x.toString(16).padStart(2,'0')).join('')+'|'+ticker+'|'+stop+'|'+quantity+'|'+Math.floor(now/60000);}
function brokerCall(auth,upstream,deadline){const base=`https://${auth.environment}.trading212.com`;return (path,init={})=>upstream(new URL(path,base).href,{...init,redirect:'manual',signal:deadline,headers:{Authorization:auth.brokerAuthorization,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{})}});}
function refusal(reply,raw){if(raw.status>=300&&raw.status<400)return reply({error:'broker_redirected'},502);if(raw.status===429){const h=Number(raw.headers.get('x-ratelimit-reset'));return reply({error:'rate_limited',retryAfter:Math.min(300,Math.max(10,Number.isFinite(h)?Math.ceil(h-Date.now()/1000):60))},429);}return reply({error:raw.status===401?'broker_credentials_invalid':raw.status===403?'broker_permission_missing':'broker_unavailable'},502);}
const failureCode=error=>error?.name==='AbortError'||error?.name==='TimeoutError'?'broker_timeout':'broker_network_error';
async function readJson(request,reply){if(!/^application\/json\b/.test(request.headers.get('Content-Type')||''))return {error:reply({error:'invalid_body'},415)};try{const text=await request.text();if(text.length>1000)throw Error('size');return {body:JSON.parse(text)};}catch(_){return {error:reply({error:'invalid_body'},400)};}}
async function stopOrder(request,env,upstream,headers,reply,{now=Date.now(),memory=recentOrders}={}){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, X-T212-Environment, Content-Type','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  const parsed=await readJson(request,reply);if(parsed.error)return parsed.error;const body=parsed.body;
  const auth=await credentials(request,env);if(auth.error)return reply({error:auth.error},auth.status);
  const ticker=body?.ticker,quantity=roundQuantity(Number(body?.quantity)),asked=Number(body?.stopPrice);
  if(body?.confirm!==STOP_CONFIRM||typeof ticker!=='string'||!/^[A-Za-z0-9._-]{1,40}$/.test(ticker)||!(quantity>0)||quantity>1e7||!(asked>0)||asked>1e7)return reply({error:'invalid_order'},400);
  const stop=roundStop(asked),key=await idempotencyKey(auth,ticker,stop,quantity,now);
  for(const [k,v] of memory)if(now-v.at>IDEMPOTENT_MS)memory.delete(k);
  const seen=memory.get(key);if(seen)return reply({...seen.body,idempotent:true});
  const call=brokerCall(auth,upstream,AbortSignal.timeout(BUDGET_MS)),refused=raw=>refusal(reply,raw);
  try{
    const rp=await call(ROUTES.positions);if(!rp.ok)return refused(rp);
    const positions=await rp.json();if(!Array.isArray(positions))return reply({error:'broker_schema_mismatch'},502);
    const p=positions.find(x=>x?.instrument?.ticker===ticker);if(!p)return reply({error:'position_not_found'},409);
    const owned=Number(p.quantityAvailableForTrading??p.quantity),current=Number(p.currentPrice);
    if(!(owned>0)||quantity>owned+1e-9)return reply({error:'quantity_exceeds_position',owned:Number.isFinite(owned)?owned:null},409);
    if(!(current>0)||!(stop>0)||stop>=current)return reply({error:'stop_not_below_price',currentPrice:current>0?current:null},409);
    if(stop<current*0.5)return reply({error:'stop_too_far',currentPrice:current},409);
    const ro=await call(ROUTES['orders-pending']);if(!ro.ok)return refused(ro);
    const pending=await ro.json();if(!Array.isArray(pending))return reply({error:'broker_schema_mismatch'},502);
    const existing=pending.find(o=>(o?.ticker??o?.instrument?.ticker)===ticker&&(Number(o?.quantity)<0||String(o?.side||'').toUpperCase()==='SELL'));
    if(existing)return reply({error:'sell_order_exists',stopPrice:Number(existing.stopPrice)>0?Number(existing.stopPrice):null},409);
    const rs=await call('/api/v0/equity/orders/stop',{method:'POST',body:JSON.stringify({ticker,quantity:-quantity,stopPrice:stop,timeValidity:'GOOD_TILL_CANCEL'})});
    if(!rs.ok){if(rs.status===400||rs.status===422){let detail='';try{const b=await rs.json();detail=String(b?.message||b?.code||b?.clarification||'').replace(/[^\w .,:%()\-]/g,'').slice(0,160);}catch(_){}return reply({error:'broker_rejected',detail},502);}return refused(rs);}
    let placed={};try{placed=await rs.json();}catch(_){}
    const out={source:'Trading 212',environment:auth.environment,placedAt:new Date(now).toISOString(),data:{id:placed?.id??null,status:typeof placed?.status==='string'?placed.status:null,ticker,quantity,stopPrice:stop,currentPrice:current}};
    memory.set(key,{at:now,body:out});return reply(out);
  }catch(error){return reply({error:failureCode(error)},502);}
}
// 27.10.2026 (I-757, kill switch): a DOUA scriere a releului — anularea ordinelor în așteptare. `DELETE /api/trading212/orders/{id}` anulează unul;
// `POST /api/trading212/orders/cancel-all` cu confirmarea explicită le anulează pe toate (vânzări și cumpărări), în ordine, într-un singur termen de 20 s.
// Un ordin care nu se lasă anulat intră la „esuate”, restul merg mai departe; răspunsul spune cinstit dacă oprirea e completă. Nicio cumpărare, nicio altă scriere.
const CANCEL_ALL_ROUTE='/api/trading212/orders/cancel-all',CANCEL_ONE=/^\/api\/trading212\/orders\/(\d{1,20})$/,CANCEL_CONFIRM='OPRESC-TOT';
async function cancelOrders(request,env,upstream,headers,reply,{now=Date.now()}={}){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'DELETE, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, X-T212-Environment, Content-Type','Access-Control-Max-Age':'600'}});
  const path=new URL(request.url).pathname,one=CANCEL_ONE.exec(path);
  if(one?request.method!=='DELETE':request.method!=='POST')return reply({error:'method_not_allowed'},405);
  let body=null;if(!one){const parsed=await readJson(request,reply);if(parsed.error)return parsed.error;body=parsed.body;}
  const auth=await credentials(request,env);if(auth.error)return reply({error:auth.error},auth.status);
  if(!one&&body?.confirm!==CANCEL_CONFIRM)return reply({error:'invalid_order'},400);
  const call=brokerCall(auth,upstream,AbortSignal.timeout(BUDGET_MS)),refused=raw=>refusal(reply,raw),at=new Date(now).toISOString();
  try{
    if(one){const id=one[1],rd=await call('/api/v0/equity/orders/'+id,{method:'DELETE'});if(rd.status===404)return reply({error:'order_not_found'},409);if(!rd.ok)return refused(rd);return reply({source:'Trading 212',environment:auth.environment,cancelledAt:at,data:{id}});}
    const ro=await call(ROUTES['orders-pending']);if(!ro.ok)return refused(ro);
    const raw=await ro.json();if(!Array.isArray(raw))return reply({error:'broker_schema_mismatch'},502);
    let orders;try{orders=raw.map(pendingOrder);}catch(_){return reply({error:'broker_schema_mismatch'},502);}
    // 27.10.2026 (lotul E): niciun ordin nu dispare tăcut din răspuns — cel fără id valid și cele rămase neîncercate după termen intră la „esuate”
    const anulate=[],esuate=[],row=o=>({id:o.id,ticker:o.ticker,stopPrice:o.stopPrice,side:o.side,quantity:o.quantity,type:o.type});let expirat=false;
    for(const o of orders){
      if(expirat){esuate.push({...row(o),error:'broker_timeout'});continue;}
      if(typeof o.id!=='string'||!/^\d{1,20}$/.test(o.id)){esuate.push({...row(o),error:'invalid_id'});continue;}
      try{const rd=await call('/api/v0/equity/orders/'+o.id,{method:'DELETE'});if(rd.ok||rd.status===404)anulate.push(row(o));else esuate.push({...row(o),error:rd.status===401?'broker_credentials_invalid':rd.status===403?'broker_permission_missing':rd.status===429?'rate_limited':'broker_unavailable'});}
      catch(error){esuate.push({...row(o),error:failureCode(error)});if(error?.name==='TimeoutError'||error?.name==='AbortError')expirat=true;}}
    return reply({source:'Trading 212',environment:auth.environment,cancelledAt:at,data:{anulate,esuate,total:orders.length,complet:esuate.length===0&&anulate.length===orders.length}});
  }catch(error){return reply({error:failureCode(error)},502);}
}
export async function handle(request,env,upstream=fetch,options={}) {
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin===ORIGIN)headers['Access-Control-Allow-Origin']=ORIGIN;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin!==ORIGIN)return reply({error:'origin_forbidden'},403);
  const path=new URL(request.url).pathname;
  if(path===STOP_ROUTE)return stopOrder(request,env,upstream,headers,reply,options);
  if(path===CANCEL_ALL_ROUTE||CANCEL_ONE.test(path))return cancelOrders(request,env,upstream,headers,reply,options);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, X-T212-Environment','Access-Control-Max-Age':'600'}});
  if(request.method!=='GET')return reply({error:'read_only'},405);
  const url=new URL(request.url),kind=url.pathname.replace(/^\/api\/trading212\//,'');
  if(!Object.hasOwn(ROUTES,kind)||url.pathname!==`/api/trading212/${kind}`)return reply({error:'not_found'},404);
  const auth=await credentials(request,env);if(auth.error)return reply({error:auth.error},auth.status);
  const {brokerAuthorization,environment}=auth;
  const base=`https://${environment}.trading212.com`,target=new URL(ROUTES[kind],base);
  const historical=['orders','dividends','transactions'].includes(kind);
  for(const key of url.searchParams.keys())if(key!=='cursor'||!historical)return reply({error:'invalid_query'},400);
  if(historical){target.searchParams.set('limit','50');const c=url.searchParams.get('cursor');if(c){let params;try{params=cursorParams(c);}catch{return reply({error:'invalid_cursor'},400);}for(const [k,v] of Object.entries(params))target.searchParams.set(k,v);}}
  let stage='connect';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const raw=await upstream(target.href,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Authorization:brokerAuthorization,Accept:'application/json'}});
    if(raw.status>=300&&raw.status<400)return reply({error:'broker_redirected'},502);
    if(!raw.ok){
      if(raw.status===429){const h=raw.headers.get('x-ratelimit-reset');const reset=h?Number(h):NaN;const retry=Math.min(300,Math.max(10,Number.isFinite(reset)?Math.ceil(reset-Date.now()/1000):60));return reply({error:'rate_limited',retryAfter:retry},429);}
      return reply({error:raw.status===401?'broker_credentials_invalid':raw.status===403?'broker_permission_missing':'broker_unavailable'},502);
    }
    stage='decode';
    const data=await raw.json();let output;
    stage='schema';
    if(kind==='summary')output=summary(data);
    else if(kind==='positions'){if(!Array.isArray(data))throw new Error('schema');output=data.map(position);}
    else if(kind==='orders-pending'){if(!Array.isArray(data))throw new Error('schema');output=data.map(pendingOrder);}
    else {if(!Array.isArray(data.items))throw new Error('schema');output={items:data.items.map(item=>historyItem(item,kind)),nextCursor:nextCursor(data.nextPagePath,ROUTES[kind],base)};}
    return reply({source:'Trading 212',environment,fetchedAt:new Date().toISOString(),data:output});
  }catch(error){
    const code=stage==='connect'?(error?.name==='TimeoutError'||error?.name==='AbortError'?'broker_timeout':'broker_network_error'):stage==='decode'?'broker_non_json_response':'broker_schema_mismatch';
    return reply({error:code},502);
  }finally{clearTimeout(timer);}
}
export default {fetch(request,env){return handle(request,env);}};
