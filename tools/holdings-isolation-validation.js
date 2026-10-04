(async function(){
'use strict';
const R=HoldingsIsolation,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('ro-RO',{minimumFractionDigits:d,maximumFractionDigits:d}):'—',day=t=>new Date(t).toISOString().slice(0,10),status=document.getElementById('status'),date=document.getElementById('date'),root=document.getElementById('results');
try{
 const response=await fetch('../docs/isolation-validation-latest.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const r=await response.json();
 if(r.schema!=='isolation-public-validation-v1'||r.version!==R.VERSION||!Number.isFinite(Date.parse(r.generatedAt))||!Array.isArray(r.results)||r.results.length!==4||new Set(r.results.map(x=>x.symbol)).size!==4||r.results.some(x=>!['evaluated','blocked'].includes(x.status)||x.status==='evaluated'&&(!R.validPublic(x.result)||!/^\d{4}-\d{2}-\d{2}$/.test(x.asOf)||!Number.isInteger(x.bars)||x.bars<510)||x.status==='blocked'&&typeof x.error!=='string'))throw Error('Raportul Isolation Forest nu poate fi verificat.');
 const evaluated=r.results.filter(x=>x.status==='evaluated'),h=[],sums=evaluated.map(x=>x.result.walk?.summary||x.result.report.test),n=sums.reduce((s,x)=>s+x.n,0),flagged=sums.reduce((s,x)=>s+x.flagged,0);
 status.textContent=evaluated.length+' / 4 instrumente evaluate · fără acuratețe de piață confirmată';
 date.textContent='Calculat '+new Date(r.generatedAt).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'})+' RO'+(r.updatedAt?' · completat '+new Date(r.updatedAt).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'})+' RO':'')+' · '+r.source;
 h.push('<section class="overview"><div class="stat"><small>Instrumente evaluate</small><strong>'+evaluated.length+' / 4</strong></div><div class="stat"><small>Sesiuni peste prag · teste</small><strong>'+flagged+' / '+n+'</strong></div><div class="stat"><small>Acuratețe / profit verificate</small><strong>Nu</strong></div></section>');
 h.push('<div class="table-wrap"><table><thead><tr><th>Instrument · EOD</th><th>Prag recent · scor</th><th>Depășiri · teste agregate</th><th>Rată de depășire</th><th>Interpretări de graniță</th></tr></thead><tbody>');
 for(const x of r.results){const s=x.result?.walk?.summary||x.result?.report.test;
  h.push('<tr><td><b>'+esc(x.symbol)+'</b><small>'+esc(x.asOf||x.error)+' · '+esc(x.sector)+'</small></td><td>'+fmt(x.result?.threshold,3)+'</td><td>'+(s?s.flagged+' / '+s.n:'Indisponibil')+'</td><td>'+(s?fmt(s.rate*100)+'%':'—')+'</td><td>'+(s?s.uncertain:'—')+'</td></tr>');
 }
 h.push('</tbody></table></div><section class="cards">');
 for(const x of evaluated){const result=x.result;
  h.push('<article class="card"><span class="eyebrow">'+esc(x.sector)+'</span><h2>'+esc(x.symbol)+'</h2><p class="meta">'+x.bars+' bare · '+x.observations+' observații · EOD '+esc(x.asOf)+'. Fiecare fereastră fixează pragul pe trecut înaintea testului.</p><span class="tag '+(result.quality.informative?'':'warn')+'">'+(result.quality.informative?'Istoric variabil pentru detecție':'Interpretare neconcludentă')+'</span><p class="meta">În antrenarea recentă variază '+result.quality.variable+'/6 indicatori. Nu există etichete externe care să confirme că depășirile sunt anomalii reale.</p><details><summary>Compară ferestrele de test</summary><div class="table-wrap"><table><thead><tr><th>Test</th><th>Depășiri</th><th>Prag fixat anterior</th><th>Interpretări de graniță</th></tr></thead><tbody>');
  for(const f of result.walk?.folds||[{periods:result.report.periods,test:result.report.test,threshold:result.threshold}])h.push('<tr><td>'+day(f.periods.test.from)+' → '+day(f.periods.test.to)+'</td><td>'+f.test.flagged+' / '+f.test.n+'</td><td>'+fmt(f.threshold,3)+'</td><td>'+f.test.uncertain+'</td></tr>');
  h.push('</tbody></table></div><p class="meta">Pragurile diferă între ferestre deoarece perioadele de referință diferă. Rata de depășire nu reprezintă acuratețe sau rată de alarme false.</p></details></article>');
 }
 h.push('</section><p><a class="download" href="../docs/isolation-validation-latest.json" download>Raport JSON Isolation Forest</a></p>');root.innerHTML=h.join('');
}catch(error){status.textContent='Raport Isolation Forest indisponibil';date.textContent=error.message;root.innerHTML='<p>Demo-ul și analiza locală rămân accesibile.</p>';}
})();
