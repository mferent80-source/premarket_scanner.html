(function(g){
'use strict';
const H=g.HoldingsModelHistory,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const memory=new Map(),selected=new Map(),messages=new Map();let context=null;
const real=H.createStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)});
const demo=H.createStore({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)});
function setContext(c){context=c;}
function identity(i){const p=context?.positions[i],m=p?context.model(p):null;return p?{scope:context.scope,symbol:context.symbol(p),currency:m?.currency,kind:context.demo?'synthetic':'market'}:null;}
const store=()=>context.demo?demo:real;
const date=t=>new Date(t).toLocaleString('ro-RO',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const state=s=>({research:'Experimental',fragile:'Fragil', 'no-edge':'Avantaj neconfirmat',drift:'În afara domeniului',disagreement:'Dezacord',blocked:'Blocat',descriptive:'Descriptiv',weak:'Slab reprezentat',transition:'Tranziție',ordinary:'Tipar obișnuit',anomaly:'Anomalie',uncertain:'Neconcludent',missing:'Lipsă',unavailable:'Expirat / incompatibil'}[s]||s);
function markup(s,i){
 const e=identity(i),k=H.key(e),history=store().read(e),entries=history.entries;
 const chosen=entries.find(x=>x.id===selected.get(k))||entries[0],message=messages.get(k)||history.message;
 const disabled=s.busy||!s.asOf||!s.available||history.status!=='ok';
 const comparison=chosen?H.compare(chosen.summary,s,e):null;
 const result=comparison?.status==='compared'?'<div class="model-history-verdict"><b>'+esc(comparison.message)+'</b><p>'+esc(comparison.beforeTitle)+' → '+esc(comparison.afterTitle)+'</p><p>Disponibilitate: '+comparison.beforeAvailable+'/4 → '+comparison.afterAvailable+'/4</p></div><div class="model-history-grid">'+comparison.rows.map(r=>'<article class="model-history-row '+(r.changed?'changed':'')+'"><small>'+esc(r.name)+' · '+(r.changed?r.availability?'Disponibilitate schimbată':'Stare schimbată':r.retrained?'Reantrenat · aceeași stare':'Aceeași stare')+'</small><div><span>Salvat</span><b>'+esc(r.before)+'</b><small>'+esc(state(r.beforeState))+'</small></div><div><span>Acum</span><b>'+esc(r.after)+'</b><small>'+esc(state(r.afterState))+'</small></div></article>').join('')+'</div><p class="meta">'+esc(comparison.limits)+'</p>':comparison?'<p class="meta">'+esc(comparison.message)+'</p>':'';
 return '<section class="model-history" aria-label="Istoricul sintezelor"><div class="model-history-heading"><div><h4>Ce s-a schimbat?</h4><p class="meta">'+(context.demo?'Demo · istoric temporar, separat de cont.':'Istoric pe acest dispozitiv, separat pe cont, instrument și monedă.')+' Maximum '+H.MAX+' sinteze per instrument.</p></div><button data-model-history-save="'+i+'" '+(disabled?'disabled':'')+'>Păstrează sinteza</button></div><p class="meta model-history-status" data-model-history-status role="status" aria-live="polite">'+esc(message||(!entries.length?'Nu ai sinteze păstrate. Salvează analiza, apoi compară cu o analiză ulterioară.':entries.length+' sinteze păstrate · ultima '+date(entries[0].savedAt)))+'</p><details class="model-history-details"><summary>Istoric și comparație</summary>'+(chosen?'<label for="model-history-choice-'+i+'">Compară analiza afișată cu</label><select id="model-history-choice-'+i+'" data-model-history-choice="'+i+'">'+entries.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===chosen.id?'selected':'')+'>'+esc(date(x.savedAt)+' · EOD '+x.summary.asOf+' · '+x.summary.available+'/4')+'</option>').join('')+'</select><p class="meta">Salvat: '+esc(date(chosen.savedAt))+' · generat: '+esc(date(chosen.summary.generatedAt))+' · EOD '+esc(chosen.summary.asOf)+'<br>Analiza afișată: '+esc(date(s.generatedAt))+' · EOD '+esc(s.asOf||'indisponibil')+'</p>'+result:'<p class="meta">Istoricul se păstrează numai când apeși „Păstrează sinteza”. Actualizările paginii și antrenarea nu creează înregistrări automat.</p>')+'</details></section>';
}
function bind(build,refresh){
 for(const b of document.querySelectorAll('[data-model-history-save]'))b.onclick=()=>{
  const i=Number(b.dataset.modelHistorySave),e=identity(i),s=build(i);if(!s)return;
  const result=store().save(s,e),k=H.key(e);messages.set(k,result.message);
  if(result.status==='saved')selected.set(k,result.entries[0].id);
  refresh();
 };
 for(const select of document.querySelectorAll('[data-model-history-choice]'))select.onchange=()=>{selected.set(H.key(identity(Number(select.dataset.modelHistoryChoice))),select.value);refresh();};
}
g.HoldingsModelHistoryUI={setContext,markup,bind};
})(typeof window!=='undefined'?window:globalThis);
