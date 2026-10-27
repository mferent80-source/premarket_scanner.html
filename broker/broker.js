const previewMode=typeof location!=='undefined'&&new URLSearchParams(location.search).get('demo')==='1';
let portfolioReport=null,portfolioSummary=null,portfolioPositions=null,portfolioAt=null,summaryAt=null,previewFixture=null,dailyHistory=null;
let journalScope='',journalCursor=null,journalStarted=false,journalDone=false,journalRunning=false,journalHeadNext=0,journalHeadRevision=0,journalHeadRejected=false;
const $=id=>document.getElementById(id),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v,c)=>numeric(v)?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:6}).format(v)+(c?' '+c:''):'—';
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('ro-RO'):'—';};
let configuredBase='',ready=false,base='',token='',brokerEnvironment='live',session=0,busy=false,kind='orders',cursor=null,rows=[],seen=new Set(),controller=new AbortController(),times={},lastFetched=0,environment='';
// 27.10.2026 (I-759): ora ultimei recitiri a execuțiilor recente (capul jurnalului) — reconcilierea deosebește cu ea o execuție încă necitită
// de o diferență reală. `var`, nu `let`: reconectarea de la pornire o citește înainte să ajungă execuția la declarațiile de mai jos (TDZ).
var journalHeadAt=null;
// 19.10.2026 (I-713): pe aparatul care nu citește Trading 212 pagina ascunsă a contului nu mai cere T212 la 60/12/15 s — primește
// instantaneul prin sincronizare; regula și preluarea după 15 minute sunt în lib/t212-reader.js. Pagina deschisă pe ecran citește oricum.
let wokeAt=Date.now();
const shellVisible=()=>window.TTShell?window.TTShell.visible():document.visibilityState!=='hidden';
function readerInput(){const R=window.TTT212Reader;return {reader:R.setting(localStorage),latestAt:R.latest(localStorage,brokerEnvironment),ownAt:R.own(localStorage,brokerEnvironment),now:Date.now(),wokeAt,visible:shellVisible()};}
function readAllowed(){if(previewMode)return false;if(!window.TTT212Reader)return true;return window.TTT212Reader.decide(readerInput()).read;}
function readerNote(){return !previewMode&&window.TTT212Reader?window.TTT212Reader.describe(readerInput()):'';}
document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)wokeAt=Date.now();});
const errors={broker_redirected:'API-ul Trading 212 redirecționează cererea; conexiunea a fost oprită pentru protejarea cheilor.',broker_timeout:'Trading 212 nu a răspuns în 20 de secunde.',broker_network_error:'Worker-ul nu poate deschide conexiunea către Trading 212.',broker_non_json_response:'Trading 212 a răspuns cu o pagină sau un format incompatibil, nu cu date API.',broker_schema_mismatch:'Datele Trading 212 au un format diferit de cel așteptat.',backend_not_configured:'Backendul nu are încă secretele configurate.',environment_not_configured:'Mediul Invest nu este configurat.',session_unauthorized:'Codul de acces la integrare este incorect.',broker_credentials_invalid:'Cheia Trading 212 nu este validă pentru mediul configurat.',broker_permission_missing:'Cheia Trading 212 nu are permisiunea de citire necesară.',broker_unavailable:'Trading 212 nu răspunde momentan.',broker_response_unavailable:'Răspunsul Trading 212 nu a putut fi verificat.',origin_forbidden:'Această origine nu este autorizată de backend.'};
function validEndpoint(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname.endsWith('.workers.dev'))throw Error('Introdu adresa HTTPS a Workerului privat (workers.dev), fără cale sau parametri.');return u.origin;}
function reset(){clearPortfolio();$('connectionSettings').open=true;journalScope='';journalCursor=null;journalStarted=false;journalDone=false;journalRunning=false;journalHeadNext=0;journalHeadRevision=0;journalHeadRejected=false;journalHeadAt=null;session++;controller.abort();controller=new AbortController();token='';base='';rows=[];seen.clear();cursor=null;times={};lastFetched=0;busy=false;$('apiKey').value='';$('apiSecret').value='';$('account').hidden=true;$('metrics').replaceChildren();$('positions').replaceChildren();$('history').replaceChildren();$('more').hidden=true;$('refresh').hidden=true;$('disconnect').hidden=true;$('connectButton').disabled=!ready;$('status').textContent='Neconectat · datele contului au fost eliminate din ecran.';}
async function api(name,next){
 const wait=(times[name]||0)-Date.now();if(wait>0)throw Error(`Așteaptă ${Math.ceil(wait/1000)} secunde înainte de următoarea citire.`);
 times[name]=Date.now()+(name==='summary'||name==='orders-pending'?6000:['orders','dividends','transactions'].includes(name)?11000:1500);
 const u=new URL(base+'/api/trading212/'+name);if(next)u.searchParams.set('cursor',next);
 const expectedEnvironment=brokerEnvironment,parent=controller.signal,requestController=new AbortController(),abort=()=>requestController.abort();let timedOut=false;
 if(parent.aborted)abort();else parent.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>{timedOut=true;abort();},25000);
 try{
  const r=await fetch(u,{headers:{Authorization:'Basic '+token,'X-T212-Environment':expectedEnvironment},cache:'no-store',credentials:'omit',redirect:'error',signal:requestController.signal});
  const b=await r.json();if(!r.ok){if(r.status===429){const seconds=Math.max(10,Math.min(300,Number(b.retryAfter)||60));times[name]=Date.now()+seconds*1000;const limited=Error(`Limita Trading 212: reîncearcă peste ${seconds} secunde.`);limited.rateLimited=true;throw limited;}const code=Object.hasOwn(errors,b.error)?b.error:'connection_failed';throw Error((errors[b.error]||'Conectarea nu a putut fi verificată.')+` [HTTP ${r.status} · ${code}]`);}
  const at=Date.parse(b?.fetchedAt),d=b?.data,object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(b?.source!=='Trading 212'||b.environment!==expectedEnvironment||!Number.isFinite(at)||at>Date.now()+60000||Date.now()-at>300000)throw Error('Răspuns broker expirat, din viitor sau pentru alt mediu.');
  const numbers=(v,fields)=>fields.every(k=>v[k]===null||v[k]===undefined||numeric(v[k]));
  const valid=name==='orders-pending'?Array.isArray(d)&&d.every(o=>object(o)&&typeof o.ticker==='string'&&o.ticker&&(o.quantity==null||numeric(o.quantity))&&(o.stopPrice==null||numeric(o.stopPrice))&&(o.limitPrice==null||numeric(o.limitPrice))):name==='summary'?object(d)&&typeof d.currency==='string'&&/^[A-Z]{3}$/.test(d.currency)&&[d.totalValue,d.available,d.invested].some(numeric)&&numbers(d,['totalValue','available','reserved','invested','cost','realized','unrealized']):name==='positions'?Array.isArray(d)&&d.every(p=>object(p)&&typeof p.ticker==='string'&&p.ticker&&numeric(p.quantity)&&p.quantity>=0&&numbers(p,['averagePrice','currentPrice','value','unrealized'])):object(d)&&Array.isArray(d.items)&&d.items.every(object)&&(d.nextCursor===null||typeof d.nextCursor==='string'&&/^[-\w:.]{1,256}$/.test(d.nextCursor));
  if(!valid)throw Error('Datele brokerului au un format incompatibil.');return b;
 }catch(e){if(timedOut)throw Error('Releul brokerului nu a răspuns în 25 de secunde. Reîncearcă sincronizarea.');throw e;}
 finally{clearTimeout(timeout);parent.removeEventListener('abort',abort);}
}
function metrics(s){const c=s.currency;$('metrics').innerHTML=[['Valoare raportată de cont',s.totalValue],['Disponibil pentru investiții',s.available],['Investiții',s.invested],['P&L nerealizat',s.unrealized],['P&L realizat · total cont',s.realized],['Cost poziții curente',s.cost],['Rezervat pentru ordine',s.reserved]].map(([label,v])=>`<div class="metric"><small>${esc(label)}</small><b class="${numeric(v)&&label.startsWith('P&L')?(v<0?'negative':v>0?'positive':''):''}">${esc(fmt(v,c))}</b></div>`).join('');}
const pair=(name,value)=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`;
function clearPortfolio(){
 portfolioReport=null;portfolioSummary=null;portfolioPositions=null;portfolioAt=null;summaryAt=null;
 ['portfolioSummary','positions','realizedSummary'].forEach(id=>$(id).replaceChildren());
 $('positionSearch').value='';$('positionFilter').value='all';$('positionSort').value='loss';$('positionAttention').value='all';$('positionEvolution').value='all';$('portfolioCurrency').value='';$('realizedPeriod').value='all';$('positionCoverage').textContent='';
}
function portfolioOptions(){const daily={},stops={},evolution={};let notes={},cache={},maps={},benchmarks={},sectors={};const read=k=>{try{return JSON.parse((k==='tt_holdings_analysis_v1'?(window.TTAnalysisVault&&window.TTAnalysisVault.storage||localStorage):localStorage).getItem(k)||'{}')||{};}catch{return {};}};if(!previewMode){notes=read('tt_holdings_theses_v1');cache=read('tt_holdings_analysis_v1');maps=read('tt_holdings_symbols_v1');benchmarks=read('tt_holdings_benchmarks_v1');sectors=read('tt_holdings_sector_benchmarks_v1');}
 for(const p of portfolioPositions||[]){daily[p.ticker]=window.T212Daily.compare(dailyHistory,{scope:journalScope,environment:previewMode?'demo':brokerEnvironment,position:p,at:portfolioAt});const symbol=maps[p.ticker]||(/^[A-Z0-9.-]+_US_EQ$/.test(p.ticker)?p.ticker.replace(/_US_EQ$/,''):null),benchmark=Object.hasOwn(benchmarks,p.ticker)?benchmarks[p.ticker]:/_US_EQ$/.test(p.ticker)?'SPY':null,sectorBenchmark=sectors[p.ticker]||null;
 const m=previewMode?{currency:p.instrumentCurrency,asOf:window.DailySeries.expected(Date.now(),'America/New_York',960),short:p.ticker==='FICTIV_B_US_EQ'?'Descendent':'Ascendent',medium:p.ticker==='FICTIV_B_US_EQ'?'Descendent':'Ascendent'}:window.HoldingEvolution.resolve(p,cache[journalScope+'|'+p.ticker],{symbol,benchmark,sectorBenchmark});
 stops[p.ticker]=window.HoldingsPulse.stop(p,previewMode&&p.ticker===portfolioPositions[0]?.ticker?{stop:p.currentPrice/1.02,stopCurrency:p.instrumentCurrency,stopAlertPct:3}:notes[journalScope+'|'+p.ticker],m,{at:portfolioAt});evolution[p.ticker]=window.HoldingEvolution.joint(p,m,daily[p.ticker],{at:portfolioAt});}
 return {brokerStops:!previewMode&&window.T212Pending&&journalScope?window.T212Pending.stare({scope:journalScope,positions:portfolioPositions||[],storage:localStorage}).pozitii:null,history:portfolioPositions?{data:dailyHistory,scope:journalScope,environment:previewMode?'demo':brokerEnvironment,at:portfolioAt}:null,analysis:true,preview:previewMode,currency:$('portfolioCurrency').value,filter:$('positionFilter').value||'all',search:$('positionSearch').value,sort:$('positionSort').value||'loss',attention:$('positionAttention').value||'all',evolutionFilter:$('positionEvolution').value||'all',daily,stops,evolution};}

function renderPositions(){
 if(!portfolioReport)return;
 const options=portfolioOptions(),result=window.T212Portfolio.positionsMarkup(portfolioReport,options);
 if(result.rows.length)window.ViewRefresh.patchList($('positions'),result.rows,p=>p.ticker,p=>window.T212Portfolio.positionsMarkup({...portfolioReport,rows:[p]},options).html);else $('positions').innerHTML=result.html;
 window.PositionHistory?.bind($('positions'));
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
 portfolioPositions=xs;dailyHistory=previewMode?window.T212Daily.demo(journalScope,'demo',xs||[],portfolioAt):window.T212Daily.read(localStorage);portfolioReport=window.T212Portfolio.build(xs,portfolioSummary);
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
 }catch(error){host.textContent=error?.code==='fills_loading'?'Se încarcă istoricul execuțiilor Trading 212…':'Istoricul contului selectat nu poate fi citit. Reia sincronizarea.';}
}
$('positions').addEventListener('click',e=>{
 const button=e.target.closest('[data-analyze-position],[data-analyze-demo]');if(!button)return;
 let query;
 try{
  if(button.hasAttribute('data-analyze-demo'))query='demo=1&ticker=FICTIVB_US_EQ';
  else{const target={scope:journalScope,environment:brokerEnvironment,ticker:button.dataset.analyzePosition},entry=window.T212Snapshot.read(brokerEnvironment),checked=window.HoldingHandoff.check(target,entry);if(!checked.ok)throw Error(checked.reason);if(!window.T212Snapshot.fresh(entry[1]))throw Error('Sincronizează Trading 212 înainte de a deschide analiza acestei poziții.');query=window.HoldingHandoff.create(sessionStorage,target);}
  if(window.parent!==window)window.parent.postMessage({ttOpenModule:'holdings/',ttQuery:query},location.origin);else location.assign('../holdings/?'+query);
 }catch(error){$('positionCoverage').textContent=error.message;}
});
['positionFilter','positionSort','positionAttention','positionEvolution'].forEach(id=>$(id).addEventListener('change',renderPositions));
$('positionSearch').addEventListener('input',renderPositions);
$('portfolioCurrency').addEventListener('change',()=>{renderPositions();renderRealized();});
$('realizedPeriod').addEventListener('change',renderRealized);
window.addEventListener('storage',e=>{if(!previewMode&&['tt_holdings_theses_v1','tt_holdings_analysis_v1','tt_holdings_symbols_v1','tt_holdings_benchmarks_v1','tt_holdings_sector_benchmarks_v1',window.T212Daily.KEY].includes(e.key)&&portfolioReport){dailyHistory=window.T212Daily.read(localStorage);renderPositions();}});
$('portfolioSummary').addEventListener('click',e=>{
 const button=e.target.closest('[data-position]');if(!button)return;
 $('positionFilter').value='all';$('positionAttention').value='all';$('positionEvolution').value='all';$('positionSearch').value=button.dataset.position;renderPositions();$('positions').scrollIntoView({behavior:'smooth',block:'start'});
});
$('clearPositionFilters').addEventListener('click',()=>{$('positionSearch').value='';$('positionFilter').value='all';$('positionSort').value='loss';$('positionAttention').value='all';$('positionEvolution').value='all';renderPositions();});
window.addEventListener('storage',e=>{if(e.key===window.T212Performance?.KEY)renderRealized();});

function history(){const orders=kind==='orders';$('history').innerHTML=rows.map(r=>`<article class="card"><h3>${esc(r.ticker||r.type)}</h3><p>${esc(stamp(r.date))}</p><p>${esc(orders?(r.side||'Sens indisponibil')+' · '+(r.status||'Stare indisponibilă'):r.type)}</p><dl>${orders?pair('Cantitate executată',fmt(r.quantity))+pair('Preț execuție',fmt(r.price,r.priceCurrency)):''}${pair(orders?'Valoare netă':'Sumă',fmt(r.amount,r.currency))}${orders?pair('P&L realizat raportat',fmt(r.realized,r.currency)):''}</dl></article>`).join('');}
function recentHistory(page){
 if(kind!=='orders')return;
 const identity=item=>item.id?'orders:'+item.id:JSON.stringify(item),byId=new Map(rows.map(item=>[identity(item),item]));
 for(const item of page.data.items)byId.set(identity(item),item);
 rows=[...byId.values()].sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));seen=new Set(byId.keys());history();
 // The visible history keeps its own older-page cursor, independent from the journal import.
 $('historyState').textContent=`${rows.length} înregistrări afișate · ordine recente actualizate${cursor?' · mai există pagini istorice':''} · ${stamp(page.fetchedAt)}`;
}
async function loadHistory(append=false){if(!token||busy||journalRunning)return;const id=session,selected=kind,scope=journalScope,mode=brokerEnvironment;busy=true;$('more').disabled=true;document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=true);$('historyState').textContent='Încarc istoricul…';
 try{const b=await api(selected,append?cursor:null);if(id!==session||selected!==kind)return;if(!Array.isArray(b.data?.items))throw Error('Istoric incompatibil.');
 if(selected==='orders'&&window.T212J&&scope)await acceptJournalPage(b,!append,id,scope,mode,{head:!append});
 if(selected!=='orders'&&window.T212J&&scope)await window.T212J.mergeCash(scope,mode,selected,b.data.items,b.data.nextCursor,b.fetchedAt,{restart:!append});if(id!==session||selected!==kind)return;
 if(!append){rows=[];seen.clear();}for(const item of b.data.items){const key=item.id?selected+':'+item.id:JSON.stringify(item);if(!seen.has(key)){seen.add(key);rows.push(item);}}cursor=b.data.nextCursor;history();$('more').hidden=!cursor;$('historyState').textContent=`${rows.length} înregistrări · ${cursor?'istoric parțial, mai există pagini':'toate paginile disponibile au fost încărcate'} · ${stamp(b.fetchedAt)}`;
 }catch(e){if(id===session&&e.name!=='AbortError'){$('historyState').textContent='Istoric neactualizat: '+e.message;if(selected==='orders')try{await window.T212J?.importState?.(scope,mode,'error');}catch(_){}}}
 finally{if(id===session){busy=false;$('more').disabled=false;document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=false);}}
}
async function sync({refreshOrders=false,onComplete=null}={}){const report=state=>{if(typeof onComplete==='function')onComplete(state);};if(busy||journalRunning){if(refreshOrders)$('journalState').textContent='Import parțial · o citire sau salvare este încă în curs. Reîncearcă sincronizarea după finalizare.';report('busy');return false;}const id=session;busy=true;$('account').setAttribute('aria-busy','true');$('refresh').disabled=true;$('connectButton').disabled=true;$('status').textContent='Sincronizez contul și pozițiile…';
 const results=await Promise.allSettled([api('summary'),api('positions')]);if(id!==session){report('error');return false;}
 portfolioSummary=null;portfolioPositions=null;portfolioReport=null;portfolioAt=null;summaryAt=null;$('metrics').replaceChildren();const warnings=[];let success=false;
 for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='fulfilled'){if(i===0){portfolioSummary=r.value.data;summaryAt=r.value.fetchedAt;metrics(r.value.data);}else{portfolioAt=r.value.fetchedAt;positions(r.value.data);}environment=r.value.environment;success=true;}else warnings.push((i===0?'Sold':'Poziții')+': '+r.reason.message);}
 if(success)lastFetched=Math.min(...results.filter(r=>r.status==='fulfilled').map(r=>Date.parse(r.value.fetchedAt)));
 if(success&&window.TTT212Reader)window.TTT212Reader.markOwn(localStorage,brokerEnvironment,lastFetched); // I-713: citirea acestui aparat, ca s-o deosebească de cea sincronizată
 // 20.10.2026 (I-723): ordinele în așteptare (doar citire) ⇒ „stop la broker DA / NU” pe poziții; dacă citirea pică, starea rămâne „necitit”, sincronizarea nu suferă
 // 27.10.2026 (I-759): copia ordinelor de DINAINTEA citirii (are STOP-urile abia trimise din aplicație) merge la reconciliere, apoi e rescrisă
 let ordersRead=null,ordersCopy=null;
 if(success&&journalScope&&window.T212Pending){try{ordersCopy=window.T212Pending.read(localStorage,journalScope);}catch(_){ordersCopy=null;}try{const po=await api('orders-pending');if(id===session){window.T212Pending.save(localStorage,journalScope,brokerEnvironment,po.data,po.fetchedAt);ordersRead=po.data;}}catch(e){/* 27.10 (audit): eșecul nu se mai înghite — rămâne scris (ora + motivul) și apare la „necitit” */try{if(window.T212Pending.esuat)window.T212Pending.esuat(localStorage,journalScope,brokerEnvironment,e&&e.message||String(e),new Date().toISOString());}catch(_){}}}
 let persisted=false;if(success&&journalScope&&window.T212J){try{await window.T212J.saveSnapshot(journalScope,brokerEnvironment,results[0].status==='fulfilled'?results[0].value.data:null,results[1].status==='fulfilled'?results[1].value.data:null,new Date(lastFetched).toISOString());persisted=true;}catch(e){warnings.push('Portofoliu nesalvat: '+e.message);}}if(id!==session){report('error');return false;}
 // 27.10.2026 (I-759): după fiecare citire completă (sumar + poziții) copiile aplicației sunt comparate cu Trading 212 ⇒ tt_reconciliere_v1
 if(success&&results.every(r=>r.status==='fulfilled'))reconcile(ordersRead,ordersCopy);renderOrdine();
 $('account').hidden=!success;$('refresh').hidden=false;$('disconnect').hidden=false;$('status').textContent=success?`${environment==='demo'?'DEMO · bani virtuali':'INVEST LIVE'} · citire ${stamp(lastFetched)}${warnings.length?' · PARȚIAL: '+warnings.join(' / '):''}`:'Conectare nereușită: '+warnings.join(' / ');
 if(portfolioPositions===null)positions(null);renderRealized();$('account').setAttribute('aria-busy','false');busy=false;$('refresh').disabled=false;$('connectButton').disabled=!ready;const headReadBefore=journalHeadNext,headRevisionBefore=journalHeadRevision;if(success&&!rows.length)await loadHistory();if(id!==session){report('error');return false;}if(success)$('connectionSettings').open=false;if(success||refreshOrders)await importJournalPage({forceHead:refreshOrders&&journalHeadNext===headReadBefore});if(id!==session){report('error');return false;}report(!success?'error':results.every(r=>r.status==='fulfilled')&&persisted&&(!refreshOrders||journalHeadRevision>headRevisionBefore&&!journalHeadRejected)?'ready':'partial');return success;
}

const dashboardRefreshMessages={loading:'Citesc contul și execuțiile recente din Trading 212…',ready:'Contul și execuțiile recente au fost citite și salvate.',partial:'Actualizare parțială: unele date ale contului sau execuțiile recente nu au fost confirmate.',error:'Contul Invest nu poate fi actualizat acum. Verifică legătura în Portofoliu.',busy:'O citire este în curs sau în pauza impusă de broker. Reîncearcă după finalizare.'};
let dashboardRefreshRunning=false;
async function refreshFromDashboard(){
 const notify=state=>window.parent.postMessage({ttBrokerRefresh:{state,message:dashboardRefreshMessages[state]}},location.origin);
 if(previewMode||!ready||!token||brokerEnvironment!=='live'||!journalScope||typeof window.T212J?.saveSnapshot!=='function'){notify('error');return;}
 if(dashboardRefreshRunning||busy||journalRunning||Math.max(times.summary||0,times.positions||0,times.orders||0)>Date.now()){notify('busy');return;}
 dashboardRefreshRunning=true;notify('loading');
 try{await sync({refreshOrders:true,onComplete:notify});}catch(_){notify('error');}finally{dashboardRefreshRunning=false;}
}
window.addEventListener('message',e=>{if(window.parent===window||e.source!==window.parent||e.origin!==location.origin||e.data?.ttRefreshBroker!==true)return;refreshFromDashboard();});
async function startConnection(payload,persist,{read=true}={}){
 if(previewMode)return false;
 const {key,secret,environment:mode}=payload;let encoded;try{encoded=btoa(key+':'+secret);}catch(_){throw Error('Cheia trebuie copiată exact din Trading 212.');}
 reset();const id=session;base=configuredBase;token=encoded;brokerEnvironment=mode;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(mode+':'+key));if(id!==session)return false;
 journalScope=mode+':'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 // I-713: reconectarea la pornire pe aparatul care nu citește doar pregătește legătura; datele vin prin sincronizare
 if(!read){$('refresh').hidden=false;$('disconnect').hidden=false;$('connectionSettings').open=false;$('status').textContent=readerNote()+' Apasă Sincronizează pentru o citire acum.';return false;}
 const success=await sync();if(id!==session)return false;
 if(success&&persist&&window.T212Vault){try{await window.T212Vault.save(payload);if(id===session)$('configState').textContent='Conexiune salvată pe acest dispozitiv · reconectare automată activă.';}catch(e){if(id===session)$('configState').textContent='Conectat pentru această sesiune, dar salvarea a eșuat: '+e.message;}}
 return success;
}
$('connect').addEventListener('submit',async e=>{e.preventDefault();try{if(!ready)throw Error('Conectarea online nu este încă activată. Nu introduce cheia până când releul este disponibil.');const key=$('apiKey').value.trim(),secret=$('apiSecret').value.trim(),mode=$('brokerEnvironment').value;if(!key||!secret||key.includes(':')||!/^live$|^demo$/.test(mode))throw Error('Introdu API Key și API Secret pentru contul selectat.');await startConnection({key,secret,environment:mode},true);}catch(error){$('status').textContent=error.message;}});
$('forgetConnection').onclick=async()=>{reset();const id=session;try{if(window.T212Vault)await window.T212Vault.clear();if(id===session){$('configState').textContent='Conexiunea salvată (și cheia cu ordine, dacă era pusă) a fost eliminată. Jurnalul și snapshot-urile sunt păstrate.';renderOrdineCheie();}}catch(e){if(id===session)$('status').textContent=e.message;}};
$('exportConnection').onclick=async()=>{try{$('transferState').textContent='Criptez conexiunea…';$('transferCode').value=await window.T212Vault.pack($('transferPassword').value);$('transferState').textContent='Cod generat. Copiază-l pe telefon și importă-l cu aceeași parolă.';}catch(e){$('transferState').textContent=e.message;}finally{$('transferPassword').value='';}};
$('copyConnection').onclick=async()=>{try{if(!$('transferCode').value)throw Error('Generează mai întâi codul.');await navigator.clipboard.writeText($('transferCode').value);$('transferState').textContent='Cod criptat copiat.';}catch(e){$('transferState').textContent='Selectează codul și copiază-l manual.';}};
$('importConnection').onclick=async()=>{try{if(!ready)throw Error('Releul nu este activ.');const payload=await window.T212Vault.unpack($('transferCode').value.trim(),$('transferPassword').value);await startConnection(payload,true);$('transferState').textContent='Transfer preluat. Verifică starea conexiunii de mai sus.';}catch(e){$('transferState').textContent=e.message;}finally{$('transferPassword').value='';$('transferCode').value='';}};
$('disconnect').onclick=reset;$('refresh').onclick=()=>sync({refreshOrders:true});$('more').onclick=()=>loadHistory(true);

// 27.10.2026 (I-759): reconcilierea după fiecare citire completă — copiile aplicației (baza reconciliată, jurnalul execuțiilor, numerarul, STOP-urile
// trimise din aplicație) față de Trading 212; rezultatul în tt_reconciliere_v1 (Governor ⇒ prudență cât sunt diferențe) și în panoul paginii.
function reconcile(orders,ordersCopy){
 const R=window.TTReconciliere;if(!R||previewMode||!journalScope)return;
 let fills=null,cash=null;
 try{const a=window.T212J?.read?.().accounts?.[journalScope];if(a&&Array.isArray(a.items))fills={items:a.items,complete:a.complete===true,fetchedAt:journalHeadAt};}catch(_){fills=null;}
 try{cash=JSON.parse(localStorage.getItem('tt_trading212_cash_v1')||'{}')[journalScope]||null;}catch(_){cash=null;}
 try{R.ruleaza({storage:localStorage,scope:journalScope,broker:{summary:portfolioSummary,positions:portfolioPositions,orders,la:new Date(lastFetched).toISOString()},fills,cash,ordineCopie:ordersCopy,now:Date.now()});}
 catch(e){$('reconciliere').textContent='Reconcilierea nu a putut rula ('+(e&&e.message||'eroare')+'): copiile NU sunt verificate la această citire.';return;}
 renderReconcile();
}
function renderReconcile(){
 const R=window.TTReconciliere;if(!R)return;const r=R.citeste(localStorage),own=r&&journalScope&&r.scope===journalScope?r:null;
 $('reconciliere').innerHTML=R.html(own,esc);$('reconciliereAcceptBox').hidden=!(own&&(own.diferente.length||(own.deConfirmat||[]).length));
}
$('reconciliereAccepta').addEventListener('click',e=>{
 e?.preventDefault?.();const R=window.TTReconciliere;if(!R||!journalScope)return;
 const out=R.accepta({storage:localStorage,scope:journalScope,motiv:$('reconciliereMotiv').value});
 $('reconciliereAcceptStare').textContent=out.ok?'Acceptat: starea Trading 212 e noua bază a reconcilierii; motivul rămâne la vedere.':out.mesaj;if(out.ok){$('reconciliereMotiv').value='';renderReconcile();}
});
// 27.10.2026 (I-757): „Oprește tot” — două trepte: prima apăsare deschide caseta (ce se întâmplă + motivul), a doua anulează ordinele prin releu
// (TTOprire scrie tt_governor_oprire_v1 și emite tt-oprire). Ordinele anulate ies din copia locală și explică dispariția lor la reconciliere.
function renderOprire(stare){const O=window.TTOprire;if(!O)return;const s=stare===undefined?O.citeste():stare;$('oprireStare').textContent=O.text(s);$('oprirePanel').classList?.toggle?.('activ',!!(s&&s.activ));}
function scoateAnulate(ids){
 if(!ids.length||!journalScope)return;
 try{window.TTReconciliere?.anulat({storage:localStorage,scope:journalScope,ids});}catch(_){}
 try{const P=window.T212Pending,a=P&&P.read(localStorage,journalScope);if(a){const gone=new Set(ids.map(String));P.save(localStorage,journalScope,a.environment||brokerEnvironment,a.items.filter(o=>!(o.id!=null&&gone.has(String(o.id)))),a.fetchedAt,{modificatLa:new Date().toISOString()}); /* 27.10 (revizia lotului 2): schimbarea locală e marcată, ca unirea să n-o piardă în fața copiei vechi */}}catch(_){}
 renderOrdine();
}
$('oprireConfirm').hidden=true;
$('opresteTot').addEventListener('click',e=>{e?.preventDefault?.();$('oprireConfirm').hidden=false;try{$('oprireMotiv').focus();}catch(_){}});
$('opresteNu').addEventListener('click',e=>{e?.preventDefault?.();$('oprireConfirm').hidden=true;$('oprireMotiv').value='';});
$('opresteConfirmDa').addEventListener('click',async e=>{
 e?.preventDefault?.();const O=window.TTOprire;
 if(!O){$('oprireStare').textContent='Modulul de oprire nu s-a încărcat: ordinele NU au fost anulate. Anulează-le din aplicația Trading 212.';return;}
 $('opresteConfirmDa').disabled=true;$('opresteTot').disabled=true;$('oprireStare').textContent='Opresc: anulez ordinele în Trading 212…';
 try{const r=await O.opreste({motiv:$('oprireMotiv').value.trim()});$('oprireConfirm').hidden=true;$('oprireMotiv').value='';renderOprire(r.stare||O.citeste());if(r.mesaj)$('oprireStare').textContent+=' '+r.mesaj;scoateAnulate((r.stare?.ordineAnulate||[]).map(o=>o.id).filter(id=>id!=null));}
 catch(err){$('oprireStare').textContent='Oprirea nu s-a încheiat ('+(err&&err.message||'eroare')+'): anulează ordinele manual, din aplicația Trading 212.';}
 finally{$('opresteConfirmDa').disabled=false;$('opresteTot').disabled=false;}
});
window.addEventListener('tt-oprire',e=>renderOprire(e&&e.detail));
// Ordinele în așteptare unul câte unul: anularea cere a doua apăsare pe același buton (lasă și un STOP parțial să fie refăcut din Astăzi)
function renderOrdine(){
 const host=$('ordineLista'),P=window.T212Pending;if(!P)return;
 let a=null;try{a=journalScope?P.read(localStorage,journalScope):null;}catch(_){a=null;}
 if(!a){host.innerHTML='<p class="note">Ordinele în așteptare apar după prima sincronizare pe acest aparat.</p>';return;}
 const sym=t=>String(t||'').replace(/_US_EQ$|_[A-Z]{2}_EQ$|_EQ$/,'');
 host.innerHTML=a.items.length?a.items.map(o=>`<div class="ordin-rand"><span><b>${esc(sym(o.ticker))}</b> · ${esc(o.side==='BUY'?'cumpărare':'vânzare')} ${esc(o.type||'')} · ${esc(fmt(o.quantity))} buc.${numeric(o.stopPrice)?' · stop '+esc(fmt(o.stopPrice)):''}${numeric(o.limitPrice)?' · limită '+esc(fmt(o.limitPrice)):''}</span>${o.id!=null&&/^\d{1,20}$/.test(String(o.id))?`<button type="button" class="secondary" data-anuleaza="${esc(o.id)}">Anulează</button>`:'<small>fără id: anulează-l din aplicația Trading 212</small>'}</div>`).join('')+`<p class="note">Citite la ${esc(stamp(a.fetchedAt))}.</p>`:`<p class="note">Niciun ordin în așteptare la citirea din ${esc(stamp(a.fetchedAt))}.</p>`;
}
$('ordineLista').addEventListener('click',async e=>{
 const b=e.target?.closest?.('[data-anuleaza]');if(!b)return;const id=b.dataset.anuleaza,O=window.TTOprire;
 if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='Confirmă anularea';return;}
 if(!O){$('ordineMesaj').textContent='Modulul de oprire nu s-a încărcat: anulează ordinul din aplicația Trading 212.';return;}
 b.disabled=true;b.textContent='Anulez…';
 const r=await O.anuleazaOrdin(id);$('ordineMesaj').textContent=r.mesaj||'';
 if(r.ok||r.error==='order_not_found')scoateAnulate([id]);else{b.disabled=false;b.dataset.confirm='';b.textContent='Anulează';}
});
// 27.10.2026 (I-764): a doua cheie Trading 212 — cea cu „Orders: Execute” — separată de conexiunea de citire, doar pe acest aparat (seiful).
async function renderOrdineCheie(){
 const V=window.T212Vault;if(!V||!V.readOrdine){$('ordineStare').textContent='Seiful cheilor nu e disponibil în acest browser.';return;}
 try{const o=await V.readOrdine();$('ordineStare').textContent=o?'Cheia cu ordine e pusă pe acest aparat ('+(o.environment==='demo'?'Demo':'Invest real')+'). Ordinele puse din aplicație o folosesc pe ea; citirea rămâne pe cheia doar-citire.':'Nicio cheie cu ordine pe acest aparat: ordinele folosesc conexiunea salvată, care atunci trebuie să aibă „Orders: Execute”.';}
 catch(e){$('ordineStare').textContent='Cheia cu ordine nu se poate citi: '+e.message;}
}
$('salveazaOrdine').addEventListener('click',async e=>{
 e?.preventDefault?.();const V=window.T212Vault,key=$('ordineKey').value.trim(),secret=$('ordineSecret').value.trim();
 try{if(!V||!V.saveOrdine)throw Error('seiful cheilor nu e disponibil în acest browser.');if(!key||!secret)throw Error('lipește API Key și API Secret ale cheii cu ordine.');if(!token||!journalScope)throw Error('conectează întâi contul cu cheia de citire.');
  await V.saveOrdine({key,secret,environment:brokerEnvironment});$('ordineStare').textContent='Cheia cu ordine a fost salvată criptat pe acest aparat. Ordinele puse din aplicație o folosesc pe ea; citirea rămâne pe cheia doar-citire.';}
 catch(err){$('ordineStare').textContent='Cheia cu ordine nu a fost salvată: '+err.message;}
 finally{$('ordineKey').value='';$('ordineSecret').value='';}
});
$('stergeOrdine').addEventListener('click',async e=>{e?.preventDefault?.();try{await window.T212Vault?.clearOrdine?.();$('ordineStare').textContent='Cheia cu ordine a fost ștearsă de pe acest aparat. Ordinele folosesc din nou conexiunea salvată.';}catch(err){$('ordineStare').textContent=err.message;}});
window.addEventListener('storage',e=>{if(e.key===window.TTOprire?.KEY)renderOprire();if(e.key===window.TTReconciliere?.KEY)renderReconcile();if(e.key===window.T212Pending?.KEY)renderOrdine();});
renderOprire();renderReconcile();renderOrdine();renderOrdineCheie();
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{if(busy)return;kind=b.dataset.kind;rows=[];seen.clear();cursor=null;$('history').replaceChildren();$('more').hidden=true;document.querySelectorAll('[data-kind]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));loadHistory();});
// 19.10.2026 (I-702): pagina contului parcată în aplicație nu-și mai redesenează pozițiile la 30 s; la revenire se redesenează o dată
setInterval(()=>{if(portfolioReport&&shellVisible())renderPositions();else updatePortfolioTime();if(token&&!readAllowed())$('status').textContent=readerNote();else if(lastFetched&&Date.now()-lastFetched>300000)$('status').textContent=`DATE NEACTUALIZATE · ultima citire ${stamp(lastFetched)} · apasă Sincronizează.`;},30000);
if(window.TTShell)window.TTShell.onChange(v=>{if(!v)return;if(portfolioReport)renderPositions();if(token&&!portfolioReport&&!busy&&!journalRunning&&$('autoSync').checked&&navigator.onLine!==false)sync();});
window.addEventListener('offline',()=>{$('status').textContent='OFFLINE · datele afișate nu se actualizează.';});
window.addEventListener('pagehide',reset);
function connectionReady(value){ready=value;['apiKey','apiSecret','brokerEnvironment','connectButton'].forEach(id=>$(id).disabled=!value);}
if(!previewMode)try{const c=await fetch('../app/trading212-config.json',{cache:'no-store'}).then(r=>r.json());if(c.enabled&&c.directCredentials===true){configuredBase=validEndpoint(c.endpoint);connectionReady(true);$('configState').textContent='Introdu API Key și API Secret. Datele sunt citite fără plasare de ordine.';}else {connectionReady(false);$('configState').textContent='Formularul simplu este pregătit. Conectarea online este încă în curs de activare; nu introduce cheia deocamdată.';}}catch(_){connectionReady(false);$('configState').textContent='Conectarea online nu este disponibilă momentan. Cheia nu este solicitată până la activare.';}

async function acceptJournalPage(page,restart,id=session,scope=journalScope,mode=brokerEnvironment,{head=false}={}){
 // Sampling recent executions must not restart an unfinished walk through older pages.
 const preserveCursor=head&&journalStarted&&!journalDone,next=preserveCursor?journalCursor:page.data.nextCursor,result=await window.T212J.merge(scope,mode,page.data.items,next,page.fetchedAt,{restart:restart&&!preserveCursor});
 // A page is progress only after durable persistence; an old session cannot advance the current cursor.
 if(id!==session||scope!==journalScope)return null;renderRealized();journalStarted=true;journalCursor=next;journalDone=!journalCursor;if(head){journalHeadAt=page.fetchedAt;journalHeadNext=Date.now()+300000;journalHeadRevision++;journalHeadRejected=!!result?.rejected;}
 $('journalState').textContent=`${result.count} execuții în jurnal și Performance Control · ${result.complete?'istoric disponibil parcurs integral':journalDone?'PARȚIAL · execuții incompatibile, necesită reverificare':'import în curs, urmează pagina următoare'}${result.rejected?' · '+result.rejected+' execuții incompatibile excluse':''}${result.excluded?' · '+result.excluded+' ordine fără execuție excluse':''}`;
 return result;
}
async function importJournalPage({forceHead=false}={}){
 if(!token||busy||journalRunning||!journalScope||!window.T212J)return;
 const head=forceHead||!journalStarted||journalDone||Date.now()>=journalHeadNext;
 if(head&&!forceHead&&Date.now()<journalHeadNext)return;
 if((times.orders||0)>Date.now()){if(forceHead)$('journalState').textContent=`Import parțial · vânzările recente nu au fost recitite. Așteaptă ${Math.ceil((times.orders-Date.now())/1000)} secunde înainte de următoarea citire.`;return;}
 const id=session,scope=journalScope,mode=brokerEnvironment;journalRunning=true;
 try{await window.T212J.importState?.(scope,mode,'loading');if(id!==session)return;const restart=journalDone||!journalStarted,page=await api('orders',head?null:journalCursor);if(id!==session)return;
 // Known fills may precede late/backfilled executions on later pages; always follow the cursor.
 const result=await acceptJournalPage(page,restart,id,scope,mode,{head});if(result&&head)recentHistory(page);
 }catch(e){if(id===session&&e.name!=='AbortError'){$('journalState').textContent='Import parțial / întrerupt: '+e.message;try{await window.T212J.importState?.(scope,mode,'error');}catch(_){}}}
 finally{if(id===session){journalRunning=false;renderRealized();}}
}
setInterval(()=>{if(token&&$('autoSync').checked&&!busy&&!journalRunning&&navigator.onLine!==false&&document.visibilityState!=='hidden'&&readAllowed())sync();},60000);
setInterval(()=>{if(token&&$('autoSync').checked&&!busy&&navigator.onLine!==false&&document.visibilityState!=='hidden'&&readAllowed())importJournalPage();},12000);

if(!previewMode&&ready&&window.T212Vault){try{const saved=await window.T212Vault.read();if(saved){$('configState').textContent='Restabilesc conexiunea salvată…';await startConnection(saved,false,{read:readAllowed()});}}catch(e){$('configState').textContent='Reconectarea automată nu a reușit: '+e.message;}}

let cashRunning=false,cashTurn=0,cashStates={};
async function importCashPage(){
 if(!token||busy||journalRunning||cashRunning||!journalScope||!window.T212J)return;
 const selected=['dividends','transactions'][cashTurn++%2],id=session,scope=journalScope,state=cashStates[scope+'|'+selected]||{cursor:null,done:false,next:0};
 if(state.next>Date.now()||(times[selected]||0)>Date.now())return;
 cashRunning=true;
 try{const restart=state.done||!state.cursor;await window.T212J.cashImportState?.(scope,brokerEnvironment,selected);if(id!==session)return;const page=await api(selected,state.done?null:state.cursor);if(id!==session)return;if(!Array.isArray(page.data?.items))throw Error('Istoric monetar incompatibil.');await window.T212J.mergeCash(scope,brokerEnvironment,selected,page.data.items,page.data.nextCursor,page.fetchedAt,{restart});if(id!==session)return;state.cursor=page.data.nextCursor;state.done=!state.cursor;state.next=Date.now()+(state.done?300000:12000);}
 catch(e){if(id===session&&e.name!=='AbortError'){try{await window.T212J.cashError(scope,brokerEnvironment,selected,e.message);}catch(_){}if(state.cursor&&!e.rateLimited){state.cursor=null;state.done=false;}state.next=Date.now()+300000;}}
 // O pagină veche care pică altfel decât limita 429 nu mai e reîncercată la nesfârșit: următoarea încercare reia de la prima pagină, ca tranzacțiile noi să intre.
 finally{cashStates[scope+'|'+selected]=state;cashRunning=false;}
}
setInterval(()=>{if(token&&$('autoSync').checked&&navigator.onLine!==false&&document.visibilityState!=='hidden'&&readAllowed())importCashPage();},15000);

if(previewMode){
 previewFixture=window.T212Portfolio.demo();journalScope=previewFixture.scope;portfolioSummary=previewFixture.summary;portfolioAt=summaryAt=new Date().toISOString();
 $('previewBanner').hidden=false;$('brokerVerification').hidden=true;$('oprirePanel').hidden=true;$('reconcilierePanel').hidden=true;$('connectionSettings').hidden=true;$('syncPanel').hidden=true;$('autoSync').checked=false;$('account').hidden=false;
 $('status').textContent='DEMO FICTIV · date simulate; nu citesc brokerul și nu salvez aceste rezultate.';
 metrics(portfolioSummary);positions(previewFixture.positions);renderRealized();
 $('historyState').textContent='DEMO FICTIV · vânzări simulate';rows=previewFixture.account.items;history();
 document.querySelectorAll('[data-kind]').forEach(b=>b.disabled=true);
}

