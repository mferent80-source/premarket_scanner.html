/* Account-aware estimates. These checks never change the research strategy or place orders. */
(function(g){
'use strict';
const S=g.HoldingsStrategy,F=g.HoldingsForecast,VERSION='holdings-account-risk-v1',SETTINGS='holdings-account-risk-settings-v1',MAX=20000,MAX_BYTES=40000000;
const fields=['perDecisionPct','totalStopPct','instrumentPct'],copy=x=>JSON.parse(JSON.stringify(x)),finite=Number.isFinite;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),keys=(x,ks)=>object(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k)),currency=x=>typeof x==='string'&&(/^[A-Z]{3}$/.test(x)||x==='GBp'),num=x=>finite(x)?x:null,str=x=>typeof x==='string'&&x.length<=200?x:null;
const prefix='tt_holdings_account_risk_v1:';
function key(e){return F.key(e)?.replace('tt_holdings_forecast_v1:',prefix)||null;}
function identity(k){return typeof k==='string'&&k.startsWith(prefix)?S.identity(k.replace(prefix,'tt_holdings_strategy_v1:')):null;}
function settingsKey(e,accountCurrency){return F.identity(e)&&currency(accountCurrency)?'tt_holdings_account_risk_settings_v1:'+['scope','kind'].map(k=>encodeURIComponent(e[k])).join('|')+'|'+encodeURIComponent(accountCurrency):null;}
function defaults(){return {version:SETTINGS,perDecisionPct:null,totalStopPct:null,instrumentPct:null};}
function validSettings(s){return keys(s,['version',...fields])&&s.version===SETTINGS&&fields.every(k=>s[k]===null||finite(s[k])&&s[k]>0&&s[k]<=100);}
function beforeEntry(source,now){let next=Date.parse(source.asOf+'T12:00:00Z')+86400000;while([0,6].includes(new Date(next).getUTCDay()))next+=86400000;const day=new Date(next).toISOString().slice(0,10),today=g.DailySeries.date(now,source.timezone);if(today!==day)return today<day;const parts=new Intl.DateTimeFormat('en-GB',{timeZone:source.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),get=k=>Number(parts.find(p=>p.type===k)?.value);return get('hour')*60+get('minute')<570;}
function prepare(snapshot,notes,settings,accountMatches=true){
 if(!validSettings(settings))throw Error('Limite incompatibile; copia existentă rămâne păstrată.');
 const s=snapshot?.summary,positions=Array.isArray(snapshot?.positions)?snapshot.positions.map(p=>({ticker:str(p?.ticker),quantity:num(p?.quantity),currentPrice:num(p?.currentPrice),instrumentCurrency:str(p?.instrumentCurrency),currency:str(p?.currency),value:num(p?.value)})):null;
 const stops=(positions||[]).map(p=>{const n=notes?.[p.ticker],v=n?.stop;return {ticker:p.ticker,stop:typeof v==='number'||typeof v==='string'&&v.trim()!==''?num(Number(v)):null,currency:str(n?.stopCurrency)};});
 return {accountMatches:accountMatches===true,snapshot:snapshot?{environment:str(snapshot.environment),fetchedAt:str(snapshot.fetchedAt),summary:s?{currency:str(s.currency),totalValue:num(s.totalValue),available:num(s.available),reserved:num(s.reserved),invested:num(s.invested)}:null,positions}:null,stops,settings:copy(settings)};
}
function validInput(a){return keys(a,['accountMatches','snapshot','stops','settings'])&&typeof a.accountMatches==='boolean'&&validSettings(a.settings)&&Array.isArray(a.stops)&&a.stops.length<=1000&&a.stops.every(n=>keys(n,['ticker','stop','currency'])&&(n.ticker===null||str(n.ticker)===n.ticker)&&(n.stop===null||finite(n.stop))&&(n.currency===null||str(n.currency)===n.currency))&&(a.snapshot===null||keys(a.snapshot,['environment','fetchedAt','summary','positions'])&&[a.snapshot.environment,a.snapshot.fetchedAt].every(v=>v===null||str(v)===v)&&(a.snapshot.summary===null||keys(a.snapshot.summary,['currency','totalValue','available','reserved','invested'])&&(a.snapshot.summary.currency===null||str(a.snapshot.summary.currency)===a.snapshot.summary.currency)&&['totalValue','available','reserved','invested'].every(k=>a.snapshot.summary[k]===null||finite(a.snapshot.summary[k])))&&(a.snapshot.positions===null||Array.isArray(a.snapshot.positions)&&a.snapshot.positions.length<=1000&&a.snapshot.positions.every(p=>keys(p,['ticker','quantity','currentPrice','instrumentCurrency','currency','value'])&&['ticker','instrumentCurrency','currency'].every(k=>p[k]===null||str(p[k])===p[k])&&['quantity','currentPrice','value'].every(k=>p[k]===null||finite(p[k])))));}
function evaluate(input,decision,e,now=Date.now()){
 if(!F.identity(e)||!validInput(input)||!finite(now))throw Error('Date de risc incompatibile.');
 const a=input.snapshot,s=a?.summary,reasons=[],checks=[],rows=[];let usable=true;
 const missing=message=>{usable=false;reasons.push(message);};
 const at=Date.parse(a?.fetchedAt),c=s?.currency||null;
 if(!input.accountMatches)missing('Contul selectat nu corespunde deținerii.');
 if(!a||(e.kind==='market'?a.environment!=='live':a.environment!=='synthetic'))missing('Lipsește snapshot-ul contului selectat.');
 if(!finite(at)||at>now+60000||now-at>300000)missing('Snapshot mai vechi de 5 minute sau cu timp invalid. Reverifică Trading 212.');
 if(!s||!currency(c)||!(s.totalValue>0)||![s.available,s.reserved,s.invested].every(v=>finite(v)&&v>=0))missing('Sold, valoare totală, investiții sau sume rezervate lipsă.');
 if(!Array.isArray(a?.positions))missing('Lista completă a pozițiilor nu este disponibilă.');
 const seen=new Set(),stops=new Map(input.stops.map(n=>[n.ticker,n]));let sumValue=0,knownStopRisk=0,covered=0,implicitFX=false;
 for(const p of a?.positions||[]){
  if(!p.ticker||seen.has(p.ticker)||!finite(p.quantity)||p.quantity<0){missing('Poziție invalidă sau duplicată: '+(p.ticker||'identificator lipsă')+'.');continue;}seen.add(p.ticker);
  if(p.quantity===0){if(p.value!==0)missing('Poziție cu cantitate zero și valoare neconfirmată: '+p.ticker+'.');continue;}
  const valid=p.currency===c&&currency(p.instrumentCurrency)&&p.value>0&&p.currentPrice>0&&finite(p.value)&&finite(p.currentPrice);
  if(!valid)missing('Valoare, preț sau monedă neconfirmată pentru '+p.ticker+'.');
  let rate=valid?p.value/(p.quantity*p.currentPrice):null;
  if(!finite(rate)||rate<=0||(p.instrumentCurrency===c&&Math.abs(rate-1)>.01)){rate=null;missing('Valoarea și prețul nu pot fi reconciliate pentru '+p.ticker+'.');}
  if(p.instrumentCurrency===c&&rate!==null)rate=1;
  if(rate!==null&&p.instrumentCurrency!==c)implicitFX=true;
  const n=stops.get(p.ticker),stop=n?.stop,confirmed=finite(stop)&&stop>0&&stop<p.currentPrice&&n.currency===p.instrumentCurrency&&rate!==null;
  const risk=confirmed?(p.currentPrice-stop)*p.quantity*rate:null;
  if(confirmed&&finite(risk)){knownStopRisk+=risk;covered++;}
  else reasons.push(p.ticker+': '+(stop>=p.currentPrice&&stop>0?'preț la/sub stopul de reevaluare.':'stop lipsă, invalid sau neconfirmat în moneda instrumentului.'));
  if(valid)sumValue+=p.value;
  rows.push({ticker:p.ticker,value:valid?p.value:null,quantity:p.quantity,price:p.currentPrice,quoteCurrency:p.instrumentCurrency,rate,stop:finite(stop)?stop:null,stopConfirmed:confirmed,stopRisk:confirmed&&finite(risk)?risk:null});
 }
 if(s&&finite(s.invested)&&Math.abs(sumValue-s.invested)>Math.max(.02,s.invested*.01))missing('Suma pozițiilor nu corespunde investițiilor raportate; importul poate fi parțial.');
 if(s&&finite(s.totalValue)&&[s.available,s.reserved,s.invested].every(finite)&&s.invested+s.available+s.reserved>s.totalValue+Math.max(.02,s.totalValue*.01))missing('Soldul și investițiile depășesc valoarea totală raportată.');
 if(!finite(sumValue)||!finite(knownStopRisk))missing('Valorile agregate depășesc limitele calculului.');
 const completeStops=covered===rows.length,fullRisk=usable&&completeStops&&s?.reserved===0?knownStopRisk:null;
 const limits=input.settings,configured=fields.every(k=>limits[k]!==null);
 if(!configured)reasons.push('Completează toate cele 3 limite ale contului. Nu aplicăm procente implicite.');
 if(s?.reserved>0)reasons.push('Există sume rezervate pentru ordine; expunerea și stopurile acestora nu sunt cunoscute.');
 if(implicitFX)reasons.push('Conversie estimată din valoarea poziției / (cantitate × preț). Cursul la execuție și evoluția FX nu sunt verificate.');
 let validDecision=!!decision&&S.validEntry(decision,e,now)&&decision.verification.state!=='unverifiable';
 if(validDecision&&e.kind==='market')validDecision=decision.forecast.source.asOf===g.DailySeries.expected(now,decision.forecast.source.timezone,decision.forecast.source.closeMinutes);
 if(validDecision&&e.kind==='market'&&!beforeEntry(decision.forecast.source,now)){validDecision=false;reasons.push('Fereastra de intrare a deciziei a început. Verificarea curentă nu reprezintă o alocare nouă la următoarea deschidere.');}
 if(!validDecision)reasons.push('Lipsește un verdict nou, eligibil pentru sesiunea EOD curentă.');
 const trade=validDecision?decision.forecast.estimate.direction===2:null,p=rows.find(r=>r.ticker===e.ticker),source=validDecision?decision.forecast.source:null;
 let proposal=null,capacity=null;
 if(validDecision&&trade){
  if(!p||p.quoteCurrency!==e.currency||e.currency!=='USD'||p.rate===null||!(p.price>0))missing('Deținerea și moneda scenariului nu pot fi asociate cu snapshot-ul.');
  else if(Math.abs(p.price/source.close-1)>.25)missing('Prețul brokerului diferă cu peste 25% de închiderea verdictului; reverifică listarea și ajustările.');
  else{
   const atr=source.close*source.atrPct/100,stop=p.price-atr,f=decision.policy.costs,friction=(f.spreadPct/2+f.slippagePct+f.commissionPct+f.fxPct)/100;
   if(!(atr>0)||!(stop>0)||!finite(atr))missing('ATR și stopul scenariului nu sunt calculabile.');
   else{const amount=decision.policy.notionalUSD*p.rate,lossRate=atr/p.price+friction*(2-atr/p.price),risk=amount*lossRate;
    proposal={price:p.price,stop,target:p.price+2*atr,units:decision.policy.notionalUSD/p.price,amount,entryCost:amount*friction,stopCost:amount*friction*(2-atr/p.price),risk,lossRate,concentration:finite(s?.totalValue)&&s.totalValue>0?(p.value+amount)/s.totalValue*100:null};
    const addCheck=(id,label,value,limit)=>{const known=usable&&finite(value)&&finite(limit);checks.push({id,label,value:finite(value)?value:null,limit:finite(limit)?limit:null,state:known?(value<=limit+1e-9?'pass':'fail'):'unknown'});};
    addCheck('cash','Sold disponibil',amount+proposal.entryCost,s?.available);
    addCheck('decision','Risc suplimentar la stop, cu costuri',risk,limits.perDecisionPct!==null&&s?s.totalValue*limits.perDecisionPct/100:null);
    addCheck('portfolio','Risc total la stop, cu costurile scenariului nou',fullRisk===null?null:fullRisk+risk,limits.totalStopPct!==null&&s?s.totalValue*limits.totalStopPct/100:null);
    addCheck('concentration','Concentrare după alocare',proposal.concentration,limits.instrumentPct);
    if(usable&&completeStops&&configured&&s.reserved===0){const v=Math.min(s.available/(1+friction),s.totalValue*limits.perDecisionPct/100/lossRate,(s.totalValue*limits.totalStopPct/100-knownStopRisk)/lossRate,s.totalValue*limits.instrumentPct/100-p.value);capacity={accountAmount:Math.floor(Math.max(0,v)*100)/100,quoteAmount:null};capacity.quoteAmount=Math.floor(capacity.accountAmount/p.rate*100)/100;}
   }
  }
 }
 const failed=checks.some(x=>x.state==='fail'),eligible=usable&&configured&&completeStops&&s?.reserved===0&&checks.length===4&&checks.every(x=>x.state==='pass');
 const state=trade===false?'no-position':failed?'blocked':eligible?'within-limits':'incomplete';
 return {state,currency:c,snapshotAt:a?.fetchedAt||null,equity:usable?s.totalValue:null,available:usable?s.available:null,reserved:usable?s.reserved:null,positions:rows.length,stopCoverage:covered,knownStopRisk:usable&&finite(knownStopRisk)?knownStopRisk:null,totalStopRisk:fullRisk,implicitFX,proposal,capacity,checks,rows,reasons};
}
function project(decision,e,input,now=Date.now()){
 if(!S.validEntry(decision,e,now)||decision.outcome!==null||decision.verification.state!=='pending'||decision.verification.checkedAt!==null||now<decision.createdAt||now-decision.createdAt>60000||!validInput(input))return null;
 return {version:VERSION,id:decision.id,createdAt:now,decision:copy(decision),input:copy(input),result:evaluate(input,decision,e,now)};
}
function validEntry(r,e,now=Date.now()){try{return keys(r,['version','id','createdAt','decision','input','result'])&&r.version===VERSION&&finite(r.createdAt)&&r.createdAt<=now&&r.id===r.decision?.id&&JSON.stringify(project(r.decision,e,r.input,r.createdAt))===JSON.stringify(r);}catch{return false;}}
function document(raw,e,now=Date.now()){if(raw===null||raw===undefined)return {version:VERSION,entries:[]};if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error('Registrul riscului este prea mare; copia existentă rămâne păstrată.');const d=JSON.parse(raw);if(!keys(d,['version','entries'])||d.version!==VERSION||!Array.isArray(d.entries)||d.entries.length>MAX||d.entries.some(r=>!validEntry(r,e,now))||new Set(d.entries.map(r=>r.id)).size!==d.entries.length)throw Error('Registru de risc incompatibil; copia existentă rămâne păstrată.');return d;}
function merge(before,next,k){const e=identity(k);if(!e)throw Error('Identitate de risc incompletă.');const old=document(before,e),incoming=document(next,e),rows=new Map(old.entries.map(r=>[r.id,r]));for(const r of incoming.entries)if(!rows.has(r.id))rows.set(r.id,r);const raw=JSON.stringify({version:VERSION,entries:[...rows.values()].sort((a,b)=>a.createdAt-b.createdAt)});document(raw,e);return raw;}
function exportReport(entries,e,now=Date.now()){document(JSON.stringify({version:VERSION,entries}),e,now);return {version:VERSION,symbol:e.symbol,currency:e.currency,kind:e.kind,exportedAt:now,estimateOnly:true,entries:copy(entries),note:'Date financiare ale snapshot-ului și stopuri manuale. Verificarea la captură rămâne fixă; nu reprezintă ordine, pierdere maximă sau costuri confirmate.'};}
g.HoldingsAccountRisk={VERSION,SETTINGS,fields,defaults,validSettings,key,identity,settingsKey,prepare,validInput,evaluate,project,validEntry,document,merge,exportReport};
})(typeof window!=='undefined'?window:globalThis);
