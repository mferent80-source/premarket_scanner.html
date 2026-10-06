(function(g){
  'use strict';
  const FX_URL='https://api.frankfurter.dev/v2/providers/ecb/rates?base=EUR&quotes=USD,GBP,CHF,DKK,RON';
  const codes=['EUR','USD','GBP','CHF','DKK','RON'];
  let fx=null,calendar=null,calendarLoadedAt=0,loadingFx=null,loadingCalendar=null;
  const day=t=>new Date(t).toISOString().slice(0,10);
  function parseRates(rows,now=Date.now()){
    if(!Array.isArray(rows)||rows.length!==5)throw Error('Cursuri BCE incomplete.');
    const seen=new Set(),date=rows[0]?.date;
    const at=Date.parse(date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(at)||date>day(now)||now-at>5*86400000)throw Error('Data cursului BCE este veche sau invalidă.');
    const rates={EUR:1};
    for(const row of rows){
      if(row.base!=='EUR'||row.date!==date||!codes.includes(row.quote)||row.quote==='EUR'||seen.has(row.quote)||!Number.isFinite(row.rate)||row.rate<=0)throw Error('Pereche valutară invalidă.');
      seen.add(row.quote);rates[row.quote]=row.rate;
    }
    return {date,rates,checkedAt:now,source:FX_URL};
  }
  async function loadRates(){
    if(fx&&Date.now()-fx.checkedAt<3600000)return fx;
    if(loadingFx)return loadingFx;
    loadingFx=(async()=>{
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
      try{const response=await fetch(FX_URL,{signal:ctrl.signal});if(!response.ok)throw Error('BCE HTTP '+response.status);fx=parseRates(await response.json());return fx;}
      finally{clearTimeout(timer);loadingFx=null;}
    })();return loadingFx;
  }
  function conversion(table,from,to,now=Date.now()){
    if(!codes.includes(from)||!codes.includes(to))throw Error('Monedă nesuportată.');
    if(from===to)return {rate:1,date:null,sameCurrency:true};
    if(!table||!Number.isFinite(table.checkedAt)||table.checkedAt>now+60000||now-table.checkedAt>6*3600000||day(now)<table.date||now-Date.parse(table.date+'T00:00:00Z')>5*86400000)throw Error('Cursul trebuie verificat din nou.');
    const rate=table.rates[to]/table.rates[from];
    if(!Number.isFinite(rate)||rate<=0)throw Error('Pereche valutară indisponibilă.');
    return {rate,date:table.date,sameCurrency:false,source:table.source};
  }
  function parseCalendar(document,universe,now=Date.now()){
    const stamp=Date.parse(document?.generatedAt);
    if(document?.schema!==1||document.sourceId!==universe.source.id||!Number.isFinite(stamp)||stamp>now+60000||!Array.isArray(document.rows))throw Error('Calendarul nu corespunde listei Salt Bank.');
    const items=new Map();
    for(const row of document.rows){
      const instrument=universe.describe(row.symbol),checked=Date.parse(row.checkedAt);
      if(!instrument||instrument.isin!==row.isin||items.has(row.isin)||!['confirmed','estimated','reported','unknown'].includes(row.status)||!Number.isFinite(checked)||checked>now+60000||row.sourceUrl!=='https://finance.yahoo.com/quote/'+encodeURIComponent(row.symbol)+'/')throw Error('Identitate invalidă în calendar.');
      const dates=row.dates||[];
      if(!Array.isArray(dates)||dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))))throw Error('Dată invalidă în calendar.');
      items.set(row.isin,{...row,dates:dates.slice().sort()});
    }
    return {items,generatedAt:document.generatedAt,stale:now-stamp>5*86400000};
  }
  async function loadCalendar(universe){
    if(calendar&&Date.now()-calendarLoadedAt<3600000)return calendar;
    if(loadingCalendar)return loadingCalendar;
    loadingCalendar=(async()=>{
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
      try{
        for(const url of ['https://raw.githubusercontent.com/mferent80-source/premarket_scanner.html/main/europe-stocks/calendar.json','calendar.json']){
          try{const response=await fetch(url+'?t='+Math.floor(Date.now()/3600000),{signal:ctrl.signal});if(!response.ok)continue;calendar=parseCalendar(await response.json(),universe);calendarLoadedAt=Date.now();return calendar;}catch(error){if(ctrl.signal.aborted)throw error;}
        }
        throw Error('Calendarul public nu a putut fi încărcat.');
      }
      finally{clearTimeout(timer);loadingCalendar=null;}
    })();return loadingCalendar;
  }
  function earnings(document,instrument,now=Date.now()){
    const row=document?.items?.get(instrument.isin),today=g.DailySeries.date(now,instrument.sourceTimezone||'Europe/Bucharest');
    if(!row||row.symbol!==instrument.symbol)return {status:'unknown',reason:'Calendar indisponibil pentru acest ISIN.',dates:[],near:false};
    const dates=row.dates.filter(d=>d>=today);
    if(document.stale||now-Date.parse(row.checkedAt)>5*86400000)return {...row,status:'stale',dates,near:false,reason:'Calendarul are peste 5 zile; data trebuie reverificată.'};
    if(!dates.length)return {...row,status:'unknown',dates:[],near:false,reason:row.reason||'Sursa nu oferă o dată viitoare.'};
    const days=Math.floor((Date.parse(dates[0]+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    return {...row,dates,days,near:days<=7};
  }
  g.EuropeFinance={FX_URL,codes,parseRates,loadRates,conversion,parseCalendar,loadCalendar,earnings};
})(typeof window!=='undefined'?window:globalThis);
