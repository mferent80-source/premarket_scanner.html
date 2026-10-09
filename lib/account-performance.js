/* Account return uses observed valuations and complete external cash flows, never realised fills alone. */
(function(g){
'use strict';
const HISTORY='tt_trading212_account_history_v1',CASH='tt_trading212_cash_v1',finite=Number.isFinite,DAY=86400000;
function moneyWeighted(start,end,flows){
 const duration=Date.parse(end.at)-Date.parse(start.at),cash=[{t:0,value:-start.total},...flows.map(x=>({t:(x.at-Date.parse(start.at))/duration,value:-x.value})),{t:1,value:end.total}].sort((a,b)=>a.t-b.t),net=new Map();for(const x of cash)net.set(x.t,(net.get(x.t)||0)+x.value);const xs=[...net].map(([t,value])=>({t,value})).filter(x=>x.value!==0);let changes=0,last=0;for(const x of xs){const sign=Math.sign(x.value);if(last&&sign!==last)changes++;last=sign;}
 // One sign change gives a unique economically interpretable IRR. Do not choose a root for alternating flows.
 if(changes!==1||!(start.total>0)||!(end.total>0))return {pct:null,reason:'MWR indisponibil: fluxurile nu permit o rădăcină unică verificată.'};
 const npv=z=>xs.reduce((s,x)=>s+x.value*Math.exp(-z*x.t),0);let lo=-20,hi=20,a=npv(lo),b=npv(hi);if(!finite(a)||!finite(b)||a*b>=0)return {pct:null,reason:'MWR în afara intervalului numeric verificat.'};for(let i=0;i<160;i++){const mid=(lo+hi)/2,v=npv(mid);if(Math.sign(v)===Math.sign(a)){lo=mid;a=v;}else hi=mid;}const pct=Math.expm1((lo+hi)/2)*100;return finite(pct)?{pct,reason:'MWR numeric pe intervalul observat, la orele fluxurilor; nu este anualizat.'}:{pct:null,reason:'MWR necalculabil.'};
}
function build({scope,observations=[],cash=null,days=null,now=Date.now()}={}){
 const out={scope,state:'missing',reason:'Sincronizează Invest pentru primele valori ale contului.',currency:null,points:[],flows:[],start:null,end:null,netFlows:null,gain:null,returnPct:null,linkedPct:null,drawdownPct:null,method:null,largeFlow:false};
 if(!scope||!Array.isArray(observations)||!observations.length)return out;
 const byTime=new Map();
 for(const x of observations){const t=Date.parse(x?.at);if(!finite(t)||t>now+60000||!finite(x.total)||x.total<0||!/^[A-Z]{3}$/.test(x.currency||'')){return {...out,state:'blocked',reason:'O valoare istorică a contului este incompatibilă; copia rămâne păstrată.'};}if(byTime.has(t)&&JSON.stringify(byTime.get(t))!==JSON.stringify(x))return {...out,state:'blocked',reason:'Valori contradictorii la aceeași oră.'};byTime.set(t,x);}
 let points=[...byTime.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));if(days)points=points.filter(x=>Date.parse(x.at)>=now-days*DAY);
 out.points=points;out.start=points[0]||null;out.end=points.at(-1)||null;out.currency=out.end?.currency||null;
 if(points.length<2)return {...out,reason:'Sunt necesare două observații ale valorii contului. Istoricul începe la prima sincronizare; nu este reconstruit retroactiv.'};
 const start=Date.parse(out.start.at),end=Date.parse(out.end.at),tx=cash?.transactions;
 const block=reason=>({...out,state:'blocked',reason,returnPct:null,linkedPct:null,drawdownPct:null});
 if(points.some(x=>x.currency!==out.currency))return block('Moneda contului s-a schimbat; valorile nu sunt combinate fără FX verificat.');
 if(!tx||!Array.isArray(tx.items)||tx.complete!==true||tx.nextCursor||tx.error||tx.syncStatus==='loading'||tx.skipped||tx.conflicts)return block('Depunerile și retragerile necesită istoricul monetar complet, fără erori sau înregistrări incompatibile.');
 if(!finite(Date.parse(tx.fetchedAt))||Date.parse(tx.fetchedAt)<end||Date.parse(tx.fetchedAt)>now+60000)return block('Istoricul monetar trebuie reverificat după ultima valoare a contului.');
 const seen=new Map();
 for(const x of tx.items){const t=Date.parse(x?.date);if(!x?.id||!finite(t)||t>now+60000||!finite(x.amount))return block('O operație monetară nu poate fi verificată.');const id=String(x.id);if(seen.has(id)&&JSON.stringify(seen.get(id))!==JSON.stringify(x))return block('Operații monetare contradictorii.');if(seen.has(id))continue;seen.set(id,x);if(t<=start||t>end)continue;
  if(['FEE','INTEREST_ON_FREE_CASH','LENDING_INTEREST'].includes(x.type))continue;
  if(!['DEPOSIT','WITHDRAW'].includes(x.type))return block('Transfer sau operație monetară neclasificată în interval; fluxul extern nu este verificat.');
  if(x.currency!==out.currency)return block('Flux extern în altă monedă; conversia în moneda contului lipsește.');
  if(x.type==='DEPOSIT'&&x.amount<0)return block('Depunere cu semn incompatibil.');
  // Withdrawals are signed by direction; positive magnitudes and negative debits are equivalent.
  out.flows.push({...x,at:t,value:x.type==='WITHDRAW'?-Math.abs(x.amount):x.amount});
 }
 out.netFlows=out.flows.reduce((s,x)=>s+x.value,0);out.gain=out.end.total-out.start.total-out.netFlows;
 const weighted=out.flows.reduce((s,x)=>s+x.value*(end-x.at)/(end-start),0),denominator=out.start.total+weighted;
 if(!(denominator>0)||!finite(denominator)||!finite(out.gain))return block('Capitalul ponderat nu este pozitiv; randamentul nu poate fi calculat.');
 out.returnPct=out.gain/denominator*100;if(!finite(out.returnPct))return block('Randamentul depășește intervalul numeric verificat.');out.method=out.flows.length?'Modified Dietz · estimare cu fluxuri ponderate la ora operației':'Variația valorii contului · fără fluxuri externe';
 out.largeFlow=out.flows.some(x=>Math.abs(x.value)>=out.start.total*.1);
 let index=100,peak=100,drawdown=0;out.curve=[{at:start,index:100,total:out.start.total}];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],ta=Date.parse(a.at),tb=Date.parse(b.at),fs=out.flows.filter(x=>x.at>ta&&x.at<=tb),net=fs.reduce((s,x)=>s+x.value,0),base=a.total+fs.reduce((s,x)=>s+x.value*(tb-x.at)/(tb-ta),0),r=base>0?(b.total-a.total-net)/base:null;if(r===null||!finite(r)||r<=-1||!finite(index*(1+r))){out.curve=[];break;}index*=1+r;peak=Math.max(peak,index);drawdown=Math.max(drawdown,(1-index/peak)*100);out.curve.push({at:tb,index,total:b.total});}
 if(out.curve.length){out.linkedPct=index-100;out.drawdownPct=drawdown;}
 const mwr=moneyWeighted(out.start,out.end,out.flows);out.mwrPct=mwr.pct;out.mwrReason=mwr.reason;
 out.state='ready';out.reason='Interval observat, nu randament de la deschiderea contului. Dividendele și dobânzile rămân în rezultat; fluxurile externe sunt eliminate.';return out;
}
function read({days=null,storage=g.localStorage,now=Date.now()}={}){try{const selected=g.T212Snapshot?.read('live');if(!selected)return build();const scope=selected[0],h=JSON.parse(storage.getItem(HISTORY)||'{}'),cash=JSON.parse(storage.getItem(CASH)||'{}');return build({scope,observations:h[scope]||[],cash:cash[scope]?.environment==='live'?cash[scope]:null,days,now});}catch(e){return {state:'blocked',reason:'Istoricul contului nu poate fi citit: '+e.message,points:[],flows:[]};}}
function compare(report,bars){const fail=reason=>({state:'blocked',reason,returnPct:null,excessPct:null});if(report.state!=='ready'||!Array.isArray(bars)||!bars.length)return fail('Calculează întâi randamentul contului.');if(bars.meta?.currency!==report.currency)return fail('Benchmarkul trebuie să fie în moneda contului; conversia FX lipsește.');const zone=bars.meta.timezone;if(!zone)return fail('Fusul orar al benchmarkului lipsește.');const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t)),start=Date.parse(report.start.at),end=Date.parse(report.end.at),byDay=new Map(bars.map(b=>[day(b.t),b])),a=byDay.get(day(start)),b=byDay.get(day(end));if(!a||!b||!(a.c>0)||!(b.c>0)||!finite(a.c)||!finite(b.c)||a.t>=b.t)return fail('Lipsesc închideri distincte pentru datele de început și sfârșit ale contului.');const pct=(b.c/a.c-1)*100;return {state:'indicative',returnPct:pct,excessPct:null,reason:'Reper de preț la închiderile bursiere ale datelor selectate, fără dividende. Observațiile contului sunt la alte ore: diferența de randament nu este calculată.'};}
function demo(now=Date.now()){const scope='account-demo',at=n=>new Date(now-n*DAY).toISOString();return build({scope,now,observations:[{at:at(30),total:1000,currency:'EUR'},{at:at(15),total:1520,currency:'EUR'},{at:at(1),total:1550,currency:'EUR'}],cash:{transactions:{items:[{id:'fictiv-deposit',date:at(20),type:'DEPOSIT',amount:500,currency:'EUR'}],complete:true,fetchedAt:new Date(now).toISOString()}}});}
g.AccountPerformance={HISTORY,CASH,build,read,compare,demo,moneyWeighted};
})(typeof window!=='undefined'?window:globalThis);
