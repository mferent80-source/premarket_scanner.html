(function(g){
'use strict';
const R=g.TradeReview,cache=new Map(),esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=(v,c='')=>Number.isFinite(v)?v.toLocaleString('ro-RO',{maximumFractionDigits:2})+(c?' '+c:''):'—';
let context=null,generation=0;
function key(o,h){return JSON.stringify([o.record.scope,o.record.simulation,o.id,o.state,o.record.entryLow,o.record.entryHigh,o.record.stop,o.record.target,o.buyIds,o.sellIds,h.rows.filter(x=>o.buyIds?.includes(x.id)||o.sellIds?.includes(x.id))]);}
function quality(q){if(!q)return 'Verifică seria zilnică pentru sesiunile complete de după ultima execuție BUY.';if(!q.ok)return q.reason;return q.sessions+' sesiuni complete · '+q.from+' → '+q.to+' · maxim '+num(q.high)+' / minim '+num(q.low)+'. Favorabil '+num(q.favorablePct)+'%'+(q.favorableR!==null?' ('+num(q.favorableR)+'R)':'')+' · advers '+num(q.adversePct)+'%'+(q.adverseR!==null?' ('+num(q.adverseR)+'R)':'')+'. Stop inițial '+(q.stopTouched?'atins în interval':'neatins în interval')+'; țintă '+(q.targetTouched?'atinsă în interval':'neatinsă în interval')+'. '+q.reason;}
function markup(o,h){
 const r=R.review(o,h);if(!r.available)return '<p class="detail-note">Revizuire: '+esc(r.reason)+'</p>';
 const saved=cache.get(key(o,h));return '<div class="trade-review"><b>Execuții vs analiza inițială</b><p>BUY mediu '+esc(num(r.entry.average,o.record.currency))+(r.exit?' · SELL mediu '+esc(num(r.exit.average,o.record.currency)):'')+'</p><ul>'+r.checks.map(c=>'<li data-review-state="'+esc(c.state)+'">'+esc(c.text)+'</li>').join('')+'</ul><p>Costuri raportate: '+esc(r.costs.length?r.costs.map(x=>num(x.value,x.currency)).join(' · '):r.missingCosts?'indisponibile':'0 în execuțiile asociate')+(r.missingCosts?' · '+r.missingCosts+' execuții/costuri incomplet raportate.':'')+' P&L-ul raportat de broker rămâne separat; nu scădem costurile încă o dată și nu convertim monede fără curs verificat.</p><p class="detail-note" role="status">'+esc(saved?.message||quality(saved?.result))+'</p><button data-trade-quality="'+esc(o.id)+'" '+(h.simulation||saved?.busy?'disabled':'')+'>'+(saved?.busy?'Verific seria…':'VERIFICĂ EVOLUȚIA DUPĂ INTRARE')+'</button><p class="detail-note">Extremele zilnice acoperă numai sesiunile complete. Nu măsoară slippage față de cotația din momentul ordinului și nu arată ordinea stop/țintă intraday. Rezultatul verificării rămâne în această pagină.</p></div>';
}
function bind(host,c){
 if(!context||context.history.scope!==c.history.scope||context.history.simulation!==c.history.simulation)generation++;
 context=c;host.querySelectorAll('[data-trade-quality]').forEach(button=>{button.onclick=()=>check(button.dataset.tradeQuality);});
}
async function check(id){
 const c=context,o=c?.outcomes.find(x=>x.id===id);if(!o||c.history.simulation||!R.review(o,c.history).available)return;
 const k=key(o,c.history),before=cache.get(k);if(before?.busy)return;const token=generation;
 cache.set(k,{busy:true,message:'Verific identitatea, moneda, spliturile și acoperirea sesiunilor…'});c.onChange?.();
 try{
  const fetched=await g.HoldingsWorkspace.saleHistory(o.record.symbol);
  if(token!==generation||g.T212Snapshot?.read('live')?.[0]!==c.history.scope||!context.outcomes.some(x=>x.id===id&&key(x,context.history)===k))return;
  const now=Date.now(),result=R.excursion(o,c.history,{...fetched.series,symbol:o.record.symbol,kind:'market',retrievedAt:now},{splits:fetched.splits,now});cache.set(k,{busy:false,result});
 }catch(error){if(token===generation)cache.set(k,{busy:false,message:'Verificare indisponibilă: '+error.message+'. Analiza originală este păstrată.'});}
 finally{const saved=cache.get(k);if(saved?.busy)cache.delete(k);if(token===generation)context.onChange?.();}
}
function results(outcomes,history){return outcomes.map(o=>({id:o.id,review:R.review(o,history),daily:cache.get(key(o,history))?.result||null}));}
g.TTDeskReview={markup,bind,check,results,quality};
})(window);
