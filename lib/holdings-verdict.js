(function(g){
'use strict';
const VERSION='holdings-verdict-v2',IDS=['neural','boosting','hmm','isolation','quantile','garch'];
const NAMES={neural:'Neural · MLP',boosting:'Gradient Boosting',hmm:'HMM · regim',isolation:'Isolation Forest',quantile:'Regresie cu cuantile',garch:'GARCH(1,1) · volatilitate'},CLASSES=['Declin','Mixt','Avans'];
const V={neural:'holdings-mlp-v3',boosting:'holdings-gbt-v1',hmm:'holdings-hmm-v1',isolation:'holdings-isolation-v1',quantile:'holdings-quantile-v1',garch:'holdings-garch-v1'};
const finite=Number.isFinite,equal=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(a),Math.abs(b));
function fingerprint(bars){const text=JSON.stringify(bars.map(b=>[b.t,b.o,b.h,b.l,b.c,b.v]));let a=2166136261,b=3339675911;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return 'ohlcv-v1:'+bars.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);}
function rejection(id,s,e,now){const reject=(code,message)=>({code,message});try{
 const r=s?.record,version=id==='boosting'?V.neural:V[id];
 if(!r)return reject('missing','Modelul nu are un raport disponibil. Reanalizează.');
 if(!e)return reject('source','Istoricul comun nu a fost încă verificat.');
 if(r.symbol!==e.symbol||r.currency!==e.currency)return reject('identity','Raportul aparține altui instrument sau altei monede. Reanalizează.');
 if(r.asOf!==e.asOf||r.kind!==e.kind)return reject('session','Raportul nu corespunde sesiunii EOD sau tipului de date. Reanalizează.');
 if(r.result?.version!==version)return reject('version','Raportul folosește altă versiune a modelului. Reanalizează.');
 if(!finite(r.trainedAt)||r.trainedAt>now)return reject('time','Momentul raportului nu poate fi verificat. Reanalizează.');
 if(now-r.trainedAt>1800000)return reject('expired','Raportul a expirat (maximum 30 de minute). Reanalizează.');
 if(typeof e.fingerprint!=='string'||r.sourceFingerprint!==e.fingerprint)return reject('history','Istoricul comun s-a schimbat sau nu poate fi verificat. Reanalizează.');
 if(!equal(r.sourceClose,e.close))return reject('close','Închiderea raportului diferă de istoricul comun. Reanalizează.');
 if(r.sourceTime!==e.t||r.timezone!==e.timezone||r.closeMinutes!==e.closeMinutes)return reject('session','Sesiunea sau ora închiderii raportului diferă de istoricul comun. Reanalizează.');
 const result=r.result;
 if((['neural','boosting'].includes(id)?result.report?.periods?.test?.lastLabel:result.current?.t)!==e.t)return reject('session','Rezultatul nu corespunde ultimei sesiuni EOD. Reanalizează.');
 if(['quantile','garch'].includes(id)&&!equal(result.current?.close,e.close))return reject('close','Închiderea din rezultat diferă de istoricul comun. Reanalizează.');
 if(s?.usable!==true)return reject('consistency','Raportul nu trece verificările de actualitate și consistență. Reanalizează.');
 let valid;
 if(['neural','boosting'].includes(id))valid=g.HoldingsNeural.valid(result)&&(id==='neural'||g.HoldingsModelComparison.valid(result)&&result.comparison?.status==='evaluated'&&result.comparison.boosting?.version===V.boosting);
 else valid=({hmm:g.HoldingsHMM,isolation:g.HoldingsIsolation,quantile:g.HoldingsQuantile,garch:g.HoldingsGarch}[id]).valid(result);
 return valid?null:reject('invalid','Raportul modelului nu trece verificarea rezultatului. Reanalizează.');
 }catch{return reject('invalid','Raportul modelului nu poate fi verificat. Reanalizează.');}}
function rejectionReason(id,s,e,now){return rejection(id,s,e,now)?.message||null;}
function accepted(id,s,e,now){return rejectionReason(id,s,e,now)===null;}
function build({expected:e,snapshots={},statuses={},running=false,now=Date.now()}={}){
 const cards=IDS.map(id=>{
  const snap=snapshots[id==='boosting'?'neural':id],status=statuses[id],ok=(!status||['ready','cached'].includes(status.state))&&accepted(id,snap,e,now);
  const card={id,name:NAMES[id],available:!!ok,state:status?.state||'missing',value:'Rezultat indisponibil',detail:status?.error||'Modelul nu a produs încă un rezultat actual.',direction:null,eligible:false,trainedAt:null,version:null,rejectionCode:null};
  if(!ok){card.rejectionCode=status&&!['ready','cached'].includes(status.state)?status.state:rejection(id,snap,e,now)?.code||'invalid';if(e&&(!status||['ready','cached'].includes(status.state))){card.detail=rejectionReason(id,snap,e,now);if(snap?.record||status)card.state='unavailable';}return card;}
  const r=snap.record.result,a=id==='boosting'?snap.comparison:snap.assessment;Object.assign(card,{state:a?.state||'invalid',detail:a?.message||'Interpretare indisponibilă.',trainedAt:snap.record.trainedAt,version:V[id]});
  if(['neural','boosting'].includes(id)){
   const x=id==='neural'?r:r.comparison.boosting;card.direction=x.classIndex;card.value=CLASSES[x.classIndex]||'Neconcludent';card.eligible=a?.state==='research';
   if(['drift','disagreement','blocked','invalid'].includes(card.state)){card.value='Interpretare neconcludentă';card.eligible=false;}
  }else if(id==='hmm'){
   const label=r.profiles[r.current.state].label;card.value=a?.state==='descriptive'?label:'Regim neconcludent';card.eligible=a?.state==='descriptive';card.direction=label==='Ascendent'?2:label==='Deteriorare'?0:1;
  }else if(id==='isolation'){
   card.value={ordinary:'În tiparul modelului',anomaly:'Anomalie detectată',uncertain:'Rezultat de graniță'}[a?.state]||'Neconcludent';card.eligible=a?.state==='ordinary';card.detail+=' Scor izolare '+r.current.score.toLocaleString('ro-RO',{maximumFractionDigits:3})+'; prag '+r.threshold.toLocaleString('ro-RO',{maximumFractionDigits:3})+'.';
  }else if(id==='garch'){
   card.eligible=a?.state==='descriptive';
   if(a?.state==='drift')card.value='Estimare ascunsă · șoc în afara domeniului';
   else{const horizons=r.current.horizons;card.volatilityRatio=horizons[0].ratio;card.value=horizons.map(h=>h.horizon+' sesiuni: '+h.cumulativePct.toLocaleString('ro-RO',{maximumFractionDigits:2})+'%').join(' · ');card.detail+=' La 5 sesiuni: '+card.volatilityRatio.toLocaleString('ro-RO',{maximumFractionDigits:2})+'× nivelul istoric. Fără vot de direcție.';}
  }else{
   const c=r.current;card.eligible=a?.state==='descriptive';
   if(a?.state!=='drift'){card.prices=c.prices.slice();card.medianReturnPct=(c.prices[1]/e.close-1)*100;const y=card.medianReturnPct/c.atrPct;card.direction=y<=-1?0:y>=1?2:1;card.value=c.prices[0].toLocaleString('ro-RO',{maximumFractionDigits:2})+'–'+c.prices[2].toLocaleString('ro-RO',{maximumFractionDigits:2})+' '+e.currency;card.detail+=' Mediană '+c.prices[1].toLocaleString('ro-RO',{maximumFractionDigits:2})+' '+e.currency+'.';}
   else card.value='Interval ascuns · date în afara domeniului';
  }
  if(snap.persistence?.message)card.detail+=' '+snap.persistence.message;
  const retention=snap.persistence?.state||snap.record.retention;card.persistence=['demo','session','local','pending','indexeddb'].includes(retention)?retention:'local';
  return card;
 });
 const byId=Object.fromEntries(cards.map(c=>[c.id,c])),available=cards.filter(c=>c.available).length;
 let state='incomplete',title='Verdict incomplet',direction=null,reasons=[];
 if(running){state='running';title='Analiză în curs';reasons=['Concluzia finală apare după terminarea tuturor modelelor.'];}
 else if(available<IDS.length)reasons=[(IDS.length-available)+' modele nu au rezultate actuale verificate. Nu completăm rezultatele lipsă cu presupuneri.'];
 else{
  const n=byId.neural,b=byId.boosting,h=byId.hmm,a=byId.isolation,q=byId.quantile,v=byId.garch;
  if(n.direction!==b.direction||n.eligible&&b.eligible&&q.eligible&&q.direction!==n.direction){state='conflict';title='Semnale contradictorii';reasons=['Estimările de direcție și interval nu sunt în acord.'];}
  else if(a.state!=='ordinary'){state='caution';title='Prudență · sesiune neobișnuită';reasons=['Isolation Forest cere verificarea datelor și a evenimentelor înaintea interpretării direcției.'];}
  else if(!n.eligible||!b.eligible||!q.eligible||!h.eligible){state='weak';title='Neconcludent · dovezi insuficiente';reasons=cards.filter(c=>c.id!=='garch'&&!c.eligible).map(c=>c.name+': '+c.detail);}
  else if(n.direction===2&&h.direction===0||n.direction===0&&h.direction===2){state='conflict';title='Direcție și regim în conflict';reasons=['HMM descrie un regim opus estimărilor de direcție.'];}
  else{direction=n.direction;state=direction===2?'up':direction===0?'down':'mixed';title=direction===2?'Înclinare ascendentă · experimentală':direction===0?'Înclinare descendentă · experimentală':'Mișcare mixtă · fără direcție clară';reasons=['Neural și Gradient Boosting estimează '+CLASSES[direction].toLowerCase()+', iar mediana cuantilelor este compatibilă.','Regimul HMM nu contrazice estimarea; Isolation Forest nu semnalează o anomalie.'];}
  if(v.eligible&&v.volatilityRatio>=g.HoldingsGarch.CONFIG.elevatedRatio){reasons.push('GARCH validat estimează fluctuații ridicate la 5 sesiuni; direcția rămâne aceeași, cu prudență suplimentară.');if(direction!==null){state+='-volatile';title=(direction===2?'Înclinare ascendentă':direction===0?'Înclinare descendentă':'Mișcare mixtă')+' · volatilitate ridicată';}}
  else if(v.eligible)reasons.push('GARCH validat nu semnalează volatilitate ridicată față de nivelul istoric; nu garantează un risc redus.');
  else reasons.push('GARCH rămâne exploratoriu ('+({'no-edge':'avantaj istoric neconfirmat',limited:'validare limitată',drift:'șoc în afara domeniului'}[v.state]||'validare neconcludentă')+') și nu modifică verdictul. Vezi estimările și verificările lui mai jos.');
 }
 return {version:VERSION,generatedAt:now,symbol:e?.symbol||null,currency:e?.currency||null,asOf:e?.asOf||null,kind:e?.kind||null,available,total:IDS.length,state,title,direction,cards,reasons,limits:'Direcție pe închiderea la +5 sesiuni; GARCH estimează volatilitatea cumulată la 5 și 20 sesiuni, fără interval de preț sau pierdere maximă. Modelele folosesc același istoric și pot fi corelate. HMM, Isolation și GARCH oferă context, fără voturi de preț. GARCH modifică prudența numai după validarea față de varianța constantă și EWMA. Nu calculăm o probabilitate de profit; știrile, earnings, costurile și riscul portofoliului se verifică separat.'};
}
g.HoldingsVerdict={VERSION,IDS,NAMES,fingerprint,accepted,rejectionReason,build};
})(typeof window!=='undefined'?window:globalThis);
