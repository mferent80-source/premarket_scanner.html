/* Shared evidence policy. Public technical evidence, risk permissions and AI remain distinct. */
(function(g){
'use strict';
const VERSION='decision-verdict-v1',MAX_AGE=1800000,finite=Number.isFinite;
const labels={up:'Ascendent',down:'Descendent',mixed:'Tranziție',unknown:'Neverificat'};
const MODEL_IDS=['neural','boosting','hmm','isolation','quantile','garch','knn'];
function hash(value){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16);}
function seriesKey(bars){if(!Array.isArray(bars)||bars.length<60)return null;const tail=bars.slice(-60);if(tail.some(b=>![b.t,b.o,b.h,b.l,b.c,b.v].every(finite)))return null;return 'ohlcv60:'+hash(tail.map(b=>[b.t,b.o,b.h,b.l,b.c,b.v]));}
function ema(values,n){if(values.length<n)return [];let v=values.slice(0,n).reduce((a,b)=>a+b,0)/n;const result=[v],k=2/(n+1);for(let i=n;i<values.length;i++){v=values[i]*k+v*(1-k);result.push(v);}return result;}
function trend(bars){
 if(!Array.isArray(bars)||bars.length<60||bars.some((b,i)=>!finite(b.c)||b.c<=0||!finite(b.t)||i>0&&b.t<=bars[i-1].t))return null;
 const c=bars.map(b=>b.c),a=ema(c,21),b=ema(c,50),d=ema(c,200),price=c.at(-1),ema21=a.at(-1),ema50=b.at(-1),ema200=d.at(-1)??null,slope21=(ema21/a.at(-6)-1)*100,slope50=(ema50/b.at(-6)-1)*100;
 const short=price>ema21&&slope21>0?'up':price<ema21&&slope21<0?'down':'mixed';
 const medium=price>ema50&&ema21>ema50&&slope50>0?'up':price<ema50&&ema21<ema50&&slope50<0?'down':'mixed';
 const long=ema200===null?'unknown':price>ema200&&ema50>ema200?'up':price<ema200&&ema50<ema200?'down':'mixed';
 const previousPrice=c.at(-6),previous21=a.at(-6),previous50=b.at(-6),previous200=d.at(-6)??null;
 const previousShort=previousPrice>previous21&&previous21>a.at(-11)?'up':previousPrice<previous21&&previous21<a.at(-11)?'down':'mixed';
 const previousMedium=b.length<11?'unknown':previousPrice>previous50&&previous21>previous50&&previous50>b.at(-11)?'up':previousPrice<previous50&&previous21<previous50&&previous50<b.at(-11)?'down':'mixed';
 const previousLong=previous200===null?'unknown':previousPrice>previous200&&previous50>previous200?'up':previousPrice<previous200&&previous50<previous200?'down':'mixed';
 return {version:VERSION,short,medium,long,price,ema21,ema50,ema200,slope21,slope50,ret5:(price/c.at(-6)-1)*100,ret20:(price/c.at(-21)-1)*100,historyKey:seriesKey(bars),comparison:{version:'trend-comparison-v1',sessions:5,short:previousShort,medium:previousMedium,long:previousLong,ret5:(previousPrice/c.at(-11)-1)*100}};
}
function trendDetail(x,t){
 if(!t)return null;
 const states=[t.short,t.medium,t.long],known=states.filter(s=>s!=='unknown'),up=known.filter(s=>s==='up').length,down=known.filter(s=>s==='down').length,atr=finite(x?.atr)&&x.atr>0?x.atr:null;
 const distance=atr===null?null:(t.price-t.ema21)/atr,move=atr===null||t.slope21<=-100?null:(t.ema21-t.ema21/(1+t.slope21/100))/atr;
 const regime=t.short==='up'&&t.medium==='up'?'Ascendent aliniat':t.short==='down'&&t.medium==='down'?'Descendent aliniat':t.short==='down'&&t.medium==='up'?'Retragere în trend ascendent':t.short==='up'&&t.medium==='down'?'Revenire în trend descendent':'Tranziție fără aliniere';
 const fragility=distance!==null&&distance>2?'Extins peste 2 ATR de EMA21':t.short==='up'&&t.medium==='up'&&t.long==='down'?'Trendul lung încă se opune revenirii':known.includes('mixed')?'Cel puțin un orizont este în tranziție':t.long==='unknown'?'Trendul lung cere minimum 200 închideri':'Urmărește EMA21 și EMA50 la închidere';
 const previous=t.comparison,valid=previous?.version==='trend-comparison-v1'&&previous.sessions===5&&['short','medium','long'].every(k=>Object.hasOwn(labels,previous[k]))&&finite(previous.ret5)&&previous.ret5>-100;
 const changes=valid?['short','medium','long'].filter(k=>previous[k]!==t[k]).map(k=>({horizon:k,from:previous[k],to:t[k]})):[];
 const acceleration=valid&&finite(t.ret5)?t.ret5-previous.ret5:null;
 return {regime,agreement:Math.max(up,down),known:known.length,total:3,bias:up>down?'up':down>up?'down':'mixed',fragility,distanceATR:distance,moveATR:move,pace:move===null?'Ritm neverificat':Math.abs(move)>=.5?'Mișcare amplă a EMA21':Math.abs(move)>=.15?'Mișcare moderată a EMA21':'Mișcare lentă a EMA21',comparison:valid?{sessions:5,changes,previousRet5:previous.ret5,acceleration}:null};
}
function probabilityVector(p){return Array.isArray(p)&&p.length===3&&p.every(v=>finite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-6;}
function probabilitySummary(p){
 if(!p||!probabilityVector(p.probabilities)||p.version!=='holdings-learning-v1'||p.horizon!==5||p.classIndex!==p.probabilities.indexOf(Math.max(...p.probabilities)))return null;
 const checkpoint=typeof p.checkpoint==='string'&&/^ensemble-[a-f0-9]{1,8}$/.test(p.checkpoint)?p.checkpoint:null;
 return {version:p.version,horizon:5,probabilities:p.probabilities.slice(),classIndex:p.classIndex,eligible:p.eligible===true&&!!checkpoint,checkpoint};
}
function probabilityDetail(model,rows){
 const estimates=[];
 if(model?.probabilistic){const p=probabilitySummary(model.probabilistic);if(p)estimates.push({id:'verdict',name:'Neural + Boosting',...p,calibration:p.eligible?'Combinație eligibilă în validarea temporală':'Combinație exploratorie sau suspendată'});}
 for(const c of model?.cards||[]){const p=c.id==='knn'?c.neighborSupport:c.probabilities;if(['neural','boosting','knn'].includes(c.id)&&probabilityVector(p))estimates.push({id:c.id,name:c.name||c.id,horizon:5,probabilities:p.slice(),classIndex:p.indexOf(Math.max(...p)),eligible:c.eligible===true,calibration:c.id==='knn'?'Frecvențe ale vecinilor · necalibrate':'Estimări individuale · necalibrate'});}
 return estimates.map(p=>{
  const ordered=p.probabilities.slice().sort((a,b)=>b-a),entropy=-p.probabilities.reduce((s,v)=>s+(v>0?v*Math.log(v):0),0)/Math.log(3),row=rows?.find(r=>r.model===p.id&&r.horizon===5),quality=row?.probability||null;
  const recent=row?.freshness?.needsCheck===false&&row.freshness.state!=='unknown',bin=quality?.bins?.[Math.min(4,Math.floor(ordered[0]*5))]||null;
  return {...p,gap:ordered[0]-ordered[1],entropy,separation:ordered[0]>=.45&&ordered[0]-ordered[1]>=.1?'Clasa dominantă se separă':'Clase apropiate · abținere probabilistică',quality:quality?{...quality,current:recent,canSupport:row.canSupport===true}:null,reliability:bin?.n>=10?bin:null};
 });
}
function sourceCurrent(x,now=Date.now()){
 if(!x||!finite(x.ts)||x.ts<=0||x.ts>now+60000||now-x.ts>MAX_AGE||!g.DailySeries)return false;
 try{return g.DailySeries.usable(x,now)===true;}catch{return false;}
}
function sourceOf(x){return x?{symbol:x.symbol,currency:x.currency,asOf:x.sourceDate,timezone:x.sourceTimezone,closeMinutes:x.sourceCloseMinutes,checkedAt:x.ts,kind:x.kind||'market',historyKey:x.trend?.historyKey||null}:null;}
function validTrend(t,x){
 if(t?.version!==VERSION||![t.price,t.ema21,t.ema50,t.slope21,t.slope50,x?.price].every(finite)||[t.price,t.ema21,t.ema50].some(n=>n<=0)||Math.abs(t.price-x.price)>Math.max(1e-8,x.price*1e-8)||!/^ohlcv60:[a-f0-9]{1,8}$/.test(t.historyKey||''))return false;
 const short=t.price>t.ema21&&t.slope21>0?'up':t.price<t.ema21&&t.slope21<0?'down':'mixed',medium=t.price>t.ema50&&t.ema21>t.ema50&&t.slope50>0?'up':t.price<t.ema50&&t.ema21<t.ema50&&t.slope50<0?'down':'mixed';
 if(t.ema200!==null&&(!finite(t.ema200)||t.ema200<=0))return false;
 const long=t.ema200===null?'unknown':t.price>t.ema200&&t.ema50>t.ema200?'up':t.price<t.ema200&&t.ema50<t.ema200?'down':'mixed';return t.short===short&&t.medium===medium&&t.long===long;
}
function modelSummary(report,source,now=Date.now()){
 if(!report||!source||!Array.isArray(report.cards)||report.cards.length!==MODEL_IDS.length||report.cards.some(c=>!c||typeof c!=='object')||report.available!==MODEL_IDS.length||report.total!==MODEL_IDS.length||report.symbol!==source.symbol||report.currency!==source.currency||report.asOf!==source.asOf||report.kind!==source.kind||!finite(report.generatedAt)||report.generatedAt>now||now-report.generatedAt>MAX_AGE)return null;
 const historyKey=seriesKey(source.bars);if(!historyKey)return null;
 const p=report.probabilistic,probabilistic=p?.symbol===source.symbol&&p.currency===source.currency&&p.asOf===source.asOf&&p.kind===source.kind&&!!source.fingerprint&&p.sourceFingerprint===source.fingerprint?probabilitySummary(p):null;
 return {symbol:report.symbol,currency:report.currency,asOf:report.asOf,kind:report.kind,historyKey,generatedAt:report.generatedAt,direction:[0,1,2].includes(report.direction)?report.direction:null,state:report.state,available:MODEL_IDS.length,total:MODEL_IDS.length,title:report.title,validatedProbability:probabilistic?.eligible===true,probabilistic,cards:report.cards.map(c=>({id:c.id,name:c.name,available:c.available===true,eligible:c.eligible===true,state:c.state,direction:c.direction,volatilityRatio:finite(c.volatilityRatio)?c.volatilityRatio:null,...(['neural','boosting'].includes(c.id)&&probabilityVector(c.probabilities)?{probabilities:c.probabilities.slice()}:{}),...(c.id==='knn'&&probabilityVector(c.neighborSupport)?{neighborSupport:c.neighborSupport.slice()}:{})}))};
}
function compatibleModel(model,source,now){return !!model&&!!source&&model.available===MODEL_IDS.length&&model.total===MODEL_IDS.length&&Array.isArray(model.cards)&&model.cards.length===MODEL_IDS.length&&MODEL_IDS.every(id=>model.cards.filter(c=>c?.id===id&&c.available===true).length===1)&&model.symbol===source.symbol&&model.currency===source.currency&&model.asOf===source.asOf&&model.kind===source.kind&&!!source.historyKey&&model.historyKey===source.historyKey&&finite(model.generatedAt)&&model.generatedAt<=now&&now-model.generatedAt<=MAX_AGE;}
function briefing(r,input){
 const x=input.candidate,t=r.technical,c=input.context||{},price=n=>finite(n)?n.toLocaleString('ro-RO',{maximumFractionDigits:4})+' '+(x?.currency||''):null;
 const supports=r.evidence.filter(e=>e.role==='support'&&!['source','risk','ai'].includes(e.id)).slice(0,3).map(e=>({id:e.id,text:e.label+': '+e.value}));
 const obstacles=[...r.blockers,...r.cautions].slice(0,3);
 let assessment,summary,confirmation,invalidation;
 if(!x){
  assessment=input.empty?.title||c.title||r.title;
  summary=input.empty?.reason||c.summary||r.blockers[0]?.text||c.next||r.scope;
  confirmation=input.empty?.next||c.next||r.nextSteps[0]?.text;
  invalidation=r.purpose==='market'?'Dacă sursele expiră sau participarea se deteriorează, reevaluează contextul înainte de orice plan.':null;
 }else{
  assessment=!t?'Trend încă neverificat':t.short==='up'&&t.medium==='up'?'Trend ascendent aliniat':t.short==='down'&&t.medium==='down'?'Trend descendent aliniat':t.short==='up'&&t.medium==='down'?'Revenire scurtă într-un trend mediu descendent':t.short==='down'&&t.medium==='up'?'Retragere scurtă într-un trend mediu ascendent':'Trend în tranziție';
  summary=x.symbol+': '+assessment.toLocaleLowerCase('ro-RO')+'. ';
  summary+=r.code==='VERIFY'?'Reanaliza este necesară înainte de folosirea acestor repere.':r.code==='BLOCKED'?'Planul nou este blocat: '+r.blockers[0]?.text:r.canPlan?'Structura permite verificarea unui plan condițional la prețul efectiv.':r.purpose==='holding'?'Revizuiește teza și reperele de risc ale deținerii.':'Așteaptă confirmarea; scorul scannerului nu este suficient pentru un plan.';
  if(r.purpose==='holding'){
   confirmation=t?'Urmărește închideri peste EMA21 ('+price(t.ema21)+') și EMA50 ('+price(t.ema50)+'), cu forță relativă și volum verificate.':'Reanalizează deținerea și verifică seria de prețuri.';
   invalidation=t?'O închidere sub EMA50 ('+price(t.ema50)+') împreună cu deteriorarea pantei cere revizuirea structurii. Acesta este un reper de analiză.':null;
   if(t?.medium==='down')invalidation='Structura medie este deja deteriorată. Verifică teza și limita de pierdere înainte de a adăuga expunere.';
  }else{
   const levels=[x.entryLow,x.entryHigh,x.stop,x.target].every(n=>finite(n)&&n>0)&&x.entryLow<=x.entryHigh&&x.stop<x.entryLow&&x.target>x.entryHigh;
   const trigger=finite(x.plan?.trigger)&&x.plan.trigger>0?x.plan.trigger:x.entryLow;
   confirmation=levels?(finite(x.plan?.trigger)?'Reper structural de confirmare: '+price(trigger)+'. ':'Repere pentru verificarea planului: ')+'zona de intrare '+price(x.entryLow)+'–'+price(x.entryHigh)+', țintă '+price(x.target)+'. '+(x.region==='EU'?'Verifică rezistența, calendarul și calculatorul în moneda instrumentului.':'Ținta este un reper calculat; verifică rezistența și execuția.'):'Recalculează o zonă de intrare, un stop și o țintă susținute de structură.';
   invalidation=levels?'La sau sub stopul '+price(x.stop)+', scenariul de intrare este invalidat. Peste '+price(x.entryHigh)+', recalculează raportul risc/randament; nu urmări prețul.':t?'Deteriorarea EMA21 și EMA50 cere un setup nou, pe date actualizate.':null;
   if(!r.canPlan)confirmation+=' Rezolvă întâi blocajele și confirmările de mai sus.';
  }
 }
 const next=r.purpose==='holding'&&!r.blockers.length?r.nextSteps.find(s=>s.id==='holding-review')?.text:null;
 return {assessment,summary,supports,obstacles,confirmation,invalidation,next:next||r.nextSteps.find(s=>s.id!=='ai'&&s.id!=='scope')?.text||confirmation||r.nextSteps[0]?.text||r.scope};
}
function build(input={},now=Date.now()){
 if(['entry','holding'].includes(input.purpose||'entry')&&!input.validation){let validationApi=g.TTDecisionValidation;try{if(g.parent!==g&&g.parent?.TTDecisionValidation)validationApi=g.parent.TTDecisionValidation;}catch{}if(validationApi){const validationScope=validationApi.activeScope();input={...input,validationScope,validation:validationApi.peekCandidate(input.candidate,validationScope)};}}
 const purpose=input.purpose||'entry',x=input.candidate||null,source=sourceOf(x),evidence=[],blockers=[],cautions=[],steps=[];
 const add=(id,label,value,role='unknown')=>evidence.push({id,label,value,role});
 const step=(id,text)=>{if(!steps.some(s=>s.id===id))steps.push({id,text});};
 const block=(id,text,next)=>{blockers.push({id,text});if(next)step(id,next);};
 const warn=(id,text,next)=>{cautions.push({id,text});if(next)step(id,next);};
 let code='VERIFY',title='Verificare necesară',canPlan=false,technical=null,model=null,probabilities=[];
 if(['operations','review','account','risk','market'].includes(purpose)){
  const c=input.context||{};
  for(const item of c.evidence||[])if(item&&typeof item.label==='string'&&['string','number'].includes(typeof item.value))add(item.id,item.label,item.value,item.role||'unknown');
  if(c.ready!==true)block('context',c.reason||'Datele necesare acestei pagini nu sunt încă verificate.',c.next||'Actualizează datele și verifică sursa.');
  if(c.blocked===true)block('permission',c.blockReason||'Limita de risc sau controlul de date blochează continuarea.',c.next||'Verifică blocajul înainte de continuare.');
  if(c.caution===true)warn('partial',c.cautionReason||'Acoperirea sau validarea este parțială.',c.next||'Verifică datele care lipsesc.');
  code=c.blocked?'BLOCKED':blockers.length?'VERIFY':c.caution?'CAUTION':'REVIEW';title=c.title||({market:'Context de piață verificat',risk:'Permisiunea de risc verificată',review:'Revizuire bazată pe date',account:'Snapshot de cont verificat',operations:'Stare operațională verificată'}[purpose]);
  if(blockers.length)title=c.blocked?'Continuare blocată':'Verificare necesară';
  step('scope',purpose==='market'?'Validează separat instrumentul și zona de intrare.':'Folosește această concluzie pentru scopul paginii; nu confirmă o intrare în piață.');
 }else if(!x){
  title=input.empty?.title||'Alege un instrument pentru verdict';
  block('selection',input.empty?.reason||'Nu există un instrument analizat în selecția curentă.',input.empty?.next||'Selectează un instrument sau rulează analiza paginii.');
 }else{
  const fresh=sourceCurrent(x,now),identity=!!x&&/^[A-Z0-9][A-Z0-9.^=-]{0,30}$/.test(x.symbol||'')&&/^[A-Z]{3}$/.test(x.currency||'')&&[undefined,'market','synthetic'].includes(x.kind);
  add('source','Sesiune sursă',fresh&&identity?x.sourceDate+' · '+x.currency:'Neverificată',fresh&&identity?'support':'unknown');
  if(!fresh||!identity){
   let why=!identity?'Identitatea instrumentului sau moneda nu este verificată.':!finite(x.ts)||x.ts>now+60000?'Ora analizei este invalidă.':now-x.ts>MAX_AGE?'Analiza a depășit cele 30 de minute; reperele trebuie reverificate.':'Sesiunea EOD '+(x.sourceDate||'lipsă')+' nu corespunde sesiunii încheiate a bursei.';
   block('source',why,'Rulează din nou analiza instrumentului; ora scanării nu înlocuiește data sursei.');
  }
  const t=x?.trend;
  technical=validTrend(t,x)?t:null;
  add('short','Trend scurt · EMA21',technical?labels[technical.short]:'Neverificat',technical?.short==='up'?'support':technical?'attention':'unknown');
  add('medium','Trend mediu · EMA50',technical?labels[technical.medium]:'Neverificat',technical?.medium==='up'?'support':technical?'attention':'unknown');
  add('long','Trend lung · EMA200',technical?labels[technical.long]:'Neverificat',technical?.long==='up'?'support':technical?.long==='unknown'||!technical?'unknown':'attention');
  if(!technical)block('technical','Analiza trendului trebuie recalculată cu politica actuală.','Reanalizează instrumentul pentru trendul pe cele trei orizonturi.');
  const rs=finite(x?.rs)?x.rs:null,volume=finite(x?.rvol)&&x.rvol>0?x.rvol:null;
  add('relative','Forță relativă · 20 sesiuni',rs===null?'Neverificată':rs.toFixed(2)+' pp',rs===null?'unknown':rs>=0?'support':'attention');
  add('volume','Volum relativ',volume===null?'Neverificat':volume.toFixed(2)+'×',volume===null?'unknown':volume>=1?'support':'attention');
  if(rs===null)warn('relative','Benchmarkul comparabil lipsește; clasamentul nu confirmă leadership-ul.','Actualizează indicele comparativ și verifică aceeași sesiune.');
  if(volume===null)warn('volume','Volumul relativ nu poate fi verificat.','Verifică seria de volume înainte de confirmare.');
  if(purpose==='entry'&&x?.mode==='momentum'&&volume!==null&&volume<1)warn('volume','Volumul este sub media sesiunilor anterioare; impulsul Long nu este confirmat.','Așteaptă participare peste medie și o analiză nouă.');
  if(technical&&finite(x?.atr)&&x.atr>0&&technical.price-technical.ema21>2*x.atr)warn('extension','Prețul este la peste 2 ATR de EMA21; intrarea poate fi extinsă.','Așteaptă un pullback sau o bază nouă și recalculează stopul.');
  if(technical?.short==='down'&&technical.medium==='down')warn('downtrend','Trendul scurt și mediu arată deteriorare.','Așteaptă stabilizare și o confirmare structurală.');
  if(x?.mode==='momentum'&&technical&&!(technical.short==='up'&&technical.medium==='up'))warn('alignment','Trendul pentru Long nu este aliniat pe orizonturile scurt și mediu.','Așteaptă realinierea prețului și a mediilor înainte de un plan Long.');
  if(x?.mode==='momentum'&&rs!==null&&rs<0)warn('lagging','Instrumentul rămâne sub benchmark pe 20 sesiuni.','Urmărește o îmbunătățire a forței relative.');
  if(purpose==='entry'&&x){
   const risk=input.risk||x?.governor;
   add('risk','Governor',risk?.verdict||'Neverificat',risk?.verdict==='TRADE'?'support':risk?.verdict==='CAUTION'?'attention':'unknown');
   if(!risk||!['TRADE','CAUTION'].includes(risk.verdict))block('risk','Governor nu permite risc nou sau nu poate fi verificat.','Verifică limitele din Risc & Capital.');
   if(risk?.verdict==='CAUTION')warn('risk-caution','Governor cere risc redus.','Păstrează limita calculată în pagina de dimensionare.');
   const levels=[x?.entryLow,x?.entryHigh,x?.stop,x?.target],valid=levels.every(v=>finite(v)&&v>0)&&x.entryLow<=x.entryHigh&&x.stop<x.entryLow&&x.target>x.entryHigh;
   const rr=valid?(x.target-x.entryHigh)/(x.entryHigh-x.stop):null;
   add('levels','R:R la limita intrării',rr===null?'Neverificat':rr.toFixed(2)+'R',rr!==null&&rr>=2-1e-9?'support':rr===null?'unknown':'attention');
   if(!valid)warn('levels','Intrarea, stopul sau ținta nu formează un plan verificabil.','Verifică structura și rezistența înainte de dimensionare.');
   else if(rr<2-1e-9)warn('reward','Ținta oferă sub 2R la limita superioară a zonei de intrare.','Recalculează nivelurile la prețul maxim permis și include costurile.');
   if(valid&&fresh&&technical&&technical.price<=x.stop)block('price-invalidated','Închiderea verificată este la sau sub stopul scenariului; planul vechi este invalidat.','Reanalizează structura și construiește un setup nou înainte de dimensionare.');
   else if(valid&&fresh&&technical&&technical.price>x.entryHigh)warn('price-extension','Închiderea depășește limita superioară a intrării; raportul risc/randament al planului vechi nu mai este utilizabil.','Așteaptă revenirea în zona validă sau recalculează intrarea, stopul și ținta.');
   const nativeReady=input.executionMode==='native'&&x.region==='EU'&&['growth','reversal'].includes(x.category)&&x.state==='ARMED'&&x.plan?.state==='CONFIRMED';
   if(x?.actionable!==true&&!nativeReady||x?.state==='BLOCKED')warn('setup','Setup-ul este încă de monitorizare sau nu permite un plan nou.',x.plan?.reason||'Așteaptă confirmarea cerută de scanner.');
   if(input.earnings?.blocked===true)block('earnings','Rezultatele financiare sunt în fereastra de blocare a setup-ului.','Așteaptă evenimentul și o analiză nouă.');
   if(input.earnings?.known===false)warn('earnings','Data rezultatelor financiare nu este confirmată.','Verifică data rezultatelor înainte de un plan.');
  }
  model=compatibleModel(input.ai,source,now)?input.ai:null;
  const v=input.validation,prospective=v?.ok===true&&v.identity?.scope===input.validationScope&&!!input.validationScope&&v.identity.symbol===x.symbol&&v.identity.currency===x.currency&&v.identity.kind===(x.kind||'market')&&!v.simulation&&finite(v.readAt)&&v.readAt<=now&&now-v.readAt<=60000&&Array.isArray(v.rows)?v.rows:null;
  const supported=prospective?.filter(r=>r.canSupport===true&&r.report?.flags?.enough&&r.freshness?.needsCheck===false)||[];
  probabilities=probabilityDetail(model,prospective);
  add('ai','Modele AI calculate',model?MODEL_IDS.length+' / '+MODEL_IDS.length+' · '+model.title:'Fără raport compatibil actual',Object.prototype.hasOwnProperty.call(input,'validation')?model?'attention':'unknown':model?.direction===2?'support':model?'attention':'unknown');
  if(Object.prototype.hasOwnProperty.call(input,'validation')){
   add('ai-prospective','Dovezi prospective',prospective?supported.length+' rapoarte cu avantaj observat și verificare actuală; '+prospective.filter(r=>r.report?.n>0).length+' / 9 cu rezultate. Vezi modelul, orizontul și reperul.':'Registrul original nu este încă disponibil pentru acest cont și instrument.','unknown');
   const negative=model&&prospective?.filter(r=>['neural','boosting','knn','quantile','garch'].includes(r.model)&&model.cards.some(c=>c.id===r.model&&c.eligible)&&r.report?.flags?.enough&&r.freshness?.needsCheck===false&&(r.report.flags.noEdge||r.report.flags.degraded||r.report.flags.underCoverage));
   if(negative?.length)warn('ai-validation',negative.map(r=>r.model.toUpperCase()+' / '+r.horizon+' sesiuni: '+r.report.warning).join(' '),'Revizuiește rezultatele prospective față de repere; nu folosi aceste modele drept confirmare a planului.');
   const poor=probabilities.filter(p=>p.eligible&&p.quality?.current&&p.quality.enough&&(p.quality.noEdge||p.quality.degraded));
   if(poor.length)warn('ai-probability',poor.map(p=>p.name+': '+(p.quality.noEdge?'probabilitățile păstrate nu depășesc reperul cronologic în ambele scoruri (Brier și log loss).':'scorurile probabilităților s-au deteriorat între ultimele două blocuri de 20 rezultate.')).join(' '),'Revizuiește probabilitățile observate; un procent mare nu confirmă singur scenariul.');
  }
  if(model&&(model.direction===0&&technical?.medium==='up'||model.direction===2&&technical?.medium==='down'))warn('ai-conflict','Modelele AI verificate și trendul mediu indică direcții opuse.','Reanalizează modelele și verifică evenimentele; nu transforma dezacordul într-o confirmare.');
  if(model&&['conflict','caution','weak'].includes(model.state))warn('ai-quality','Modelele AI semnalează conflict, validare insuficientă sau o observație neobișnuită.','Verifică diagnosticul din Analiza deținerilor → Verdict AI.');
  if(model?.state?.endsWith('-volatile'))warn('volatility','GARCH validat cere prudență suplimentară pentru volatilitate.','Reevaluează distanța la stop și bugetul în pagina de risc.');
  if(input.breadth&&!input.breadth.stale){const b=input.breadth;add('breadth','Participarea pieței',b.stance,b.partial?'attention':'support');if(/RISK-OFF|PRUDEN/i.test(b.stance||''))warn('breadth','Participarea pieței este defensivă.','Selectează strict și verifică riscul permis de Desk.');}
  if(blockers.length){code=blockers.some(b=>['risk','earnings','price-invalidated'].includes(b.id))?'BLOCKED':'VERIFY';title=code==='BLOCKED'?'Plan nou blocat':'Date de verificat';}
  else if(purpose==='holding'){code=cautions.length?'CAUTION':'REVIEW';title=technical?.medium==='down'?'Deținerea cere revizuire':technical?.medium==='up'?'Trend susținut · monitorizează teza':'Deținere în tranziție';}
  else if(cautions.some(c=>c.id!=='risk-caution'&&c.id!=='breadth')){code='WATCH';title='Monitorizare · confirmare incompletă';}
  else{canPlan=true;code=cautions.length?'CAUTION':'PLAN';title=cautions.length?'Plan condițional · risc redus':'Plan condițional verificabil';step('plan',input.executionMode==='native'?'Folosește calculatorul Europa în moneda instrumentului; verifică prețul, costurile și cursul. Desk-ul USD rămâne separat.':'Deschide dimensionarea și verifică prețul efectiv, moneda, stopul, costurile și expunerea brokerului.');}
  if(!model)step('ai','Pentru modelele calculate, deschide Verdict AI pe instrumentul asociat din Analiza deținerilor.');
  if(purpose==='holding')step('holding-review','Compară structura cu teza, evenimentele și limita de risc înainte de a adăuga expunere.');
  if(purpose==='entry'&&!canPlan&&!blockers.length)step('recheck','Rulează o analiză nouă după confirmarea structurii; verifică din nou toate condițiile planului.');
 }
 const result={version:VERSION,purpose,setup:x?.mode||x?.category||null,code,title,canPlan,symbol:x?.symbol||null,source,technical,trendDetail:trendDetail(x,technical),probabilities,model,evidence,blockers,cautions,nextSteps:steps,checkedAt:now,coverage:{known:evidence.filter(e=>e.role!=='unknown').length,total:evidence.length},scope:purpose==='entry'?'Scenariu și permisiune pentru un plan; prețurile EOD nu confirmă execuția.':purpose==='holding'?'Evaluare a structurii și modelelor; teza și riscul contului se verifică separat.':'Concluzie pentru scopul paginii, fără semnal automat de intrare.'};
 result.briefing=briefing(result,input);
 // Probability observations are account-local diagnostics. They affect the snapshot
 // only through an actual policy caution, so background rechecks do not cancel AI.
 result.snapshotId=VERSION+':'+hash({...result,checkedAt:undefined,probabilities:probabilities.map(p=>({...p,quality:undefined,reliability:undefined})),model:model?{...model,generatedAt:undefined}:null});return result;
}
function publicFacts(report){const ids=['source','short','medium','long','relative','volume','levels','ai','breadth','date','coverage','participation','market-trend','sectors'];return {snapshotId:report.snapshotId,verdictCode:report.code,purpose:report.purpose,symbol:report.symbol,source:report.source?{asOf:report.source.asOf,currency:report.source.currency,kind:report.source.kind}:null,trend:report.technical?Object.fromEntries(['short','medium','long','price','ema21','ema50','ema200','ret5','ret20'].map(k=>[k,report.technical[k]])):null,evidence:report.evidence.filter(e=>ids.includes(e.id)),nextSteps:report.nextSteps.filter(s=>!['risk','risk-caution','holding-review','ai-validation','ai-probability'].includes(s.id))};}
function explanation(text,report){let data;try{data=JSON.parse(String(text).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));}catch{throw Error('Răspuns AI incompatibil. Verdictul calculat rămâne disponibil.');}
 const facts=publicFacts(report),ids=new Set(facts.evidence.map(e=>e.id)),next=new Set(facts.nextSteps.map(e=>e.id));
 const prose=s=>typeof s==='string'&&s.trim().length>0&&s.length<=800&&!/[0-9]|https?:|<|>/.test(s);
 if(!data||data.snapshotId!==report.snapshotId||data.verdictCode!==report.code||data._partial||!prose(data.summary)||!Array.isArray(data.priorities)||!data.priorities.length||data.priorities.length>4||data.priorities.some(p=>!prose(p.comment)||!Array.isArray(p.evidenceIds)||!p.evidenceIds.length||p.evidenceIds.some(id=>!ids.has(id))||!Array.isArray(p.nextStepIds)||p.nextStepIds.some(id=>!next.has(id))))throw Error('Explicația AI nu corespunde dovezilor sau verdictului curent. Reîncearcă.');
 return {summary:data.summary,priorities:data.priorities.map(p=>({comment:p.comment,evidenceIds:p.evidenceIds,nextStepIds:p.nextStepIds})),modelExplanation:true,snapshotId:report.snapshotId};
}
g.TTDecisionVerdict={VERSION,MAX_AGE,trend,trendDetail,probabilityVector,probabilitySummary,probabilityDetail,seriesKey,sourceOf,sourceCurrent,modelSummary,compatibleModel,build,publicFacts,explanation,hash};
})(typeof window!=='undefined'?window:globalThis);
