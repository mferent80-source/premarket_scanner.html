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
export async function handle(request,env,upstream=fetch) {
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin===ORIGIN)headers['Access-Control-Allow-Origin']=ORIGIN;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin!==ORIGIN)return reply({error:'origin_forbidden'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, X-T212-Environment','Access-Control-Max-Age':'600'}});
  if(request.method!=='GET')return reply({error:'read_only'},405);
  const url=new URL(request.url),kind=url.pathname.replace(/^\/api\/trading212\//,'');
  if(!Object.hasOwn(ROUTES,kind)||url.pathname!==`/api/trading212/${kind}`)return reply({error:'not_found'},404);
  const authorization=request.headers.get('Authorization')||'';
  let brokerAuthorization,environment;
  if(env.T212_AUTH_MODE==='session'){
    if(!authorization.startsWith('Basic ')||authorization.length>1500)return reply({error:'broker_credentials_required'},401);
    let credentials;
    try{credentials=atob(authorization.slice(6));}catch(_){return reply({error:'broker_credentials_required'},401);}
    const colon=credentials.indexOf(':');
    if(colon<1||colon>256||credentials.length-colon-1<1||credentials.length-colon-1>512||!/^[\x21-\x7e]+$/.test(credentials))return reply({error:'broker_credentials_required'},401);
    environment=request.headers.get('X-T212-Environment');
    if(environment!=='live'&&environment!=='demo')return reply({error:'invalid_environment'},400);
    brokerAuthorization=authorization;
  }else{
    if(!env.T212_API_KEY||!env.T212_API_SECRET||!env.T212_CLIENT_TOKEN||env.T212_CLIENT_TOKEN.length<32)return reply({error:'backend_not_configured'},503);
    if(authorization.length>520||!authorization.startsWith('Bearer ')||!await equalSecret(authorization.slice(7),env.T212_CLIENT_TOKEN))return reply({error:'session_unauthorized'},401);
    if(env.T212_ENV!=='live'&&env.T212_ENV!=='demo')return reply({error:'environment_not_configured'},503);
    environment=env.T212_ENV;
    brokerAuthorization='Basic '+btoa(env.T212_API_KEY+':'+env.T212_API_SECRET);
  }
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
