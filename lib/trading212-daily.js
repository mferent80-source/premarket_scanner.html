(function(g){'use strict';
const KEY='tt_trading212_position_history_v1',VERSION=1,finite=Number.isFinite,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=v=>typeof v==='string'&&(/^[A-Z]{3}$/.test(v)||v==='GBp')?v:null;
function day(at){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
function observation(positions,at,now){
 const t=Date.parse(at);if(!Array.isArray(positions)||!finite(t)||t>now+60000)return null;
 const counts=new Map();for(const p of positions)counts.set(p?.ticker,(counts.get(p?.ticker)||0)+1);
 return {at,day:day(t),positions:positions.filter(p=>p&&typeof p.ticker==='string'&&p.ticker&&counts.get(p.ticker)===1&&finite(p.quantity)&&p.quantity>0).map(p=>({ticker:p.ticker,quantity:p.quantity,averagePrice:finite(p.averagePrice)?p.averagePrice:null,currentPrice:finite(p.currentPrice)&&p.currentPrice>0?p.currentPrice:null,instrumentCurrency:currency(p.instrumentCurrency),currency:currency(p.currency),unrealized:finite(p.unrealized)?p.unrealized:null}))};
}
function record(data,scope,environment,positions,at,now=Date.now()){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.accounts&& (typeof data.accounts!=='object'||Array.isArray(data.accounts)))throw Error('Registrul zilnic este ilizibil; copia existentă se păstrează.');
 if(!scope||!['live','demo'].includes(environment))throw Error('Cont neidentificat pentru istoricul zilnic.');
 if(data.version!==undefined&&data.version!==VERSION)throw Error('Istoric zilnic incompatibil; copia existentă se păstrează.');
 const next=observation(positions,at,now);if(!next)return data;
 const previous=data.accounts?.[scope];if(previous&&previous.environment!==environment)throw Error('Mediu diferit pentru istoricul contului.');
 if(previous&&(!Array.isArray(previous.days)||previous.days.some(x=>!x||!finite(Date.parse(x.at))||!Array.isArray(x.positions))))throw Error('Istoric zilnic incompatibil; copia existentă se păstrează.');
 const xs=Array.isArray(previous?.days)?previous.days.slice():[],latest=xs.at(-1);
 if(latest&&Date.parse(next.at)<=Date.parse(latest.at))return data;
 const index=xs.findIndex(x=>x.day===next.day);if(index<0)xs.push(next);else xs[index]=next;
 return {version:VERSION,accounts:{...(data.accounts||{}),[scope]:{environment,days:xs.slice(-90)}}};
}
function save(storage,scope,environment,positions,at,now=Date.now()){
 const raw=storage.getItem(KEY),data=raw?JSON.parse(raw):{version:VERSION,accounts:{}};
 const next=record(data,scope,environment,positions,at,now);if(next!==data)storage.setItem(KEY,JSON.stringify(next));return next;
}
function compare(data,{scope,environment='live',position,at,now=Date.now()}){
 const empty=reason=>({state:'missing',reason,pricePct:null,priceMove:null,pnlDelta:null});
 const t=Date.parse(at),a=data?.version===VERSION?data.accounts?.[scope]:null;
 if(!position||!finite(t)||t>now+60000||a?.environment!==environment||!Array.isArray(a.days))return empty('Istoric pentru acest cont și mediu indisponibil.');
 const today=day(t),prior=(a.days||[]).filter(x=>x&&typeof x.day==='string'&&x.day<today&&finite(Date.parse(x.at))&&Date.parse(x.at)<t).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
 if(!prior)return empty('Reperul apare după sincronizarea în cel puțin două zile diferite.');
 const p=Array.isArray(prior.positions)?prior.positions.find(p=>p?.ticker===position.ticker):null;if(!p)return empty('Poziția nu exista în ultima citire din '+prior.day+'.');
 const stale=now-t>300000,base={from:prior.at,to:at,fromDay:prior.day,toDay:today,stale,pricePct:null,priceMove:null,pnlDelta:null};
 if(!finite(position.quantity)||position.quantity<=0||position.quantity!==p.quantity||!finite(position.averagePrice)||!finite(p.averagePrice)||position.averagePrice!==p.averagePrice)return {...base,state:'changed',reason:'Cantitatea sau costul mediu s-au schimbat; comparația este blocată (execuție / split posibil).'};
 if(!currency(position.instrumentCurrency)||position.instrumentCurrency!==p.instrumentCurrency||!finite(position.currentPrice)||position.currentPrice<=0||!finite(p.currentPrice)||p.currentPrice<=0)return {...base,state:'missing',reason:'Prețurile sau moneda instrumentului nu sunt comparabile.'};
 const pricePct=(position.currentPrice/p.currentPrice-1)*100,priceMove=(position.currentPrice-p.currentPrice)*position.quantity;
 const pnlDelta=currency(position.currency)&&position.currency===p.currency&&finite(position.unrealized)&&finite(p.unrealized)?position.unrealized-p.unrealized:null;
 if(!finite(pricePct)||!finite(priceMove)||pnlDelta!==null&&!finite(pnlDelta))return {...base,state:'missing',reason:'Calculul depășește limitele numerice.'};
 return {...base,state:'ready',pricePct,priceMove,pnlDelta,priceCurrency:position.instrumentCurrency,pnlCurrency:position.currency,reason:'Față de ultima citire din '+prior.day+(today!==day(Date.parse(prior.at)+86400000)?' · interval de mai multe zile':'')};
}
function markup(r){const f=(v,unit='')=>finite(v)?(v>0?'+':'')+v.toLocaleString('ro-RO',{maximumFractionDigits:2})+(unit?' '+unit:''):'—';return '<section class="position-daily" aria-label="Evoluția observată a poziției"><b>Evoluție observată'+(r.stale?' · date vechi':'')+'</b><p>'+esc(r.reason)+'</p>'+(r.state==='ready'?'<div><strong class="'+(r.pricePct<0?'bad negative':r.pricePct>0?'good positive':'')+'">'+esc(f(r.pricePct,'%'))+'</strong><span>Preț × cantitate: '+esc(f(r.priceMove,r.priceCurrency))+'</span><span>Schimbare P&amp;L broker: '+esc(f(r.pnlDelta,r.pnlCurrency))+'</span></div><small>'+esc(new Date(r.from).toLocaleString('ro-RO'))+' → '+esc(new Date(r.to).toLocaleString('ro-RO'))+' · Citiri observate, fără confirmarea închiderii. Variația P&amp;L poate include FX și costuri.</small>':'')+'</section>';}
function read(storage){try{return JSON.parse(storage.getItem(KEY)||'null');}catch{return null;}}
function demo(scope,environment,positions,at=new Date().toISOString()){
 let data={version:VERSION,accounts:{}};const now=Date.parse(at);
 for(let ago=35;ago>=1;ago--){if(ago%6===0)continue;const before=new Date(now-ago*86400000).toISOString(),prior=positions.map((p,i)=>{const factor=1+(i%2?1:-1)*ago*.0018+Math.sin(ago*.7+i)*.006;return {...p,currentPrice:p.currentPrice*factor,unrealized:finite(p.unrealized)?p.unrealized+(i%2?8:-12)*ago:null};});data=record(data,scope,environment,prior,before,now);}
 return data;
}
g.T212Daily={KEY,VERSION,day,record,save,read,compare,markup,demo};
})(typeof window!=='undefined'?window:globalThis);
