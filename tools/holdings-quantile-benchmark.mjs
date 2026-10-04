// Fixed public universe, OHLCV only; no broker account, credentials or position sizes.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
const output=process.argv[2]||'docs/quantile-validation-latest.json',cache=new Map();
const context={fetch,URL,AbortController,AbortSignal,setTimeout,clearTimeout,console,localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}};vm.createContext(context);
for(const p of ['lib/data.js','lib/daily-series.js','lib/holdings-neural.js','lib/holdings-quantile.js'])vm.runInContext(readFileSync(p,'utf8'),context);
const Q=context.HoldingsQuantile,report={schema:'quantile-public-validation-v1',version:Q.VERSION,generatedAt:new Date().toISOString(),nominal:Q.NOMINAL,source:'Yahoo Finance OHLCV · fluxul public existent',limits:['Evaluare retrospectivă, fără holdout prospectiv nou.','Acoperirea observată sau nominală nu garantează acoperirea viitoare, profitul sau precizia pe o anumită deținere.','Regimurile și orizonturile pot rămâne corelate; nu presupunem interschimbabilitate.','Datele și ajustările furnizorului nu sunt certificate independent.'],results:[]};
for(const symbol of ['MSFT','JPM','XOM','SPY']){
 const entry={symbol,retrievedAt:new Date().toISOString()};
 try{const raw=await context.D.fetchStock(symbol,{range:'5y',interval:'1d',ttl:0}),source=context.DailySeries.read(raw,symbol),r=Q.evaluate(Q.dataset(source.bars));if(!Q.valid(r))throw Error('Raport neverificabil.');
  Object.assign(entry,{status:'evaluated',asOf:source.asOf,currency:source.currency,bars:source.bars.length,assessment:Q.assess(r),test:r.report.test,baseline:r.report.baseline,nonOverlap:r.report.nonOverlap,calibrationN:r.calibration.rows.length,folds:r.walk.status==='evaluated'?r.walk.folds.map(f=>({periods:f.report.periods,test:f.report.test,baseline:f.report.baseline,nonOverlap:f.report.nonOverlap})):[],walkStatus:r.walk.status});
 }catch(e){Object.assign(entry,{status:'blocked',error:e.message});}
 report.results.push(entry);console.log(JSON.stringify(entry));
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,evaluated:report.results.filter(x=>x.status==='evaluated').length}));
