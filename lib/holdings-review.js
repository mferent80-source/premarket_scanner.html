(function(g){'use strict';
function assess(p,m,n={},event,symbol,now=Date.now()){
 const E=g.HoldingsEvents,reasons=[],today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const automatic=event?.symbol===symbol&&E.fresh(event,now)&&E.validDate(event.earnings?.date)?event.earnings:null;
 const manual=E.validDate(n.earnings)?{date:n.earnings,status:'REPER MANUAL',source:'Introdus de tine'}:null,earnings=automatic||manual;
 if(!m)reasons.push('Analiză EOD lipsă sau expirată.');
 if(m?.regime?.confirmed==='down'||m?.medium==='Descendent')reasons.push('Structură de termen mediu deteriorată.');
 if(m?.regime?.warnings?.length>=2)reasons.push('Mai multe semnale tehnice cer revizuire.');
 if(m?.regime?.pending)reasons.push('Un nou regim așteaptă confirmarea prin persistență EOD.');
 const dates=[automatic,manual].filter(Boolean),near=dates.find(x=>{const days=E.daysUntil(x.date,now);return days!==null&&days>=0&&days<=7;});
 if(near)reasons.push('Earnings '+near.date+' · '+near.status+' · confirmă data.');
 if(n.fundamental==='slăbită')reasons.push('Teza fundamentală a fost marcată slăbită de tine.');
 if(E.validDate(n.plan?.review)&&n.plan.review<=today)reasons.push('Plan scadent pentru revizuire · '+n.plan.review+'.');
 const stop=Number(n.stop),instrumentCurrency=p.instrumentCurrency==='GBp'?'GBX':p.instrumentCurrency;
 if(m&&Number.isFinite(m.price)&&stop>0&&Number.isFinite(stop)&&instrumentCurrency&&instrumentCurrency===m.currency&&m.price<=stop)reasons.unshift('Închiderea EOD este la sau sub stopul tău de reevaluare.');
 const review=reasons.some(x=>x!=='Analiză EOD lipsă sau expirată.'),kind=!m?'check':review?'review':'watch';
 return {kind,label:kind==='check'?'Date de verificat':kind==='review'?'De revizuit':'Monitorizare',reasons,review,earnings,rank:kind==='review'?2:kind==='check'?1:0};
}
g.HoldingsReview={assess};
})(typeof window!=='undefined'?window:globalThis);
