(function(g){
'use strict';
const V=g.HoldingsVerdict,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={research:'Avantaj istoric repetat',descriptive:'Validare descriptivă',ordinary:'Observație obișnuită',anomaly:'Anomalie',uncertain:'Clasificare de graniță','no-edge':'Fără avantaj istoric',fragile:'Validare fragilă',drift:'În afara domeniului',weak:'Regim slab',transition:'Regim în tranziție',limited:'Validare limitată',blocked:'Interpretare blocată',disagreement:'Dezacord intern'};
let context=null,view=null,runner=null,origin=null;
const apis=()=>({neural:g.HoldingsNeuralUI,hmm:g.HoldingsHMMUI,isolation:g.HoldingsIsolationUI,quantile:g.HoldingsQuantileUI,garch:g.HoldingsGarchUI});
function position(target){return context?.positions.find(p=>p.ticker===target.ticker);}
function current(target,source){
 const p=position(target);if(!p||context.scope!==target.scope||context.demo!==target.demo||context.symbol(p)!==target.symbol)return false;
 if(!source)return true;const m=context.model(p);
 return !!m&&m.asOf===source.asOf&&m.currency===source.currency&&Math.abs(m.price-source.close)<=1e-6*Math.max(1,source.close);
}
function snapshots(){if(!view)return {};const p=position(view.target);return p?Object.fromEntries(Object.entries(apis()).map(([id,api])=>[id,api.inspect(p)])):{};}
function exportReports(){
 if(!view||!current(view.target,view.source)||['loading','running'].includes(view.run?.phase))return;
 const now=Date.now(),all=snapshots(),r=V.build({expected:view.source,snapshots:all,statuses:view.run?.statuses||{},now,probabilistic:g.HoldingsForecastUI?.probabilistic?.(position(view.target),view.source,all)}),models={};
 for(const [id,s] of Object.entries(all))if(r.cards.some(c=>c.id===id&&c.available)&&V.accepted(id,s,view.source,now))models[id]=Object.fromEntries(['symbol','currency','kind','asOf','sourceTime','sourceFingerprint','sourceClose','timezone','closeMinutes','trainedAt','retention','source','result'].filter(k=>s.record[k]!==undefined).map(k=>[k,s.record[k]]));
 if(!Object.keys(models).length)return;
 const diagnostics=g.HoldingsVerdictDiagnostics.build(r,{phase:view.run?.phase,sourceVerified:!!view.source,error:view.run?.error,errorCode:view.run?.errorCode});
 const calibration=g.HoldingsForecastUI?.calibration?.(position(view.target));
 g.HoldingsNeuralUI.exportReport({symbol:r.symbol,asOf:r.asOf,kind:r.kind,result:{version:'holdings-ai-reports-v1',generatedAt:now,verdict:{...r,diagnostics},calibration,models}});
}
function setContext(c){context=c;if(view&&!current(view.target,view.source))close();else refresh();}
function close(){runner?.stop();runner=null;const old=view;view=null;if(old){old.dialog.close();old.dialog.remove();}if(origin?.isConnected)origin.focus({preventScroll:true});else if(old&&current(old.target,null))[...document.querySelectorAll('[data-verdict-open]')].find(b=>b.dataset.verdictOpen===old.target.ticker)?.focus({preventScroll:true});origin=null;}
function progressText(run){
 if(run?.phase==='loading')return 'Verific istoricul comun și ultima închidere EOD…';
 if(run?.phase==='error')return run.error;
 if(run?.phase==='done')return 'Analiză terminată · rezultatele fiecărui model sunt mai jos.';
 if(!run||run.phase==='stopped')return 'Analiză oprită. Poți relua toate modelele.';
 const id=V.IDS.find(id=>run.statuses[id]?.state==='running'),p=run.progress;
 return (V.NAMES[id]||'Modele')+' · '+(p?'fereastra '+(p.stage||1)+' / '+(p.stages||1)+' · pasul '+p.epoch+' / '+(p.total||p.epoch):'analizez istoricul…');
}
function diagnosticMarkup(d){
 const issues=d.blockers.length?`<ul class="verdict-issues">${d.blockers.map(x=>`<li data-verdict-issue="${esc(x.code)}"><b>${esc(x.name)} · ${esc(x.label)}</b><p>${esc(x.detail)}</p></li>`).join('')}</ul>`:'';
 return `<section class="verdict-diagnostic" aria-labelledby="verdict-diagnostic-title"><div class="verdict-diagnostic-heading"><h3 id="verdict-diagnostic-title">Ce explică verdictul</h3><span>${d.available} / ${d.total} rapoarte actuale</span></div><b class="verdict-diagnostic-state">${esc(d.title)}</b><p class="meta">${esc(d.explanation)}</p>${issues}${d.actions.length?`<div class="verdict-next"><h4>Ce urmează</h4>${d.actions.map(a=>'<p>'+esc(a.text)+'</p>').join('')}</div>`:''}${d.notes.map(n=>`<p class="verdict-note"><b>${esc(n.name)}:</b> ${esc(n.detail)}</p>`).join('')}</section><div class="verdict-estimates">${d.panels.map(p=>`<section aria-labelledby="verdict-${p.id}-title"><h3 id="verdict-${p.id}-title">${esc(p.title)}</h3><p class="meta">${esc(p.note)}</p><ul>${p.rows.map(row=>`<li data-verdict-estimate="${row.id}"><span>${esc(row.name)}</span><b>${esc(row.value)}</b><small>${esc(row.validation)}</small></li>`).join('')}</ul></section>`).join('')}</div>`;
}
function refresh(){
 if(!view)return;const {dialog,run,source}=view,all=snapshots(),probabilistic=g.HoldingsForecastUI?.probabilistic?.(position(view.target),source,all),r=V.build({expected:source,snapshots:all,statuses:run?.statuses||{},running:['loading','running'].includes(run?.phase),probabilistic});view.report=r;if(run?.phase==='done'&&r.available===6&&!view.captureAttempted){view.captureAttempted=true;g.HoldingsAutoLearningUI?.note?.(position(view.target),source);try{view.capture=g.HoldingsForecastUI?.captureVerdict?.(position(view.target),r,source);}catch{view.capture={ok:false,error:'Registrul estimărilor nu a putut fi actualizat. Verdictul calculat rămâne disponibil.'};}}
 const strategy=view.capture?.strategy;const strategyHost=dialog.querySelector('[data-verdict-strategy]');if(strategyHost)strategyHost.textContent=strategy?.saved?'Decizia și costurile au fost fixate în Strategie AI simulată. Intrarea așteaptă următoarea deschidere.':strategy&&!strategy.ok?'Simularea nu a fost păstrată: '+strategy.error:strategy?.reason||'';
 const risk=strategy?.risk;if(strategyHost&&risk)strategyHost.textContent+=' '+(risk.ok?(risk.state==='within-limits'?'Cont: în limitele tale, estimativ.':risk.state==='blocked'?'Cont: limite depășite.':risk.state==='no-position'?'Cont: fără alocare nouă.':'Cont: verificare de risc incompletă.'):'Verificarea contului nu a fost păstrată: '+risk.error)+' Vezi verificarea contului în Strategie simulată.';
 const diagnostics=g.HoldingsVerdictDiagnostics.build(r,{phase:run?.phase,sourceVerified:!!source,error:run?.error,errorCode:run?.errorCode});
 const final=dialog.querySelector('[data-verdict-final]');final.dataset.state=r.state;
 final.innerHTML=`<span class="eyebrow">VERDICT FINAL CUMULAT · ${r.available} / ${r.total} MODELE</span><h3>${esc(r.title)}</h3>${r.reasons.map(x=>'<p>'+esc(x)+'</p>').join('')}`;
 dialog.querySelector('[data-verdict-diagnostic]').innerHTML=diagnosticMarkup(diagnostics);
 const probabilityHost=dialog.querySelector('[data-verdict-probability]');if(probabilityHost)probabilityHost.innerHTML=g.HoldingsAutoLearningUI?.probabilityMarkup(r.probabilistic)||'';
 const calibration=g.HoldingsForecastUI?.calibration?.(position(view.target));
 const calibrationHost=dialog.querySelector('[data-verdict-calibration]'),open=new Map([...(calibrationHost.querySelectorAll?.('details')||[])].map(d=>[d.querySelector('summary')?.textContent,d.open]));
 calibrationHost.innerHTML=(g.HoldingsCalibrationUI?.markup(calibration,{compact:true})||'')+(context.demo&&calibration?'<button class="calibration-demo-action" data-verdict-calibration-demo>Simulează calibrarea · date fictive</button>':'');
 for(const d of calibrationHost.querySelectorAll?.('details')||[]){const name=d.querySelector('summary')?.textContent;if(open.has(name))d.open=open.get(name);}
 const demoButton=dialog.querySelector('[data-verdict-calibration-demo]');if(demoButton)demoButton.onclick=()=>g.HoldingsForecastUI?.simulationCalibration?.(position(view.target));
 dialog.querySelector('[data-verdict-source]').textContent=source?(source.kind==='synthetic'?'SIMULARE · date fictive · ':'')+'EOD '+source.asOf+' · '+source.currency+' · direcție +5 · volatilitate 5 / 20 sesiuni · același istoric pentru toate modelele':'Un singur istoric pentru toate modelele · direcție +5 · volatilitate 5 / 20 sesiuni';
 dialog.querySelector('[data-verdict-status]').textContent=progressText(run)+(source?.cacheWarning?' '+source.cacheWarning:'')+(run?.phase==='done'&&view.capture?(view.capture.ok?(view.capture.duplicate?' Verdictul primei analize pe această sesiune rămâne păstrat.':' Verdictul final a fost păstrat în Predicții vs. realitate.'):' Verdictul nu a fost salvat în registru: '+view.capture.error):'');
 dialog.querySelector('[data-verdict-models]').innerHTML=r.cards.map(c=>`<article class="verdict-model" data-verdict-model="${c.id}"><div><h4>${esc(c.name)}</h4><span class="tag">${c.available?'Raport actual':c.state==='running'?'În curs':c.state==='error'?'Eroare':c.state==='cancelled'?'Oprit':c.state==='unavailable'?'Reanalizează':'În așteptare'}</span></div><b>${esc(c.available?c.value:c.state==='running'?'Analiză în curs…':'Rezultat indisponibil')}</b><p>${esc(c.detail)}</p>${c.probabilities?'<p class="model-probabilities">'+c.probabilities.map((v,k)=>['Declin','Mixt','Avans'][k]+': '+(100*v).toLocaleString('ro-RO',{maximumFractionDigits:1})+'%').join(' · ')+'</p>':''}${c.regimeProbabilities?'<p class="model-probabilities">Regim: '+c.regimeProbabilities.map(x=>esc(x.label)+': '+(x.probability*100).toLocaleString('ro-RO',{maximumFractionDigits:1})+'%').join(' · ')+'</p>':''}${c.available?`<small>${esc(labels[c.state]||'Interpretare neconcludentă')} · ${new Date(c.trainedAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}${run?.statuses?.[c.id]?.state==='cached'?' · rezultat recent reutilizat':''}</small>`:''}</article>`).join('');
 dialog.querySelector('[data-verdict-limits]').textContent=r.limits;
 const busy=['loading','running'].includes(run?.phase);dialog.querySelector('[data-verdict-export]').hidden=busy||!r.available;dialog.querySelector('[data-verdict-retry]').disabled=busy;dialog.querySelector('[data-verdict-stop]').hidden=!busy;
 dialog.querySelector('[data-verdict-repair]').hidden=busy||!diagnostics.retryIds.length;dialog.querySelector('[data-verdict-repair]').disabled=busy;
}
function start(force=false,retryIds=[]){
 if(!view)return;g.HoldingsAutoLearningUI?.stop();if(Object.values(apis()).some(api=>api.busy())){view.run={phase:'error',errorCode:'busy',error:'Un model rulează deja. Așteaptă finalizarea lui și apasă Reanalizează toate.'};refresh();return;}
 const active=view;
 const steps=Object.entries(apis()).map(([id,api])=>({models:id==='neural'?['neural','boosting']:[id],run:(target,source,onProgress)=>api.run(position(target),{source,onProgress}),cancel:()=>api.cancelManaged()}));
 runner=g.HoldingsModelRunner.create({
  load:async(target,isCurrent)=>{const p=position(target);await Promise.all([...Object.values(apis()).map(api=>api.restore?.(p)),g.HoldingsForecastUI?.restore?.(p)]);if(!isCurrent())throw Error('Analiză anulată: contextul deținerii s-a schimbat.');return context.loadVerdict(position(target),{isCurrent});},steps,
  current:(target,source)=>view===active&&current(target,source),
  reusable:(step,run)=>!step.models.some(id=>retryIds.includes(id))&&step.models.every(id=>V.accepted(id,snapshots()[id==='boosting'?'neural':id],run.source,Date.now())),
  update:run=>{if(view!==active)return;const loaded=!view.source&&run.source;view.run=run;view.source=run.source;if(loaded){context.refresh();g.HoldingsForecastUI?.checkSource?.(position(view.target),run.source);}const signature=run.phase+'|'+V.IDS.map(id=>run.statuses[id]?.state||'missing').join('|');if(view.paintKey===signature&&run.phase==='running'){view.dialog.querySelector('[data-verdict-status]').textContent=progressText(run);return;}view.paintKey=signature;refresh();}
 });
 runner.start(view.target,{force});
}
function open(ticker){
 const p=context?.positions.find(p=>p.ticker===ticker);if(!p)return false;
 if(view?.target.ticker===ticker&&current(view.target,view.source)){view.dialog.focus();return true;}
 close();origin=document.activeElement;
 const dialog=document.createElement('dialog');dialog.className='holdings-verdict';dialog.setAttribute('aria-labelledby','holdings-verdict-title');
 dialog.innerHTML=`<header><div><span class="eyebrow">ANALIZA DEȚINERII</span><h2 id="holdings-verdict-title">Verdict AI · ${esc(context.symbol(p)||p.ticker)}</h2></div><button data-verdict-close aria-label="Închide verdictul">Închide</button></header><div class="verdict-body"><p data-verdict-source class="meta"></p><p data-verdict-status role="status" aria-live="polite"></p><p data-verdict-strategy class="meta" role="status"></p><section data-verdict-final class="verdict-final"></section><div data-verdict-probability></div><div data-verdict-diagnostic></div><div data-verdict-calibration></div><h3 class="verdict-details-title">Rezultate detaliate pe modele</h3><div class="verdict-models" data-verdict-models></div><details><summary>Cum se formează verdictul</summary><p data-verdict-limits></p><p>Direcția probabilistică vine din combinația validată Neural și Gradient Boosting, iar mediana cuantilelor o verifică în unități ATR. HMM descrie regimul; Isolation Forest poate cere prudență. GARCH estimează volatilitatea la 5 și 20 sesiuni și adaugă prudență numai după validarea istorică față de ambele repere. GARCH exploratoriu este explicat separat, fără să modifice direcția. Un rezultat lipsă sau dovezi insuficiente în modelele de direcție împiedică un verdict direcțional.</p><p>Rezultatele verificate pe același instrument, aceeași închidere și aceeași monedă se reutilizează maximum 30 de minute. Reanalizează toate pornește calculele de la început.</p></details></div><footer><button data-verdict-stop>Oprește analiza</button><button data-verdict-export hidden>Descarcă rapoartele AI</button><button data-verdict-repair hidden>Recalculează rezultatele indisponibile</button><button class="primary" data-verdict-retry>Reanalizează toate</button></footer>`;
 view={dialog,target:{key:context.scope+'|'+ticker,scope:context.scope,demo:context.demo,ticker,symbol:context.symbol(p)},source:null,run:null};
 dialog.querySelector('[data-verdict-close]').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 dialog.querySelector('[data-verdict-stop]').onclick=()=>{runner?.stop();view.run={phase:'stopped',statuses:Object.fromEntries(V.IDS.map(id=>[id,{state:'cancelled',error:'Analiză oprită. Reia calculul pentru un verdict final.'}]))};refresh();};
 dialog.querySelector('[data-verdict-export]').onclick=exportReports;
 dialog.querySelector('[data-verdict-retry]').onclick=()=>{view.source=null;view.captureAttempted=false;view.capture=null;start(true);};
 dialog.querySelector('[data-verdict-repair]').onclick=()=>{if(!view||['loading','running'].includes(view.run?.phase))return;const retryIds=view.report.cards.filter(c=>!c.available).map(c=>c.id);if(!retryIds.length)return;view.source=null;view.captureAttempted=false;view.capture=null;start(false,retryIds);};
 document.body.append(dialog);dialog.showModal();refresh();start();return true;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-verdict-open]');if(b)open(b.dataset.verdictOpen);});
g.HoldingsVerdictUI={setContext,open,close,refresh,busy:()=>['loading','running'].includes(view?.run?.phase)};
})(typeof window!=='undefined'?window:globalThis);
