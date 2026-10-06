/* Explicit illustration. Uses the production projection and OHLC verifier, never persistence. */
(function(g){
'use strict';
function build(e,now=Date.now()){
 if(e?.kind!=='synthetic')throw Error('Exemplele cer identitate fictivă.');
 const F=g.HoldingsForecast,S=g.HoldingsStrategy,dates=[],entries=[];
 for(let t=Date.parse('2026-04-01T13:30:00Z');dates.length<73;t+=86400000)if(![0,6].includes(new Date(t).getUTCDay()))dates.push(t);
 for(let i=0;i<12;i++){
  const at=i*6,t=dates[at],capture=t+7.5*3600000,checkedAt=dates[at+5]+7.5*3600000;if(checkedAt>now)continue;
  const direction=[2,2,2,null,2,1,2,2,0,2,2,null][i],state=direction===null?'weak':['down','mixed','up'][direction],source={t,asOf:g.DailySeries.date(t,'America/New_York'),timezone:'America/New_York',closeMinutes:960,close:100,atrPct:2};
  const bars=dates.slice(at,at+6).map((t,j)=>({t,o:100,h:101+(j?j*.2:0),l:99,c:100+(j?j*.2:0),v:10000}));
  if([1,10].includes(i))bars[2]={...bars[2],h:105,c:103};
  if(i===2)bars[2]={...bars[2],l:97,c:98};
  if(i===4)bars[2]={...bars[2],o:97,l:96,c:98};
  if(i===6)bars[1]={...bars[1],h:105,l:97};
  if(i===7)bars[2]={...bars[2],o:106,h:107,l:105,c:106};
  const input={model:'verdict',modelVersion:F.VERSIONS.verdict,trainedAt:capture,state,source,estimate:{title:'EXEMPLU FICTIV · '+state,verdictState:state,direction,sourceFingerprint:'illustration-'+i,reasons:['Verdict inventat pentru verificarea mecanismului, fără antrenarea modelelor.'],cards:Object.entries(F.VERSIONS).filter(([id])=>id!=='verdict').map(([id,version])=>({id,version,state:'illustration',value:'Rezultat fictiv'}))}};
  const original=F.project(input,e,capture),plan=S.project(original,e,S.defaults(),capture),s={symbol:e.symbol,currency:e.currency,kind:e.kind,asOf:g.DailySeries.date(bars.at(-1).t,source.timezone),timezone:source.timezone,closeMinutes:960,bars,retrievedAt:checkedAt};
  entries.push(S.verify(plan,e,s,F.verify(original,s,checkedAt),checkedAt));
 }
 return entries;
}
g.HoldingsStrategyDemo={build};
})(typeof window!=='undefined'?window:globalThis);
