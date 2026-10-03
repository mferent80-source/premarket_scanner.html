// Research plans: pure sizing/state rules. No broker calls or real journal writes.
(function(g){
'use strict';
const KEY='tt_trade_plans_v1',finite=n=>typeof n==='number'&&Number.isFinite(n),positive=n=>finite(n)&&n>0&&n<=Number.MAX_SAFE_INTEGER;
function size(x){
 const bad=message=>({ok:false,message});
 if(x.currency!=='USD')return bad('Moneda prețului trebuie verificată ca USD pentru acest buget.');
 if(![x.entryLow,x.entryHigh,x.stop,x.target,x.capital,x.riskPct].every(positive)||x.riskPct>5)return bad('Capital, risc sau niveluri invalide.');
 if(x.entryLow>x.entryHigh||x.stop>=x.entryLow||x.target<=x.entryHigh)return bad('Intervalul, stopul și ținta nu formează un plan Long valid.');
 const entry=x.entryHigh,unitRisk=entry-x.stop,rr=(x.target-entry)/unitRisk;
 if(rr<1.5)return bad('Raportul la intrarea maximă este sub 1,50R.');
 const usedValue=x.reservedValue??0,usedRisk=x.reservedRisk??0;
 if(![usedValue,usedRisk].every(n=>finite(n)&&n>=0))return bad('Expunerea Shadow nu poate fi verificată.');
 const budget=x.lossBudget??x.capital*x.riskPct/100;
 if(!finite(budget)||budget<0)return bad('Bugetul de pierdere nu poate fi verificat.');
 const money=Math.min(x.capital*x.riskPct/100,Math.max(0,budget-usedRisk));
 const shares=Math.floor(Math.min(money/unitRisk,Math.max(0,x.capital-usedValue)/entry));
 const value=shares*entry,risk=shares*unitRisk;
 if(!Number.isSafeInteger(shares)||shares<1||![value,risk].every(positive))return bad('Bugetul disponibil nu acoperă o unitate întreagă.');
 return {ok:true,message:'Dimensionare la capătul superior al intervalului.',entry,unitRisk,rr,shares,value,risk,riskPct:x.riskPct,capital:x.capital};
}
function create(candidate,capital,riskPct,options={}){
 const now=options.now??Date.now();
 if(!candidate?.actionable||!['momentum','reversal'].includes(candidate.mode)||!finite(candidate.ts)||candidate.ts>now+60000||now-candidate.ts>1800000)return null;
 const s=size({...candidate,capital,riskPct,...options});if(!s.ok)return null;
 const id=options.id??('sp_'+now+'_'+(g.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)));
 return {id,status:'PLANNED',symbol:candidate.symbol,mode:candidate.mode,score:candidate.score,currency:'USD',entry:s.entry,entryLow:candidate.entryLow,entryHigh:candidate.entryHigh,stop:candidate.stop,target:candidate.target,rr:s.rr,shares:s.shares,value:s.value,risk:s.risk,riskPct,capital,createdAt:now,
  basis:{asOf:candidate.sourceDate,timezone:candidate.sourceTimezone,scannedAt:candidate.ts,reason:candidate.reason||'',entryLow:candidate.entryLow,entryHigh:candidate.entryHigh,stop:candidate.stop,target:candidate.target,score:candidate.score,breadth:options.breadth||null},simulation:true};
}
function validate(p,now=Date.now()){
 const bad=message=>({ok:false,message});
 if(!p||!['string','number'].includes(typeof p.id)||String(p.id)===''||typeof p.symbol!=='string'||!p.symbol.trim())return bad('Identitatea planului este invalidă.');
 if(!['PLANNED','TRIGGERED','CLOSED','CANCELLED'].includes(p.status)||p.currency!=='USD'||!['momentum','reversal'].includes(p.mode))return bad('Stare, strategie sau monedă neverificată.');
 if(![p.entry,p.stop,p.target,p.shares,p.capital,p.riskPct].every(positive)||!Number.isSafeInteger(p.shares)||p.stop>=p.entry||p.target<=p.entry||p.riskPct>5)return bad('Niveluri sau cantitate invalide.');
 if(!positive(p.createdAt)||p.createdAt>now+60000)return bad('Data planului este invalidă sau în viitor.');
 const value=p.entry*p.shares,risk=(p.entry-p.stop)*p.shares;
 if(![value,risk].every(positive)||value>p.capital+1e-6||risk>p.capital*p.riskPct/100+1e-6)return bad('Planul depășește capitalul sau riscul declarat.');
 for(const [key,expected] of [['value',value],['risk',risk],['rr',(p.target-p.entry)/(p.entry-p.stop)]])if(!finite(p[key])||Math.abs(p[key]-expected)>1e-6*Math.max(1,Math.abs(expected)))return bad('Calculul salvat este inconsistent: '+key+'.');
 const fill=p.fillEntry??p.entry,fees=p.fees??0;
 if(!positive(fill)||fill<=p.stop||fill>=p.target||!finite(fees)||fees<0)return bad('Intrare simulată sau costuri invalide.');
 if(['TRIGGERED','CLOSED'].includes(p.status)&&(!positive(p.triggeredAt)||p.triggeredAt<p.createdAt||p.triggeredAt>now+60000))return bad('Data simulării este invalidă.');
 if(['TRIGGERED','CLOSED'].includes(p.status)&&(fill*p.shares>p.capital+1e-6||(fill-p.stop)*p.shares>risk+1e-6))return bad('Intrarea simulată depășește riscul original.');
 if(p.status==='CLOSED'){
  if(!positive(p.exit)||!positive(p.closedAt)||p.closedAt<p.triggeredAt||p.closedAt>now+60000)return bad('Închidere invalidă.');
  const pnl=(p.exit-fill)*p.shares-fees,rResult=pnl/((fill-p.stop)*p.shares);
  if(![pnl,rResult].every(finite))return bad('Rezultat necalculabil.');
  for(const [key,expected] of [['pnl',pnl],['rResult',rResult]])if(!finite(p[key])||Math.abs(p[key]-expected)>1e-6*Math.max(1,Math.abs(expected)))return bad('Rezultatul salvat nu corespunde prețurilor.');
 }
 return {ok:true,message:p.simulation?'Simulare documentată.':'Plan istoric: ipotezele originale pot fi incomplete.'};
}
function exposure(plans,exceptId){
 const xs=plans.filter(p=>p&&p.id!==exceptId&&p.status==='TRIGGERED');
 if(xs.some(p=>!validate(p).ok))return {ok:false};
 return {ok:true,count:xs.length,value:xs.reduce((s,p)=>s+(p.fillEntry??p.entry)*p.shares,0),risk:xs.reduce((s,p)=>s+((p.fillEntry??p.entry)-p.stop)*p.shares,0)};
}
function transition(p,action,options={}){
 const now=options.now??Date.now();if(!validate(p,now).ok)return null;
 const next={...p};
 if(action==='cancel'&&p.status==='PLANNED'){next.status='CANCELLED';next.cancelledAt=now;}
 else if(action==='restore'&&p.status==='CANCELLED'){next.status='PLANNED';delete next.cancelledAt;}
 else if(action==='trigger'&&p.status==='PLANNED'){
  if(options.allowed!==true||!positive(options.fillEntry))return null;
  next.status='TRIGGERED';next.triggeredAt=now;next.fillEntry=options.fillEntry;next.simulation=true;
 }else if(action==='close'&&p.status==='TRIGGERED'){
  if(!positive(options.exit)||!finite(options.fees??0)||(options.fees??0)<0)return null;
  next.status='CLOSED';next.closedAt=now;next.exit=options.exit;next.fees=options.fees??0;
  next.pnl=(next.exit-(p.fillEntry??p.entry))*p.shares-next.fees;next.rResult=next.pnl/(((p.fillEntry??p.entry)-p.stop)*p.shares);
 }else return null;
 return validate(next,now).ok?next:null;
}
function read(storage){const raw=storage.getItem(KEY);const plans=JSON.parse(raw??'[]');if(!Array.isArray(plans))throw Error('Registrul planurilor este ilizibil. Exportă datele înainte de reparare.');return {raw,plans};}
async function mutate(storage,change){
 const operation=()=>{const {raw,plans}=read(storage),next=change(plans);if(!Array.isArray(next))throw Error('Modificare invalidă.');if(storage.getItem(KEY)!==raw)throw Error('Registrul s-a modificat. Reîncearcă.');storage.setItem(KEY,JSON.stringify(next));return next;};
 return g.navigator?.locks?.request?g.navigator.locks.request(KEY,operation):operation();
}
function closed(plans){return plans.filter(p=>p?.status==='CLOSED'&&validate(p).ok);}
g.TradePlans={KEY,size,create,validate,transition,exposure,read,mutate,closed};
})(typeof window!=='undefined'?window:globalThis);
