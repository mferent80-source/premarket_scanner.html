(function(g){
'use strict';
const V=g.HoldingsVerdict,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={research:'Avantaj istoric repetat',descriptive:'Validare descriptivă',ordinary:'Observație obișnuită',anomaly:'Anomalie',uncertain:'Clasificare de graniță','no-edge':'Fără avantaj istoric',fragile:'Validare fragilă',drift:'În afara domeniului',weak:'Regim slab',transition:'Regim în tranziție',limited:'Validare limitată',blocked:'Interpretare blocată',disagreement:'Dezacord intern'};
let context=null,view=null,runner=null,origin=null;
const apis=()=>({neural:g.HoldingsNeuralUI,hmm:g.HoldingsHMMUI,isolation:g.HoldingsIsolationUI,quantile:g.HoldingsQuantileUI});
function position(target){return context?.positions.find(p=>p.ticker===target.ticker);}
function current(target,source){
 const p=position(target);if(!p||context.scope!==target.scope||context.demo!==target.demo||context.symbol(p)!==target.symbol)return false;
 if(!source)return true;const m=context.model(p);
 return !!m&&m.asOf===source.asOf&&m.currency===source.currency&&Math.abs(m.price-source.close)<=1e-6*Math.max(1,source.close);
}
function snapshots(){if(!view)return {};const p=position(view.target);return p?Object.fromEntries(Object.entries(apis()).map(([id,api])=>[id,api.inspect(p)])):{};}
function setContext(c){context=c;if(view&&!current(view.target,view.source))close();else refresh();}
function close(){runner?.stop();runner=null;const old=view;view=null;if(old){old.dialog.close();old.dialog.remove();}if(origin?.isConnected)origin.focus({preventScroll:true});else if(old&&current(old.target,null))[...document.querySelectorAll('[data-verdict-open]')].find(b=>b.dataset.verdictOpen===old.target.ticker)?.focus({preventScroll:true});origin=null;}
function progressText(run){
 if(run?.phase==='loading')return 'Verific istoricul comun și ultima închidere EOD…';
 if(run?.phase==='error')return run.error;
 if(run?.phase==='done')return 'Analiză terminată · rezultatele fiecărui model sunt mai jos.';
 if(!run)return 'Analiză oprită. Poți relua toate modelele.';
 const id=V.IDS.find(id=>run.statuses[id]?.state==='running'),p=run.progress;
 return (V.NAMES[id]||'Modele')+' · '+(p?'fereastra '+(p.stage||1)+' / '+(p.stages||1)+' · pasul '+p.epoch+' / '+(p.total||p.epoch):'analizez istoricul…');
}
function refresh(){
 if(!view)return;const {dialog,run,source}=view,r=V.build({expected:source,snapshots:snapshots(),statuses:run?.statuses||{},running:['loading','running'].includes(run?.phase)});view.report=r;
 const final=dialog.querySelector('[data-verdict-final]');final.dataset.state=r.state;
 final.innerHTML=`<span class="eyebrow">VERDICT FINAL CUMULAT · ${r.available} / ${r.total} MODELE</span><h3>${esc(r.title)}</h3>${r.reasons.map(x=>'<p>'+esc(x)+'</p>').join('')}`;
 dialog.querySelector('[data-verdict-source]').textContent=source?(source.kind==='synthetic'?'SIMULARE · date fictive · ':'')+'EOD '+source.asOf+' · '+source.currency+' · orizont +5 sesiuni · același istoric pentru toate modelele':'Un singur istoric pentru toate modelele · orizont +5 sesiuni';
 dialog.querySelector('[data-verdict-status]').textContent=progressText(run);
 dialog.querySelector('[data-verdict-models]').innerHTML=r.cards.map(c=>`<article class="verdict-model" data-verdict-model="${c.id}"><div><h4>${esc(c.name)}</h4><span class="tag">${c.available?'Verificat':c.state==='running'?'În curs':c.state==='error'?'Eroare':'În așteptare'}</span></div><b>${esc(c.available?c.value:c.state==='running'?'Analiză în curs…':'Rezultat indisponibil')}</b><p>${esc(c.detail)}</p>${c.available?`<small>${esc(labels[c.state]||'Interpretare neconcludentă')} · ${new Date(c.trainedAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}${run?.statuses[c.id]?.state==='cached'?' · rezultat recent reutilizat':''}</small>`:''}</article>`).join('');
 dialog.querySelector('[data-verdict-limits]').textContent=r.limits;
 const busy=['loading','running'].includes(run?.phase);dialog.querySelector('[data-verdict-retry]').disabled=busy;dialog.querySelector('[data-verdict-stop]').hidden=!busy;
}
function start(force=false){
 if(!view)return;if(Object.values(apis()).some(api=>api.busy())){view.run={phase:'error',error:'Un model rulează deja. Așteaptă finalizarea lui și apasă Reanalizează toate.'};refresh();return;}
 const active=view;
 const steps=Object.entries(apis()).map(([id,api])=>({models:id==='neural'?['neural','boosting']:[id],run:(target,source,onProgress)=>api.run(position(target),{source,onProgress}),cancel:()=>api.cancelManaged()}));
 runner=g.HoldingsModelRunner.create({
  load:(target,isCurrent)=>context.loadVerdict(position(target),{isCurrent}),steps,
  current:(target,source)=>view===active&&current(target,source),
  reusable:(step,run)=>step.models.every(id=>V.accepted(id,snapshots()[id==='boosting'?'neural':id],run.source,Date.now())),
  update:run=>{if(view!==active)return;const loaded=!view.source&&run.source;view.run=run;view.source=run.source;if(loaded)context.refresh();const signature=run.phase+'|'+V.IDS.map(id=>run.statuses[id]?.state||'missing').join('|');if(view.paintKey===signature&&run.phase==='running'){view.dialog.querySelector('[data-verdict-status]').textContent=progressText(run);return;}view.paintKey=signature;refresh();}
 });
 runner.start(view.target,{force});
}
function open(ticker){
 const p=context?.positions.find(p=>p.ticker===ticker);if(!p)return false;
 if(view?.target.ticker===ticker&&current(view.target,view.source)){view.dialog.focus();return true;}
 close();origin=document.activeElement;
 const dialog=document.createElement('dialog');dialog.className='holdings-verdict';dialog.setAttribute('aria-labelledby','holdings-verdict-title');
 dialog.innerHTML=`<header><div><span class="eyebrow">ANALIZA DEȚINERII</span><h2 id="holdings-verdict-title">Verdict AI · ${esc(context.symbol(p)||p.ticker)}</h2></div><button data-verdict-close aria-label="Închide verdictul">Închide</button></header><div class="verdict-body"><p data-verdict-source class="meta"></p><p data-verdict-status role="status" aria-live="polite"></p><section data-verdict-final class="verdict-final"></section><div class="verdict-models" data-verdict-models></div><details><summary>Cum se formează verdictul</summary><p data-verdict-limits></p><p>Direcția vine din Neural și Gradient Boosting, iar mediana cuantilelor o verifică în unități ATR. HMM descrie regimul; Isolation Forest poate cere prudență. Un model lipsă, validarea slabă sau dezacordul împiedică un verdict direcțional.</p><p>Rezultatele verificate pe același instrument, aceeași închidere și aceeași monedă se reutilizează maximum 30 de minute. Reanalizează toate pornește calculele de la început.</p></details></div><footer><button data-verdict-stop>Oprește analiza</button><button class="primary" data-verdict-retry>Reanalizează toate</button></footer>`;
 view={dialog,target:{key:context.scope+'|'+ticker,scope:context.scope,demo:context.demo,ticker,symbol:context.symbol(p)},source:null,run:null};
 dialog.querySelector('[data-verdict-close]').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 dialog.querySelector('[data-verdict-stop]').onclick=()=>{runner?.stop();view.run={phase:'stopped',statuses:Object.fromEntries(V.IDS.map(id=>[id,{state:'cancelled',error:'Analiză oprită. Reia calculul pentru un verdict final.'}]))};refresh();};
 dialog.querySelector('[data-verdict-retry]').onclick=()=>{view.source=null;start(true);};
 document.body.append(dialog);dialog.showModal();refresh();start();return true;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-verdict-open]');if(b)open(b.dataset.verdictOpen);});
g.HoldingsVerdictUI={setContext,open,close,refresh};
})(typeof window!=='undefined'?window:globalThis);
