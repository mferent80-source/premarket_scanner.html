/* Compact Decision Desk presentation of the shared policy; no extra permissions. */
(function(g){
'use strict';
const finite=Number.isFinite, labels={up:'Ascendent',down:'Descendent',mixed:'Tranziție',unknown:'Neverificat'};
const num=n=>finite(n)?n.toLocaleString('ro-RO',{maximumFractionDigits:2}):'—';
function build(x,r,risk){
 if(!x||!r)return null;
 const t=r.technical,unit=x.currency||'',price=n=>num(n)+' '+unit;
 const levels=[x.entryLow,x.entryHigh,x.stop,x.target].every(n=>finite(n)&&n>0)&&x.entryLow<=x.entryHigh&&x.stop<x.entryLow&&x.target>x.entryHigh;
 const issues=[...(r.blockers||[]),...(r.cautions||[])],sourceOK=!(r.blockers||[]).some(b=>b.id==='source');
 const rr=levels?(x.target-x.entryHigh)/(x.entryHigh-x.stop):null;
 function reason(b){
  if(b.id==='risk')return 'Governor '+(risk?.verdict||'neverificat')+': '+(risk?.reasons?.join(' · ')||b.text);
  if(b.id==='reward'&&levels)return 'Ținta '+price(x.target)+' oferă '+num(rr)+'R la intrarea maximă '+price(x.entryHigh)+'. Prag cerut: 2R.';
  if(b.id==='volume'&&finite(x.rvol)&&x.rvol>0)return 'Volum '+num(x.rvol)+'× media: participare sub medie pentru un setup Long.';
  if(b.id==='lagging'&&finite(x.rs))return 'Forță relativă '+num(x.rs)+' pp față de benchmark în 20 de sesiuni: instrumentul rămâne în urmă.';
  if(b.id==='extension'&&t&&finite(x.atr)&&x.atr>0)return 'Închiderea este la '+num((t.price-t.ema21)/x.atr)+' ATR peste EMA21 ('+price(t.ema21)+'): intrare extinsă.';
  if(['downtrend','alignment'].includes(b.id)&&t)return 'Trend scurt '+labels[t.short].toLowerCase()+' / mediu '+labels[t.medium].toLowerCase()+'. EMA21 '+price(t.ema21)+'; EMA50 '+price(t.ema50)+'.';
  if(b.id==='setup')return 'Scanner '+(x.state||'WATCH')+': '+(x.reason||b.text);
  return b.text;
 }
 const status={PLAN:'Plan verificabil',CAUTION:'Plan · risc redus',WATCH:'Așteaptă confirmarea',BLOCKED:'Plan blocat',VERIFY:'Reanaliză necesară'}[r.code]||r.title;
 const next=r.nextSteps?.find(s=>!['ai','scope'].includes(s.id))?.text||'Reanalizează în scanner.';
 const summary=issues.length?reason(issues[0]):'Trend '+labels[t?.short||'unknown'].toLowerCase()+' / '+labels[t?.medium||'unknown'].toLowerCase()+', volum '+num(x.rvol)+'× și RS '+num(x.rs)+' pp. Verifică prețul efectiv înainte de dimensionare.';
 let position='Închiderea EOD nu poate fi comparată cu reperele.';
 if(levels&&t&&sourceOK){
  position=t.price<=x.stop?'EOD '+price(t.price)+' este la/sub stop: scenariul este invalidat.':t.price>x.entryHigh?'EOD '+price(t.price)+' depășește intrarea maximă cu '+num((t.price/x.entryHigh-1)*100)+'%. Recalculează; nu urmări prețul.':t.price<x.entryLow?'EOD '+price(t.price)+' este cu '+num((x.entryLow/t.price-1)*100)+'% sub zona de intrare. Așteaptă confirmarea.':'EOD '+price(t.price)+' se află în zona '+price(x.entryLow)+'–'+price(x.entryHigh)+'. Confirmă cotația actuală.';
 }
 const scenario=[{label:'Preț vs. intrare',value:sourceOK?position:'Sursa a expirat sau nu este verificată. Reperele afișate sunt excluse din decizie.'},
  {label:'Confirmare',value:!sourceOK?'Rulează o analiză nouă înainte de folosirea nivelurilor.':levels?(r.canPlan?'Verifică zona ':'Rezolvă condițiile de mai jos; apoi verifică zona ')+price(x.entryLow)+'–'+price(x.entryHigh)+'. '+(finite(x.plan?.trigger)?'Reper structural: '+price(x.plan.trigger)+'. ':''):'Zona de intrare, stopul și ținta trebuie recalculate.'},
  {label:'Invalidare',value:levels&&sourceOK?'La/sub '+price(x.stop)+' scenariul este invalidat. Peste '+price(x.entryHigh)+' recalculează R:R.':'Fără repere verificate de invalidare.'},
  {label:'Risc / câștig',value:levels&&sourceOK?num(rr)+'R · stop −'+num((x.entryHigh-x.stop)/x.entryHigh*100)+'% / țintă +'+num((x.target/x.entryHigh-1)*100)+'%, la intrarea maximă; fără costuri.':'R:R neverificat; nivelurile nu permit dimensionarea.'}];
 const metrics=['21','50','200'].map(n=>({label:'EMA'+n,value:t&&finite(t['ema'+n])?price(t['ema'+n]):'Neverificat',detail:labels[t?.[{21:'short',50:'medium',200:'long'}[n]]||'unknown']}));
 metrics.push({label:'Randament 5 / 20 sesiuni',value:t?num(t.ret5)+'% / '+num(t.ret20)+'%':'Neverificat',detail:'Calcul din închideri EOD'},
  {label:'Volum relativ',value:finite(x.rvol)&&x.rvol>0?num(x.rvol)+'×':'Neverificat',detail:'Peste 1× = peste medie'},
  {label:'Forță relativă · 20 sesiuni',value:finite(x.rs)?num(x.rs)+' pp':'Neverificat',detail:'Diferență față de benchmark'},
  {label:'ATR / RSI14',value:(finite(x.atr)&&x.atr>0?price(x.atr):'ATR neverificat')+' / '+(finite(x.rsi)?num(x.rsi):'RSI neverificat'),detail:'Volatilitate / impuls'});
 return {status,code:r.code,summary,next,scenario,metrics,issues:issues.map(b=>({id:b.id,text:reason(b)})),checks:r.evidence||[],model:r.model||null,
  source:(x.kind==='synthetic'?'DEMO FICTIV · ':'')+'EOD '+(r.source?.asOf||'neverificat')+' · '+unit+' · '+(sourceOK?'sursă verificată':'sursă exclusă')};
}
g.TTDeskInsight={build};
})(typeof window!=='undefined'?window:globalThis);
