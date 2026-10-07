(function (g) {
  'use strict';
  const CACHE='tt_europe_scan_v3',RISK_SETTINGS='tt_europe_risk_settings_v1',SCAN_MS=5*60000,MAX_AGE=30*60000;
  const scanCache=g.EuropeScanCache?.create(localStorage);
  const state={category:'growth',items:[],selected:null,scanning:false,updatedAt:0,verified:0,
    failures:[],benchmarks:[],timer:null,shellVisible:true,hasScan:false,context:null,calendar:null,calendarError:null,mobileDetailOpen:false};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('ro-RO',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const signed=n=>Number.isFinite(n)?(n>0?'+':'')+fmt(n,1)+'%':'—';
  const money=x=>fmt(x.price)+' '+x.currency;
  function visible(){return !document.hidden&&state.shellVisible&&!g.frameElement?.hidden;}
  function universe(){return EuropeUniverse.list($('market').value,g.WL?.get()||[],$('universe').value==='watchlist');}
  function filterKey(){return EuropeUniverse.cacheIdentity($('market').value,g.WL?.get()||[],$('universe').value==='watchlist');}
  function showAlert(text){$('scanAlert').textContent=text;$('scanAlert').hidden=!text;}
  function governor(){try{return g.GV?.status()||null;}catch(_){return null;}}
  let historyRead=EuropeHistory.read(localStorage,EuropeUniverse);let cloudState=null;try{cloudState=g.parent?.TTCloud?.state()||null;}catch{}
  state.history=historyRead.document;state.historyError=historyRead.error;
  function riskSettings(){try{const s=JSON.parse(localStorage.getItem(RISK_SETTINGS)||'null');return s&&EuropeFinance.codes.includes(s.currency)?s:{};}catch(_){return {};}}
  function refreshCalendar(){
    EuropeFinance.loadCalendar(EuropeUniverse).then(calendar=>{state.calendar=calendar;state.calendarError=null;coverage();refreshVerdict(state.selected);if(state.selected&&$('earningsPanel'))$('earningsPanel').outerHTML=EuropeView.earnings(EuropeFinance.earnings(calendar,state.selected),state.selected);})
      .catch(error=>{state.calendarError=error.message;refreshVerdict(state.selected);if(state.selected&&$('earningsPanel')){const e=EuropeFinance.earnings(state.calendar,state.selected);if(!state.calendar)e.reason=error.message;$('earningsPanel').outerHTML=EuropeView.earnings(e,state.selected);}});
  }
  function filtered(){
    const query=$('search').value.trim().toLocaleLowerCase('ro-RO'),sector=$('sectorFilter').value,status=$('stateFilter').value;
    return state.items.filter(x=>(sector==='all'||x.sector===sector)&&(status==='all'||x.state===status)&&(!query||[x.symbol,x.name,x.isin,x.sector,x.country].join(' ').toLocaleLowerCase('ro-RO').includes(query)));
  }
  function setBusy(on){
    state.scanning=on;
    ['scanBtn','market','universe'].forEach(id=>$(id).disabled=on);
    $('scanState').textContent=on?'Se verifică datele…':state.verified?'Scanare finalizată':'Nicio serie verificată';
  }
  function progress(done,total){
    const pct=total?Math.round(done/total*100):0;
    $('scanProgress').setAttribute('aria-valuenow',pct);$('progressFill').style.width=pct+'%';
    $('verifiedCount').textContent=state.verified+' / '+total;
    if(state.scanning)$('scanState').textContent='Scanate '+done+' / '+total;
  }
  function displayLists(){
    for(const category of Object.keys(EuropeModel.categories))$('count-'+category).textContent=EuropeModel.rank(filtered(),category,$('sortBy').value).length;
    $('candidateCount').textContent=state.items.length;
    $('scanTime').textContent=state.updatedAt?new Date(state.updatedAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}):'Nescanat';
    render();renderContext();renderHistory();
  }
  function renderContext(){const market=$('market').value,scope=($('universe').value==='watchlist'?'Watchlist ∩ Salt Europa':'Lista Salt Bank')+(market!=='all'?' · '+EuropeUniverse.markets[market].name:' · toate piețele mapate');$('marketContext').innerHTML=EuropeView.context(state.context,scope);}
  function renderHistory(){$('signalHistory').innerHTML=EuropeView.history(state.history,state.historyError,$('market').value,$('sectorFilter').value);renderSyncState();}
  function renderSyncState(){const node=$('europeSyncState');if(!node)return;const s=cloudState;node.textContent=!s?.ready?'Istoricul și setările de risc sunt salvate local. Sincronizarea PC ↔ telefon așteaptă activarea serviciului.':!s.supportedKeys?.includes(EuropeHistory.KEY)||!s.supportedKeys?.includes(RISK_SETTINGS)?'Istoricul și setările Europa rămân local: serviciul trebuie actualizat.':!s.connected?'Conectează același cont Google în Cont & sincronizare pentru istoricul și setările Europa.':s.conflicts?.some(k=>k===EuropeHistory.KEY||k===RISK_SETTINGS)?'Datele Europa au diferențe care cer alegerea ta în Cont & sincronizare.':s.error?'Sincronizarea nu s-a finalizat. Datele Europa rămân local; verifică Cont & sincronizare.':s.busy?'Se reconciliază istoricul și setările Europa…':s.lastSync?'Datele Europa sunt incluse în sincronizare · ultima reconciliere '+new Date(s.lastSync).toLocaleString('ro-RO')+'.':'Cont conectat. Se așteaptă prima reconciliere a datelor Europa.';}
  function placeDetail(){
    const mobile=g.matchMedia('(max-width:760px)').matches,detail=$('detail'),workspace=$('resultsPanel');
    detail.hidden=mobile&&!state.mobileDetailOpen;
    const selected=$('results').querySelector('[data-symbol="'+(state.selected?.symbol||'')+'"]');
    if(mobile&&selected)selected.after(detail);else workspace.appendChild(detail);
  }
  function render(){
    // Move the shared analysis out before replacing its current parent on mobile.
    $('resultsPanel').appendChild($('detail'));
    const definition=EuropeModel.categories[state.category];
    $('categoryTitle').textContent='Top 10 · '+definition.name;
    $('categoryDescription').textContent=definition.description;
    $('resultsPanel').setAttribute('aria-labelledby','tab-'+state.category);
    const query=$('search').value.trim().toLocaleLowerCase('ro-RO'),matching=filtered(),items=EuropeModel.rank(matching,state.category,$('sortBy').value);
    $('resultCount').textContent=items.length+' / '+matching.filter(x=>x.category===state.category).length+' candidați';
    if(!items.length){
      state.selected=null;
      $('results').innerHTML='<div class="empty"><h3>'+(state.scanning?'Scanarea este în curs':!state.hasScan?'Pregătit pentru Europa':'Niciun candidat pentru acest filtru')+'</h3><p>'
        +(query?'Schimbă textul căutării pentru a vedea alte acțiuni.':state.hasScan&&!state.verified?'Datele nu au putut fi verificate. Vezi acoperirea și erorile de mai jos, apoi reîncearcă scanarea.':'Lista include numai acțiuni care îndeplinesc criteriile strategiei și filtrul de lichiditate. Poate avea mai puțin de zece rezultate.')+'</p></div>';
    }else{
      state.selected=items.find(x=>x.symbol===state.selected?.symbol)||items[0];
      $('results').innerHTML=items.map((x,i)=>'<button class="stock'+(x===state.selected?' selected':'')+'" data-symbol="'+esc(x.symbol)+'" aria-pressed="'+(x===state.selected)+'">'
        +'<div class="stock-head"><span class="rank">'+String(i+1).padStart(2,'0')+'</span><div class="identity"><b>'+esc(x.symbol)+'</b><small>'+esc(x.name)+'</small></div><span class="score" aria-label="Scor tehnic '+x.score+' din 100">'+x.score+'</span></div>'
        +'<div class="stock-meta"><span class="badge">'+esc(x.country)+' · '+esc(x.exchange)+'</span><span class="badge">'+esc(x.sector)+'</span><span class="badge '+x.state.toLowerCase()+'">'+esc(EuropeView.stateNames[x.state])+'</span><span class="badge">EOD '+esc(x.sourceDate)+'</span>'+(EuropeHistory.badge(state.history,x)?'<span class="badge new-signal">'+esc(EuropeHistory.badge(state.history,x))+'</span>':'')+'</div>'
        +'<div class="stock-metrics"><div><small>Preț · '+esc(x.currency)+'</small><b>'+fmt(x.price)+'</b></div><div><small>Variație zi</small><b class="'+(x.dayChg>=0?'up':'down')+'">'+signed(x.dayChg)+'</b></div>'
        +'<div><small>'+(x.mode==='momentum'?'Randament 20z':'De la maxim')+'</small><b class="'+(x.mode==='momentum'&&x.ret20>=0?'up':'down')+'">'+signed(x.mode==='momentum'?x.ret20:x.drawdown)+'</b></div><div><small>RVOL · sesiune încheiată</small><b>'+fmt(x.rvol)+'×</b></div></div><div class="card-plan"><span>'+esc(EuropeView.setupNames[x.plan.state])+'</span><b>Confirmare '+fmt(x.plan.trigger)+' '+esc(x.currency)+'</b><small>Apasă pentru analiză, calendar și risc</small></div></button>').join('');
      $('results').querySelectorAll('[data-symbol]').forEach(button=>button.onclick=()=>{
        state.selected=items.find(x=>x.symbol===button.dataset.symbol);state.mobileDetailOpen=true;render();
        if(g.matchMedia('(max-width:760px)').matches)$('detail').scrollIntoView({block:'start',behavior:g.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
      });
    }
    renderDetail(state.selected);
    placeDetail();
  }
  function refreshVerdict(x){if(!x)return;const e=EuropeFinance.earnings(state.calendar,x);
    g.TTDecisionPanel?.set({purpose:'entry',executionMode:'native',candidate:x,risk:g.GV?.status?.()||x.governor,earnings:{known:['confirmed','estimated','reported'].includes(e.status),blocked:Number.isFinite(e.days)&&e.days<=1}});
  }
  function renderDetail(x){
    if(!x){g.TTDecisionPanel?.set({purpose:'entry'});$('detail').innerHTML='<h2>Analiza acțiunii</h2><p>Selectează un candidat pentru trend, volum și niveluri tehnice.</p>';return;}
    const stale=!g.DailySeries.usable(x)||Date.now()-x.ts>MAX_AGE;
    const e=EuropeFinance.earnings(state.calendar,x);if(state.calendarError&&!state.calendar)e.reason=state.calendarError;
    refreshVerdict(x);
    $('detail').innerHTML=EuropeView.detail(x,{stale,earnings:e,settings:riskSettings()});
    $('closeDetail').onclick=()=>{state.mobileDetailOpen=false;placeDetail();$('results').querySelector('[data-symbol="'+x.symbol+'"]')?.scrollIntoView({block:'nearest'});};
    $('chartCursor').oninput=event=>{
      const index=Number(event.target.value),bar=x.chart[index],lo=Number(event.target.dataset.low),span=Number(event.target.dataset.span);
      if(!bar)return;
      $('chartPoint').setAttribute('cx',14+index*460/(x.chart.length-1));$('chartPoint').setAttribute('cy',190-(bar.c-lo)/span*168);
      $('chartReadout').textContent=DailySeries.date(bar.t,x.sourceTimezone)+' · '+fmt(bar.c)+' '+x.currency+' · EMA21 '+fmt(bar.ema21)+' · EMA50 '+fmt(bar.ema50);
    };
    $('riskForm').onsubmit=async event=>{
      event.preventDefault();const node=$('riskResult'),symbol=x.symbol;
      const input={currency:$('riskCurrency').value,budget:$('riskBudget').value,loss:$('riskLoss').value,fees:$('riskFees').value,entry:$('riskEntry').value,fractional:$('riskStep').value==='fractional'};
      node.innerHTML='<p>Se verifică cursul de referință…</p>';
      try{
        const rate=EuropeFinance.conversion(x.currency===input.currency?null:await EuropeFinance.loadRates(),x.currency,input.currency);
        if(state.selected?.symbol!==symbol||node!==$('riskResult'))return;
        const result=EuropeDecision.calculateRisk(input,x.plan,rate);node.innerHTML=EuropeView.riskResult(result,rate,x);
        if(result.ok){try{localStorage.setItem(RISK_SETTINGS,JSON.stringify(input));}catch(_){node.innerHTML+='<p>Setările calculatorului nu au putut fi salvate local.</p>';}}
      }catch(error){if(state.selected?.symbol===symbol&&node===$('riskResult'))node.innerHTML='<p class="risk-error">'+esc(error.message||'Cursul nu poate fi verificat.')+'</p>';}
    };
    $('watchlistBtn').onclick=()=>{
      if(!g.WL){showAlert('Watchlist-ul nu s-a încărcat.');return;}
      const was=g.WL.has(x.symbol);g.WL.toggle(x.symbol);
      if(g.WL.has(x.symbol)===was)showAlert('Watchlist-ul nu a putut fi salvat. Verifică spațiul local disponibil.');
      renderDetail(x);
    };
  }
  function coverage(){
    const source=EuropeUniverse.source;
    const outside=[...new Set(g.WL?.get()||[])].filter(s=>!EuropeUniverse.describe(s));
    const earningsRows=EuropeUniverse.stocks.map(x=>EuropeFinance.earnings(state.calendar,x)),known=earningsRows.filter(x=>['confirmed','estimated','reported'].includes(x.status));
    $('scanDetailsTitle').textContent='Acoperire · '+state.verified+' serii verificate · '+state.failures.length+' excluse';
    $('scanDetailsBody').innerHTML='<p><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">Lista de instrumente Salt Bank ↗</a> · consultată '+esc(source.checkedAt)+'. '+source.totalInstruments+' instrumente: '+source.assetCounts['Common Stock']+' acțiuni, '+source.assetCounts.ETF+' ETF-uri, '+source.assetCounts.ETN+' ETN-uri și '+source.assetCounts.ETC+' ETC-uri.</p>'
      +'<p>Europa: '+EuropeUniverse.stocks.length+' listări mapate după ISIN în '+Object.keys(EuropeUniverse.markets).length+' piețe. Jurisdicția emitentului și bursa sunt păstrate separat. Sunt scanate exclusiv acțiunile din document; ETF-urile, ETN-urile și ETC-urile sunt excluse.</p>'
      +'<p>Watchlist: '+outside.length+' simboluri din afara universului Salt Europa nu sunt scanate aici. Lista personală rămâne salvată.</p>'
      +'<div><b>Acțiuni cu jurisdicție europeană neincluse</b><ul>'+EuropeUniverse.excluded.map(x=>'<li>'+esc(x.name||x.sourceName)+' · '+esc(x.isin)+' · '+esc(x.reason)+'</li>').join('')+'</ul></div>'
      +'<p>Rulajul minim este un prag de filtrare separat pentru fiecare monedă, nu un curs valutar. Scorurile folosesc variații procentuale, RVOL și indicele bursei.</p>'
      +'<p>Calendar rezultate: '+known.length+' / '+EuropeUniverse.stocks.length+' date viitoare disponibile; '+known.filter(x=>x.status==='confirmed').length+' confirmate de sursă, '+known.filter(x=>x.status==='estimated').length+' estimate. Celelalte date sunt necunoscute sau necesită reverificare. Actualizarea publică rulează în zilele lucrătoare; în pagină se reverifică snapshot-ul la o oră.</p>'
      +'<div class="checks-grid"><div><b>Indici de comparație</b><ul>'+state.benchmarks.map(x=>'<li>'+esc(x.name)+' · '+esc(x.index)+' · '+esc(x.asOf||x.reason||'indisponibil')+'</li>').join('')+'</ul></div><div><b>Simboluri excluse</b><ul>'
      +state.failures.map(x=>'<li>'+esc(x.symbol)+' · '+esc(x.reason)+'</li>').join('')+'</ul>'+(state.failures.length?'':'<p>Nicio eroare de date în scanarea curentă.</p>')+'</div></div>'
      +'<p>Calendarul sărbătorilor nu este confirmat; o serie cu sesiunea așteptată absentă este exclusă. PDF-ul nu precizează bursa de execuție și moneda din Salt Bank; verifică instrumentul după ISIN în aplicația băncii. Lista este o copie consultată la data indicată, nu o verificare în timp real a disponibilității.</p>';
  }
  async function readBenchmark(market){
    try{
      const source=DailySeries.read(await D.fetchStock(market.benchmark,{range:'6mo',interval:'1d',ttl:300}),market.benchmark);
      if(source.bars.length<21)throw Error('Istoric indice insuficient.');
      const c=source.bars.map(b=>b.c),ret20=(c[c.length-1]/c[c.length-21]-1)*100;
      const out={symbol:market.benchmark,ret20,asOf:source.asOf};
      state.benchmarks.push({...out,name:market.name,index:market.index});return out;
    }catch(error){state.benchmarks.push({name:market.name,index:market.index,reason:error.message||'Date indisponibile'});return null;}
  }
  async function scan(){
    if(state.scanning||!visible())return;
    refreshCalendar();
    if(!g.D?.fetchStock||!g.DailySeries||!g.TI?.calcEMA||!g.MEB?.computeEarlyBird||!g.EuropeDecision){showAlert('Datele sau indicatorii nu s-au încărcat. Reîncarcă pagina.');return;}
    const list=universe();state.verified=0;state.failures=[];state.benchmarks=[];
    setBusy(true);showAlert('');$('universeCount').textContent=list.length+' acțiuni';progress(0,list.length);
    try{
      const markets=[...new Set(list.map(x=>x.market))],bench={};
      // Keep network pressure bounded, including benchmark requests.
      const marketQueue=markets.slice();
      async function benchmarkWorker(){while(marketQueue.length){const key=marketQueue.shift();bench[key]=await readBenchmark(EuropeUniverse.markets[key]);}}
      await Promise.all([benchmarkWorker(),benchmarkWorker()]);
      const items=[],observations=[],summaries=[],queue=list.slice();let done=0;
      async function worker(){while(queue.length){const instrument=queue.shift();
        try{
          const series=DailySeries.read(await D.fetchStock(instrument.symbol,{range:'1y',interval:'1d',ttl:300}),instrument.symbol);
          const analysis=EuropeModel.analyze(instrument,series),candidate=EuropeModel.candidate(analysis,bench[instrument.market],governor());
          summaries.push(analysis.summary);observations.push({instrument,series:analysis.source,candidate});
          state.verified++;if(candidate)items.push(candidate);
        }catch(error){state.failures.push({symbol:instrument.symbol,reason:error.message||'Date indisponibile'});}
        done++;progress(done,list.length);
      }}
      await Promise.all([worker(),worker(),worker()]);
      state.items=items;state.selected=null;state.updatedAt=Date.now();state.hasScan=true;
      state.context=EuropeDecision.breadth(summaries,list.length);
      if(!state.historyError){const observation=await EuropeHistory.record(localStorage,EuropeUniverse,observations,state.updatedAt,g.navigator?.locks,state.history);state.history=observation.document;state.historyError=observation.error;}
      const warnings=[];
      if(!list.length)warnings.push('Nicio acțiune din lista Salt Bank Europa nu corespunde filtrului sau Watchlist-ului.');
      else if(!state.verified)warnings.push('Nicio serie nu a putut fi verificată. Vezi erorile din Acoperire și reîncearcă.');
      else if(state.failures.length)warnings.push(state.failures.length+' simboluri excluse din cauza datelor; vezi Acoperire.');
      const noBench=state.benchmarks.filter(x=>!x.asOf).length;
      if(noBench)warnings.push(noBench+' indici indisponibili; candidații fără RS verificat rămân în monitorizare.');
      try{const snapshot={schema:3,policy:EuropeDecision.VERSION,filter:filterKey(),items,context:state.context,updatedAt:state.updatedAt,verified:state.verified,scanned:list.length,failures:state.failures,benchmarks:state.benchmarks};if(scanCache)await scanCache.save(snapshot);else localStorage.setItem(CACHE,JSON.stringify(snapshot));}
      catch(_){warnings.push('Scanarea este disponibilă în această sesiune; copia locală nu a putut fi salvată.');}
      showAlert(warnings.join(' '));coverage();displayLists();
    }catch(error){
      state.items=[];state.selected=null;state.context=null;state.hasScan=true;state.updatedAt=0;
      showAlert('Scanarea nu s-a finalizat: '+(error.message||'eroare neașteptată')+'. Rulează din nou.');displayLists();coverage();
    }finally{setBusy(false);schedule();}
  }
  function applyCache(cache){
    try{
      if(!cache||cache.schema!==3||cache.policy!==EuropeDecision.VERSION||cache.filter!==filterKey()||!Number.isFinite(cache.updatedAt)||cache.updatedAt>Date.now()+60000||Date.now()-cache.updatedAt>MAX_AGE||!Array.isArray(cache.items))return;
      const allowed=new Map(universe().map(x=>[x.symbol,x.isin]));
      if(cache.items.some(x=>!allowed.has(x.symbol)||allowed.get(x.symbol)!==x.isin||!EuropeModel.categories[x.category]||!DailySeries.usable(x)||!Array.isArray(x.chart)||x.chart.length<2||x.chart.length>90||x.chart.some(b=>![b.t,b.c].every(Number.isFinite)||b.c<=0||[b.ema21,b.ema50].some(v=>v!=null&&!Number.isFinite(v)))||![x.chart.at(-1).ema21,x.chart.at(-1).ema50].every(Number.isFinite)||!Array.isArray(x.checks)||!Number.isFinite(x.price)||x.price<=0||x.plan?.version!==EuropeDecision.VERSION||!['WAIT','CONFIRMED','EXTENDED','INVALID'].includes(x.plan.state)||![x.plan.trigger,x.plan.entryHigh,x.plan.support,x.plan.stop].every(Number.isFinite)||!Array.isArray(x.scoreParts)))return;
      Object.assign(state,{items:cache.items,context:cache.context||null,updatedAt:cache.updatedAt,verified:cache.verified,failures:cache.failures||[],benchmarks:cache.benchmarks||[],hasScan:true});
      $('universeCount').textContent=cache.scanned+' acțiuni';progress(cache.scanned,cache.scanned);coverage();displayLists();
      showAlert('Ultima scanare locală · '+new Date(cache.updatedAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})+'. Se verifică din nou datele.');
    }catch(_){}
  }
  function loadCache(){
    try{applyCache(JSON.parse(localStorage.getItem(CACHE)||'null'));}catch{}
    const initial=state.updatedAt,filter=filterKey();
    scanCache?.read().then(cache=>{if(!state.scanning&&state.updatedAt===initial&&filterKey()===filter&&cache?.updatedAt>initial)applyCache(cache);}).catch(()=>{});
  }
  function schedule(){clearTimeout(state.timer);state.timer=setTimeout(()=>{if(visible())scan();else schedule();},SCAN_MS);}
  function switchCategory(category){
    state.category=category;state.selected=null;
    document.querySelectorAll('[data-category]').forEach(button=>{
      const selected=button.dataset.category===category;button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected);button.tabIndex=selected?0:-1;
    });displayLists();
  }
  Object.entries(EuropeUniverse.markets).forEach(([key,market])=>{const option=document.createElement('option');option.value=key;option.textContent=market.name+' · '+market.exchange;$('market').appendChild(option);});
  [...new Set(EuropeUniverse.stocks.map(x=>x.sector))].sort((a,b)=>a.localeCompare(b,'ro')).forEach(sector=>{const option=document.createElement('option');option.value=sector;option.textContent=sector;$('sectorFilter').appendChild(option);});
  $('scanBtn').onclick=scan;$('search').oninput=displayLists;
  ['sectorFilter','stateFilter','sortBy'].forEach(id=>$(id).onchange=displayLists);
  ['market','universe'].forEach(id=>$(id).onchange=()=>{state.items=[];state.selected=null;state.context=null;state.hasScan=false;state.updatedAt=0;displayLists();scan();});
  const tabs=[...document.querySelectorAll('[data-category]')];
  tabs.forEach((button,index)=>{
    button.onclick=()=>switchCategory(button.dataset.category);
    button.onkeydown=event=>{let next=null;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==null){event.preventDefault();tabs[next].focus();switchCategory(tabs[next].dataset.category);}};
  });
  g.addEventListener('message',event=>{if(event.origin!==location.origin||typeof event.data?.ttShellVisible!=='boolean')return;state.shellVisible=event.data.ttShellVisible;if(visible()&&!state.updatedAt)scan();});
  document.addEventListener('visibilitychange',()=>{if(visible()&&Date.now()-state.updatedAt>SCAN_MS)scan();});
  g.addEventListener('storage',event=>{
    if(event.key===EuropeHistory.KEY){historyRead=EuropeHistory.read(localStorage,EuropeUniverse);state.history=historyRead.document;state.historyError=historyRead.error;renderHistory();}
    if(event.key===RISK_SETTINGS&&state.selected&&!$('riskForm')?.contains(document.activeElement)){
      const s=riskSettings();for(const [id,key] of [['riskCurrency','currency'],['riskBudget','budget'],['riskLoss','loss'],['riskFees','fees']])if($(id))$(id).value=s[key]??(key==='currency'?'EUR':'');
      if($('riskStep'))$('riskStep').value=s.fractional?'fractional':'whole';if($('riskResult'))$('riskResult').textContent='Setările de risc au fost actualizate. Recalculează planul înainte de a folosi cantitatea.';
    }
    if(event.key===g.WL?.KEY){if($('universe').value==='watchlist')scan();else if(state.selected)renderDetail(state.selected);}
  });
  g.addEventListener('message',event=>{if(event.source===g.parent&&event.origin===location.origin&&event.data?.ttCloudState){cloudState=event.data.ttCloudState;renderSyncState();}});
  g.matchMedia('(max-width:760px)').addEventListener('change',placeDetail);
  $('advancedFilters').open=!g.matchMedia('(max-width:760px)').matches;
  refreshCalendar();
  $('universeCount').textContent=universe().length+' acțiuni';coverage();loadCache();schedule();setTimeout(scan,400);
})(window);
