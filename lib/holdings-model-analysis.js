(function(g){
'use strict';
const VERSION='holdings-model-analysis-v1';
const CONFIG={
 quantile:{name:'Regresie cu cuantile · interval de preț',short:'Cuantile',purpose:'Estimează limitele și mediana închiderii peste cinci sesiuni. Obiectiv nominal: un interval de 80%, verificat separat pe trecut.',limits:'Acoperirea nominală și cea observată nu garantează acoperirea viitoare sau profitul. Intervalul privește închiderea la +5 sesiuni, fără maxime, minime sau traiectorie. Regresii liniare; știrile, earnings și FX lipsesc.'},
 neural:{name:'Rețea neuronală · ansamblu MLP',short:'Neural (MLP)',purpose:'Trei rețele estimează clasa mișcării închiderii după cinci sesiuni, față de ±1 ATR.',limits:'Scorurile nu reprezintă probabilitatea unui profit. Reantrenarea pe același istoric nu produce dovezi independente; știrile, earnings, FX și expunerea contului lipsesc.'},
 boosting:{name:'Gradient Boosting · arbori de decizie',short:'Gradient Boosting',purpose:'Arbori învățați pe aceiași indicatori și aceleași intervale ca Neural estimează Declin, Mixt sau Avans la cinci sesiuni.',limits:'Scorurile arborilor sunt necalibrate. Ponderea împărțirilor descrie antrenarea, fără explicație cauzală. Acordul cu Neural nu confirmă profitul.'},
 hmm:{name:'Hidden Markov Model · regimuri',short:'HMM',purpose:'Învață trei stări din trend și volatilitate, apoi descrie regimul indicatorilor pentru deținerea analizată.',limits:'Distribuția stărilor și indicatorul de schimbare aparțin modelului; nu sunt încredere în piață. Regimurile se pot relabela la reantrenare. NLL nu se compară cu loss-ul clasificatorilor.'},
 isolation:{name:'Isolation Forest · anomalii',short:'Isolation Forest',purpose:'Trei păduri caută sesiuni neobișnuite în preț, volum și volatilitate față de istoricul învățat.',limits:'Scorul nu măsoară riscul sau probabilitatea unei scăderi. Deviațiile nu stabilesc cauza. Rata de depășire fără etichete nu este acuratețe sau rată de alarme false.'}
};
const metric=(label,value,unit='',digits=2)=>({label,value:Number.isFinite(value)?value:null,unit,digits});
function accepted(snapshot,s,c,version){const r=snapshot?.record;return c?.available===true&&snapshot?.usable===true&&r?.symbol===s.symbol&&r.currency===s.currency&&r.asOf===s.asOf&&r.kind===s.kind&&Number.isFinite(r.trainedAt)&&r.trainedAt===c.trainedAt&&r.trainedAt<=s.generatedAt&&s.generatedAt-r.trainedAt<=1800000&&r.result?.version===version;}
function features(values,names,unit){return Array.isArray(values)?values.slice(0,names?.length||10).map((value,i)=>metric(names?.[i]||'Indicator '+(i+1),value,unit(i))):[];}
function build({summary:s,neural:n,hmm:h,isolation:a,quantile:q}={}){
 if(!['holdings-lab-summary-v1','holdings-lab-summary-v2'].includes(s?.version)||!Array.isArray(s.cards)||s.cards.length!==(s.version==='holdings-lab-summary-v2'?5:4))return null;
 const models=s.cards.map((c,i)=>{const cfg=CONFIG[c.id];return cfg?{id:c.id,...cfg,available:false,state:c.state,value:c.value,detail:c.detail,trainedAt:null,version:null,metrics:[],indicators:[],notes:[],...{index:i}}:null;});
 if(models.some(m=>!m))return null;
 const attach=(i)=>Object.assign(models[i],{available:true,trainedAt:s.cards[i].trainedAt,version:s.cards[i].version});
 if(accepted(n,s,s.cards[0],'holdings-mlp-v3')){
  const r=n.record.result,m=models[0];attach(0);
  m.metrics=[metric('Loss pe test',r.report?.test?.loss,'',3),metric('Acuratețe echilibrată · test',Number.isFinite(r.report?.test?.balanced)?r.report.test.balanced*100:null,'%',1),metric('Ferestre cu avantaj',r.walk?.summary?.wins,' / 3',0),metric('Distanță față de antrenare',r.maxZ,' σ',1)];
  m.indicators=features(r.latest,g.HoldingsNeural?.FEATURES,k=>k===7?'':k===9?'×':'%');
  m.notes=[n.comparison?.message||'Comparația cu Boosting nu este disponibilă.','Acuratețea privește etichetele istorice, nu tranzacții sau randamente.'];
  if(accepted(n,s,s.cards[1],'holdings-mlp-v3')&&r.comparison?.status==='evaluated'&&r.comparison.boosting?.version==='holdings-gbt-v1'){
   const b=r.comparison.boosting,x=models[1];attach(1);
   x.metrics=[metric('Loss pe test',b.report?.test?.loss,'',3),metric('Acuratețe echilibrată · test',Number.isFinite(b.report?.test?.balanced)?b.report.test.balanced*100:null,'%',1),metric('Ferestre cu avantaj',b.walk?.summary?.wins,' / 3',0),metric('Runde selectate',b.rounds,'',0)];
   x.indicators=Array.isArray(b.importance)?b.importance.map((share,i)=>({share,i})).filter(x=>Number.isFinite(x.share)&&x.share>0).sort((a,b)=>b.share-a.share).slice(0,3).map(x=>metric(g.HoldingsNeural?.FEATURES[x.i]||'Indicator '+(x.i+1),x.share*100,'%',1)):[];
   x.indicatorTitle='Indicatori folosiți în împărțirile arborilor';x.notes=['Ponderile sunt reduceri ale erorii în antrenare, fără contribuții cauzale.',n.comparison?.message||'Comparație indisponibilă.'];
  }
 }
 if(accepted(h,s,s.cards[2],'holdings-hmm-v1')){
  const r=h.record.result,m=models[2];attach(2);
  m.metrics=[metric('NLL HMM · test',r.report?.test?.hmm,'',3),metric('NLL fără tranziții',r.report?.test?.independent,'',3),metric('NLL Gaussiană unică',r.report?.test?.gaussian,'',3),metric('Observații consecutive',r.current?.streak,'',0)];
  m.indicators=features(r.latest,g.HoldingsHMM?.FEATURES,()=>'%');
  m.notes=['Separarea stărilor: '+(Number.isFinite(r.quality?.separation)?r.quality.separation.toFixed(2):'indisponibilă')+'.','Indicator de schimbare la observația următoare: '+(Number.isFinite(r.current?.switching)?(r.current.switching*100).toFixed(1)+'% în model.':'indisponibil.')];
 }
 if(accepted(a,s,s.cards[3],'holdings-isolation-v1')){
  const r=a.record.result,m=models[3];attach(3);
  m.metrics=[metric('Scor de anomalie · 0–1',r.current?.score,'',3),metric('Prag din referință',r.threshold,'',3),metric('Păduri peste pragul propriu',r.current?.votes,' / 3',0),metric('Indicatori în afara intervalului',r.current?.outside,' / 6',0)];
  m.indicators=Array.isArray(r.explanations)?r.explanations.slice(0,3).map(x=>({...metric(g.HoldingsIsolation?.FEATURES[x.feature]||'Indicator '+(x.feature+1),x.value,x.feature===4?'×':'%'),context:'Mediană: '+(Number.isFinite(x.median)?x.median.toFixed(2):'—')+(x.feature===4?'×':'%')+(x.outside?' · în afara intervalului':'')})):[];
  m.indicatorTitle='Deviații descriptive față de antrenare';m.notes=['Sesiuni peste prag în test: '+(Number.isInteger(r.report?.test?.flagged)?r.report.test.flagged:'—')+' / '+(Number.isInteger(r.report?.test?.n)?r.report.test.n:'—')+'. Nu sunt anomalii etichetate extern.'];
 }
 if(models[4]&&accepted(q,s,s.cards[4],'holdings-quantile-v1')){
  const r=q.record.result,m=models[4],t=r.report.test,c=r.current;attach(4);
  m.metrics=[metric('Acoperire observată · test',t.coverage*100,'%',1),metric('Închideri incluse · test',t.covered,' / '+t.n,0),metric('Lățime medie · test',t.width,' ATR'),metric('Scor de interval · test',t.score,' ATR',3)];
  m.notes=['Obiectiv nominal 80%; test recent '+t.covered+' / '+t.n+'. Control fără suprapunere: '+r.report.nonOverlap.covered+' / '+r.report.nonOverlap.n+'.',
   'Scor model '+t.score.toFixed(3)+' / reper '+r.report.baseline.score.toFixed(3)+' ATR. Mai mic este mai bun; penalizează lățimea și închiderile ratate.',
   'Ajustarea limitelor folosește '+r.calibration.rows.length+' orizonturi de referință separate, fără datele testului.',
   r.walk.status==='evaluated'?r.walk.wins+' / 3 ferestre cu scor mai bun decât cuantilele istorice simple.':'Trei ferestre indisponibile: '+r.walk.reason];
  if(m.state!=='drift'){
   m.chart={close:c.close,prices:c.prices.slice()};m.indicatorTitle='Estimarea închiderii la +5 sesiuni';
   m.indicators=[metric('Limită inferioară',c.prices[0],' '+s.currency),metric('Mediană',c.prices[1],' '+s.currency),metric('Limită superioară',c.prices[2],' '+s.currency),metric('Lățime față de EOD',c.widthPct,'%')];
  }
 }
 for(const m of models)if(!m.available){m.value='Rezultat indisponibil';m.detail='Lipsește un rezultat actual și verificat pentru acest instrument, monedă și sesiune. Rulează modelul în pagina analizei.';}
 return {version:VERSION,symbol:s.symbol,currency:s.currency,asOf:s.asOf,kind:s.kind,generatedAt:s.generatedAt,busy:s.busy,models};
}
g.HoldingsModelAnalysis={VERSION,build};
})(typeof window!=='undefined'?window:globalThis);
