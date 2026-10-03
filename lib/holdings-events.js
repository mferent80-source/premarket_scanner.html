(function(g){
'use strict';
const DAY=86400000,TTL=30*60000;
function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch(_){return null;}}
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function fresh(record,now=Date.now()){return !!record&&Number.isFinite(record.fetchedAt)&&record.fetchedAt<=now+60000&&now-record.fetchedAt<=TTL;}
function category(title){if(/earnings|profit|revenue|results|guidance|forecast/i.test(title))return 'Rezultate / ghidaj';if(/acquir|merger|takeover/i.test(title))return 'Fuziuni / achiziții';if(/lawsuit|regulat|probe|investigat|court/i.test(title))return 'Reglementare / litigii';if(/dividend|buyback|repurchase/i.test(title))return 'Distribuții / capital';return 'Știre asociată';}
function news(payload,symbol,now=Date.now()){
 const seen=new Set();return (Array.isArray(payload?.news)?payload.news:[]).filter(n=>Array.isArray(n.relatedTickers)&&n.relatedTickers.includes(symbol)).map(n=>({title:typeof n.title==='string'?n.title.trim().slice(0,350):'',url:safeURL(n.link),publisher:typeof n.publisher==='string'?n.publisher.slice(0,100):null,publishedAt:typeof n.providerPublishTime==='number'?n.providerPublishTime*1000:null})).filter(n=>n.title&&n.url&&n.publisher&&Number.isFinite(n.publishedAt)&&n.publishedAt<=now+60000&&now-n.publishedAt<=7*DAY).sort((a,b)=>b.publishedAt-a.publishedAt).filter(n=>{if(seen.has(n.url))return false;seen.add(n.url);return true;}).slice(0,5).map(n=>({...n,category:category(n.title)}));
}
function breadthEarnings(data,symbol,now=Date.now()){
 const expected=g.DailySeries?.expected(now,'America/New_York',960);if(!expected||data?.asOf!==expected)return null;
 const rows=[...(data.early_buy||[]),...(data.contrarian||[]),...(data.sectors||[]).flatMap(s=>s.ideas||[])];const row=rows.find(r=>r.ticker===symbol&&r.asOf===expected&&validDate(r.earnings));return row?{date:row.earnings,status:'ESTIMARE PROVIDER',source:'Yahoo Finance · Market Breadth',asOf:data.asOf,url:'https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/calendar/'}:null;
}
function calendar(data,symbol,now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),max=new Date(now+90*DAY).toISOString().slice(0,10);const rows=(Array.isArray(data?.earningsCalendar)?data.earningsCalendar:[]).filter(r=>r.symbol===symbol&&validDate(r.date)&&r.date>=today&&r.date<=max).sort((a,b)=>a.date.localeCompare(b.date));return rows[0]?{date:rows[0].date,hour:['bmo','amc','dmh'].includes(rows[0].hour)?rows[0].hour:null,status:'ESTIMARE PROVIDER',source:'Finnhub · calendar',url:'https://finnhub.io/docs/api/earnings-calendar'}:null;
}
function daysUntil(date,now=Date.now()){return validDate(date)?Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z'))/DAY):null;}
async function directJSON(url,key){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{signal:controller.signal,cache:'no-store',headers:key?{'X-Finnhub-Token':key}:{}});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
let breadthPromise=null,breadthAt=0;
async function fetchEvents(symbol){if(!/^[A-Z0-9][A-Z0-9.^=-]{0,24}$/.test(symbol))throw Error('Simbol invalid');const now=Date.now(),errors=[];if(!breadthPromise||now-breadthAt>=TTL){breadthAt=now;breadthPromise=directJSON('../market-breadth/generated/sector_ideas.json').catch(()=>null);}
 const key=g.FH_KEY?.get?.()||'',to=new Date(now).toISOString().slice(0,10),end=new Date(now+90*DAY).toISOString().slice(0,10);
 const [articles,generated,earn]=await Promise.all([g.D.fetchJSON('https://query1.finance.yahoo.com/v1/finance/search?q='+encodeURIComponent(symbol)+'&quotesCount=1&newsCount=15',{ttl:0,bust:1,timeout:5000,cacheKey:'holdings-news:'+symbol,validate:j=>Array.isArray(j?.news)&&Array.isArray(j?.quotes)&&j.quotes.some(q=>q.symbol===symbol)}).catch(()=>{errors.push('Știri indisponibile sau identitate neconfirmată.');return null;}),breadthPromise,key&&/^[A-Z][A-Z0-9.-]*$/.test(symbol)?directJSON('https://finnhub.io/api/v1/calendar/earnings?symbol='+encodeURIComponent(symbol)+'&from='+to+'&to='+end,key).then(j=>calendar(j,symbol,now)).catch(()=>{errors.push('Calendar Finnhub indisponibil pentru acest cont.');return null;}):Promise.resolve(null)]);
 const earnings=earn||breadthEarnings(generated,symbol,now);return {symbol,fetchedAt:Date.now(),news:news(articles,symbol,Date.now()),earnings,errors,newsAvailable:!!articles,calendarNote:earnings?'Data furnizorului trebuie confirmată pe pagina Investor Relations.':'Calendar automat fără dată utilizabilă. Absența unei date nu înseamnă absența rezultatelor.'};
}
g.HoldingsEvents={invalidate:()=>{breadthAt=0;breadthPromise=null;},safeURL,validDate,fresh,news,breadthEarnings,calendar,daysUntil,fetchEvents,category};
})(typeof window!=='undefined'?window:globalThis);
