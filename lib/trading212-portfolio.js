/* Read-only attribution of the broker's current holdings. No currency conversion. */
(function(g){
'use strict';
const finite=Number.isFinite,ccy=c=>typeof c==='string'&&/^[A-Z]{3}$/.test(c),quoteCurrency=c=>ccy(c)||c==='GBp';
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,c='',signed=false,d=2)=>finite(n)?(signed&&n>0?'+':'')+new Intl.NumberFormat('ro-RO',{maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<.01?6:d}).format(Object.is(n,-0)?0:n)+(c?' '+c:''):'—';
const pct=(n,signed=false)=>fmt(n,'%',signed);
const tone=n=>!finite(n)?'unknown':n<0?'negative':n>0?'positive':'neutral';
const sum=xs=>{const n=xs.reduce((s,x)=>s+x,0);return finite(n)?n:null;};
function build(positions,summary=null){
 if(!Array.isArray(positions))return {available:false,rows:[],currencies:[],rejected:0,groups:[]};
 const counts=new Map();for(const p of positions)if(p&&finite(p.quantity)&&p.quantity>0&&typeof p.ticker==='string')counts.set(p.ticker,(counts.get(p.ticker)||0)+1);
 let rejected=0;const rows=[];
 for(const p of positions){
  if(p&&p.quantity===0)continue;
  if(!p||typeof p.ticker!=='string'||!p.ticker||p.ticker.length>200||!finite(p.quantity)||p.quantity<=0||counts.get(p.ticker)!==1){rejected++;continue;}
  const currency=ccy(p.currency)?p.currency:null,value=finite(p.value)&&p.value>=0?p.value:null,pnl=currency&&finite(p.unrealized)?p.unrealized:null;
  const average=finite(p.averagePrice)&&p.averagePrice>0?p.averagePrice:null,current=finite(p.currentPrice)&&p.currentPrice>=0?p.currentPrice:null;
  const priceReturn=average!==null&&current!==null&&quoteCurrency(p.instrumentCurrency)?(current/average-1)*100:null;
  const recovery=average!==null&&current>0&&current<average&&quoteCurrency(p.instrumentCurrency)?(average/current-1)*100:null;
  const weight=currency&&summary?.currency===currency&&finite(summary.totalValue)&&summary.totalValue>0&&value!==null?value/summary.totalValue*100:null;
  rows.push({ticker:p.ticker,name:typeof p.name==='string'?p.name:p.ticker,quantity:p.quantity,currency,instrumentCurrency:quoteCurrency(p.instrumentCurrency)?p.instrumentCurrency:null,
   averagePrice:average,currentPrice:current,value,pnl,priceReturn:finite(priceReturn)?priceReturn:null,recovery:finite(recovery)?recovery:null,weight:finite(weight)?weight:null,
   status:pnl===null?'unknown':pnl<0?'loss':pnl>0?'gain':'flat'});
 }
 const currencies=[...new Set(rows.map(p=>p.currency).filter(Boolean))].sort();
 const groups=currencies.map(currency=>{
  const xs=rows.filter(p=>p.currency===currency),known=xs.filter(p=>p.pnl!==null),gains=known.filter(p=>p.pnl>0),losses=known.filter(p=>p.pnl<0);
  const gain=sum(gains.map(p=>p.pnl)),loss=sum(losses.map(p=>p.pnl)),total=sum(known.map(p=>p.pnl)),overflow=[gain,loss,total].some(x=>x===null);
  const complete=!rejected&&rows.every(p=>p.currency===currency&&p.pnl!==null);
  const gap=complete&&!overflow&&summary?.currency===currency&&finite(summary.unrealized)?summary.unrealized-total:null;
  return {currency,count:xs.length,known:known.length,missing:xs.length-known.length,gain,loss,total:known.length||!xs.length?total:null,gains:gains.length,losses:losses.length,flat:known.length-gains.length-losses.length,overflow,complete,gap,
   winners:[...gains].sort((a,b)=>b.pnl-a.pnl||a.ticker.localeCompare(b.ticker)),losers:[...losses].sort((a,b)=>a.pnl-b.pnl||a.ticker.localeCompare(b.ticker))};
 });
 return {available:true,rows,currencies,groups,rejected,unknownCurrency:rows.filter(p=>!p.currency).length,wallet:ccy(summary?.currency)?summary.currency:null};
}
function select(report,{currency=null,filter='all',search='',sort='loss',attention='all',stops={},evolutionFilter='all',evolution={}}={}){
 const needle=String(search).trim().toLocaleLowerCase('ro-RO');
 const rows=(report?.rows||[]).filter(p=>(currency==='unknown'?!p.currency:p.currency===currency)&&(filter==='all'||p.status===filter)&&(attention!=='stop'||['near','crossed'].includes(stops[p.ticker]?.state))&&(evolutionFilter==='all'||(evolution[p.ticker]?.state||'unknown')===evolutionFilter)&&(!needle||(p.ticker+' '+p.name).toLocaleLowerCase('ro-RO').includes(needle)));
 const metric=p=>sort==='return'?p.priceReturn:sort==='value'?p.value:sort==='weight'?p.weight:p.pnl;
 return rows.sort((a,b)=>{const av=metric(a),bv=metric(b);if(av===null||bv===null)return Number(av===null)-Number(bv===null)||a.ticker.localeCompare(b.ticker);return (sort==='loss'?av-bv:bv-av)||a.ticker.localeCompare(b.ticker);});
}
const pair=(label,value)=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>';
function summaryMarkup(report,currency){
 if(!report?.available)return '<p>Pozițiile nu au putut fi actualizate. Sincronizează din nou.</p>';
 if(!report.rows.length&&!report.rejected)return '<p>Nicio poziție deschisă raportată de broker.</p>';
 const group=report.groups.find(x=>x.currency===currency);
 if(!group)return '<p>P&amp;L indisponibil pentru moneda selectată. Pozițiile fără monedă nu intră în totaluri.'+(report.rejected?' '+report.rejected+' înregistrări incompatibile excluse.':'')+'</p>';
 const metrics=[['Pe pierdere',group.loss,group.losses+' poziții','negative'],['Pe câștig',group.gain,group.gains+' poziții','positive'],['Rezultat cumulat · deschise',group.total,group.known+'/'+group.count+' cu P&L raportat',tone(group.total)]];
 const top=(label,xs,total,cls)=>'<section class="ranking"><h3>'+label+'</h3>'+(xs.length?'<ol>'+xs.slice(0,3).map(p=>{
  const share=finite(total)&&total!==0?Math.abs(p.pnl/total)*100:null;
  return '<li><button class="rank-position '+cls+'" type="button" data-position="'+esc(p.ticker)+'" aria-label="Arată poziția '+esc(p.ticker)+'"><span><b>'+esc(p.name)+'</b><small>'+esc(p.ticker)+'</small></span><span><strong>'+esc(fmt(p.pnl,currency,true))+'</strong><small>'+esc(pct(share))+' din '+(cls==='negative'?'pierderile':'câștigurile')+' raportate</small></span></button></li>';
 }).join('')+'</ol>':'<p>Nicio poziție '+(cls==='negative'?'pe pierdere':'pe câștig')+' cu P&amp;L raportat.</p>')+'</section>';
 const notes=[];
 if(group.missing||report.unknownCurrency||report.rejected)notes.push('Acoperire parțială: '+group.missing+' fără P&L în '+currency+', '+report.unknownCurrency+' fără monedă și '+report.rejected+' înregistrări incompatibile excluse.');
 if(group.overflow)notes.push('Totalurile depășesc limitele numerice; sumele cumulate nu pot fi afișate.');
 if(finite(group.gap)&&Math.abs(group.gap)>.02+.005*group.count)notes.push('Diferență față de P&L-ul sumarului: '+fmt(group.gap,currency,true)+'. Citirile pot avea momente diferite; verifică prin sincronizare.');
 return '<div class="attribution-metrics">'+metrics.map(([label,n,note,cls])=>'<div class="metric"><small>'+esc(label)+'</small><b class="'+cls+'">'+esc(fmt(n,currency,true))+'</b><small>'+esc(note)+'</small></div>').join('')+'</div><p class="note">Totaluri pentru '+esc(currency)+' · '+group.flat+' la zero. Sumele descriu pozițiile deschise, nu rezultatul de azi. Filtrele de mai jos schimbă lista, nu aceste totaluri.</p>'+(notes.length?'<p class="coverage" role="status">'+esc(notes.join(' '))+'</p>':'')+'<div class="rankings">'+top('Cele mai mari pierderi',group.losers,group.loss,'negative')+top('Cele mai mari câștiguri',group.winners,group.gain,'positive')+'</div>';
}
function positionsMarkup(report,options){
 const rows=select(report,options),group=report.groups.find(x=>x.currency===options.currency);
 const labels={loss:'Pe pierdere',gain:'Pe câștig',flat:'La zero',unknown:'P&L indisponibil'};
 return {rows,html:rows.length?rows.map(p=>{
  const share=p.status==='loss'&&group?.loss<0?p.pnl/group.loss*100:p.status==='gain'&&group?.gain>0?p.pnl/group.gain*100:null;
  const mismatch=p.pnl<0&&p.priceReturn>0||p.pnl>0&&p.priceReturn<0;
  return '<article class="card position-card '+p.status+'"><header><h3>'+esc(p.name)+'</h3><small>'+esc(p.ticker)+'</small><span class="position-state '+tone(p.pnl)+'">'+labels[p.status]+'</span></header><div class="position-result"><small>P&amp;L nerealizat · cont</small><strong class="'+tone(p.pnl)+'">'+esc(fmt(p.pnl,p.currency,true))+'</strong></div>'+(g.HoldingEvolution?g.HoldingEvolution.jointMarkup(options.evolution?.[p.ticker]):'')+'<dl>'+pair('Variație preț · fără FX',pct(p.priceReturn,true))+pair('Valoare în cont',p.currency?fmt(p.value,p.currency):'Monedă indisponibilă')+pair('Pondere din cont',pct(p.weight))+pair(p.status==='loss'?'Parte din pierderile raportate':p.status==='gain'?'Parte din câștigurile raportate':'Contribuție la rezultate',pct(share))+'</dl>'+(p.recovery!==null?'<p class="recovery">Creștere până la prețul mediu: <b>'+esc(pct(p.recovery,true))+'</b></p>':'')+(mismatch?'<p class="coverage">Prețul și P&amp;L-ul în cont au semne diferite. Verifică impactul valutar și costurile în broker.</p>':'')+'<details><summary>Prețuri și cantitate</summary><dl>'+pair('Cantitate',fmt(p.quantity,'',false,6))+pair('Preț mediu',fmt(p.averagePrice,p.instrumentCurrency,false,6))+pair('Preț raportat',fmt(p.currentPrice,p.instrumentCurrency,false,6))+'</dl><p class="note">Variația și revenirea la medie folosesc prețurile în moneda instrumentului; nu includ FX, comisioane sau taxe. Revenirea la medie nu estimează timpul necesar.</p></details>'+(options.daily?.[p.ticker]&&g.T212Daily?g.T212Daily.markup(options.daily[p.ticker]):'')+(options.stops?.[p.ticker]&&g.HoldingsPulse?g.HoldingsPulse.stopMarkup(options.stops[p.ticker]):'')+(options.history&&g.PositionHistory?'<details class="position-history-disclosure"><summary>Explorează istoricul poziției</summary>'+g.PositionHistory.markup(options.history.data,{scope:options.history.scope,environment:options.history.environment,position:{...p,unrealized:p.pnl},at:options.history.at})+'</details>':'')+(options.analysis?'<div class="position-actions">'+(options.preview?'<button data-analyze-demo>Vezi exemplu de analiză</button>':'<button data-analyze-position="'+esc(p.ticker)+'">Analizează această poziție →</button>')+'</div>':'')+'</article>';
 }).join(''):'<p>Nicio poziție pentru filtrele alese.</p>'};
}
function realizedMarkup(report){
 if(!report||report.state==='missing')return '<p>' +esc(report?.reason||'Istoricul vânzărilor se încarcă după conectare.')+'</p>';
 const analysis=g.T212Performance?.analyse(report);
 if(!analysis||analysis.error)return '<p>Rezultatele pe simbol nu pot fi calculate din acest import.</p>';
 const negative=analysis.symbols.filter(x=>x.total<0),positive=[...analysis.symbols].filter(x=>x.total>0).sort((a,b)=>b.total-a.total),flat=analysis.symbols.filter(x=>x.total===0);
 const rows=[...negative,...positive,...flat];
 const states=[report.complete?'Istoricul disponibil a fost parcurs integral':'IMPORT PARȚIAL · totalurile se pot schimba',report.stale?'DATE VECHI · sincronizează contul':'',report.missing?report.missing+' vânzări fără P&L eligibil':'',report.reason||''].filter(Boolean);
 return '<p class="note" role="status">'+esc(states.join(' · '))+'</p><p>'+esc(fmt(report.total,report.currency,true))+' · '+report.count+' execuții SELL cu P&amp;L raportat. Cumpărările și dividendele nu intră în aceste rezultate.</p>'+(rows.length?'<div class="realized-table"><table><caption>Rezultate cumulate ale vânzărilor · '+esc(report.currency)+'</caption><thead><tr><th scope="col">Instrument</th><th scope="col">P&amp;L realizat</th><th scope="col">Execuții SELL</th><th scope="col">Media / execuție</th></tr></thead><tbody>'+rows.map(s=>'<tr><th scope="row">'+esc(s.ticker)+'</th><td class="'+tone(s.total)+'">'+esc(fmt(s.total,report.currency,true))+'</td><td>'+s.count+'</td><td>'+esc(fmt(s.average,report.currency,true))+'</td></tr>').join('')+'</tbody></table></div>':'<p>Nicio vânzare cu P&amp;L eligibil pentru filtrele alese.</p>')+'<p class="note">Vânzările parțiale sunt execuții distincte, nu poziții închise. Folosesc P&amp;L-ul raportat de broker, fără o a doua scădere a costurilor și fără conversia monedelor.</p>';
}
function demo(now=Date.now()){
 const positions=[
  {ticker:'FICTIV_A_US_EQ',name:'Companie fictivă A',quantity:10,averagePrice:100,currentPrice:80,instrumentCurrency:'USD',currency:'EUR',value:720,unrealized:-180},
  {ticker:'FICTIV_B_US_EQ',name:'Companie fictivă B',quantity:8,averagePrice:50,currentPrice:65,instrumentCurrency:'EUR',currency:'EUR',value:520,unrealized:120},
  {ticker:'FICTIV_C_US_EQ',name:'Companie fictivă C',quantity:5,averagePrice:100,currentPrice:110,instrumentCurrency:'USD',currency:'EUR',value:480,unrealized:-20},
  {ticker:'FICTIV_D_US_EQ',name:'Companie fictivă D',quantity:3,averagePrice:80,currentPrice:96,instrumentCurrency:'EUR',currency:'EUR',value:288,unrealized:48},
  {ticker:'FICTIV_E_US_EQ',name:'Companie fictivă E',quantity:2,averagePrice:60,currentPrice:60,instrumentCurrency:'EUR',currency:'EUR',value:120,unrealized:0},
  {ticker:'FICTIV_F_US_EQ',name:'Companie fictivă F · rezultat lipsă',quantity:1,averagePrice:40,currentPrice:42,instrumentCurrency:'EUR',currency:'EUR',value:42,unrealized:null}
 ];
 const summary={currency:'EUR',totalValue:3000,available:830,invested:2170,unrealized:-32,realized:64.5,cost:2202,reserved:0};
 const fill=(id,ticker,result,days)=>({id,orderId:id,ticker,type:'TRADE',side:'SELL',quantity:1,price:100,priceCurrency:'EUR',currency:'EUR',realized:result,date:new Date(now-days*86400000).toISOString(),taxes:[]});
 return {scope:'educational-broker-demo',positions,summary,account:{environment:'live',complete:true,fetchedAt:new Date(now).toISOString(),items:[fill('sim-1','FICTIV_A_US_EQ',-40,2),fill('sim-2','FICTIV_B_US_EQ',80,3),fill('sim-3','FICTIV_A_US_EQ',-10,5),fill('sim-4','FICTIV_D_US_EQ',34.5,40)]}};
}
g.T212Portfolio={build,select,summaryMarkup,positionsMarkup,realizedMarkup,demo,fmt};
})(typeof window!=='undefined'?window:globalThis);
