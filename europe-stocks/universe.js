// Only European listings mapped to an exact ISIN in the supplied Salt Bank PDF.
(function (g) {
  'use strict';
  const markets = {
    // 19.10.2026 (I-707): DAX e indice de performanță (dividende reinvestite); ceilalți indici sunt de preț
    DE:{name:'Germania',suffix:'DE',exchange:'Xetra',currency:'EUR',benchmark:'^GDAXI',index:'DAX',benchmarkBasis:'total',calendar:'XETRA'},
    FR:{name:'Franța',suffix:'PA',exchange:'Paris',currency:'EUR',benchmark:'^FCHI',index:'CAC 40',calendar:'PARIS'},
    NL:{name:'Olanda',suffix:'AS',exchange:'Amsterdam',currency:'EUR',benchmark:'^AEX',index:'AEX',calendar:'AMSTERDAM'},
    IT:{name:'Italia',suffix:'MI',exchange:'Milano',currency:'EUR',benchmark:'FTSEMIB.MI',index:'FTSE MIB',calendar:'MILAN'},
    ES:{name:'Spania',suffix:'MC',exchange:'Madrid',currency:'EUR',benchmark:'^IBEX',index:'IBEX 35',calendar:'MADRID'},
    UK:{name:'Regatul Unit',suffix:'L',exchange:'Londra',currency:'GBP',benchmark:'^FTSE',index:'FTSE 100',calendar:'LSE'},
    CH:{name:'Elveția',suffix:'SW',exchange:'SIX',currency:'CHF',benchmark:'^SSMI',index:'SMI',calendar:'SIX'},
    DK:{name:'Danemarca',suffix:'CO',exchange:'Copenhaga',currency:'DKK',benchmark:'^OMXC25',index:'OMX C25',calendar:'COPENHAGEN'},
    AT:{name:'Austria',suffix:'VI',exchange:'Viena',currency:'EUR',benchmark:'^ATX',index:'ATX',calendar:'VIENNA'},
    IE:{name:'Irlanda',suffix:'IR',exchange:'Dublin',currency:'EUR',benchmark:'^ISEQ',index:'ISEQ',calendar:'DUBLIN'}
  };
  const data=g.SaltEuropeData;
  const source=data.source;
  const stocks=data.rows.filter(x=>x.status==='mapped'&&x.assetType==='Common Stock'&&markets[x.market]
    &&x.symbol.endsWith('.'+markets[x.market].suffix));
  const excluded=data.rows.filter(x=>!stocks.includes(x));
  const bySymbol=new Map(stocks.map(x=>[x.symbol,x]));
  function describe(symbol) {
    const known=bySymbol.get(symbol);
    return known?{...markets[known.market],...known,country:markets[known.market].name}:null;
  }
  function list(market='all',watchlist=[],watchlistOnly=false) {
    const symbols=[...new Set(watchlistOnly?watchlist:stocks.map(x=>x.symbol))];
    return symbols.map(describe).filter(x=>x&&(market==='all'||x.market===market));
  }
  // Watchlist edits and source/mapping updates cannot reuse another universe's results.
  function cacheIdentity(market='all',watchlist=[],watchlistOnly=false) {
    return source.id+':'+market+':'+(watchlistOnly?'watchlist':'salt')+':'
      +list(market,watchlist,watchlistOnly).map(x=>x.symbol+'@'+x.isin).sort().join(',');
  }
  // 19.10.2026 (I-707): sesiunile EOD așteptate pe bursele din listă (închidere + 15 min); scanarea Europa merge în rețea doar când cheia se schimbă
  function sessionKey(items,now=Date.now(),calendar=g.ExchangeCalendar) {
    const ids=[...new Set(items.map(x=>markets[x.market]?.calendar).filter(Boolean))].sort();
    return ids.map(id=>{try{return id+':'+calendar.latest(now,id).day;}catch(_){return id+':?'+new Date(now).toISOString().slice(0,10);}}).join(',');
  }
  g.EuropeUniverse={markets,stocks,source,excluded,describe,list,cacheIdentity,sessionKey};
})(typeof window!=='undefined'?window:globalThis);
