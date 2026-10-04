(function(g){
'use strict';
const F=g.HoldingsForecast,VERSION='holdings-forecast-monitor-v1',MODELS=Object.keys(F.VERSIONS),LABELS={blocked:'Date de verificat',missing:'Fără estimări',review:'De revizuit',waiting:'În așteptare',limited:'Eșantion mic',context:'Context descriptiv',monitor:'Monitorizare'};
const text=(v,n=100)=>typeof v==='string'&&v.length>0&&v.length<=n,finite=Number.isFinite;
function validLedger(d,e,now){return d?.ok===true&&Array.isArray(d.entries)&&d.entries.length<=F.MAX&&d.entries.every(r=>F.validEntry(r,e,now))&&new Set(d.entries.map(r=>r.id)).size===d.entries.length;}
function state(report,entries,check){
 if(check?.state==='error')return {state:'blocked',rank:7,reason:'Ultima actualizare nu a reușit. Raportul păstrat rămâne istoric.'};
 if(!entries.length)return {state:'missing',rank:2,reason:'Calculează și păstrează o estimare pe sesiunea EOD verificată.'};
 if(report.unverifiable)return {state:'review',rank:6,reason:report.unverifiable+' rezultate excluse; verifică sursa și ajustările.'};
 if(report.flags.underCoverage||report.flags.noEdge||report.flags.degraded)return {state:'review',rank:5,reason:report.warning};
 const latest=entries.slice().sort((a,b)=>a.source.t-b.source.t||a.capturedAt-b.capturedAt).at(-1);
 if(report.model==='isolation'&&['anomaly','uncertain'].includes(latest.estimate.label))return {state:'review',rank:5,reason:'Ultima observație salvată este '+(latest.estimate.label==='anomaly'?'o anomalie':'de graniță')+'; nu indică o direcție de preț.'};
 if(report.model==='hmm'&&latest.state!=='descriptive'&&latest.state!=='simulation')return {state:'review',rank:4,reason:'Ultimul context HMM salvat este neconcludent; reanalizează regimul.'};
 if(!report.n&&report.pending)return {state:'waiting',rank:3,reason:'Aștept închiderile la +5 sesiuni. Rezultatele lipsă nu sunt pierderi.'};
 if(report.descriptive)return {state:'context',rank:1,reason:report.warning};
 if(!report.flags.enough)return {state:'limited',rank:3,reason:report.warning};
 return {state:'monitor',rank:0,reason:report.warning};
}
function build(items,{scope,kind='market',model='quantile',filter='all',query='',sort='priority',now=Date.now()}={}){
 model=MODELS.includes(model)?model:'quantile';filter=['all','review','waiting','missing','ready'].includes(filter)?filter:'all';query=String(query).slice(0,100).trim().toLowerCase();
 const rows=[],seen=new Set();
 for(const item of Array.isArray(items)?items:[]){
  const e=item?.identity;if(!e||!text(e.ticker)||seen.has(e.ticker))continue;seen.add(e.ticker);
  const base={ticker:e.ticker,symbol:text(e.symbol,50)?e.symbol:null,currency:text(e.currency,12)?e.currency:null,asOf:typeof item.asOf==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.asOf)?item.asOf:null,model,lastForecast:null,lastCheck:null,reports:[],report:null,entries:0,checkState:['checking','checked','error','ignored'].includes(item.check?.state)?item.check.state:null};
  if(!F.identity(e)||e.scope!==scope||e.kind!==kind||!validLedger(item.ledger,e,now)){rows.push({...base,state:'blocked',label:LABELS.blocked,rank:8,reason:'Registre incompatibile, identitate incompletă sau date ilizibile. Datele existente sunt păstrate.'});continue;}
  const entries=item.ledger.entries.filter(r=>r.model===model),reports=F.report(item.ledger.entries),report=reports.find(r=>r.model===model),s=state(report,entries,item.check);
  const lastForecast=entries.length?entries.reduce((a,r)=>a&&a.source.asOf>r.source.asOf?a:r).source.asOf:null,checks=item.ledger.entries.map(r=>r.verification.checkedAt).filter(finite);
  rows.push({...base,...s,label:LABELS[s.state],reports,report,entries:entries.length,lastForecast,lastCheck:checks.length?Math.max(...checks):null});
 }
 const totals={positions:rows.length,withRegistry:rows.filter(r=>r.entries).length,withResults:rows.filter(r=>r.report?.n>0).length,review:rows.filter(r=>['review','blocked'].includes(r.state)).length,waiting:rows.filter(r=>r.report?.pending>0).length,missing:rows.filter(r=>r.state==='missing').length,blocked:rows.filter(r=>r.state==='blocked').length};
 const visible=rows.filter(r=>(!query||[r.ticker,r.symbol].some(v=>String(v||'').toLowerCase().includes(query)))&&(filter==='all'||filter==='review'&&['review','blocked'].includes(r.state)||filter==='waiting'&&r.report?.pending>0||filter==='missing'&&r.state==='missing'||filter==='ready'&&r.report?.n>0));
 visible.sort(sort==='ticker'?(a,b)=>(a.symbol||a.ticker).localeCompare(b.symbol||b.ticker):sort==='sample'?(a,b)=>(b.report?.n||0)-(a.report?.n||0)||b.rank-a.rank:(a,b)=>b.rank-a.rank||(a.symbol||a.ticker).localeCompare(b.symbol||b.ticker));
 return {version:VERSION,reviewOnly:true,generatedAt:now,kind,model,totals,rows,visible,filter,query,sort:['priority','ticker','sample'].includes(sort)?sort:'priority',limits:'Măsuri pe model și pe instrument. Nu însumăm orizonturile acțiunilor ca observații independente și nu calculăm un scor sau o acuratețe globală a portofoliului.'};
}
g.HoldingsForecastMonitor={VERSION,MODELS,LABELS,build};
})(typeof window!=='undefined'?window:globalThis);
