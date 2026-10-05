(function(g){
'use strict';
const VERSION='holdings-forecast-v1',HORIZON=5,MAX=500,MAX_BYTES=1500000;
const VERSIONS={neural:'holdings-mlp-v3',boosting:'holdings-gbt-v1',quantile:'holdings-quantile-v1',hmm:'holdings-hmm-v1',isolation:'holdings-isolation-v1',garch:'holdings-garch-v1',verdict:'holdings-verdict-v2'};
const finite=Number.isFinite,text=(s,n=100)=>typeof s==='string'&&s.length>0&&s.length<=n,copy=x=>JSON.parse(JSON.stringify(x));
const checkedSources=new WeakSet(),formatters=new Map();
const equal=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(a),Math.abs(b));
function date(t,zone){if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}));const p=Object.fromEntries(formatters.get(zone).formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;}
function identity(e){return e&&text(e.scope,500)&&text(e.ticker)&&text(e.symbol,50)&&text(e.currency,12)&&['market','synthetic'].includes(e.kind);}
function key(e){return identity(e)?'tt_holdings_forecast_v1:'+['scope','ticker','symbol','currency','kind'].map(k=>encodeURIComponent(e[k])).join('|'):null;}
function validSource(s){try{return s&&finite(s.t)&&s.t>0&&text(s.asOf,10)&&date(s.t,s.timezone)===s.asOf&&finite(s.close)&&s.close>0&&finite(s.atrPct)&&s.atrPct>0&&finite(s.closeMinutes)&&s.closeMinutes>=0&&s.closeMinutes<1440;}catch{return false;}}
// Conservative cutoff: no new snapshot after a following weekday has begun locally.
// This also refuses some valid holiday/premarket entries instead of admitting late forecasts.
function timely(s,t){try{if(!validSource(s)||!finite(t)||t<s.t)return false;const start=Date.parse(s.asOf+'T12:00:00Z'),end=Date.parse(date(t,s.timezone)+'T12:00:00Z');if(end<start||end-start>4*86400000)return false;for(let d=start+86400000;d<=end;d+=86400000){const w=new Date(d).getUTCDay();if(w>0&&w<6)return false;}return true;}catch{return false;}}
const VERDICT_STATES={up:2,down:0,mixed:1,'up-volatile':2,'down-volatile':0,'mixed-volatile':1,weak:null,conflict:null,caution:null};
function horizonFor(model,horizon){return model==='garch'?[5,20].includes(horizon)?horizon:null:HORIZON;}
function entryId(model,asOf,horizon){return model+'|'+asOf+(model==='garch'?'|'+horizon:'');}
function validEstimate(model,x){
 if(!x)return false;
 if(['neural','boosting'].includes(model))return [0,1,2].includes(x.classIndex)&&[0,1,2].includes(x.baselineClass);
 if(model==='quantile')return [x.prices,x.baselinePrices].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>finite(v)&&v>0)&&a[0]<=a[1]&&a[1]<=a[2]);
 if(model==='hmm')return text(x.label,80)&&Number.isInteger(x.state)&&x.state>=0&&x.state<3&&Array.isArray(x.means)&&x.means.length===3&&x.means.every(finite);
 if(model==='garch')return finite(x.mu)&&Math.abs(x.mu)<=100&&['predictedVariance','constantVariance','ewmaVariance'].every(k=>finite(x[k])&&x[k]>0);
 if(model==='verdict')return text(x.title,200)&&Object.hasOwn(VERDICT_STATES,x.verdictState)&&x.direction===VERDICT_STATES[x.verdictState]&&text(x.sourceFingerprint,100)&&Array.isArray(x.reasons)&&x.reasons.length>0&&x.reasons.length<=8&&x.reasons.every(v=>text(v,1500))&&Array.isArray(x.cards)&&x.cards.length===6&&new Set(x.cards.map(c=>c.id)).size===6&&x.cards.every(c=>['neural','boosting','hmm','isolation','quantile','garch'].includes(c.id)&&c.version===VERSIONS[c.id]&&text(c.state,80)&&text(c.value,300));
 if(model==='isolation')return ['ordinary','anomaly','uncertain'].includes(x.label)&&finite(x.score)&&x.score>0&&x.score<=1&&finite(x.threshold)&&x.threshold>0&&x.threshold<=1&&Number.isInteger(x.votes)&&x.votes>=0&&x.votes<=3;
 return false;
}
function estimate(model,x){if(['neural','boosting'].includes(model))return {classIndex:x.classIndex,baselineClass:x.baselineClass};if(model==='quantile')return {prices:x.prices.slice(),baselinePrices:x.baselinePrices.slice()};if(model==='hmm')return {label:x.label,state:x.state,means:x.means.slice()};if(model==='garch')return {mu:x.mu,predictedVariance:x.predictedVariance,constantVariance:x.constantVariance,ewmaVariance:x.ewmaVariance};if(model==='verdict')return {title:x.title,verdictState:x.verdictState,direction:x.direction,sourceFingerprint:x.sourceFingerprint,reasons:x.reasons.slice(),cards:x.cards.map(c=>({id:c.id,version:c.version,state:c.state,value:c.value}))};return {label:x.label,score:x.score,threshold:x.threshold,votes:x.votes};}
function project(input,e,now=Date.now()){
 if(!identity(e)||!input||input.modelVersion!==VERSIONS[input.model]||!validEstimate(input.model,input.estimate)||!text(input.state,80)||!finite(input.trainedAt)||input.trainedAt>now||now-input.trainedAt>1800000||!timely(input.source,now))return null;
 const s=input.source,horizon=horizonFor(input.model,input.horizon);if(!horizon)return null;
 if(e.kind==='market'){try{if(s.asOf!==g.DailySeries.expected(now,s.timezone,s.closeMinutes))return null;}catch{return null;}}
 return {version:VERSION,id:entryId(input.model,s.asOf,horizon),symbol:e.symbol,currency:e.currency,kind:e.kind,model:input.model,modelVersion:input.modelVersion,horizon,capturedAt:now,trainedAt:input.trainedAt,state:input.state,source:{t:s.t,asOf:s.asOf,timezone:s.timezone,closeMinutes:s.closeMinutes,close:s.close,atrPct:s.atrPct},estimate:estimate(input.model,input.estimate),outcome:null,verification:{state:'pending',checkedAt:null,sessions:0,reason:'Aștept '+horizon+' sesiuni încheiate.'}};
}
function validOutcome(o,r){try{
 if(!o||!finite(o.checkedAt)||o.checkedAt<r.capturedAt||!finite(o.retrievedAt)||o.retrievedAt<o.t||!Array.isArray(o.path)||o.path.length!==r.horizon)return false;
 let previous=r.source.t,previousDay=r.source.asOf;
 for(const b of o.path){if(!finite(b.t)||b.t<=previous||!finite(b.c)||b.c<=0||b.t>o.checkedAt)return false;const d=date(b.t,r.source.timezone);if(d<=previousDay)return false;previous=b.t;previousDay=d;}
 return o.t===previous&&o.asOf===previousDay&&equal(o.close,o.path.at(-1).c);
 }catch{return false;}}
function keys(x,allowed){return x&&Object.keys(x).every(k=>allowed.includes(k));}
function validEntry(r,e,now=Date.now()){try{
 if(!keys(r,['version','id','symbol','currency','kind','model','modelVersion','horizon','capturedAt','trainedAt','state','source','estimate','outcome','verification'])||!keys(r.source,['t','asOf','timezone','closeMinutes','close','atrPct'])||!keys(r.estimate,r.model==='garch'?['mu','predictedVariance','constantVariance','ewmaVariance']:r.model==='verdict'?['title','verdictState','direction','sourceFingerprint','reasons','cards']:r.model==='quantile'?['prices','baselinePrices']:r.model==='hmm'?['label','state','means']:r.model==='isolation'?['label','score','threshold','votes']:['classIndex','baselineClass'])||!keys(r.verification,['state','checkedAt','sessions','reason'])||r.capturedAt>now||r.verification.checkedAt>now)return false;
 if(r.outcome&&(!keys(r.outcome,['t','asOf','close','path','checkedAt','retrievedAt'])||r.outcome.path.some(b=>!keys(b,['t','c']))||r.outcome.checkedAt>now||r.outcome.retrievedAt>r.outcome.checkedAt))return false;
 if(!identity(e)||r?.version!==VERSION||r.symbol!==e.symbol||r.currency!==e.currency||r.kind!==e.kind||r.modelVersion!==VERSIONS[r.model]||r.id!==entryId(r.model,r.source?.asOf,r.horizon)||r.horizon!==horizonFor(r.model,r.horizon)||!text(r.state,80)||!validSource(r.source)||!timely(r.source,r.capturedAt)||!finite(r.trainedAt)||r.trainedAt>r.capturedAt||r.capturedAt-r.trainedAt>1800000||!validEstimate(r.model,r.estimate))return false;
 const v=r.verification;if(!v||!['pending','resolved','unverifiable'].includes(v.state)||!text(v.reason,1000)||!Number.isInteger(v.sessions)||v.sessions<0||v.sessions>r.horizon||v.checkedAt!==null&&(!finite(v.checkedAt)||v.checkedAt<r.capturedAt))return false;
 if(r.model==='verdict'&&r.estimate.cards.some(c=>!keys(c,['id','version','state','value'])))return false;
 if(r.outcome!==null&&!validOutcome(r.outcome,r))return false;
 return v.state!=='resolved'||r.outcome!==null&&v.sessions===r.horizon;
 }catch{return false;}}
function validateSeries(source,now){
 if(!Array.isArray(source.bars)||!source.bars.length||source.bars.length>2000)throw Error('Serie zilnică absentă sau prea mare.');
 let last=0,lastDay='';for(const b of source.bars){const d=date(b.t,source.timezone);if(![b.t,b.o,b.h,b.l,b.c,b.v].every(finite)||b.t<=last||b.t>now||b.o<=0||b.l<=0||b.c<=0||b.v<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||d<=lastDay)throw Error('Serie zilnică invalidă sau duplicată.');last=b.t;lastDay=d;}
 return lastDay;
}
function verify(r,source,now=Date.now()){
 const next=copy(r),set=(state,reason,sessions=0)=>{next.verification={state,reason,sessions,checkedAt:now};return next;};
 if(!finite(now)||now<r.capturedAt)return r;
 try{
 if(source?.symbol!==r.symbol||source.currency!==r.currency||source.timezone!==r.source.timezone||!finite(source.retrievedAt)||source.retrievedAt>now||now-source.retrievedAt>300000||!Array.isArray(source.bars)||source.bars.length>2000)throw Error('Identitate, monedă sau prospețime neverificată.');
 const bars=source.bars,lastDay=checkedSources.has(source)?date(bars.at(-1).t,source.timezone):validateSeries(source,now);
 if(r.kind==='market'&&(source.asOf!==lastDay||source.closeMinutes!==r.source.closeMinutes||source.asOf!==g.DailySeries.expected(now,source.timezone,source.closeMinutes)))throw Error('Sesiunea încheiată sau actualitatea seriei nu poate fi verificată.');
 const at=bars.findIndex(b=>b.t===r.source.t);
 if(at<0)throw Error('Închiderea de origine lipsește din sursă.');
 if(!equal(bars[at].c,r.source.close))throw Error('Prețul de origine a fost revizuit; posibilă ajustare sau split.');
 const path=bars.slice(at+1,at+1+r.horizon);
 if(path.some((b,i)=>Math.abs(b.c/(i?path[i-1].c:r.source.close)-1)>.25||b.t-(i?path[i-1].t:r.source.t)>7*86400000))throw Error('Salt peste 25% sau gol în serie; verifică evenimentele și ajustările.');
 if(path.length<r.horizon){if(r.outcome)throw Error('Sursa nu mai acoperă rezultatul păstrat.');return set('pending','Sesiuni încheiate: '+path.length+' / '+r.horizon+'.',path.length);}
 const end=path.at(-1);
 if(r.outcome&&(!equal(end.c,r.outcome.close)||end.t!==r.outcome.t||path.some((b,i)=>!equal(b.c,r.outcome.path[i].c)||b.t!==r.outcome.path[i].t)))throw Error('Rezultatul sursei a fost revizuit; observația este exclusă din raport.');
 if(!r.outcome)next.outcome={t:end.t,asOf:date(end.t,source.timezone),close:end.c,path:path.map(b=>({t:b.t,c:b.c})),checkedAt:now,retrievedAt:source.retrievedAt};
 return set('resolved','Rezultat verificat pe '+r.horizon+' închideri ale sursei.',r.horizon);
 }catch(e){return set('unverifiable',e.message);}
}
function metric(r){
 if(r.verification.state!=='resolved'||!r.outcome)return null;
 const retPct=(r.outcome.close/r.source.close-1)*100,y=retPct/r.source.atrPct,actualClass=y<=-1?0:y>=1?2:1;
 if(r.model==='garch'){
  let previous=r.source.close,observedVariance=0;for(const b of r.outcome.path){observedVariance+=(100*Math.log(b.c/previous)-r.estimate.mu)**2;previous=b.c;}
  const score=v=>Math.log(v)+observedVariance/v;
  return {retPct,observedVariance,observedPct:Math.sqrt(observedVariance),predictedPct:Math.sqrt(r.estimate.predictedVariance),score:score(r.estimate.predictedVariance),constantScore:score(r.estimate.constantVariance),ewmaScore:score(r.estimate.ewmaVariance)};
 }
 if(r.model==='verdict')return {retPct,y,actualClass,directional:r.estimate.direction!==null,correct:r.estimate.direction===null?null:r.estimate.direction===actualClass};
 if(['neural','boosting'].includes(r.model))return {retPct,y,actualClass,correct:r.estimate.classIndex===actualClass,baselineCorrect:r.estimate.baselineClass===actualClass};
 if(r.model==='quantile'){
  const score=p=>{const a=p.map(v=>(v/r.source.close-1)*100/r.source.atrPct);return {covered:r.outcome.close>=p[0]&&r.outcome.close<=p[2],mae:Math.abs(y-a[1]),score:a[2]-a[0]+10*(Math.max(a[0]-y,0)+Math.max(y-a[2],0))};};
  return {retPct,y,...score(r.estimate.prices),baseline:score(r.estimate.baselinePrices)};
 }
 return {retPct,descriptive:true};
}
function separate(rows){let end=-Infinity;return rows.slice().sort((a,b)=>a.source.t-b.source.t).filter(r=>{if(r.source.t<=end)return false;end=r.outcome.t;return true;});}
function aggregate(rows,model,horizon=HORIZON){
 const usable=rows.filter(r=>r.model===model&&r.horizon===horizon&&r.verification.state==='resolved'),blocks=separate(usable),selected=blocks.map(metric),n=selected.length;
 if(['hmm','isolation'].includes(model))return {n,all:usable.length,descriptive:true,anomalies:model==='isolation'?blocks.filter(r=>r.estimate.label==='anomaly').length:null};
 if(!n)return {n:0,all:usable.length,...(model==='verdict'?{directional:0,abstentions:0,accuracy:null,balanced:null}: {})};
 const mean=key=>selected.reduce((s,x)=>s+x[key],0)/n;
 if(model==='garch')return {n,all:usable.length,score:mean('score'),constantScore:mean('constantScore'),ewmaScore:mean('ewmaScore'),observedPct:mean('observedPct'),predictedPct:mean('predictedPct')};
 if(model==='verdict'){
  const predictions=selected.filter(x=>x.directional),directional=predictions.length,confusion=Array.from({length:3},()=>[0,0,0]);blocks.forEach((r,i)=>{if(selected[i].directional)confusion[selected[i].actualClass][r.estimate.direction]++;});const counts=confusion.map(a=>a.reduce((s,v)=>s+v,0));
  return {n,all:usable.length,directional,abstentions:n-directional,accuracy:directional?predictions.filter(x=>x.correct).length/directional:null,balanced:counts.some(n=>!n)?null:confusion.reduce((s,a,i)=>s+a[i]/counts[i],0)/3,counts};
 }
 if(model==='quantile')return {n,all:usable.length,coverage:mean('covered'),mae:mean('mae'),score:mean('score'),baselineCoverage:selected.reduce((s,x)=>s+x.baseline.covered,0)/n,baselineMae:selected.reduce((s,x)=>s+x.baseline.mae,0)/n,baselineScore:selected.reduce((s,x)=>s+x.baseline.score,0)/n};
 const confusion=Array.from({length:3},()=>[0,0,0]);blocks.forEach((r,i)=>confusion[selected[i].actualClass][r.estimate.classIndex]++);
 const counts=confusion.map(a=>a.reduce((s,v)=>s+v,0));
 return {n,all:usable.length,accuracy:mean('correct'),baselineAccuracy:mean('baselineCorrect'),balanced:counts.some(n=>!n)?null:confusion.reduce((s,a,i)=>s+a[i]/counts[i],0)/3,counts};
}
function report(rows){return Object.keys(VERSIONS).flatMap(model=>(model==='garch'?[5,20]:[HORIZON]).map(horizon=>{
 const all=rows.filter(r=>r.model===model&&r.horizon===horizon),m=aggregate(all,model,horizon),recent=separate(all.filter(r=>r.verification.state==='resolved')).slice(-40),previous=aggregate(recent.slice(0,20),model,horizon),latest=aggregate(recent.slice(20),model,horizon);
 const enough=model==='verdict'?m.directional>=20:m.n>=20;
 const noEdge=enough&&(model==='garch'?m.score>=Math.min(m.constantScore,m.ewmaScore):model==='quantile'?m.score>=m.baselineScore:['neural','boosting'].includes(model)&&m.accuracy<=m.baselineAccuracy);
 const degraded=previous.n===20&&latest.n===20&&!m.descriptive&&(model==='garch'?latest.score-Math.min(latest.constantScore,latest.ewmaScore)>previous.score-Math.min(previous.constantScore,previous.ewmaScore)+.1:model==='quantile'?latest.mae>previous.mae*1.25&&latest.mae>previous.mae+.1:model==='verdict'?previous.directional===20&&latest.directional===20&&latest.accuracy<previous.accuracy-.1:latest.accuracy<previous.accuracy-.1);
 const flags={enough,underCoverage:model==='quantile'&&enough&&m.coverage<.7,noEdge,degraded};
 let warning='Mai puțin de 20 orizonturi separate; rezultat exploratoriu.';
 if(model==='verdict'&&!enough)warning='Mai puțin de 20 verdicturi direcționale pe orizonturi separate; dovezi insuficiente. Abținerile nu intră în acuratețe.';
 else if(m.descriptive)warning='Context observat, fără etichete externe pentru acuratețe.';
 else if(enough)warning=flags.underCoverage?'Acoperire observată sub 70%.':noEdge?model==='garch'?'QLIKE fără avantaj față de cel mai bun reper.':model==='quantile'?'Scor de interval fără avantaj față de reper.':'Acuratețe fără avantaj față de reper.':'Monitorizare; rezultatele nu garantează performanța viitoare.';
 if(degraded)warning+=' Degradare între ultimele două blocuri de 20 observații.';
 return {model,horizon,...m,pending:all.filter(r=>r.verification.state==='pending').length,unverifiable:all.filter(r=>r.verification.state==='unverifiable').length,warning,flags};
}));}
function createStore(storage){
 function read(e){const k=key(e);if(!k)return {ok:false,entries:[],error:'Identitate incompletă.'};try{const raw=storage.getItem(k);if(raw===null||raw===undefined)return {ok:true,entries:[]};if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error();const d=JSON.parse(raw);if(d.version!==VERSION||!Array.isArray(d.entries)||d.entries.length>MAX||d.entries.some(r=>!validEntry(r,e))||new Set(d.entries.map(r=>r.id)).size!==d.entries.length)throw Error();return {ok:true,entries:d.entries};}catch{return {ok:false,entries:[],error:'Registru ilizibil; datele existente sunt păstrate. Exportă sau verifică stocarea.'};}}
 function write(e,entries){const data=JSON.stringify({version:VERSION,entries});if(entries.length>MAX||data.length>MAX_BYTES)throw Error('Registrul este plin; exportă datele. Estimările existente sunt păstrate.');storage.setItem(key(e),data);}
 function save(input,e,now=Date.now()){const d=read(e);if(!d.ok)return d;const r=project(input,e,now);if(!r)return {...d,ok:false,error:'Estimare incompatibilă, expirată sau prea târzie pentru urmărire prospectivă.'};if(d.entries.some(x=>x.id===r.id))return {...d,duplicate:true};try{write(e,[...d.entries,r]);return {ok:true,entries:[...d.entries,r],saved:true};}catch(err){return {...d,ok:false,error:err.message};}}
 function check(e,source,now=Date.now()){const d=read(e);if(!d.ok)return d;let safe=source;try{safe={...source,bars:source.bars.map(b=>({...b}))};validateSeries(safe,now);checkedSources.add(safe);}catch{}const entries=d.entries.map(r=>verify(r,safe,now));try{if(entries.some(r=>!validEntry(r,e)))throw Error('Verificarea nu poate fi păstrată.');write(e,entries);return {ok:true,entries};}catch(err){return {...d,ok:false,error:err.message};}}
 return {read,save,check};
}
g.HoldingsForecast={VERSION,HORIZON,MAX,VERSIONS,horizonFor,key,identity,timely,project,validEntry,verify,metric,separate,aggregate,report,createStore};
})(typeof window!=='undefined'?window:globalThis);
