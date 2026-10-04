(function(g){
'use strict';
const VERSION='holdings-lab-summary-v1',CLASSES=['Declin','Mixt','Avans'];
const STATES={neural:['research','fragile','no-edge','drift','disagreement'],hmm:['descriptive','drift','weak','transition'],isolation:['ordinary','anomaly','uncertain']};
const LIMIT=30*60000,finite=Number.isFinite;
function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function identity(e,now){return finite(now)&&e&&typeof e.symbol==='string'&&e.symbol.length>0&&typeof e.currency==='string'&&e.currency.length>0&&day(e.asOf)&&Date.parse(e.asOf+'T00:00:00Z')<=now&&typeof e.demo==='boolean';}
function accepted(s,e,version,now){const r=s?.record;return identity(e,now)&&s?.usable===true&&r?.result?.version===version&&r.symbol===e.symbol&&r.currency===e.currency&&r.asOf===e.asOf&&r.kind===(e.demo?'synthetic':'market')&&finite(r.trainedAt)&&r.trainedAt<=now&&now-r.trainedAt<=LIMIT;}
function blank(id,name,s){return {id,name,available:false,state:s?.record?'unavailable':'missing',value:s?.record?'Expirat / incompatibil':'Neantrenat',detail:s?.record?'Reanalizează pe sesiunea și moneda curentă.':'Deschide analiza și rulează modelul.',trainedAt:null,version:null};}
function ready(card,record,state,value,detail){return {...card,available:true,state,value,detail,trainedAt:record.trainedAt,version:record.result.version};}
function build({expected:e,neural:n,hmm:h,isolation:a,busy=false,now=Date.now()}={}){
 let neural=blank('neural','Neural',n),boost=blank('boosting','Gradient Boosting',n),hmm=blank('hmm','Regim HMM',h),isolation=blank('isolation','Anomalii Isolation',a);
 const notes=[];let direction=null,conflict=false,comparison='missing';
 if(accepted(n,e,'holdings-mlp-v3',now)&&STATES.neural.includes(n.assessment?.state)&&[0,1,2].includes(n.record.result.classIndex)){
  const r=n.record.result,s=n.assessment.state,blocked=['drift','disagreement'].includes(s);
  neural=ready(neural,n.record,s,blocked?'Interpretare blocată':CLASSES[r.classIndex],n.assessment.message);
  if(r.comparison?.status==='evaluated'&&r.comparison.boosting?.version==='holdings-gbt-v1'&&[0,1,2].includes(r.comparison.boosting?.classIndex)&&['research','no-edge','blocked','disagreement'].includes(n.comparison?.state)){
   comparison=n.comparison.state;
   boost=ready(boost,n.record,comparison,blocked?'Interpretare blocată':CLASSES[r.comparison.boosting.classIndex],n.comparison.message);
   boost.version=r.comparison.boosting.version;
   if(!blocked)direction=[neural.value,boost.value];
  }else if(r.comparison?.status==='blocked'){boost.value='Indisponibil';boost.detail='Comparația cu Gradient Boosting este blocată; verifică analiza de direcție.';}
 }
 if(accepted(h,e,'holdings-hmm-v1',now)&&STATES.hmm.includes(h.assessment?.state)){
  const r=h.record.result,s=h.assessment.state,label=r.profiles?.[r.current?.state]?.label;
  if(['Ascendent','Deteriorare','Consolidare / tranziție'].includes(label))hmm=ready(hmm,h.record,s,s==='descriptive'?label:'Regim neconcludent',h.assessment.message);
 }
 if(accepted(a,e,'holdings-isolation-v1',now)&&STATES.isolation.includes(a.assessment?.state)){
  const r=a.record.result,s=a.assessment.state;
  if(finite(r.current?.score)&&r.current.score>0&&r.current.score<=1&&finite(r.threshold)&&r.threshold>0&&r.threshold<=1&&Number.isInteger(r.current.votes)&&r.current.votes>=0&&r.current.votes<=3){
   isolation=ready(isolation,a.record,s,{anomaly:'Anomalie de revizuit',ordinary:'În tiparul modelului',uncertain:'Rezultat de graniță'}[s],a.assessment.message);
   isolation.score=r.current.score;isolation.threshold=r.threshold;isolation.votes=r.current.votes;
  }
 }
 const cards=[neural,boost,hmm,isolation],available=cards.filter(c=>c.available).length;
 if(isolation.available&&isolation.state==='anomaly')notes.push({id:'anomaly',target:'isolation',text:'Sesiune neobișnuită: verifică datele și evenimentele. Detectorul nu stabilește cauza.'});
 if(isolation.available&&isolation.state==='uncertain')notes.push({id:'anomaly-uncertain',target:'isolation',text:'Detectorul de anomalii rămâne neconcludent; păstrează rezultatul separat.'});
 if(direction&&hmm.state==='descriptive'){
  conflict=direction[0]===direction[1]&&((hmm.value==='Deteriorare'&&direction[0]==='Avans')||(hmm.value==='Ascendent'&&direction[0]==='Declin'));
  if(conflict&&!e.demo)notes.push({id:'regime-conflict',target:'hmm',text:'Estimarea de direcție apare într-un regim opus. Revizuiește ambele analize; HMM nu confirmă direcția.'});
 }
 if(comparison!=='research'&&neural.available&&boost.available)notes.push({id:'direction',target:'direction',text:n.comparison.message});
 if(neural.available&&neural.state!=='research'&&comparison==='research')notes.push({id:'neural',target:'direction',text:neural.detail});
 if(hmm.available&&hmm.state!=='descriptive')notes.push({id:'regime',target:'hmm',text:hmm.detail});
 if(cards.some(c=>!c.available))notes.push({id:'incomplete',target:cards.find(c=>!c.available).id==='boosting'?'direction':cards.find(c=>!c.available).id==='neural'?'direction':cards.find(c=>!c.available).id,text:'Lipsesc rezultate actuale pentru unul sau mai multe modele. Valorile expirate sunt excluse.'});
 let state='context',title='Context neconcludent';
 if(!identity(e,now)){state='missing-eod';title='Analiză EOD necesară';}
 else if(busy){state='running';title='Analiză în curs';}
 else if(e.demo){state='demo';title='Exemplu de sinteză · date fictive';}
 else if(isolation.state==='anomaly'){state='review';title='Anomalie de revizuit';}
 else if(conflict){state='conflict';title='Direcție și regim în tensiune';}
 else if(comparison==='disagreement'){state='disagreement';title='Modelele de direcție se contrazic';}
 else if(available<4){state='incomplete';title='Rezumat incomplet';}
 else if(['drift','disagreement'].includes(neural.state)||comparison==='blocked'){state='blocked';title='Interpretare blocată';}
 else if(comparison==='no-edge'||neural.state!=='research'){state='no-edge';title='Avantaj repetat neconfirmat';}
 else if(comparison==='research'&&neural.state==='research'&&hmm.state==='descriptive'&&isolation.state==='ordinary'){state='research';title='Acord experimental · context disponibil';}
 const source=identity(e,now)?{symbol:e.symbol,currency:e.currency,asOf:e.asOf,kind:e.demo?'synthetic':'market'}:{symbol:null,currency:null,asOf:null,kind:null};
 return {version:VERSION,generatedAt:now,reviewOnly:true,...source,state,title,available,total:4,busy:Boolean(busy),cards,notes,limits:e?.demo?'Demo: direcția și HMM folosesc un istoric fictiv; Isolation folosește altul, cu anomalie introdusă. Rezultatele nu se confirmă reciproc.':'Modelele au obiective diferite. Sinteza nu însumează voturi, nu calculează un scor de încredere și nu validează profitul. Știrile, earnings și breadth se verifică separat.'};
}
g.HoldingsModelSummary={VERSION,build};
})(typeof window!=='undefined'?window:globalThis);
