(function(g){
'use strict';
const F=g.HoldingsForecast,memory=new Map(),messages=new Map(),choices=new Map(),attempted=new Set(),running=new Set();let context=null,generation=0;
const real=F.createStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)}),demo=F.createStore({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('ro-RO',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const NAMES={neural:'Neural · MLP',boosting:'Gradient Boosting',quantile:'Regresie cu cuantile',hmm:'HMM · regimuri',isolation:'Isolation Forest'},CLASSES=['Declin','Mixt','Avans'];
const store=()=>context.demo?demo:real;
function identity(p){const m=context.model(p);return {scope:context.scope,ticker:p.ticker,symbol:context.symbol(p),currency:m?.currency||p.instrumentCurrency||p.currency,kind:context.demo?'synthetic':'market'};}
function same(e,p){const now=identity(p);return F.key(e)===F.key(now);}
function refresh(){g.HoldingsNeuralUI?.refresh();}
function source(p,r,atr){const m=context.model(p),b=m?.bars?.at(-1);if(!b)return null;return {t:r.sourceTime,asOf:r.asOf,timezone:r.timezone,closeMinutes:r.closeMinutes??m.closeMinutes??960,close:r.sourceClose??(r.result?.current?.close||b.c),atrPct:atr};}
function capture(p){
 if(!context||!p)return;const e=identity(p),m=context.model(p);if(!m)return;const inputs=[];
 const n=g.HoldingsNeuralUI?.inspect(p);
 if(n?.usable&&n.record.sourceTime===m.bars?.at(-1)?.t&&Math.abs(n.record.sourceClose-m.price)<=1e-6*Math.max(1,m.price)&&!['drift','disagreement'].includes(n.assessment.state)){
  const r=n.record,result=r.result,counts=result.report.train.confusion.map(row=>row.reduce((s,v)=>s+v,0)),baselineClass=counts.indexOf(Math.max(...counts)),s=source(p,r,result.latest[8]);
  inputs.push({model:'neural',modelVersion:result.version,trainedAt:r.trainedAt,state:n.assessment.state,source:s,estimate:{classIndex:result.classIndex,baselineClass}});
  const b=result.comparison?.boosting;if(b&&n.comparison?.state!=='blocked')inputs.push({model:'boosting',modelVersion:b.version,trainedAt:r.trainedAt,state:n.comparison.state,source:s,estimate:{classIndex:b.classIndex,baselineClass}});
 }
 const q=g.HoldingsQuantileUI?.inspect(p);
 if(q?.usable&&q.assessment.state!=='drift'){const r=q.record,c=r.result.current,b=g.HoldingsQuantile.predict(r.result.baseline,c.x,r.result.baselineCalibration.delta);inputs.push({model:'quantile',modelVersion:r.result.version,trainedAt:r.trainedAt,state:q.assessment.state,source:source(p,r,c.atrPct),estimate:{prices:c.prices,baselinePrices:b.map(v=>c.close*(1+v*c.atrPct/100))}});}
 const h=g.HoldingsHMMUI?.inspect(p);
 if(h?.usable){const r=h.record,profile=r.result.profiles[r.result.current.state];inputs.push({model:'hmm',modelVersion:r.result.version,trainedAt:r.trainedAt,state:h.assessment.state,source:source(p,r,r.result.latest[2]),estimate:{state:profile.state,label:profile.label,means:profile.means}});}
 const a=g.HoldingsIsolationUI?.inspect(p);
 if(a?.usable){const r=a.record,c=r.result.current;inputs.push({model:'isolation',modelVersion:r.result.version,trainedAt:r.trainedAt,state:a.assessment.state,source:source(p,r,m.atrPct),estimate:{label:a.assessment.state,score:c.score,threshold:r.result.threshold,votes:c.votes}});}
 if(!inputs.length){messages.set(F.key(e),'Nu există estimări actuale eligibile. Calculează modelele pe sesiunea EOD verificată.');return;}let saved=0,errors=[];for(const input of inputs){const out=store().save(input,e);if(out.saved)saved++;if(!out.ok)errors.push(out.error);}
 if(errors.length)messages.set(F.key(e),[...new Set(errors)].join(' '));else if(saved)messages.set(F.key(e),saved+' estimări noi păstrate. Prima estimare pe model și sesiune rămâne fixă.');
}
function setContext(c){if(!context||context.scope!==c.scope||context.demo!==c.demo)generation++;context=c;}
async function check(p,manual=false){
 if(!context||!p)return;const e=identity(p),k=F.key(e),m=context.model(p),data=store().read(e);
 if(!k||!data.ok||!data.entries.length||running.has(k))return;
 if(context.demo){if(!manual)return;messages.set(k,'Verificarea demo folosește numai închiderile fictive. Încarcă simularea pentru exemple finalizate.');refresh();return;}
 const stamp=k+'|'+(m?.asOf||'unknown');if(!manual&&(!m||attempted.has(stamp)||!data.entries.some(r=>r.source.asOf<m.asOf)))return;
 attempted.add(stamp);running.add(k);const token=generation,expected=m?.asOf;messages.set(k,'Verific închiderile zilnice din sursa publică…');refresh();
 try{const raw=await g.D.fetchStock(e.symbol,{range:'5y',interval:'1d',ttl:0}),source=g.DailySeries.read(raw,e.symbol),now=Date.now();
  const position=context.positions.find(x=>x.ticker===e.ticker);if(token!==generation||!position||!same(e,position)||context.model(position)?.asOf!==expected)return;
  const out=real.check(e,{...source,symbol:e.symbol,retrievedAt:now},now);messages.set(k,out.ok?'Verificare încheiată. Estimările originale au rămas fixe.':out.error);
 }catch(err){if(token===generation)messages.set(k,'Verificare indisponibilă: '+err.message+'. Rezultatele existente sunt păstrate; poți reîncerca.');}
 finally{running.delete(k);if(token===generation)refresh();}
}
function overview(x){
 if(x.descriptive)return x.n+' contexte cu închidere la +5 sesiuni'+(x.model==='isolation'?' · '+x.anomalies+' anomalii':'')+'. Fără acuratețe predictivă.';
 if(!x.n)return 'Încă nu există rezultate finalizate.';
 if(x.model==='quantile')return 'Acoperire '+fmt(x.coverage*100)+'% · reper '+fmt(x.baselineCoverage*100)+'%. Eroarea medianei '+fmt(x.mae,2)+' ATR · reper '+fmt(x.baselineMae,2)+'. Scor interval '+fmt(x.score,2)+' · reper '+fmt(x.baselineScore,2)+'.';
 return 'Clasă corectă '+fmt(x.accuracy*100)+'% · reper '+fmt(x.baselineAccuracy*100)+'%. Acuratețe echilibrată '+(x.balanced===null?'necalculabilă; lipsește o clasă':fmt(x.balanced*100)+'%')+'.';
}
function prediction(r){const x=r.estimate;if(['neural','boosting'].includes(r.model))return CLASSES[x.classIndex]+' · reper '+CLASSES[x.baselineClass];if(r.model==='quantile')return fmt(x.prices[0],2)+'–'+fmt(x.prices[2],2)+' '+r.currency+' · mediană '+fmt(x.prices[1],2);if(r.model==='hmm')return x.label+' · S'+(x.state+1);return {ordinary:'În tipar',anomaly:'Anomalie',uncertain:'De graniță'}[x.label]+' · '+fmt(x.score,3);}
function resultText(r){const v=r.verification,m=F.metric(r);if(!m)return v.state==='pending'?'În așteptare · '+v.sessions+'/5': 'Neverificabil';if(m.descriptive)return fmt(m.retPct)+'% · observație de preț';if(r.model==='quantile')return (m.covered?'În interval':'În afara intervalului')+' · eroare '+fmt(m.mae,2)+' ATR';return CLASSES[m.actualClass]+' · '+(m.correct?'clasă corectă':'clasă diferită');}
function markup(p,i){
 const e=identity(p),k=F.key(e),d=store().read(e),reports=F.report(d.entries),model=choices.get(k)||'quantile',rows=d.entries.filter(r=>model==='all'||r.model===model).slice(-12).reverse();
 return '<section class="forecast-card" id="model-lab-'+i+'-forecast" tabindex="-1" aria-label="Predicții vs. realitate"><div class="hmm-heading"><div><span class="eyebrow">ESTIMARE FIXĂ · REZULTAT OBSERVAT</span><h4>Predicții vs. realitate</h4><p>Ce au estimat modelele și unde a închis prețul după cinci sesiuni?</p></div><span class="tag">'+(context.demo?'Simulare':'Registru local')+'</span></div>'+(context.demo?'<p class="forecast-demo">DEMO · estimările din simularea verificării sunt ilustrative, distincte de rezultatele modelelor antrenate. Nu sunt dovezi prospective reale.</p>':'')+'<div class="hmm-controls"><button data-forecast-save="'+i+'" '+(!d.ok?'disabled':'')+'>Păstrează estimările actuale</button><button data-forecast-check="'+i+'" '+(!d.ok||!d.entries.length||running.has(k)?'disabled':'')+'>Verifică rezultatele</button><button data-forecast-export="'+i+'" '+(!d.ok||!d.entries.length?'disabled':'')+'>Exportă registrul</button>'+(context.demo?'<button data-forecast-demo="'+i+'">Încarcă simularea verificării</button>':'')+'</div><p class="meta" role="status" aria-live="polite">'+esc(d.error||messages.get(k)||'Estimările noi se păstrează automat după calculul modelului. Verificarea pornește când deschizi analiza, o dată pe sesiunea EOD disponibilă, și la cerere.')+'</p><div class="forecast-report-grid">'+reports.map(x=>'<article><small>'+esc(NAMES[x.model])+'</small><b>'+x.n+' orizonturi separate</b><p>'+esc(overview(x))+'</p><small>'+x.all+' finalizate · '+x.pending+' în așteptare · '+x.unverifiable+' excluse</small><p class="meta '+(x.n>=20&&!x.descriptive?'warn':'')+'">'+esc(x.warning)+'</p></article>').join('')+'</div><details class="neural-details" open><summary>Registrul estimărilor · '+d.entries.length+'</summary><label class="forecast-filter">Model afișat<select aria-label="Model afișat" data-forecast-model="'+i+'">'+Object.entries({...NAMES,all:'Toate modelele'}).map(([id,name])=>'<option value="'+id+'" '+(id===model?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+(rows.length?'<div class="neural-table-wrap"><table class="forecast-table"><thead><tr><th>Origine / model</th><th>Estimare păstrată</th><th>Închidere +5 sesiuni</th><th>Rezultat</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+esc(r.source.asOf)+'</b><small>'+esc(NAMES[r.model])+'</small><small>'+esc(r.modelVersion)+'</small></td><td>'+esc(prediction(r))+'<small>Salvat '+esc(new Date(r.capturedAt).toLocaleString('ro-RO'))+'</small></td><td>'+(r.outcome?fmt(r.outcome.close,2)+' '+esc(r.currency)+'<small>'+esc(r.outcome.asOf)+'</small>':'—')+'</td><td>'+esc(resultText(r))+'<small>'+esc(r.verification.reason)+'</small></td></tr>').join('')+'</tbody></table></div><p class="meta">Ultimele '+rows.length+' estimări din filtrul selectat. Exportul conține întregul registru.</p>':'<p class="meta">Nicio estimare păstrată pentru acest model.</p>')+'</details><details class="neural-details"><summary>Reguli de urmărire și limite</summary><p>Prima estimare a fiecărui model pe sesiune rămâne fixă, inclusiv dacă reantrenezi sau actualizezi versiunea. Înregistrarea se închide la începutul următoarei zile lucrătoare în fusul bursei; această regulă conservatoare poate refuza zile de sărbătoare sau premarket. Nu importăm testele istorice ca predicții reale.</p><p>Rezultatul cere cinci închideri efective după origine. Orizonturile care se ating sau se suprapun sunt excluse din agregatele principale. Direcția folosește pragurile ±1 ATR inițial; reperul este clasa majoritară din antrenare. Cuantilele folosesc reperul simplu fixat la estimare și scorul de interval 80%, în ATR inițial. Acoperirea nu măsoară probabilitatea profitului.</p><p>Sub 20 observații: dovezi insuficiente. Acoperire sub 70%, performanță sub reper sau deteriorare între două blocuri de 20 sunt semnale descriptive, nu teste statistice. HMM și Isolation păstrează contextul și mișcarea ulterioară a prețului; nu au etichete externe pentru acuratețe sau cauzalitate. Retrainingul poate schimba semantica stărilor HMM.</p><p>Schimbările monedei, revizuirea prețurilor, salturile peste 25% și golurile mari blochează evaluarea. Ajustările mici sau barele omise de furnizor pot rămâne nedetectate. Date locale pe acest dispozitiv, maximum 500 estimări pe instrument; fără cantități, sold sau chei API.</p></details><a class="model-back" data-model-jump="summary" href="#model-lab-'+i+'-summary">Sinteză ↑</a></section>';
}
function simulation(p){
 const e=identity(p),m=context.model(p);if(!context.demo||!m)return;
 const bars=g.HoldingsNeural.demoBars(p.ticker==='FICTIVB_US_EQ'?2:0,Date.parse(m.asOf+'T23:59:00Z')),entries=[];
 for(let i=0;i<24;i++){
  const b=bars[bars.length-150+i*6],asOf=g.DailySeries.date(b.t,'America/New_York'),t=b.t+7*3600000,source={t:b.t,asOf,timezone:'America/New_York',closeMinutes:960,close:b.c,atrPct:2},base={source,trainedAt:t-60000,state:'simulation'};
  const samples={neural:{classIndex:i%3,baselineClass:1},boosting:{classIndex:(i+1)%3,baselineClass:1},quantile:{prices:[b.c*.97,b.c*1.002,b.c*1.025],baselinePrices:[b.c*.96,b.c,b.c*1.04]},hmm:{state:i%3,label:['Ascendent','Deteriorare','Consolidare / tranziție'][i%3],means:[i%3-1,0,2]},isolation:{label:i%5===0?'anomaly':'ordinary',score:i%5===0?.7:.4,threshold:.6,votes:i%5===0?3:0}};
  for(const [model,estimate] of Object.entries(samples)){const r=F.project({...base,model,modelVersion:F.VERSIONS[model],estimate},e,t);if(r)entries.push(F.verify(r,{symbol:e.symbol,currency:e.currency,timezone:'America/New_York',bars:bars.slice(bars.length-150+i*6,bars.length-150+i*6+6),retrievedAt:Date.now()},Date.now()));}
 }
 const d=demo.read(e);if(!d.ok){messages.set(F.key(e),d.error);return;}
 const ids=new Set(d.entries.map(r=>r.id));memory.set(F.key(e),JSON.stringify({version:F.VERSION,entries:[...d.entries,...entries.filter(r=>!ids.has(r.id))].sort((a,b)=>a.source.t-b.source.t)}));messages.set(F.key(e),'Simulare încărcată: 24 orizonturi separate pentru fiecare model. Estimări ilustrative, fără cont sau cotații reale.');refresh();
}
function bind(){
 const position=b=>context.positions[Number(b.dataset[Object.keys(b.dataset).find(k=>k.startsWith('forecast'))])];
 for(const b of document.querySelectorAll('[data-forecast-save]'))b.onclick=()=>{const p=position(b);if(p){capture(p);refresh();}};
 for(const b of document.querySelectorAll('[data-forecast-check]'))b.onclick=()=>check(position(b),true);
 for(const b of document.querySelectorAll('[data-forecast-demo]'))b.onclick=()=>{const p=position(b);if(p)simulation(p);};
 for(const b of document.querySelectorAll('[data-forecast-model]'))b.onchange=()=>{const p=position(b);if(p){choices.set(F.key(identity(p)),b.value);refresh();}};
 for(const b of document.querySelectorAll('[data-forecast-export]'))b.onclick=()=>{const p=position(b);if(!p)return;const e=identity(p),d=store().read(e);if(d.ok)g.HoldingsNeuralUI.exportReport({symbol:e.symbol,currency:e.currency,kind:e.kind,asOf:context.model(p)?.asOf||'registru',result:{version:F.VERSION,reviewOnly:true,entries:d.entries,reports:F.report(d.entries)}});};
 for(const host of document.querySelectorAll('[data-neural-host]')){const p=context.positions[Number(host.dataset.neuralHost)];if(p&&!host.closest('[data-holding-panel]')?.hidden&&!host.closest('.holding')?.hidden)void check(p);}
}
g.HoldingsForecastUI={setContext,capture,markup,bind,check,simulation};
})(typeof window!=='undefined'?window:globalThis);
