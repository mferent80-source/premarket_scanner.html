const previewMode=typeof location!=='undefined'&&new URLSearchParams(location.search).get('demo')==='1';
let portfolioReport=null,portfolioSummary=null,portfolioPositions=null,portfolioAt=null,summaryAt=null,previewFixture=null;
let journalScope='',journalCursor=null,journalStarted=false,journalDone=false,journalRunning=false,journalNext=0;
const $=id=>document.getElementById(id),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v,c)=>numeric(v)?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:6}).format(v)+(c?' '+c:''):'—';
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('ro-RO'):'—';};
let configuredBase='',ready=false,base='',token='',brokerEnvironment='live',session=0,busy=false,kind='orders',cursor=null,rows=[],seen=new Set(),controller=new AbortController(),times={},lastFetched=0,environment='';
const errors={broker_redirected:'API-ul Trading 212 redirecționează cererea; conexiunea a fost oprită pentru protejarea cheilor.',broker_timeout:'Trading 212 nu a răspuns în 20 de secunde.',broker_network_error:'Worker-ul nu poate deschide conexiunea către Trading 212.',broker_non_json_response:'Trading 212 a răspuns cu o pagină sau un format incompatibil, nu cu date API.',broker_schema_mismatch:'Datele Trading 212 au un format diferit de cel așteptat.',backend_not_configured:'Backendul nu are încă secretele configurate.',environment_not_configured:'Mediul Invest nu este configurat.',session_unauthorized:'Codul de acces la integrare este incorect.',broker_credentials_invalid:'Cheia Trading 212 nu este validă pentru mediul configurat.',broker_permission_missing:'Cheia Trading 212 nu are permisiunea de citire necesară.',broker_unavailable:'Trading 212 nu răspunde momentan.',broker_response_unavailable:'Răspunsul Trading 212 nu a putut fi verificat.',origin_forbidden:'Această origine nu este autorizată de backend.'};
function validEndpoint(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname.endsWith('.workers.dev'))throw Error('Introdu adresa HTTPS a Workerului privat (workers.dev), fără cale sau parametri.');return u.origin;}
function reset(){clearPortfolio();$('connectionSettings').open=true;journalScope='';journalCursor=null;journalStarted=false;journalDone=false;journalRunning=false;journalNext=0;session++;controller.abort();controller=new AbortController();token='';base='';rows=[];seen.clear();cursor=null;times={};lastFetched=0;busy=false;$('apiKey').value='';$('apiSecret').value='';$('account').hidden=true;$('metrics').replaceChildren();$('positions').replaceChildren();$('history').replaceChildren();$('more').hidden=true;$('refresh').hidden=true;$('disconnect').hidden=true;$('connectButton').disabled=!ready;$('status').textContent='Neconectat · datele contului au fost eliminate din ecran.';}
async function api(name,next){
 const wait=(times[name]||0)-Date.now();if(wait>0)throw Error(`Așteaptă ${Math.ceil(wait/1000)} secunde înainte de următoarea citire.`);
 times[name]=Date.now()+(name==='summary'?6000:['orders','dividends','transactions'].includes(name)?11000:1500);
 const u=new URL(base+'/api/trading212/'+name);if(next)u.searchParams.set('cursor',next);
 const expectedEnvironment=brokerEnvironment,parent=controller.signal,requestController=new AbortController(),abort=()=>requestController.abort();let timedOut=false;
 if(parent.aborted)abort();else parent.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>{timedOut=true;abort();},25000);
 try{
  const r=await fetch(u,{headers:{Authorization:'Basic '+token,'X-T212-Environment':expectedEnvironment},cache:'no-store',credentials:'omit',redirect:'error',signal:requestController.signal});
  const b=await r.json();if(!r.ok){if(r.status===429){const seconds=Math.max(10,Math.min(300,Number(b.retryAfter)||60));times[name]=Date.now()+seconds*1000;throw Error(`Limita Trading 212: reîncearcă peste ${seconds} secunde.`);}const code=Object.hasOwn(errors,b.error)?b.error:'connection_failed';throw Error((errors[b.error]||'Conectarea nu a putut fi verificată.')+` [HTTP ${r.status} · ${code}]`);}
  const at=Date.parse(b?.fetchedAt),d=b?.data,object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(b?.source!=='Trading 212'||b.environment!==expectedEnvironment||!Number.isFinite(at)||at>Date.now()+60000||Date.now()-at>300000)throw Error('Răspuns broker expirat, din viitor sau pentru alt mediu.');
  const numbers=(v,fields)=>fields.every(k=>v[k]===null||v[k]===undefined||numeric(v[k]));
  const valid=name==='summary'?object(d)&&typeof d.currency==='string'&&/^[A-Z]{3}$/.test(d.currency)&&[d.totalValue,d.available,d.invested].some(numeric)&&numbers(d,['totalValue','available','reserved','invested','cost','realized','unrealized']):name==='positions'?Array.isArray(d)&&d.every(p=>object(p)&&typeof p.ticker==='string'&&p.ticker&&numeric(p.quantity)&&p.quantity>=0&&numbers(p,['averagePrice','currentPrice','value','unrealized'])):object(d)&&Array.isArray(d.items)&&d.items.every(object)&&(d.nextCursor===null||typeof d.nextCursor==='string'&&/^[-\w:.]{1,256}$/.test(d.nextCursor));
  if(!valid)throw Error('Datele brokerului au un format incompatibil.');return b;
 }catch(e){if(timedOut)throw Error('Releul brokerului nu a răspuns în 25 de secunde. Reîncearcă sincronizarea.');throw e;}
 finally{clearTimeout(timeout);parent.removeEventListener('abort',abort);}
}
function metrics(s){const c=s.currency;$('metrics').innerHTML=[['Valoare raportată de cont',s.totalValue],['Disponibil pentru investiții',s.available],['Investiții',s.invested],['P&L nerealizat',s.unrealized],['P&L realizat · total cont',s.realized],['Cost poziții curente',s.cost],['Rezervat pentru ordine',s.reserved]].map(([label,v])=>`<div class="metric"><small>${esc(label)}</small><b class="${numeric(v)&&label.startsWith('P&L')?(v<0?'negative':v>0?'positive':''):''}">${esc(fmt(v,c))}</b></div>`).join('');}
const pair=(name,value)=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`;
function clearPortfolio(){
 portfolioReport=null;portfolioSummary=null;portfolioPositions=null;portfolioAt=null;summaryAt=null;
 ['portfolioSummary','positions','realizedSummary'].forEach(id=>$(id).replaceChildren());
 $('positionSearch').value='';$('positionFilter').value='all';$('positionSort').value='loss';$('portfolioCurrency').value='';$('realizedPeriod').value='all';$('positionCoverage').textContent='';
}
function portfolioOptions(){return {currency:$('portfolioCurrency').value,filter:$('positionFilter').value||'all',search:$('positionSearch').value,sort:$('positionSort').value||'loss'};}
function renderPositions(){
 if(!portfolioReport)return;
 const options=portfolioOptions(),result=window.T212Portfolio.positionsMarkup(portfolioReport,options);
 $('positions').innerHTML=result.html;
 $('portfolioSummary').innerHTML=window.T212Portfolio.summaryMarkup(portfolioReport,options.currency);
 const available=portfolioReport.rows.filter(p=>options.currency==='unknown'?!p.currency:p.currency===options.currency).length;
 const values=result.rows.filter(p=>p.pnl!==null).map(p=>p.pnl),subtotal=values.reduce((s,n)=>s+n,0);
 $('positionCoverage').textContent=`${result.rows.length}/${available} poziții afișate · P&L raportat în listă: ${values.length&&Number.isFinite(subtotal)?window.T212Portfolio.fmt(subtotal,options.currency==='unknown'?'':options.currency,true):'—'}${previewMode?' · DEMO FICTIV':''}`;
 updatePortfolioTime();
}
function updatePortfolioTime(){
 if(!portfolioReport)return;
 const at=Date.parse(portfolioAt),stale=!Number.isFinite(at)||Date.now()-at>300000;
 $('portfolioState').textContent=(previewMode?'DEMO FICTIV · ':brokerEnvironment==='demo'?'DEMO T212 · ':'INVEST LIVE · ')+(portfolioReport.available?(stale?'DATE VECHI · ':'Poziții citite · ')+stamp(portfolioAt):'Poziții indisponibile · sincronizează din nou.')+(!portfolioSummary?' · Sumar lipsă: ponderile nu pot fi calculate.':'')+(summaryAt&&Date.now()-Date.parse(summaryAt)>300000?' · Sumar vechi: ponderile folosesc acea citire.':'');
}
function positions(xs){
 portfolioPositions=xs;portfolioReport=window.T212Portfolio.build(xs,portfolioSummary);
 const select=$('portfolioCurrency'),previous=select.value,choices=[...portfolioReport.currencies,...(portfolioReport.wallet&&!portfolioReport.currencies.includes(portfolioReport.wallet)?[portfolioReport.wallet]:[]),...(portfolioReport.unknownCurrency?['unknown']:[])];
 select.innerHTML=choices.map(c=>'<option value="'+esc(c)+'">'+esc(c==='unknown'?'Monedă lipsă':c)+'</option>').join('');
 select.value=choices.includes(previous)?previous:portfolioReport.wallet||choices[0]||'';
 renderPositions();
}
function renderRealized(){
 const host=$('realizedSummary'),currency=$('portfolioCurrency').value;
 if(!portfolioReport||!journalScope||!window.T212Performance)return;
 if(!/^[A-Z]{3}$/.test(currency)){host.textContent='Alege o monedă raportată de broker pentru rezultatele vânzărilor.';return;}
 try{
  const account=previewMode?previewFixture.account:window.T212J?.read?.().accounts?.[journalScope];
  const snapshot={environment:previewMode?'live':brokerEnvironment,summary:portfolioSummary,positions:portfolioPositions};
  const report=window.T212Performance.build({scope:journalScope,account,snapshot,environment:previewMode?'live':brokerEnvironment,selectedCurrency:currency,days:Number($('realizedPeriod').value)||null});
  if(report.currency&&report.currency!==currency){host.textContent='Nicio vânzare cu P&L eligibil în '+currency+'.';return;}
  host.innerHTML=window.T212Portfolio.realizedMarkup(report);
 }catch(_){host.textContent='Istoricul contului selectat nu poate fi citit. Reia sincronizarea.';}
}
['positionFilter','positionSort'].forEach(id=>$(id).addEventListener('change',renderPositions));
$('positionSearch').addEventListener('input',renderPositions);
$('portfolioCurrency').addEventListener('change',()=>{renderPositions();renderRealized();});
$('realizedPeriod').addEventListener('change',renderRealized);
$('portfolioSummary').addEventListener('click',e=>{
 const button=e.target.closest('[data-position]');if(!button)return;
 $('positionFilter').value='all';$('positionSearch').value=button.dataset.position;renderPositions();$('positions').scrollIntoView({behavior:'smooth',block:'start'});
});
$('clearPositionFilters').addEventListener('click',()=>{$('positionSearch').value='';$('positionFilter').value='all';$('positionSort').value='loss';renderPositions();});
window.addEventListener('storage',e=>{if(e.key===window.T212Performance?.KEY)renderRealized();});

function history(){const orders=kind==='orders';$('history').innerHTML=rows.map(r=>`<article class="card"><h3>${esc(r.ticker||r.type)}</h3><p>${esc(stamp(r.date))}</p><p>${esc(orders?(r.side||'Sens indisponibil')+' · '+(r.status||'Stare indisponibilă'):r.type)}</p><dl>${orders?pair('Cantitate executată',fmt(r.quantity))+pair('Preț execuție',fmt(r.price,r.priceCurrency)):''}${pair(orders?'Valoare netă':'Sumă',fmt(r.amount,r.currency))}${orders?pair('P&L realizat raportat',fmt(r.realized,r.currency)):''}</dl></article>`).join('');}
async function loadHistory(append=false){if(!token||busy)return;const id=session,selected=kind;busy=true;$('more').disabled=true;document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=true);$('historyState').textContent='Încarc istoricul…';
 try{const b=await api(selected,append?cursor:null);if(id!==session||selected!==kind)return;if(!Array.isArray(b.data?.items))throw Error('Istoric incompatibil.');if(!append){rows=[];seen.clear();}
 for(const item of b.data.items){const key=item.id?selected+':'+item.id:JSON.stringify(item);if(!seen.has(key)){seen.add(key);rows.push(item);}}
 if(selected==='orders'&&window.T212J&&journalScope)acceptJournalPage(b,!append);
 if(selected!=='orders'&&window.T212J&&journalScope)window.T212J.mergeCash(journalScope,brokerEnvironment,selected,b.data.items,b.data.nextCursor,b.fetchedAt);cursor=b.data.nextCursor;history();$('more').hidden=!cursor;$('historyState').textContent=`${rows.length} înregistrări · ${cursor?'istoric parțial, mai există pagini':'toate paginile disponibile au fost încărcate'} · ${stamp(b.fetchedAt)}`;
 }catch(e){if(id===session&&e.name!=='AbortError'){$('historyState').textContent='Istoric neactualizat: '+e.message;if(selected==='orders')try{window.T212J?.importState?.(journalScope,brokerEnvironment,'error');}catch(_){}}}
 finally{if(id===session){busy=false;$('more').disabled=false;document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=false);}}
}
async function sync(){if(busy)return;const id=session;busy=true;portfolioSummary=null;portfolioPositions=null;portfolioReport=null;portfolioAt=null;summaryAt=null;$('portfolioSummary').replaceChildren();$('positionCoverage').textContent='';$('realizedSummary').replaceChildren();$('metrics').replaceChildren();$('positions').replaceChildren();$('account').hidden=true;$('refresh').disabled=true;$('connectButton').disabled=true;$('status').textContent='Sincronizez contul și pozițiile…';
 const results=await Promise.allSettled([api('summary'),api('positions')]);if(id!==session)return;
 const warnings=[];let success=false;
 for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='fulfilled'){if(i===0){portfolioSummary=r.value.data;summaryAt=r.value.fetchedAt;metrics(r.value.data);}else{portfolioAt=r.value.fetchedAt;positions(r.value.data);}environment=r.value.environment;success=true;}else warnings.push((i===0?'Sold':'Poziții')+': '+r.reason.message);}
 if(success)lastFetched=Math.min(...results.filter(r=>r.status==='fulfilled').map(r=>Date.parse(r.value.fetchedAt)));
 if(success&&journalScope&&window.T212J){try{window.T212J.saveSnapshot(journalScope,brokerEnvironment,results[0].status==='fulfilled'?results[0].value.data:null,results[1].status==='fulfilled'?results[1].value.data:null,new Date(lastFetched).toISOString());}catch(e){warnings.push('Portofoliu nesalvat: '+e.message);}}
 $('account').hidden=!success;$('refresh').hidden=false;$('disconnect').hidden=false;$('status').textContent=success?`${environment==='demo'?'DEMO · bani virtuali':'INVEST LIVE'} · citire ${stamp(lastFetched)}${warnings.length?' · PARȚIAL: '+warnings.join(' / '):''}`:'Conectare nereușită: '+warnings.join(' / ');
 if(portfolioPositions===null)positions(null);renderRealized();busy=false;$('refresh').disabled=false;$('connectButton').disabled=!ready;if(success&&!rows.length)await loadHistory();if(id!==session)return false;if(success){$('connectionSettings').open=false;await importJournalPage();}return success;
}
async function startConnection(payload,persist){
 if(previewMode)return false;
 const {key,secret,environment:mode}=payload;let encoded;try{encoded=btoa(key+':'+secret);}catch(_){throw Error('Cheia trebuie copiată exact din Trading 212.');}
 reset();const id=session;base=configuredBase;token=encoded;brokerEnvironment=mode;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(mode+':'+key));if(id!==session)return false;
 journalScope=mode+':'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const success=await sync();if(id!==session)return false;
 if(success&&persist&&window.T212Vault){try{await window.T212Vault.save(payload);if(id===session)$('configState').textContent='Conexiune salvată pe acest dispozitiv · reconectare automată activă.';}catch(e){if(id===session)$('configState').textContent='Conectat pentru această sesiune, dar salvarea a eșuat: '+e.message;}}
 return success;
}
$('connect').addEventListener('submit',async e=>{e.preventDefault();try{if(!ready)throw Error('Conectarea online nu este încă activată. Nu introduce cheia până când releul este disponibil.');const key=$('apiKey').value.trim(),secret=$('apiSecret').value.trim(),mode=$('brokerEnvironment').value;if(!key||!secret||key.includes(':')||!/^live$|^demo$/.test(mode))throw Error('Introdu API Key și API Secret pentru contul selectat.');await startConnection({key,secret,environment:mode},true);}catch(error){$('status').textContent=error.message;}});
$('forgetConnection').onclick=async()=>{reset();const id=session;try{if(window.T212Vault)await window.T212Vault.clear();if(id===session)$('configState').textContent='Conexiunea salvată a fost eliminată. Jurnalul și snapshot-urile sunt păstrate.';}catch(e){if(id===session)$('status').textContent=e.message;}};
$('exportConnection').onclick=async()=>{try{$('transferState').textContent='Criptez conexiunea…';$('transferCode').value=await window.T212Vault.pack($('transferPassword').value);$('transferState').textContent='Cod generat. Copiază-l pe telefon și importă-l cu aceeași parolă.';}catch(e){$('transferState').textContent=e.message;}finally{$('transferPassword').value='';}};
$('copyConnection').onclick=async()=>{try{if(!$('transferCode').value)throw Error('Generează mai întâi codul.');await navigator.clipboard.writeText($('transferCode').value);$('transferState').textContent='Cod criptat copiat.';}catch(e){$('transferState').textContent='Selectează codul și copiază-l manual.';}};
$('importConnection').onclick=async()=>{try{if(!ready)throw Error('Releul nu este activ.');const payload=await window.T212Vault.unpack($('transferCode').value.trim(),$('transferPassword').value);await startConnection(payload,true);$('transferState').textContent='Transfer preluat. Verifică starea conexiunii de mai sus.';}catch(e){$('transferState').textContent=e.message;}finally{$('transferPassword').value='';$('transferCode').value='';}};
$('disconnect').onclick=reset;$('refresh').onclick=sync;$('more').onclick=()=>loadHistory(true);
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{if(busy)return;kind=b.dataset.kind;rows=[];seen.clear();cursor=null;$('history').replaceChildren();$('more').hidden=true;document.querySelectorAll('[data-kind]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));loadHistory();});
setInterval(()=>{updatePortfolioTime();if(lastFetched&&Date.now()-lastFetched>300000)$('status').textContent=`DATE NEACTUALIZATE · ultima citire ${stamp(lastFetched)} · apasă Sincronizează.`;},30000);
window.addEventListener('offline',()=>{$('status').textContent='OFFLINE · datele afișate nu se actualizează.';});
window.addEventListener('pagehide',reset);
function connectionReady(value){ready=value;['apiKey','apiSecret','brokerEnvironment','connectButton'].forEach(id=>$(id).disabled=!value);}
if(!previewMode)try{const c=await fetch('../app/trading212-config.json',{cache:'no-store'}).then(r=>r.json());if(c.enabled&&c.directCredentials===true){configuredBase=validEndpoint(c.endpoint);connectionReady(true);$('configState').textContent='Introdu API Key și API Secret. Datele sunt citite fără plasare de ordine.';}else {connectionReady(false);$('configState').textContent='Formularul simplu este pregătit. Conectarea online este încă în curs de activare; nu introduce cheia deocamdată.';}}catch(_){connectionReady(false);$('configState').textContent='Conectarea online nu este disponibilă momentan. Cheia nu este solicitată până la activare.';}

function acceptJournalPage(page,restart){
 const next=page.data.nextCursor,result=window.T212J.merge(journalScope,brokerEnvironment,page.data.items,next,page.fetchedAt,{restart});
 renderRealized();journalStarted=true;journalCursor=next;journalDone=!journalCursor;if(journalDone)journalNext=Date.now()+300000;
 $('journalState').textContent=`${result.count} execuții în jurnal și Performance Control · ${result.complete?'istoric disponibil parcurs integral':journalDone?'PARȚIAL · execuții incompatibile, necesită reverificare':'import în curs, urmează pagina următoare'}${result.rejected?' · '+result.rejected+' execuții incompatibile excluse':''}${result.excluded?' · '+result.excluded+' ordine fără execuție excluse':''}`;
 return result;
}
async function importJournalPage(){
 if(!token||busy||journalRunning||!journalScope||!window.T212J||Date.now()<journalNext)return;
 if((times.orders||0)>Date.now())return;
 const id=session,scope=journalScope;journalRunning=true;
 try{window.T212J.importState?.(scope,brokerEnvironment,'loading');const restart=journalDone||!journalStarted,page=await api('orders',journalDone?null:journalCursor);if(id!==session)return;
 // Known fills may precede late/backfilled executions on later pages; always follow the cursor.
 acceptJournalPage(page,restart);
 }catch(e){if(id===session&&e.name!=='AbortError'){$('journalState').textContent='Import parțial / întrerupt: '+e.message;try{window.T212J.importState?.(scope,brokerEnvironment,'error');}catch(_){}}}
 finally{if(id===session){journalRunning=false;renderRealized();}}
}
setInterval(()=>{if(token&&$('autoSync').checked&&!busy&&!journalRunning&&navigator.onLine!==false&&document.visibilityState!=='hidden')sync();},60000);
setInterval(()=>{if(token&&$('autoSync').checked&&!journalDone&&!busy&&navigator.onLine!==false&&document.visibilityState!=='hidden')importJournalPage();},12000);

if(!previewMode&&ready&&window.T212Vault){try{const saved=await window.T212Vault.read();if(saved){$('configState').textContent='Restabilesc conexiunea salvată…';await startConnection(saved,false);}}catch(e){$('configState').textContent='Reconectarea automată nu a reușit: '+e.message;}}

let cashRunning=false,cashTurn=0,cashStates={};
async function importCashPage(){
 if(!token||busy||journalRunning||cashRunning||!journalScope||!window.T212J)return;
 const selected=['dividends','transactions'][cashTurn++%2],id=session,scope=journalScope,state=cashStates[scope+'|'+selected]||{cursor:null,done:false,next:0};
 if(state.next>Date.now()||(times[selected]||0)>Date.now())return;
 cashRunning=true;
 try{const page=await api(selected,state.done?null:state.cursor);if(id!==session)return;if(!Array.isArray(page.data?.items))throw Error('Istoric monetar incompatibil.');window.T212J.mergeCash(scope,brokerEnvironment,selected,page.data.items,page.data.nextCursor,page.fetchedAt);state.cursor=page.data.nextCursor;state.done=!state.cursor;state.next=Date.now()+(state.done?300000:12000);}
 catch(e){if(id===session&&e.name!=='AbortError'){window.T212J.cashError(scope,brokerEnvironment,selected,e.message);state.next=Date.now()+300000;}}
 finally{cashStates[scope+'|'+selected]=state;cashRunning=false;}
}
setInterval(()=>{if(token&&$('autoSync').checked&&navigator.onLine!==false&&document.visibilityState!=='hidden')importCashPage();},15000);

if(previewMode){
 previewFixture=window.T212Portfolio.demo();journalScope=previewFixture.scope;portfolioSummary=previewFixture.summary;portfolioAt=summaryAt=new Date().toISOString();
 $('previewBanner').hidden=false;$('connectionSettings').hidden=true;$('syncPanel').hidden=true;$('autoSync').checked=false;$('account').hidden=false;
 $('status').textContent='DEMO FICTIV · date simulate; nu citesc brokerul și nu salvez aceste rezultate.';
 metrics(portfolioSummary);positions(previewFixture.positions);renderRealized();
 $('historyState').textContent='DEMO FICTIV · vânzări simulate';rows=previewFixture.account.items;history();
 document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=true);
}
