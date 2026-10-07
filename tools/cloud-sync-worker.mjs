import {KEYS,validateValue} from '../lib/cloud-sync-model.mjs';
import {handle as brokerHandle} from './trading212-worker.mjs';
const ORIGIN='https://mferent80-source.github.io',E=new TextEncoder(),D=new TextDecoder();
const b64=b=>{const bytes=new Uint8Array(b);let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const bytes=s=>{if(typeof s!=='string'||s.length>2000000||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('invalid_encoding');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));};
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export const PROTOCOL='tt-cloud-sync-v1';
export async function readiness(env){
 const checks={database:!!env.CLOUD_DB,google:/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||''),encryption:/^[A-Za-z0-9_-]{43}$/.test(env.CLOUD_ENCRYPTION_KEY||''),schema:false};
 if(checks.database)try{await env.CLOUD_DB.prepare('SELECT s.hash,s.subject,s.email,s.expires,c.nonce,c.expires,r.subject,r.key,r.revision,r.packet,r.updated,l.key,l.bucket,l.count FROM cloud_sessions s,cloud_challenges c,cloud_records r,cloud_limits l WHERE 0').first();checks.schema=true;}catch{}
 const enabled=Object.values(checks).every(v=>v===true);return {enabled,protocol:PROTOCOL,clientId:enabled?env.GOOGLE_CLIENT_ID:null,checks,supportedKeys:KEYS};
}
const hash=async s=>b64(await crypto.subtle.digest('SHA-256',E.encode(s)));
export async function seal(value,secret,aad){const raw=bytes(secret);if(raw.length!==32)throw Error('encryption_key_invalid');const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));return JSON.stringify({v:1,iv:b64(iv),cipher:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:E.encode(aad)},key,E.encode(JSON.stringify(value))))});}
export async function unseal(packet,secret,aad){const p=JSON.parse(packet);if(p.v!==1)throw Error('invalid_packet');const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);return JSON.parse(D.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(p.iv),additionalData:E.encode(aad)},key,bytes(p.cipher))));}
export async function verifyGoogle(token,audience,nonce,upstream=fetch,now=Date.now()){
 if(typeof token!=='string'||token.length>16000)throw Error('invalid_google_token');const parts=token.split('.');if(parts.length!==3)throw Error('invalid_google_token');
 const head=JSON.parse(D.decode(bytes(parts[0]))),p=JSON.parse(D.decode(bytes(parts[1])));
 if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>200||p.aud!==audience||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||!Number.isFinite(p.exp)||p.exp<=now/1000||!Number.isFinite(p.iat)||p.iat>now/1000+60||p.iat<now/1000-600||p.nonce!==nonce||typeof p.sub!=='string'||!/^\d{1,128}$/.test(p.sub)||p.email_verified!==true||typeof p.email!=='string'||p.email.length>254)throw Error('invalid_google_token');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let r;try{r=await upstream('https://www.googleapis.com/oauth2/v3/certs',{redirect:'error',signal:controller.signal});}finally{clearTimeout(timer);}if(!r.ok)throw Error('google_unavailable');const jwks=await r.json(),jwk=jwks.keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&k.alg==='RS256');if(!jwk)throw Error('invalid_google_token');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),E.encode(parts[0]+'.'+parts[1])))throw Error('invalid_google_token');return {subject:p.sub,email:p.email};
}
async function body(request,max=1100000){if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Error('json_required');if(Number(request.headers.get('Content-Length'))>max)throw Error('body_too_large');const reader=request.body?.getReader();if(!reader)throw Error('invalid_body');let size=0,chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('body_too_large');}chunks.push(value);}}finally{reader.releaseLock();}const joined=new Uint8Array(size);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}return JSON.parse(D.decode(joined));}
export async function handleCloud(request,env,upstream=fetch){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/cloud/'))return brokerHandle(request,env,upstream);
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 const reply=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
 if(request.headers.get('Origin')!==ORIGIN)return reply({error:'origin_forbidden'},403);headers['Access-Control-Allow-Origin']=ORIGIN;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
 const configured=!!env.CLOUD_DB&&/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||'')&&/^[A-Za-z0-9_-]{43}$/.test(env.CLOUD_ENCRYPTION_KEY||'');
 if(url.pathname==='/api/cloud/status'&&request.method==='GET')return reply(await readiness(env));
 if(!configured)return reply({error:'cloud_not_configured'},503);
 const db=env.CLOUD_DB,now=Math.floor(Date.now()/1000);
 async function limited(key,max){const bucket=Math.floor(now/60);const row=await db.prepare('INSERT INTO cloud_limits(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN bucket=excluded.bucket THEN count+1 ELSE 1 END,bucket=excluded.bucket RETURNING count').bind(key,bucket).first();return row.count>max;}
 try{
  if(['/api/cloud/challenge','/api/cloud/auth'].includes(url.pathname)){const ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');if(await limited('auth:'+ip,20))return reply({error:'rate_limited'},429);}
  if(url.pathname==='/api/cloud/challenge'&&request.method==='POST'){await body(request,1000);await db.prepare('DELETE FROM cloud_limits WHERE bucket < ?').bind(Math.floor(now/60)-10).run();await db.prepare('DELETE FROM cloud_challenges WHERE expires < ?').bind(now).run();await db.prepare('DELETE FROM cloud_sessions WHERE expires < ?').bind(now).run();const nonce=random();await db.prepare('INSERT INTO cloud_challenges(nonce,expires) VALUES(?,?)').bind(nonce,now+300).run();return reply({nonce});}
  if(url.pathname==='/api/cloud/auth'&&request.method==='POST'){
   const b=await body(request,20000);if(typeof b.nonce!=='string'||b.nonce.length!==43)return reply({error:'invalid_challenge'},401);
   const c=await db.prepare('SELECT expires FROM cloud_challenges WHERE nonce=?').bind(b.nonce).first();if(!c||c.expires<=now)return reply({error:'challenge_expired'},401);
   const identity=await verifyGoogle(b.credential,env.GOOGLE_CLIENT_ID,b.nonce,upstream);
   if(env.GOOGLE_ALLOWED_SUB&&identity.subject!==env.GOOGLE_ALLOWED_SUB)return reply({error:'account_not_allowed'},403);
   const consume=await db.prepare('DELETE FROM cloud_challenges WHERE nonce=? AND expires>?').bind(b.nonce,now).run();if(consume.meta.changes!==1)return reply({error:'challenge_used'},401);
   const token=random(),expires=now+2592000;await db.prepare('INSERT INTO cloud_sessions(hash,subject,email,expires) VALUES(?,?,?,?)').bind(await hash(token),identity.subject,identity.email,expires).run();return reply({token,subject:identity.subject,email:identity.email,expires});
  }
  const authorization=request.headers.get('Authorization')||'';if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))return reply({error:'session_required'},401);
  const sessionHash=await hash(authorization.slice(7)),session=await db.prepare('SELECT subject,email,expires FROM cloud_sessions WHERE hash=?').bind(sessionHash).first();if(!session||session.expires<=now)return reply({error:'session_expired'},401);
  const subject=session.subject;if(await limited('session:'+sessionHash,120))return reply({error:'rate_limited'},429);
  if(url.pathname==='/api/cloud/session'&&request.method==='DELETE'){await db.prepare('DELETE FROM cloud_sessions WHERE hash=?').bind(sessionHash).run();return reply({ok:true});}
  if(url.pathname==='/api/cloud/session'&&request.method==='GET')return reply({subject,email:session.email,expires:session.expires});
  if(url.pathname==='/api/cloud/records'&&request.method==='GET'){
   const rows=await db.prepare('SELECT key,revision,packet,updated FROM cloud_records WHERE subject=?').bind(subject).all(),records={};for(const r of rows.results)records[r.key]={revision:r.revision,updated:r.updated,value:await unseal(r.packet,env.CLOUD_ENCRYPTION_KEY,subject+'|'+r.key+'|'+r.revision)};return reply({records});
  }
  if(url.pathname==='/api/cloud/record'&&request.method==='PUT'){
   const b=await body(request);validateValue(b.key,b.value);if(!Number.isSafeInteger(b.revision)||b.revision<0)return reply({error:'invalid_revision'},400);
   const revision=b.revision+1,packet=await seal(b.value,env.CLOUD_ENCRYPTION_KEY,subject+'|'+b.key+'|'+revision);let result;
   if(b.revision===0)result=await db.prepare('INSERT OR IGNORE INTO cloud_records(subject,key,revision,packet,updated) VALUES(?,?,?,?,?)').bind(subject,b.key,revision,packet,now).run();
   else result=await db.prepare('UPDATE cloud_records SET revision=?,packet=?,updated=? WHERE subject=? AND key=? AND revision=?').bind(revision,packet,now,subject,b.key,b.revision).run();
   if(result.meta.changes!==1)return reply({error:'revision_conflict'},409);return reply({revision,updated:now});
  }
  return reply({error:'not_found'},404);
 }catch(error){const safe=['invalid_google_token','google_unavailable','invalid_encoding','invalid_key','invalid_value','invalid_credentials','record_too_large','body_too_large','json_required','invalid_body'];const code=safe.includes(error.message)?error.message:'cloud_unavailable';return reply({error:code},code==='invalid_google_token'?401:code==='google_unavailable'||code==='cloud_unavailable'?503:400);}
}
export default {fetch:handleCloud};
