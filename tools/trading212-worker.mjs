import {summary, position, historyItem} from '../lib/trading212-model.mjs';
export const ROUTES = Object.freeze({summary:'/api/v0/equity/account/summary',positions:'/api/v0/equity/positions',orders:'/api/v0/equity/history/orders',dividends:'/api/v0/equity/history/dividends',transactions:'/api/v0/equity/history/transactions'});
const ORIGIN='https://mferent80-source.github.io';
async function equalSecret(a,b) {
  const hash=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [x,y]=await Promise.all([hash(a),hash(b)]);let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;
}
export function nextCursor(path,route,base) {
  if (!path) return null;
  const u=new URL(path,base);
  if (u.origin!==new URL(base).origin||u.pathname!==route) throw new Error('pagination');
  const c=u.searchParams.get('cursor');if(!c||c.length>256||!/^[-\w:.]+$/.test(c))throw new Error('pagination');return c;
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
  if(historical){target.searchParams.set('limit','50');const c=url.searchParams.get('cursor');if(c){if(c.length>256||!/^[-\w:.]+$/.test(c))return reply({error:'invalid_cursor'},400);target.searchParams.set('cursor',c);}}
  let stage='connect';
  try {
    const raw=await upstream(target.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:brokerAuthorization,Accept:'application/json'}});
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
  }
}
export default {fetch(request,env){return handle(request,env);}};
