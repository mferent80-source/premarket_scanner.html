// Private opt-in monitor. Only broker GET routes; no order execution or outbound messaging.
export const MONITOR_KEY='__account_monitor_v1';
export const HEARTBEAT_KEY='__monitor_scheduler_v1';
const ORIGIN='https://mferent80-source.github.io',finite=Number.isFinite,INTERVAL=300000;
export async function monitorScope(credentials){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(credentials.environment+':'+credentials.key));return credentials.environment+':'+Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
export function monitorRules({scope,positions,summary,notes={},previous=null,now=Date.now()}={}){
 if(!summary||!finite(summary.totalValue)||summary.totalValue<0||!/^[A-Z]{3}$/.test(summary.currency||'')||!Array.isArray(positions)||positions.length>500||positions.some(p=>!p||typeof p.ticker!=='string'||!p.ticker||!finite(p.quantity)||p.quantity<0)||new Set(positions.map(p=>p.ticker)).size!==positions.length)throw Error('monitor_schema_invalid');
 const current=positions.filter(p=>p.quantity>0),alerts=[],coverage={positions:current.length,prices:0,stops:0,targets:0};
 const add=(key,type,ticker,text)=>alerts.push({key,type,ticker,text,at:now});
 for(const p of current){const n=notes[scope+'|'+p.ticker]||{},price=finite(p.currentPrice)&&p.currentPrice>0&&/^[A-Z]{3}$/.test(p.instrumentCurrency||'');if(price)coverage.prices++;else add('price:'+p.ticker,'data',p.ticker,'Preț sau monedă a instrumentului neverificată.');
  const stop=finite(n.stop)&&n.stop>0&&n.stopCurrency===p.instrumentCurrency,target=finite(n.targetPrice)&&n.targetPrice>0&&n.targetCurrency===p.instrumentCurrency;
  if(price&&stop){coverage.stops++;const pct=(p.currentPrice/n.stop-1)*100,near=finite(n.stopAlertPct)&&n.stopAlertPct>=.5&&n.stopAlertPct<=20?n.stopAlertPct:3;if(pct<=0)add('stop:'+p.ticker,'stop',p.ticker,'Prețul raportat de broker este la/sub stopul de reevaluare: '+p.currentPrice+' / '+n.stop+' '+p.instrumentCurrency+'.');else if(pct<=near)add('near-stop:'+p.ticker,'near-stop',p.ticker,'Preț la '+pct.toFixed(2)+'% peste stopul de reevaluare.');}
  else add('stop-missing:'+p.ticker,'coverage',p.ticker,'Stop sau monedă a stopului neverificată; poziția nu este acoperită de alerta la stop.');
  if(price&&target){coverage.targets++;if(p.currentPrice>=n.targetPrice)add('target:'+p.ticker,'target',p.ticker,'Prețul raportat este la/peste ținta de reevaluare.');}
  if(p.currency===summary.currency&&finite(p.value)&&summary.totalValue>0&&p.value/summary.totalValue>=.2)add('concentration:'+p.ticker,'risk',p.ticker,'Poziție ≥20% din valoarea contului.');
  if(typeof n.earnings==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n.earnings)){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),days=(Date.parse(n.earnings+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000;if(days>=0&&days<=7)add('earnings:'+p.ticker+':'+n.earnings,'event',p.ticker,'Earnings în '+days+' zile · '+n.earnings+' · reper manual, de reconfirmat.');}
 }
 if(previous?.scope===scope&&Array.isArray(previous.positions)){const old=new Map(previous.positions.map(p=>[p.ticker,p]));for(const p of current){const before=old.get(p.ticker);if(!before)add('position-added:'+p.ticker,'change',p.ticker,'Poziție nouă față de verificarea precedentă.');else if(before.quantity!==p.quantity)add('quantity:'+p.ticker+':'+p.quantity,'change',p.ticker,'Cantitate schimbată: '+before.quantity+' → '+p.quantity+'.');old.delete(p.ticker);}for(const p of old.values())add('position-removed:'+p.ticker,'change',p.ticker,'Poziția nu mai apare în lista completă raportată de broker.');}
 return {scope,checkedAt:now,summary:{currency:summary.currency,totalValue:summary.totalValue},positions:current.map(p=>({ticker:p.ticker,quantity:p.quantity,currentPrice:p.currentPrice,instrumentCurrency:p.instrumentCurrency})),coverage,alerts};
}
function empty(){return {version:1,enabled:false,scope:null,startedAt:null,lastAttempt:null,lastChecked:null,lastError:null,report:null,events:[],activeKeys:[]};}
async function read(db,subject,key,env,unseal){const row=await db.prepare('SELECT key,revision,packet,updated FROM cloud_records WHERE subject=? AND key=?').bind(subject,key).first();return row?{...row,value:await unseal(row.packet,env.CLOUD_ENCRYPTION_KEY,subject+'|'+key+'|'+row.revision)}:null;}
async function write(db,subject,key,value,revision,env,seal,now){const next=revision+1,packet=await seal(value,env.CLOUD_ENCRYPTION_KEY,subject+'|'+key+'|'+next),seconds=Math.floor(now/1000);const result=revision?await db.prepare('UPDATE cloud_records SET revision=?,packet=?,updated=? WHERE subject=? AND key=? AND revision=?').bind(next,packet,seconds,subject,key,revision).run():await db.prepare('INSERT OR IGNORE INTO cloud_records(subject,key,revision,packet,updated) VALUES(?,?,?,?,?)').bind(subject,key,next,packet,seconds).run();return result.meta.changes===1?next:null;}
export async function schedulerStatus(env){let at=null;if(env.CLOUD_DB)try{const r=await env.CLOUD_DB.prepare('SELECT updated FROM cloud_records WHERE subject=? AND key=?').bind('__monitor_service__',HEARTBEAT_KEY).first();if(r)at=r.updated*1000;}catch{}return {protocol:'tt-account-monitor-v1',intervalSeconds:300,notification:'inbox',schedulerAt:at,schedulerFresh:finite(at)&&at<=Date.now()+60000&&Date.now()-at<900000};}
function view(value){return {...value,stale:!finite(value.lastChecked)||Date.now()-value.lastChecked>600000,notification:'inbox'};}
async function runOne(subject,env,deps,upstream,now){
 const {seal,unseal,brokerHandle}=deps,db=env.CLOUD_DB,row=await read(db,subject,MONITOR_KEY,env,unseal);if(!row?.value.enabled)return row?.value||empty();let state=row.value;
 if(finite(state.lastAttempt)&&now-state.lastAttempt<INTERVAL)return state;
 const locked=await write(db,subject,MONITOR_KEY,{...state,lastAttempt:now},row.revision,env,seal,now);if(!locked)return (await read(db,subject,MONITOR_KEY,env,unseal))?.value||empty();state={...state,lastAttempt:now};
 try{
  const credentials=(await read(db,subject,'cloud_credentials',env,unseal))?.value;
  if(!credentials||credentials.environment!=='live'||typeof credentials.key!=='string'||typeof credentials.secret!=='string'||!/^[\x21-\x7e]+$/.test(credentials.key+credentials.secret)||credentials.key.includes(':'))throw Error('monitor_credentials_missing');
  if(await monitorScope(credentials)!==state.scope)throw Error('monitor_account_changed');
  const headers={Origin:ORIGIN,Authorization:'Basic '+btoa(credentials.key+':'+credentials.secret),'X-T212-Environment':'live'},responses=await Promise.all(['summary','positions'].map(kind=>brokerHandle(new Request('https://monitor/api/trading212/'+kind,{headers}),{...env,T212_AUTH_MODE:'session'},upstream))),payload=[];
  for(const response of responses){const b=await response.json();if(!response.ok)throw Error(['rate_limited','broker_credentials_invalid','broker_permission_missing','broker_timeout'].includes(b.error)?b.error:'monitor_broker_unavailable');if(b.source!=='Trading 212'||b.environment!=='live'||!finite(Date.parse(b.fetchedAt))||Math.abs(Date.parse(b.fetchedAt)-now)>300000)throw Error('monitor_schema_invalid');payload.push(b.data);}
  const notes=(await read(db,subject,'tt_holdings_theses_v1',env,unseal))?.value||{},report=monitorRules({scope:state.scope,summary:payload[0],positions:payload[1],notes,previous:state.report,now}),active=new Set(state.activeKeys||[]),newEvents=report.alerts.filter(a=>!active.has(a.key)).map(a=>({...a,id:now+':'+a.key}));
  state={...state,lastChecked:now,lastError:null,report,activeKeys:report.alerts.map(a=>a.key),events:[...newEvents,...(state.events||[])].slice(0,200)};
 }catch(e){const allowed=['monitor_credentials_missing','monitor_account_changed','monitor_schema_invalid','rate_limited','broker_credentials_invalid','broker_permission_missing','broker_timeout','monitor_broker_unavailable'],code=allowed.includes(e.message)?e.message:'monitor_broker_unavailable',key='error:'+code,event={id:now+':'+key,key,type:'error',ticker:null,text:code,at:now};state={...state,lastError:{code,at:now},activeKeys:[key],events:[...(state.activeKeys?.includes(key)?[]:[event]),...(state.events||[])].slice(0,200)};}
 await write(db,subject,MONITOR_KEY,state,locked,env,seal,now);return (await read(db,subject,MONITOR_KEY,env,unseal))?.value||empty();
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
 for(const row of rows){if(checked+failed>=10)break;if(env.GOOGLE_ALLOWED_SUB&&row.subject!==env.GOOGLE_ALLOWED_SUB)continue;try{const current=await read(db,row.subject,MONITOR_KEY,env,deps.unseal);if(!current?.value.enabled)continue;await runOne(row.subject,env,deps,upstream,now);checked++;}catch{failed++;}}
 const heartbeat=await read(db,'__monitor_service__',HEARTBEAT_KEY,env,deps.unseal);await write(db,'__monitor_service__',HEARTBEAT_KEY,{at:now,checked,failed},heartbeat?.revision||0,env,deps.seal,now);return {checked,failed};
}
