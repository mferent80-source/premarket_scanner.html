// Fixed public universe and protocol. No brokerage data, credentials or position sizes.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
const output=process.argv[2]||'docs/garch-validation-latest.json',cache=new Map();
const context={fetch,URL,AbortController,AbortSignal,setTimeout,clearTimeout,console,localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}};vm.createContext(context);
for(const file of ['lib/data.js','lib/daily-series.js','lib/holdings-garch.js'])vm.runInContext(readFileSync(file,'utf8'),context);
const G=context.HoldingsGarch,report={schema:'garch-public-validation-v1',version:G.VERSION,generatedAt:new Date().toISOString(),config:G.CONFIG,source:'Yahoo Finance OHLCV · fluxul public existent',limits:['Evaluare retrospectivă, fără holdout prospectiv nou.','QLIKE și volatilitatea nu măsoară profitul sau pierderea maximă.','Ferestrele și blocurile pot rămâne corelate, chiar fără randamente comune.','Datele și ajustările furnizorului nu sunt certificate independent.','Protocolul și universul sunt fixe înaintea rulării; nu eliminăm instrumentele fără avantaj.'],results:[]};
for(const symbol of ['MSFT','JPM','XOM','SPY']){
 const entry={symbol,retrievedAt:new Date().toISOString()};
 try{const raw=await context.D.fetchStock(symbol,{range:'5y',interval:'1d',ttl:0}),source=context.DailySeries.read(raw,symbol),r=G.evaluate(G.dataset(source.bars));if(!G.valid(r))throw Error('Raport GARCH neverificabil.');
  Object.assign(entry,{status:'evaluated',asOf:source.asOf,currency:source.currency,bars:source.bars.length,assessment:G.assess(r),walk:r.walk,current:r.current,folds:r.folds.map(f=>({periods:f.periods,model:f.model,daily:f.metrics.daily,horizons:Object.fromEntries(G.HORIZONS.map(h=>{const {blocks,...metrics}=f.metrics.horizons[h];return [h,metrics];}))}))});
 }catch(e){Object.assign(entry,{status:'blocked',error:e.message});}
 report.results.push(entry);console.log(JSON.stringify({symbol,status:entry.status,asOf:entry.asOf,assessment:entry.assessment,walk:entry.walk,error:entry.error}));
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,evaluated:report.results.filter(x=>x.status==='evaluated').length}));
