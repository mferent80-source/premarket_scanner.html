// Public scanner snapshot only. Desk always recalculates the risk limits locally.
(function(g){
'use strict';
var MAX_AGE=30*60*1000;
function current(x,now){now=now===undefined?Date.now():now;return !!x&&Number.isFinite(x.ts)&&x.ts>0&&x.ts<=now+60000&&now-x.ts<=MAX_AGE&&!!g.DailySeries&&g.DailySeries.usable(x,now);}
function read(x,expected,now){
  expected=expected||{};now=now===undefined?Date.now():now;
  function bad(message){return {ok:false,message:message};}
  if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.symbol!=='string'||!(/^[A-Z0-9][A-Z0-9.-]{0,14}$/).test(x.symbol)||!['momentum','reversal'].includes(x.mode))return bad('Identitatea candidatului nu poate fi verificată.');
  if((expected.symbol&&x.symbol!==expected.symbol)||(expected.mode&&x.mode!==expected.mode))return bad('Analiza primită nu corespunde simbolului și strategiei selectate.');
  if(!Number.isFinite(x.ts)||x.ts<=0||x.ts>now+60000||now-x.ts>MAX_AGE)return bad('Analiza a expirat sau are o dată invalidă. Rulează din nou scannerul.');
  if(!current(x,now))return bad('Sesiunea EOD nu mai este actuală. Rulează din nou scannerul.');
  if(x.actionable!==true||!['EARLY','WATCH','ARMED','FIRE'].includes(x.state))return bad('Candidatul nu permite construirea unui plan. Verifică motivul și Governor.');
  if(!/^[A-Z]{3}$/.test(x.currency)||!['US','EU'].includes(x.region)||!Number.isFinite(x.score)||x.score<0||x.score>100)return bad('Moneda sau datele analizei nu pot fi verificate.');
  if(![x.entryLow,x.entryHigh,x.stop,x.target].every(function(n){return Number.isFinite(n)&&n>0&&n<=Number.MAX_SAFE_INTEGER;})||x.entryLow>x.entryHigh||x.stop>=x.entryLow||x.target<=x.entryHigh)return bad('Nivelurile nu formează un plan Long valid.');
  var candidate={};
  if(x.kind!==undefined&&!['market','synthetic'].includes(x.kind))return bad('Tipul datelor nu poate fi verificat.');
  if(x.kind)candidate.kind=x.kind;
  if(x.dataQuality&&typeof x.dataQuality==='object'&&!Array.isArray(x.dataQuality))candidate.dataQuality=Object.fromEntries(Object.entries(x.dataQuality).filter(([k,v])=>['provider','exchange','timezone','session','interval','calendar','priceBasis','readAt','retrievedAt','quoteAt','delayMinutes','validBars','inputBars','completedBars'].includes(k)&&(v===null||Number.isFinite(v)||typeof v==='string'&&v.length<=200)));
  ['symbol','mode','currency','region','state','actionable','ts','sourceDate','sourceTimezone','sourceCloseMinutes','score','entryLow','entryHigh','stop','target'].forEach(function(k){candidate[k]=x[k];});
  ['price','dayChg','rvol','rs','metricA','metricB','baseDays','atr'].forEach(function(k){if(Number.isFinite(x[k]))candidate[k]=x[k];});
  if(x.trend?.version==='decision-verdict-v1')candidate.trend=Object.fromEntries(['version','short','medium','long','price','ema21','ema50','ema200','slope21','slope50','ret5','ret20','historyKey'].filter(k=>typeof x.trend[k]==='string'||Number.isFinite(x.trend[k])||x.trend[k]===null).map(k=>[k,x.trend[k]]));
  ['reason','sector','earnings'].forEach(function(k){candidate[k]=typeof x[k]==='string'?x[k].slice(0,k==='reason'?1000:160):'';});
  return {ok:true,candidate:candidate};
}
function decode(fragment,expected,now){
  try{var raw=new URLSearchParams(String(fragment||'').replace(/^#/, '')).get('plan');if(!raw||raw.length>5000)return {ok:false,message:'Analiza candidatului nu a fost transmisă. Revino în scanner.'};return read(JSON.parse(raw),expected,now);}
  catch(_){return {ok:false,message:'Analiza transmisă este ilizibilă. Revino în scanner.'};}
}
function merge(data,candidate,now){
  now=now===undefined?Date.now():now;
  var fresh=data&&Number.isFinite(data.updatedAt)&&data.updatedAt<=now+60000&&now-data.updatedAt<=MAX_AGE;
  var out={momentum:[],reversal:[],analyses:[],updatedAt:fresh?Math.max(data.updatedAt,candidate.ts):candidate.ts};
  ['momentum','reversal','analyses'].forEach(function(k){out[k]=fresh&&Array.isArray(data[k])?data[k].filter(function(x){return current(x,now)&&!(x.symbol===candidate.symbol&&x.mode===candidate.mode);}):[];});
  out[candidate.mode].unshift(candidate);
  return out;
}
g.CandidatePlanHandoff={current:current,read:read,decode:decode,merge:merge};
})(typeof window!=='undefined'?window:globalThis);
