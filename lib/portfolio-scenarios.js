/* Snapshot-based sensitivity only. No quotes, account writes or order routes. */
(function(g){
'use strict';
const VERSION='portfolio-scenarios-v1',finite=Number.isFinite;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const currency=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x);
const quoteCurrency=x=>x==='GBp'||x==='GBX'?'GBP':currency(x)?x:null;
const scale=x=>x==='GBp'||x==='GBX'?.01:1;
const label=x=>typeof x==='string'&&x.trim()&&x.length<=200;
const tolerance=n=>Math.max(.02,Math.abs(n)*.01);
const cleanScenario=s=>{
 if(!object(s)||!finite(s.pricePct)||s.pricePct< -100||s.pricePct>100||!finite(s.fxPct)||s.fxPct< -100||s.fxPct>100||!(s.sector==='*'||label(s.sector))||!(s.fxCurrency==='*'||currency(s.fxCurrency)))throw Error('Scenariu invalid: procente numerice între −100 și +100 și selecții explicite.');
 return {pricePct:s.pricePct,fxPct:s.fxPct,sector:s.sector,fxCurrency:s.fxCurrency};
};
function calculate(snapshot,notes,scenario,{now=Date.now(),accountMatches=true}={}){
 const input=cleanScenario(scenario);if(!finite(now))throw Error('Momentul verificării este invalid.');
 const summary=snapshot?.summary,c=currency(summary?.currency)?summary.currency:null;
 const reasons=[],rows=[],add=x=>reasons.push(x),at=typeof snapshot?.fetchedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.fetchedAt)?Date.parse(snapshot.fetchedAt):NaN;
 const dated=finite(at)&&at>0&&at<=now+60000,fresh=dated&&now-at<=300000;
 const bound=accountMatches===true&&['live','demo','synthetic'].includes(snapshot?.environment);
 if(!bound)add('Contul și mediul snapshot-ului nu sunt confirmate.');
 if(!dated)add('Ora snapshot-ului lipsește, este invalidă sau este în viitor.');
 else if(!fresh)add('Snapshot mai vechi de 5 minute. Contribuțiile descriu acel reper; valoarea proiectată a contului este blocată.');
 const list=Array.isArray(snapshot?.positions)?snapshot.positions:null;
 if(!list)add('Lista completă a pozițiilor lipsește.');
 if(list?.length>1000)add('Lista depășește limita de 1.000 de poziții; calculul este blocat.');
 const summaryOK=!!c&&object(summary)&&['totalValue','available','reserved','invested'].every(k=>finite(summary[k])&&summary[k]>=0);
 if(!summaryOK)add('Valoarea contului, disponibilul, investițiile sau sumele rezervate sunt incomplete.');
 const counts=new Map();for(const p of list||[])if(label(p?.ticker))counts.set(p.ticker,(counts.get(p.ticker)||0)+1);
 let sumValue=0,covered=0,priceSelected=0,fxSelected=0,priceDelta=0,fxDelta=0,knownDelta=0,knownValue=0,emptyRows=0;
 for(const p of (list||[]).slice(0,1000)){
  const ticker=label(p?.ticker)?p.ticker:'Identificator lipsă',n=object(notes)&&Object.hasOwn(notes,ticker)&&object(notes[ticker])?notes[ticker]:{};
  const sector=label(n.sector)?n.sector.trim():'Neclasificat',quote=quoteCurrency(p?.instrumentCurrency);
  const issues=[];const bad=t=>issues.push(t);
  if(!bound||!dated)bad('Snapshot fără cont sau moment confirmat.');
  if(!label(p?.ticker)||counts.get(ticker)!==1)bad('Identificator lipsă sau duplicat.');
  if(!finite(p?.quantity)||p.quantity<0)bad('Cantitate invalidă; numai dețineri fără poziții short.');
  if(!issues.length&&p.quantity===0&&p.value===0){emptyRows++;continue;}
  if(!finite(p?.value)||p.value<=0||!c||p.currency!==c)bad('Valoarea brokerului nu este confirmată în moneda contului.');
  if(!finite(p?.currentPrice)||p.currentPrice<=0||!quote)bad('Prețul sau moneda instrumentului nu sunt confirmate.');
  const units=p?.quantity*p?.currentPrice*scale(p?.instrumentCurrency),rate=finite(units)&&units>0&&finite(p?.value)&&p.value>0?p.value/units:null;
  if(!finite(rate)||rate<=0)bad('Cantitatea, prețul și valoarea nu pot fi reconciliate.');
  else if(quote===c&&Math.abs(p.value-units)>tolerance(p.value))bad('Prețul și valoarea în aceeași monedă nu se reconciliază.');
  const priceApplies=input.sector==='*'||input.sector===sector;
  const fxApplies=!!quote&&quote!==c&&(input.fxCurrency==='*'||input.fxCurrency===quote);
  const dp=priceApplies?input.pricePct/100:0,df=fxApplies?input.fxPct/100:0;
  const projectedPrice=finite(p?.currentPrice)&&p.currentPrice>0?p.currentPrice*(1+dp):null;
  const priceEffect=issues.length?null:p.value*dp,fxEffect=issues.length?null:p.value*(1+dp)*df;
  const delta=issues.length?null:priceEffect+fxEffect,projectedValue=issues.length?null:p.value+delta;
  if(!issues.length&&![projectedPrice,priceEffect,fxEffect,delta,projectedValue].every(finite))bad('Valori prea mari pentru calcul.');
  const stop=(typeof n.stop==='number'||typeof n.stop==='string'&&n.stop.trim())?Number(n.stop):NaN;
  const stopConfirmed=finite(stop)&&stop>0&&n.stopCurrency===p?.instrumentCurrency;
  const stopState=!stopConfirmed||issues.length?'unknown':p.currentPrice<=stop?'already-crossed':projectedPrice<=stop?'crossed':'above';
  const valid=!issues.length;
  if(valid){sumValue+=p.value;knownValue+=p.value;covered++;priceDelta+=priceEffect;fxDelta+=fxEffect;knownDelta+=delta;}
  if(priceApplies)priceSelected++;if(fxApplies)fxSelected++;
  rows.push({ticker,sector,quoteCurrency:quote,instrumentCurrency:p?.instrumentCurrency||null,valid,issues,value:valid?p.value:null,price:finite(p?.currentPrice)?p.currentPrice:null,priceApplies,fxApplies,pricePct:dp*100,fxPct:df*100,priceDelta:valid?priceEffect:null,fxDelta:valid?fxEffect:null,delta:valid?delta:null,projectedValue:valid?projectedValue:null,projectedPrice:valid?projectedPrice:null,impliedRate:valid&&quote!==c?rate:null,stop:stopConfirmed?stop:null,stopState});
 }
 const complete=!!list&&list.length<=1000&&covered+emptyRows===list.length;
 if(list&&!complete)add('Cel puțin o poziție nu este calculabilă; suma cunoscută rămâne parțială.');
 let reconciled=summaryOK&&complete;
 if(summaryOK&&complete&&Math.abs(sumValue-summary.invested)>tolerance(summary.invested)){reconciled=false;add('Suma pozițiilor diferă de investițiile raportate; importul poate fi parțial.');}
 if(summaryOK&&Math.abs(summary.available+summary.reserved+summary.invested-summary.totalValue)>tolerance(summary.totalValue)){reconciled=false;add('Soldul, investițiile și valoarea totală a contului nu se reconciliază.');}
 if(![sumValue,knownValue,priceDelta,fxDelta,knownDelta].every(finite)){reconciled=false;add('Sumele agregate depășesc limitele calculului.');knownDelta=priceDelta=fxDelta=knownValue=null;}
 const sourced=bound&&dated&&!!c&&!!list&&list.length<=1000;
 const projectable=sourced&&fresh&&reconciled;
 let projectedTotal=projectable?summary.totalValue+knownDelta:null;
 if(projectedTotal!==null&&(!finite(projectedTotal)||projectedTotal<0)){projectedTotal=null;add('Valoarea proiectată nu poate fi calculată.');}
 const full=projectable&&projectedTotal!==null;
 if(summaryOK&&summary.reserved>0)add('Soldul rezervat rămâne constant. Scenariul presupune că ordinele în așteptare nu se execută.');
 if(!priceSelected&&list?.length)add('Sectorul ales nu conține poziții. Șocul de preț nu se aplică; efectul valutar rămâne separat.');
 if(!fxSelected&&input.fxPct!==0)add('Nu există o deținere în moneda străină selectată; efectul valutar este zero.');
 const impact=full&&summary.totalValue>0?knownDelta/summary.totalValue*100:null,cash=summaryOK?summary.available+summary.reserved:null;
 return {version:VERSION,scenario:input,currency:c,snapshotAt:dated?snapshot.fetchedAt:null,fresh,state:!sourced?'unavailable':!fresh?'historical':full?'complete':'partial',reasons,rows,total:rows.length,covered,priceSelected,fxSelected,knownValue:sourced?knownValue:null,priceDelta:sourced?priceDelta:null,fxDelta:sourced?fxDelta:null,knownDelta:sourced?knownDelta:null,totalDelta:full?knownDelta:null,projectedTotal,impactPct:finite(impact)?impact:null,cashUnchanged:finite(cash)?cash:null,complete:full};
}
function demo(now=Date.now()){
 return {scope:'educational-portfolio-scenario',demo:true,environment:'synthetic',snapshot:{environment:'synthetic',fetchedAt:new Date(now).toISOString(),summary:{currency:'EUR',totalValue:3000,available:1000,reserved:0,invested:2000},positions:[{ticker:'FICTIV_US',name:'Companie fictivă în USD',quantity:10,currentPrice:100,instrumentCurrency:'USD',currency:'EUR',value:900},{ticker:'FICTIV_EUR',name:'Companie fictivă în EUR',quantity:10,currentPrice:50,instrumentCurrency:'EUR',currency:'EUR',value:500},{ticker:'FICTIV_GBP',name:'Companie fictivă în pence',quantity:10,currentPrice:5000,instrumentCurrency:'GBp',currency:'EUR',value:600}]},notes:{FICTIV_US:{sector:'Tehnologie',stop:95,stopCurrency:'USD'},FICTIV_EUR:{sector:'Industrie',stop:40,stopCurrency:'EUR'},FICTIV_GBP:{sector:'Tehnologie',stop:4500,stopCurrency:'GBp'}}};
}
g.PortfolioScenarios={VERSION,calculate,quoteCurrency,demo};
})(typeof window!=='undefined'?window:globalThis);
