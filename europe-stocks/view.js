(function(g){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('ro-RO',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const signed=n=>Number.isFinite(n)?(n>0?'+':'')+fmt(n,1)+'%':'—';
  const stateNames={ARMED:'Criterii îndeplinite',EARLY:'Early · monitorizare',WATCH:'Indice neverificat',BLOCKED:'Governor blocat'};
  const setupNames={CONFIRMED:'Prag depășit la închidere',WAIT:'Așteaptă confirmarea',EXTENDED:'Preț extins',INVALID:'Plan indisponibil'};
  const date=(t,zone)=>g.DailySeries.date(t,zone);
  function metric(label,value){return '<div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>';}
  function context(c,scope){
    if(!c?.count)return '<h2>Context Salt Europa</h2><p>Nicio serie comparabilă pentru acest filtru.</p>';
    const labels={FAVORABLE:'Favorabil',DEFENSIVE:'Defensiv',MIXED:'Mixt',PARTIAL:'Acoperire parțială',UNAVAILABLE:'Indisponibil'};
    function table(rows,market){return '<div class="table-wrap"><table><thead><tr><th>'+(market?'Bursa':'Sector')+'</th><th>Acțiuni</th><th>Peste EMA50</th><th>Medie 20z</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(market?g.EuropeUniverse.markets[r.name]?.name||r.name:r.name)+(r.count<5?'<small>Eșantion mic</small>':'')+'</td><td>'+r.count+'</td><td>'+fmt(r.above50,0)+'%</td><td>'+signed(r.ret20)+'</td></tr>').join('')+'</tbody></table></div>';}
    return '<div class="section-title"><h2>Context Salt Europa</h2><span class="badge '+(c.regime==='FAVORABLE'?'armed':'watch')+'">'+labels[c.regime]+'</span></div><p>'+esc(scope)+' · EOD '+esc(c.asOf)+' · '+c.count+' / '+c.total+' acțiuni comparabile. Fiecare acțiune are aceeași pondere.</p>'
      +'<div class="context-metrics">'+metric('Peste EMA50',fmt(c.above50,0)+'%')+metric('Peste EMA21',fmt(c.above21,0)+'%')+metric('În creștere în ultima sesiune',fmt(c.advancing,0)+'%')+'</div>'
      +'<details><summary>Burse și sectoare · vezi forța pieței</summary><div class="context-tables">'+table(c.markets,true)+table(c.sectors,false)+'</div><p>Regim favorabil: minimum 60% peste EMA50 și minimum 50% în creștere în ultima sesiune. Defensiv: sub 40% peste EMA50. Sub 80% acoperire: context parțial. Eșantioanele sub 5 acțiuni necesită prudență.</p></details>';
  }
  function chart(x){
    const bars=x.chart||[];if(bars.length<2)return '<p>Grafic indisponibil.</p>';
    const plan=x.plan,levels=[{key:'trigger',label:'Confirmare',value:plan.trigger},{key:'stop',label:'Stop',value:plan.stop},{key:'target',label:'Rezistență',value:plan.target}].filter(l=>Number.isFinite(l.value));
    const values=bars.flatMap(b=>[b.c,b.ema21,b.ema50]).filter(Number.isFinite).concat(levels.map(l=>l.value));
    const lo=Math.min(...values),hi=Math.max(...values),range=hi-lo||1;
    const px=i=>14+i*460/(bars.length-1),py=v=>190-(v-lo)/range*168;
    function points(key){return bars.filter(b=>Number.isFinite(b[key])).map(b=>px(bars.indexOf(b)).toFixed(2)+','+py(b[key]).toFixed(2)).join(' ');}
    return '<div class="chart-legend"><span class="chart-price">Preț</span><span class="chart-ema21">EMA21</span><span class="chart-ema50">EMA50</span></div>'
      +'<svg class="price-chart" viewBox="0 0 560 218" role="img" aria-label="'+esc(x.symbol)+' · preț, EMA21, EMA50 și nivelurile planului pe '+bars.length+' sesiuni încheiate">'
      +levels.map(l=>'<line class="level-'+l.key+'" x1="14" x2="475" y1="'+py(l.value).toFixed(2)+'" y2="'+py(l.value).toFixed(2)+'"/><text x="480" y="'+(py(l.value)+4).toFixed(2)+'">'+esc(l.label)+'</text>').join('')
      +'<polyline class="ema50" points="'+points('ema50')+'"/><polyline class="ema21" points="'+points('ema21')+'"/><polyline class="close" points="'+points('c')+'"/>'
      +'<circle id="chartPoint" cx="'+px(bars.length-1).toFixed(2)+'" cy="'+py(bars.at(-1).c).toFixed(2)+'" r="4"/>'
      +'<text x="14" y="213">'+esc(date(bars[0].t,x.sourceTimezone))+'</text><text x="385" y="213">'+esc(x.sourceDate)+'</text></svg>'
      +'<label class="chart-cursor">Explorează sesiunea<input id="chartCursor" type="range" min="0" max="'+(bars.length-1)+'" value="'+(bars.length-1)+'" data-low="'+lo+'" data-span="'+range+'"></label><p id="chartReadout">'+esc(x.sourceDate)+' · '+fmt(bars.at(-1).c)+' '+esc(x.currency)+'</p>';
  }
  function earnings(e,x){
    const labels={confirmed:'Confirmată de sursă',estimated:'Estimată de sursă',reported:'Raportată · confirmare neprecizată',unknown:'Dată necunoscută',stale:'Calendar vechi'};
    return '<div id="earningsPanel" class="earnings-box '+(e.near?'near':'')+'"><h3>Rezultate financiare</h3><b>'+esc(e.dates?.join(' – ')||'—')+'</b><p>'+esc(labels[e.status]||labels.unknown)+(Number.isFinite(e.days)?' · '+e.days+' zile':'')+'</p>'
      +(e.near?'<p class="earnings-warning">Raportare în următoarele 7 zile. Include riscul de gap în evaluarea planului.</p>':'')
      +(e.reason?'<p>'+esc(e.reason)+'</p>':'')
      +'<a href="'+esc(e.sourceUrl||'https://finance.yahoo.com/quote/'+encodeURIComponent(x.symbol)+'/')+'" target="_blank" rel="noopener noreferrer">Calendarul instrumentului ↗</a>'
      +(e.checkedAt?'<small>Verificat '+esc(e.checkedAt.slice(0,10))+' · aceeași identitate ISIN. Marcajul de confirmare aparține sursei, nu băncii.</small>':'')+'</div>';
  }
  function riskForm(x,settings){
    const p=x.plan,entry=p.state==='CONFIRMED'?x.price:p.entryHigh;
    return '<details class="risk-panel" open><summary>Calculează cantitatea și riscul</summary><p>Buget și pierdere până la stop, în moneda aleasă. Completează costurile totale estimate pentru intrare și ieșire, inclusiv FX și spread.</p>'
      +'<form id="riskForm" class="risk-form"><label>Moneda bugetului<select id="riskCurrency">'+g.EuropeFinance.codes.map(c=>'<option'+(c===(settings.currency||'EUR')?' selected':'')+'>'+c+'</option>').join('')+'</select></label>'
      +'<label>Buget alocat<input id="riskBudget" type="number" min="0.01" step="any" inputmode="decimal" placeholder="ex. 1000" value="'+esc(settings.budget||'')+'" required></label>'
      +'<label>Pierdere până la stop<input id="riskLoss" type="number" min="0.01" step="any" inputmode="decimal" placeholder="ex. 20" value="'+esc(settings.loss||'')+'" required></label>'
      +'<label>Costuri totale estimate<input id="riskFees" type="number" min="0" step="any" inputmode="decimal" placeholder="inclusiv FX și spread" value="'+esc(settings.fees??'')+'" required></label>'
      +'<label>Intrare · '+esc(x.currency)+'<input id="riskEntry" type="number" min="0.0001" step="any" inputmode="decimal" value="'+(Number.isFinite(entry)?Number(entry.toFixed(4)):'')+'" required></label>'
      +'<label>Cantitate minimă<select id="riskStep"><option value="whole"'+(!settings.fractional?' selected':'')+'>Acțiuni întregi</option><option value="fractional"'+(settings.fractional?' selected':'')+'>Fracțiuni · 0,001</option></select></label>'
      +'<button class="primary" type="submit">Calculează planul</button></form><div id="riskResult" role="status" aria-live="polite"><p>Setările rămân local până la activarea sincronizării PC ↔ telefon. Selectează fracțiuni numai dacă instrumentul permite această cantitate în bancă.</p></div></details>';
  }
  function detail(x,{stale=false,earnings:e,settings={}}){
    const p=x.plan;
    return '<div class="detail-top"><span class="kicker">'+esc(g.EuropeModel.categories[x.category].name)+'</span><button id="closeDetail" class="mobile-only" aria-label="Închide analiza">Închide</button></div><h2>'+esc(x.symbol)+'</h2><p>'+esc(x.name)+' · '+esc(x.exchange)+'</p><p>ISIN '+esc(x.isin)+' · Salt Bank, pagina '+esc(x.sourcePage)+'</p><p class="price">'+fmt(x.price)+' '+esc(x.currency)+'</p><p>EOD '+esc(x.sourceDate)+' · '+esc(x.sourceTimezone)+'</p>'
      +'<p class="score-label">Scor tehnic '+x.score+'/100 · '+esc(stale?'SCANARE EXPIRATĂ':stateNames[x.state])+'</p>'+chart(x)
      +'<div class="detail-grid">'+metric('RS vs '+x.index,signed(x.rs))+metric('RSI 14',fmt(x.rsi,1))+metric('Față de EMA21',signed(x.ext))+metric('Revenire din minim 60z',signed(x.bounce))+metric('Rulaj mediu 20z',fmt(x.turnover,0)+' '+x.currency)+metric('Volum relativ',fmt(x.rvol)+'×')+'</div>'
      +'<h3>De ce apare în listă</h3><p>'+esc(x.reason)+'</p><details class="score-details"><summary>Vezi calculul scorului · '+x.score+'/100</summary><ul>'+(x.scoreParts||[]).map(part=>'<li><span>'+esc(part.label)+'</span><b>'+part.points+' / '+part.max+'</b></li>').join('')+'<li><span>Ajustare fixă a modelului</span><b>'+x.scoreAdjustment+'</b></li></ul><p>Punctele sunt adunate, ajustate și limitate la 0–100. Scorul ordonează criterii; nu este probabilitate și nu măsoară randamentul viitor.</p></details>'
      +'<div class="structural-plan"><h3>Plan structural · '+esc(x.currency)+'</h3><span class="badge '+(p.state==='CONFIRMED'?'armed':'watch')+'">'+esc(setupNames[p.state])+'</span><p>'+esc(p.reason)+'</p><div class="levels">'
      +'<div><span>Prag de confirmare · maxim 10z + tampon</span><b>'+fmt(p.trigger)+'</b></div><div><span>Zonă condițională de intrare</span><b>'+fmt(p.entryLow)+' – '+fmt(p.entryHigh)+'</b></div><div><span>Suport · '+(p.supportKind==='pivot'?'pivot confirmat':'minim 10 sesiuni')+'</span><b>'+fmt(p.support)+'</b></div><div><span>Stop · sub suport + tampon</span><b>'+fmt(p.stop)+'</b></div><div><span>Rezistența următoare</span><b>'+fmt(p.target)+'</b></div><div><span>R/R până la rezistență · intrare la limita zonei</span><b>'+(p.rr!==null?fmt(p.rr)+'R':'Neverificat')+'</b></div></div><p>'+esc(p.invalidation)+'</p><p class="plan-note">'+esc(x.planNote)+'</p></div>'
      +earnings(e||{status:'unknown'},x)+riskForm(x,settings)+'<h3>Verificări înainte de decizie</h3><ul>'+(stale?'<li>Scanarea a expirat; rulează din nou înainte de analiză.</li>':'')+x.checks.map(t=>'<li>'+esc(t)+'</li>').join('')+(x.normalizedPence?'<li>Prețurile sursei în pence au fost convertite în GBP.</li>':'')+'<li>Prețul și cursul la execuție, gap-urile și lichiditatea din Salt Bank trebuie comparate cu planul.</li></ul><button class="detail-action" id="watchlistBtn">'+(g.WL?.has(x.symbol)?'✓ În Watchlist · elimină':'+ Adaugă în Watchlist')+'</button><a class="detail-action" href="https://finance.yahoo.com/quote/'+encodeURIComponent(x.symbol)+'/" target="_blank" rel="noopener noreferrer">Deschide graficul și sursa ↗</a>';
  }
  function riskResult(r,rate,x){
    if(!r.ok)return '<p class="risk-error">'+esc(r.reason)+'</p>';
    return '<div class="detail-grid">'+metric('Cantitate estimată',fmt(r.quantity,r.step===1?0:3))+metric('Expunere',fmt(r.notional)+' '+r.currency)+metric('Buget utilizat · cu costuri',fmt(r.total)+' '+r.currency)+metric('Risc până la stop · cu costuri',fmt(r.risk)+' '+r.currency)+metric('Rezultat la rezistență · cu costuri',r.reward!==null?fmt(r.reward)+' '+r.currency:'Neverificat')+metric('Raport rezultat / risc',r.rr!==null?fmt(r.rr)+'R':'Neverificat')+'</div>'
      +'<p class="fx-note">'+(rate.sameCurrency?'Aceeași monedă · fără conversie.':'1 '+esc(x.currency)+' = '+fmt(rate.rate,6)+' '+esc(r.currency)+' · referință BCE '+esc(rate.date)+'.')+'</p><p>Estimare la intrarea '+fmt(r.entry)+' '+esc(x.currency)+' și stop '+fmt(r.stop)+' '+esc(x.currency)+'. Costuri introduse: '+fmt(r.fees)+' '+esc(r.currency)+'. FX este menținut constant în scenariu; gap-urile și alunecarea prețului pot crește pierderea.</p>'
      +(x.plan.state!=='CONFIRMED'?'<p class="risk-error">Planul așteaptă confirmare sau prețul este extins; calculul cantității nu confirmă intrarea.</p>':'')+(['BLOCKED','WATCH'].includes(x.state)?'<p class="risk-error">'+esc(stateNames[x.state])+': verificarea semnalului este incompletă sau blocată.</p>':'')+(r.rr!==null&&r.rr<2?'<p class="risk-error">Rezistența oferă mai puțin de 2R după costurile introduse.</p>':'');
  }
  function history(document,error,market='all',sector='all'){
    const entries=document.entries.filter(e=>(market==='all'||e.market===market)&&(sector==='all'||e.sector===sector));
    const stats=g.EuropeHistory.stats(entries);
    const statusNames={ACTIVE:'În monitorizare',INVALIDATED:'Invalidat · suport pierdut',LEFT:'Ieșit din criterii'};
    return '<div class="section-title"><h2>Istoricul semnalelor</h2><span>'+entries.length+' observații urmărite</span></div>'+(error?'<p class="risk-error">'+esc(error)+'</p>':'')
      +'<p>Urmărire din prima sesiune observată, păstrată și la sincronizarea dispozitivelor. Randamentele folosesc închiderile după 5, 10 și 20 de sesiuni, în moneda listării, fără FX și costuri. Sunt observații de preț, nu tranzacții sau profit realizat.</p><details><summary>Rezultate pe categorie · număr de observații și medie</summary><div class="table-wrap"><table><thead><tr><th>Categorie inițială</th><th>5 sesiuni</th><th>10 sesiuni</th><th>20 sesiuni</th></tr></thead><tbody>'+stats.map(s=>'<tr><td>'+esc(g.EuropeModel.categories[s.category].name)+'</td>'+[5,10,20].map(n=>'<td>'+signed(s.outcomes[n].mean)+'<small>n = '+s.outcomes[n].n+'</small></td>').join('')+'</tr>').join('')+'</tbody></table></div><p>Fără observații mature, media rămâne necalculată. Tranzițiile păstrează categoria inițială; aceeași observație nu este numărată de două ori.</p></details>'
      +'<details><summary>Ultimele '+Math.min(entries.length,30)+' semnale · stări și evoluție</summary><div class="history-rows">'+entries.slice(0,30).map(e=>'<article><div><b>'+esc(e.symbol)+'</b><span class="badge">'+esc(statusNames[e.status]||'Neverificat')+'</span>'+(e.confirmedAt?'<span class="badge">Early → confirmat</span>':'')+'</div><p>'+esc(g.EuropeModel.categories[e.category].name)+' · prima sesiune '+esc(e.firstDate)+' · ultima '+esc(e.lastDate)+'</p>'+(e.review?'<p class="risk-error">'+esc(e.review)+'</p>':'')+'<div class="history-outcomes">'+[5,10,20].map(n=>metric(n+' sesiuni',signed(e.outcomes[n]?.pct))).join('')+'</div><small>'+esc(e.transitions.map(t=>t.date+' · '+g.EuropeModel.categories[t.category].name).join(' → '))+'</small></article>').join('')+'</div>'+(!entries.length?'<p>Prima scanare completă va înregistra candidații. Nu se reconstruiesc semnale fictive pentru trecut.</p>':'')+'</details>';
  }
  g.EuropeView={esc,fmt,signed,stateNames,setupNames,context,detail,riskResult,history,earnings};
})(typeof window!=='undefined'?window:globalThis);
