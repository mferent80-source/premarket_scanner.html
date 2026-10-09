/* Cash-equity sessions. Published dates only; unknown years/half-day hours fail closed.
   Sources and review date are exposed with every session; see docs/PROFESSIONAL-UPGRADE.md. */
(function(g){'use strict';
const REVIEWED='2026-10-09',DAY=86400000;
const sources={US:'https://www.nyse.com/trade/hours-calendars',LSE:'https://www.londonstockexchange.com/equities-trading/business-days',XETRA:'https://cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours',EURONEXT:'https://www.euronext.com/en/trading/trading-hours-holidays',FESE:'https://www.fese.eu/app/uploads/2024/07/trading-calendar-2026.pdf'};
const years=(year,days)=>days.split(' ').map(d=>year+'-'+d),eur=years(2026,'01-01 04-03 04-06 05-01 12-25');
const markets={
 US:{zone:'America/New_York',open:570,close:960,source:sources.US,closed:[...years(2026,'01-01 01-19 02-16 04-03 05-25 06-19 07-03 09-07 11-26 12-25'),...years(2027,'01-01 01-18 02-15 03-26 05-31 06-18 07-05 09-06 11-25 12-24')],early:{'2026-11-27':780,'2026-12-24':780,'2027-11-26':780},years:[2026,2027]},
 LSE:{zone:'Europe/London',open:480,close:990,source:sources.LSE,closed:years(2026,'01-01 04-03 04-06 05-04 05-25 08-31 12-25 12-28'),early:{'2026-12-24':750,'2026-12-31':750},years:[2026]},
 XETRA:{zone:'Europe/Berlin',open:540,close:1050,source:sources.XETRA,closed:[...years(2026,'01-01 04-03 04-06 05-01 12-24 12-25 12-31'),...years(2027,'01-01 03-26 03-29 05-01 12-24 12-25 12-26 12-31')],early:{'2026-12-30':null,'2027-12-30':null},years:[2026,2027]},
 PARIS:{zone:'Europe/Paris',open:540,close:1050,source:sources.EURONEXT,closed:eur,early:{'2026-12-24':null,'2026-12-31':null},years:[2026]},
 AMSTERDAM:{zone:'Europe/Amsterdam',open:540,close:1050,source:sources.EURONEXT,closed:eur,early:{'2026-12-24':null,'2026-12-31':null},years:[2026]},
 BRUSSELS:{zone:'Europe/Brussels',open:540,close:1050,source:sources.EURONEXT,closed:eur,early:{'2026-12-24':null,'2026-12-31':null},years:[2026]},
 LISBON:{zone:'Europe/Lisbon',open:480,close:990,source:sources.EURONEXT,closed:eur,early:{'2026-12-24':null,'2026-12-31':null},years:[2026]},
 MILAN:{zone:'Europe/Rome',open:540,close:1050,source:sources.EURONEXT,closed:[...eur,'2026-12-24','2026-12-31'],early:{},years:[2026]},
 DUBLIN:{zone:'Europe/Dublin',open:480,close:990,source:sources.EURONEXT,closed:[...eur,'2026-05-04','2026-12-28'],early:{'2026-12-24':null,'2026-12-31':null},years:[2026]},
 MADRID:{zone:'Europe/Madrid',open:540,close:1050,source:sources.FESE,closed:eur,early:{'2026-12-24':null,'2026-12-31':null},years:[2026]},
 SIX:{zone:'Europe/Zurich',open:540,close:1050,source:sources.FESE,closed:years(2026,'01-01 01-02 04-03 04-06 05-01 05-14 05-25 12-24 12-25 12-31'),early:{},years:[2026]},
 COPENHAGEN:{zone:'Europe/Copenhagen',open:540,close:1020,source:sources.FESE,closed:years(2026,'01-01 04-02 04-03 04-06 05-14 05-15 05-25 06-05 12-24 12-25 12-31'),early:{},years:[2026]},
 VIENNA:{zone:'Europe/Vienna',open:540,close:1050,source:sources.FESE,closed:years(2026,'01-01 04-03 04-06 05-01 10-26 12-24 12-25 12-31'),early:{},years:[2026]}
};
const exchanges={NYQ:'US',NMS:'US',NGM:'US',NCM:'US',ASE:'US',PCX:'US',BTS:'US',NASDAQ:'US',NYSE:'US',LSE:'LSE',GER:'XETRA',XETRA:'XETRA',PAR:'PARIS',AMS:'AMSTERDAM',BRU:'BRUSSELS',LIS:'LISBON',MIL:'MILAN',ISE:'DUBLIN',MCE:'MADRID',EBS:'SIX',SWX:'SIX',CPH:'COPENHAGEN',VIE:'VIENNA'};
function parts(t,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
function date(t,zone){const p=parts(t,zone);return p.year+'-'+p.month+'-'+p.day;}
function add(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);}
function infer(zone,close){const xs=Object.entries(markets).filter(([,m])=>m.zone===zone&&(m.close===close||m.early&&Object.values(m.early).includes(close)));return xs.length===1?xs[0][0]:null;}
function resolve(meta){const id=exchanges[String(meta?.exchange||'').toUpperCase()];return id&&markets[id].zone===meta.timezone?id:null;}
function session(id,day){const m=markets[id];if(!m||!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day||!m.years.includes(Number(day.slice(0,4))))return {state:'unknown',id,day,reason:'Calendar oficial indisponibil pentru piață/an.'};const weekday=new Date(day+'T12:00:00Z').getUTCDay();const early=Object.hasOwn(m.early,day);return {id,day,timezone:m.zone,source:m.source,reviewedAt:REVIEWED,state:[0,6].includes(weekday)||m.closed.includes(day)?'closed':early&&m.early[day]===null?'hours-unknown':'open',open:m.open,close:early?m.early[day]:m.close,early};}
function latest(now,id,{grace=15}={}){const m=markets[id];if(!m)throw Error('Bursa nu are calendar oficial verificat.');const p=parts(now,m.zone),today=p.year+'-'+p.month+'-'+p.day,minute=Number(p.hour)*60+Number(p.minute);let day=today;for(let i=0;i<14;i++,day=add(day,-1)){const s=session(id,day);if(s.state==='unknown')throw Error(s.reason);if(s.state==='hours-unknown'){if(day===today)throw Error('Sesiune scurtă: ora oficială de închidere nu este încă verificată.');return {...s,state:'completed'};}if(s.state==='open'&&(day!==today||minute>=s.close+grace))return {...s,state:'completed'};}throw Error('Ultima sesiune încheiată nu poate fi stabilită.');}
function next(day,id){for(let n=1;n<=14;n++){const s=session(id,add(day,n));if(s.state==='unknown')return null;if(s.state!=='closed')return s;}return null;}
function contiguous(days,id){if(!days.length)return true;for(let i=1;i<days.length;i++){const n=next(days[i-1],id);if(!n||n.day!==days[i])return false;}return true;}
function beforeNextOpen(source,t){const id=infer(source.timezone,source.closeMinutes);if(!id)return null;const origin=session(id,source.asOf);if(origin.state==='unknown')return null;if(origin.state==='closed')return false;const n=next(source.asOf,id);if(!n)return null;const p=parts(t,source.timezone),day=p.year+'-'+p.month+'-'+p.day;return day<n.day||day===n.day&&Number(p.hour)*60+Number(p.minute)<n.open;}
g.ExchangeCalendar={REVIEWED,markets,resolve,infer,session,latest,next,contiguous,beforeNextOpen,date,add};
})(typeof window!=='undefined'?window:globalThis);
