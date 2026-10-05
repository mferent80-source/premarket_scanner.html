(function(g){
'use strict';
const B=g.HoldingsForecastBackup,F=g.HoldingsForecast,restorers=new WeakMap(),messages=new Map();let context=null,restorer=null,active=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function identity(p){const m=context.model(p);return {scope:context.scope,ticker:p.ticker,symbol:context.symbol(p),currency:m?.currency||p.instrumentCurrency,kind:context.demo?'synthetic':'market'};}
function current(e){const p=context?.positions.find(p=>p.ticker===e.ticker);return p&&F.key(identity(p))===F.key(e)?p:null;}
function setContext(c,storage){context=c;if(!restorers.has(storage))restorers.set(storage,B.createRestorer(storage));restorer=restorers.get(storage);if(active&&!current(active.identity))active.dialog.close();}
function refresh(){g.HoldingsNeuralUI?.refresh();g.HoldingsForecastMonitorUI?.render();}
function markup(p,i){
 if(!context||!restorer)return '';const e=identity(p),s=restorer.status(e),message=messages.get(F.key(e));
 return '<details class="neural-details forecast-backup-tools"><summary>Backup și restaurare</summary><p>Descarcă registrul cu „Exportă registrul”. Pentru restaurare, alege fișierul și modelele din previzualizare. Estimările locale originale rămân fixe; rezultatele importate cer reverificare.</p><div class="hmm-controls"><button data-forecast-backup="'+i+'" '+(!s.ok?'disabled':'')+'>Restaurează backup</button><button data-forecast-undo="'+i+'" '+(!s.undoCount?'disabled':'')+'>Anulează ultima restaurare'+(s.undoCount?' · '+s.undoCount:'')+'</button><button data-forecast-archive="'+i+'" '+(!s.records?'disabled':'')+'>Exportă arhiva restaurărilor</button></div><p class="meta">Anularea elimină doar estimările adăugate prin ultima restaurare. Celelalte estimări și verificările lor se păstrează.</p><p class="meta" role="status" aria-live="polite">'+esc(message||s.error||'Previzualizarea nu modifică registrul. Copiile anterioare se păstrează în arhiva locală.')+'</p></details>';
}
function groups(plan){const m=new Map();for(const r of plan.additions){const key=r.model+'|'+r.horizon;if(!m.has(key))m.set(key,{key,model:r.model,horizon:r.horizon,ids:[]});m.get(key).ids.push(r.id);}return [...m.values()];}
function selection(a){const chosen=new Set([...a.dialog.querySelectorAll('[data-backup-group]')].filter(b=>b.checked).map(b=>b.value));return groups(a.plan).filter(x=>chosen.has(x.key)).flatMap(x=>x.ids);}
function selectionChanged(a){const ids=selection(a),over=a.plan.localCount+ids.length>a.plan.max;a.dialog.querySelector('[data-backup-apply]').disabled=!ids.length||over;a.dialog.querySelector('[data-backup-count]').textContent=ids.length+(ids.length===1?' estimare selectată · ':' estimări selectate · ')+(a.plan.localCount+ids.length)+' / '+a.plan.max+' după restaurare'+(over?' · selectează mai puține modele':'');}
function display(a,plan){
 a.plan=plan;const host=a.dialog.querySelector('[data-backup-preview]'),apply=a.dialog.querySelector('[data-backup-apply]');apply.disabled=true;
 if(!plan.ok){host.innerHTML='<p class="forecast-backup-warning" role="alert">'+esc(plan.error)+'</p>';return;}
 const names=g.HoldingsForecastUI.NAMES;
 host.innerHTML='<h4>Previzualizare · '+esc(plan.symbol)+' · '+esc(plan.currency)+'</h4><div class="forecast-backup-counts">'+[['În fișier',plan.count],['Noi',plan.additions.length],['Duplicate',plan.duplicates],['Conflicte',plan.conflicts.length]].map(([label,n])=>'<div><small>'+label+'</small><b>'+n+'</b></div>').join('')+'</div><p>Duplicatele păstrează înregistrarea locală. Conflictele sunt omise și nu înlocuiesc estimarea sau rezultatul original.</p>'+ (plan.conflicts.length?'<details class="neural-details"><summary>Conflicte omise · '+plan.conflicts.length+'</summary><ul>'+plan.conflicts.slice(0,20).map(r=>'<li>'+esc(names[r.model])+' · '+r.horizon+' sesiuni · '+esc(r.asOf)+'</li>').join('')+'</ul>'+(plan.conflicts.length>20?'<p>Se afișează primele 20 conflicte.</p>':'')+'</details>':'')+(plan.additions.length?'<fieldset class="forecast-backup-groups"><legend>Modele de restaurat</legend>'+groups(plan).map(x=>'<label><input type="checkbox" data-backup-group value="'+esc(x.key)+'" checked><span>'+esc(names[x.model])+' · '+x.horizon+' sesiuni<small>'+x.ids.length+' estimări</small></span></label>').join('')+'</fieldset><p class="meta" data-backup-count></p><p class="forecast-backup-warning">Rezultatele restaurate sunt excluse din scoruri până la reverificare. Fișierul nu dovedește autenticitatea momentului salvării.</p>':'<p class="meta">Nu există estimări noi de restaurat.</p>');
 for(const b of host.querySelectorAll('[data-backup-group]'))b.onchange=()=>selectionChanged(a);
 if(plan.additions.length)selectionChanged(a);
}
function open(p,opener){
 if(!context||!restorer||!p)return;active?.dialog.close();const e=identity(p);if(!F.identity(e))return;
 const dialog=document.createElement('dialog');dialog.className='forecast-backup-dialog';dialog.setAttribute('aria-labelledby','forecast-backup-title');
 dialog.innerHTML='<header><div><span class="eyebrow">REGISTRU · RESTAURARE SELECTIVĂ</span><h3 id="forecast-backup-title">Restaurează pentru '+esc(e.symbol)+'</h3><p>'+esc(e.currency)+' · '+(e.kind==='synthetic'?'Simulare':'Date de piață')+'</p></div><button data-backup-close aria-label="Închide restaurarea">Închide</button></header><div class="forecast-backup-body"><p>Folosește JSON-ul descărcat prin „Exportă registrul” pentru acest instrument și această monedă. Alegerea fișierului produce doar previzualizarea.</p><label class="forecast-backup-file">Alege backup JSON<input type="file" accept=".json,application/json" data-backup-file></label><p class="meta" data-backup-status role="status" aria-live="polite"></p><div data-backup-preview></div></div><footer><button data-backup-apply class="primary" disabled>Restaurează selecția</button><button data-backup-verify hidden>Verifică rezultatele</button><button data-backup-cancel>Anulează</button></footer>';
 const a=active={dialog,identity:e,restorer,plan:null,reading:0};dialog.onclose=()=>{if(active===a)active=null;dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});};
 const close=()=>dialog.close();dialog.querySelector('[data-backup-close]').onclick=close;dialog.querySelector('[data-backup-cancel]').onclick=close;
 dialog.querySelector('[data-backup-file]').onchange=async event=>{
  const file=event.target.files?.[0],token=++a.reading,status=dialog.querySelector('[data-backup-status]');a.plan=null;dialog.querySelector('[data-backup-apply]').disabled=true;dialog.querySelector('[data-backup-preview]').innerHTML='';
  if(!file){status.textContent='';return;}if(file.size>B.MAX_FILE_BYTES){status.textContent='Fișierul depășește limita de 8 MB.';return;}status.textContent='Citesc și verific backup-ul…';
  try{const raw=await file.text();if(active!==a||token!==a.reading||!current(e))return;display(a,a.restorer.preview(raw,e));status.textContent=a.plan.ok?'Fișier verificat. Registrul local nu a fost modificat.':'Restaurarea este blocată; datele locale sunt păstrate.';}
  catch{if(active===a&&token===a.reading)status.textContent='Fișierul nu poate fi citit. Alege din nou backup-ul.';}
 };
 dialog.querySelector('[data-backup-apply]').onclick=()=>{
  if(active!==a||!a.plan?.ok||!current(e))return;const out=a.restorer.restore(a.plan,e,selection(a)),status=dialog.querySelector('[data-backup-status]');
  if(!out.ok){status.textContent=out.error;dialog.querySelector('[data-backup-apply]').disabled=true;dialog.querySelector('[data-backup-file]').value='';return;}
  status.textContent=out.saved+(out.saved===1?' estimare restaurată.':' estimări restaurate.')+' Estimările originale au rămas fixe. Verifică rezultatele pentru a le include în scoruri.';messages.set(F.key(e),status.textContent);a.plan=null;dialog.querySelector('[data-backup-apply]').disabled=true;dialog.querySelector('[data-backup-file]').disabled=true;for(const b of dialog.querySelectorAll('[data-backup-group]'))b.disabled=true;dialog.querySelector('[data-backup-verify]').hidden=context.demo;dialog.querySelector('[data-backup-cancel]').textContent='Închide';refresh();
 };
 dialog.querySelector('[data-backup-verify]').onclick=()=>{const p=current(e);close();if(p)void g.HoldingsForecastUI.check(p,true);};
 document.body.appendChild(dialog);dialog.showModal();
}
function bind(){
 const position=b=>context?.positions[Number(b.dataset.forecastBackup??b.dataset.forecastUndo??b.dataset.forecastArchive)];
 for(const b of document.querySelectorAll('[data-forecast-backup]'))b.onclick=()=>open(position(b),b);
 for(const b of document.querySelectorAll('[data-forecast-undo]'))b.onclick=()=>{const p=position(b);if(!p)return;const e=identity(p),out=restorer.undo(e);messages.set(F.key(e),out.ok?out.removed+' estimări restaurate eliminate. Celelalte estimări sunt păstrate; copia anterioară rămâne în arhivă.':out.error);refresh();};
 for(const b of document.querySelectorAll('[data-forecast-archive]'))b.onclick=()=>{const p=position(b);if(!p)return;const e=identity(p);try{g.HoldingsNeuralUI.exportReport(restorer.exportArchive(e));}catch{messages.set(F.key(e),'Arhiva nu poate fi exportată. Datele locale sunt păstrate.');refresh();}};
}
g.HoldingsForecastBackupUI={setContext,markup,bind,open};
})(typeof window!=='undefined'?window:globalThis);
