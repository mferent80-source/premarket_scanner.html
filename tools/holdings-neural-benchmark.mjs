// Run from repository root. Public instrument histories only; never reads broker storage.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2),output=args[0]||'docs/neural-validation-latest.json';
if(args.length>1)throw Error('Usage: node tools/holdings-neural-benchmark.mjs [output.json]');
const cache=new Map(),context={fetch,URL,AbortController,AbortSignal,setTimeout,clearTimeout,console,localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}};
vm.createContext(context);
for(const path of ['lib/data.js','lib/daily-series.js','lib/holdings-neural.js','lib/holdings-neural-evaluation.js'])vm.runInContext(readFileSync(path,'utf8'),context);
const N=context.HoldingsNeural,E=context.HoldingsNeuralEvaluation;
const instruments=[{symbol:'MSFT',sector:'Tehnologie'},{symbol:'JPM',sector:'Financiare'},{symbol:'XOM',sector:'Energie'},{symbol:'SPY',sector:'ETF · piață largă'}];
const report={schema:'neural-public-validation-v1',generatedAt:new Date().toISOString(),networkVersion:N.VERSION,protocol:E.VERSION,source:'Yahoo Finance OHLCV · fluxul public existent',scope:'Patru instrumente alese înainte de evaluare; eșantion nereprezentativ. Modele separate per instrument.',limits:['OHLCV și ajustările providerului nu sunt certificate independent.','Nu sunt incluse dividende, costuri, slippage, știri sau earnings.','Scorurile nu sunt calibrate; evaluarea nu măsoară profitul.','Orizonturile fără suprapunere pot rămâne corelate.'],results:[]};
for(const instrument of instruments){
 const entry={...instrument};
 try{
  const raw=await context.D.fetchStock(instrument.symbol,{range:'5y',interval:'1d',ttl:0}),now=Date.now(),source=context.DailySeries.read(raw,instrument.symbol,now),data=N.dataset(source.bars,now),result=E.evaluate(data.rows,data.latest);
  if(!N.valid(result))throw Error('Model neverificabil.');
  Object.assign(entry,{status:'evaluated',retrievedAt:new Date(now).toISOString(),asOf:source.asOf,currency:source.currency,timezone:source.timezone,bars:source.bars.length,labeled:data.rows.length,from:new Date(source.bars[0].t).toISOString(),to:new Date(source.bars.at(-1).t).toISOString(),walk:result.walk,recent:{advantage:result.advantage,maxZ:result.maxZ,test:result.report.test,linear:result.report.linear,constant:result.report.constant,periods:result.report.periods,nonOverlap:result.report.nonOverlap},verdict:result.walk.consistent?'Avantaj repetat în aceste teste':'Fără robustețe demonstrată'});
 }catch(error){Object.assign(entry,{status:'blocked',error:error.message||'Date indisponibile.',retrievedAt:new Date().toISOString()});}
 report.results.push(entry);
 console.log(JSON.stringify({symbol:entry.symbol,status:entry.status,asOf:entry.asOf,windows:entry.walk?.summary?.wins,consistent:entry.walk?.consistent,error:entry.error}));
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,evaluated:report.results.filter(r=>r.status==='evaluated').length,total:report.results.length}));
