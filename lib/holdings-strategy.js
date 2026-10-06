/* Prospective research only: a frozen verdict, next open and an explicit cost scenario. */
(function(g){
'use strict';
const F=g.HoldingsForecast,VERSION='holdings-strategy-v1',SETTINGS='holdings-strategy-settings-v1',DIRECTORY='tt_holdings_strategy_directory_v1',MAX=20000,MAX_BYTES=40000000;
const DEFAULT_COSTS=Object.freeze({spreadPct:.10,slippagePct:.05,commissionPct:0,fxPct:0});
const copy=x=>JSON.parse(JSON.stringify(x)),finite=Number.isFinite,keys=(x,allowed)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k));
const prefix='tt_holdings_strategy_v1:',settingsPrefix='tt_holdings_strategy_settings_v1:';
function key(e){return F.key(e)?.replace('tt_holdings_forecast_v1:',prefix)||null;}
function settingsKey(e){return key(e)?.replace(prefix,settingsPrefix)||null;}
function identity(k){try{if(typeof k!=='string'||!k.startsWith(prefix))return null;const xs=k.slice(prefix.length).split('|').map(decodeURIComponent),e=Object.fromEntries(['scope','ticker','symbol','currency','kind'].map((p,i)=>[p,xs[i]]));return xs.length===5&&F.identity(e)?e:null;}catch{return null;}}
function supported(e,source){return F.identity(e)&&e.currency==='USD'&&source?.timezone==='America/New_York'&&source.closeMinutes===960;}
function costs(c){return keys(c,Object.keys(DEFAULT_COSTS))&&Object.keys(DEFAULT_COSTS).every(k=>finite(c[k])&&c[k]>=0&&c[k]<=5);}
function defaults(){return {version:SETTINGS,enabled:true,costBasis:'research-assumptions',costs:{...DEFAULT_COSTS}};}
function validSettings(s){return keys(s,['version','enabled','costBasis','costs'])&&s.version===SETTINGS&&typeof s.enabled==='boolean'&&['research-assumptions','user-estimate'].includes(s.costBasis)&&costs(s.costs);}
function policy(s){if(!validSettings(s))return null;const p={method:'long-next-open-atr-v1',horizon:5,notionalUSD:1000,stopATR:1,targetATR:2,costBasis:s.costBasis,costs:Object.fromEntries(Object.keys(DEFAULT_COSTS).map(k=>[k,s.costs[k]]))};return {id:'long-v1-'+(p.costBasis==='user-estimate'?'user':'research')+'-'+Object.values(p.costs).join('-'),...p};}
function validPolicy(p){if(!keys(p,['id','method','horizon','notionalUSD','stopATR','targetATR','costBasis','costs']))return false;const expected=policy({version:SETTINGS,enabled:true,costBasis:p.costBasis,costs:p.costs});return !!expected&&JSON.stringify(p)===JSON.stringify(expected);}
function originalForecast(r){const x=copy(r);delete x.outcome;delete x.verification;return JSON.stringify(x);}
function project(r,e,s=defaults(),now=Date.now()){
 if(!validSettings(s)||!s.enabled)return null;
 if(!F.validEntry(r,e,now)||r.model!=='verdict'||r.horizon!==5||r.restoredAt!==undefined||!supported(e,r.source)||r.outcome!==null||r.verification.state!=='pending'||r.verification.checkedAt!==null||!finite(now)||now<r.capturedAt||now-r.capturedAt>60000)return null;
 if(!F.timely(r.source,now)||e.kind==='market'&&r.source.asOf!==g.DailySeries.expected(now,r.source.timezone,r.source.closeMinutes))return null;
 return {version:VERSION,id:'strategy|'+r.id,createdAt:now,forecast:copy(r),policy:policy(s),outcome:null,verification:{state:'pending',checkedAt:null,sessions:0,reason:'Aștept următoarea deschidere și 5 sesiuni încheiate.'}};
}
function priceBar(b){return keys(b,['t','o','h','l','c'])&&[b.t,b.o,b.h,b.l,b.c].every(finite)&&b.t>0&&b.o>0&&b.l>0&&b.c>0&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c);}
function calculate(r,path,p){
 if(!validPolicy(p)||!Array.isArray(path)||path.length!==5||path.some(b=>!priceBar(b)))throw Error('Perioadă OHLC sau politică invalidă.');
 let previous=r.source.t,day=r.source.asOf,close=r.source.close;
 for(const b of path){const next=g.DailySeries.date(b.t,r.source.timezone);if(b.t<=previous||next<=day||b.t-previous>7*86400000||Math.abs(b.c/close-1)>.25||Math.abs(b.o/close-1)>.25)throw Error('Serie revizuită, gap peste 25% sau sesiuni lipsă.');previous=b.t;day=next;close=b.c;}
 if(path[0].t<=r.capturedAt)throw Error('Deschiderea de intrare precede decizia păstrată.');
 const first=path[0],last=path.at(-1),entry=first.o,atr=r.source.close*r.source.atrPct/100,stop=entry-atr,target=entry+2*atr,units=p.notionalUSD/entry;
 if(!finite(atr)||atr<=0||stop<=0||!finite(target)||!finite(units))throw Error('Stopul și ținta nu pot fi verificate.');
 const friction=(p.costs.spreadPct/2+p.costs.slippagePct+p.costs.commissionPct+p.costs.fxPct)/100;
 const cash=exit=>{const grossUSD=units*(exit-entry),costUSD=units*(entry+exit)*friction;return {grossUSD,costUSD,netUSD:grossUSD-costUSD};};
 const trade=r.estimate.direction===2;let exit=last.c,exitAt=last.t,exitReason=trade?'horizon':'abstention',ambiguous=false;
 if(trade)for(const b of path){
  if(b.o<=stop){exit=b.o;exitAt=b.t;exitReason='gap-stop';break;}
  if(b.o>=target){exit=target;exitAt=b.t;exitReason='target';break;}
  if(b.l<=stop){exit=stop;exitAt=b.t;ambiguous=b.h>=target;exitReason=ambiguous?'both-stop-first':'stop';break;}
  if(b.h>=target){exit=target;exitAt=b.t;exitReason='target';break;}
 }
 const actual=trade?cash(exit):{grossUSD:0,costUSD:0,netUSD:0},passive=cash(last.c);
 return {entryAt:first.t,entryAsOf:g.DailySeries.date(first.t,r.source.timezone),entry,stop,target,units,trade,exitAt:trade?exitAt:null,exitAsOf:trade?g.DailySeries.date(exitAt,r.source.timezone):null,exit:trade?exit:null,exitReason,ambiguous,horizonEnd:last.t,horizonAsOf:g.DailySeries.date(last.t,r.source.timezone),...actual,passiveGrossUSD:passive.grossUSD,passiveCostUSD:passive.costUSD,passiveNetUSD:passive.netUSD,path:copy(path)};
}
function validEntry(r,e,now=Date.now()){try{
 if(!keys(r,['version','id','createdAt','forecast','policy','outcome','verification'])||r.version!==VERSION||r.id!=='strategy|'+r.forecast?.id||!finite(r.createdAt)||r.createdAt>now||r.createdAt<r.forecast.capturedAt||r.createdAt-r.forecast.capturedAt>60000||!F.validEntry(r.forecast,e,now)||!F.timely(r.forecast.source,r.createdAt)||r.forecast.model!=='verdict'||r.forecast.outcome!==null||r.forecast.restoredAt!==undefined||r.forecast.verification.checkedAt!==null||r.forecast.verification.state!=='pending'||!supported(e,r.forecast.source)||!validPolicy(r.policy))return false;
 const v=r.verification;if(!keys(v,['state','checkedAt','sessions','reason'])||!['pending','resolved','unverifiable'].includes(v.state)||!Number.isInteger(v.sessions)||v.sessions<0||v.sessions>5||typeof v.reason!=='string'||!v.reason||v.reason.length>1500||v.checkedAt!==null&&(!finite(v.checkedAt)||v.checkedAt<r.createdAt||v.checkedAt>now))return false;
 if(r.outcome!==null){const o=r.outcome;if(!keys(o,['checkedAt','retrievedAt','result'])||!finite(o.checkedAt)||o.checkedAt<r.createdAt||o.checkedAt>now||!finite(o.retrievedAt)||o.retrievedAt>o.checkedAt||o.retrievedAt<o.result?.horizonEnd||o.result?.entryAt<=r.createdAt||v.checkedAt===null||v.checkedAt<o.checkedAt)return false;const expected=calculate(r.forecast,o.result.path,r.policy);if(expected.horizonEnd>o.checkedAt||e.kind==='market'&&expected.horizonAsOf>g.DailySeries.expected(o.checkedAt,r.forecast.source.timezone,r.forecast.source.closeMinutes)||JSON.stringify(expected)!==JSON.stringify(o.result))return false;}
 return v.state!=='resolved'||r.outcome!==null&&v.sessions===5&&v.checkedAt!==null;
 }catch{return false;}}
function verify(r,e,source,forecast,now=Date.now()){
 const next=copy(r),mark=(state,reason,sessions=0)=>{next.verification={state,reason,sessions,checkedAt:now};return next;};
 if(!validEntry(r,e,now)||now<r.createdAt)return r;
 try{
  if(!F.validEntry(forecast,e,now)||forecast.verification.state==='unverifiable'||originalForecast(forecast)!==originalForecast(r.forecast))throw Error('Verdictul original lipsește, a fost modificat sau nu poate fi verificat.');
  if(source?.symbol!==e.symbol||source.currency!==e.currency||source.kind!==e.kind||!supported(e,source)||!finite(source.retrievedAt)||source.retrievedAt>now||now-source.retrievedAt>300000||!Array.isArray(source.bars)||!source.bars.length||source.bars.length>2000)throw Error('Identitatea sau actualitatea sursei nu poate fi verificată.');
  const expected=e.kind==='market'?g.DailySeries.expected(now,source.timezone,source.closeMinutes):source.asOf;let day='',t=0;
  for(const b of source.bars){const d=g.DailySeries.date(b.t,source.timezone),weekday=new Date(d+'T12:00:00Z').getUTCDay();if(!priceBar({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c})||!finite(b.v)||b.v<=0||b.t<=t||b.t>now||d<=day||d>expected||e.kind==='market'&&[0,6].includes(weekday))throw Error('Sesiune neîncheiată, OHLC invalid sau duplicat.');day=d;t=b.t;}
  if(source.asOf!==day||day!==expected)throw Error('Ultima sesiune încheiată nu este actuală.');
  const origin=source.bars.findIndex(b=>b.t===r.forecast.source.t);
  if(origin<0){if(r.outcome&&r.outcome.result.horizonEnd<source.bars[0].t)return mark('resolved','Rezultat original păstrat; seria actuală nu mai acoperă acea perioadă.',5);throw Error('Închiderea de origine lipsește din sursă.');}
  if(source.bars[origin].c!==r.forecast.source.close)throw Error('Închiderea de origine a fost revizuită.');
  const path=source.bars.slice(origin+1,origin+6).map(b=>({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c}));
  if(path[0]&&path[0].t<=r.createdAt)throw Error('Intrarea ar fi folosit o deschidere anterioară capturii planului.');
  if(path.length<5){if(r.outcome)throw Error('Seria nu mai acoperă rezultatul original.');return mark('pending','Sesiuni încheiate: '+path.length+' / 5. Comparația cere întregul orizont.',path.length);}
  const result=calculate(r.forecast,path,r.policy);
  if(r.outcome&&JSON.stringify(r.outcome.result)!==JSON.stringify(result))throw Error('Prețurile perioadei au fost revizuite; rezultatul original este păstrat și exclus.');
  if(!r.outcome)next.outcome={checkedAt:now,retrievedAt:source.retrievedAt,result};
  return mark('resolved','Simulare verificată pe 5 sesiuni, inclusiv comparația pasivă.',5);
 }catch(error){return mark('unverifiable',error.message);}
}
function document(raw,e,now=Date.now()){
 if(raw===null||raw===undefined)return {version:VERSION,entries:[]};
 if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('Registrul simulării este prea mare; copia existentă rămâne păstrată.');
 const d=JSON.parse(raw);if(!keys(d,['version','entries'])||d.version!==VERSION||!Array.isArray(d.entries)||d.entries.length>MAX||d.entries.some(r=>!validEntry(r,e,now))||new Set(d.entries.map(r=>r.id)).size!==d.entries.length)throw Error('Registru de simulare incompatibil. Datele existente nu sunt rescrise.');return d;
}
function original(r){const x=copy(r);delete x.outcome;delete x.verification;return JSON.stringify(x);}
function merge(before,next,k){
 const e=identity(k);if(!e)throw Error('Identitatea simulării este invalidă.');const old=document(before,e),incoming=document(next,e),rows=new Map(old.entries.map(r=>[r.id,r]));
 for(const r of incoming.entries){const a=rows.get(r.id);if(!a){rows.set(r.id,r);continue;}if(original(a)!==original(r)||(r.verification.checkedAt||0)<(a.verification.checkedAt||0))continue;
  if(a.outcome&&r.outcome&&JSON.stringify(a.outcome.result)!==JSON.stringify(r.outcome.result)){rows.set(r.id,{...a,verification:{...r.verification,state:'unverifiable',reason:'Rezultate diferite între copii; originalul rămâne păstrat și exclus.'}});continue;}
  rows.set(r.id,{...a,outcome:a.outcome||r.outcome,verification:r.verification});
 }
 const d={version:VERSION,entries:[...rows.values()].sort((a,b)=>a.forecast.source.t-b.forecast.source.t)};const raw=JSON.stringify(d);document(raw,e);return raw;
}
function directory(raw){if(raw===null||raw===undefined)return {version:VERSION,identities:[]};if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('Lista simulărilor este prea mare.');const d=JSON.parse(raw);if(!keys(d,['version','identities'])||d.version!==VERSION||!Array.isArray(d.identities)||d.identities.length>MAX||d.identities.some(e=>!keys(e,['scope','ticker','symbol','currency','kind'])||!F.identity(e)||e.currency!=='USD')||new Set(d.identities.map(key)).size!==d.identities.length)throw Error('Lista simulărilor este incompatibilă.');return d;}
function directoryMerge(before,next){const a=directory(before),b=directory(next),all=new Map(a.identities.map(e=>[key(e),e]));for(const e of b.identities)if(!all.has(key(e)))all.set(key(e),e);const raw=JSON.stringify({version:VERSION,identities:[...all.values()]});directory(raw);return raw;}
function mergeForKey(k){return k===DIRECTORY?directoryMerge:identity(k)?merge:null;}
function report(entries,e,now=Date.now()){
 if(!F.identity(e)||!Array.isArray(entries)||entries.some(r=>!validEntry(r,e,now)))return {ok:false,reason:'Registru incompatibil; rezultatele nu pot fi calculate.'};
 const groups=new Map();for(const r of entries){if(!groups.has(r.policy.id))groups.set(r.policy.id,[]);groups.get(r.policy.id).push(r);}
 const policies=[...groups.values()].map(rows=>{
  const resolved=rows.filter(r=>r.verification.state==='resolved').sort((a,b)=>a.forecast.source.t-b.forecast.source.t),selected=[];let end=-Infinity;
  for(const r of resolved)if(r.forecast.source.t>end){selected.push(r);end=r.outcome.result.horizonEnd;}
  const outcomes=selected.map(r=>r.outcome.result),trades=outcomes.filter(r=>r.trade),sum=k=>outcomes.reduce((s,r)=>s+r[k],0);let equity=0,peak=0,maxDrawdownUSD=0;for(const r of outcomes){equity+=r.netUSD;peak=Math.max(peak,equity);maxDrawdownUSD=Math.max(maxDrawdownUSD,peak-equity);}
  const metrics=outcomes.length?{netUSD:sum('netUSD'),grossUSD:sum('grossUSD'),costUSD:sum('costUSD'),passiveNetUSD:sum('passiveNetUSD'),advantageUSD:sum('netUSD')-sum('passiveNetUSD'),maxDrawdownUSD,averageTradeUSD:trades.length?trades.reduce((s,r)=>s+r.netUSD,0)/trades.length:null,winRate:trades.length?trades.filter(r=>r.netUSD>0).length/trades.length:null}:null;
  return {policy:copy(rows[0].policy),decisions:rows.length,resolved:resolved.length,separate:selected.length,overlap:resolved.length-selected.length,trades:trades.length,abstentions:outcomes.filter(r=>!r.trade).length,ambiguous:outcomes.filter(r=>r.ambiguous).length,pending:rows.filter(r=>r.verification.state==='pending').length,unverifiable:rows.filter(r=>r.verification.state==='unverifiable').length,from:selected[0]?.forecast.source.asOf||null,to:selected.at(-1)?.outcome.result.horizonAsOf||null,metrics};
 });
 return {ok:true,version:VERSION,reviewOnly:true,kind:e.kind,symbol:e.symbol,currency:e.currency,decisions:entries.length,policies};
}
function exportReport(entries,e,now=Date.now()){const r=report(entries,e,now);return r.ok?{...r,exportedAt:now,entries:copy(entries)}:r;}
g.HoldingsStrategy={VERSION,SETTINGS,DIRECTORY,MAX,MAX_BYTES,DEFAULT_COSTS,key,settingsKey,identity,supported,defaults,validSettings,policy,validPolicy,project,calculate,validEntry,verify,document,merge,directory,directoryMerge,mergeForKey,report,exportReport};
})(typeof window!=='undefined'?window:globalThis);
