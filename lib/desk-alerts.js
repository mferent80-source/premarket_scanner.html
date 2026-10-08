/* Current, scoped observations. No notifications outside the application. */
(function(g){
'use strict';
const finite=Number.isFinite,num=n=>finite(n)?n.toLocaleString('ro-RO',{maximumFractionDigits:2}):'—',unit=c=>/^[A-Z]{3}$/.test(c||'')||c==='GBp';
function build({scope,snapshot,capital,analyses={},scan=null,validation=null,simulation=false,now=Date.now()}={}){
 const rows=[],add=(id,severity,title,reason,next,module,ticker=null)=>rows.push({id,severity,title,reason,next,module,ticker});
 const at=Date.parse(snapshot?.fetchedAt),fresh=finite(at)&&at<=now&&now-at<=300000;
 if(!scope||!snapshot)add('account','attention','Invest neconectat','Cantitatea, prețul și stopurile contului nu sunt confirmate.','Conectează Invest și sincronizează pozițiile.','broker/');
 else if(!fresh)add('account-source','attention','Snapshot Invest expirat','Ultima sursă: '+(finite(at)?new Date(at).toLocaleString('ro-RO'):'oră invalidă')+'.','Reia sincronizarea contului înaintea folosirii prețurilor.','broker/');
 if(fresh&&(!Array.isArray(snapshot.positions)||snapshot.positions.some(p=>!p||!finite(p.quantity)||p.quantity<0)))add('positions-incomplete','attention','Poziții Invest incomplete','Lista pozițiilor nu poate fi verificată integral.','Reia sincronizarea contului.','broker/');
 if(fresh&&(!capital||capital.scope!==scope||capital.snapshotAt!==snapshot.fetchedAt))add('capital-source','attention','Capital și stopuri de reverificat','Controlul capitalului nu corespunde snapshotului Invest actual.','Verifică limitele și stopurile pentru contul selectat.','journal/#desk');
 if(fresh&&capital?.scope===scope&&capital.snapshotAt===snapshot.fetchedAt){for(const p of capital.rows||[]){
  if(p.breached&&finite(p.price)&&p.price>0&&finite(p.stop)&&p.stop>0&&p.price<=p.stop&&unit(p.quoteCurrency))add('stop:'+p.ticker,'critical','Stop documentat atins · '+p.ticker,'Preț '+num(p.price)+' ≤ stop '+num(p.stop)+' '+p.quoteCurrency+' în snapshotul Invest.','Verifică poziția și ordinul stop la broker; datele nu confirmă execuția lui.','holdings/',p.ticker);
  else if(p.stop===null)add('stop-missing:'+p.ticker,'attention','Stop neverificat · '+p.ticker,'Nu există un stop documentat în moneda instrumentului.','Completează și verifică stopul de reevaluare.','holdings/',p.ticker);
  if(finite(capital.equity)&&capital.equity>0&&finite(p.weight)&&finite(capital.limits?.instrumentPct)&&p.weight>capital.limits.instrumentPct)add('concentration:'+p.ticker,'attention','Concentrare · '+p.ticker,num(p.weight)+'% din cont · limită '+num(capital.limits.instrumentPct)+'%.','Revizuiește limita și expunerea înainte de adăugare.','journal/#desk',p.ticker);
 }}
 if(scope&&Array.isArray(snapshot?.positions))for(const p of snapshot.positions){if(!(p?.quantity>0))continue;const saved=analyses[scope+'|'+p.ticker],m=saved?.model,symbol=/_US_EQ$/.test(p.ticker)?p.ticker.replace(/_US_EQ$/,''):saved?.symbol,currency=p.instrumentCurrency==='GBp'?'GBX':p.instrumentCurrency;
  const c=m?{symbol:saved.symbol,currency:saved.currency,kind:simulation?'synthetic':'market',ts:saved.fetchedAt,sourceDate:m.asOf,sourceTimezone:m.timezone,sourceCloseMinutes:m.closeMinutes}:null;
  const t=m?.bars?g.TTDecisionVerdict?.trend(m.bars):null,verified=c&&c.symbol===symbol&&c.currency===currency&&!saved.error&&g.TTDecisionVerdict?.sourceCurrent(c,now)&&t&&finite(m.price)&&Math.abs(t.price-m.price)<=Math.max(1e-8,m.price*1e-8);
  if(!verified)add('trend-source:'+p.ticker,'info','Trend de reverificat · '+p.ticker,'Analiza EOD actuală și identitatea instrumentului nu sunt confirmate.','Actualizează analiza deținerii.','holdings/',p.ticker);
  else if(t.medium==='down')add('trend-down:'+p.ticker,'attention','Trend mediu descendent · '+p.ticker,'EOD '+m.asOf+' · preț '+num(t.price)+' / EMA50 '+num(t.ema50)+' '+currency+' · pantă EMA50 '+num(t.slope50)+'%.','Compară deteriorarea cu teza și stopul documentat.','holdings/',p.ticker);
 }
 if(scan&&(!finite(scan.updatedAt)||scan.updatedAt>now||now-scan.updatedAt>1800000))add('scan-stale','attention','Scanarea a expirat','Reperele scannerului nu mai sunt actuale pentru o intrare.','Rulează o scanare nouă.','candidate-engine/');
 if(validation?.ok&&validation.identity?.scope===scope&&!validation.simulation&&finite(validation.readAt)&&validation.readAt<=now&&now-validation.readAt<=60000)for(const r of validation.rows||[]){if(!['review','blocked','stale'].includes(r.state))continue;add('model:'+validation.identity.ticker+':'+r.model+':'+r.horizon,'info','Dovezi '+r.model.toUpperCase()+' · '+r.horizon+' sesiuni',validation.identity.symbol+': '+r.reason,'Verifică registrul și sursa; nu crește încrederea pe rezultate excluse.','holdings/',validation.identity.ticker);}
 const rank={critical:0,attention:1,info:2};return {scope,simulation,rows:rows.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.id.localeCompare(b.id)),limits:'Observații din sursele afișate; nu sunt ordine sau confirmări de execuție. Se actualizează cât timp aplicația este deschisă.'};
}
g.TTDeskAlerts={build};
})(typeof window!=='undefined'?window:globalThis);
