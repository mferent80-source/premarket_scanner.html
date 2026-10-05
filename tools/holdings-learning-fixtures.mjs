import vm from 'node:vm';
import {readFileSync} from 'node:fs';
export function core(extra=[]){const c={setTimeout,clearTimeout};vm.createContext(c);for(const path of ['lib/daily-series.js','lib/holdings-forecast.js','lib/holdings-calibration.js','lib/holdings-learning.js',...extra])vm.runInContext(readFileSync(path,'utf8'),c);return c;}
export const e={scope:'private-account',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'synthetic'};
export const dates=[];for(let t=Date.parse('2024-01-02T13:30:00Z');dates.length<800;t+=86400000)if(![0,6].includes(new Date(t).getUTCDay()))dates.push(t);
export const plain=x=>JSON.parse(JSON.stringify(x));
export function fixture(c,n=40,{wrong=false,onlyClass=null,step=6}={}){const F=c.HoldingsForecast,entries=[];for(let i=0;i<n;i++){const at=i*step,t=dates[at],actual=onlyClass??i%3,predicted=wrong&&i>=40?(actual+1)%3:i%4===0?(actual+1)%3:actual,probabilities=[0,1,2].map(k=>k===predicted?.98:.01),capturedAt=t+8*3600000,checkedAt=dates[at+5]+8*3600000,bars=dates.slice(at,at+6).map((t,j)=>{const p=100+(actual-1)*2*j/5;return {t,o:p,h:p+1,l:p-1,c:p,v:10000};}),source={t,asOf:c.DailySeries.date(t,'America/New_York'),timezone:'America/New_York',closeMinutes:960,close:100,atrPct:1};
 for(const model of ['neural','boosting']){const r=F.project({model,modelVersion:F.VERSIONS[model],trainedAt:capturedAt-1000,state:'research',source,estimate:{classIndex:predicted,baselineClass:1,probabilities}},e,capturedAt);entries.push(F.verify(r,{symbol:e.symbol,currency:e.currency,timezone:source.timezone,bars,retrievedAt:checkedAt},checkedAt));}}
return {identity:{...e},ledger:{ok:true,entries}};}
