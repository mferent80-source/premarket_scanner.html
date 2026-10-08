/* Compact disclosures shared by the scanners, holdings and the existing Desk tabs. */
(function(g){
'use strict';
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('ro-RO',{maximumFractionDigits:n}):'—',pct=v=>num(v*100,1)+'%';
const labels={up:'ascendent',down:'descendent',mixed:'în tranziție',unknown:'neverificat'},horizons={short:'Scurt',medium:'Mediu',long:'Lung'};
function createTracker(){
 const seen=new Map();
 return {observe(r,scope=''){
  if(!r?.symbol)return null;
  const key=[scope,r.purpose,r.setup,r.symbol,r.source?.currency,r.source?.kind].join('|'),previous=seen.get(key),issues=[...(r.blockers||[]),...(r.cautions||[])],signature=JSON.stringify([r.code,issues]);
  let change=previous?.change||null;
  if(previous&&previous.signature!==signature){const oldIds=new Set(previous.issues.map(i=>i.id)),newIds=new Set(issues.map(i=>i.id));change={from:previous.code,to:r.code,at:r.checkedAt,asOf:r.source?.asOf,added:issues.filter(i=>!oldIds.has(i.id)).map(i=>i.text),resolved:previous.issues.filter(i=>!newIds.has(i.id)).map(i=>i.text)};}
  seen.delete(key);seen.set(key,{signature,code:r.code,issues,change});while(seen.size>80)seen.delete(seen.keys().next().value);
  return change;
 },clear(){seen.clear();}};
}
function change(d,{open=false}={}){return d?'<details class="decision-insight" data-verdict-change '+(open?'open':'')+'><summary>Ultima modificare observată · '+esc(d.from)+' → '+esc(d.to)+'</summary><p>În această sesiune, la '+esc(new Date(d.at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}))+' · EOD '+esc(d.asOf)+'.</p>'+(d.added.length?'<p><b>Condiții noi: </b>'+esc(d.added.join(' '))+'</p>':'')+(d.resolved.length?'<p><b>Condiții rezolvate: </b>'+esc(d.resolved.join(' '))+'</p>':'')+(!d.added.length&&!d.resolved.length?'<p>Rezultatul verificărilor sau formularea condițiilor s-a schimbat. Consultă condițiile actuale.</p>':'')+'</details>':'';}
function trend(r,{open=false}={}){
 const d=r?.trendDetail;if(!d)return '';
 const historical=r.blockers?.some(b=>['source','technical'].includes(b.id)),c=d.comparison;
 const changes=c?c.changes.length?c.changes.map(x=>horizons[x.horizon]+': '+labels[x.from]+' → '+labels[x.to]).join(' · '):'Direcțiile verificate sunt aceleași ca acum 5 sesiuni.':'Comparația cere o analiză nouă a seriei.';
 return '<details class="decision-insight" data-trend-insight '+(open?'open':'')+'><summary>Trend · '+esc(d.regime)+' · '+d.agreement+'/'+d.known+' orizonturi verificate în aceeași direcție</summary>'+(historical?'<p class="decision-insight-warning">Date istorice excluse din decizia curentă. Reanalizează înainte de folosirea reperelor.</p>':'')+'<dl class="decision-insight-metrics"><div><dt>Fragilitate</dt><dd>'+esc(d.fragility)+'</dd></div><div><dt>Ritm EMA21 · 5 sesiuni</dt><dd>'+esc(d.pace)+(d.moveATR===null?'':' · '+num(d.moveATR)+' ATR')+'</dd></div><div><dt>Distanță de EMA21</dt><dd>'+(d.distanceATR===null?'ATR neverificat':num(d.distanceATR)+' ATR')+'</dd></div><div><dt>Ce s-a schimbat în 5 sesiuni</dt><dd>'+esc(changes)+'</dd></div>'+(c?'<div><dt>Randament · ultimele / precedentele 5 sesiuni</dt><dd>'+num(r.technical.ret5)+'% / '+num(c.previousRet5)+'% · diferență '+num(c.acceleration)+' pp</dd></div>':'')+'</dl><p>Ritmul și alinierea descriu închiderile EOD. Mișcare amplă ≥0,5 ATR, moderată ≥0,15 ATR pe 5 sesiuni; praguri descriptive. Nu măsoară probabilitatea continuării și nu confirmă cotația de execuție.</p></details>';
}
function quality(p){
 const q=p.quality;if(!q)return '<p>Registrul original nu oferă încă o verificare prospectivă compatibilă pe acest cont și instrument.</p>';
 const b=q.bins?.[Math.min(4,Math.floor(Math.max(...p.probabilities)*5))],status=q.current?'Verificare EOD actuală':'Rezultate istorice · verificare EOD restantă';
 return '<p><b>'+esc(q.reason)+'</b> '+q.n+' orizonturi separate · '+esc(status)+'.</p>'+(q.n?'<dl class="decision-insight-metrics"><div><dt>Brier · model / reper</dt><dd>'+num(q.brier,3)+' / '+num(q.referenceBrier,3)+'</dd></div><div><dt>Log loss · model / reper</dt><dd>'+num(q.loss,3)+' / '+num(q.referenceLoss,3)+'</dd></div></dl>':'')+(b?'<p>Banda actuală '+pct(b.from)+'–'+pct(b.to)+': '+(b.n>=10?'estimare medie '+pct(b.mean)+'; clasa dominantă s-a confirmat în '+b.correct+'/'+b.n+' cazuri ('+pct(b.observed)+'). Interval orientativ Wilson 95%: '+pct(b.interval[0])+'–'+pct(b.interval[1])+'.':b.n+'/10 observații necesare înainte de afișarea frecvenței și a intervalului.')+'</p>':'');
}
function probabilities(r,{open=false}={}){
 const rows=r?.probabilities||[],historical=r?.blockers?.some(b=>b.id==='source');
 if(!rows.length)return '<p class="decision-probability-empty">Probabilități indisponibile: calculează modelele pe același simbol, aceeași monedă și sesiune. Scorul tehnic nu poate fi transformat în procent.</p>';
 return '<details class="decision-insight" data-probability-insight '+(open?'open':'')+'><summary>Probabilități · '+rows.length+' estimări la +5 sesiuni</summary>'+(historical?'<p class="decision-insight-warning">Sursa instrumentului nu este actuală. Procentele sunt istorice și nu confirmă scenariul.</p>':'')+'<p>Clase la închiderea după 5 sesiuni: Declin ≤−1 ATR inițial, Avans ≥+1 ATR, Mixt între aceste limite. Nu estimează atingerea țintei înaintea stopului.</p>'+rows.map(p=>'<article class="decision-probability"><h4>'+esc(p.name)+'</h4><p>'+esc(p.calibration)+' · '+esc(p.separation)+(p.eligible?'':' · interpretare neeligibilă')+'</p><div class="decision-probability-bars">'+p.probabilities.map((v,k)=>'<div><span>'+['Declin','Mixt','Avans'][k]+'</span><meter min="0" max="1" value="'+v+'" aria-label="'+esc(p.name)+' · '+['Declin','Mixt','Avans'][k]+'">'+pct(v)+'</meter><b>'+pct(v)+'</b></div>').join('')+'</div><p>Diferență între primele două clase: '+pct(p.gap)+'.</p>'+quality(p)+'</article>').join('')+'<p>Reperul folosește numai clasele deja observate înaintea fiecărei estimări, cu regularizare Laplace. Brier (0–2) și log loss: mai mic este mai bun. Scorurile măsoară și separarea claselor; nu demonstrează singure calibrarea. Frecvențele sunt descriptive, pe același instrument și model. Intervalele presupun observații binomiale; dependența temporală poate rămâne. Nici procentele, nici intervalele nu reprezintă probabilitatea profitului tranzacției.</p></details>';
}
function audit(row){
 const p=row?.probability;if(!p)return '';
 return '<small class="probability-audit">Probabilități: '+esc(p.reason)+' '+p.n+' rezultate'+(p.n?' · Brier '+num(p.brier,3)+' / '+num(p.referenceBrier,3)+' · log loss '+num(p.loss,3)+' / '+num(p.referenceLoss,3):'')+(p.missing?' · '+p.missing+' originale fără vector probabilistic':'')+'</small>';
}
g.TTDecisionInsights={trend,probabilities,audit,createTracker,change};
})(typeof window!=='undefined'?window:globalThis);
