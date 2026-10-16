/* 16.10.2026 (I-644): un salt zilnic de peste 25% (rezultate, știri sau o ajustare lipsă la furnizor) nu mai oprește modelele.
   Toate cele 8 folosesc doar istoricul de DUPĂ ultimul salt, consecvent în sine; codul fiecărui model rămâne neschimbat.
   Fără privit în viitor: tăietura vine dintr-o zi trecută, iar ultima bară (cea a estimării) e mereu păstrată. */
(function(g){
'use strict';
const LIMIT=.25,MINIMUM=510;
function lastJump(bars){
 if(!Array.isArray(bars))return null;
 for(let i=bars.length-1;i>0;i--){const a=bars[i-1]?.c,b=bars[i]?.c;if(Number.isFinite(a)&&Number.isFinite(b)&&a>0&&b>0&&Math.abs(b/a-1)>LIMIT)return {index:i,t:bars[i].t,pct:(b/a-1)*100};}
 return null;
}
const day=t=>new Date(t).toISOString().slice(0,10),sig=v=>(v>0?'+':'')+v.toLocaleString('ro-RO',{minimumFractionDigits:1,maximumFractionDigits:1});
/* Barele de folosit: întregi dacă nu există salt, altfel de la ziua saltului încolo (perechea dinaintea saltului iese). */
function prepare(bars,minimum=MINIMUM){
 const j=lastJump(bars);if(!j)return {bars,cut:null};
 const rest=bars.slice(j.index),cut={t:j.t,day:day(j.t),pct:j.pct,dropped:j.index,kept:rest.length};
 if(rest.length<minimum)throw Error('Ultimul salt peste 25% ('+cut.day+', '+sig(j.pct)+'%) lasă doar '+rest.length+' sesiuni după el; modelele cer '+minimum+'. Revin singure când istoricul de după salt ajunge.');
 return {bars:rest,cut};
}
function note(cut){return cut?'Istoric folosit de la '+cut.day+', după un salt de '+sig(cut.pct)+'% într-o zi ('+cut.kept+' sesiuni; '+cut.dropped+' mai vechi lăsate deoparte).':'';}
/* I-653: din mesajul de așteptare, câte sesiuni mai lipsesc și data estimată (zile lucrătoare; o sărbătoare o poate muta cu o zi). */
function waitInfo(text,from=Date.now()){const m=/lasă doar (\d+) sesiuni/.exec(String(text||''));if(!m)return null;const sessions=Math.max(1,MINIMUM-Number(m[1]));let t=from,k=0;while(k<sessions){t+=86400000;const w=new Date(t).getUTCDay();if(w>0&&w<6)k++;}const iso=new Date(t).toISOString().slice(0,10);return {sessions,date:iso,label:iso.slice(8,10)+'.'+iso.slice(5,7)};}
g.HoldingsBars={LIMIT,MINIMUM,lastJump,prepare,note,waitInfo};
})(typeof window!=='undefined'?window:globalThis);
