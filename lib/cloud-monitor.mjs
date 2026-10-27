import {deliverPush} from './cloud-push.mjs';
// Private opt-in monitor. Broker GET only; generic opt-in Web Push, no order execution.
export const MONITOR_KEY='__account_monitor_v1';
export const HEARTBEAT_KEY='__monitor_scheduler_v1';
const ORIGIN='https://mferent80-source.github.io',finite=Number.isFinite,INTERVAL=300000,BROKER_ERRORS=['rate_limited','broker_credentials_invalid','broker_permission_missing','broker_timeout'];
export async function monitorScope(credentials){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(credentials.environment+':'+credentials.key));return credentials.environment+':'+Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
/* 27.10.2026 (I-749): O SINGURĂ definiție a stopului și pe server. Copii EXACTE ale StopSetter.stopLa / stopValabil (lib/stop-setter.js: stopul contează
   doar dacă a fost pus / schimbat după deschiderea poziției de acum, −1 h toleranță) și ale T212Pending.ordineStop (lib/t212-pending.js: ordinele STOP
   de vânzare, cel mai mic stop pe ticker). Workerul e un singur fișier, fără paginile aplicației ⇒ copia; tools/cloud-monitor-stop.test.mjs le compară. */
export function stopLa(t){if(!t||!(Number(t.stop)>0))return null;let la=null,prec=null;for(const h of (Array.isArray(t.history)?t.history:[]).slice().sort((a,b)=>Date.parse(a?.at)-Date.parse(b?.at))){const st=Number(h?.stop),at=Date.parse(h?.at);if(st>0&&st!==prec&&finite(at))la=at;prec=st>0?st:null;}return la??(finite(Date.parse(t.updatedAt))?Date.parse(t.updatedAt):null);}
export function stopValabil(t,p){if(!t||!(Number(t.stop)>0))return false;const deschisa=Date.parse(p&&p.openedAt),la=stopLa(t);return !finite(deschisa)||(la!=null&&la>=deschisa-3600000);}
const STOP_TIP=/STOP/i;
export function ordineStop(items){const m=new Map();for(const o of items||[]){if(!o||!STOP_TIP.test(o.type||'')||o.side==='BUY'||!(o.stopPrice>0))continue;const v=m.get(o.ticker);if(!v||o.stopPrice<v.stopPrice)m.set(o.ticker,{stopPrice:o.stopPrice,quantity:finite(o.quantity)?Math.abs(o.quantity):null,type:o.type,id:o.id??null});}return m;}
// stopul documentat al poziției, în moneda instrumentului, după definiția comună
const stopDocumentat=(n,p)=>finite(n?.stop)&&n.stop>0&&n.stopCurrency===p.instrumentCurrency&&stopValabil(n,p)?n.stop:null;
export function monitorRules({scope,positions,summary,notes={},previous=null,now=Date.now()}={}){
 if(!summary||!finite(summary.totalValue)||summary.totalValue<0||!/^[A-Z]{3}$/.test(summary.currency||'')||!Array.isArray(positions)||positions.length>500||positions.some(p=>!p||typeof p.ticker!=='string'||!p.ticker||!finite(p.quantity)||p.quantity<0)||new Set(positions.map(p=>p.ticker)).size!==positions.length)throw Error('monitor_schema_invalid');
 const current=positions.filter(p=>p.quantity>0),alerts=[],coverage={positions:current.length,prices:0,stops:0,targets:0};
 const add=(key,type,ticker,text)=>alerts.push({key,type,ticker,text,at:now});
 for(const p of current){const n=notes[scope+'|'+p.ticker]||{},price=finite(p.currentPrice)&&p.currentPrice>0&&/^[A-Z]{3}$/.test(p.instrumentCurrency||'');if(price)coverage.prices++;else add('price:'+p.ticker,'data',p.ticker,'Preț sau monedă a instrumentului neverificată.');
  const stop=stopDocumentat(n,p)!=null,target=finite(n.targetPrice)&&n.targetPrice>0&&n.targetCurrency===p.instrumentCurrency;
  if(price&&stop){coverage.stops++;const pct=(p.currentPrice/n.stop-1)*100,near=finite(n.stopAlertPct)&&n.stopAlertPct>=.5&&n.stopAlertPct<=20?n.stopAlertPct:3;if(pct<=0)add('stop:'+p.ticker,'stop',p.ticker,'Prețul raportat de broker este la/sub stopul de reevaluare: '+p.currentPrice+' / '+n.stop+' '+p.instrumentCurrency+'.');else if(pct<=near)add('near-stop:'+p.ticker,'near-stop',p.ticker,'Preț la '+pct.toFixed(2)+'% peste stopul de reevaluare.');}
  else add('stop-missing:'+p.ticker,'coverage',p.ticker,'Stop sau monedă a stopului neverificată; poziția nu este acoperită de alerta la stop.');
  if(price&&target){coverage.targets++;if(p.currentPrice>=n.targetPrice)add('target:'+p.ticker,'target',p.ticker,'Prețul raportat este la/peste ținta de reevaluare.');}
  if(p.currency===summary.currency&&finite(p.value)&&summary.totalValue>0&&p.value/summary.totalValue>=.2)add('concentration:'+p.ticker,'risk',p.ticker,'Poziție ≥20% din valoarea contului.');
  if(typeof n.earnings==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n.earnings)){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),days=(Date.parse(n.earnings+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000;if(days>=0&&days<=7)add('earnings:'+p.ticker+':'+n.earnings,'event',p.ticker,'Earnings în '+days+' zile · '+n.earnings+' · reper manual, de reconfirmat.');}
 }
 if(previous?.scope===scope&&Array.isArray(previous.positions)){const old=new Map(previous.positions.map(p=>[p.ticker,p]));for(const p of current){const before=old.get(p.ticker);if(!before)add('position-added:'+p.ticker,'change',p.ticker,'Poziție nouă față de verificarea precedentă.');else if(before.quantity!==p.quantity)add('quantity:'+p.ticker+':'+p.quantity,'change',p.ticker,'Cantitate schimbată: '+before.quantity+' → '+p.quantity+'.');old.delete(p.ticker);}for(const p of old.values())add('position-removed:'+p.ticker,'change',p.ticker,'Poziția nu mai apare în lista completă raportată de broker.');}
 return {scope,checkedAt:now,summary:{currency:summary.currency,totalValue:summary.totalValue},positions:current.map(p=>({ticker:p.ticker,quantity:p.quantity,currentPrice:p.currentPrice,instrumentCurrency:p.instrumentCurrency})),coverage,alerts};
}
// 20.10.2026 (I-734): fișa de risc a zilei — la prima rulare după închiderea SUA (16:05 New York, luni–vineri), o dată pe zi NY, din cifrele pe care
// monitorul le are deja: căldura (riscul până la stopurile documentate / cont), cea mai mare poziție, pozițiile fără stop, scăderea de la vârful
// observațiilor zilnice (dacă istoricul contului e sincronizat), raportările din 7 zile. Nimic nou de decis; inbox + Discord dacă e webhook.
const F_ZI=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}),F_ORA=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
/* 27.10.2026 (auditul A [6]): zilele fără bursă la New York nu primesc fișă, iar în zilele scurte fișa vine după închiderea de la 13:00. Copie a
   ExchangeCalendar.markets.US (lib/exchange-calendar.js, zile publicate de NYSE); testul le compară. Un an necunoscut cade pe regula luni–vineri. */
const zileUS=(an,s)=>s.split(' ').map(d=>an+'-'+d);
export const US_INCHIS=Object.freeze([...zileUS(2026,'01-01 01-19 02-16 04-03 05-25 06-19 07-03 09-07 11-26 12-25'),...zileUS(2027,'01-01 01-18 02-15 03-26 05-31 06-18 07-05 09-06 11-25 12-24')]);
export const US_SCURT=Object.freeze({'2026-11-27':780,'2026-12-24':780,'2027-11-26':780});
export function dupaInchidere(now=Date.now()){try{const p=Object.fromEntries(F_ORA.formatToParts(new Date(now)).map(q=>[q.type,q.value])),zi=F_ZI.format(new Date(now));if(['Sat','Sun'].includes(p.weekday)||US_INCHIS.includes(zi))return false;const inchidere=finite(US_SCURT[zi])?US_SCURT[zi]:960;return Number(p.hour)*60+Number(p.minute)>=inchidere+5;}catch{return false;}}
/* 27.10.2026 (I-749): `ordine` = ordinele în așteptare citite de la broker prin releu (null ⇒ necitite, cu `ordineEroare`). Cu ele: pozițiile fără ORDIN
   de stop întreg la broker (stop doar pe hârtie / ordin doar pentru o parte), iar căldura se socotește până la stopul care execută (ordinul întreg,
   altfel stopul documentat). Fără ele, stopurile din fișă sunt spuse „documentate, neverificate la broker”. */
/* 27.10.2026 (lotul 2, contractul C ↔ A): rândul incidentelor din fișă = JournalIncidente.randFisa din lib/journal-incidente.js (copie, ca stopul;
   echivalența caz cu caz e în tools/lot2-legaturi.test.mjs). Ziua New York; un incident e „deschis” cât n-are stare „inchis”. */
/* revizia lotului 2 (I-764): eticheta pe orice text trimis automat; (I-759) reconcilierea cu brokerul în fișă, din cheia sincronizată tt_reconciliere_v1 */
export const ETICHETA_AUTOMAT='generat automat · neverificat de om';
export function reconciliereRand(r){if(!r||typeof r!=='object'||typeof r.ok!=='boolean'||!finite(Date.parse(r.la)))return null;const d=Array.isArray(r.diferente)?r.diferente:[],t=F_ZI.format(new Date(Date.parse(r.la))),cand=' ('+t.slice(8,10)+'.'+t.slice(5,7)+')';return r.ok&&!d.length?'Reconcilierea cu brokerul: fără diferențe'+cand+'.':'Reconcilierea cu brokerul: '+d.length+(d.length===1?' diferență':' diferențe')+cand+(d.length?' — '+d.slice(0,3).map(x=>x.text).join('; ')+(d.length>3?'; …':''):'')+'.';}
export function incidenteRand(lista,zi){
 const l=Array.isArray(lista)?lista:[],zz=t=>{const d=F_ZI.format(new Date(t));return d.slice(8,10)+'.'+d.slice(5,7);};
 const noi=l.filter(x=>x&&F_ZI.format(new Date(Date.parse(x.la)))===zi),desc=l.filter(x=>x&&x.stare!=='inchis').slice().sort((a,b)=>Date.parse(a.la)-Date.parse(b.la));
 const p1=noi.length?noi.length+(noi.length===1?' nou azi (':' noi azi (')+noi.map(x=>x.titlu).join('; ')+')':'niciunul nou azi';
 const p2=desc.length?desc.length+(desc.length===1?' deschis':' deschise')+', cel mai vechi din '+zz(Date.parse(desc[0].la)):'niciunul deschis';
 return 'Incidente: '+p1+(noi.length?' · ':', ')+p2+'.';
}
export function fisaZilei({scope,summary,positions=[],notes={},istoric=null,ordine=null,ordineEroare=null,incidente=null,reconciliere=null,now=Date.now()}={}){
 const c=summary?.currency,total=finite(summary?.totalValue)&&summary.totalValue>0?summary.totalValue:null,n1=v=>finite(v)?(Math.round(v*10)/10).toLocaleString('ro-RO',{minimumFractionDigits:1,maximumFractionDigits:1}):'—',sym=t=>String(t).replace(/_[A-Z]{2}_EQ$/,'');
 const citite=Array.isArray(ordine),stopuri=citite?ordineStop(ordine):new Map(),faraOrdin=citite?[]:null,peHartie=citite?[]:null,partial=citite?[]:null;
 const cur=(Array.isArray(positions)?positions:[]).filter(p=>p&&typeof p.ticker==='string'&&finite(p.quantity)&&p.quantity>0),faraStop=[],conc=[];let risc=0,riscOk=true;
 for(const p of cur){const n=notes[scope+'|'+p.ticker]||{},rate=p.currency===c&&finite(p.value)&&p.value>0&&finite(p.currentPrice)&&p.currentPrice>0?p.value/(p.quantity*p.currentPrice):null,doc=stopDocumentat(n,p),o=stopuri.get(p.ticker)||null,intreg=!!o&&!(finite(o.quantity)&&o.quantity<p.quantity*0.999),stop=intreg?o.stopPrice:doc;
  if(citite&&!intreg){faraOrdin.push(p.ticker);if(o)partial.push(p.ticker);else if(doc)peHartie.push(p.ticker);}
  if(!stop)faraStop.push(p.ticker);else if(rate==null)riscOk=false;else if(p.currentPrice>stop)risc+=(p.currentPrice-stop)*p.quantity*rate;
  if(total&&p.currency===c&&finite(p.value))conc.push({t:p.ticker,pct:p.value/total*100});}
 conc.sort((a,b)=>b.pct-a.pct);
 const varf=(Array.isArray(istoric)?istoric:[]).filter(x=>x&&finite(x.total)&&x.currency===c&&finite(Date.parse(x.at))&&Date.parse(x.at)<=now).reduce((m,x)=>Math.max(m,x.total),-Infinity),dd=total&&varf>0?Math.max(0,(1-total/varf)*100):null;
 const zi=F_ZI.format(new Date(now)),rap=[];
 for(const p of cur){const e=(notes[scope+'|'+p.ticker]||{}).earnings;if(typeof e==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e)){const d=(Date.parse(e+'T12:00:00Z')-Date.parse(zi+'T12:00:00Z'))/86400000;if(d>=0&&d<=7)rap.push(sym(p.ticker)+' ('+e.slice(8,10)+'.'+e.slice(5,7)+')');}}
 const rInc=Array.isArray(incidente)?incidenteRand(incidente,zi):null,rRec=reconciliereRand(reconciliere);
 const caldura=faraStop.length||!riscOk?null:risc,caldPct=caldura!=null&&total?caldura/total*100:null;
 const text='Fișa zilei '+zi.slice(8,10)+'.'+zi.slice(5,7)+' · cont '+(total?n1(total)+' '+c:'—')+' · '+cur.length+(cur.length===1?' poziție':' poziții')+' · căldura până la stopuri '+(caldura==null?'NECUNOSCUTĂ ('+(faraStop.length?faraStop.length+' fără stop':'curs neverificat')+')':n1(caldura)+' '+c+(caldPct!=null?' = '+n1(caldPct)+' % din cont':''))+' · cea mai mare poziție '+(conc[0]?sym(conc[0].t)+' '+n1(conc[0].pct)+' %':'—')+(citite?' · fără niciun stop (nici ordin întreg, nici documentat): ':' · fără stop documentat: ')+(faraStop.length?faraStop.map(sym).join(', '):'niciuna')+ordineText(cur.length,citite,faraOrdin,peHartie,partial,ordineEroare,sym)+' · scăderea de la vârful observațiilor '+(dd!=null?n1(dd)+' % (fără ajustare la depuneri / retrageri)':'— (istoricul contului nesincronizat)')+' · raportări în 7 zile: '+(rap.length?rap.join(', '):'niciuna')+'.'+(rRec?' '+rRec:'')+(rInc?' '+rInc:'')+' — '+ETICHETA_AUTOMAT;
 return {zi,text,total,currency:c||null,pozitii:cur.length,caldura,caldPct,faraStop,concentrare:conc[0]||null,dd,raportari:rap,ordineCitite:citite,ordineEroare:citite?null:ordineEroare||null,faraOrdin,peHartie,partial,incidente:rInc,reconciliere:rRec};
}
function ordineText(n,citite,faraOrdin,peHartie,partial,eroare,sym){
 if(!citite)return ' · ordinele brokerului NECITITE ('+(eroare||'necerute')+') — stopurile de mai sus sunt documentate, neverificate la broker';
 if(!n)return '';
 if(!faraOrdin.length)return ' · toate pozițiile au ORDIN de stop la broker';
 return ' · '+faraOrdin.length+(faraOrdin.length===1?' poziție':' poziții')+' fără ORDIN de stop la broker: '+faraOrdin.map(sym).join(', ')+(peHartie.length?' — stop doar pe hârtie: '+peHartie.map(sym).join(', '):'')+(partial.length?' — ordin doar pentru o parte: '+partial.map(sym).join(', '):'');
}
function empty(){return {version:1,enabled:false,scope:null,startedAt:null,lastAttempt:null,lastChecked:null,lastError:null,report:null,events:[],activeKeys:[],fisaZi:null};}
async function read(db,subject,key,env,unseal){const row=await db.prepare('SELECT key,revision,packet,updated FROM cloud_records WHERE subject=? AND key=?').bind(subject,key).first();return row?{...row,value:await unseal(row.packet,env.CLOUD_ENCRYPTION_KEY,subject+'|'+key+'|'+row.revision)}:null;}
async function write(db,subject,key,value,revision,env,seal,now){const next=revision+1,packet=await seal(value,env.CLOUD_ENCRYPTION_KEY,subject+'|'+key+'|'+next),seconds=Math.floor(now/1000);const result=revision?await db.prepare('UPDATE cloud_records SET revision=?,packet=?,updated=? WHERE subject=? AND key=? AND revision=?').bind(next,packet,seconds,subject,key,revision).run():await db.prepare('INSERT OR IGNORE INTO cloud_records(subject,key,revision,packet,updated) VALUES(?,?,?,?,?)').bind(subject,key,next,packet,seconds).run();return result.meta.changes===1?next:null;}
export async function schedulerStatus(env){let at=null;if(env.CLOUD_DB)try{const r=await env.CLOUD_DB.prepare('SELECT updated FROM cloud_records WHERE subject=? AND key=?').bind('__monitor_service__',HEARTBEAT_KEY).first();if(r)at=r.updated*1000;}catch{}return {protocol:'tt-account-monitor-v1',intervalSeconds:300,notification:'inbox',schedulerAt:at,schedulerFresh:finite(at)&&at<=Date.now()+60000&&Date.now()-at<900000};}
function view(value){return {...value,stale:!finite(value.lastChecked)||Date.now()-value.lastChecked>600000,notification:'inbox'};}
async function runOne(subject,env,deps,upstream,now){
 const {seal,unseal,brokerHandle}=deps,db=env.CLOUD_DB,row=await read(db,subject,MONITOR_KEY,env,unseal);if(!row?.value.enabled)return row?.value||empty();let state=row.value;
 if(finite(state.lastAttempt)&&now-state.lastAttempt<INTERVAL)return state;
 const locked=await write(db,subject,MONITOR_KEY,{...state,lastAttempt:now},row.revision,env,seal,now);if(!locked)return (await read(db,subject,MONITOR_KEY,env,unseal))?.value||empty();state={...state,lastAttempt:now};
 let fisa=null;
 try{
  const credentials=(await read(db,subject,'cloud_credentials',env,unseal))?.value;
  if(!credentials||credentials.environment!=='live'||typeof credentials.key!=='string'||typeof credentials.secret!=='string'||!/^[\x21-\x7e]+$/.test(credentials.key+credentials.secret)||credentials.key.includes(':'))throw Error('monitor_credentials_missing');
  if(await monitorScope(credentials)!==state.scope)throw Error('monitor_account_changed');
  const headers={Origin:ORIGIN,Authorization:'Basic '+btoa(credentials.key+':'+credentials.secret),'X-T212-Environment':'live'},responses=await Promise.all(['summary','positions'].map(kind=>brokerHandle(new Request('https://monitor/api/trading212/'+kind,{headers}),{...env,T212_AUTH_MODE:'session'},upstream))),payload=[];
  for(const response of responses){const b=await response.json();if(!response.ok)throw Error(['rate_limited','broker_credentials_invalid','broker_permission_missing','broker_timeout'].includes(b.error)?b.error:'monitor_broker_unavailable');if(b.source!=='Trading 212'||b.environment!=='live'||!finite(Date.parse(b.fetchedAt))||Math.abs(Date.parse(b.fetchedAt)-now)>300000)throw Error('monitor_schema_invalid');payload.push(b.data);}
  const notes=(await read(db,subject,'tt_holdings_theses_v1',env,unseal))?.value||{},report=monitorRules({scope:state.scope,summary:payload[0],positions:payload[1],notes,previous:state.report,now}),active=new Set(state.activeKeys||[]),newEvents=report.alerts.filter(a=>!active.has(a.key)).map(a=>({...a,id:now+':'+a.key}));
  // I-734: fișa zilei — o dată pe zi NY, la prima rulare după închidere
  const ziNY=F_ZI.format(new Date(now));
  if(dupaInchidere(now)&&state.fisaZi!==ziNY){let istoric=null;try{const h=(await read(db,subject,'tt_trading212_account_history_v1',env,unseal))?.value;istoric=h&&Array.isArray(h[state.scope])?h[state.scope]:null;}catch{istoric=null;}
   // I-749: ordinele în așteptare, DOAR citire prin releu, o dată pe zi (la fișă); o citire picată nu oprește fișa — motivul intră în text
   let ordine=null,ordineEroare=null;try{const r=await brokerHandle(new Request('https://monitor/api/trading212/orders-pending',{headers}),{...env,T212_AUTH_MODE:'session'},upstream),b=await r.json();if(!r.ok)throw Error(BROKER_ERRORS.includes(b?.error)?b.error:'monitor_broker_unavailable');if(b.source!=='Trading 212'||b.environment!=='live'||!Array.isArray(b.data))throw Error('monitor_schema_invalid');ordine=b.data;}catch(e){ordineEroare=[...BROKER_ERRORS,'monitor_schema_invalid'].includes(e?.message)?e.message:'monitor_broker_unavailable';}
   let incidente=null;try{const v=(await read(db,subject,'tt_journal_incidente_v1',env,unseal))?.value;incidente=Array.isArray(v)?v:null;}catch{incidente=null;}let reconciliere=null;try{reconciliere=(await read(db,subject,'tt_reconciliere_v1',env,unseal))?.value||null;}catch{reconciliere=null;}
   fisa=fisaZilei({scope:state.scope,summary:payload[0],positions:payload[1],notes,istoric,ordine,ordineEroare,incidente,reconciliere,now});}
  const fisaEvents=fisa?[{id:now+':fisa:'+ziNY,key:'fisa:'+ziNY,type:'fisa',ticker:'Fișa zilei',text:fisa.text,at:now}]:[];
  state={...state,lastChecked:now,lastError:null,report,activeKeys:report.alerts.map(a=>a.key),events:[...newEvents,...fisaEvents,...(state.events||[])].slice(0,200),...(fisa?{fisaZi:ziNY}:{})};
 }catch(e){const allowed=['monitor_credentials_missing','monitor_account_changed','monitor_schema_invalid','rate_limited','broker_credentials_invalid','broker_permission_missing','broker_timeout','monitor_broker_unavailable'],code=allowed.includes(e.message)?e.message:'monitor_broker_unavailable',key='error:'+code,event={id:now+':'+key,key,type:'error',ticker:null,text:code,at:now};state={...state,lastError:{code,at:now},activeKeys:[key],events:[...(state.activeKeys?.includes(key)?[]:[event]),...(state.events||[])].slice(0,200)};}
 const saved=await write(db,subject,MONITOR_KEY,state,locked,env,seal,now);if(saved&&state.events[0]&&now-state.events[0].at<=600000)try{await deliverPush(subject,state.events[0],env,deps,upstream,now);}catch{}
 // I-734 (revizia 20.10): fișa pleacă pe Discord DUPĂ ce ziua e salvată — altfel, la un conflict de salvare, s-ar retrimite la 5 minute
 if(saved&&fisa&&typeof env.DISCORD_WEBHOOK==='string'&&/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(env.DISCORD_WEBHOOK))try{await upstream(env.DISCORD_WEBHOOK,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'🧾 '+fisa.text})});}catch{}
 return (await read(db,subject,MONITOR_KEY,env,unseal))?.value||empty();
}
export async function handleMonitor({request,subject,env,deps,upstream=fetch,parseBody}){
 const url=new URL(request.url),db=env.CLOUD_DB,now=Date.now(),reply=(body,status=200)=>({body,status});
 if(url.pathname==='/api/cloud/monitor'&&request.method==='GET')return reply({monitor:view((await read(db,subject,MONITOR_KEY,env,deps.unseal))?.value||empty()),scheduler:await schedulerStatus(env)});
 if(url.pathname==='/api/cloud/monitor'&&request.method==='PUT'){
  const b=await parseBody(request,1000);if(!b||typeof b.enabled!=='boolean'||Object.keys(b).some(k=>k!=='enabled'))return reply({error:'invalid_monitor'},400);
  const old=await read(db,subject,MONITOR_KEY,env,deps.unseal);let state=old?.value||empty();if(b.enabled){const credentials=(await read(db,subject,'cloud_credentials',env,deps.unseal))?.value;if(!credentials||credentials.environment!=='live')return reply({error:'monitor_credentials_missing'},400);const scope=await monitorScope(credentials);state=state.scope===scope?{...state,enabled:true}:{...empty(),scope,enabled:true,startedAt:now};}else state={...state,enabled:false};
  const revision=await write(db,subject,MONITOR_KEY,state,old?.revision||0,env,deps.seal,now);return revision?reply({monitor:view(state),scheduler:await schedulerStatus(env)}):reply({error:'revision_conflict'},409);
 }
 if(url.pathname==='/api/cloud/monitor/check'&&request.method==='POST'){await parseBody(request,1000);return reply({monitor:view(await runOne(subject,env,deps,upstream,now)),scheduler:await schedulerStatus(env)});}
 return reply({error:'not_found'},404);
}
export async function runMonitors(env,deps,upstream=fetch,now=Date.now()){
 if(!env.CLOUD_DB||!env.CLOUD_ENCRYPTION_KEY)return {configured:false};const db=env.CLOUD_DB,rows=(await db.prepare('SELECT subject FROM cloud_records WHERE key=? ORDER BY updated ASC').bind(MONITOR_KEY).all()).results;let checked=0,failed=0;
 // Keep each invocation below the subrequest budget. Updated timestamps rotate active accounts fairly.
 for(const row of rows){if(checked+failed>=5)break;if(env.GOOGLE_ALLOWED_SUB&&row.subject!==env.GOOGLE_ALLOWED_SUB)continue;try{const current=await read(db,row.subject,MONITOR_KEY,env,deps.unseal);if(!current?.value.enabled)continue;await runOne(row.subject,env,deps,upstream,now);checked++;}catch{failed++;}}
 const heartbeat=await read(db,'__monitor_service__',HEARTBEAT_KEY,env,deps.unseal);await write(db,'__monitor_service__',HEARTBEAT_KEY,{at:now,checked,failed},heartbeat?.revision||0,env,deps.seal,now);return {checked,failed};
}
