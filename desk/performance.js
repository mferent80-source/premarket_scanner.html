(function(g){
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,c='',digits=2)=>Number.isFinite(n)?n.toLocaleString('ro-RO',{maximumFractionDigits:digits})+(c?' '+c:''):'—';
const signed=(n,c)=>Number.isFinite(n)?(n>0?'+':'')+fmt(n,c):'—';
function prepare(source,{simulation=false}={}){
 const broker=source==='broker';$('performanceScope').textContent=broker?(simulation?'DEMO FICTIV · EXECUȚII SIMULATE T212':'TRADING 212 INVEST · EXECUȚII REALE'):'SHADOW ANALYTICS · NUMAI SIMULĂRI ÎNCHISE';
 $('brokerPerformance').hidden=!broker;$('strategyPerformance').hidden=broker;$('performanceFilters').hidden=!broker;
 $('perfClosedLabel').textContent=broker?'VÂNZĂRI CU P&L':'CLOSED';$('perfWinLabel').textContent=broker?'WIN RATE · VÂNZĂRI':'WIN RATE';$('perfPnlLabel').textContent=broker?'P&L REALIZAT BROKER':'TOTAL P&L';$('perfAvgLabel').textContent=broker?'MEDIE / VÂNZARE':'AVG R';
 document.querySelectorAll('[data-performance-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.performanceSource===source)));
 if(!broker)$('performanceStatus').textContent='Rezultatele planurilor Shadow sunt păstrate separat de execuțiile reale. P&L în USD; R folosește riscul inițial documentat.';
}
function render(r,{simulation=false,limit=20}={}){
 const c=r.currency;const select=$('performanceCurrency'),options=r.currencies.length?r.currencies:[c||''];
 const markup=options.map(v=>'<option value="'+esc(v)+'">'+esc(v||'Monedă necunoscută')+'</option>').join('');if(select.innerHTML!==markup)select.innerHTML=markup;select.value=c||'';
 $('perfClosed').textContent=r.count;$('perfClosed').title='Execuții SELL cu P&L raportat. O vânzare parțială este o ieșire, nu o poziție complet închisă.';
 $('perfWinRate').textContent=r.winRate===null?'—':fmt(r.winRate)+'%';$('perfPnl').textContent=signed(r.total,c);$('perfAvgR').textContent=signed(r.average,c);$('perfFactor').textContent=r.factor===Infinity?'∞':fmt(r.factor);
 $('perfPnl').className=r.total===null?'':r.total>=0?'positive':'negative';$('perfAvgR').className=r.average===null?'':r.average>=0?'positive':'negative';
 $('perfSample').textContent=r.count<5?'EȘANTION MIC · '+r.count+'/5':'EȘANTION '+r.count+' VÂNZĂRI';
 const time=r.fetchedAt?new Date(r.fetchedAt).toLocaleString('ro-RO'):'nicio citire';
 $('performanceStatus').textContent=(simulation?'DEMO FICTIV · ':'')+(r.state==='missing'?r.reason:(r.syncStatus==='loading'?'Import în curs':r.state==='error'?'Sincronizare întreruptă':r.complete?'Istoricul disponibil este importat integral':'Istoric parțial')+' · '+time+(r.stale?' · verifică o sincronizare nouă':''))+(r.rejected?' · '+r.rejected+' execuții incompatibile excluse':'')+(r.conflicts?' · '+r.conflicts+' identificatori contradictorii excluși':'');
 $('perfRead').innerHTML='<b>'+esc(r.state==='missing'?'Aștept importul Trading 212':r.count?'Rezultatele execuțiilor importate':'Încă nu există vânzări cu rezultat verificat')+'</b>'+esc(r.state==='missing'?r.reason:'Win rate și profit factor descriu execuțiile SELL cu P&L raportat în moneda selectată. Vânzările parțiale sunt incluse ca ieșiri; nu sunt numărate drept poziții închise.')+(r.missing?'<br>'+esc(r.missing+' vânzări fără P&L sau monedă verificată; excluse din calcule.'):'');
 $('brokerBuys').textContent=r.buys;$('brokerSells').textContent=r.sells;$('brokerPositions').textContent=r.positions===null?'—':r.positions;
 $('brokerPerformanceNote').textContent='P&L este valoarea raportată de broker; taxele și FX sunt arătate separat, fără o a doua scădere. Depunerile și dividendele nu intră în acest rezultat. R și clasificarea Long/Reversal necesită stopul și strategia documentate la intrare.'+(r.unsupported?' '+r.unsupported+' operații cu tip neverificat sau evenimente corporative sunt vizibile, dar excluse din statisticile de tranzacționare.':'');
 const host=$('brokerPerformanceRows');
 host.innerHTML=r.rows.length?r.rows.slice(0,limit).map(x=>'<tr><td>'+esc(new Date(x.date).toLocaleString('ro-RO'))+'</td><td><b>'+esc(x.ticker)+'</b></td><td>'+esc(x.side)+(x.type!=='TRADE'?'<small>'+esc(x.type||'Tip neverificat')+'</small>':'')+'</td><td>'+esc(fmt(x.quantity,'',6))+'</td><td>'+esc(fmt(x.price,x.priceCurrency,6))+'</td><td class="'+(x.realized>0?'positive':x.realized<0?'negative':'')+'">'+esc(x.side==='SELL'?(x.currency?signed(x.realized,x.currency):'Monedă neverificată'):'—')+'</td><td>'+esc(x.taxes===null?'Costuri neverificate':x.taxes.length?x.taxes.map(t=>t.name+': '+fmt(t.quantity,t.currency,6)).join(' · '):'Fără costuri raportate')+(x.fxRate!==null?'<small>'+esc('FX raportat: '+fmt(x.fxRate,'',6))+'</small>':'')+'</td></tr>').join(''):'<tr><td colspan="7">'+esc(r.state==='missing'?r.reason:'Nicio execuție pentru perioada și moneda selectate.')+'</td></tr>';
 $('brokerMore').hidden=r.rows.length<=limit;$('brokerRowsCount').textContent=Math.min(limit,r.rows.length)+' / '+r.rows.length+' execuții';
}
g.TTDeskPerformance={prepare,render};
})(window);
