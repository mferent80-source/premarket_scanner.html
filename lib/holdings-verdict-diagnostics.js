/* Explain a verdict without changing its acceptance rules or casting new votes. */
(function(g){
'use strict';
const DIRECTIONS=['neural','boosting','quantile'],CONTEXT=['hmm','isolation','garch'];
const LABELS={research:'Avantaj istoric repetat',descriptive:'Validare descriptivă',ordinary:'Observație obișnuită',anomaly:'Anomalie',uncertain:'Rezultat de graniță','no-edge':'Avantaj istoric neconfirmat',fragile:'Validare fragilă',drift:'În afara domeniului',weak:'Regim slab',transition:'Regim în tranziție',limited:'Validare limitată',blocked:'Interpretare blocată',disagreement:'Dezacord',invalid:'Interpretare indisponibilă'};
const REJECTIONS={error:'Eroare tehnică',expired:'Raport expirat',missing:'Raport lipsă',running:'Analiză în curs',cancelled:'Analiză oprită',identity:'Instrument sau monedă diferite',session:'Sesiune diferită',history:'Istoric schimbat',close:'Închidere diferită',version:'Versiune diferită',time:'Moment neverificat',source:'Istoric neverificat',consistency:'Raport incompatibil',invalid:'Raport neverificat'};
function build(report,{phase,sourceVerified=true,error,errorCode}={}){
 const cards=report.cards,byId=Object.fromEntries(cards.map(c=>[c.id,c])),busy=phase==='loading'||phase==='running'||report.state==='running'||errorCode==='busy';
 const retryIds=busy?[]:cards.filter(c=>!c.available).map(c=>c.id),blockers=[],notes=[],actions=[];
 const addAction=(id,text)=>{if(!actions.some(a=>a.id===id))actions.push({id,text});};
 const add=(c,code,label,remedy)=>blockers.push({ids:[c.id],code,label,name:c.name,detail:c.detail,remedy});
 if(busy){addAction('wait',errorCode==='busy'?'Un model rulează deja separat. Așteaptă finalizarea lui, apoi reia analiza verdictului.':'Așteaptă verificarea istoricului și finalizarea modelelor.');}
 else if(!sourceVerified){
  blockers.push({ids:[],code:phase==='error'?'source-error':'source',label:'Istoricul comun nu este verificat',name:'Date EOD',detail:error||'Niciun raport nu poate fi folosit până la verificarea instrumentului, monedei și ultimei închideri.',remedy:'recalculate'});
  addAction('source','Reia analiza pentru a verifica istoricul EOD. Dacă eroarea se repetă, consultă Starea datelor.');
 }else{
  for(const c of cards){
   if(!c.available){add(c,c.rejectionCode||'missing',REJECTIONS[c.rejectionCode]||'Rezultat indisponibil','recalculate');continue;}
   if(c.id==='garch'){
    if(!c.eligible)notes.push({ids:[c.id],code:'exploratory',name:c.name,detail:'Estimarea rămâne exploratorie și nu modifică direcția verdictului.'});
   }else if(!c.eligible){
    const review=['drift','disagreement','blocked','anomaly','uncertain','invalid'].includes(c.state);
    add(c,c.state,LABELS[c.state]||'Dovezi insuficiente',review?'review':'evidence');
    addAction(review?'review':'evidence',review?'Verifică datele, evenimentele și estimările care se contrazic înainte de interpretare.':'Recalcularea pe același istoric nu adaugă dovezi independente. Urmărește sesiuni noi în Predicții vs. realitate.');
   }
  }
  const n=byId.neural,b=byId.boosting,q=byId.quantile,h=byId.hmm;
  const conflict=(ids,detail)=>{blockers.push({ids,code:'conflict',label:'Estimări în conflict',name:'Acordul modelelor',detail,remedy:'review'});addAction('conflict','Păstrează estimările separat până când există un acord susținut de validarea istorică.');};
  if(n?.available&&b?.available&&n.direction!==b.direction)conflict(['neural','boosting'],'Neural și Gradient Boosting estimează clase diferite.');
  if(n?.available&&b?.available&&q?.available&&n.eligible&&b.eligible&&q.eligible&&q.direction!==n.direction)conflict(['neural','boosting','quantile'],'Mediana cuantilelor nu este în acord cu estimările de direcție, în unități ATR.');
  if(n?.available&&h?.available&&n.eligible&&h.eligible&&(n.direction===2&&h.direction===0||n.direction===0&&h.direction===2))conflict(['neural','hmm'],'HMM descrie un regim opus estimării Neural. HMM oferă context, fără vot de preț.');
  if(retryIds.length)addAction('recalculate','Recalculează rezultatele lipsă, expirate sau nereușite. Rapoartele încă actuale pe același istoric sunt reutilizate.');
  const temporary=cards.filter(c=>c.available&&['session','pending'].includes(c.persistence));
  if(temporary.length)notes.push({ids:temporary.map(c=>c.id),code:'retention',name:'Păstrarea rapoartelor',detail:temporary.some(c=>c.persistence==='pending')?'Salvarea de rezervă este în curs pentru unele rapoarte. Aceasta nu schimbă validarea modelelor.':'Unele rapoarte sunt disponibile doar în această sesiune. Descarcă rapoartele AI pentru păstrare; rezultatele calculate rămân disponibile.'});
 }
 const rows=ids=>ids.map(id=>{const c=byId[id];return {id,name:c.name,available:c.available,value:c.available?c.value:busy?'În așteptare':'Indisponibil',validation:c.available?LABELS[c.state]||'Interpretare indisponibilă':REJECTIONS[c.rejectionCode]||'Rezultat lipsă'};});
 const panels=[{id:'direction',title:'Direcție și interval · +5 sesiuni',note:'Estimări individuale. Concluzia finală cere toate verificările.',rows:rows(DIRECTIONS)},{id:'context',title:'Regim, anomalii și volatilitate',note:'HMM, Isolation și GARCH oferă context, fără voturi de preț.',rows:rows(CONTEXT)}];
 let title=busy?'Verificări în curs':!sourceVerified?'Date EOD necesare':retryIds.length?'Rezultate de recalculat':blockers.length?'Concluzie reținută':'Verificări încheiate';
 if(!busy&&sourceVerified&&!retryIds.length&&blockers.some(x=>x.remedy==='evidence'))title='Dovezi istorice insuficiente';
 if(!busy&&sourceVerified&&!retryIds.length&&blockers.some(x=>x.remedy==='review'))title='Estimări de revizuit';
 return {title,busy,available:cards.filter(c=>c.available).length,total:cards.length,retryIds,blockers,notes,actions,panels,explanation:'Raport actual înseamnă date și rezultat compatibile. Validarea istorică este afișată separat.'};
}
g.HoldingsVerdictDiagnostics={build};
})(typeof window!=='undefined'?window:globalThis);
