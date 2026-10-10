(function(g){'use strict';
const PROTOCOL='tt-operational-report-v1',STATES=['good','warning','blocked','unknown'];
const validTime=(v,now)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=now+60000;
const stamp=v=>new Date(v).toLocaleString('ro-RO');
const row=(id,title,state,detail,action='')=>({id,title,state,detail,action});
function storageRow(id,title,result,now){
 if(!result||!validTime(result.at,now))return row(id,title,'unknown','Salvarea și recitirea nu au fost testate.','Apasă „Verifică stocarea locală”.');
 if(now-result.at>600000)return row(id,title,'warning','Testul anterior este mai vechi de 10 minute.','Repetă verificarea pe acest dispozitiv.');
 const messages={verified:'Scriere, recitire și eliminarea valorii de test confirmate.',unavailable:'Stocarea nu este disponibilă în acest browser.',failed:'Scrierea sau recitirea valorii de test a eșuat.',cleanup:'Eliminarea valorii temporare nu a fost confirmată.',timeout:'Testul nu s-a încheiat în limita de timp.',collision:'Valoarea temporară nu a fost creată; cheia exista deja.'},state=result.code==='verified'&&result.state==='good'?'good':['unavailable','failed','cleanup'].includes(result.code)?'blocked':'unknown';
 return row(id,title,state,(messages[result.code]||'Rezultat neconfirmat.')+' · '+stamp(result.at),state==='good'?'Testul verifică o valoare mică acum; nu garantează spațiul pentru un backup mare sau păstrarea după închiderea browserului.':'Păstrează un backup descărcat și repetă verificarea; nu șterge datele site-ului.');
}
function build({cloud={},online=true,snapshot=null,snapshotError=false,permission='unsupported',storage=null,now=Date.now()}={}){
 const rows=[],s=cloud||{},conflicts=Array.isArray(s.conflicts)?s.conflicts.length:0;
 rows.push(row('internet','Conexiune internet',online===false?'warning':'good',online===false?'Browserul raportează modul offline.':'Browserul raportează o conexiune disponibilă.',online===false?'Revino online înainte de sincronizare.':'Disponibilitatea rețelei nu confirmă că fiecare serviciu răspunde.'));
 rows.push(row('session','Sesiune Google',s.error==='account_mismatch'?'blocked':s.connected===true?'good':'unknown',s.error==='account_mismatch'?'Datele locale aparțin altui cont Google.':s.connected===true?'Cont conectat pe acest dispozitiv.':'Nicio sesiune Google confirmată.',s.error==='account_mismatch'?'Folosește contul inițial; datele locale rămân păstrate.':s.connected===true?'Folosește același cont pe PC și telefon.':'Conectează Google din secțiunea de mai sus.'));
 let sync=row('sync','Sincronizare pe acest dispozitiv','unknown','Nicio reconciliere confirmată.','Conectează Google, apoi apasă „Sincronizează acum”.');
 if(s.connected){
  if(s.backupPaused)sync=row('sync',sync.title,'warning','Suspendată pentru restaurarea unui backup.','Verifică datele restaurate, apoi apasă „Sincronizează acum”.');
  else if(s.error)sync=row('sync',sync.title,'blocked','Ultima verificare are o eroare; ora anterioară nu confirmă starea curentă.','Verifică mesajul din Conectare Google și reîncearcă.');
  else if(conflicts)sync=row('sync',sync.title,'warning',conflicts+' registre cer alegerea ta.','Compară variantele din „Modificări care cer alegerea ta”.');
  else if(s.busy||s.checking)sync=row('sync',sync.title,'unknown','Verificare în curs.','Așteaptă finalizarea.');
  else if(!s.ready)sync=row('sync',sync.title,'blocked','Serviciul nu este disponibil pentru sincronizare.','Apasă „Reverifică serviciile”.');
  else if(validTime(s.lastSync,now))sync=row('sync',sync.title,now-s.lastSync<=300000?'good':'warning','Ultima reconciliere locală: '+stamp(s.lastSync),now-s.lastSync<=300000?'Această oră nu dovedește că celălalt dispozitiv a primit datele.':'Apasă „Sincronizează acum”.');
  else if(s.lastSync!=null)sync=row('sync',sync.title,'blocked','Ora ultimei reconcilieri este incompatibilă.','Verifică ora dispozitivului și apasă „Sincronizează acum”.');
  else sync=row('sync',sync.title,'unknown','Sesiune conectată, fără reconciliere confirmată.','Apasă „Sincronizează acum”.');
 }
 rows.push(sync);
 rows.push(row('broker-cloud','Conexiune broker în cloud',!s.connected?'unknown':s.trading212?.cloud===true?'good':'unknown',s.connected&&s.trading212?.cloud===true?'Conexiune salvată în cloud.':'Nicio conexiune cloud confirmată în sesiunea curentă.',s.connected&&s.trading212?.cloud===true?'Salvarea conexiunii nu confirmă o citire recentă a brokerului.':'Verifică secțiunea Conexiunea Trading 212.'));
 const a=Array.isArray(snapshot)?snapshot[1]:null,at=typeof a?.fetchedAt==='string'?Date.parse(a.fetchedAt):NaN,complete=a?.environment==='live'&&Array.isArray(a.positions)&&a.summary&&typeof a.summary==='object'&&!Array.isArray(a.summary);
 rows.push(snapshotError?row('snapshot','Snapshot Invest','blocked','Datele locale nu pot fi citite.','Verifică Starea datelor; păstrează originalele.'):!a?row('snapshot','Snapshot Invest','unknown','Nu există un snapshot Invest.','Deschide Trading 212 Invest și actualizează contul.'):!validTime(at,now)?row('snapshot','Snapshot Invest','blocked','Ora sursei lipsește sau este incompatibilă.','Actualizează contul în Trading 212 Invest.'):!complete?row('snapshot','Snapshot Invest','warning','Snapshot parțial · '+stamp(at),'Actualizează contul până când lista pozițiilor și soldul sunt complete.'):row('snapshot','Snapshot Invest',now-at<=300000?'good':'warning',(now-at<=300000?'Observație recentă':'Observație mai veche de 5 minute')+' · '+stamp(at),'Ora citirii nu reprezintă un preț executabil live.'));
 const m=s.monitor,heartbeat=s.ready===true&&m?.protocol==='tt-account-monitor-v1'&&m.schedulerFresh===true&&validTime(m.schedulerAt,now)&&now-m.schedulerAt<=600000;
 rows.push(row('scheduler','Scheduler al serviciului',heartbeat?'good':'unknown',heartbeat?'Rulare periodică observată · '+stamp(m.schedulerAt):'Rulare recentă neconfirmată.','Această stare nu confirmă că monitorizarea contului tău este activată; verifică secțiunea Monitorizare.'));
 const push=s.ready===true&&s.push?.protocol==='tt-web-push-v1'&&s.push.available===true;
 rows.push(row('push','Notificări pe acest dispozitiv',permission==='denied'?'blocked':permission==='unsupported'?'unknown':push?'warning':'unknown',permission==='denied'?'Permisiunea browserului este blocată.':permission==='unsupported'?'Browserul nu confirmă suportul pentru notificări push.':!push?'Serviciul push nu este confirmat.':permission==='granted'?'Permisiune acordată; primirea unui test rămâne de verificat.':'Serviciu disponibil; notificările trebuie activate aici.',permission==='denied'?'În Chrome: informațiile site-ului → Permisiuni → Notificări.':'Folosește „Alerte pe telefon și PC”; confirmarea primirii apare separat acolo.'));
 const audit=s.ready===true&&s.audit?.protocol==='tt-audit-v1'&&s.audit.available===true;
 rows.push(row('audit','Amprente server',audit?'good':'unknown',audit?'Serviciu disponibil; trimiterea analizelor este separată.':'Serviciu neconfirmat.','Verificarea unei analize se face în Decision Desk → Dovezi înaintea intrării.'));
 rows.push(storageRow('local-storage','Stocarea registrelor locale',storage?.local,now),storageRow('private-storage','Stocarea privată criptată',storage?.private,now));
 return {protocol:PROTOCOL,checkedAt:new Date(now).toISOString(),rows,counts:Object.fromEntries(STATES.map(state=>[state,rows.filter(x=>x.state===state).length]))};
}
function report(input={}){const now=input.now??Date.now();return {...build({...input,now}),appVersion:/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(input.appVersion||'')?input.appVersion:null,limitations:['Verifică numai starea acestui dispozitiv; nu certifică sincronizarea PC ↔ Android.','Nu confirmă primirea unei notificări pe alt dispozitiv.','Testul stocării folosește o valoare mică, nu un backup complet.'],storageCheckedAt:{local:validTime(input.storage?.local?.at,now)?new Date(input.storage.local.at).toISOString():null,private:validTime(input.storage?.private?.at,now)?new Date(input.storage.private.at).toISOString():null}};}
async function probeOne(store,key,value,{now,timeoutMs}){
 if(!store)return {state:'blocked',code:'unavailable',at:now()};
 let timer,started=false,code='verified',expired=false;
 const operation=(async()=>{
  try{if(await store.get(key)!=null)return {state:'unknown',code:'collision',at:now()};started=true;await store.put(key,value);if(expired)return;
   if(JSON.stringify(await store.get(key))!==JSON.stringify(value))code='failed';
  }catch{code='failed';}
  finally{if(started)try{await store.remove(key);if(await store.get(key)!=null)code='cleanup';}catch{code='cleanup';}}
  return {state:code==='verified'?'good':'blocked',code,at:now()};
 })();
 try{return await Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve({state:'unknown',code:'timeout',at:now()});},timeoutMs);})]);}finally{clearTimeout(timer);}
}
async function probe({local,privateStore,now=()=>Date.now(),timeoutMs=6000,randomId}={}){
 let token;try{token=randomId?randomId():Array.from(g.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');if(!/^[a-f0-9]{32}$/.test(token))throw Error();}catch{return {local:{state:'unknown',code:'unavailable',at:now()},private:{state:'unknown',code:'unavailable',at:now()}};}
 const adapter=local?{get:k=>{const raw=local.getItem(k);return raw===null?null:JSON.parse(raw);},put:(k,v)=>local.setItem(k,JSON.stringify(v)),remove:k=>local.removeItem(k)}:null,key='tt_operational_probe:'+token,value={test:token};
 const [a,b]=await Promise.all([probeOne(adapter,key,value,{now,timeoutMs}),probeOne(privateStore,'operational-probe:'+token,value,{now,timeoutMs})]);return {local:a,private:b};
}
g.TTOperationalChecks={build,report,probe};
})(typeof window!=='undefined'?window:globalThis);
