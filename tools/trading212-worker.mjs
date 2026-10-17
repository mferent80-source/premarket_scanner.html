import {summary, position, historyItem} from '../lib/trading212-model.mjs';
export const ROUTES = Object.freeze({summary:'/api/v0/equity/account/summary',positions:'/api/v0/equity/positions',orders:'/api/v0/equity/history/orders',dividends:'/api/v0/equity/history/dividends',transactions:'/api/v0/equity/history/transactions'});
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
// 18.10.2026 (Marius, „fă tot” — butonul care pune stopul ca ordin REAL în Trading 212). SINGURA scriere a releului: un ordin STOP de VÂNZARE,
// GTC, pe o poziție care există, cel mult cât deții, cu stopul sub prețul de acum și nu sub jumătatea lui, și numai dacă nu ai deja o vânzare
// în așteptare pe aceeași acțiune. Nicio cumpărare, nicio anulare, nicio altă rută de scriere. Fără permisiunea „Orders: execute” pe cheie,
// Trading 212 refuză (403) și aplicația spune exact ce lipsește.
export const STOP_ROUTE='/api/trading212/stop-order';
export const STOP_CONFIRM='PUN-STOPUL';
export function roundStop(price){const decimals=price>=1?2:4,f=10**decimals;return Math.floor(price*f+1e-7)/f;}
export function roundQuantity(q){return Math.floor(q*1e8+1e-6)/1e8;}
async function stopOrder(request,env,upstream,headers,reply){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, X-T212-Environment, Content-Type','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(!/^application\/json\b/.test(request.headers.get('Content-Type')||''))return reply({error:'invalid_body'},415);
  const auth=await credentials(request,env);if(auth.error)return reply({error:auth.error},auth.status);
  let body;try{const text=await request.text();if(text.length>1000)throw Error('size');body=JSON.parse(text);}catch(_){return reply({error:'invalid_body'},400);}
  const ticker=body?.ticker,quantity=roundQuantity(Number(body?.quantity)),asked=Number(body?.stopPrice);
  if(body?.confirm!==STOP_CONFIRM||typeof ticker!=='string'||!/^[A-Za-z0-9._-]{1,40}$/.test(ticker)||!(quantity>0)||quantity>1e7||!(asked>0)||asked>1e7)return reply({error:'invalid_order'},400);
  const base=`https://${auth.environment}.trading212.com`;
  async function call(path,init={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{return await upstream(new URL(path,base).href,{...init,redirect:'manual',signal:controller.signal,headers:{Authorization:auth.brokerAuthorization,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{})}});}finally{clearTimeout(timer);}}
  function refused(raw){if(raw.status>=300&&raw.status<400)return reply({error:'broker_redirected'},502);if(raw.status===429){const h=Number(raw.headers.get('x-ratelimit-reset'));return reply({error:'rate_limited',retryAfter:Math.min(300,Math.max(10,Number.isFinite(h)?Math.ceil(h-Date.now()/1000):60))},429);}return reply({error:raw.status===401?'broker_credentials_invalid':raw.status===403?'broker_permission_missing':'broker_unavailable'},502);}
  try{
    const rp=await call(ROUTES.positions);if(!rp.ok)return refused(rp);
    const positions=await rp.json();if(!Array.isArray(positions))return reply({error:'broker_schema_mismatch'},502);
    const p=positions.find(x=>x?.instrument?.ticker===ticker);if(!p)return reply({error:'position_not_found'},409);
    const owned=Number(p.quantityAvailableForTrading??p.quantity),current=Number(p.currentPrice),stop=roundStop(asked);
    if(!(owned>0)||quantity>owned+1e-9)return reply({error:'quantity_exceeds_position',owned:Number.isFinite(owned)?owned:null},409);
    if(!(current>0)||!(stop>0)||stop>=current)return reply({error:'stop_not_below_price',currentPrice:current>0?current:null},409);
    if(stop<current*0.5)return reply({error:'stop_too_far',currentPrice:current},409);
    const ro=await call('/api/v0/equity/orders');if(!ro.ok)return refused(ro);
    const pending=await ro.json();if(!Array.isArray(pending))return reply({error:'broker_schema_mismatch'},502);
    const existing=pending.find(o=>(o?.ticker??o?.instrument?.ticker)===ticker&&(Number(o?.quantity)<0||String(o?.side||'').toUpperCase()==='SELL'));
    if(existing)return reply({error:'sell_order_exists',stopPrice:Number(existing.stopPrice)>0?Number(existing.stopPrice):null},409);
    const rs=await call('/api/v0/equity/orders/stop',{method:'POST',body:JSON.stringify({ticker,quantity:-quantity,stopPrice:stop,timeValidity:'GOOD_TILL_CANCEL'})});
    if(!rs.ok){if(rs.status===400||rs.status===422){let detail='';try{const b=await rs.json();detail=String(b?.message||b?.code||b?.clarification||'').replace(/[^\w .,:%()\-]/g,'').slice(0,160);}catch(_){}return reply({error:'broker_rejected',detail},502);}return refused(rs);}
    let placed={};try{placed=await rs.json();}catch(_){}
    return reply({source:'Trading 212',environment:auth.environment,placedAt:new Date().toISOString(),data:{id:placed?.id??null,status:typeof placed?.status==='string'?placed.status:null,ticker,quantity,stopPrice:stop,currentPrice:current}});
  }catch(error){return reply({error:error?.name==='AbortError'||error?.name==='TimeoutError'?'broker_timeout':'broker_network_error'},502);}
}
export async function handle(request,env,upstream=fetch) {
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin===ORIGIN)headers['Access-Control-Allow-Origin']=ORIGIN;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin!==ORIGIN)return reply({error:'origin_forbidden'},403);
  if(new URL(request.url).pathname===STOP_ROUTE)return stopOrder(request,env,upstream,headers,reply);
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
    else {if(!Array.isArray(data.items))throw new Error('schema');output={items:data.items.map(item=>historyItem(item,kind)),nextCursor:nextCursor(data.nextPagePath,ROUTES[kind],base)};}
    return reply({source:'Trading 212',environment,fetchedAt:new Date().toISOString(),data:output});
  }catch(error){
    const code=stage==='connect'?(error?.name==='TimeoutError'||error?.name==='AbortError'?'broker_timeout':'broker_network_error'):stage==='decode'?'broker_non_json_response':'broker_schema_mismatch';
    return reply({error:code},502);
  }finally{clearTimeout(timer);}
}
export default {fetch(request,env){return handle(request,env);}};
