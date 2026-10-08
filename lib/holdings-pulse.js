(function(g){'use strict';
const finite=Number.isFinite,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,d=2)=>finite(v)?v.toLocaleString('ro-RO',{maximumFractionDigits:d}):'—',unit=v=>v==='GBp'?'GBX':v;
function stop(p,n={},m=null,{at,now=Date.now()}={}){
 const level=Number(n.stop),threshold=n.stopAlertPct==null?3:Number(n.stopAlertPct),empty=reason=>({state:'missing',reason,distance:null,level:finite(level)&&level>0?level:null,threshold:finite(threshold)?threshold:3});
 if(!finite(level)||level<=0)return empty('Adaugă un stop de reevaluare în Planul meu.');
 if(!finite(threshold)||threshold<.5||threshold>20)return empty('Pragul alertei trebuie să fie între 0,5% și 20%.');
 if(!p.instrumentCurrency||unit(n.stopCurrency)!==unit(p.instrumentCurrency))return empty('Confirmă moneda stopului prin salvarea planului.');
 const t=Date.parse(at),fresh=finite(t)&&t<=now+60000&&now-t<=300000;
 const source=fresh&&finite(p.currentPrice)&&p.currentPrice>0?{price:p.currentPrice,currency:p.instrumentCurrency,label:'Ultima citire broker'}:m&&finite(m.price)&&m.price>0&&unit(m.currency)===unit(n.stopCurrency)?{price:m.price,currency:m.currency,label:'Închidere EOD '+m.asOf}:null;
 if(!source)return empty('Preț actual și comparabil indisponibil; alerta nu este verificată.');
 const distance=(source.price/level-1)*100;if(!finite(distance))return empty('Distanța nu poate fi calculată.');
 const state=source.price<=level?'crossed':source.price<=level*(1+threshold/100)?'near':'safe';
 return {state,distance,level,threshold,price:source.price,currency:source.currency,source:source.label,reason:state==='crossed'?'La sau sub stopul tău · verifică planul acum.':state==='near'?'La cel mult '+fmt(threshold)+'% peste stop · urmărește nivelul.':'Prețul este peste zona de alertă a stopului.'};
}
function build(p,m,n={},options={}){
 const s=stop(p,n,m,options),missing=!m,weak=m?.medium==='Descendent',strong=m?.medium==='Ascendent',code=s.state==='crossed'?'stop':s.state==='near'?'near':missing?'missing':weak?'down':strong?'up':'mixed';
 const title={stop:'Stop atins · revizuiește planul',near:'Aproape de stop · atenție',missing:'Direcție neverificată',down:'Trend descendent · plan de revizuit',up:'Trend ascendent · urmărește confirmarea',mixed:'Tranziție · așteaptă alinierea'}[code];
 const supports=[],risks=[],indicators=[];
 if(m){
  const ema=finite(m.price)&&finite(m.ema50)&&m.ema50>0?(m.price/m.ema50-1)*100:null;
  if(ema!==null)(ema>=0?supports:risks).push('Închiderea este cu '+fmt(Math.abs(ema))+'% '+(ema>=0?'peste':'sub')+' EMA50.');
  if(finite(m.ret5))indicators.push({name:'Impuls · 5 sesiuni',value:fmt(m.ret5)+'%',meaning:m.ret5>0?'Prețul a avansat în ultimele 5 sesiuni.':m.ret5<0?'Prețul a scăzut în ultimele 5 sesiuni.':'Prețul este neschimbat față de acum 5 sesiuni.',tone:m.ret5>0?'good':m.ret5<0?'bad':''});
  indicators.push({name:'RSI · impuls',value:fmt(m.rsi,1),meaning:!finite(m.rsi)?'Date insuficiente.':m.rsi>=70?'Impuls extins; urmărește o pauză, fără întoarcere confirmată.':m.rsi<=30?'Slăbiciune puternică; recuperarea cere confirmare.':m.rsi>=50?'Impulsul favorizează avansul, fără a confirma singur trendul.':'Impulsul favorizează scăderea, fără a confirma singur trendul.',tone:finite(m.rsi)&&m.rsi>=70||finite(m.rsi)&&m.rsi<=30?'warn':''});
  indicators.push({name:'Volum relativ',value:finite(m.rvol)?fmt(m.rvol)+'×':'—',meaning:!finite(m.rvol)?'Volum neverificat.':m.rvol>=1.2?'Participare peste medie; citește volumul împreună cu direcția prețului.':m.rvol<.7?'Participare redusă; mișcarea are o confirmare slabă prin volum.':'Participare apropiată de media ultimelor 20 sesiuni.',tone:finite(m.rvol)&&m.rvol<.7?'warn':''});
  indicators.push({name:'ATR · amplitudine zilnică',value:finite(m.atrPct)?fmt(m.atrPct)+'%':'—',meaning:finite(m.atr)&&m.atr>0?'Amplitudine medie recentă de '+fmt(m.atr)+' '+(m.currency||'unități')+'; nu este limita pierderii.':'Volatilitate neverificată.',tone:''});
  indicators.push({name:'Forță vs piață · 20 sesiuni',value:finite(m.rs20)?fmt(m.rs20)+' pp':'—',meaning:!finite(m.rs20)?'Alege un benchmark cu date aliniate.':m.rs20>0?'Instrumentul a depășit randamentul benchmarkului.':m.rs20<0?'Instrumentul a rămas în urma benchmarkului.':'Randament egal cu benchmarkul.',tone:finite(m.rs20)?m.rs20>=0?'good':'bad':''});
  indicators.push({name:'ADX · forța trendului',value:fmt(m.adx,1),meaning:!finite(m.adx)?'Date insuficiente.':m.adx>=25?'Trend mai pronunțat; ADX nu stabilește direcția.':'Trend slab sau tranziție; direcția se citește din preț și medii.',tone:''});
  if(m.short===m.medium&&['Ascendent','Descendent'].includes(m.medium))(strong?supports:risks).push('Trendul scurt și cel mediu sunt aliniate '+(strong?'în sus.':'în jos.'));
  else risks.push('Trendul scurt și cel mediu nu confirmă aceeași direcție.');
  if(finite(m.rs20))(m.rs20>0?supports:risks).push('Față de benchmark: '+fmt(m.rs20)+' pp în 20 de sesiuni.');else risks.push('Forța relativă față de piață nu este verificată.');
  if(finite(m.rvol)&&m.rvol<.7)risks.push('Volumul este sub 70% din medie.');
  if(finite(m.rsi)&&m.rsi>=70)risks.push('RSI ≥70: impuls extins.');if(finite(m.rsi)&&m.rsi<=30)risks.push('RSI ≤30: recuperare încă neconfirmată.');
 }
 if(s.state==='crossed'||s.state==='near')risks.unshift(s.reason);
 if(n.fundamental==='slăbită')risks.push('Ai marcat teza fundamentală ca slăbită.');
 const price=level=>fmt(level)+' '+(m?.currency||''),confirmation=m&&finite(m.resistance)?'Închidere peste '+price(m.resistance)+' și menținere peste EMA21'+(finite(m.rvol)?', cu volum ≥1,2×.':'; volumul este neverificat.'):'Asociază simbolul exact și analizează seria EOD.';
 const invalidation=m&&finite(m.support)?'Închidere sub '+price(m.support)+' slăbește structura; compară cu stopul personal.':'Fără nivel tehnic verificat.';
 return {code,title,tone:['stop','down'].includes(code)?'bad':['near','mixed','missing'].includes(code)?'warn':'good',supports,risks,indicators,stop:s,direction:m?.medium||'Neverificată',short:m?.short||'Neverificat',long:m?.long||'Neverificat',confirmation,invalidation,next:s.state==='crossed'?'Compară prețul cu stopul și regulile de invalidare salvate.':s.state==='near'?'Verifică distanța până la stop și mărimea expunerii.':missing?'Deschide Planul meu pentru simbol; apoi apasă Analizează deținerile.':weak?'Revizuiește condițiile de păstrare și invalidare din plan.':strong?'Urmărește rezistența și eventuala pierdere a EMA21.':'Urmărește ieșirea din intervalul suport–rezistență.'};
}
function markup(r,m){return `<section class="holding-pulse ${r.tone}" aria-label="Concluzia instrumentului"><span class="eyebrow">VERDICT TEHNIC ${m?'· EOD '+esc(m.asOf):''}</span><h3>${esc(r.title)}</h3><p class="pulse-next">${esc(r.next)}</p><div class="pulse-trends">${[['Scurt',r.short],['Direcție medie',r.direction],['Lung',r.long]].map(([l,v])=>`<div><small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div><div class="pulse-reasons"><div><h4>Ce susține</h4>${r.supports.length?'<ul>'+r.supports.map(x=>'<li>'+esc(x)+'</li>').join(''):'<p>Nicio confirmare suficientă în datele disponibile.</p>'}</div><div><h4>Ce slăbește</h4>${r.risks.length?'<ul>'+r.risks.map(x=>'<li>'+esc(x)+'</li>').join(''):'<p>Nicio regulă tehnică de atenție declanșată.</p>'}</div></div><div class="pulse-levels"><p><b>Confirmare:</b> ${esc(r.confirmation)}</p><p><b>Cazul opus:</b> ${esc(r.invalidation)}</p></div><details class="pulse-indicators"><summary>Ce spun indicatorii · ${r.indicators.length} repere</summary><div class="indicator-meanings">${r.indicators.map(x=>`<article><div><b>${esc(x.name)}</b><strong class="${x.tone}">${esc(x.value)}</strong></div><p>${esc(x.meaning)}</p></article>`).join('')||'<p>Analiza actuală lipsește; valorile vechi nu sunt utilizate.</p>'}</div></details><p class="meta">Verdict tehnic descriptiv; probabilitățile validate se verifică separat în Modele AI.</p></section>`;}
function stopMarkup(s){return `<section class="stop-distance ${s.state}" aria-label="Distanța până la stop"><b>${s.state==='crossed'?'Stop atins':s.state==='near'?'Alertă · aproape de stop':'Stop de reevaluare'}</b><p>${esc(s.reason)}</p>${s.distance!==null?`<strong>${fmt(Math.abs(s.distance))}%</strong><span> ${s.distance<0?'sub stopul':s.distance===0?'la stopul':'peste stopul'} ${fmt(s.level)} ${esc(s.currency)}</span><small>${esc(s.source)} · zonă de alertă ≤${fmt(s.threshold)}%</small>`:''}</section>`;}
g.HoldingsPulse={build,stop,markup,stopMarkup};
})(typeof window!=='undefined'?window:globalThis);
