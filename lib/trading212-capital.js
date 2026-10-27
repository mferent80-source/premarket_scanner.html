/* Account-currency controls; manual USD journal values never become broker values. */
(function(g){
'use strict';
const finite=Number.isFinite,currency=c=>typeof c==='string'&&/^[A-Z]{3}$/.test(c);
/* 19.10.2026 (punctul 5): „are stop” = StopSetter.stopValabil (stopul pus / schimbat după deschiderea poziției de acum; stopul rămas de la o
   poziție vândută nu acoperă poziția nouă). Paginile fără lib/stop-setter.js (desk, aplicația…) folosesc copia identică de mai jos;
   tools/stop-definitie-unica.test.mjs le ține la fel. */
function stopLaCopie(t){if(!t||!(Number(t.stop)>0))return null;let la=null,prec=null;for(const h of (Array.isArray(t.history)?t.history:[]).slice().sort((a,b)=>Date.parse(a?.at)-Date.parse(b?.at))){const st=Number(h?.stop),at=Date.parse(h?.at);if(st>0&&st!==prec&&finite(at))la=at;prec=st>0?st:null;}return la??(finite(Date.parse(t.updatedAt))?Date.parse(t.updatedAt):null);}
function stopValabilCopie(t,p){if(!t||!(Number(t.stop)>0))return false;const deschisa=Date.parse(p&&p.openedAt),la=stopLaCopie(t);return !finite(deschisa)||(la!=null&&la>=deschisa-3600000);}
const stopValabil=(t,p)=>(g.StopSetter&&typeof g.StopSetter.stopValabil==='function'?g.StopSetter.stopValabil:stopValabilCopie)(t,p);
/* 20.10.2026 (I-722): pierderea la VALOAREA DE PIAȚĂ (MTM), nu doar vânzările realizate: contul de acum față de ultima observație zilnică de dinaintea
   zilei NY de azi (tt_trading212_account_history_v1, scrisă la fiecare sincronizare) și de dinaintea lunii săptămânii, minus depunerile / plus
   retragerile dintre ele (tt_trading212_cash_v1). O zi cu −3 % pe pozițiile deschise fără nicio vânzare consumă bugetul zilei. Fără reper sau fără
   fluxurile citite după reper ⇒ „neverificat” la vedere (notă), nu zero și nu HALT. Pur; testat în tools/trading212-capital-mtm.test.mjs. */
const EXTERN=new Set(['DEPOSIT','WITHDRAW']),INTERN=new Set(['FEE','INTEREST_ON_FREE_CASH','LENDING_INTEREST']);
function mtm({daily=null,cash=null,total=null,currency:moneda=null,day,week,now=Date.now()}={}){
 const out={state:'missing',reason:null,day:null,week:null,fromDay:null,fromWeek:null,flowsDay:null,flowsWeek:null,weekReason:null};
 if(!finite(total)||total<0||!currency(moneda))return {...out,reason:'valoarea contului nu e citită'};
 const fmtNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}),obs=(Array.isArray(daily)?daily:[]).filter(x=>x&&finite(Date.parse(x.at))&&Date.parse(x.at)<=now&&finite(x.total)&&x.total>=0&&x.currency===moneda).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const dayOf=x=>fmtNY.format(Date.parse(x.at)),refDay=obs.filter(x=>dayOf(x)<day).at(-1)||null,refWeek=obs.filter(x=>dayOf(x)<week).at(-1)||null;
 if(!refDay)return {...out,reason:'lipsește observația de ieri a contului (istoricul începe la prima sincronizare); bugetul folosește doar vânzările'};
 const tx=cash?.transactions,flows=Array.isArray(tx?.items)?tx.items:null,txAt=Date.parse(tx?.fetchedAt);
 if(!flows||tx.error||!finite(txAt)||txAt<Date.parse(refDay.at))return {...out,fromDay:refDay.at,reason:'depunerile și retragerile nu sunt citite după reperul de ieri; pierderea la valoarea de piață rămâne neverificată'};
 const flux=from=>{let s=0;for(const x of flows){const t=Date.parse(x?.date);if(!x||!finite(t)||t<=from||t>now+60000||INTERN.has(x.type))continue;if(!EXTERN.has(x.type)||x.currency!==moneda||!finite(x.amount))return null;s+=x.type==='WITHDRAW'?-Math.abs(x.amount):x.amount;}return s;};
 const fd=flux(Date.parse(refDay.at));if(fd===null)return {...out,fromDay:refDay.at,reason:'o operație monetară de după reper e neclasificată, în altă monedă sau fără sumă; MTM neverificat'};
 out.day=total-refDay.total-fd;out.fromDay=refDay.at;out.flowsDay=fd;out.state='ready';
 if(!refWeek)out.weekReason='fără observație de dinaintea săptămânii';
 else{const fw=flux(Date.parse(refWeek.at));if(fw===null)out.weekReason='fluxuri neverificate în săptămână';else{out.week=total-refWeek.total-fw;out.fromWeek=refWeek.at;out.flowsWeek=fw;}}
 return out;
}
function build({scope,snapshot,notes={},history=null,cfg={},now=Date.now(),daily=null,cash=null}={}){
 const result={scope:scope||null,source:'Trading 212 Invest',state:'missing',verdict:'HALTED',currency:null,equity:null,available:null,reserved:null,invested:null,exposurePct:null,positions:null,rows:[],stopCoverage:0,knownStopRisk:null,totalStopRisk:null,implicitFX:false,todayPnl:null,weekPnl:null,todayTrades:null,consecutiveLosses:null,budgetLeft:null,weekBudgetLeft:null,stopBudgetLeft:null,snapshotAt:snapshot?.fetchedAt||null,reasons:[],notes:[],mtm:null,limits:{instrumentPct:cfg.maxInstrumentPct??20,totalStopPct:cfg.maxTotalStopPct??5,maxPositions:cfg.maxOpenPositions??4,dayPct:cfg.maxLossPctDay??2,weekPct:cfg.maxLossPctWeek??3,maxTrades:cfg.maxTradesDay??5,cooldown:cfg.cooldownAfterLosses??3}};
 const r=result,s=snapshot?.summary,c=s?.currency,errors=[];
 const bad=t=>errors.push(t),warn=t=>r.reasons.push(t);
 if(!scope||!snapshot||snapshot.environment!=='live'){r.reasons=['Conectează contul Invest pentru controlul capitalului real.'];return r;}
 r.state='incomplete';r.currency=currency(c)?c:null;
 const at=Date.parse(snapshot.fetchedAt);if(!finite(at)||at>now+60000||now-at>300000)bad('Snapshot Invest expirat sau cu timp invalid. Reia sincronizarea.');
 if(!currency(c)||!finite(s?.totalValue)||s.totalValue<=0||!['available','reserved','invested'].every(k=>finite(s[k])&&s[k]>=0))bad('Capitalul, soldul disponibil sau investițiile nu sunt complete în aceeași monedă.');
 if(!Array.isArray(snapshot.positions))bad('Lista completă a pozițiilor nu este disponibilă.');
 if(!Object.values(r.limits).every(v=>finite(v)&&v>0)||['instrumentPct','totalStopPct','dayPct','weekPct'].some(k=>r.limits[k]>100)||['maxPositions','maxTrades','cooldown'].some(k=>!Number.isInteger(r.limits[k])))bad('Limitele contului sunt invalide.');
 const seen=new Set();let invested=0,risk=0;
 for(const p of snapshot.positions||[]){
  if(!p||typeof p.ticker!=='string'||!p.ticker||seen.has(p.ticker)||!finite(p.quantity)||p.quantity<0){bad('Poziție invalidă sau duplicată.');continue;}seen.add(p.ticker);
  if(!p.quantity){if(p.value!==0)bad('Cantitate zero cu valoare neverificată.');continue;}
  const valid=p.currency===c&&finite(p.value)&&p.value>0&&finite(p.currentPrice)&&p.currentPrice>0&&(currency(p.instrumentCurrency)||p.instrumentCurrency==='GBp');
  if(!valid)bad('Preț, valoare sau monedă neverificată: '+p.ticker+'.');
  let rate=valid?p.value/(p.quantity*p.currentPrice):null;
  if(!finite(rate)||rate<=0||(p.instrumentCurrency===c&&Math.abs(rate-1)>.01)){rate=null;bad('Valoarea poziției nu se reconciliază: '+p.ticker+'.');}else if(p.instrumentCurrency===c)rate=1;else r.implicitFX=true;
  const n=notes[scope+'|'+p.ticker]||notes[p.ticker],raw=n?.stop,stop=(typeof raw==='number'||typeof raw==='string'&&raw.trim())?Number(raw):null;
  const anterior=finite(stop)&&stop>0&&!stopValabil(n,p),documented=finite(stop)&&stop>0&&!anterior&&n?.stopCurrency===p.instrumentCurrency,breached=documented&&stop>=p.currentPrice;
  const known=documented&&!breached&&rate!==null,stopRisk=known?(p.currentPrice-stop)*p.quantity*rate:null;
  if(known&&finite(stopRisk)){risk+=stopRisk;r.stopCoverage++;}else warn(p.ticker+': '+(breached?'preț la/sub stopul documentat.':anterior?'stopul salvat e de la o poziție anterioară (pus înainte de deschiderea celei de acum).':'stop sau conversie neverificată.'));
  if(breached)bad('Stopul documentat a fost atins: '+p.ticker+'.'+(stop>=p.currentPrice*2?' Stopul e de peste două ori prețul de acum: dacă a fost un split, stopul e în prețurile vechi — refă-l în Portofoliu; dacă nu, prețul a străpuns stopul.':'')); // I-731 (20.10): motivul spune split când e split
  if(valid)invested+=p.value;
  r.rows.push({ticker:p.ticker,quantity:p.quantity,value:valid?p.value:null,weight:valid&&s?.totalValue>0?p.value/s.totalValue*100:null,price:p.currentPrice,quoteCurrency:p.instrumentCurrency,stop:documented?stop:null,stopRisk:finite(stopRisk)?stopRisk:null,rate,breached});
 }
 if(!finite(invested)||!finite(risk))bad('Agregatele nu sunt calculabile.');
 if(finite(s?.invested)&&Math.abs(invested-s.invested)>Math.max(.02,s.invested*.01))bad('Pozițiile nu corespund investițiilor raportate; acoperire parțială.');
 if(s&&['totalValue','available','reserved','invested'].every(k=>finite(s[k]))&&s.available+s.reserved+s.invested>s.totalValue+Math.max(.02,s.totalValue*.01))bad('Soldul și investițiile depășesc capitalul raportat.');
 r.positions=r.rows.length;r.rows.sort((a,b)=>(b.weight??-1)-(a.weight??-1));
 if(!errors.length){r.equity=s.totalValue;r.available=s.available;r.reserved=s.reserved;r.invested=invested;r.exposurePct=invested/s.totalValue*100;r.knownStopRisk=risk;r.totalStopRisk=r.stopCoverage===r.positions&&s.reserved===0?risk:null;}
 if(!history||history.scope!==scope||history.currency!==c||!history.complete||history.stale||history.state==='error')bad('Istoricul complet și actual în moneda contului este necesar pentru bugetele de pierdere.');
 else{
  const day=g.GV?.etDay?g.GV.etDay(now):new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(now),d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()||7)-1));const week=d.toISOString().slice(0,10),fmtNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}),date=x=>fmtNY.format(Date.parse(x.date));/* 17.10: un formator, nu unul la fiecare execuție (pagina se bloca) */
  if(history.rows.some(x=>!finite(Date.parse(x.date))||Date.parse(x.date)>now))bad('Există execuții cu dată invalidă sau viitoare; bugetul nu poate fi confirmat.');
  const currentRows=history.rows.filter(x=>finite(Date.parse(x.date))&&Date.parse(x.date)<=now),sells=currentRows.filter(x=>x.type==='TRADE'&&x.side==='SELL'&&x.currency===c);
  if(sells.some(x=>!finite(x.realized)))bad('Există vânzări fără P&L raportat; bugetul de pierdere rămâne neverificat.');
  if(history.rows.some(x=>x.type==='TRADE'&&x.currency!==c))bad('Există execuții cu monedă de cont neverificată.');
  r.todayPnl=sells.filter(x=>date(x)===day).reduce((a,x)=>a+(x.realized??0),0);r.weekPnl=sells.filter(x=>date(x)>=week).reduce((a,x)=>a+(x.realized??0),0);
  r.todayTrades=new Set(currentRows.filter(x=>x.type==='TRADE'&&x.side==='BUY'&&date(x)===day).map(x=>x.orderId||x.id)).size;r.consecutiveLosses=0;
  /* 27.10.2026 (audit): pierderile consecutive se numără pe ORDINE de vânzare (realizatul însumat pe orderId), nu pe fill-uri — o ieșire executată în 3 bucăți nu e „3 pierderi la rând” */
  const ordineSell=new Map();for(const x of sells){const k=x.orderId||x.id,o=ordineSell.get(k);if(!o)ordineSell.set(k,{t:Date.parse(x.date),realized:x.realized,ok:finite(x.realized)});else{o.t=Math.max(o.t,Date.parse(x.date));o.realized=(o.realized||0)+x.realized;o.ok=o.ok&&finite(x.realized);}}
  for(const o of [...ordineSell.values()].sort((a,b)=>b.t-a.t)){if(now-o.t>48*3600000||!o.ok||o.realized>=0)break;r.consecutiveLosses++;}
  if(s?.totalValue>0){r.budgetLeft=Math.max(0,s.totalValue*r.limits.dayPct/100+r.todayPnl);r.weekBudgetLeft=Math.max(0,s.totalValue*r.limits.weekPct/100+r.weekPnl);}
  if(![r.todayPnl,r.weekPnl,r.budgetLeft,r.weekBudgetLeft].every(finite))bad('Bugetele nu sunt calculabile.');
  // I-722: al doilea termen al bugetului — pierderea MTM a zilei / săptămânii; bugetul rămas = minimul celor două
  r.mtm=mtm({daily,cash,total:s?.totalValue,currency:c,day,week,now});
  if(r.mtm.state==='ready'&&s?.totalValue>0){const bd=s.totalValue*r.limits.dayPct/100,bw=s.totalValue*r.limits.weekPct/100;r.mtmBudgetLeft=Math.max(0,bd+r.mtm.day);r.budgetLeft=Math.min(r.budgetLeft,r.mtmBudgetLeft);if(finite(r.mtm.week)){r.mtmWeekBudgetLeft=Math.max(0,bw+r.mtm.week);r.weekBudgetLeft=Math.min(r.weekBudgetLeft,r.mtmWeekBudgetLeft);}else r.notes.push('Pierderea săptămânii la valoarea de piață: '+r.mtm.weekReason+'; bugetul săptămânii folosește doar vânzările.');
   if(r.mtm.day<=-bd)bad('Bugetul de pierdere zilnic este epuizat la valoarea de piață: contul e cu '+Math.abs(r.mtm.day).toFixed(2)+' '+c+' sub reperul din '+new Date(r.mtm.fromDay).toLocaleDateString('ro-RO',{day:'2-digit',month:'2-digit'})+' (fluxurile scoase), chiar fără vânzări.');
   else if(-r.mtm.day>=bd*.75)warn('Cel puțin 75% din bugetul zilnic e consumat la valoarea de piață ('+r.mtm.day.toFixed(2)+' '+c+' față de reperul de ieri).');
   if(finite(r.mtm.week)&&r.mtm.week<=-bw)bad('Bugetul de pierdere săptămânal este epuizat la valoarea de piață ('+r.mtm.week.toFixed(2)+' '+c+' față de închiderea săptămânii trecute).');
   else if(finite(r.mtm.week)&&-r.mtm.week>=bw*.75)warn('Cel puțin 75% din bugetul săptămânal e consumat la valoarea de piață.');}
  else if(r.mtm.state!=='ready')r.notes.push('Pierderea la valoarea de piață nu se poate verifica: '+r.mtm.reason+'.');
 }
 if(r.totalStopRisk===null)bad('Riscul total până la stop nu este acoperit pentru toate pozițiile și ordinele rezervate.');
 else if(s?.totalValue>0)r.stopBudgetLeft=Math.max(0,s.totalValue*r.limits.totalStopPct/100-r.totalStopRisk);
 if(r.positions>=r.limits.maxPositions)bad('Limita de poziții reale este atinsă: '+r.positions+'/'+r.limits.maxPositions+'.');
 if(r.available!==null&&r.available<=0)bad('Nu există sold disponibil pentru investiții.');
 if(r.budgetLeft===0||r.weekBudgetLeft===0)bad('Bugetul de pierdere zilnic sau săptămânal este epuizat.');
 if(r.stopBudgetLeft===0)bad('Bugetul total până la stop este epuizat.');
 if(r.todayTrades>=r.limits.maxTrades)bad('Limita intrărilor BUY de astăzi este atinsă.');
 else if(r.todayTrades>=r.limits.maxTrades-1)warn('A '+r.todayTrades+'-a cumpărare de azi: următoarea e ultima permisă (politica: CAUTION la penultima).'); /* 27.10: și pe calea brokerului, ca în Governor (I-733) */
 if(r.consecutiveLosses>=r.limits.cooldown)bad('Cooldown: '+r.consecutiveLosses+' ordine de ieșire consecutive cu pierdere.');
 if(r.rows.some(x=>x.weight>r.limits.instrumentPct))warn('Concentrare peste limita de '+r.limits.instrumentPct+'% pe instrument.');
 if(r.implicitFX)warn('Riscul la stop folosește FX estimat din valoarea poziției / (cantitate × preț), fără costuri sau gap.');
 if(s?.totalValue>0&&((r.todayPnl!==null&&-r.todayPnl>=s.totalValue*r.limits.dayPct*.0075)||(r.weekPnl!==null&&-r.weekPnl>=s.totalValue*r.limits.weekPct*.0075)))warn('Cel puțin 75% dintr-un buget de pierdere este consumat.');
 r.reasons=[...new Set([...errors,...r.reasons])];r.state=errors.length?'incomplete':'ready';r.verdict=errors.length?'HALTED':r.reasons.length?'CAUTION':'TRADE';return r;
}
function read(cfg={},now=Date.now()){
 try{const selected=g.T212Snapshot?.read('live');if(!selected)return null;const saved=JSON.parse(g.localStorage.getItem('tt_holdings_theses_v1')||'{}'),notes=Object.fromEntries((selected[1].positions||[]).map(p=>[p.ticker,saved[selected[0]+'|'+p.ticker]||{}])),history=g.T212Performance?.read({selectedCurrency:selected[1].summary?.currency,now});
  let daily=null,cash=null;try{const h=JSON.parse(g.localStorage.getItem('tt_trading212_account_history_v1')||'{}');daily=Array.isArray(h?.[selected[0]])?h[selected[0]]:null;}catch{daily=null;}try{const all=JSON.parse(g.localStorage.getItem('tt_trading212_cash_v1')||'{}'),a=all?.[selected[0]];cash=a&&a.environment==='live'?a:null;}catch{cash=null;}
  return build({scope:selected[0],snapshot:selected[1],notes,history,cfg,now,daily,cash});}catch{return {...build(),state:'incomplete',reasons:['Datele contului sau stopurile nu pot fi citite. Copiile existente sunt păstrate.']};}
}
function demo(cfg={},now=Date.now()){
 const x=g.T212Performance.demo(now);x.snapshot={...x.snapshot,fetchedAt:new Date(now).toISOString(),summary:{currency:'EUR',totalValue:10000,available:9450,reserved:0,invested:550},positions:[{ticker:'FICTIV_A_US_EQ',quantity:5,currentPrice:110,instrumentCurrency:'USD',currency:'EUR',value:550}]};
 return build({...x,notes:{FICTIV_A_US_EQ:{stop:100,stopCurrency:'USD'}},history:g.T212Performance.build({...x,now}),cfg,now});
}
function sizing(r,quoteCurrency,manualFX=null,ticker=null){
 if(!r||r.verdict==='HALTED'||r.state!=='ready')return {ok:false,message:r?.reasons?.[0]||'Contul real nu poate fi verificat.'};
 const rate=r.currency===quoteCurrency?1:finite(manualFX)&&manualFX>0?manualFX:null;
 if(rate===null)return {ok:false,message:'Introdu cursul de dimensionare: 1 '+quoteCurrency+' în '+r.currency+'.'};
 const lossBudget=Math.min(r.budgetLeft-r.totalStopRisk,r.weekBudgetLeft-r.totalStopRisk,r.stopBudgetLeft)/rate;
 if(!finite(lossBudget)||lossBudget<=0)return {ok:false,message:'Riscul pozițiilor reale consumă bugetul disponibil.'};
 const instrumentAvailable=ticker?Math.max(0,r.equity*r.limits.instrumentPct/100-(r.rows.find(x=>x.ticker===ticker)?.value||0))/rate:Infinity;
 const capital=r.equity/rate,available=Math.min(r.available/rate,instrumentAvailable);
 if(!finite(capital)||capital<=0||!finite(available)||available<=0)return {ok:false,message:'Capitalul sau soldul disponibil nu permite o dimensionare finită.'};
 return {ok:true,rate,capital,available,lossBudget,currency:r.currency,manualFX:r.currency!==quoteCurrency};
}
g.T212Capital={build,read,sizing,demo,stopValabil,mtm};
})(typeof window!=='undefined'?window:globalThis);
