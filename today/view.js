(function (g) {
 'use strict';
 const DAY=86400000, finite=Number.isFinite;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stamp=x=>typeof x==='number'?x:Date.parse(x);
 const number=(x,digits=2)=>finite(x)?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(x):'—';
 const money=(x,c)=>finite(x)&&/^[A-Z]{3}$/.test(c||'')?number(x)+' '+c:'Neverificat';
 const signed=(x,suffix='%')=>finite(x)?(x>0?'+':'')+number(x)+suffix:'Neverificat';
 const pct=x=>finite(x)?(x>0?'+':'')+number(x,1)+'%':'Neverificat';
 const tone=x=>!finite(x)?'muted':x<0?'negative':x>0?'positive':'muted';
 const when=(x,dateOnly=false)=>finite(stamp(x))?new Date(stamp(x)).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest',day:'2-digit',month:'2-digit',...(dateOnly?{}:{hour:'2-digit',minute:'2-digit'})}):'Oră neconfirmată';
 const dateLabel=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?x:when(x,true);
 function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch(_){return null;}}
 function appURL(route,query=''){
  const allowed=['today/','holdings/','broker/','journal/#exec','journal/#desk','candidate-engine/','scanner-verdicts/','app/sync/'];
  if(!allowed.includes(route))return null;
  const p=new URLSearchParams(query);p.set('module',route);return '../app/?'+p.toString();
 }
 function accountState(a){return !a||a.state==='missing'?{text:'Cont neconectat',tone:'warning'}:a.state==='error'?{text:'Citire nereușită',tone:'warning'}:a.state==='partial'?{text:'Citire parțială',tone:'warning'}:!a.fresh?{text:'De actualizat',tone:'warning'}:{text:'Citire recentă',tone:'positive'};}
 function chartMarkup(points,{label='Valoare observată',unit='',reason='',source='Sursă neconfirmată'}={}){
  const xs=Array.isArray(points)?points:[];
  if(xs.some(p=>!p||!finite(stamp(p.at))||!finite(p.value))||xs.some((p,i)=>i>0&&stamp(p.at)<=stamp(xs[i-1].at)))return '<div class="chart-empty"><span aria-hidden="true">⌁</span><strong>Seria nu poate fi verificată</strong><p>Orele și valorile trebuie să fie compatibile. Datele originale rămân păstrate.</p></div>';
  if(!xs.length)return '<div class="chart-empty"><span aria-hidden="true">⌁</span><strong>Nu există încă observații confirmate</strong><p>'+esc(reason||'Schimbă intervalul sau actualizează sursa pentru a vedea un grafic bazat pe date.')+'</p></div>';
  const W=700,H=250,L=10,R=68,T=17,B=30,values=xs.map(p=>p.value),low=Math.min(...values),high=Math.max(...values),spread=high-low,pad=spread?spread*.15:Math.max(Math.abs(high)*.025,1),min=low-pad,max=high+pad,start=stamp(xs[0].at),end=stamp(xs.at(-1).at),x=at=>xs.length===1?(W-R+L)/2:L+(stamp(at)-start)/(end-start)*(W-R-L),y=v=>T+(max-v)/(max-min)*(H-T-B),path=xs.map((p,i)=>(i?'L':'M')+x(p.at).toFixed(2)+','+y(p.value).toFixed(2)).join(' ');
  const ticks=[max,(max+min)/2,min].map(v=>'<g><line class="grid-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="'+(W-R+10)+'" y="'+(y(v)+4)+'">'+esc(number(v,Math.abs(v)>=1000?0:1))+'</text></g>').join('');
  const dates=(xs.length===1?[xs[0]]:[xs[0],xs[Math.floor((xs.length-1)/2)],xs.at(-1)]).map((p,i,all)=>'<text x="'+x(p.at)+'" y="'+(H-6)+'" text-anchor="'+(all.length===1?'middle':i===0?'start':i===all.length-1?'end':'middle')+'">'+esc(when(p.at,true))+'</text>').join('');
  const latest=xs.at(-1),n=xs.length,warning=n===1?'O singură observație: punctul este confirmat; evoluția necesită încă o citire din altă zi. '+reason:reason;
  return '<div class="chart-caption"><span>'+esc(label)+(unit?' · '+esc(unit):'')+'</span><span class="sample-label">'+(n===1?'1 OBSERVAȚIE':n+' OBSERVAȚII')+'</span></div><svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="chartTitle chartDesc"><title id="chartTitle">'+esc(label)+'</title><desc id="chartDesc">'+esc(n+(n===1?' observație. ':' observații. ')+warning)+'</desc><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--mint)" stop-opacity=".17"/><stop offset="1" stop-color="var(--mint)" stop-opacity="0"/></linearGradient></defs>'+ticks+(n>1?'<path d="'+path+' L'+x(latest.at).toFixed(2)+','+(H-B)+' L'+x(xs[0].at).toFixed(2)+','+(H-B)+' Z" fill="url(#chartFill)"/><path class="series" d="'+path+'"/>':'')+'<circle class="single-dot" cx="'+x(latest.at)+'" cy="'+y(latest.value)+'" r="5"/>'+dates+'</svg><div class="chart-controls"><input id="chartCursor" type="range" min="0" max="'+(n-1)+'" step="1" value="'+(n-1)+'" aria-label="Alege observația din grafic" aria-valuetext="'+esc(when(latest.at)+' · '+number(latest.value)+' '+unit)+'"'+(n===1?' disabled':'')+'><output id="chartReadout" class="chart-readout" for="chartCursor">'+esc(when(latest.at)+' · '+number(latest.value)+' '+unit)+'</output></div><p class="chart-notice">'+esc(warning)+' '+esc(source)+'</p><details class="chart-data"><summary>Observațiile din grafic · '+n+'</summary><div><table><caption class="skip">'+esc(label)+'</caption><thead><tr><th scope="col">Observație</th><th scope="col">'+esc(unit||'Valoare')+'</th></tr></thead><tbody>'+xs.map(p=>'<tr><td>'+esc(when(p.at))+'</td><td>'+esc(number(p.value))+'</td></tr>').join('')+'</tbody></table></div></details>';
 }
 g.TodayDashboardUI={appURL,safeURL,chartMarkup,accountState};
 if(!g.document)return;
 const doc=g.document,$=id=>doc.getElementById(id),origin=g.location?.origin;
 const embedded=!!(g.parent&&g.parent!==g&&new URLSearchParams(g.location?.search||'').has('app'));
 if(embedded)doc.documentElement.dataset.embedded='true';
 const requested=new URLSearchParams(g.location?.search||'').get('symbol');
 const selectedSymbol=typeof requested==='string'&&/^[A-Z0-9][A-Z0-9.^-]{0,19}$/.test(requested.toUpperCase())?requested.toUpperCase():null;
 const ui={days:30,tab:'account',generation:0,busy:false,brokerBusy:false,model:null,account:null,market:null,news:null,activity:null,chartPoints:[],chartUnit:''};
 const sourceLabel=(label,at)=>label+(at?' · '+when(at):'');
 const selectedQuery=()=>selectedSymbol?'symbol='+encodeURIComponent(selectedSymbol):'';
 const emptyMarket=()=>({items:[['SPY','S&P 500 · ETF SPY','USD'],['QQQ','Nasdaq 100 · ETF QQQ','USD'],['^VIX','Volatilitate · VIX','puncte'],['^TNX','Randament SUA · 10 ani','%']].map(([symbol,label,unit])=>({symbol,label,unit,price:null,changePct:null,state:'loading',source:'Yahoo Finance',points:[],indicators:{}})),breadth:{state:'loading',points:[],reason:'Verific sursa originală S&P 500…'}});
 function renderRefresh(){
  $('refreshButton').disabled=ui.busy||ui.brokerBusy;
  $('refreshButton').setAttribute('aria-label',embedded?'Actualizează contul Trading 212 și sursele publice':'Recitește datele locale și actualizează sursele publice');
 }
 function renderAccount(){
  const a=ui.account||{},state=accountState(a);$('accountState').textContent=state.text;$('accountState').className='badge '+state.tone;
  const amount=finite(a.total)?'<div class="account-total">'+esc(number(a.total))+'<small>'+esc(a.currency||'')+'</small></div>':'<div class="account-connect">'+esc(a.state==='error'?'Citire nereușită':a.state==='partial'?'Cont parțial':'Conectează contul')+'</div>';
  const asof=a.at?'Ultima citire '+when(a.at)+' · București'+(!a.fresh?' · de actualizat':''):'Valoarea contului nu este încă disponibilă pe acest dispozitiv.';
  $('accountSummary').innerHTML='<div>'+amount+'<p class="account-asof">'+esc(asof)+'</p></div><a class="account-link'+(finite(a.total)?'':' cta')+'" href="'+appURL('broker/')+'">Actualizează contul ↗</a>';
  const metrics=[['Disponibil',a.available,'Capital neinvestit',false],['Valoare investită',a.invested,'Raportată de broker',false],['P&L nerealizat',a.unrealized,'Poziții deschise · total',true],['P&L realizat',a.realized,'Total raportat · nu zilnic',true]];
  $('accountMetrics').innerHTML=metrics.map(([label,v,note,color])=>'<div><span class="metric-label">'+esc(label)+'</span><span class="metric-value '+(color?tone(v):'')+'">'+esc(finite(v)&&/^[A-Z]{3}$/.test(a.currency||'')?(color&&v>0?'+':'')+number(v)+' '+a.currency:'Neverificat')+'</span><span class="metric-note">'+esc(note)+'</span></div>').join('');
  $('accountSource').textContent=sourceLabel('Trading 212 Invest · copie locală',a.at);
 }
 function renderMarket(){
  const items=ui.market?.items||[],note=m=>{const confirmed=finite(m.price);return confirmed?(m.state==='stale'?'DE REVERIFICAT · ':'')+'EOD '+dateLabel(m.asOf)+' · '+m.source:m.state==='loading'?'Yahoo Finance · sesiuni încheiate':m.reason||'Sursa nu a putut fi confirmată';};
  const notes=items.map(note),common=items.length&&notes.every(n=>n===notes[0])?notes[0]:null;
  $('marketStrip').innerHTML=items.map((m,i)=>{const confirmed=finite(m.price),unit=m.unit==='USD'?' USD':m.unit==='%'?'%':m.unit==='puncte'?' puncte':'',move=confirmed&&m.symbol!=='^TNX'&&finite(m.changePct),w=move?Math.min(50,Math.abs(m.changePct)*4):0;return '<article class="market-tile"><div class="market-tile-head"><h2>'+esc(m.label)+'</h2></div><div class="market-quote">'+(confirmed?esc(number(m.price)+unit):'<span style="font:12px var(--sans);letter-spacing:0">'+(m.state==='loading'?'Se verifică…':'Indisponibil')+'</span>')+(confirmed&&m.symbol!=='^TNX'?' <small class="'+(m.symbol==='^VIX'?'muted':tone(m.changePct))+'">'+esc(pct(m.changePct))+'</small>':'')+'</div>'+(move?'<div class="move-bar" aria-hidden="true"><i class="'+(m.symbol==='^VIX'?'neutral':m.changePct<0?'down':'up')+'" style="'+(m.changePct<0?'right':'left')+':50%;width:'+w+'%"></i></div>':m.symbol==='^TNX'&&confirmed?'<p class="tile-note">Randament în procente</p>':'')+(common?'':'<p class="source-note">'+esc(notes[i])+'</p>')+'</article>';}).join('')+(common?'<p class="source-note strip-note">'+esc(common)+(items.some(m=>finite(m.price)&&m.symbol!=='^TNX')?' · bara arată mișcarea zilei față de zero':'')+'</p>':'');
  const b=ui.market?.breadth||{},hasBreadth=finite(b.above50),contextState=b.state==='stale'?'Date breadth de reverificat':hasBreadth?b.above50>=50?'Participare peste jumătate':'Participare sub jumătate':b.state==='loading'?'Verific sursele pieței…':'Context parțial disponibil';
  const asOf=typeof b.asOf==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.asOf)?b.asOf.slice(8,10)+'.'+b.asOf.slice(5,7):null;$('contextAsOf').textContent=asOf?'EOD '+asOf:b.state==='loading'?'Se verifică':'Dată neconfirmată';
  $('marketContext').innerHTML='<h3 class="context-verdict">'+esc(contextState)+'</h3><p class="context-text">'+esc(hasBreadth?'Ponderea din seria originală S&P 500 peste media pe 50 de sesiuni. '+(b.state==='stale'?'Ultima valoare disponibilă, nu context actual.':b.reason||''):b.reason||'Datele lipsă nu sunt interpretate ca un semnal pozitiv sau negativ.')+'</p>'+(hasBreadth?meter('Peste SMA 50',b.above50)+(finite(b.above200)?meter('Peste SMA 200',b.above200):'')+spark(b.points)+'<p class="source-note">'+esc(b.source+' · '+dateLabel(b.asOf)+' · '+b.coverage)+'</p>':'');
  const spy=ui.market?.items?.find(x=>x.symbol==='SPY'),ind=spy?.indicators||{},indicators=[['SPY · RSI 14',ind.rsi14,'Wilder · închideri EOD',''],['SPY vs SMA 50',ind.distanceSma50,'Distanță față de medie','%'],['SPY · 20 sesiuni',ind.change20d,'Variație de preț','%']];
  $('technicalIndicators').innerHTML=indicators.map(([label,v,detail,suffix])=>'<div><span class="indicator-label">'+esc(label)+'</span><span class="indicator-value '+(suffix?tone(v):'')+'">'+esc(finite(v)?suffix?pct(v):number(v,1):'—')+'</span><span class="indicator-detail">'+esc(finite(v)?detail:spy?.state==='loading'?'Se verifică':'Date insuficiente')+'</span></div>').join('');
  $('indicatorSource').textContent=spy?.asOf?'Yahoo Finance · EOD '+dateLabel(spy.asOf)+' · indicatori descriptivi, fără verdict automat':'Indicatorii SPY necesită o serie EOD verificată. Amploarea pieței rămâne o sursă separată.';
 }
 function meter(label,v){const w=Math.max(0,Math.min(100,v));return '<div class="participation"><span>'+esc(label)+'</span><b>'+esc(number(v,1))+'%</b></div><div class="participation-bar" role="meter" aria-label="S&P 500 '+esc(label.toLowerCase())+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+w+'"><span style="width:'+w+'%"></span><i class="half" aria-hidden="true"></i></div>';}
 function spark(points){
  const xs=(Array.isArray(points)?points:[]).filter(p=>p&&finite(stamp(p.at))&&finite(p.value)).slice(-60);if(xs.length<2)return '';
  const W=300,H=44,y=v=>H-2-(H-4)*Math.max(0,Math.min(100,v))/100,x=i=>i/(xs.length-1)*W;
  return '<svg class="breadth-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="Peste SMA 50, ultimele '+xs.length+' sesiuni"><line x1="0" x2="'+W+'" y1="'+y(50)+'" y2="'+y(50)+'" class="half-line"/><polyline points="'+xs.map((p,i)=>x(i).toFixed(1)+','+y(p.value).toFixed(1)).join(' ')+'"/></svg><p class="source-note spark-note">Linia: % peste SMA 50 în ultimele '+xs.length+' sesiuni; punctat = jumătate.</p>';
 }
 function chartTab(){return ui.tab==='account'&&!ui.tabChosen&&(!ui.account||ui.account.state==='missing')?'SPY':ui.tab;}
 function chartConfig(){
  const cutoff=Date.now()-ui.days*DAY,tab=chartTab();
  let points=[],label,unit,reason,source;
  if(tab==='account'){points=ui.account?.points||[];label='Valoarea contului observată';unit=ui.account?.chartCurrency||ui.account?.currency||'';reason=ui.account?.cashWarning||'Depunerile și retragerile sunt incluse; nu este randament.';if(points.length<2)reason=(ui.account?.historyReason||'')+' '+reason;source='Trading 212 · observații locale la sincronizare.';}
  else if(tab==='SPY'){const m=ui.market?.items?.find(x=>x.symbol==='SPY');points=m?.points||[];label='SPY · închideri de sesiune';unit='USD';reason=m?.reason||'Aștept seria EOD confirmată.';source=m?.source||'Yahoo Finance';}
  else{const b=ui.market?.breadth;points=b?.points||[];label='S&P 500 peste SMA 50';unit='%';reason=b?.reason||'Aștept seria originală de participare la piață.';source=b?.source||'Market Breadth · seria originală';}
  points=points.filter(p=>!finite(stamp(p.at))||stamp(p.at)>=cutoff);
  return {points,label,unit,reason,source};
 }
 function renderChart(){
  const c=chartConfig(),tab=chartTab(),missing=tab!=='account'&&(!ui.account||ui.account.state==='missing');ui.chartPoints=c.points;ui.chartUnit=c.unit;
  $('chartHost').innerHTML=(missing?'<p class="account-empty"><b>Nu există încă observații confirmate</b> pentru cont. Istoricul începe la prima sincronizare a contului. Depunerile și retragerile schimbă valoarea contului. Graficul nu reprezintă randamentul. Până atunci, graficul arată date publice.</p>':'')+chartMarkup(c.points,c);
  for(const b of doc.querySelectorAll('[data-chart-tab]'))b.setAttribute('aria-pressed',String(b.dataset.chartTab===tab));
  for(const b of doc.querySelectorAll('[data-period]'))b.setAttribute('aria-pressed',String(Number(b.dataset.period)===ui.days));
 }
 function renderNews(){
  const n=ui.news||{},items=(n.items||[]).filter(x=>safeURL(x.url)&&typeof x.title==='string'&&x.title&&typeof x.publisher==='string'&&x.publisher&&finite(stamp(x.publishedAt)));
  $('newsCount').textContent=n.state==='loading'?'Se verifică':n.state==='error'?'Flux indisponibil':n.state==='partial'?'Flux parțial':items.length+' articole';
  $('newsFeed').innerHTML=items.length?items.slice(0,6).map(x=>'<article class="news-row"><div class="news-meta"><span class="news-symbol">'+esc(x.symbol)+'</span><span>'+esc(x.publisher)+'</span><time datetime="'+esc(new Date(stamp(x.publishedAt)).toISOString())+'">'+esc(when(x.publishedAt))+'</time></div><h3><a href="'+esc(safeURL(x.url))+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a></h3><p class="source-note">'+esc(x.source||'Sursă publică')+'</p></article>').join('')+(n.state==='partial'?'<p class="source-note warning">'+esc(n.reason)+'</p>':''):'<p class="state-message">'+esc(n.state==='loading'?'Caut articole recente asociate exact simbolurilor…':n.reason||'Fluxul de știri nu este disponibil.')+'</p>';
 }
 function renderPositions(){
  const a=ui.account||{},positions=(a.positions||[]).slice(0,4);
  $('positionsList').innerHTML=positions.length?'<div class="positions-head" aria-hidden="true"><span>Instrument</span><span>Valoare cont</span><span><span class="mh">Valoare cont · </span>P&L nerealizat</span><span>Pondere</span></div>'+positions.map(p=>{const ticker=String(p.ticker||'').replace(/_US_EQ$/,''),weight=finite(p.weight)?Math.max(0,Math.min(100,p.weight)):null;return '<div class="position-row"><div class="ticker-name"><span class="ticker-icon" aria-hidden="true">'+esc(ticker.slice(0,1))+'</span><div><a class="ticker-link" data-holding-ticker="'+esc(p.ticker)+'" href="'+appURL('holdings/')+'"><b>'+esc(ticker)+'</b></a><small>'+esc(p.name||p.ticker)+'</small></div></div><div class="numeric" aria-label="Valoare în cont">'+esc(money(p.value,p.currency))+'</div><div class="numeric '+tone(p.unrealized)+'" aria-label="Profit sau pierdere nerealizată"><span class="mv">'+esc(money(p.value,p.currency))+'</span>'+esc(finite(p.unrealized)&&/^[A-Z]{3}$/.test(p.currency||'')?signed(p.unrealized,' '+p.currency):'Neverificat')+'</div><div class="position-weight">'+esc(weight!==null?number(p.weight,1)+'%':'Neverificat')+'<span aria-hidden="true"><i style="width:'+(weight||0)+'%"></i></span></div></div>';}).join(''):'<p class="state-message">'+esc(a.state==='ready'?'Nicio poziție deschisă în această citire.':'Pozițiile nu pot fi confirmate pentru contul selectat.')+' <a href="'+appURL('broker/')+'">Verifică Trading 212 ↗</a></p>';
  $('positionsSource').textContent=sourceLabel('Trading 212 · ultima citire locală'+(!a.fresh?' · de actualizat':''),a.at);
 }
 function renderActivity(){
  const a=ui.activity||{},items=(a.items||[]).filter(x=>x.side==='SELL').slice(0,3);
  $('activityList').innerHTML=items.length?items.map(x=>'<article class="activity-row"><span class="sell-icon" aria-hidden="true">↗</span><div><b>'+esc(String(x.ticker).replace(/_US_EQ$/,''))+'</b><small>'+esc(number(x.quantity,4)+' × '+money(x.price,x.currency))+'</small></div><div class="activity-side"><span>SELL</span><small>'+esc(when(x.at))+'</small></div></article>').join(''):'<p class="state-message">'+esc(a.state==='loading'?'Citesc registrul execuțiilor confirmate…':a.reason||'Nicio vânzare confirmată disponibilă.')+' '+(a.state!=='loading'?'<a href="'+appURL('journal/#exec')+'">Verifică jurnalul brokerului ↗</a>':'')+'</p>';
  $('activitySource').textContent=a.reason||'Execuții Trading 212 confirmate; vânzarea parțială nu înseamnă închiderea întregii poziții.';
 }
 function scannerDetails(report,own){
  const R=g.ScannerResults,empty=report&&R?.emptyResult?R.emptyResult(report,own):{title:'Nicio scanare salvată',text:'Deschide motorul pentru o scanare. Lipsa rezultatelor nu este verdict negativ.'};
  const n=report?.scannedCount,v=report?.verifiedCount,coverage=Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(v)&&v>=0&&v<=n?v+' / '+n+' serii verificate':'Acoperire neverificată';
  const failures=Array.isArray(report?.failures)?report.failures:[];
  const message=[empty.text,report?.issue,failures.length?failures.length+' erori raportate.':'',report?.dates?.length?'Sesiuni EOD: '+report.dates.join(' / ')+'.':''].filter(Boolean).join(' ');
  return '<details class="scanner-fold"><summary>'+esc(report?.items?.length?coverage:empty.title)+'</summary><p>'+esc(coverage+' · '+message)+'</p>'+(failures.length?'<ul>'+failures.slice(0,5).map(x=>'<li>'+esc(typeof x==='string'?x:[x?.symbol,x?.reason||x?.message||x?.error].filter(y=>typeof y==='string').join(' · ')||'Eroare de sursă raportată')+'</li>').join('')+'</ul>':'')+'</details>';
 }
 function renderScanners(){
  const engines=[{own:false,title:'Premarket Scanner',eyebrow:'Motor original',route:'candidate-engine/'},{own:true,title:'Verdict independent · V1',eyebrow:'Reguli proprii',route:'scanner-verdicts/'}];
  $('scannerWindows').innerHTML=engines.map(e=>{
   let report=null;try{report=e.own?g.ScannerResults?.independent():g.ScannerResults?.primary();}catch(_){}
   const items=report?.items?.slice(0,3)||[],state=g.ScannerResults&&report?g.ScannerResults.reportState(report):{text:'Nescanat',tone:'neutral'};
   const rows=items.map(i=>'<a class="scanner-row" href="'+appURL(e.route,'symbol='+encodeURIComponent(i.symbol)+(e.own?'':'&mode='+encodeURIComponent(i.mode||'momentum')))+'"><b>'+esc(i.symbol)+'</b><span>'+esc(e.own?i.passed+' / '+i.total+' verificări':i.mode==='reversal'?'Early Reversal':'Top Long')+'</span><span>'+esc(g.ScannerResults.label(i,e.own))+'</span></a>').join('');
   return '<article class="panel scanner-panel '+(e.own?'own':'')+'"><header class="panel-head"><div><span class="eyebrow">'+e.eyebrow+'</span><h3>'+e.title+'</h3></div><span class="badge '+esc(state.tone)+'">'+esc(state.text)+'</span></header>'+rows+scannerDetails(report,e.own)+'<div class="scanner-footer"><span>'+esc(report?.completedAt?'Scanat '+when(report.completedAt)+' · '+report.provider:'Sursă și sesiune neconfirmate')+'</span><a href="'+appURL(e.route,selectedQuery())+'">'+(e.own?'Vezi reguli și rezultate':'Deschide scanner')+' ↗</a></div></article>';
  }).join('');
 }
 function renderAttention(){
  let title='De urmărit',text,route='broker/',label='Verifică contul ↗';
  if(ui.account?.state==='missing'){text='Contul Invest nu este disponibil local. Conectează sau sincronizează Trading 212 pentru sold și poziții.';}
  else if(ui.account?.issues?.length){text=ui.account.issues[0];}
  else if(!ui.account?.fresh){text='Contul arată ultima copie salvată din '+when(ui.account?.at)+'. Actualizează-l la broker pentru date recente.';}
  else if(ui.activity?.state==='error'||ui.activity?.state==='partial'){text=ui.activity.reason;route='journal/#exec';label='Vezi jurnalul ↗';}
  else if(ui.market?.items?.some(x=>!finite(x.price)&&x.state!=='loading')){text='Unele cotații nu au putut fi confirmate. Sursele disponibile rămân vizibile; lipsurile nu devin zero.';route='scanner-verdicts/';label='Vezi Piață ↗';}
  else if(ui.busy){text='Citesc sursele publice și registrul local. Ora ultimei citiri a contului rămâne afișată separat.';}
  else{title='Înainte de decizie';text='Verifică știrile, riscul și prețul executabil. Datele EOD și copiile locale nu sunt cotații live.';route='journal/#desk';label='Verifică riscul ↗';}
  const rows=[[text,route,label,null]];if(!scannerReports().some(r=>r?.items?.length))rows.push(['Nicio scanare salvată în cele două motoare.','candidate-engine/','Deschide scanner ↗',selectedQuery()]);
  $('attentionStrip').innerHTML=rows.map((r,i)=>'<div class="attention-row"><p>'+(i===0?'<strong>'+esc(title)+'</strong> ':'')+esc(r[0])+'</p><a href="'+appURL(r[1],r[3]||'')+'">'+esc(r[2])+'</a></div>').join('');
 }
 function scannerReports(){const R=g.ScannerResults;let a=null,b=null;try{a=R?.primary()||null;}catch(_){}try{b=R?.independent()||null;}catch(_){}return [a,b];}
 function pill(text,kind){return '<span class="pill '+kind+'">'+esc(text)+'</span>';}
 function renderBrief(){
  const items=ui.market?.items||[],q=sym=>items.find(x=>x.symbol===sym),b=ui.market?.breadth||{},hasBreadth=finite(b.above50);
  const verdict=b.state==='stale'?'Date breadth de reverificat':hasBreadth?b.above50>=50?'Participare peste jumătate':'Participare sub jumătate':b.state==='loading'?'Verific sursele pieței…':'Context parțial disponibil';
  const move=sym=>{const m=q(sym);return m&&finite(m.price)&&finite(m.changePct)?'<span>'+esc(sym.replace('^',''))+' <b class="'+(sym==='^VIX'?'':tone(m.changePct))+'">'+esc(pct(m.changePct))+'</b></span>':'';};
  $('briefMarket').innerHTML='<div class="brief-top"><span class="brief-label">Piața</span>'+(hasBreadth?pill('Amploare '+number(b.above50,1)+'%',b.above50>=50?'ok':'warn'):pill(b.state==='loading'?'Se verifică':'Neconfirmat','idle'))+'</div><h2>'+esc(verdict)+'</h2><div class="brief-facts">'+move('SPY')+move('QQQ')+move('^VIX')+(hasBreadth?'<span><b>'+esc(number(b.above50,1))+'%</b> din S&P 500 peste SMA 50</span>':'')+'</div><a class="brief-go" href="#contextTitle">Pulsul pieței ↓</a>';
  const a=ui.account||{},st=accountState(a),cur=/^[A-Z]{3}$/.test(a.currency||''),pos=(a.positions||[]).filter(p=>p);
  if(!a.state||a.state==='missing')$('briefAccount').innerHTML='<div class="brief-top"><span class="brief-label">Contul</span>'+pill('Cont neconectat','bad')+'</div><h2>Conectează contul</h2><div class="brief-facts"><span>Valoarea contului nu este încă disponibilă pe acest dispozitiv.</span></div><a class="brief-go" href="'+appURL('broker/')+'">Verifică contul ↗</a>';
  else{const big=pos.filter(p=>finite(p.weight)).sort((x,y)=>y.weight-x.weight)[0];
   $('briefAccount').innerHTML='<div class="brief-top"><span class="brief-label">Contul</span>'+pill(a.at&&a.state==='ready'?(a.fresh?'Citit ':'De actualizat · ')+when(a.at):st.text,a.state==='ready'&&a.fresh?'ok':a.state==='error'?'bad':'warn')+'</div><h2 class="'+(finite(a.total)?'num':'')+'">'+esc(finite(a.total)&&cur?number(a.total)+' '+a.currency:st.text)+'</h2><div class="brief-facts">'+(finite(a.unrealized)&&cur?'<span>P&L nerealizat <b class="'+tone(a.unrealized)+'">'+esc(signed(a.unrealized,' '+a.currency))+'</b></span>':'')+(pos.length?'<span>'+pos.length+(pos.length===1?' poziție':' poziții')+(big?' · cea mai mare <b>'+esc(number(big.weight,1))+'%</b>':'')+'</span>':'')+(a.issues?.length?'<span>'+esc(a.issues[0])+'</span>':'')+'</div><a class="brief-go" href="#accountTitle">Privire asupra contului ↓</a>';}
  const [p,v]=scannerReports(),np=p?.items?.length||0,nv=v?.items?.length||0;
  if(!np&&!nv)$('briefIdeas').innerHTML='<div class="brief-top"><span class="brief-label">Idei</span>'+pill('Nescanat','idle')+'</div><h2>Nicio scanare salvată</h2><div class="brief-facts"><span>Niciun motor nu a salvat rezultate pe acest dispozitiv.</span></div><a class="brief-go" href="'+appURL('candidate-engine/',selectedQuery())+'">Deschide scanner ↗</a>';
  else{const modes=[...new Set((p?.items||[]).map(i=>i.mode==='reversal'?'Early Reversal':'Top Long'))].join(', '),best=(v?.items||[]).filter(i=>Number.isFinite(i.passed)&&Number.isFinite(i.total)).sort((x,y)=>y.passed-x.passed)[0];
   $('briefIdeas').innerHTML='<div class="brief-top"><span class="brief-label">Idei</span>'+pill((np&&nv?'2 motoare':'1 motor')+' citite','ok')+'</div><h2>'+(np+nv)+(np+nv===1?' idee de cercetat':' idei de cercetat')+'</h2><div class="brief-facts"><span>Premarket <b>'+np+'</b>'+(modes?' · '+esc(modes):'')+'</span><span>V1 <b>'+nv+'</b>'+(best?' · cel mult '+best.passed+' / '+best.total+' verificări':'')+'</span></div><a class="brief-go" href="#scannerTitle">Idei de cercetat ↓</a>';}
 }
 // coloanele se termină la aceeași linie: știrile se potrivesc (minim 3), „Vânzări recente” urcă sub poziții doar dacă micșorează golul
 function fitLayout(){
  const L=$('colStanga'),R=$('colDreapta'),feed=$('newsFeed'),more=$('newsMore'),panel=$('activityPanel'),slot=$('activitySlot');
  if(!L?.getBoundingClientRect||!feed?.children||!more||!panel||!slot)return;
  const arts=[...feed.querySelectorAll('.news-row')],wide=!!g.matchMedia?.('(min-width:981px)').matches,grid=L.parentNode,gap=()=>Math.abs(R.getBoundingClientRect().bottom-L.getBoundingClientRect().bottom);
  grid.classList.add('measuring');
  const fit=()=>{arts.forEach(x=>{x.hidden=false;});more.hidden=!(arts.length>3)||ui.newsAll;more.textContent='Încă 3 ↓';
   if(!ui.newsAll&&!wide)arts.slice(3).forEach(x=>{x.hidden=true;});
   else if(!ui.newsAll){let k=arts.length;while(k>3&&R.getBoundingClientRect().bottom>L.getBoundingClientRect().bottom+8)arts[--k].hidden=true;if(k<arts.length){const g1=gap();arts[k].hidden=false;if(gap()>=g1)arts[k].hidden=true;}}
   return gap();};
  const down=()=>{if(panel.parentNode!==slot.parentNode)slot.parentNode.insertBefore(panel,slot.nextSibling);},up=()=>{if(panel.parentNode!==L)L.appendChild(panel);};
  down();const below=fit();if(wide){up();if(fit()+8>=below){down();fit();}}
  const hidden=arts.filter(x=>x.hidden).length;more.hidden=!hidden;if(hidden){more.textContent='Încă '+hidden+' ↓';more.setAttribute('aria-label','Arată încă '+hidden+(hidden===1?' articol':' articole'));}
  grid.classList.remove('measuring');
 }
 function render(){renderRefresh();renderAccount();renderMarket();renderChart();renderNews();renderPositions();renderActivity();renderScanners();renderAttention();renderBrief();fitLayout();}
 async function load(force=false){
  const generation=++ui.generation;renderSession();ui.busy=true;
  try{ui.model=ui.model||g.TodayDashboardModel?.create();ui.account=ui.model?.account({days:ui.days})||{state:'error',issues:['Adaptorul datelor locale nu este disponibil.']};}catch(_){ui.account={state:'error',issues:['Contul nu a putut fi citit; datele existente sunt păstrate.']};}
  const scope=ui.account.scope,names=ui.account.newsSymbols?.length?ui.account.newsSymbols.slice(0,3):['SPY','QQQ'],model=ui.model;
  ui.market=emptyMarket();ui.news={state:'loading',items:[]};ui.activity={state:'loading',items:[]};render();$('refreshStatus').textContent='Citesc date locale și surse publice…';
  const apply=(key,fn,fallback)=>Promise.resolve().then(fn).then(value=>{if(generation!==ui.generation)return;ui[key]=value;render();},()=>{if(generation!==ui.generation)return;ui[key]=fallback;render();});
  await Promise.allSettled([
   apply('market',()=>model.market({force}),{items:emptyMarket().items.map(x=>({...x,state:'error',reason:'Sursa de prețuri nu a răspuns.'})),breadth:{state:'error',points:[],reason:'Raportul breadth nu a putut fi citit.'}}),
   apply('news',()=>model.news({symbols:names,force}),{state:'error',items:[],reason:'Fluxul de știri nu a putut fi verificat.'}),
   apply('activity',()=>model.activity({scope,limit:4,side:'SELL'}),{state:'error',items:[],reason:'Registrul local nu a putut fi citit; datele existente sunt păstrate.'})
  ]);
  if(generation!==ui.generation)return;ui.busy=false;renderRefresh();renderAttention();const partial=ui.news?.state==='error'||ui.news?.state==='partial'||ui.market?.items?.some(x=>x.state!=='ready')||ui.market?.breadth?.state!=='ready';$('refreshStatus').textContent=(partial?'Actualizare parțială · încercare încheiată la ':'Surse publice citite la ')+when(Date.now())+' · contul păstrează ora citirii sale';
 }
 function openPosition(event){
  if(event.defaultPrevented||event.button&&event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return false;
  const a=event.target.closest('[data-holding-ticker]');if(!a)return false;event.preventDefault();
  try{const target={scope:ui.account?.scope,environment:'live',ticker:a.dataset.holdingTicker},entry=g.T212Snapshot?.read('live'),checked=g.HoldingHandoff?.check(target,entry);if(ui.account?.state!=='ready'||!checked?.ok||!g.T212Snapshot?.fresh(entry?.[1]))throw Error('context');const query=g.HoldingHandoff.create(g.sessionStorage,target);$('positionNavigationStatus').hidden=true;if(embedded)g.parent.postMessage({ttOpenModule:'holdings/',ttQuery:query},origin);else g.location.href='../holdings/?'+query;}
  catch(_){$('positionNavigationStatus').hidden=false;$('positionNavigationStatus').textContent='Poziția nu poate fi deschisă cu datele curente. Actualizează contul Trading 212 sau folosește „Toate” pentru portofoliul general.';}
  return true;
 }
 function navigateAnchor(event){
  if(!embedded||event.defaultPrevented||event.button&&event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const a=event.target.closest('a[href]');if(!a||a.hasAttribute?.('download')||a.getAttribute('target')&&a.getAttribute('target')!=='_self')return;
  const href=a.getAttribute('href');if(!href||href.startsWith('#'))return;
  try{const u=new URL(href,g.location.href),shell=new URL('../app/',g.location.href),params=u.searchParams,route=params.get('module');if(u.origin!==origin||u.pathname!==shell.pathname||!appURL(route))return;params.delete('module');event.preventDefault();g.parent.postMessage({ttOpen:route,ttQuery:params.toString()},origin);}catch(_){}
 }
 doc.addEventListener('click',event=>{
  if(openPosition(event))return;
  const tab=event.target.closest('[data-chart-tab]');if(tab&&['account','SPY','breadth'].includes(tab.dataset.chartTab)){ui.tab=tab.dataset.chartTab;ui.tabChosen=true;renderChart();fitLayout();return;}
  const period=event.target.closest('[data-period]');if(period&&[30,90,365].includes(Number(period.dataset.period))){ui.days=Number(period.dataset.period);load(false);return;}
  navigateAnchor(event);
 });
 doc.addEventListener('input',event=>{if(event.target.id!=='chartCursor')return;const p=ui.chartPoints[Number(event.target.value)];if(!p)return;const text=when(p.at)+' · '+number(p.value)+' '+ui.chartUnit;$('chartReadout').textContent=text;event.target.setAttribute('aria-valuetext',text);});
 $('refreshButton').addEventListener('click',()=>{if(ui.busy||ui.brokerBusy)return;if(embedded){try{g.parent.postMessage({ttRefreshBroker:true},origin);$('brokerRefreshStatus').hidden=false;$('brokerRefreshStatus').textContent='Am solicitat actualizarea contului Trading 212.';}catch(_){$('brokerRefreshStatus').hidden=false;$('brokerRefreshStatus').textContent='Cererea nu a ajuns la conexiunea brokerului. Deschide Trading 212 pentru verificare.';}}else{$('brokerRefreshStatus').hidden=false;$('brokerRefreshStatus').textContent='Sursele publice se actualizează aici; recitirea contului se face din conexiunea Trading 212.';}load(true);});
 $('newsMore').addEventListener('click',()=>{ui.newsAll=true;fitLayout();});
 g.addEventListener?.('resize',()=>fitLayout());
 doc.addEventListener('toggle',()=>fitLayout(),true);
 doc.fonts?.ready?.then(()=>fitLayout());
 $('themeToggle').addEventListener('click',()=>{const root=doc.documentElement;if(g.TTTheme?.set)g.TTTheme.set(root.dataset.theme==='light'?'dark':'light');else root.dataset.theme=root.dataset.theme==='light'?'dark':'light';$('themeToggle').setAttribute('aria-label',root.dataset.theme==='light'?'Activează tema întunecată':'Activează tema luminoasă');});
 function renderSession(){
  $('todayDate').textContent=new Date().toLocaleDateString('ro-RO',{timeZone:'Europe/Bucharest',weekday:'long',day:'numeric',month:'long'}).replace(/^./,c=>c.toUpperCase());$('sessionState').className='session-pill';
  try{const now=Date.now(),day=g.ExchangeCalendar.date(now,'America/New_York'),s=g.ExchangeCalendar.session('US',day),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value])),minute=Number(parts.hour)*60+Number(parts.minute);$('sessionState').textContent=s.state==='closed'?'SUA · bursă închisă':s.state!=='open'?'SUA · program de verificat':minute<s.open?'SUA · înainte de deschidere':minute<s.close?'SUA · sesiune deschisă':'SUA · după închidere';if(s.state!=='open')$('sessionState').className='session-pill unconfirmed';renderClock(s,minute,now);}catch(_){$('sessionState').textContent='SUA · calendar neconfirmat';$('sessionState').className='session-pill unconfirmed';$('sessionWhen').textContent='';$('clockNow').hidden=true;}
 }
 function renderClock(s,minute,now){
  const local=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Bucharest',hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(now)).reduce((m,p)=>p.type==='hour'?m+Number(p.value)*60:p.type==='minute'?m+Number(p.value):m,0);
  let off=local-minute;if(off>720)off-=1440;if(off<-720)off+=1440;
  const at=m=>{const t=((m+off)%1440+1440)%1440;return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');},A=240,B=1200,open=s.state==='open'&&Number.isFinite(s.open)&&Number.isFinite(s.close),o=open?s.open:570,c=open?s.close:960;
  const dur=x=>(Math.floor(x/60)?Math.floor(x/60)+' h ':'')+(x%60)+' min';
  $('clockPre').setAttribute('style','flex:'+(o-A));$('clockReg').setAttribute('style','flex:'+(c-o));$('clockPost').setAttribute('style','flex:'+(B-c));
  $('clockPre').textContent='Pre-market '+at(A)+'–'+at(o);$('clockReg').textContent=open?'Sesiunea '+at(o)+'–'+at(c):'Bursa închisă';$('clockPost').textContent='After-hours până la '+at(B);
  $('clockTicks').innerHTML=[A,o,c,B].map((m,i)=>'<span class="'+(i===0?'first':i===3?'last':'')+'" style="left:'+((m-A)/(B-A)*100).toFixed(2)+'%">'+at(m)+'</span>').join('');
  const n=$('clockNow');n.hidden=!open;if(open){n.setAttribute('style','left:'+Math.max(0,Math.min(100,(minute-A)/(B-A)*100)).toFixed(2)+'%');n.dataset.t='acum '+at(minute);}
  $('sessionWhen').textContent=!open?(s.state==='closed'?'Bursa din New York nu are sesiune azi.':'Programul de azi nu este confirmat de calendar.'):minute<A?'Pre-market de la '+at(A):minute<o?'Deschide în '+dur(o-minute)+', la '+at(o):minute<c?'Se închide în '+dur(c-minute)+', la '+at(c):minute<B?'After-hours până la '+at(B):'Sesiunea de azi s-a încheiat.';
 }
 let refreshTimer,brokerTimer,channel;
 function brokerPending(state){if(g.clearTimeout)g.clearTimeout(brokerTimer);ui.brokerBusy=state==='loading';if(ui.brokerBusy&&g.setTimeout)brokerTimer=g.setTimeout(()=>{ui.brokerBusy=false;$('brokerRefreshStatus').hidden=false;$('brokerRefreshStatus').textContent='Actualizarea Trading 212 nu a fost confirmată în intervalul de așteptare. Ultima copie salvată rămâne afișată.';renderRefresh();},65000);}
 const queueRefresh=()=>{if(doc.hidden)return;if(g.clearTimeout)g.clearTimeout(refreshTimer);if(g.setTimeout)refreshTimer=g.setTimeout(()=>{if(!doc.hidden)load(false);},150);else load(false);};
 g.addEventListener?.('focus',queueRefresh);
 g.addEventListener?.('storage',event=>{if(event.key===null||['ce_results_v2','tt_independent_scanner_v1','tt_trading212_portfolio_v1','tt_trading212_account_history_v1','tt_trading212_fills_v1'].includes(event.key))queueRefresh();});
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)queueRefresh();});
 g.addEventListener?.('message',event=>{
  if(!embedded||event.origin!==origin||event.source!==g.parent||!event.data||typeof event.data!=='object')return;
  if(event.data.ttShellVisible===true){queueRefresh();return;}
  const state=event.data.ttBrokerRefresh?.state;if(!['loading','ready','partial','error','busy'].includes(state))return;
  brokerPending(state);$('brokerRefreshStatus').hidden=false;
  $('brokerRefreshStatus').textContent={loading:'Actualizez contul Trading 212…',busy:'Trading 212 este ocupat sau limita de citire este activă. Reîncearcă după încheierea actualizării.',ready:'Actualizarea brokerului s-a încheiat. Verific ora ultimei citiri.',partial:'Actualizare Trading 212 parțială. Verific datele confirmate și ora citirii.',error:'Actualizarea Trading 212 nu a reușit. Ultima copie confirmată rămâne disponibilă.'}[state];
  renderRefresh();if(state==='ready'||state==='partial')queueRefresh();
 });
 function openFillsChannel(){try{if(!channel&&typeof g.BroadcastChannel==='function'){channel=new g.BroadcastChannel('tt-trading212-fills-changed-v1');channel.onmessage=event=>{const d=event.data;if(d&&typeof d==='object'&&d.key==='tt_trading212_fills_v1'&&Number.isSafeInteger(d.revision)&&d.revision>0&&d.revision<Number.MAX_SAFE_INTEGER&&Object.keys(d).every(k=>k==='key'||k==='revision'))queueRefresh();};}}catch(_){}}
 openFillsChannel();g.addEventListener?.('pageshow',event=>{openFillsChannel();if(event.persisted)queueRefresh();});
 g.addEventListener?.('pagehide',()=>{if(g.clearTimeout){g.clearTimeout(refreshTimer);g.clearTimeout(brokerTimer);}ui.brokerBusy=false;try{channel?.close();}catch(_){}channel=null;});
 if(g.setInterval)g.setInterval(()=>{if(!doc.hidden)queueRefresh();},60000);
 g.TodayDashboardUI.state=()=>({days:ui.days,tab:ui.tab,busy:ui.busy,brokerBusy:ui.brokerBusy,embedded});
 load();
})(typeof window!=='undefined'?window:globalThis);
