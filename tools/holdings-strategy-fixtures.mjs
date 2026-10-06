import vm from 'node:vm';import {readFileSync} from 'node:fs';
export const plain=x=>JSON.parse(JSON.stringify(x)),e={scope:'private-account',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'synthetic'};
export function core(extra=[],options={}){const c={Date,setTimeout,clearTimeout,...options};vm.createContext(c);for(const path of ['lib/daily-series.js','lib/holdings-forecast.js','lib/holdings-strategy.js',...extra])vm.runInContext(readFileSync(path,'utf8'),c);return c;}
export function fixture(c,{identity=e,day='2026-09-18',direction=2,firstOpen=100}={}){
 const F=c.HoldingsForecast,S=c.HoldingsStrategy,dates=[];for(let t=Date.parse(day+'T13:30:00Z');dates.length<6;t+=86400000)if(![0,6].includes(new Date(t).getUTCDay()))dates.push(t);
 const capturedAt=dates[0]+7.5*3600000,now=dates[5]+7.5*3600000,source={t:dates[0],asOf:day,timezone:'America/New_York',closeMinutes:960,close:100,atrPct:2},state=direction===null?'weak':['down','mixed','up'][direction];
 const input={model:'verdict',modelVersion:F.VERSIONS.verdict,trainedAt:capturedAt,state,source,estimate:{title:'Verdict '+state,verdictState:state,direction,sourceFingerprint:'test-fingerprint',reasons:['Motiv original'],cards:Object.entries(F.VERSIONS).filter(([id])=>id!=='verdict').map(([id,version])=>({id,version,state:'research',value:'Raport verificat'}))}};
 const original=F.project(input,identity,capturedAt),trial=S.project(original,identity,S.defaults(),capturedAt),bars=dates.map((t,j)=>({t,o:j?firstOpen:100,h:(j?firstOpen:100)+1.5,l:(j?firstOpen:100)-.5,c:j===5?firstOpen+1:j?firstOpen:100,v:10000})),s={symbol:identity.symbol,currency:identity.currency,kind:identity.kind,asOf:c.DailySeries.date(dates.at(-1),source.timezone),timezone:source.timezone,closeMinutes:960,bars,retrievedAt:now};
 return {e:identity,input,original,trial,bars,source:s,capturedAt,now,resolve:()=>S.verify(trial,identity,s,F.verify(original,s,now),now)};
}
