let journalScope='',journalCursor=null,journalStarted=false,journalDone=false,journalRunning=false,journalIncremental=false;
const $=id=>document.getElementById(id),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v,c)=>numeric(v)?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:6}).format(v)+(c?' '+c:''):'—';
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('ro-RO'):'—';};
let configuredBase='',ready=false,base='',token='',brokerEnvironment='live',session=0,busy=false,kind='orders',cursor=null,rows=[],seen=new Set(),controller=new AbortController(),times={},lastFetched=0,environment='';
const errors={broker_redirected:'API-ul Trading 212 redirecționează cererea; conexiunea a fost oprită pentru protejarea cheilor.',broker_timeout:'Trading 212 nu a răspuns în 20 de secunde.',broker_network_error:'Worker-ul nu poate deschide conexiunea către Trading 212.',broker_non_json_response:'Trading 212 a răspuns cu o pagină sau un format incompatibil, nu cu date API.',broker_schema_mismatch:'Datele Trading 212 au un format diferit de cel așteptat.',backend_not_configured:'Backendul nu are încă secretele configurate.',environment_not_configured:'Mediul Invest nu este configurat.',session_unauthorized:'Codul de acces la integrare este incorect.',broker_credentials_invalid:'Cheia Trading 212 nu este validă pentru mediul configurat.',broker_permission_missing:'Cheia Trading 212 nu are permisiunea de citire necesară.',broker_unavailable:'Trading 212 nu răspunde momentan.',broker_response_unavailable:'Răspunsul Trading 212 nu a putut fi verificat.',origin_forbidden:'Această origine nu este autorizată de backend.'};
function validEndpoint(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname.endsWith('.workers.dev'))throw Error('Introdu adresa HTTPS a Workerului privat (workers.dev), fără cale sau parametri.');return u.origin;}
function reset(){$('connectionSettings').open=true;journalScope='';journalCursor=null;journalStarted=false;journalDone=false;journalRunning=false;journalIncremental=false;session++;controller.abort();controller=new AbortController();token='';base='';rows=[];seen.clear();cursor=null;times={};lastFetched=0;busy=false;$('apiKey').value='';$('apiSecret').value='';$('account').hidden=true;$('metrics').replaceChildren();$('positions').replaceChildren();$('history').replaceChildren();$('more').hidden=true;$('refresh').hidden=true;$('disconnect').hidden=true;$('connectButton').disabled=!ready;$('status').textContent='Neconectat · datele contului au fost eliminate din ecran.';}
async function api(name,next){
 const wait=(times[name]||0)-Date.now();if(wait>0)throw Error(`Așteaptă ${Math.ceil(wait/1000)} secunde înainte de următoarea citire.`);
 times[name]=Date.now()+(name==='summary'?6000:['orders','dividends','transactions'].includes(name)?11000:1500);
 const u=new URL(base+'/api/trading212/'+name);if(next)u.searchParams.set('cursor',next);
 const r=await fetch(u,{headers:{Authorization:'Basic '+token,'X-T212-Environment':brokerEnvironment},cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
 const b=await r.json();if(!r.ok){if(r.status===429){const seconds=Math.max(10,Math.min(300,Number(b.retryAfter)||60));times[name]=Date.now()+seconds*1000;throw Error(`Limita Trading 212: reîncearcă peste ${seconds} secunde.`);}const code=Object.hasOwn(errors,b.error)?b.error:'connection_failed';throw Error((errors[b.error]||'Conectarea nu a putut fi verificată.')+` [HTTP ${r.status} · ${code}]`);}
 if(b.source!=='Trading 212'||!['live','demo'].includes(b.environment)||!Number.isFinite(new Date(b.fetchedAt).getTime()))throw Error('Răspuns incompatibil cu integrarea.');return b;
}
function metrics(s){const c=s.currency;$('metrics').innerHTML=[['Valoare raportată de cont',s.totalValue],['Disponibil pentru investiții',s.available],['Investiții',s.invested],['P&L nerealizat',s.unrealized],['P&L realizat · total cont',s.realized],['Cost poziții curente',s.cost],['Rezervat pentru ordine',s.reserved]].map(([label,v])=>`<div class="metric"><small>${esc(label)}</small><b>${esc(fmt(v,c))}</b></div>`).join('');}
const pair=(name,value)=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`;
function positions(xs){$('positions').innerHTML=xs.length?xs.map(p=>`<article class="card"><h3>${esc(p.ticker)}</h3><p>${esc(p.name)}</p><dl>${pair('Cantitate',fmt(p.quantity))}${pair('Preț mediu',fmt(p.averagePrice,p.instrumentCurrency))}${pair('Preț raportat',fmt(p.currentPrice,p.instrumentCurrency))}${pair('Valoare în cont',fmt(p.value,p.currency))}${pair('P&L nerealizat',fmt(p.unrealized,p.currency))}</dl></article>`).join(''):'<p>Nicio poziție deschisă raportată de broker.</p>';}
function history(){const orders=kind==='orders';$('history').innerHTML=rows.map(r=>`<article class="card"><h3>${esc(r.ticker||r.type)}</h3><p>${esc(stamp(r.date))}</p><p>${esc(orders?(r.side||'Sens indisponibil')+' · '+(r.status||'Stare indisponibilă'):r.type)}</p><dl>${orders?pair('Cantitate executată',fmt(r.quantity))+pair('Preț execuție',fmt(r.price,r.priceCurrency)):''}${pair(orders?'Valoare netă':'Sumă',fmt(r.amount,r.currency))}${orders?pair('P&L realizat raportat',fmt(r.realized,r.currency)):''}</dl></article>`).join('');}
async function loadHistory(append=false){if(!token||busy)return;const id=session,selected=kind;busy=true;$('more').disabled=true;document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=true);$('historyState').textContent='Încarc istoricul…';
 try{const b=await api(selected,append?cursor:null);if(id!==session||selected!==kind)return;if(!Array.isArray(b.data?.items))throw Error('Istoric incompatibil.');if(!append){rows=[];seen.clear();}
 for(const item of b.data.items){const key=item.id?selected+':'+item.id:JSON.stringify(item);if(!seen.has(key)){seen.add(key);rows.push(item);}}
 cursor=b.data.nextCursor;history();$('more').hidden=!cursor;$('historyState').textContent=`${rows.length} înregistrări · ${cursor?'istoric parțial, mai există pagini':'toate paginile disponibile au fost încărcate'} · ${stamp(b.fetchedAt)}`;
 }catch(e){if(id===session&&e.name!=='AbortError')$('historyState').textContent='Istoric neactualizat: '+e.message;}
 finally{if(id===session){busy=false;$('more').disabled=false;document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=false);}}
}
async function sync(){if(busy)return;const id=session;busy=true;$('metrics').replaceChildren();$('positions').replaceChildren();$('account').hidden=true;$('refresh').disabled=true;$('connectButton').disabled=true;$('status').textContent='Sincronizez contul și pozițiile…';
 const results=await Promise.allSettled([api('summary'),api('positions')]);if(id!==session)return;
 const warnings=[];let success=false;
 for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='fulfilled'){if(i===0)metrics(r.value.data);else positions(r.value.data);lastFetched=Date.parse(r.value.fetchedAt);environment=r.value.environment;success=true;}else warnings.push((i===0?'Sold':'Poziții')+': '+r.reason.message);}
 if(success&&journalScope&&window.T212J){try{window.T212J.saveSnapshot(journalScope,brokerEnvironment,results[0].status==='fulfilled'?results[0].value.data:null,results[1].status==='fulfilled'?results[1].value.data:null,new Date(lastFetched).toISOString());}catch(e){warnings.push('Portofoliu nesalvat: '+e.message);}}
 $('account').hidden=!success;$('refresh').hidden=false;$('disconnect').hidden=false;$('status').textContent=success?`${environment==='demo'?'DEMO · bani virtuali':'INVEST LIVE'} · citire ${stamp(lastFetched)}${warnings.length?' · PARȚIAL: '+warnings.join(' / '):''}`:'Conectare nereușită: '+warnings.join(' / ');
 busy=false;$('refresh').disabled=false;$('connectButton').disabled=!ready;if(success&&!rows.length)await loadHistory();if(success){$('connectionSettings').open=false;await importJournalPage();}return success;
}
async function startConnection(payload,persist){
 const {key,secret,environment:mode}=payload;let encoded;try{encoded=btoa(key+':'+secret);}catch(_){throw Error('Cheia trebuie copiată exact din Trading 212.');}
 reset();base=configuredBase;token=encoded;brokerEnvironment=mode;const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(mode+':'+key));journalScope=mode+':'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const success=await sync();if(success&&persist&&window.T212Vault){try{await window.T212Vault.save(payload);$('configState').textContent='Conexiune salvată pe acest dispozitiv · reconectare automată activă.';}catch(e){$('configState').textContent='Conectat pentru această sesiune, dar salvarea a eșuat: '+e.message;}}
}
$('connect').addEventListener('submit',async e=>{e.preventDefault();try{if(!ready)throw Error('Conectarea online nu este încă activată. Nu introduce cheia până când releul este disponibil.');const key=$('apiKey').value.trim(),secret=$('apiSecret').value.trim(),mode=$('brokerEnvironment').value;if(!key||!secret||key.includes(':')||!/^live$|^demo$/.test(mode))throw Error('Introdu API Key și API Secret pentru contul selectat.');await startConnection({key,secret,environment:mode},true);}catch(error){$('status').textContent=error.message;}});
$('forgetConnection').onclick=async()=>{try{if(window.T212Vault)await window.T212Vault.clear();reset();$('configState').textContent='Conexiunea salvată a fost eliminată. Jurnalul și snapshot-urile sunt păstrate.';}catch(e){$('status').textContent=e.message;}};
$('exportConnection').onclick=async()=>{try{$('transferState').textContent='Criptez conexiunea…';$('transferCode').value=await window.T212Vault.pack($('transferPassword').value);$('transferState').textContent='Cod generat. Copiază-l pe telefon și importă-l cu aceeași parolă.';}catch(e){$('transferState').textContent=e.message;}finally{$('transferPassword').value='';}};
$('copyConnection').onclick=async()=>{try{if(!$('transferCode').value)throw Error('Generează mai întâi codul.');await navigator.clipboard.writeText($('transferCode').value);$('transferState').textContent='Cod criptat copiat.';}catch(e){$('transferState').textContent='Selectează codul și copiază-l manual.';}};
$('importConnection').onclick=async()=>{try{if(!ready)throw Error('Releul nu este activ.');const payload=await window.T212Vault.unpack($('transferCode').value.trim(),$('transferPassword').value);await startConnection(payload,true);$('transferState').textContent='Transfer preluat. Verifică starea conexiunii de mai sus.';}catch(e){$('transferState').textContent=e.message;}finally{$('transferPassword').value='';$('transferCode').value='';}};
$('disconnect').onclick=reset;$('refresh').onclick=sync;$('more').onclick=()=>loadHistory(true);
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{if(busy)return;kind=b.dataset.kind;rows=[];seen.clear();cursor=null;$('history').replaceChildren();$('more').hidden=true;document.querySelectorAll('[data-kind]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));loadHistory();});
setInterval(()=>{if(lastFetched&&Date.now()-lastFetched>300000)$('status').textContent=`DATE NEACTUALIZATE · ultima citire ${stamp(lastFetched)} · apasă Sincronizează.`;},30000);
window.addEventListener('offline',()=>{$('status').textContent='OFFLINE · datele afișate nu se actualizează.';});
window.addEventListener('pagehide',reset);
function connectionReady(value){ready=value;['apiKey','apiSecret','brokerEnvironment','connectButton'].forEach(id=>$(id).disabled=!value);}
try{const c=await fetch('../app/trading212-config.json',{cache:'no-store'}).then(r=>r.json());if(c.enabled&&c.directCredentials===true){configuredBase=validEndpoint(c.endpoint);connectionReady(true);$('configState').textContent='Introdu API Key și API Secret. Datele sunt citite fără plasare de ordine.';}else {connectionReady(false);$('configState').textContent='Formularul simplu este pregătit. Conectarea online este încă în curs de activare; nu introduce cheia deocamdată.';}}catch(_){connectionReady(false);$('configState').textContent='Conectarea online nu este disponibilă momentan. Cheia nu este solicitată până la activare.';}

async function importJournalPage(){
 if(!token||busy||journalRunning||!journalScope||!window.T212J)return;
 if((times.orders||0)>Date.now())return;
 const id=session,scope=journalScope;journalRunning=true;
 try{if(journalDone)journalIncremental=true;const known=new Set((window.T212J.read().accounts[scope]?.items||[]).map(x=>x.id));const page=await api('orders',journalDone?null:journalCursor);if(id!==session)return;
 const next=journalIncremental&&page.data.items.some(x=>known.has(x.id))?null:page.data.nextCursor;
 const result=window.T212J.merge(scope,brokerEnvironment,page.data.items,next,page.fetchedAt);
 journalStarted=true;journalCursor=next;journalDone=!journalCursor;
 $('journalState').textContent=`${result.count} execuții în jurnal · ${journalDone?'istoric parcurs integral':'import în curs, urmează pagina următoare'}${result.skipped?' · '+result.skipped+' rânduri fără execuție validă excluse':''}`;
 }catch(e){if(id===session&&e.name!=='AbortError')$('journalState').textContent='Import parțial / întrerupt: '+e.message;}
 finally{if(id===session)journalRunning=false;}
}
setInterval(()=>{if(token&&$('autoSync').checked&&!busy&&!journalRunning&&navigator.onLine!==false&&document.visibilityState!=='hidden')sync();},60000);
setInterval(()=>{if(token&&$('autoSync').checked&&!journalDone&&!busy&&navigator.onLine!==false&&document.visibilityState!=='hidden')importJournalPage();},12000);

if(ready&&window.T212Vault){try{const saved=await window.T212Vault.read();if(saved){$('configState').textContent='Restabilesc conexiunea salvată…';await startConnection(saved,false);}}catch(e){$('configState').textContent='Reconectarea automată nu a reușit: '+e.message;}}
