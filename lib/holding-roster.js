/* Account-scoped favorites and frozen visit baselines; no orders or training. */
(function(g){'use strict';
const finite=Number.isFinite,text=x=>typeof x==='string'&&x.length>0&&x.length<500,unit=x=>x==='GBp'?'GBX':x,ccy=x=>typeof x==='string'&&(/^[A-Z]{3}$/.test(x)||x==='GBp');
const fmt=x=>finite(x)?x.toLocaleString('ro-RO',{maximumFractionDigits:2}):'—',fresh=(at,now)=>finite(Date.parse(at))&&Date.parse(at)<=now+60000&&now-Date.parse(at)<=300000;
const codes=['stop','near','missing','down','up','mixed'],states=['missing','crossed','near','safe'],trends=['Ascendent','Descendent','Tranziție','Istoric insuficient'];
const nullableNumber=x=>x===null||finite(x),nullableText=x=>x===null||text(x),day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&finite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
function usableModel(p,symbol,m,now){return m&&text(symbol)&&m.symbol===symbol&&ccy(m.currency)&&unit(m.currency)===unit(p.instrumentCurrency)&&finite(m.price)&&m.price>0&&day(m.asOf)&&Date.parse(m.asOf)<=now&&(m.checkedAt==null||finite(m.checkedAt)&&m.checkedAt<=now+60000)?m:null;}
function validTechnical(r,at){return r&&finite(r.at)&&r.at<=at&&day(r.asOf)&&Date.parse(r.asOf)<=r.at&&ccy(r.currency)&&codes.includes(r.code)&&text(r.title)&&['price','ema21','ema50','rsi','rvol','rs20','support','resistance'].every(k=>nullableNumber(r[k]))&&r.price>0&&['short','medium','long'].every(k=>r[k]===null||trends.includes(r[k]))&&states.includes(r.stop?.state)&&['level','threshold','price'].every(k=>nullableNumber(r.stop[k]))&&(r.stop.currency===null||ccy(r.stop.currency))&&nullableText(r.stop.source)&&(r.stop.brokerAt===null||finite(Date.parse(r.stop.brokerAt))&&Date.parse(r.stop.brokerAt)<=r.at+60000)&&(r.fundamental===null||['slăbită','susținută','necunoscută'].includes(r.fundamental));}
function scopeKey(scope,kind='market'){return text(scope)&&['market','synthetic'].includes(kind)?'tt_holdings_roster_v1:'+JSON.stringify([scope,kind]):null;}
function entry(p,{symbol,model=null,note={},brokerAt,benchmark=null,sectorBenchmark=null,now=Date.now()}={}){
 const usable=usableModel(p,symbol,model,now);
 const pulse=g.HoldingsPulse.build(p,usable,note,{at:brokerAt,now});
 return {ticker:p.ticker,identity:JSON.stringify([symbol||null,unit(p.instrumentCurrency)||null,p.currency||null,benchmark,sectorBenchmark]),symbol:symbol||p.ticker,
  quantity:finite(p.quantity)&&p.quantity>0?p.quantity:null,average:finite(p.averagePrice)&&p.averagePrice>0?p.averagePrice:null,pnl:ccy(p.currency)&&finite(p.unrealized)?p.unrealized:null,currency:ccy(p.currency)?p.currency:null,brokerAt:fresh(brokerAt,now)?brokerAt:null,
  technical:g.HoldingEvolution.project(p,usable,note,pulse,{at:brokerAt,now}),stop:{state:pulse.stop.state,distance:pulse.stop.distance,level:pulse.stop.level,currency:pulse.stop.currency||null,source:pulse.stop.source||null},pulse:{code:pulse.code,title:pulse.title}};
}
function validEntry(e,at){
 if(!e||!text(e.ticker)||!text(e.symbol)||typeof e.identity!=='string'||e.identity.length>2200)return false;
 try{const id=JSON.parse(e.identity);if(!Array.isArray(id)||id.length!==5||!id.every(nullableText)||(id[1]!==null&&!ccy(id[1]))||(id[2]!==null&&!ccy(id[2])))return false;}catch{return false;}
 return ['quantity','average'].every(k=>e[k]===null||finite(e[k])&&e[k]>0)&&nullableNumber(e.pnl)&&(e.currency===null||ccy(e.currency))&&(e.brokerAt===null||finite(Date.parse(e.brokerAt))&&Date.parse(e.brokerAt)<=at+60000)&&(e.technical===null||validTechnical(e.technical,at))&&states.includes(e.stop?.state)&&['distance','level'].every(k=>nullableNumber(e.stop[k]))&&(e.stop.currency===null||ccy(e.stop.currency))&&nullableText(e.stop.source)&&codes.includes(e.pulse?.code)&&text(e.pulse.title);
}
function validSnapshot(s,now){return s&&s.version===1&&finite(s.at)&&s.at>=0&&s.at<=now+60000&&Array.isArray(s.entries)&&s.entries.length<=500&&new Set(s.entries.map(e=>e?.ticker)).size===s.entries.length&&s.entries.every(e=>validEntry(e,s.at));}
function changes(previous,current,{now=Date.now()}={}){
 if(!previous)return {state:'first',changed:false,lines:[]};
 if(previous.identity!==current.identity)return {state:'incompatible',changed:false,lines:['Simbolul, moneda sau benchmarkul s-au schimbat; reperele nu sunt comparate.']};
 const lines=[],a=previous.technical,b=current.technical;
 if(a&&b&&a.asOf<=b.asOf){
  const r=g.HoldingEvolution.compare(a,b);if(r.changed)lines.push('Verdict: '+a.title+' → '+b.title+'.');
  lines.push(...r.rows.filter(x=>!x.startsWith('Categoriile trendului,')));
 }else if(a&&!b)lines.push('Analiza EOD este acum indisponibilă sau expirată; direcția trebuie reverificată.');
 else if(!a&&b)lines.push('Analiza EOD este acum disponibilă · '+b.asOf+'.');
 else if(a&&b&&a.asOf>b.asOf)return {state:'older',changed:false,lines:['Analiza este mai veche decât reperul vizitei; nu deducem o schimbare.']};
 const quantity=previous.quantity!==current.quantity,average=previous.average!==current.average;
 if(quantity)lines.push('Cantitate: '+fmt(previous.quantity)+' → '+fmt(current.quantity)+'. Schimbarea P&L nu este comparabilă.');
 if(average)lines.push('Cost mediu: '+fmt(previous.average)+' → '+fmt(current.average)+'. Schimbarea P&L nu este comparabilă.');
 if(!quantity&&!average&&finite(current.quantity)&&current.quantity>0&&finite(current.average)&&current.average>0&&current.brokerAt&&fresh(current.brokerAt,now)&&previous.brokerAt&&Date.parse(previous.brokerAt)<=Date.parse(current.brokerAt)&&finite(previous.pnl)&&finite(current.pnl)&&previous.currency===current.currency&&previous.pnl!==current.pnl){const delta=current.pnl-previous.pnl;if(finite(delta))lines.push('P&L broker: '+fmt(previous.pnl)+' → '+fmt(current.pnl)+' '+current.currency+' · schimbare '+(delta>0?'+':'')+fmt(delta)+'. Poate include FX și costuri.');}
 return {state:lines.length?'changed':'same',changed:lines.length>0,lines};
}
function prioritize(rows,favorites){const set=new Set(favorites);return rows.map((r,i)=>({r,i})).sort((a,b)=>Number(set.has(b.r.p.ticker))-Number(set.has(a.r.p.ticker))||a.i-b.i).map(x=>x.r);}
function create(storage){
 const sessions=new Map();
 function session(scope,kind,now){const key=scopeKey(scope,kind);if(!key)return null;if(sessions.has(key))return sessions.get(key);let old=null,error=null;
  try{const raw=storage.getItem(key);if(raw&&raw.length>500000)throw Error('size');old=raw?JSON.parse(raw):null;if(old&&(old.version!==1||!Array.isArray(old.favorites)||old.favorites.length>500||!old.favorites.every(text)||new Set(old.favorites).size!==old.favorites.length||old.snapshot!==null&&!validSnapshot(old.snapshot,now)))throw Error('schema');}
  catch{error='Reperul păstrat nu poate fi verificat; datele existente nu sunt suprascrise.';}
  const s={key,favorites:old&&!error?old.favorites:[],baseline:old&&!error?old.snapshot:null,latest:null,error};sessions.set(key,s);return s;
 }
 function save(s){if(s.error)return {ok:false,reason:s.error};try{storage.setItem(s.key,JSON.stringify({version:1,favorites:s.favorites,snapshot:s.latest||s.baseline}));s.writeError=null;return {ok:true};}catch{s.writeError='Modificarea este disponibilă în această pagină; browserul nu a putut păstra preferința și reperul.';return {ok:false,reason:s.writeError};}}
 function favorites(scope,kind='market',now=Date.now()){return [...(session(scope,kind,now)?.favorites||[])];}
 function toggle(scope,ticker,kind='market',now=Date.now()){const s=session(scope,kind,now);if(!s||!text(ticker)||s.error)return {ok:false,reason:s?.error||'Contul nu este verificat.'};s.favorites=s.favorites.includes(ticker)?s.favorites.filter(x=>x!==ticker):[...s.favorites,ticker].slice(-500);return save(s);}
 function observe(scope,entries,{kind='market',now=Date.now()}={}){
  const s=session(scope,kind,now),snapshot={version:1,at:now,entries};if(!s||!entries.length||!validSnapshot(snapshot,now))return {state:'unavailable',from:null,rows:[],reason:'Pozițiile și reperele trebuie verificate.'};
  const old=new Map((s.baseline?.entries||[]).map(e=>[e.ticker,e]));
  const rows=entries.map(e=>({...changes(old.get(e.ticker),e,{now}),ticker:e.ticker,symbol:e.symbol,newPosition:!!s.baseline&&!old.has(e.ticker)})).map(r=>r.newPosition?{...r,state:'changed',changed:true,lines:['Poziție observată pentru prima dată față de reperul vizitei precedente.']}:r);
  const signature=rows=>JSON.stringify(rows,(k,v)=>k==='at'?undefined:v);
  let result={ok:true};if(signature(s.latest?.entries)!==signature(entries)){s.latest=snapshot;result=save(s);}
  return {state:s.error?'unavailable':s.baseline?'ready':'first',from:s.baseline?.at||null,rows,reason:s.error||s.writeError||result.reason||(!s.baseline?'Primul reper al vizitei este păstrat. Comparația va apărea la următoarea deschidere a paginii.':'Față de ultima citire păstrată din vizita precedentă, pe acest dispozitiv.')};
 }
 function acknowledge(scope,kind='market',now=Date.now()){const s=session(scope,kind,now);if(!s?.latest||s.error)return {ok:false,reason:s?.error||'Nu există încă un reper actual.'};s.baseline={...s.latest,at:now};s.latest=s.baseline;return save(s);}
 function simulate(scope,previous,{now=Date.now()}={}){const s=session(scope,'synthetic',now);if(!s||s.error||!validSnapshot(previous,now))return false;s.baseline=previous;return true;}
 return {favorites,toggle,observe,acknowledge,simulate};
}
function comparison(p,{symbol,model=null,note={},snapshot,probability=null,kind='market',now=Date.now()}={}){
 let m=usableModel(p,symbol,model,now);
 if(m&&g.DailySeries){try{if(m.asOf!==g.DailySeries.expected(now,m.timezone,m.closeMinutes))m=null;}catch{m=null;}}
 const pulse=g.HoldingsPulse.build(p,m,note,{at:snapshot?.fetchedAt,now}),s=pulse.stop;
 const risk=['safe','near'].includes(s.state)&&finite(p.quantity)&&p.quantity>0&&finite(s.price)&&finite(s.level)&&s.price>s.level?(s.price-s.level)*p.quantity:null;
 const weight=finite(p.value)&&p.value>=0&&ccy(p.currency)&&p.currency===snapshot?.summary?.currency&&finite(snapshot.summary.totalValue)&&snapshot.summary.totalValue>0?p.value/snapshot.summary.totalValue*100:null;
 const fingerprint=m?.sourceFingerprint||(m?.bars&&g.HoldingsVerdict?.fingerprint(m.bars));
 const probs=m&&text(fingerprint)&&probability?.sourceFingerprint===fingerprint&&probability?.kind===kind&&probability?.horizon===5&&probability?.symbol===symbol&&probability?.asOf===m.asOf&&unit(probability?.currency)===unit(m.currency)&&Array.isArray(probability.probabilities)&&probability.probabilities.length===3&&probability.probabilities.every(x=>finite(x)&&x>=0&&x<=1)&&Math.abs(probability.probabilities.reduce((a,b)=>a+b,0)-1)<1e-6?probability:null;
 return {ticker:p.ticker,symbol:symbol||p.ticker,name:p.name||p.ticker,value:ccy(p.currency)&&finite(p.value)?p.value:null,pnl:ccy(p.currency)&&finite(p.unrealized)?p.unrealized:null,currency:ccy(p.currency)?p.currency:null,weight:finite(weight)?weight:null,model:m,pulse,stop:s,stopRisk:finite(risk)?risk:null,probability:probs,brokerAt:snapshot?.fetchedAt||null,brokerFresh:fresh(snapshot?.fetchedAt,now)};
}
g.HoldingRoster={scopeKey,entry,changes,prioritize,create,comparison,validSnapshot};
})(typeof window!=='undefined'?window:globalThis);
