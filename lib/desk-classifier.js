/* 16.10.2026: Clasificatorul Long / Hold / Short pe candidații din Desk (Planuri).
   Același motor și același worker ca în Portofoliu; un candidat odată, în fundal; se păstrează doar rezumatul, pe sesiunea EOD. */
(function(g){
'use strict';
const KEY='tt_desk_classifier_v1',MAX=40,TIMEOUT=180000,state=new Map(),listeners=new Set();let queue=[],active=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('ro-RO',{minimumFractionDigits:d,maximumFractionDigits:d}):'—',pct=v=>fmt(100*v,0)+'%';
const Q=()=>g.HoldingsClassifier,LABELS=['Short','Hold','Long'],CSS=['short','hold','long'];
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {};}}
function store(all){
 const keys=Object.keys(all).sort((a,b)=>(all[b].trainedAt||0)-(all[a].trainedAt||0));for(const k of keys.slice(MAX))delete all[k];
 // Spațiul local e comun cu toate paginile originii: la refuz păstrez doar jumătatea cea mai nouă, apoi renunț în tăcere (rezultatul rămâne în memorie).
 for(let attempt=0;attempt<2;attempt++){try{localStorage.setItem(KEY,JSON.stringify(all));return true;}catch{const ks=Object.keys(all).sort((a,b)=>(all[b].trainedAt||0)-(all[a].trainedAt||0));for(const k of ks.slice(Math.ceil(ks.length/2)))delete all[k];}}
 return false;
}
const memory=load();
const okProbs=p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
function sound(e){return !!e&&typeof e.message==='string'&&typeof e.state==='string'&&e.algos&&Q().ALGOS.every(al=>{const x=e.algos[al.id];return x&&okProbs(x.support)&&[0,1,2].includes(x.classIndex)&&Number.isFinite(x.loss)&&Number.isFinite(x.balanced);})&&Number.isFinite(e.refs?.constant?.loss)&&Number.isFinite(e.refs?.momentum?.loss)&&['long','short','always'].every(k=>Number.isInteger(e.money?.[k]?.n));}
function fresh(e,now=Date.now()){try{return !!e&&e.version===Q()?.VERSION&&g.DailySeries.expected(now,e.timezone,e.closeMinutes)===e.asOf&&sound(e);}catch{return false;}}
const robot={};let robotInfo=null,robotPending=null;
function get(symbol){const e=memory[symbol],r=robot[symbol];if(fresh(e)&&(!fresh(r)||e.trainedAt>=r.trainedAt))return e;return fresh(r)?r:null;}
/* I-638: fișierul robotului de noapte (candidate-engine/generated/clasificator.json); doar intrările din sesiunea EOD așteptată și cu forma bună. */
function acceptRobot(j){if(!j||j.version!=='clasificator-robot-v1'||j.motor!==Q()?.VERSION||!j.entries||typeof j.entries!=='object')return 0;let n=0;for(const [s,e] of Object.entries(j.entries))if(e&&e.symbol===s&&fresh(e)){robot[s]={...e,source:'robot'};n++;}const u=j.univers;robotInfo={generat:j.generat,n,univers:u&&!u.eroare&&typeof u.state==='string'&&u.algos?.vote&&u.curent?u:null};return n;}
function loadRobot(url='../candidate-engine/generated/clasificator.json'){if(typeof g.fetch!=='function')return Promise.resolve(0);/* coada așteaptă fișierul (cel mult 8 s), ca telefonul să nu recalculeze ce a făcut robotul */const timer=new Promise(r=>setTimeout(()=>r(null),8000));robotPending=Promise.race([g.fetch(url,{cache:'no-cache'}).then(r=>r.ok?r.json():null),timer]).then(j=>{const n=acceptRobot(j);if(n){queue=queue.filter(s=>!get(s));emit('done');}return n;}).catch(()=>0).finally(()=>{robotPending=null;next();});return robotPending;}
function compact(symbol,source,result,trainedAt=Date.now()){
 const Cl=Q(),a=Cl.assess(result),s=result.walk.summary;
 return {version:Cl.VERSION,symbol,asOf:source.asOf,timezone:source.timezone,closeMinutes:source.closeMinutes,close:result.current.close,trainedAt,state:a.state,message:a.message,maxZ:result.current.maxZ,
  cut:result.historyCut||null,calibration:result.algos.vote.calibration||null,money:{long:result.walk.money.vote.long,short:result.walk.money.vote.short,always:result.walk.money.always},refs:{constant:{loss:result.references.test.constant.loss,balanced:result.references.test.constant.balanced},momentum:{loss:result.references.test.momentum.loss,balanced:result.references.test.momentum.balanced}},
  algos:Object.fromEntries(Cl.ALGOS.map(al=>{const x=result.algos[al.id];return [al.id,{support:x.support,classIndex:x.classIndex,loss:x.test.loss,balanced:x.test.balanced,wins:s?s[al.id].wins:null,holmPass:x.holmPass,p:x.p}];}))};
}
function emit(kind='done'){for(const f of listeners)try{f(kind);}catch{}}
function next(){
 if(active||!queue.length||robotPending)return;const symbol=queue.shift();if(get(symbol)){next();return;}
 const job=active={symbol,id:Math.random()};state.set(symbol,{phase:'running',text:'Descarc istoricul de 5 ani…'});emit('start');
 const done=(error,entry)=>{if(active!==job)return;job.worker?.terminate();clearTimeout(job.timer);active=null;if(error)state.set(symbol,{phase:'error',text:error});else{state.delete(symbol);memory[symbol]=entry;store(memory);}emit();next();};
 (async()=>{try{
  if(typeof Worker==='undefined')throw Error('Browserul nu oferă analiză în fundal.');
  const raw=await g.D.fetchStock(symbol,{range:'5y',interval:'1d',ttl:0}),source=g.DailySeries.read(raw,symbol);if(active!==job)return;
  job.worker=new Worker('../holdings/classifier-worker.js?v='+Q().VERSION);job.timer=setTimeout(()=>done('Clasificarea a depășit 180 de secunde.'),TIMEOUT);
  job.worker.onmessage=e=>{if(active!==job)return;if(e.data.progress){const v=e.data.progress;state.set(symbol,{phase:'running',text:'Fereastra '+(v.stage||1)+' / '+(v.stages||1)+' · '+({boost:'Gradient Boosting',forest:'Random Forest',svm:'SVM'}[v.algorithm]||'')});emit('progress');return;}
   if(e.data.error){done(e.data.error);return;}try{if(!Q().valid(e.data.result))throw Error('Raport neverificabil.');done(null,compact(symbol,source,e.data.result));}catch(err){done(err.message);}};
  job.worker.onerror=()=>done('Workerul clasificatorului nu a putut finaliza.');job.worker.postMessage({id:1,bars:source.bars,now:Date.now()});
 }catch(e){done(e.message||'Istoricul nu a putut fi citit.');}})();
}
/* Cere clasificarea simbolurilor lipsă; `first` trece în fața cozii (candidatul deschis). */
function ensure(symbols,first){
 if(!Q()||!g.D||!g.DailySeries)return;const want=(Array.isArray(symbols)?symbols:[]).filter((s,i,xs)=>typeof s==='string'&&s&&xs.indexOf(s)===i&&!get(s)&&state.get(s)?.phase!=='error'&&active?.symbol!==s);
 if(first&&want.includes(first))want.splice(want.indexOf(first),1),want.unshift(first);
 queue=want;next();
}
/* I-639: 10 candidați × 4 modele = 40 de încercări. Pe lista afișată, votul trece doar dacă trece și corecția Benjamini-Hochberg (10%). */
let list=[];const tries=n=>n+(n%100>=20||n%100===0&&n?' de':'')+' încercări';
function setList(symbols){list=(Array.isArray(symbols)?symbols:[]).filter((s,i,xs)=>typeof s==='string'&&xs.indexOf(s)===i);}
function listCheck(symbol){const xs=list.map(s=>({s,e:get(s)})).filter(x=>x.e),m=xs.length;if(!m||!xs.some(x=>x.s===symbol))return null;const sorted=xs.map(x=>({s:x.s,p:x.e.algos.vote.p})).sort((a,b)=>a.p-b.p||(a.s<b.s?-1:1));let k=0;sorted.forEach((x,i)=>{if(x.p<=(i+1)/m*.1)k=i+1;});return {m,tries:m*4,pass:sorted.slice(0,k).some(x=>x.s===symbol)};}
function retry(symbol){state.delete(symbol);ensure([symbol].concat(queue),symbol);}
function clear(){queue=[];}
function chip(symbol){
 const e=get(symbol);if(!e){const s=state.get(symbol);return s?.phase==='running'||active?.symbol===symbol?'<i class="clf-chip wait" title="Clasificatorul rulează">…</i>':'';}
 const v=e.algos.vote,k=v.classIndex,lc=listCheck(symbol),onList=!lc||lc.pass,muted=e.state!=='research'||!onList;
 if(['drift','uncertain','no-edge'].includes(e.state))return '<i class="clf-chip muted" title="Clasificatorul: '+esc(e.message)+'">—</i>';
 return '<i class="clf-chip '+CSS[k]+(muted?' muted':'')+'" title="Votul clasificatorului: '+esc(LABELS[k])+' '+pct(v.support[k])+(e.state==='research'&&!onList?' · nu trece corecția pe listă ('+tries(lc.tries)+')':muted?' · fără avantaj dovedit în toate verificările':' · avantaj experimental, trece și corecția pe listă')+'">'+LABELS[k][0]+' '+pct(v.support[k])+'</i>';
}
function panel(symbol,demo){
 const head='<div class="clf-desk"><p class="detail-note"><b>Clasificator Long / Hold / Short</b><br>';
 if(demo)return head+'Date fictive: clasificatorul rulează doar pe simboluri reale.</p></div>';
 const e=get(symbol),s=state.get(symbol);
 if(!e)return head+(s?.phase==='error'?'Nu am putut clasifica '+esc(symbol)+': '+esc(s.text)+'</p><button class="detail-link" data-clf-retry="'+esc(symbol)+'">ÎNCEARCĂ DIN NOU →</button></div>':esc(s?.text||'În coadă: pornește singur, un candidat odată.')+'</p></div>');
 const v=e.algos.vote,rows=Q().ALGOS.map(al=>{const x=e.algos[al.id];return '<div><dt>'+esc(al.name)+'</dt><dd>'+[2,1,0].map(k=>'<span class="clf-'+CSS[k]+(x.classIndex===k?' on':'')+'">'+LABELS[k]+' '+pct(x.support[k])+'</span>').join(' ')+'<small>loss '+fmt(x.loss,3)+' · acuratețe '+fmt(100*x.balanced,1)+'% · ferestre '+(x.wins===null?'—':x.wins+'/3')+' · Holm '+(x.holmPass?'trece':'nu trece')+'</small></dd></div>';}).join('');
 return head+esc(e.state==='drift'?'Se abține':['uncertain','no-edge'].includes(e.state)?'Fără direcție susținută':LABELS[v.classIndex]+' · '+(e.state==='research'?'experimental':'exploratoriu'))+' — '+esc(e.message)+'</p>'+(e.calibration?'<p class="detail-note">'+esc(Q().calibrationText(e.calibration))+'</p>':'')+'<details class="clf-fold"'+(e.state==='research'?' open':'')+'><summary>Cei 4 algoritmi, corecția pe listă și banii</summary><dl class="detail-metrics clf-metrics">'+rows+'</dl>'+(()=>{const lc=listCheck(symbol);return lc?'<p class="detail-note">Corecția pe listă: '+lc.m+' candidați × 4 modele = '+tries(lc.tries)+' · votul '+(lc.pass?'trece':'nu trece')+' (Benjamini-Hochberg, 10%).</p>':'';})()+comunRow(symbol,e)+'<p class="detail-note"><b>În bani, după vot:</b> zile Long — '+esc(Q().moneyText(e.money.long))+'. Zile Short, ce ar fi adus o cumpărare — '+esc(Q().moneyText(e.money.short))+'. Reper „cumpăr mereu” — '+esc(Q().moneyText(e.money.always))+'. '+esc(Q().MONEY_NOTE)+'</p>'+(e.cut&&g.HoldingsBars?'<p class="detail-note">'+esc(g.HoldingsBars.note(e.cut))+'</p>':'')+'</details><p class="detail-note">'+(e.source==='robot'?'Calculat de robotul de noapte · ':'')+'EOD '+esc(e.asOf)+' · +5 sesiuni, prag ±1 ATR · repere: frecvențe loss '+fmt(e.refs.constant.loss,3)+', momentum loss '+fmt(e.refs.momentum.loss,3)+'. Procentele sunt estimări ale modelului, nu probabilitatea unui profit; nu schimbă scorul tehnic și nici planul.</p></div>';
}
/* I-641: modelul antrenat pe tot universul scannerului (robotul de noapte), cu dovada pe zile. */
function comunRow(symbol,e){const u=robotInfo?.univers,x=u?.curent?.[symbol]?.vote;if(!x||e.source!=='robot')return '';const v=u.algos.vote,ok=okProbs(x.support);if(!ok)return '';return '<p class="detail-note"><b>Model pe tot universul</b> ('+u.simboluri+' acțiuni, '+u.zile+' de zile, dovada pe zile): '+[2,1,0].map(k=>'<span class="clf-'+CSS[k]+(x.classIndex===k&&u.state==='research'?' on':'')+'">'+LABELS[k]+' '+pct(x.support[k])+'</span>').join(' ')+' · ferestre '+v.wins+'/3 · Holm '+(v.holmPass?'trece':'nu trece')+'. '+esc(u.message)+'</p>';}
function onChange(f){listeners.add(f);return ()=>listeners.delete(f);}
g.TTDeskClassifier={KEY,get,compact,acceptRobot,loadRobot,robotInfo:()=>robotInfo,ensure,retry,clear,setList,listCheck,chip,panel,onChange,status:s=>state.get(s)||null};
})(typeof window!=='undefined'?window:globalThis);
