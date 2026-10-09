import {readPrivate,writePrivate} from './cloud-private-store.mjs';
export const AUDIT_KEY='__audit_receipts_v1';
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
export async function handleAudit({request,subject,env,deps,parseBody}){
 const reply=(body,status=200)=>({body,status});if(request.method==='GET'){const row=await readPrivate(subject,AUDIT_KEY,env,deps);return reply({protocol:'tt-audit-v1',receipts:row?.value.receipts||[]});}
 if(request.method!=='POST')return reply({error:'not_found'},404);const b=await parseBody(request,20000);if(Object.keys(b).some(k=>k!=='entries')||!Array.isArray(b.entries)||b.entries.length>50||b.entries.some(x=>!x||Object.keys(x).some(k=>!['id','digest','kind'].includes(k))||typeof x.id!=='string'||!x.id||x.id.length>400||!/^[a-f0-9]{64}$/.test(x.digest||'')||!['analysis','plan','thesis'].includes(x.kind))||new Set(b.entries.map(x=>x.id)).size!==b.entries.length)return reply({error:'invalid_audit'},400);
 for(let attempt=0;attempt<3;attempt++){
  const row=await readPrivate(subject,AUDIT_KEY,env,deps),receipts=[...(row?.value.receipts||[])],added=[];let previous=receipts.at(-1)?.chain||'0'.repeat(64);
  for(const item of b.entries){const old=receipts.find(r=>r.id===item.id);if(old){if(old.digest!==item.digest||old.kind!==item.kind)return reply({error:'audit_original_changed',id:item.id},409);continue;}if(receipts.length>=5000)return reply({error:'audit_full'},400);const r={...item,acceptedAt:Date.now(),previous};r.chain=await digest(JSON.stringify(r));previous=r.chain;receipts.push(r);added.push(r);}
  if(!added.length)return reply({protocol:'tt-audit-v1',receipts});if(await writePrivate(subject,AUDIT_KEY,{receipts},row?.revision||0,env,deps))return reply({protocol:'tt-audit-v1',receipts});
 }
 return reply({error:'revision_conflict'},409);
}
