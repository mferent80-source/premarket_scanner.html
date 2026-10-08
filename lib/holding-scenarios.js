/* Price-only what-if arithmetic. The caller supplies the verified current EOD model. */
(function(g){'use strict';
const finite=Number.isFinite,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=v=>typeof v==='string'&&(/^[A-Z]{3}$/.test(v)||v==='GBp')?v:null,unit=v=>v==='GBp'?'GBX':v;
const positive=v=>['number','string'].includes(typeof v)&&String(v).trim()!==''&&finite(Number(v))&&Number(v)>0?Number(v):null;
const fmt=(v,c='',signed=false)=>finite(v)?(signed&&v>0?'+':'')+v.toLocaleString('ro-RO',{maximumFractionDigits:Math.abs(v)>0&&Math.abs(v)<.01?6:2})+(c?' '+(c==='GBp'?'GBp (pence)':c):''):'—';
const inputPrice=v=>finite(v)&&v>0?String(Number(v.toPrecision(12))):'';
const sources=new Map(),preferences=new Map();
function reference(p,m,{at,now=Date.now()}={}){
 const c=currency(p?.instrumentCurrency),t=Date.parse(at);if(!c)return null;
 if(finite(p.currentPrice)&&p.currentPrice>0&&finite(t)&&t<=now+60000)return {price:p.currentPrice,currency:c,source:'Citire broker · '+new Date(t).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'}),kind:'broker',stale:now-t>300000};
 if(m&&finite(m.price)&&m.price>0&&currency(m.currency)&&unit(m.currency)===unit(c)&&typeof m.asOf==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(m.asOf)&&finite(Date.parse(m.asOf)))return {price:m.price,currency:c,source:'Închidere EOD · '+m.asOf,kind:'eod',stale:false};
 return null;
}
function levels(p,n={},m=null,options={}){
 const r=reference(p,m,options),c=currency(p?.instrumentCurrency),personal=(v,cc)=>positive(v)!==null&&currency(cc)&&unit(cc)===unit(c)?positive(v):null,technical=v=>m&&currency(m.currency)&&unit(m.currency)===unit(c)?positive(v):null;
 return {reference:r,values:{current:r?.price??null,stop:personal(n.stop,n.stopCurrency),target:personal(n.targetPrice,n.targetCurrency),average:finite(p?.averagePrice)&&p.averagePrice>0&&c?p.averagePrice:null,support:technical(m?.support),resistance:technical(m?.resistance)}};
}
function build(p,n={},m=null,{price,mode='current',shock=0,...options}={}){
 const l=levels(p,n,m,options),r=l.reference,quantity=finite(p?.quantity)&&p.quantity>0?p.quantity:null;
 const chosen=mode==='custom'?positive(price):mode==='shock'&&finite(shock)?positive(r?.price*(1+shock/100)):l.values[mode]??null;
 const result={...l,quantity,price:chosen,change:null,changePct:null,pricePnl:null,brokerPnl:null,impactPct:null,risk:null,reward:null,ratio:null,reason:'',warning:'',ratioReason:'Adaugă un stop sub reper și o țintă peste reper în Planul meu.',brokerReason:'Moneda contului sau P&L-ul raportat nu sunt verificate.'};
 if(!r||quantity===null){result.reason='Prețul de referință, moneda sau cantitatea nu sunt verificate.';return result;}
 if(chosen===null){result.reason='Alege un nivel disponibil sau introdu un preț ipotetic pozitiv.';return result;}
 const change=(chosen-r.price)*quantity,changePct=(chosen/r.price-1)*100,pricePnl=l.values.average!==null?(chosen-l.values.average)*quantity:null;
 if(!finite(change)||!finite(changePct)||pricePnl!==null&&!finite(pricePnl)){result.reason='Calculul depășește limitele numerice.';return result;}
 result.change=change;result.changePct=changePct;result.pricePnl=pricePnl;
 if(mode==='stop'&&chosen>=r.price)result.warning='Stopul este deja atins în citirea de referință. Revizuiește planul înainte de a interpreta distanța ca risc viitor.';
 if(mode==='target'&&chosen<=r.price)result.warning='Ținta este deja atinsă sau sub reper în această citire. Verifică nivelul salvat.';
 if(r.kind!=='broker')result.brokerReason='Reper EOD: P&L-ul broker nu este extrapolat din altă citire.';
 else if(r.stale)result.brokerReason='Citire veche: sincronizează pentru P&L-ul orientativ în cont.';
 else if(currency(p.currency)&&unit(p.currency)!==unit(r.currency))result.brokerReason='Monede diferite: '+r.currency+' / '+p.currency+'; impactul FX nu este estimat.';
 else if(currency(p.currency)&&finite(p.unrealized)){const pnl=p.unrealized+change;if(finite(pnl)){result.brokerPnl=pnl;result.brokerReason='Pornind de la P&L-ul raportat; costurile suplimentare nu sunt incluse.';}}
 if(r.kind==='broker'&&!r.stale&&currency(options.accountCurrency)&&unit(options.accountCurrency)===unit(r.currency)&&finite(options.totalValue)&&options.totalValue>0){const pct=change/options.totalValue*100;if(finite(pct))result.impactPct=pct;}
 const stop=l.values.stop,target=l.values.target;
 if(stop!==null&&target!==null){
  if(stop>=r.price)result.ratioReason='Stopul este la sau peste reper; nu mai definește un risc viitor pozitiv.';
  else if(target<=r.price)result.ratioReason='Ținta este la sau sub reper; nu mai definește un câștig viitor pozitiv.';
  else{const risk=(r.price-stop)*quantity,reward=(target-r.price)*quantity,ratio=reward/risk;if(finite(risk)&&risk>0&&finite(reward)&&finite(ratio)){result.risk=risk;result.reward=reward;result.ratio=ratio;result.ratioReason='Distanțe de preț de la reper, pentru cantitatea deținută. Raportul nu este probabilitatea de reușită.';}else result.ratioReason='Raportul țintă/risc depășește limitele numerice.';}
 }
 return result;
}
function resultsMarkup(r,p){const c=r.reference?.currency,tone=v=>v===null?'':v<0?'bad':v>0?'good':'',card=(label,value,note='',v=null)=>'<div><small>'+label+'</small><strong class="'+tone(v)+'">'+esc(value)+'</strong>'+(note?'<span>'+esc(note)+'</span>':'')+'</div>';
 const verdict=r.pricePnl===null?'Componenta de preț față de costul mediu nu poate fi verificată.':r.pricePnl<0?'La acest preț, poziția rămâne sub costul mediu raportat.':r.pricePnl>0?'La acest preț, componenta de preț este peste costul mediu raportat.':'Prețul ajunge la costul mediu; costurile pot păstra un rezultat negativ în cont.';
 return (r.warning?'<p class="warn">'+esc(r.warning)+'</p>':'')+'<p class="scenario-conclusion" role="status">'+esc(r.reason||verdict)+'</p><div class="scenario-money">'+card('Schimbare față de reper',fmt(r.change,c,true),r.changePct!==null?fmt(r.changePct,'%',true)+' în preț':'',r.change)+card('P&L din preț · față de cost',fmt(r.pricePnl,c,true),'Cantitate × (preț ipotetic − cost mediu)',r.pricePnl)+card('P&L broker orientativ',fmt(r.brokerPnl,p.currency,true),r.brokerReason,r.brokerPnl)+card('Impact / valoarea contului',fmt(r.impactPct,'%',true),r.impactPct===null?'Necesită un reper broker recent și aceeași monedă ca sumarul contului.':'O singură poziție; celelalte valori rămân constante.',r.impactPct)+'</div><details class="scenario-ratio"><summary>Stop, țintă și raportul dintre ele'+(r.ratio!==null?' · '+esc(fmt(r.ratio))+'×':'')+'</summary><div class="scenario-money">'+card('Până la stop · de la reper',fmt(r.risk===null?null:-r.risk,c,true),'',r.risk===null?null:-r.risk)+card('Până la țintă · de la reper',fmt(r.reward,c,true),'',r.reward)+'</div><p class="meta">'+esc(r.ratioReason)+'</p></details>';
}
const labels={current:'Citirea de referință',stop:'Stopul meu',target:'Ținta mea',average:'Costul mediu',support:'Suport EOD',resistance:'Rezistență EOD',custom:'Preț introdus de mine',shock:'Variație rapidă'};
function calculate(source,state){return build(source.p,source.n,source.m,{...source.options,...state,price:state.rawPrice});}
function markup(p,n,m,options={}){
 const key=JSON.stringify([options.scope,p.ticker,p.instrumentCurrency]),source={p,n:n||{},m,options};sources.set(key,source);let state=preferences.get(key);
 if(!state){state={mode:levels(p,n,m,options).values.stop!==null?'stop':'current',rawPrice:'',shock:0};preferences.set(key,state);}
 const r=calculate(source,state);if(state.mode!=='custom')state.rawPrice=inputPrice(r.price);
 return '<section class="holding-simulator" data-holding-scenario="'+esc(key)+'" aria-label="Scenariul monetar '+esc(p.ticker)+'"><header><h3>Dacă prețul ajunge la…</h3><span>'+(options.simulated?'DATE FICTIVE · ':'')+'Calcul ipotetic</span></header><p class="meta">'+esc(r.reference?r.reference.source+' · '+fmt(r.reference.price,r.reference.currency)+(r.reference.stale?' · DATE VECHI':''):'Reper indisponibil')+' · '+esc(finite(p.quantity)?p.quantity.toLocaleString('ro-RO',{maximumFractionDigits:6})+' unități':'cantitate?')+'</p><div class="scenario-controls"><label>Nivel de explorat<select data-scenario-mode aria-label="Nivel de explorat">'+Object.entries(labels).map(([value,label])=>'<option value="'+value+'" '+(state.mode===value?'selected':'')+' '+(!['custom','shock'].includes(value)&&r.values[value]===null?'disabled':'')+'>'+esc(label+(!['custom','shock'].includes(value)&&r.values[value]!==null?' · '+fmt(r.values[value],r.reference?.currency):''))+'</option>').join('')+'</select></label><label>Preț ipotetic · '+esc(r.reference?.currency||p.instrumentCurrency||'monedă?')+'<input type="number" step="any" min="0" data-scenario-price aria-label="Preț ipotetic" value="'+esc(state.rawPrice)+'" inputmode="decimal"></label></div><div class="scenario-shocks" role="group" aria-label="Variații rapide față de reper">'+[-10,-5,0,5,10].map(x=>'<button data-scenario-shock="'+x+'" aria-pressed="'+(state.mode==='shock'&&state.shock===x)+'">'+(x>0?'+':'')+x+'%</button>').join('')+'</div><div data-scenario-result>'+resultsMarkup(r,p)+'</div><p class="scenario-method">Cantitatea rămâne constantă. Calculele de preț sunt în moneda instrumentului, fără FX, taxe, comisioane sau gap. Nivelurile EOD sunt repere tehnice; stopul și ținta sunt ale tale. Salvează reperele în Planul meu pentru vizitele următoare.</p></section>';
}
function bind(root=document){for(const host of root.querySelectorAll('[data-holding-scenario]')){
 const key=host.dataset.holdingScenario,source=sources.get(key),state=preferences.get(key);if(!source||!state)continue;
 const paint=updateInput=>{const r=calculate(source,state),open=host.querySelector('.scenario-ratio')?.open;host.querySelector('[data-scenario-result]').innerHTML=resultsMarkup(r,source.p);const details=host.querySelector('.scenario-ratio');if(details)details.open=!!open;host.querySelector('[data-scenario-mode]').value=state.mode;if(updateInput){state.rawPrice=inputPrice(r.price);host.querySelector('[data-scenario-price]').value=state.rawPrice;}for(const b of host.querySelectorAll('[data-scenario-shock]'))b.setAttribute('aria-pressed',String(state.mode==='shock'&&state.shock===Number(b.dataset.scenarioShock)));};
 host.oninput=e=>{if(!e.target.matches('[data-scenario-price]'))return;state.mode='custom';state.rawPrice=e.target.value;paint(false);};
 host.onchange=e=>{if(!e.target.matches('[data-scenario-mode]'))return;state.mode=e.target.value;paint(true);};
 host.onclick=e=>{const b=e.target.closest('[data-scenario-shock]');if(!b||!host.contains(b))return;state.mode='shock';state.shock=Number(b.dataset.scenarioShock);paint(true);};
}}
g.HoldingScenarios={reference,levels,build,markup,bind};
})(typeof window!=='undefined'?window:globalThis);
