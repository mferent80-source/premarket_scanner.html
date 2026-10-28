/* 28.10.2026 (I-778) — secțiunea „Modelele pe portofoliu” din „Rapoarte & evenimente”: citește rapoartele deja păstrate ale celor 7 modele pentru fiecare
   deținere (inspect-ul fiecărui UI), reconstruiește verdictul care ar ieși acum din ele (HoldingsVerdict.build pe istoricul comun din raportul Neural) și
   diagnosticul lui, apoi desenează tabloul pur din lib/holdings-modele-portofoliu.js. Nu pornește antrenări și nu cere rețea; se redesenează doar când
   panoul de rapoarte e vizibil (citirea rapoartelor din stocare costă). */
(function(g){
'use strict';
const M=g.HoldingsModelePortofoliu;let context=null;
const apis=()=>({neural:g.HoldingsNeuralUI,hmm:g.HoldingsHMMUI,isolation:g.HoldingsIsolationUI,quantile:g.HoldingsQuantileUI,garch:g.HoldingsGarchUI,knn:g.HoldingsKNNUI});
function rand(p){
 const snapshots={};for(const [id,api] of Object.entries(apis())){try{snapshots[id]=api&&typeof api.inspect==='function'?api.inspect(p):null;}catch{snapshots[id]=null;}}
 const expected=M.asteptat(snapshots.neural?.record);let probabilistic=null;try{probabilistic=expected?g.HoldingsForecastUI?.probabilistic?.(p,expected,snapshots)||null:null;}catch{probabilistic=null;}
 const verdict=g.HoldingsVerdict.build({expected,snapshots,probabilistic,now:Date.now()});let diagnostic=null;try{diagnostic=g.HoldingsVerdictDiagnostics?.build(verdict,{sourceVerified:!!expected})||null;}catch{diagnostic=null;}
 let entries=[];try{entries=g.HoldingsForecastUI?.snapshot?.(p)?.ledger?.entries||[];}catch{entries=[];}
 return M.rand({ticker:p.ticker,symbol:context.symbol(p),verdict,diagnostic,istoric:M.istoric(expected?.fingerprint),registru:M.rezumatRegistru(entries)});
}
function vizibil(host){const panel=host.closest('[data-workspace-panel]');return !panel||!panel.hidden;}
function render(){const host=document.getElementById('modelePortofoliu');if(!host||!context||!M||!g.HoldingsVerdict)return;if(!vizibil(host))return;
 let rows;try{rows=context.positions.map(rand);}catch(e){host.innerHTML='<p class="meta">Tabloul modelelor nu poate fi desenat: '+String(e&&e.message||e).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</p>';return;}
 const html=M.markup(rows,{demo:context.demo});if(host._mpMarkup===html)return;host._mpMarkup=html;host.innerHTML=html;}
function setContext(c){context=c;render();}
document.addEventListener('click',e=>{if(e.target.closest('[data-workspace-tab="reports"]'))queueMicrotask(render);});
g.HoldingsModelePortofoliuUI={setContext,render};
})(typeof window!=='undefined'?window:globalThis);
