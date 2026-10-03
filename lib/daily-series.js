(function(g){'use strict';
function parts(t,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
function date(t,zone){const p=parts(t,zone);return p.year+'-'+p.month+'-'+p.day;}
function expected(now,zone,closeMinutes){if(typeof zone!=='string'||!Number.isFinite(closeMinutes)||closeMinutes<0||closeMinutes>=1440)throw Error('Programul bursei nu poate fi verificat.');const p=parts(now,zone),d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');if(d.getUTCDay()>0&&d.getUTCDay()<6&&Number(p.hour)*60+Number(p.minute)<closeMinutes+15)d.setUTCDate(d.getUTCDate()-1);while(d.getUTCDay()===0||d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
function read(input,symbol,now=Date.now()){
 const meta=input?.meta;if(!Array.isArray(input)||!meta||meta.symbol?.toUpperCase()!==symbol?.toUpperCase())throw Error('Identitatea seriei nu poate fi verificată.');
 const zone=meta.timezone,end=meta.regularEnd;if(!Number.isFinite(end)||Math.abs(end-now)>10*86400000)throw Error('Programul sursei este indisponibil sau vechi.');
 const p=parts(end,zone),closeMinutes=Number(p.hour)*60+Number(p.minute),expectedDate=expected(now,zone,closeMinutes),days=new Map();
 for(const b of input){if(![b.t,b.o,b.h,b.l,b.c].every(Number.isFinite)||b.t>now+60000||b.o<=0||b.l<=0||b.c<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))throw Error('Serie zilnică invalidă.');const day=date(b.t,zone);if(day<=expectedDate&&(!days.has(day)||days.get(day).t<b.t))days.set(day,b);}
 const bars=[...days.values()].sort((a,b)=>a.t-b.t);if(!bars.length)throw Error('Nicio sesiune încheiată.');const asOf=date(bars[bars.length-1].t,zone);if(asOf!==expectedDate)throw Error('DATE STALE: '+asOf+'; sesiune așteptată '+expectedDate+'. Calendarul sărbătorilor nu este confirmat.');return {bars,asOf,expected:expectedDate,timezone:zone,closeMinutes,currency:/^[A-Z]{3}$/.test(meta.currency||'')?meta.currency:meta.currency==='GBp'?'GBX':null};
}
function usable(candidate,now=Date.now()){try{return !!candidate&&candidate.sourceDate===expected(now,candidate.sourceTimezone,candidate.sourceCloseMinutes)&&Number.isFinite(candidate.ts)&&candidate.ts<=now+60000;}catch(_){return false;}}
g.DailySeries={read,date,expected,usable};
})(typeof window!=='undefined'?window:globalThis);
