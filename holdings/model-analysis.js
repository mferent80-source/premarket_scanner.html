(function(g){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let context=null,current=null,build=null;
const stamp=t=>Number.isFinite(t)?new Date(t).toLocaleString('ro-RO'):'indisponibil';
const fmt=m=>m.value===null?'—':m.value.toLocaleString('ro-RO',{minimumFractionDigits:m.digits,maximumFractionDigits:m.digits})+m.unit;
function identity(c,i){const p=c?.positions[i],m=p?c.model(p):null;return p?JSON.stringify([c.scope,c.demo,p.ticker,c.symbol(p),m?.currency,m?.asOf]):null;}
function close(){current?.dialog.close();}
function setContext(c){if(current&&identity(c,current.index)!==current.identity){current.restoreFocus=false;close();}context=c;}
function body(payload,m){
 return '<p class="model-analysis-purpose">'+esc(m.purpose)+'</p><div class="model-analysis-meta"><span>EOD '+esc(payload.asOf||'indisponibil')+' · '+esc(payload.currency||'—')+'</span><span>'+esc(m.version||'Neantrenat')+' · antrenat '+esc(stamp(m.trainedAt))+'</span></div>'+(payload.busy?'<p class="model-analysis-notice" role="status">Antrenare în curs. Valorile afișate provin din rezultatul anterior disponibil.</p>':'')+'<section class="model-analysis-verdict"><small>INTERPRETAREA MODELULUI</small><h4>'+esc(m.value)+'</h4><p>'+esc(m.detail)+'</p></section>'+(m.available?'<div class="model-analysis-metrics">'+m.metrics.map(x=>'<div><small>'+esc(x.label)+'</small><b>'+esc(fmt(x))+'</b></div>').join('')+'</div>'+(!['drift','disagreement'].includes(m.state)&&m.indicators.length?'<h4>'+esc(m.indicatorTitle||'Indicatori ai ultimei sesiuni')+'</h4><div class="model-analysis-indicators">'+m.indicators.map(x=>'<div><span>'+esc(x.label)+'</span><b>'+esc(fmt(x))+'</b>'+(x.context?'<small>'+esc(x.context)+'</small>':'')+'</div>').join('')+'</div>':'')+(m.notes.length?'<ul class="model-analysis-notes">'+m.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':''):'')+'<section class="model-analysis-limits"><h4>Limite și interpretare</h4><p>'+esc(m.limits)+'</p>'+(payload.kind==='synthetic'?'<p>DATE FICTIVE: Isolation folosește un scenariu propriu cu anomalie introdusă. Aceste rezultate nu descriu piața sau contul tău.</p>':'')+'</section><p class="model-analysis-updated">Fereastră actualizată: '+esc(stamp(payload.generatedAt))+' · cercetare locală</p>';
}
function refresh(){
 if(!current)return;
 if(identity(context,current.index)!==current.identity){close();return;}
 const payload=build(current.index),m=payload?.models.find(m=>m.id===current.id);if(!m){close();return;}
 const d=current.dialog;d.querySelector('#model-analysis-title').textContent=m.name+' · '+(payload.symbol||'Instrument');
 d.querySelector('[data-model-analysis-body]').innerHTML=body(payload,m);
 d.querySelector('[data-model-analysis-body]').setAttribute('aria-labelledby','model-analysis-tab-'+m.id);
 for(const tab of d.querySelectorAll('[data-model-analysis-tab]')){const selected=tab.dataset.modelAnalysisTab===m.id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
}
function open(index,id,opener){
 close();const payload=build(index);if(!payload?.models.some(m=>m.id===id))return;
 const d=document.createElement('dialog');d.className='model-analysis-dialog';d.setAttribute('aria-labelledby','model-analysis-title');
 d.innerHTML='<header><div><span class="eyebrow">ANALIZA MODELULUI · '+esc(payload.symbol||'Instrument')+'</span><h3 id="model-analysis-title"></h3></div><button type="button" data-model-analysis-close>Închide</button></header><div class="model-analysis-tabs" role="tablist" aria-label="Modele disponibile">'+payload.models.map(m=>'<button type="button" role="tab" id="model-analysis-tab-'+m.id+'" aria-controls="model-analysis-panel" data-model-analysis-tab="'+m.id+'">'+esc(m.short)+'</button>').join('')+'</div><div id="model-analysis-panel" role="tabpanel" tabindex="0" data-model-analysis-body></div><footer><button type="button" data-model-analysis-refresh>Actualizează fereastra</button><button type="button" data-model-analysis-page>Analiza completă în pagină</button></footer>';
 current={dialog:d,index,id,identity:identity(context,index),opener,restoreFocus:true};const owned=current;
 d.querySelector('[data-model-analysis-close]').onclick=close;d.querySelector('[data-model-analysis-refresh]').onclick=refresh;
 d.querySelector('[data-model-analysis-page]').onclick=()=>{const c=current,target=['neural','boosting'].includes(c.id)?'direction':c.id;c.restoreFocus=false;close();const dest=document.getElementById('model-lab-'+c.index+'-'+target);dest?.focus({preventScroll:true});dest?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
 for(const tab of d.querySelectorAll('[data-model-analysis-tab]')){
  tab.onclick=()=>{current.id=tab.dataset.modelAnalysisTab;refresh();};
  tab.onkeydown=e=>{const tabs=[...d.querySelectorAll('[data-model-analysis-tab]')],i=tabs.indexOf(tab),k={ArrowRight:(i+1)%4,ArrowLeft:(i+3)%4,Home:0,End:3}[e.key];if(k===undefined)return;e.preventDefault();tabs[k].click();tabs[k].focus();};
 }
 d.onclose=()=>{if(current===owned)current=null;d.remove();if(!current&&owned.restoreFocus&&identity(context,owned.index)===owned.identity){const opener=owned.opener?.isConnected?owned.opener:document.querySelector('[data-model-analysis-index="'+owned.index+'"][data-model-analysis-open="'+owned.id+'"]');opener?.focus({preventScroll:true});}};
 document.body.appendChild(d);refresh();d.showModal();
}
function bind(builder){build=builder;for(const b of document.querySelectorAll('[data-model-analysis-open]'))b.onclick=()=>open(Number(b.dataset.modelAnalysisIndex),b.dataset.modelAnalysisOpen,b);}
g.HoldingsModelAnalysisUI={setContext,bind,refresh,close};
})(typeof window!=='undefined'?window:globalThis);
