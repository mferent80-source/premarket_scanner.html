// Run from repository root. Public instrument histories only; never reads broker storage.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2),output=args[0]||'docs/neural-validation-latest.json';
const retry=args[1]==='--retry-blocked';if(args.length>2||args.length>1&&!retry)throw Error('Usage: node tools/holdings-neural-benchmark.mjs [output.json] [--retry-blocked]');
const cache=new Map(),context={fetch,URL,AbortController,AbortSignal,setTimeout,clearTimeout,console,localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)}};
vm.createContext(context);
for(const path of ['lib/data.js','lib/daily-series.js','lib/holdings-neural.js','lib/holdings-neural-evaluation.js','lib/holdings-boosting.js','lib/holdings-model-comparison.js'])vm.runInContext(readFileSync(path,'utf8'),context);
const N=context.HoldingsNeural,E=context.HoldingsNeuralEvaluation,previous=JSON.parse(readFileSync('docs/neural-validation-mlp-v2.json','utf8'));
const instruments=[{symbol:'MSFT',sector:'Tehnologie'},{symbol:'JPM',sector:'Financiare'},{symbol:'XOM',sector:'Energie'},{symbol:'SPY',sector:'ETF · piață largă'}];
const retained=retry?JSON.parse(readFileSync(output,'utf8')):null;if(retained&&(retained.networkVersion!==N.VERSION||retained.boostingVersion!==context.HoldingsBoosting.VERSION||retained.protocol!==E.VERSION))throw Error('Raportul păstrat folosește alt protocol.');
const report={schema:'neural-public-validation-v1',generatedAt:new Date().toISOString(),networkVersion:N.VERSION,protocol:E.VERSION,boostingVersion:context.HoldingsBoosting.VERSION,comparisonVersion:context.HoldingsModelComparison.VERSION,source:'Yahoo Finance OHLCV · fluxul public existent',scope:'Patru instrumente alese înainte de evaluare; eșantion nereprezentativ. Modele separate per instrument.',limits:['OHLCV și ajustările providerului nu sunt certificate independent.','Nu sunt incluse dividende, costuri, slippage, știri sau earnings.','Temperatura se selectează pe validare separată; calibrarea pe piață și profitul nu sunt demonstrate.','Comparațiile V2–V3 și Neural–Boosting sunt retrospective pe intervale deja examinate, nu teste prospective.','Orizonturile fără suprapunere pot rămâne corelate.'],results:[]};
for(const instrument of instruments){
 if(retained){const old=retained.results.find(x=>x.symbol===instrument.symbol);if(old?.status==='evaluated'){if(!context.HoldingsModelComparison.validPublic(old))throw Error('Comparația păstrată nu poate fi verificată.');report.results.push(old);continue;}}
 const entry={...instrument};
 try{
  const raw=await context.D.fetchStock(instrument.symbol,{range:'5y',interval:'1d',ttl:0}),now=Date.now(),source=context.DailySeries.read(raw,instrument.symbol,now),data=N.dataset(source.bars,now),result=E.evaluate(data.rows,data.latest);
  result.comparison=context.HoldingsModelComparison.evaluate(data.rows,data.latest,result);
  if(!N.valid(result))throw Error('Model neverificabil.');
  Object.assign(entry,{status:'evaluated',retrievedAt:new Date(now).toISOString(),asOf:source.asOf,currency:source.currency,timezone:source.timezone,bars:source.bars.length,labeled:data.rows.length,from:new Date(source.bars[0].t).toISOString(),to:new Date(source.bars.at(-1).t).toISOString(),walk:result.walk,recent:{advantage:result.advantage,maxZ:result.maxZ,test:result.report.test,linear:result.report.linear,constant:result.report.constant,periods:result.report.periods,nonOverlap:result.report.nonOverlap,adjustment:result.adjustment,rawTest:result.report.rawTest,disagreement:result.disagreement},comparison:result.comparison.status==='evaluated'?{status:'evaluated',verdict:context.HoldingsModelComparison.verdict(result),boosting:{version:result.comparison.boosting.version,rounds:result.comparison.boosting.rounds,selection:result.comparison.boosting.selection,walk:result.comparison.boosting.walk,report:result.comparison.boosting.report}}:result.comparison,verdict:result.walk.consistent?'Avantaj repetat în aceste teste':'Fără robustețe demonstrată'});
 const old=previous.results.find(x=>x.symbol===entry.symbol);if(old?.status==='evaluated')entry.previous={networkVersion:previous.networkVersion,generatedAt:previous.generatedAt,asOf:old.asOf,comparable:old.asOf===entry.asOf&&old.bars===entry.bars&&JSON.stringify(old.recent.periods)===JSON.stringify(entry.recent.periods),test:old.recent.test,daily:old.walk.summary.daily.test,consistent:old.walk.consistent,wins:old.walk.summary.wins};
 }catch(error){Object.assign(entry,{status:'blocked',error:error.message||'Date indisponibile.',retrievedAt:new Date().toISOString()});}
 report.results.push(entry);
 console.log(JSON.stringify({symbol:entry.symbol,status:entry.status,asOf:entry.asOf,windows:entry.walk?.summary?.wins,consistent:entry.walk?.consistent,error:entry.error}));
}
if(retained){report.generatedAt=retained.generatedAt;report.updatedAt=new Date().toISOString();}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,evaluated:report.results.filter(r=>r.status==='evaluated').length,total:report.results.length}));
