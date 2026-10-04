(function(g){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const target=id=>['neural','boosting'].includes(id)?'direction':id;
function anchor(i,id){return 'model-lab-'+i+'-'+target(id);}
function markup(s,i){
 const nav=[['summary','Sinteză'],['direction','Neural / Boosting'],['hmm','Regim HMM'],['isolation','Anomalii']];
 const link=(id,label)=>'<a data-model-jump="'+target(id)+'" href="#'+anchor(i,id)+'">'+esc(label)+'</a>';
 return '<section class="model-summary" id="'+anchor(i,'summary')+'" tabindex="-1" aria-label="Sinteza modelelor"><div class="model-summary-heading"><div><span class="eyebrow">PRIVIRE COMUNĂ · OBIECTIVE SEPARATE</span><h4>Sinteza modelelor</h4><p class="meta">'+(s.asOf?'EOD '+esc(s.asOf)+' · '+esc(s.symbol)+' · '+esc(s.currency):'Rulează mai întâi analiza EOD a deținerii.')+'</p></div><span class="tag">'+s.available+'/4 rezultate disponibile</span></div><div class="model-summary-verdict '+(s.state==='research'?'':'warn')+'"><b>'+esc(s.title)+'</b><p class="meta">'+(s.busy?'Modelul activ se actualizează. Rezultatele anterioare sunt afișate separat; sinteza se reface la final.':'Sunt afișate doar rezultatele locale disponibile pentru instrumentul, moneda și sesiunea curentă.')+'</p></div><div class="model-summary-grid">'+s.cards.map(c=>'<article class="model-summary-card"><small>'+esc(c.name)+'</small><b>'+esc(c.value)+'</b><p>'+esc(c.detail)+'</p>'+link(c.id,'Deschide '+c.name)+'</article>').join('')+'</div>'+(s.notes.length?'<details class="model-summary-checks" open><summary>Ce necesită revizuire · '+s.notes.length+'</summary><ul>'+s.notes.map(n=>'<li>'+esc(n.text)+' '+link(n.target,'Vezi detaliile')+'</li>').join('')+'</ul></details>':'')+'<p class="meta model-summary-limits">'+esc(s.limits)+'</p><div class="model-summary-actions"><button data-model-summary-export="'+i+'">Exportă sinteza modelelor</button><small>JSON compact · stări și surse, fără cantități, sold sau chei API</small></div>'+ (g.HoldingsModelHistoryUI?.markup(s,i)||'')+'</section><nav class="model-lab-nav" aria-label="Navigare între modelele AI">'+nav.map(([id,label])=>link(id,label)).join('')+'</nav>';
}
function bind(build,refresh){
 for(const b of document.querySelectorAll('[data-model-summary-export]'))b.onclick=()=>{const s=build(Number(b.dataset.modelSummaryExport));if(s)g.HoldingsNeuralUI.exportReport({symbol:s.symbol||'NECUNOSCUT',asOf:s.asOf||'fara-eod',kind:s.kind,result:s});};
 g.HoldingsModelHistoryUI?.bind(build,refresh);
 for(const a of document.querySelectorAll('[data-model-jump]'))a.onclick=e=>{const host=a.closest('[data-neural-host]'),dest=host?.querySelector('[id="'+a.getAttribute('href').slice(1)+'"]');if(!dest)return;e.preventDefault();dest.focus({preventScroll:true});dest.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
}
g.HoldingsModelSummaryUI={markup,bind,anchor};
})(typeof window!=='undefined'?window:globalThis);
