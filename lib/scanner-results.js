(function(g){
 'use strict';
 const PRIMARY_KEY='ce_results_v2',INDEPENDENT_KEY='tt_independent_scanner_v1',FRESH_MS=30*60*1000;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const symbol=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9.^-]{0,19}$/.test(v);
 const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 function read(storage,key){try{const raw=storage.getItem(key);return {value:raw?JSON.parse(raw):null,issue:null};}catch(_){return {value:null,issue:'Copie locală ilizibilă. Rulează din nou scanarea; datele existente sunt păstrate.'};}}
 function stamp(v){return typeof v==='string'?Date.parse(v):v;}
 function scanFresh(ts,now){return Number.isFinite(ts)&&ts>0&&ts<=now+60000&&now-ts<=FRESH_MS;}
 function current(item,now){try{return symbol(item?.symbol)&&item.kind!=='synthetic'&&Number.isFinite(item.ts)&&item.ts>0&&item.ts<=now+60000&&Number.isFinite(item.price)&&item.price>0&&typeof item.currency==='string'&&/^[A-Z]{3}$/.test(item.currency)&&g.DailySeries?.usable(item,now)===true;}catch(_){return false;}}
 function universeFrom(key){try{const x=JSON.parse(key);return Array.isArray(x)&&Array.isArray(x[1])?[...new Set(x[1].filter(symbol))]:[];}catch(_){return [];}}
 function base(){return {exists:false,valid:false,items:[],failures:[],universe:[],completedAt:null,scanFresh:false,verifiedCount:null,scannedCount:null,freshCount:0,provider:'Sursă neconfirmată',dates:[],issue:null};}
 function primary(storage=g.localStorage,now=Date.now()){
  const r=read(storage,PRIMARY_KEY),out=base(),x=r.value;out.issue=r.issue;if(!x)return out;out.exists=true;
  if(!x||typeof x!=='object'||!['momentum','reversal','analyses'].every(k=>Array.isArray(x[k]))||!Number.isFinite(x.updatedAt)||x.updatedAt<=0||x.updatedAt>now+60000){out.issue='Formatul sau timpul copiei Premarket Scanner nu poate fi verificat.';return out;}
  out.valid=true;out.completedAt=x.updatedAt;out.scanFresh=scanFresh(x.updatedAt,now);out.universe=universeFrom(x.universeKey);out.scannedCount=count(x.scannedCount);out.verifiedCount=count(x.verifiedCount);out.failures=Array.isArray(x.failures)?x.failures:[];
  const seen=new Set();out.items=x.momentum.concat(x.reversal,x.analyses).filter(i=>{
   if(!symbol(i?.symbol)||!['momentum','reversal'].includes(i.mode))return false;
   const k=i.symbol+'|'+i.mode;if(seen.has(k))return false;seen.add(k);return true;
  }).map(i=>({...i,sourceCurrent:current(i,now),fresh:out.scanFresh&&current(i,now)})).sort((a,b)=>Number(b.actionable)-Number(a.actionable)||(Number(b.score)||0)-(Number(a.score)||0));
  out.freshCount=new Set(out.items.filter(i=>i.fresh).map(i=>i.symbol)).size;out.dates=[...new Set(out.items.map(i=>i.sourceDate).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')))].sort();
  const providers=[...new Set(out.items.map(i=>i.dataQuality?.provider).filter(Boolean))];out.provider=providers.length?providers.join(' / '):'Yahoo Finance · prin infrastructura Premarket Scanner';return out;
 }
 function independent(storage=g.localStorage,now=Date.now()){
  const r=read(storage,INDEPENDENT_KEY),out=base(),x=r.value;out.issue=r.issue;if(!x)return out;out.exists=true;
  const ts=stamp(x.completedAt),version=g.IndependentScanner?.VERSION;
  if(!x||typeof x!=='object'||!Array.isArray(x.items)||!Array.isArray(x.universe)||!Number.isFinite(ts)||ts<=0||ts>now+60000||typeof x.version!=='string'||x.demo===true){out.issue='Formatul, versiunea sau timpul verdictului independent nu poate fi verificat.';return out;}
  out.valid=true;out.completedAt=ts;out.version=x.version;out.versionCurrent=typeof version==='string'&&x.version===version;out.scanFresh=scanFresh(ts,now)&&out.versionCurrent;out.provider=x.provider||'Yahoo Finance';out.universe=[...new Set(x.universe.filter(symbol))];out.universeSource=x.universeSource||'Univers explicit';out.verifiedCount=count(x.verifiedCount);out.scannedCount=x.items.length;out.failures=Array.isArray(x.failures)?x.failures:[];
  out.items=x.items.filter(i=>symbol(i?.symbol)&&['research_match','rules_not_met','unverifiable'].includes(i.verdict)).map(i=>({...i,sourceCurrent:current(i,now),fresh:out.scanFresh&&i.verdict!=='unverifiable'&&current(i,now)}));
  out.items.sort((a,b)=>Number(b.verdict==='research_match')-Number(a.verdict==='research_match')||(Number(b.passed)||0)-(Number(a.passed)||0)||a.symbol.localeCompare(b.symbol));out.freshCount=out.items.filter(i=>i.fresh).length;out.dates=[...new Set(out.items.map(i=>i.sourceDate).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')))].sort();if(!out.versionCurrent)out.issue=version?'Rezultate din versiunea '+x.version+'. Reia scanarea cu regulile curente.':'Versiunea motorului nu poate fi confirmată. Reîncarcă modulul; copia salvată rămâne vizibilă.';return out;
 }
 function comparisons(a,b){
  const rows=[],best=new Map();a.items.forEach(i=>{const p=best.get(i.symbol);if(!p||Number(i.actionable)>Number(p.actionable)||i.actionable===p.actionable&&Number(i.score)>Number(p.score))best.set(i.symbol,i);});
  b.items.forEach(i=>{const p=best.get(i.symbol);if(!p)return;const ok=!!(p.fresh&&i.fresh&&p.sourceDate===i.sourceDate&&p.currency===i.currency),same=!!p.actionable===(i.verdict==='research_match');rows.push({symbol:i.symbol,primary:p,independent:i,comparable:ok,disagrees:ok&&!same,status:!ok?'Necomparabil':same?'Rezultate compatibile':'Verdicte diferite',reason:!ok?'Necesită două analize actuale, în aceeași monedă și pentru aceeași sesiune EOD.':same?'Aceeași direcție de filtrare; verifică separat riscul și evenimentele.':'Regulile și gărzile diferă. Deschide motivele fiecărui motor înainte de o decizie.'});});return rows;
 }
 function save(report,storage=g.localStorage){
  if(!report||report.demo===true||!Array.isArray(report.items)||!Array.isArray(report.universe)||typeof report.version!=='string'||!Number.isFinite(stamp(report.completedAt)))return {ok:false,reason:'Raportul nu poate fi salvat.'};
  try{storage.setItem(INDEPENDENT_KEY,JSON.stringify(report));return {ok:true};}catch(_){return {ok:false,reason:'Spațiul local nu permite salvarea. Rezultatele sunt vizibile numai în această fereastră.'};}
 }
 function money(n,c){return Number.isFinite(n)&&c?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n)+' '+c:'—';}
 function time(ts){return Number.isFinite(ts)?new Date(ts).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' · București':'Nescanat';}
 function dates(report){return report.dates.length?report.dates.join(' / '):'Sesiune EOD neconfirmată';}
 function coverageState(r){
  const n=r.scannedCount,v=r.verifiedCount;
  if(!r.valid||n===null||v===null||n<=0||v>n||(r.universe.length&&r.universe.length!==n))return 'unknown';
  if(v===0)return 'failed';
  return v===n&&!r.failures.length?'complete':'partial';
 }
 function reportState(r){
  if(!r.exists)return {text:'Nescanat',tone:'neutral'};
  if(!r.valid)return {text:'Neverificabil',tone:'neutral'};
  if(!r.scanFresh)return {text:'De reverificat',tone:'neutral'};
  const coverage=coverageState(r);
  if(coverage==='unknown')return {text:'Neverificat',tone:'neutral'};
  if(coverage==='failed')return {text:'Fără rezultate verificate',tone:'warning'};
  if(coverage==='partial')return {text:'Scanare parțială',tone:'warning'};
  return r.freshCount?{text:'Copie actuală',tone:'positive'}:!r.items.length?{text:'Scanare recentă',tone:'neutral'}:{text:'Date neconfirmate',tone:'neutral'};
 }
 function emptyResult(r,own){
  if(!r.exists)return {title:'Nicio scanare salvată',text:own?'Rulează Reguli V1 pentru rezultate proprii și verificări explicate.':'Deschide Premarket Scanner pentru a popula această fereastră.'};
  if(!r.valid)return {title:'Copia nu poate fi verificată',text:r.issue||'Reia scanarea; datele salvate sunt păstrate.'};
  if(r.items.length)return {title:'Niciun rezultat pentru acest filtru',text:'Schimbă filtrul pentru a vedea rezultatele deja disponibile.'};
  if(!r.scanFresh)return {title:'Date de reverificat',text:r.issue||'Reia scanarea pentru rezultate actuale. Copia anterioară rămâne păstrată.'};
  const coverage=coverageState(r);
  if(coverage==='failed')return {title:'Fără rezultate verificate',text:'Nicio serie verificată din '+r.scannedCount+' simboluri. '+r.failures.length+' erori raportate; consultă acoperirea și reia scanarea.'};
  if(coverage==='partial')return {title:'Scanare parțială, fără candidați afișați',text:'Numai '+r.verifiedCount+' / '+r.scannedCount+' serii sunt verificate; '+r.failures.length+' erori raportate. Absența candidaților nu descrie întregul univers.'};
  if(coverage==='complete')return {title:'Scanare completă, fără candidați în lista top',text:'Toate cele '+r.scannedCount+' serii au fost verificate, dar niciun candidat nu apare în copia listei top. Poți ajusta filtrele în scanner.'};
  return {title:'Acoperire neverificată',text:'Numărul seriilor verificate și universul scanat nu pot fi confirmate. Consultă acoperirea și reia scanarea.'};
 }
 function label(i,own){if(!i.fresh&&i.verdict!=='unverifiable')return 'Date de reverificat';if(own)return {research_match:'Îndeplinește regulile',rules_not_met:'Reguli neîndeplinite',unverifiable:'Neverificabil'}[i.verdict]||'Neverificabil';return i.actionable?'Confirmat în scanner':i.state==='BLOCKED'?'Blocat în scanner':'În monitorizare';}
 function tone(i,own){return !i.fresh?'neutral':own?(i.verdict==='research_match'?'positive':i.verdict==='rules_not_met'?'warning':'neutral'):i.actionable?'positive':i.state==='BLOCKED'?'negative':'warning';}
 function link(route,query=''){return '../'+route+(query?'?'+query:'');}
 function navigate(route,query=''){
  if(!/^(candidate-engine|scanner-verdicts|today|desk|holdings|journal|governor|macro-dashboard|app\/sync)\/$/.test(route))return false;
  if(g.parent&&g.parent!==g){g.parent.postMessage({ttOpen:route,ttQuery:query},g.location.origin);}else g.location.href=link(route,query);return true;
 }
 function meta(report){return '<dl class="scan-meta"><div><dt>Ultima scanare</dt><dd>'+esc(time(report.completedAt))+'</dd></div><div><dt>Sesiune analizată</dt><dd>'+esc(dates(report))+'</dd></div><div><dt>Acoperire verificată</dt><dd>'+esc(report.verifiedCount??'—')+' / '+esc(report.universe.length||report.scannedCount||'—')+' simboluri</dd></div><div><dt>Provider</dt><dd>'+esc(report.provider)+'</dd></div></dl>';}
 function itemMarkup(i,own,{details=true}={}){
  const checks=own&&Array.isArray(i.checks)?'<ul class="check-list">'+i.checks.map(c=>'<li><span class="check-state '+esc(c.status)+'">'+esc({pass:'Trece',fail:'Nu trece',unknown:'Necunoscut'}[c.status]||'Necunoscut')+'</span><div><strong>'+esc(c.label||c.id)+'</strong><p>'+esc(c.value??'—')+' · '+esc(c.rule||c.reason||'')+'</p></div></li>').join('')+'</ul>':'';
  const body='<p class="result-reason">'+esc(i.reason||'Motiv neconfirmat.')+'</p>'+checks+(!own?'<a class="text-link" data-route="candidate-engine/" data-query="symbol='+encodeURIComponent(i.symbol)+'&mode='+encodeURIComponent(i.mode)+'" href="'+link('candidate-engine/','symbol='+encodeURIComponent(i.symbol)+'&mode='+encodeURIComponent(i.mode))+'">Deschide analiza în Premarket Scanner →</a>':'<p class="method-note">Filtru tehnic experimental; nu verifică riscul contului, raportările sau execuția. Nu este probabilitate și nu trimite ordine.</p>');
  const head='<span class="result-symbol">'+esc(i.symbol)+'<small>'+esc(own?'Reguli V1 · '+i.passed+' / '+i.total+' verificări':i.mode==='reversal'?'Early Reversal':'Top Long')+'</small></span><span class="result-price">'+esc(money(i.price,i.currency))+'<small>EOD '+esc(i.sourceDate||'neconfirmat')+'</small></span><span class="badge '+tone(i,own)+'">'+esc(label(i,own))+'</span>';
  return details?'<details class="result-card" data-symbol="'+esc(i.symbol)+'"><summary>'+head+'</summary><div class="result-body">'+body+'</div></details>':'<div class="preview-row">'+head+'</div>';
 }
 g.ScannerResults={PRIMARY_KEY,INDEPENDENT_KEY,FRESH_MS,primary,independent,comparisons,save,current,scanFresh,esc,symbol,money,time,dates,coverageState,reportState,emptyResult,label,tone,navigate,link,meta,itemMarkup};
})(typeof window!=='undefined'?window:globalThis);
