/* Observed verdict changes and the separate evolution of broker P&L / EOD trend. */
(function(g){'use strict';
const finite=Number.isFinite,unit=c=>c==='GBp'?'GBX':c,ccy=c=>typeof c==='string'&&(/^[A-Z]{3}$/.test(c)||c==='GBp'),text=s=>typeof s==='string'&&s.length>0&&s.length<500;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,c='',signed=false)=>finite(v)?(signed&&v>0?'+':'')+v.toLocaleString('ro-RO',{maximumFractionDigits:2})+(c?' '+c:''):'—';
const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&finite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const fresh=(at,now)=>finite(Date.parse(at))&&Date.parse(at)<=now+60000&&now-Date.parse(at)<=300000;
function resolve(p,entry,{symbol,benchmark=null,sectorBenchmark=null,now=Date.now()}={}){
 const m=entry?.model;if(!m||entry.error||!text(symbol)||entry.symbol!==symbol||entry.benchmark!==benchmark||entry.sectorBenchmark!==sectorBenchmark||!finite(entry.fetchedAt)||entry.fetchedAt>now+60000||!ccy(entry.currency)||unit(entry.currency)!==unit(p?.instrumentCurrency)||!finite(m.price)||m.price<=0)return null;
 try{if(!g.DailySeries||m.asOf!==g.DailySeries.expected(now,m.timezone,m.closeMinutes))return null;}catch{return null;}
 return {...m,symbol,currency:entry.currency};
}
function joint(p,m,daily,{at,now=Date.now()}={}){
 const pnl=ccy(p?.currency)&&finite(p.unrealized)?p.unrealized:null,live=fresh(at,now),medium=m?.medium,short=m?.short,technical=!!m&&ccy(m.currency)&&unit(m.currency)===unit(p?.instrumentCurrency)&&day(m.asOf)&&['Ascendent','Descendent','Tranziție','Istoric insuficient'].includes(medium);
 const comparable=live&&daily?.state==='ready'&&!daily.stale&&daily.to===at&&daily.pnlCurrency===p?.currency&&finite(daily.pnlDelta),delta=comparable?daily.pnlDelta:null;
 let state='unknown',label='Evoluție încă neverificată';
 if(live&&pnl!==null){
  if(pnl<0&&delta>0){state='recovery';label='Pe minus · pierderea se reduce';}
  else if(pnl<0&&delta<0){state='loss-worsening';label='Pe minus · pierderea crește';}
  else if(pnl>0&&technical&&(medium==='Descendent'||short==='Descendent')){state='weakening';label='Pe plus · direcția tehnică slăbește';}
  else if(pnl>0&&delta>0){state='gain-strengthening';label='Pe plus · câștigul crește';}
  else if(pnl>0&&delta<0){state='gain-shrinking';label='Pe plus · câștigul se reduce';}
  else{state=pnl<0?'loss':pnl>0?'gain':'flat';label=pnl<0?'Pe minus · evoluție monetară neconfirmată':pnl>0?'Pe plus · evoluție monetară neconfirmată':'P&L la zero';}
 }
 const money=!live?'Citire broker veche sau neverificată; sincronizează.':pnl===null?'P&L-ul raportat sau moneda contului lipsesc.':delta!==null?'P&L '+fmt(pnl,p.currency,true)+' · schimbare '+fmt(delta,p.currency,true)+' față de citirea din '+daily.fromDay+'.':(daily?.reason||'Mai trebuie o citire comparabilă din altă zi.');
 const trend=technical?'EOD '+m.asOf+' · scurt '+short+' · mediu '+medium+'.':'Trend EOD lipsă, expirat sau în altă monedă. Analizează poziția.';
 const note=state==='recovery'?(technical&&medium==='Ascendent'&&short==='Ascendent'?'Recuperarea monetară coincide cu o direcție EOD ascendentă.':technical?'Pierderea se reduce; trendul EOD nu confirmă o recuperare aliniată.':'Recuperarea monetară nu are încă o confirmare tehnică verificată.'):state==='weakening'?'Câștigul existent nu confirmă continuarea trendului. Citește separat schimbarea P&L.':'';
 return {state,label,money,trend,note,pnl:live?pnl:null,delta,technical,from:comparable?daily.from:null,to:at};
}
function jointMarkup(r){if(!r)return '';return '<section class="position-evolution '+esc(r.state)+'" aria-label="Bani și direcție tehnică"><b>'+esc(r.label)+'</b><p>'+esc(r.money)+'</p><p>'+esc(r.trend)+'</p>'+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</section>';}
function identity(e){return !!e&&['scope','ticker','symbol'].every(k=>text(e[k]))&&ccy(e.currency)&&['market','synthetic'].includes(e.kind)&&['benchmark','sectorBenchmark'].every(k=>e[k]==null||text(e[k]));}
function key(e){return identity(e)?'tt_holdings_verdict_changes_v1:'+JSON.stringify([e.scope,e.ticker,e.symbol,unit(e.currency),e.benchmark||null,e.sectorBenchmark||null,e.kind]):null;}
const fields=['price','ema21','ema50','rsi','rvol','rs20','support','resistance'],codes=['stop','near','missing','down','up','mixed'],stopStates=['missing','crossed','near','safe'],trends=['Ascendent','Descendent','Tranziție','Istoric insuficient'];
function project(p,m,n,r,{now=Date.now(),at}={}){
 if(!m||!day(m.asOf)||!ccy(m.currency)||!codes.includes(r?.code)||!stopStates.includes(r?.stop?.state)||!finite(now)||Date.parse(m.asOf)>now||!finite(m.price)||m.price<=0)return null;
 const values=Object.fromEntries(fields.map(k=>[k,finite(m[k])?m[k]:null]));
 return {at:now,asOf:m.asOf,currency:unit(m.currency),code:r.code,title:r.title,short:trends.includes(m.short)?m.short:null,medium:trends.includes(m.medium)?m.medium:null,long:trends.includes(m.long)?m.long:null,...values,stop:{state:r.stop.state,level:r.stop.level??null,threshold:r.stop.threshold??null,currency:ccy(n.stopCurrency)?unit(n.stopCurrency):null,price:r.stop.price??null,source:r.stop.source??null,brokerAt:fresh(at,now)&&r.stop.source==='Ultima citire broker'?at:null},fundamental:['slăbită','susținută','necunoscută'].includes(n.fundamental)?n.fundamental:null};
}
function valid(r,now){return r&&finite(r.at)&&r.at<=now&&day(r.asOf)&&Date.parse(r.asOf)<=r.at&&ccy(r.currency)&&codes.includes(r.code)&&text(r.title)&&fields.every(k=>r[k]===null||finite(r[k]))&&r.price>0&&['short','medium','long'].every(k=>r[k]===null||trends.includes(r[k]))&&stopStates.includes(r.stop?.state)&&['level','threshold','price'].every(k=>r.stop[k]===null||finite(r.stop[k]))&&(r.stop.currency===null||ccy(r.stop.currency))&&(r.stop.source===null||text(r.stop.source))&&(r.stop.brokerAt===null||finite(Date.parse(r.stop.brokerAt))&&Date.parse(r.stop.brokerAt)<=r.at+60000)&&(r.fundamental===null||['slăbită','susținută','necunoscută'].includes(r.fundamental));}
function signature(r){const {at,stop,...rest}=r;const {price,source,brokerAt,...rule}=stop;return JSON.stringify({...rest,stop:rule});}
function compare(a,b){
 if(!a)return {state:'first',changed:false,rows:[],reason:'Prima evaluare păstrată. Comparația apare la o schimbare de EOD, de plan sau de stare a stopului.'};
 const rows=[];for(const [k,label] of [['short','Trend scurt'],['medium','Trend mediu'],['long','Trend lung']])if(a[k]!==b[k])rows.push(label+': '+(a[k]||'neverificat')+' → '+(b[k]||'neverificat')+'.');
 for(const [k,label] of [['ema21','EMA21'],['ema50','EMA50'],['support','suport'],['resistance','rezistență']])if(finite(a[k])&&a[k]>0&&finite(b[k])&&b[k]>0&&(a.price>a[k])!==(b.price>b[k]))rows.push('Închiderea a trecut '+(b.price>b[k]?'peste ':'la/sub ')+label+' în analiza curentă. Reperele se recalculează la fiecare EOD.');
 if(finite(a.rvol)&&finite(b.rvol)&&(a.rvol>=1.2)!==(b.rvol>=1.2))rows.push('Confirmarea volumului ≥1,2×: '+a.rvol.toLocaleString('ro-RO',{maximumFractionDigits:2})+'× → '+b.rvol.toLocaleString('ro-RO',{maximumFractionDigits:2})+'×.');
 if(finite(a.rs20)&&finite(b.rs20)&&(a.rs20>0)!==(b.rs20>0))rows.push('Forța față de benchmark: '+fmt(a.rs20,'pp',true)+' → '+fmt(b.rs20,'pp',true)+'.');
 if(finite(a.rsi)&&finite(b.rsi)&&((a.rsi>=70)!==(b.rsi>=70)||(a.rsi<=30)!==(b.rsi<=30)))rows.push('RSI a schimbat zona de impuls: '+fmt(a.rsi)+' → '+fmt(b.rsi)+'.');
 if(a.stop.level!==b.stop.level||a.stop.currency!==b.stop.currency||a.stop.threshold!==b.stop.threshold)rows.push('Planul personal s-a schimbat: stop '+fmt(a.stop.level,a.stop.currency||'')+' → '+fmt(b.stop.level,b.stop.currency||'')+'; zonă de alertă '+fmt(a.stop.threshold,'%')+' → '+fmt(b.stop.threshold,'%')+'.');
 if(a.stop.state!==b.stop.state){const labels={missing:'neverificat',safe:'peste zona de alertă',near:'aproape de stop',crossed:'stop atins'};rows.push('Starea stopului: '+labels[a.stop.state]+' → '+labels[b.stop.state]+'.'+(b.stop.source?' Reper actual: '+b.stop.source+' · '+fmt(b.stop.price,b.stop.currency||'')+'.':''));}
 if(a.fundamental!==b.fundamental)rows.push('Evaluarea fundamentală introdusă de tine: '+(a.fundamental||'neverificată')+' → '+(b.fundamental||'neverificată')+'.');
 const changed=a.code!==b.code;if(!rows.length)rows.push('Categoriile trendului, zonele indicatorilor și starea stopului sunt neschimbate.');
 return {state:changed?'changed':'same',changed,rows,from:a,to:b,reason:changed?'Verdictul s-a schimbat. Condițiile modificate sunt explicate mai jos.':'Verdictul este păstrat; schimbările de mai jos nu au schimbat regula dominantă.'};
}
function observe(storage,e,p,m,n,r,options={}){
 const now=options.now??Date.now(),k=key(e),current=project(p,m,n,r,{...options,now});if(!k||!current||unit(current.currency)!==unit(e.currency))return {state:'unavailable',rows:[],reason:'Analiza actuală trebuie verificată înainte de păstrarea comparației.'};
 try{
  const raw=storage.getItem(k);if(raw&&raw.length>30000)throw Error('size');const old=raw?JSON.parse(raw):null;
  if(old&&(old.version!==1||!valid(old.current,now)||old.previous!==null&&(!valid(old.previous,now)||old.previous.at>old.current.at||old.previous.asOf>old.current.asOf||unit(old.previous.currency)!==unit(e.currency))||unit(old.current.currency)!==unit(e.currency)))throw Error('schema');
  if(old&&current.asOf<old.current.asOf)return {state:'unavailable',rows:[],reason:'Analiza curentă este mai veche decât reperul păstrat; istoricul este păstrat.'};
  if(old&&signature(current)===signature(old.current))return compare(old.previous,old.current);
  const next={version:1,current,previous:old?.current||null};storage.setItem(k,JSON.stringify(next));return compare(next.previous,next.current);
 }catch{return {state:'unavailable',rows:[],reason:'Comparația nu poate fi păstrată sau verificată. Istoricul existent rămâne intact.'};}
}
function changeMarkup(r,{simulated=false}={}){
 if(!r)return '';return '<details class="holding-verdict-change"><summary>De ce s-a schimbat verdictul? · '+(r.changed?'schimbare observată':r.state==='same'?'păstrat':r.state==='first'?'primul reper':'neverificat')+'</summary>'+(simulated?'<p class="meta">DEMO · comparație pe date fictive.</p>':'')+'<p>'+esc(r.reason)+'</p>'+(r.from?'<p class="meta">'+esc(r.from.title)+' → '+esc(r.to.title)+'<br>EOD '+esc(r.from.asOf)+' → '+esc(r.to.asOf)+' · evaluări '+esc(new Date(r.from.at).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'}))+' → '+esc(new Date(r.to.at).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'}))+'.'+(r.from.asOf===r.to.asOf?' Aceeași sesiune EOD: reevaluare, fără o sesiune nouă de piață.':'')+'</p>':'')+(r.rows.length?'<ul>'+r.rows.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+'<p class="meta">Comparăm evaluări observate pentru același cont, simbol, monedă și benchmark. Condițiile explică regulile verdictului; nu certifică motivul mișcării pieței.</p></details>';
}
g.HoldingEvolution={resolve,joint,jointMarkup,key,project,compare,observe,changeMarkup};
})(typeof window!=='undefined'?window:globalThis);
