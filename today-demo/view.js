(function (g) {
 'use strict';
 const DAY=86400000, finite=Number.isFinite;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stamp=x=>typeof x==='number'?x:Date.parse(x);
 const number=(x,digits=2)=>finite(x)?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(x):'—';
 const money=(x,c)=>finite(x)&&/^[A-Z]{3}$/.test(c||'')?number(x)+' '+c:'Neverificat';
 const signed=(x,suffix='%')=>finite(x)?(x>0?'+':'')+number(x)+suffix:'Neverificat';
 const tone=x=>!finite(x)?'muted':x<0?'negative':x>0?'positive':'muted';
 const when=(x,dateOnly=false)=>finite(stamp(x))?new Date(stamp(x)).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest',day:'2-digit',month:'2-digit',...(dateOnly?{}:{hour:'2-digit',minute:'2-digit'})}):'Oră neconfirmată';
 const dateLabel=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?x:when(x,true);
 function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch(_){return null;}}
 function appURL(route,query=''){
  const allowed=['today/','holdings/','broker/','journal/#exec','journal/#desk','candidate-engine/','scanner-verdicts/','app/sync/'];
  if(!allowed.includes(route))return null;
  const p=new URLSearchParams(query);p.set('module',route);return '../app/?'+p.toString();
 }
 function accountState(a,sample){return sample?{text:'Date ilustrative',tone:''}:!a||a.state==='missing'?{text:'Cont neconectat',tone:'warning'}:a.state==='error'?{text:'Citire nereușită',tone:'warning'}:a.state==='partial'?{text:'Citire parțială',tone:'warning'}:!a.fresh?{text:'De actualizat',tone:'warning'}:{text:'Citire recentă',tone:'positive'};}
 function chartMarkup(points,{label='Valoare observată',unit='',sample=false,reason='',source='Sursă neconfirmată'}={}){
  const xs=Array.isArray(points)?points:[];
  if(xs.some(p=>!p||!finite(stamp(p.at))||!finite(p.value))||xs.some((p,i)=>i>0&&stamp(p.at)<=stamp(xs[i-1].at)))return '<div class="chart-empty"><span aria-hidden="true">⌁</span><strong>Seria nu poate fi verificată</strong><p>Orele și valorile trebuie să fie compatibile. Datele originale rămân păstrate.</p></div>';
  if(!xs.length)return '<div class="chart-empty"><span aria-hidden="true">⌁</span><strong>Nu există încă observații confirmate</strong><p>'+esc(reason||'Schimbă intervalul sau actualizează sursa pentru a vedea un grafic bazat pe date.')+'</p></div>';
  const W=700,H=250,L=10,R=68,T=17,B=30,values=xs.map(p=>p.value),low=Math.min(...values),high=Math.max(...values),spread=high-low,pad=spread?spread*.15:Math.max(Math.abs(high)*.025,1),min=low-pad,max=high+pad,start=stamp(xs[0].at),end=stamp(xs.at(-1).at),x=at=>xs.length===1?(W-R+L)/2:L+(stamp(at)-start)/(end-start)*(W-R-L),y=v=>T+(max-v)/(max-min)*(H-T-B),path=xs.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+y(p.value).toFixed(2)).join(' ');
  const ticks=[max,(max+min)/2,min].map(v=>'<g><line class="grid-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="'+(W-R+10)+'" y="'+(y(v)+4)+'">'+esc(number(v,Math.abs(v)>=1000?0:1))+'</text></g>').join('');
  const dates=(xs.length===1?[xs[0]]:[xs[0],xs[Math.floor((xs.length-1)/2)],xs.at(-1)]).map((p,i,all)=>'<text x="'+x(p.at)+'" y="'+(H-6)+'" text-anchor="'+(all.length===1?'middle':i===0?'start':i===all.length-1?'end':'middle')+'">'+esc(when(p.at,true))+'</text>').join('');
  const latest=xs.at(-1),n=xs.length,warning=n===1?'O singură observație: punctul este confirmat; evoluția necesită încă o citire din altă zi. '+reason:reason;
  return '<div class="chart-caption"><span>'+esc(label)+(unit?' · '+esc(unit):'')+'</span><span class="sample-label">'+(sample?'DATE ILUSTRATIVE':n+' OBSERVAȚII')+'</span></div><svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="chartTitle chartDesc"><title id="chartTitle">'+esc(label)+'</title><desc id="chartDesc">'+esc((sample?'Date ilustrative. ':'')+n+' observații. '+warning)+'</desc><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--mint)" stop-opacity=".17"/><stop offset="1" stop-color="var(--mint)" stop-opacity="0"/></linearGradient></defs>'+ticks+(n>1?'<path d="'+path+' L'+x(latest.at).toFixed(2)+','+(H-B)+' L'+x(xs[0].at).toFixed(2)+','+(H-B)+' Z" fill="url(#chartFill)"/><path class="series" d="'+path+'"/>':'')+'<circle class="single-dot" cx="'+x(latest.at)+'" cy="'+y(latest.value)+'" r="5"/>'+dates+'</svg><div class="chart-controls"><input id="chartCursor" type="range" min="0" max="'+(n-1)+'" step="1" value="'+(n-1)+'" aria-label="Alege observația din grafic" aria-valuetext="'+esc(when(latest.at)+' · '+number(latest.value)+' '+unit)+'"'+(n===1?' disabled':'')+'><output id="chartReadout" class="chart-readout" for="chartCursor">'+esc(when(latest.at)+' · '+number(latest.value)+' '+unit)+'</output></div><p class="chart-notice">'+esc(warning)+' '+esc(source)+'</p><details class="chart-data"><summary>Observațiile din grafic · '+n+'</summary><div><table><caption class="skip">'+esc(label)+'</caption><thead><tr><th scope="col">Observație</th><th scope="col">'+esc(unit||'Valoare')+'</th></tr></thead><tbody>'+xs.map(p=>'<tr><td>'+esc(when(p.at))+'</td><td>'+esc(number(p.value))+'</td></tr>').join('')+'</tbody></table></div></details>';
 }
 function fixture(now=Date.now()){
  const points=(base,step,count,scale=1)=>Array.from({length:count},(_,i)=>({at:now-(count-1-i)*DAY,value:Math.round((base+i*step+Math.sin(i*.43)*scale+Math.cos(i*.91)*scale*.35)*100)/100}));
  const curve=points(24800,40,90,290);curve[curve.length-1].value=28340;
  const markets=[['SPY','S&P 500 · ETF SPY','USD','USD',592.44,.64],['QQQ','Nasdaq 100 · ETF QQQ','USD','USD',512.18,.92],['^VIX','Volatilitate · VIX','puncte',null,18.46,-2.31],['^TNX','Randament SUA · 10 ani','%',null,4.18,.36]].map(([symbol,label,unit,currency,price,changePct])=>({symbol,label,unit,currency,price,changePct,asOf:now-DAY,source:'Exemplu de aspect · cotație fictivă',readAt:now,state:'ready',reason:'Date ilustrative',points:points(price*.89,price*.0013,90,price*.006),indicators:{rsi14:58.2,sma50:577.6,distanceSma50:2.57,change20d:3.12}}));
  return {account:{state:'ready',scope:'illustrative',currency:'RON',total:28340,available:3210,invested:25130,unrealized:1120,realized:684,at:now,fresh:true,positions:[{ticker:'ALFA',name:'Poziție ilustrativă A',quantity:12,value:8240,unrealized:425,currency:'RON',weight:29.1},{ticker:'BETA',name:'Poziție ilustrativă B',quantity:8,value:6370,unrealized:-180,currency:'RON',weight:22.5},{ticker:'GAMA',name:'Poziție ilustrativă C',quantity:20,value:5680,unrealized:560,currency:'RON',weight:20},{ticker:'DELTA',name:'Poziție ilustrativă D',quantity:16,value:4840,unrealized:315,currency:'RON',weight:17.1}],points:curve,historyReason:'Valoare totală observată; depunerile și retragerile sunt incluse. Nu este randament.',chartCurrency:'RON',cashWarning:'Graficul include depuneri și retrageri. Nu reprezintă randamentul investițiilor.',newsSymbols:[],issues:[]},market:{items:markets,at:now,breadth:{state:'ready',asOf:now-DAY,stance:null,score:null,coverage:'S&P 500 · exemplu ilustrativ',above50:64.2,above200:59.8,points:points(48,.17,90,5),reason:'Exemplu de participare la piață, fără verdict real.',source:'Exemplu de aspect · date fictive'}},news:{state:'ready',at:now,items:[{title:'Exemplu de aspect: o știre relevantă pentru o poziție din portofoliu',symbol:'ALFA',publisher:'Publicația și ora apar aici',source:'Exemplu de aspect'},{title:'Exemplu de aspect: rezultatele companiei și data următoarei raportări',symbol:'BETA',publisher:'Legătură către articolul original',source:'Exemplu de aspect'},{title:'Exemplu de aspect: un eveniment care poate influența piața',symbol:'PIAȚĂ',publisher:'Sursă verificabilă, fără titluri inventate',source:'Exemplu de aspect'}]},activity:{state:'ready',reason:'Execuții fictive, exclusiv pentru previzualizare.',items:[{id:'demo-1',ticker:'EPSILON',side:'SELL',at:now-DAY,quantity:4,price:142.8,currency:'USD',realized:186.4,realizedCurrency:'RON'},{id:'demo-2',ticker:'ZETA',side:'SELL',at:now-3*DAY,quantity:2,price:88.2,currency:'USD',realized:-42.3,realizedCurrency:'RON'},{id:'demo-3',ticker:'ETA',side:'SELL',at:now-5*DAY,quantity:6,price:53.4,currency:'USD',realized:94.8,realizedCurrency:'RON'}]}};
 }
 g.TodayDashboardUI={appURL,safeURL,chartMarkup,accountState,fixture};
 if(!g.document)return;
 const doc=g.document,$=id=>doc.getElementById(id),ui={mode:'demo',days:30,tab:'account',generation:0,busy:false,model:null,account:null,market:null,news:null,activity:null,chartPoints:[],chartUnit:''};
 const sample=()=>ui.mode==='demo';
 const sourceLabel=(label,at)=>label+(at?' · '+when(at):'');
 const emptyMarket=()=>({items:[['SPY','S&P 500 · ETF SPY','USD'],['QQQ','Nasdaq 100 · ETF QQQ','USD'],['^VIX','Volatilitate · VIX','puncte'],['^TNX','Randament SUA · 10 ani','%']].map(([symbol,label,unit])=>({symbol,label,unit,price:null,changePct:null,state:'loading',source:'Yahoo Finance',points:[],indicators:{}})),breadth:{state:'loading',points:[],reason:'Verific sursa originală S&P 500…'}});
 function renderMode(){
  $('modeLabel').textContent=sample()?'DEMO · DATE ILUSTRATIVE':'DEMO · DATE LOCALE + SURSE PUBLICE';
  $('modeDescription').textContent=sample()?'Propunere pentru Astăzi. Valorile și exemplele de mai jos sunt fictive; pagina actuală rămâne neschimbată.':'Contul este citit local, fără modificări. Piața și știrile folosesc surse publice; actualizarea contului de la broker rămâne separată.';
  $('demoMode').setAttribute('aria-pressed',String(sample()));$('actualMode').setAttribute('aria-pressed',String(!sample()));
  $('refreshButton').disabled=ui.busy;
  $('refreshButton').setAttribute('aria-label',sample()?'Reafișează datele ilustrative':'Recitește datele locale și actualizează sursele publice');
 }
 function renderAccount(){
  const a=ui.account||{},state=accountState(a,sample());$('accountState').textContent=state.text;$('accountState').className='badge '+state.tone;
  const amount=finite(a.total)?'<div class="account-total">'+esc(number(a.total))+'<small>'+esc(a.currency||'')+'</small></div>':'<div class="account-total">'+esc(a.state==='error'?'Citire nereușită':a.state==='partial'?'Cont parțial':'Conectează contul')+'</div>';
  const asof=sample()?'Valoare fictivă · previzualizare de design':a.at?'Ultima citire '+when(a.at)+' · București'+(!a.fresh?' · de actualizat':''):'Valoarea contului nu este încă disponibilă pe acest dispozitiv.';
  $('accountSummary').innerHTML='<div>'+amount+'<p class="account-asof">'+esc(asof)+'</p></div><a class="account-link" href="'+appURL('broker/')+'">'+(sample()?'Conexiunea Trading 212 ↗':'Actualizează contul ↗')+'</a>';
  const metrics=[['Disponibil',a.available,'Capital neinvestit',false],['Valoare investită',a.invested,'Raportată de broker',false],['P&L nerealizat',a.unrealized,'Poziții deschise · total',true],['P&L realizat',a.realized,'Total raportat · nu zilnic',true]];
  $('accountMetrics').innerHTML=metrics.map(([label,v,note,color])=>'<div><span class="metric-label">'+esc(label)+'</span><span class="metric-value '+(color?tone(v):'')+'">'+esc(finite(v)&&a.currency?(color&&v>0?'+':'')+number(v)+' '+a.currency:'Neverificat')+'</span><span class="metric-note">'+(sample()?'Date ilustrative · ':'')+esc(note)+'</span></div>').join('');
  $('accountSource').textContent=sample()?'DATE ILUSTRATIVE · fără legătură cu soldul tău':sourceLabel('Trading 212 Invest · copie locală',a.at);
 }
 function renderMarket(){
  $('marketStrip').innerHTML=(ui.market?.items||[]).map(m=>{const confirmed=finite(m.price),unit=m.unit==='USD'?' USD':m.unit==='%'?'%':m.unit==='puncte'?' puncte':'';return '<article class="market-tile"><div class="market-tile-head"><h2>'+esc(m.label)+'</h2>'+(sample()?'<span class="sample-label">ILUSTRATIV</span>':'')+'</div><div class="market-quote">'+(confirmed?esc(number(m.price)+unit):'<span style="font:12px var(--sans);letter-spacing:0">'+(m.state==='loading'?'Se verifică…':'Indisponibil')+'</span>')+(confirmed&&m.symbol!=='^TNX'?'<small class="'+(m.symbol==='^VIX'?'muted':tone(m.changePct))+'">'+esc(signed(m.changePct))+'</small>':'')+'</div><p class="source-note">'+esc(sample()?'Date fictive · exemplu de aspect':confirmed?(m.state==='stale'?'DE REVERIFICAT · ':'')+'EOD '+dateLabel(m.asOf)+' · '+m.source:m.state==='loading'?'Yahoo Finance · sesiuni încheiate':m.reason||'Sursa nu a putut fi confirmată')+'</p></article>';}).join('');
  const b=ui.market?.breadth||{},hasBreadth=finite(b.above50),contextState=b.state==='stale'?'Date breadth de reverificat':hasBreadth?b.above50>=50?'Participare peste jumătate':'Participare sub jumătate':b.state==='loading'?'Verific sursele pieței…':'Context parțial disponibil';
  $('marketContext').innerHTML='<h3 class="context-verdict">'+esc(contextState)+'</h3><p class="context-text">'+esc(sample()?'Un exemplu de context util: câte acțiuni participă la mișcarea pieței, alături de indicii principali.':hasBreadth?'Ponderea din seria originală S&P 500 peste media pe 50 de sesiuni. '+(b.state==='stale'?'Ultima valoare disponibilă, nu context actual.':b.reason||''):b.reason||'Datele lipsă nu sunt interpretate ca un semnal pozitiv sau negativ.')+'</p>'+(hasBreadth?'<div class="participation"><span>Peste SMA 50</span><b>'+esc(number(b.above50,1))+'%</b></div><div class="participation-bar" role="meter" aria-label="S&P 500 peste SMA 50" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.max(0,Math.min(100,b.above50))+'"><span style="width:'+Math.max(0,Math.min(100,b.above50))+'%"></span></div><p class="source-note">'+esc(sample()?'DATE ILUSTRATIVE · niciun verdict de piață real':b.source+' · '+dateLabel(b.asOf)+' · '+b.coverage)+'</p>':'');
  const spy=ui.market?.items?.find(x=>x.symbol==='SPY'),ind=spy?.indicators||{},indicators=[['SPY · RSI 14',ind.rsi14,'Wilder · închideri EOD',''],['SPY vs SMA 50',ind.distanceSma50,'Distanță față de medie','%'],['SPY · 20 sesiuni',ind.change20d,'Variație de preț','%']];
  $('technicalIndicators').innerHTML=indicators.map(([label,v,detail,suffix])=>'<div><span class="indicator-label">'+esc(label)+'</span><span class="indicator-value '+(suffix?tone(v):'')+'">'+esc(finite(v)?suffix?signed(v):number(v,1):'—')+'</span><span class="indicator-detail">'+esc(finite(v)?detail:spy?.state==='loading'?'Se verifică':'Date insuficiente')+'</span></div>').join('');
  $('indicatorSource').textContent=sample()?'DATE ILUSTRATIVE · indicatori fictivi':spy?.asOf?'Yahoo Finance · EOD '+dateLabel(spy.asOf)+' · indicatori descriptivi, fără verdict automat':'Indicatorii SPY necesită o serie EOD verificată. Amploarea pieței rămâne o sursă separată.';
 }
 function chartConfig(){
  const cutoff=Date.now()-ui.days*DAY;
  let points=[],label,unit,reason,source;
  if(ui.tab==='account'){points=ui.account?.points||[];label='Valoarea contului observată';unit=ui.account?.chartCurrency||ui.account?.currency||'';reason=ui.account?.cashWarning||'Depunerile și retragerile sunt incluse; nu este randament.';if(points.length<2)reason=(ui.account?.historyReason||'')+' '+reason;source=sample()?'Date ilustrative.':'Trading 212 · observații locale la sincronizare.';}
  else if(ui.tab==='SPY'){const m=ui.market?.items?.find(x=>x.symbol==='SPY');points=m?.points||[];label='SPY · închideri de sesiune';unit='USD';reason=m?.reason||'Aștept seria EOD confirmată.';source=sample()?'Date ilustrative.':m?.source||'Yahoo Finance';}
  else{const b=ui.market?.breadth;points=b?.points||[];label='S&P 500 peste SMA 50';unit='%';reason=b?.reason||'Aștept seria originală de participare la piață.';source=sample()?'Date ilustrative.':b?.source||'Market Breadth · seria originală';}
  points=points.filter(p=>!finite(stamp(p.at))||stamp(p.at)>=cutoff);
  return {points,label,unit,reason,source,sample:sample()};
 }
 function renderChart(){
  const c=chartConfig();ui.chartPoints=c.points;ui.chartUnit=c.unit;$('chartHost').innerHTML=chartMarkup(c.points,c);
  for(const b of doc.querySelectorAll('[data-chart-tab]'))b.setAttribute('aria-pressed',String(b.dataset.chartTab===ui.tab));
  for(const b of doc.querySelectorAll('[data-period]'))b.setAttribute('aria-pressed',String(Number(b.dataset.period)===ui.days));
 }
 function renderNews(){
  const n=ui.news||{},items=sample()?n.items||[]:(n.items||[]).filter(x=>safeURL(x.url)&&typeof x.title==='string'&&x.title&&typeof x.publisher==='string'&&x.publisher&&finite(stamp(x.publishedAt)));
  $('newsCount').textContent=sample()?'Exemple de aspect':n.state==='loading'?'Se verifică':n.state==='error'?'Flux indisponibil':n.state==='partial'?'Flux parțial':items.length+' articole';
  $('newsFeed').innerHTML=items.length?items.slice(0,3).map(x=>'<article class="news-row"><div class="news-meta"><span class="news-symbol">'+esc(x.symbol)+'</span><span>'+esc(sample()?'EXEMPLU DE ASPECT':x.publisher)+'</span>'+(!sample()?'<time datetime="'+esc(new Date(stamp(x.publishedAt)).toISOString())+'">'+esc(when(x.publishedAt))+'</time>':'')+'</div><h3>'+(sample()?esc(x.title):'<a href="'+esc(safeURL(x.url))+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a>')+'</h3><p class="source-note">'+esc(sample()?x.publisher:x.source||'Sursă publică')+'</p></article>').join('')+(n.state==='partial'?'<p class="source-note warning">'+esc(n.reason)+'</p>':''):'<p class="state-message">'+esc(n.state==='loading'?'Caut articole recente asociate exact simbolurilor…':n.reason||'Fluxul de știri nu este disponibil.')+'</p>';
 }
 function renderPositions(){
  const a=ui.account||{},positions=(a.positions||[]).slice(0,4);
  $('positionsList').innerHTML=positions.length?'<div class="positions-head" aria-hidden="true"><span>Instrument</span><span>Valoare cont</span><span>P&L nerealizat</span><span>Pondere</span></div>'+positions.map(p=>{const ticker=String(p.ticker||'').replace(/_US_EQ$/,''),weight=finite(p.weight)?Math.max(0,Math.min(100,p.weight)):null;return '<div class="position-row"><div class="ticker-name"><span class="ticker-icon" aria-hidden="true">'+esc(ticker.slice(0,1))+'</span><div><b>'+esc(ticker)+'</b><small>'+esc(p.name||p.ticker)+'</small></div></div><div class="numeric" aria-label="Valoare în cont">'+esc(money(p.value,p.currency))+'</div><div class="numeric '+tone(p.unrealized)+'" aria-label="Profit sau pierdere nerealizată">'+esc(finite(p.unrealized)&&/^[A-Z]{3}$/.test(p.currency||'')?signed(p.unrealized,' '+p.currency):'Neverificat')+'</div><div class="position-weight">'+esc(weight!==null?number(p.weight,1)+'%':'Neverificat')+'<span aria-hidden="true"><i style="width:'+(weight||0)+'%"></i></span></div></div>';}).join(''):'<p class="state-message">'+esc(a.state==='ready'?'Nicio poziție deschisă în această citire.':'Pozițiile nu pot fi confirmate pentru contul selectat.')+' <a href="'+appURL('broker/')+'">Verifică Trading 212 ↗</a></p>';
  $('positionsSource').textContent=sample()?'DATE ILUSTRATIVE · poziții fictive':sourceLabel('Trading 212 · ultima citire locală'+(!a.fresh?' · de actualizat':''),a.at);
 }
 function renderActivity(){
  const a=ui.activity||{},items=(a.items||[]).filter(x=>x.side==='SELL').slice(0,3);
  $('activityList').innerHTML=items.length?items.map(x=>'<article class="activity-row"><span class="sell-icon" aria-hidden="true">↗</span><div><b>'+esc(String(x.ticker).replace(/_US_EQ$/,''))+'</b><small>'+esc(number(x.quantity,4)+' × '+money(x.price,x.currency))+'</small></div><div class="activity-side"><span>SELL'+(sample()?' · fictiv':'')+'</span><small>'+esc(sample()?'Exemplu de execuție':when(x.at))+'</small></div></article>').join(''):'<p class="state-message">'+esc(a.state==='loading'?'Citesc registrul execuțiilor confirmate…':a.reason||'Nicio vânzare confirmată disponibilă.')+' '+(a.state!=='loading'?'<a href="'+appURL('journal/#exec')+'">Verifică jurnalul brokerului ↗</a>':'')+'</p>';
  $('activitySource').textContent=sample()?'DATE ILUSTRATIVE · nu reprezintă tranzacțiile tale':a.reason||'Execuții Trading 212 confirmate; vânzarea parțială nu înseamnă închiderea întregii poziții.';
 }
 function renderScanners(){
  const engines=[{own:false,title:'Premarket Scanner',eyebrow:'MOTOR ORIGINAL',route:'candidate-engine/'},{own:true,title:'Verdict independent · V1',eyebrow:'REGULI PROPRII',route:'scanner-verdicts/'}];
  $('scannerWindows').innerHTML=engines.map(e=>{
   let report=null;try{if(!sample())report=e.own?g.ScannerResults?.independent():g.ScannerResults?.primary();}catch(_){}
   const items=sample()?(e.own?[{symbol:'ALFA',own:'4 / 5 verificări',label:'Cercetare ilustrativă'},{symbol:'BETA',own:'3 / 5 verificări',label:'Exemplu de rezultat'}]:[{symbol:'GAMA',own:'Top Long',label:'Exemplu de rezultat'},{symbol:'DELTA',own:'Early Reversal',label:'Exemplu de rezultat'}]):report?.items?.slice(0,3)||[];
   const status=sample()?'Date ilustrative':g.ScannerResults&&report?g.ScannerResults.reportState(report).text:'Nescanat';
   const rows=items.length?items.map(i=>'<div class="scanner-row"><b>'+esc(i.symbol)+'</b><span>'+esc(sample()?i.own:e.own?i.passed+' / '+i.total+' verificări':i.mode==='reversal'?'Early Reversal':'Top Long')+'</span><span>'+esc(sample()?i.label:g.ScannerResults.label(i,e.own))+'</span></div>').join(''):'<details class="scanner-fold"><summary>'+esc(report?.exists?'Vezi starea ultimei scanări':'Nicio scanare salvată')+'</summary><p>'+esc(report&&g.ScannerResults?g.ScannerResults.emptyResult(report,e.own).text:'Deschide motorul pentru o scanare. Lipsa rezultatelor nu este verdict negativ.')+'</p></details>';
   return '<article class="panel scanner-panel '+(e.own?'own':'')+'"><header class="panel-head"><div><span class="eyebrow">'+e.eyebrow+'</span><h3>'+e.title+'</h3></div><span class="badge">'+esc(status)+'</span></header>'+rows+'<div class="scanner-footer"><span>'+esc(sample()?'DATE ILUSTRATIVE':report?.completedAt?'Scanat '+when(report.completedAt)+' · '+report.provider:'Sursă și sesiune neconfirmate')+'</span><a href="'+appURL(e.route)+'">'+(e.own?'Vezi reguli și rezultate':'Deschide scanner')+' ↗</a></div></article>';
  }).join('');
 }
 function renderAttention(){
  let title='De urmărit',text,route='broker/',label='Verifică contul ↗';
  if(sample()){title='Exemplu de atenționare';text='Ultima citire a contului, sursele și execuțiile se verifică separat. Demo-ul nu modifică datele tale.';route='today/';label='Pagina actuală ↗';}
  else if(ui.account?.state==='missing'){text='Contul Invest nu este disponibil local. Conectează sau sincronizează Trading 212 pentru sold și poziții.';}
  else if(ui.account?.issues?.length){text=ui.account.issues[0];}
  else if(!ui.account?.fresh){text='Contul arată ultima copie salvată din '+when(ui.account?.at)+'. Actualizează-l la broker pentru date recente.';}
  else if(ui.activity?.state==='error'||ui.activity?.state==='partial'){text=ui.activity.reason;route='journal/#exec';label='Vezi jurnalul ↗';}
  else if(ui.market?.items?.some(x=>!finite(x.price)&&x.state!=='loading')){text='Unele cotații nu au putut fi confirmate. Sursele disponibile rămân vizibile; lipsurile nu devin zero.';route='scanner-verdicts/';label='Vezi Piață ↗';}
  else if(ui.busy){text='Citesc sursele publice și registrul local. Contul nu este recitit automat de la broker.';}
  else{title='Înainte de decizie';text='Verifică știrile, riscul și prețul executabil. Datele EOD și copiile locale nu sunt cotații live.';route='journal/#desk';label='Verifică riscul ↗';}
  $('attentionStrip').innerHTML='<p><strong>'+esc(title)+'</strong> '+esc(text)+'</p><a href="'+appURL(route)+'">'+esc(label)+'</a>';
 }
 function render(){renderMode();renderAccount();renderMarket();renderChart();renderNews();renderPositions();renderActivity();renderScanners();renderAttention();}
 async function load(force=false){
  const generation=++ui.generation;renderSession();
  if(sample()){Object.assign(ui,fixture());ui.busy=false;render();$('refreshStatus').textContent='Date ilustrative · fără salvări în cont';return;}
  ui.model=ui.model||g.TodayDashboardModel?.create();ui.busy=true;
  try{ui.account=ui.model?.account({days:ui.days})||{state:'error',issues:['Adaptorul datelor locale nu este disponibil.']};}catch(_){ui.account={state:'error',issues:['Contul nu a putut fi citit; datele existente sunt păstrate.']};}
  ui.market=emptyMarket();ui.news={state:'loading',items:[]};ui.activity={state:'loading',items:[]};render();$('refreshStatus').textContent='Citesc date locale și surse publice…';
  const apply=(key,fn,fallback)=>Promise.resolve().then(fn).then(value=>{if(generation!==ui.generation)return;ui[key]=value;render();},()=>{if(generation!==ui.generation)return;ui[key]=fallback;render();});
  const names=ui.account.newsSymbols?.length?ui.account.newsSymbols.slice(0,3):['SPY','QQQ'];
  await Promise.allSettled([
   apply('market',()=>ui.model.market({force}),{items:emptyMarket().items.map(x=>({...x,state:'error',reason:'Sursa de prețuri nu a răspuns.'})),breadth:{state:'error',points:[],reason:'Raportul breadth nu a putut fi citit.'}}),
   apply('news',()=>ui.model.news({symbols:names,force}),{state:'error',items:[],reason:'Fluxul de știri nu a putut fi verificat.'}),
   apply('activity',()=>ui.model.activity({scope:ui.account.scope,limit:4,side:'SELL'}),{state:'error',items:[],reason:'Registrul local nu a putut fi citit; datele existente sunt păstrate.'})
  ]);
  if(generation!==ui.generation)return;ui.busy=false;renderMode();renderAttention();const partial=ui.news?.state==='error'||ui.news?.state==='partial'||ui.market?.items?.some(x=>x.state!=='ready')||ui.market?.breadth?.state!=='ready';$('refreshStatus').textContent=(partial?'Actualizare parțială · încercare încheiată la ':'Surse publice citite la ')+when(Date.now())+' · contul păstrează ora citirii sale';
 }
 doc.addEventListener('click',event=>{
  const mode=event.target.closest('[data-mode]');if(mode){if(mode.dataset.mode===ui.mode)return;ui.mode=mode.dataset.mode;load(false);return;}
  const tab=event.target.closest('[data-chart-tab]');if(tab){ui.tab=tab.dataset.chartTab;renderChart();return;}
  const period=event.target.closest('[data-period]');if(period){ui.days=Number(period.dataset.period);if(!sample()){load(false);}else renderChart();return;}
 });
 doc.addEventListener('input',event=>{if(event.target.id!=='chartCursor')return;const p=ui.chartPoints[Number(event.target.value)];if(!p)return;const text=when(p.at)+' · '+number(p.value)+' '+ui.chartUnit;$('chartReadout').textContent=text;event.target.setAttribute('aria-valuetext',text);});
 $('refreshButton').addEventListener('click',()=>load(true));
 $('themeToggle').addEventListener('click',()=>{const root=doc.documentElement;root.dataset.theme=root.dataset.theme==='light'?'dark':'light';$('themeToggle').setAttribute('aria-label',root.dataset.theme==='light'?'Activați tema întunecată':'Activați tema luminoasă');});
 $('todayDate').textContent=new Date().toLocaleDateString('ro-RO',{timeZone:'Europe/Bucharest',weekday:'long',day:'numeric',month:'long'}).toUpperCase();
 function renderSession(){try{const now=Date.now(),day=g.ExchangeCalendar.date(now,'America/New_York'),s=g.ExchangeCalendar.session('US',day),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value])),minute=Number(parts.hour)*60+Number(parts.minute);$('sessionState').textContent=s.state==='closed'?'SUA · bursă închisă':s.state!=='open'?'SUA · program de verificat':minute<s.open?'SUA · înainte de deschidere':minute<s.close?'SUA · sesiune deschisă':'SUA · după închidere';if(s.state!=='open')$('sessionState').className='session-pill unconfirmed';}catch(_){$('sessionState').textContent='SUA · calendar neconfirmat';$('sessionState').className='session-pill unconfirmed';}}
 let refreshTimer;const queueRefresh=()=>{if(sample()||doc.hidden)return;if(g.clearTimeout)g.clearTimeout(refreshTimer);if(g.setTimeout)refreshTimer=g.setTimeout(()=>{if(!sample()&&!doc.hidden)load(false);},150);else load(false);};
 g.addEventListener?.('focus',queueRefresh);g.addEventListener?.('storage',event=>{if(event.key===null||['tt_trading212_portfolio_v1','tt_trading212_account_history_v1','tt_trading212_fills_v1'].includes(event.key))queueRefresh();});doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)queueRefresh();});
 g.TodayDashboardUI.state=()=>({mode:ui.mode,days:ui.days,tab:ui.tab,busy:ui.busy});
 load();
})(typeof window!=='undefined'?window:globalThis);
