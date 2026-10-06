(function (g) {
  'use strict';
  const CACHE='tt_europe_scan_v2',SCAN_MS=5*60000,MAX_AGE=30*60000;
  const state={category:'growth',items:[],selected:null,scanning:false,updatedAt:0,verified:0,
    failures:[],benchmarks:[],timer:null,shellVisible:true,hasScan:false};
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
    for(const category of Object.keys(EuropeModel.categories))$('count-'+category).textContent=EuropeModel.rank(state.items,category).length;
    $('candidateCount').textContent=state.items.length;
    $('scanTime').textContent=state.updatedAt?new Date(state.updatedAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}):'Nescanat';
    render();
  }
  function render(){
    const definition=EuropeModel.categories[state.category];
    $('categoryTitle').textContent='Top 10 · '+definition.name;
    $('categoryDescription').textContent=definition.description;
    $('resultsPanel').setAttribute('aria-labelledby','tab-'+state.category);
    const query=$('search').value.trim().toLocaleLowerCase('ro-RO');
    const items=EuropeModel.rank(state.items.filter(x=>!query||[x.symbol,x.name,x.isin,x.sector,x.country].join(' ').toLocaleLowerCase('ro-RO').includes(query)),state.category);
    $('resultCount').textContent=items.length+' rezultate';
    if(!items.length){
      state.selected=null;
      $('results').innerHTML='<div class="empty"><h3>'+(state.scanning?'Scanarea este în curs':!state.hasScan?'Pregătit pentru Europa':'Niciun candidat pentru acest filtru')+'</h3><p>'
        +(query?'Schimbă textul căutării pentru a vedea alte acțiuni.':state.hasScan&&!state.verified?'Datele nu au putut fi verificate. Vezi acoperirea și erorile de mai jos, apoi reîncearcă scanarea.':'Lista include numai acțiuni care îndeplinesc criteriile strategiei și filtrul de lichiditate. Poate avea mai puțin de zece rezultate.')+'</p></div>';
    }else{
      state.selected=items.find(x=>x.symbol===state.selected?.symbol)||items[0];
      $('results').innerHTML=items.map((x,i)=>'<button class="stock'+(x===state.selected?' selected':'')+'" data-symbol="'+esc(x.symbol)+'" aria-pressed="'+(x===state.selected)+'">'
        +'<div class="stock-head"><span class="rank">'+String(i+1).padStart(2,'0')+'</span><div class="identity"><b>'+esc(x.symbol)+'</b><small>'+esc(x.name)+'</small></div><span class="score" aria-label="Scor tehnic '+x.score+' din 100">'+x.score+'</span></div>'
        +'<div class="stock-meta"><span class="badge">'+esc(x.country)+' · '+esc(x.exchange)+'</span><span class="badge">'+esc(x.sector)+'</span><span class="badge '+x.state.toLowerCase()+'">'+esc(x.state)+'</span><span class="badge">EOD '+esc(x.sourceDate)+'</span></div>'
        +'<div class="stock-metrics"><div><small>Preț · '+esc(x.currency)+'</small><b>'+fmt(x.price)+'</b></div><div><small>Variație zi</small><b class="'+(x.dayChg>=0?'up':'down')+'">'+signed(x.dayChg)+'</b></div>'
        +'<div><small>'+(x.mode==='momentum'?'Randament 20z':'De la maxim')+'</small><b class="'+(x.mode==='momentum'&&x.ret20>=0?'up':'down')+'">'+signed(x.mode==='momentum'?x.ret20:x.drawdown)+'</b></div><div><small>RVOL · sesiune încheiată</small><b>'+fmt(x.rvol)+'×</b></div></div></button>').join('');
      $('results').querySelectorAll('[data-symbol]').forEach(button=>button.onclick=()=>{
        state.selected=items.find(x=>x.symbol===button.dataset.symbol);render();
        if(g.matchMedia('(max-width:760px)').matches)$('detail').scrollIntoView({block:'start',behavior:g.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
      });
    }
    renderDetail(state.selected);
  }
  function spark(values){
    const lo=Math.min(...values),range=Math.max(...values)-lo||1;
    const pts=values.map((v,i)=>fmt(i*320/(values.length-1),1).replace(',','.')+','+fmt(102-(v-lo)*94/range,1).replace(',','.')).join(' ');
    return '<svg class="spark" viewBox="0 0 320 110" role="img" aria-label="Prețul ultimelor '+values.length+' sesiuni încheiate"><polyline points="'+pts+'"/></svg>';
  }
  function metric(label,value){return '<div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>';}
  function renderDetail(x){
    if(!x){$('detail').innerHTML='<h2>Analiza acțiunii</h2><p>Selectează un candidat pentru trend, volum și niveluri tehnice.</p>';return;}
    const stale=!g.DailySeries.usable(x)||Date.now()-x.ts>MAX_AGE;
    $('detail').innerHTML='<span class="kicker">'+esc(EuropeModel.categories[x.category].name)+'</span><h2>'+esc(x.symbol)+'</h2><p>'+esc(x.name)+' · '+esc(x.exchange)+'</p><p>ISIN '+esc(x.isin)+' · jurisdicție '+esc(x.jurisdiction)+' · Salt Bank, pagina '+esc(x.sourcePage)+'</p><p class="price">'+esc(money(x))+'</p><p>EOD '+esc(x.sourceDate)+' · '+esc(x.sourceTimezone)+'</p>'
      +'<p class="score-label">Scor tehnic '+x.score+'/100 · '+esc(stale?'SCANARE EXPIRATĂ':x.state)+'</p>'+spark(x.spark)
      +'<div class="detail-grid">'+metric('RS vs '+x.index,signed(x.rs))+metric('RSI 14',fmt(x.rsi,1))+metric('Față de EMA21',signed(x.ext))+metric('Revenire din minim 60z',signed(x.bounce))+metric('Rulaj mediu 20z',fmt(x.turnover,0)+' '+x.currency)+metric('Minim rulaj · filtru',fmt(x.minTurnover,0)+' '+x.currency)+'</div>'
      +'<h3>De ce apare în listă</h3><p>'+esc(x.reason)+'</p><h3>Niveluri tehnice · '+esc(x.currency)+'</h3>'
      +'<div class="levels"><div><span>Referință intrare</span><b>'+fmt(x.entryLow)+'–'+fmt(x.entryHigh)+'</b></div><div><span>Stop · 1,25 ATR</span><b>'+fmt(x.stop)+'</b></div><div><span>Țintă · 2R față de preț</span><b>'+fmt(x.target)+'</b></div></div>'
      +'<p class="plan-note">'+esc(x.planNote)+'</p><h3>Verificări înainte de decizie</h3><ul>'
      +(stale?'<li>Scanarea a expirat; rulează din nou înainte de analiză.</li>':'')+x.checks.map(t=>'<li>'+esc(t)+'</li>').join('')
      +(x.normalizedPence?'<li>Cotația sursei în pence a fost împărțită la 100; prețul, ATR și nivelurile sunt în GBP.</li>':'')+'</ul>'
      +'<button class="detail-action" id="watchlistBtn">'+(g.WL?.has(x.symbol)?'✓ În Watchlist · elimină':'+ Adaugă în Watchlist')+'</button>'
      +'<a class="detail-action" href="https://finance.yahoo.com/quote/'+encodeURIComponent(x.symbol)+'/" target="_blank" rel="noopener noreferrer">Deschide graficul și sursa ↗</a>';
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
    $('scanDetailsTitle').textContent='Acoperire · '+state.verified+' serii verificate · '+state.failures.length+' excluse';
    $('scanDetailsBody').innerHTML='<p><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">Lista de instrumente Salt Bank ↗</a> · consultată '+esc(source.checkedAt)+'. '+source.totalInstruments+' instrumente: '+source.assetCounts['Common Stock']+' acțiuni, '+source.assetCounts.ETF+' ETF-uri, '+source.assetCounts.ETN+' ETN-uri și '+source.assetCounts.ETC+' ETC-uri.</p>'
      +'<p>Europa: '+EuropeUniverse.stocks.length+' listări mapate după ISIN în '+Object.keys(EuropeUniverse.markets).length+' piețe. Jurisdicția emitentului și bursa sunt păstrate separat. Sunt scanate exclusiv acțiunile din document; ETF-urile, ETN-urile și ETC-urile sunt excluse.</p>'
      +'<p>Watchlist: '+outside.length+' simboluri din afara universului Salt Europa nu sunt scanate aici. Lista personală rămâne salvată.</p>'
      +'<div><b>Acțiuni cu jurisdicție europeană neincluse</b><ul>'+EuropeUniverse.excluded.map(x=>'<li>'+esc(x.name||x.sourceName)+' · '+esc(x.isin)+' · '+esc(x.reason)+'</li>').join('')+'</ul></div>'
      +'<p>Rulajul minim este un prag de filtrare separat pentru fiecare monedă, nu un curs valutar. Scorurile folosesc variații procentuale, RVOL și indicele bursei.</p>'
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
    if(!g.D?.fetchStock||!g.DailySeries||!g.TI?.calcEMA||!g.MEB?.computeEarlyBird){showAlert('Datele sau indicatorii nu s-au încărcat. Reîncarcă pagina.');return;}
    const list=universe();state.verified=0;state.failures=[];state.benchmarks=[];
    setBusy(true);showAlert('');$('universeCount').textContent=list.length+' acțiuni';progress(0,list.length);
    try{
      const markets=[...new Set(list.map(x=>x.market))],bench={};
      // Keep network pressure bounded, including benchmark requests.
      const marketQueue=markets.slice();
      async function benchmarkWorker(){while(marketQueue.length){const key=marketQueue.shift();bench[key]=await readBenchmark(EuropeUniverse.markets[key]);}}
      await Promise.all([benchmarkWorker(),benchmarkWorker()]);
      const items=[],queue=list.slice();let done=0;
      async function worker(){while(queue.length){const instrument=queue.shift();
        try{
          const series=DailySeries.read(await D.fetchStock(instrument.symbol,{range:'1y',interval:'1d',ttl:300}),instrument.symbol);
          const candidate=EuropeModel.build(instrument,series,bench[instrument.market],governor());
          state.verified++;if(candidate)items.push(candidate);
        }catch(error){state.failures.push({symbol:instrument.symbol,reason:error.message||'Date indisponibile'});}
        done++;progress(done,list.length);
      }}
      await Promise.all([worker(),worker(),worker()]);
      state.items=items;state.selected=null;state.updatedAt=Date.now();state.hasScan=true;
      const warnings=[];
      if(!list.length)warnings.push('Nicio acțiune din lista Salt Bank Europa nu corespunde filtrului sau Watchlist-ului.');
      else if(!state.verified)warnings.push('Nicio serie nu a putut fi verificată. Vezi erorile din Acoperire și reîncearcă.');
      else if(state.failures.length)warnings.push(state.failures.length+' simboluri excluse din cauza datelor; vezi Acoperire.');
      const noBench=state.benchmarks.filter(x=>!x.asOf).length;
      if(noBench)warnings.push(noBench+' indici indisponibili; candidații fără RS verificat rămân în monitorizare.');
      try{localStorage.setItem(CACHE,JSON.stringify({schema:2,filter:filterKey(),items,updatedAt:state.updatedAt,verified:state.verified,scanned:list.length,failures:state.failures,benchmarks:state.benchmarks}));}
      catch(_){warnings.push('Scanarea este disponibilă în această sesiune; copia locală nu a putut fi salvată.');}
      showAlert(warnings.join(' '));coverage();displayLists();
    }catch(error){
      state.items=[];state.selected=null;state.hasScan=true;state.updatedAt=0;
      showAlert('Scanarea nu s-a finalizat: '+(error.message||'eroare neașteptată')+'. Rulează din nou.');displayLists();coverage();
    }finally{setBusy(false);schedule();}
  }
  function loadCache(){
    try{
      const cache=JSON.parse(localStorage.getItem(CACHE)||'null');
      if(!cache||cache.schema!==2||cache.filter!==filterKey()||!Number.isFinite(cache.updatedAt)||cache.updatedAt>Date.now()+60000||Date.now()-cache.updatedAt>MAX_AGE||!Array.isArray(cache.items))return;
      const allowed=new Map(universe().map(x=>[x.symbol,x.isin]));
      if(cache.items.some(x=>!allowed.has(x.symbol)||allowed.get(x.symbol)!==x.isin||!EuropeModel.categories[x.category]||!DailySeries.usable(x)||!Array.isArray(x.spark)||!Array.isArray(x.checks)||!Number.isFinite(x.price)))return;
      Object.assign(state,{items:cache.items,updatedAt:cache.updatedAt,verified:cache.verified,failures:cache.failures||[],benchmarks:cache.benchmarks||[],hasScan:true});
      $('universeCount').textContent=cache.scanned+' acțiuni';progress(cache.scanned,cache.scanned);coverage();displayLists();
      showAlert('Ultima scanare locală · '+new Date(cache.updatedAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})+'. Se verifică din nou datele.');
    }catch(_){}
  }
  function schedule(){clearTimeout(state.timer);state.timer=setTimeout(()=>{if(visible())scan();else schedule();},SCAN_MS);}
  function switchCategory(category){
    state.category=category;state.selected=null;
    document.querySelectorAll('[data-category]').forEach(button=>{
      const selected=button.dataset.category===category;button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected);button.tabIndex=selected?0:-1;
    });render();
  }
  Object.entries(EuropeUniverse.markets).forEach(([key,market])=>{const option=document.createElement('option');option.value=key;option.textContent=market.name+' · '+market.exchange;$('market').appendChild(option);});
  $('scanBtn').onclick=scan;$('search').oninput=render;
  ['market','universe'].forEach(id=>$(id).onchange=()=>{state.items=[];state.selected=null;state.hasScan=false;state.updatedAt=0;displayLists();scan();});
  const tabs=[...document.querySelectorAll('[data-category]')];
  tabs.forEach((button,index)=>{
    button.onclick=()=>switchCategory(button.dataset.category);
    button.onkeydown=event=>{let next=null;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==null){event.preventDefault();tabs[next].focus();switchCategory(tabs[next].dataset.category);}};
  });
  g.addEventListener('message',event=>{if(event.origin!==location.origin||typeof event.data?.ttShellVisible!=='boolean')return;state.shellVisible=event.data.ttShellVisible;if(visible()&&!state.updatedAt)scan();});
  document.addEventListener('visibilitychange',()=>{if(visible()&&Date.now()-state.updatedAt>SCAN_MS)scan();});
  g.addEventListener('storage',event=>{if(event.key===g.WL?.KEY&&state.selected)renderDetail(state.selected);});
  $('universeCount').textContent=universe().length+' acțiuni';coverage();loadCache();schedule();setTimeout(scan,400);
})(window);
