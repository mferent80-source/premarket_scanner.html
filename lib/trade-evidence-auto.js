/* Preserve research after a valid scan; never place orders or backdate evidence. */
(function(g){
'use strict';
const CACHE='ce_results_v2',E=g.TradeEvidence,V=g.TTDecisionVerdict,demo=new URLSearchParams(g.location.search).get('demo')==='1';
function parentController(){try{return g.parent!==g&&g.parent.location.origin===g.location.origin?g.parent.TTEntryAuto:null;}catch{return null;}}
const shared=parentController();let info={phase:demo?'demo':'waiting',message:demo?'DEMO FICTIV · capturarea automată în cont este dezactivată.':'Automat: aștept o scanare actuală și un snapshot Invest complet.',saved:0,total:0,lastAt:null},tail=Promise.resolve(),cache=null;
function state(){return demo?{...info}:shared?shared.state():{...info};}
function paint(){const node=g.document.getElementById('entryAutoStatus');if(node)node.textContent=state().message;}
function publish(next){info={...info,...next};paint();g.dispatchEvent(new CustomEvent('tt-entry-auto-state',{detail:state()}));g.document.querySelectorAll('iframe').forEach(f=>f.contentWindow?.postMessage({ttEntryAutoState:state()},g.location.origin));}
function fromCache(){try{return JSON.parse(g.localStorage.getItem(CACHE)||'null');}catch{return null;}}
async function captureIdentity(c,report,model,scope){
 const token=JSON.stringify([scope,V.sourceOf(c),c.mode,c.entryLow,c.entryHigh,c.stop,c.target,report.snapshotId,model?{generatedAt:model.generatedAt,cards:model.cards}:null]);
 const digest=await g.crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return 'auto_'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
function selection(input,now){
 if(!input||!Number.isFinite(input.updatedAt)||input.updatedAt>now||now-input.updatedAt>1800000)return [];
 const rows=[...(Array.isArray(input.momentum)?input.momentum:[]),...(Array.isArray(input.reversal)?input.reversal:[]),...(Array.isArray(input.analyses)?input.analyses:[])].filter(c=>c&&(c.kind||'market')==='market'&&c.currency==='USD'&&/^[A-Z0-9.-]+$/.test(c.symbol||'')&&V.sourceCurrent(c,now));
 rows.sort((a,b)=>Number(b.actionable===true)-Number(a.actionable===true)||(Number(b.score)||0)-(Number(a.score)||0)||String(a.mode).localeCompare(String(b.mode)));
 return [...new Map(rows.map(c=>[c.symbol,null])).keys()].map(symbol=>rows.find(c=>c.symbol===symbol));
}
function notify(before){const after=g.localStorage.getItem(E.KEY);if(before===after)return;const event=()=>new StorageEvent('storage',{key:E.KEY,oldValue:before,newValue:after,storageArea:g.localStorage,url:g.location.href});g.dispatchEvent(event());g.document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.dispatchEvent(event());}catch{}});}
async function run(input){
 const now=Date.now(),rows=selection(input,now);
 if(!rows.length){publish({phase:'waiting',message:'Automat: aștept candidați USD cu sursă și niveluri actuale.'});return;}
 const selected=g.T212Snapshot?.read('live'),scope=selected?.[0],snapshot=selected?.[1],positions=snapshot?.positions,baselineAt=Date.parse(snapshot?.fetchedAt);
 if(!scope||!g.T212Snapshot.fresh(snapshot,now)||!Number.isFinite(baselineAt)||baselineAt>now||!Array.isArray(positions)||positions.some(p=>!p||typeof p.ticker!=='string'||!Number.isFinite(p.quantity)||p.quantity<0)||new Set(positions.map(p=>p.ticker)).size!==positions.length){publish({phase:'account',message:'Automat: sincronizează Invest și lista completă a pozițiilor; nicio analiză nu se salvează cu un cont expirat sau incomplet.'});return;}
 let saved=0,already=0,skipped=0;const before=g.localStorage.getItem(E.KEY),risk=g.GV?.status?.()||null;
 try{
  for(const c of rows){
   const validation=await g.TTDecisionValidation?.getCandidate(c,scope),checkedAt=Date.now(),source=V.sourceOf(c),model=g.TTDecisionBridge?.find(source)||null,report=V.build({purpose:'entry',candidate:c,risk,ai:model,validation,validationScope:scope},checkedAt);
   if(!report.technical||report.code==='VERIFY'){skipped++;continue;}
   const id=await captureIdentity(c,report,model,scope),existing=E.read().entries.find(r=>r.id===id);
   if(existing){already++;continue;}
   // The broker account may change while hashing or another capture is saving.
   const latest=g.T212Snapshot.read('live');if(latest?.[0]!==scope||latest?.[1].fetchedAt!==snapshot.fetchedAt)throw Error('Contul sau snapshotul Invest s-a schimbat. Reiau verificarea la următoarea scanare.');
   const r=E.snapshot(c,report,model,{scope,baselineQuantity:positions.find(p=>p.ticker===c.symbol+'_US_EQ')?.quantity||0,baselineAt,id,now:Date.now()});
   if(!r){skipped++;continue;}
   try{await E.save(r);saved++;}catch(e){const winner=E.read().entries.find(x=>x.id===id);if(!winner)throw e;already++;}
  }
  const total=E.read().entries.filter(r=>r.scope===scope&&!r.simulation).length;
  publish({phase:'ready',saved:info.saved+saved,total,lastAt:saved?Date.now():info.lastAt,message:'Automat: '+(saved?saved+' analize noi păstrate':already?already+' analize deja păstrate':'nicio analiză validă de păstrat')+' · '+total+' pentru contul Invest.'+(skipped?' '+skipped+' excluse: date sau niveluri neverificate.':'')+' Originalele rămân fixe; numai un BUY ulterior poate primi asociere.'});
 }catch(e){publish({phase:'error',message:'Capturarea automată s-a oprit: '+e.message+' Verifică registrul din Performance Control și exportă analizele dacă spațiul este plin.'});}
 finally{notify(before);}
}
function observe(input){if(demo)return Promise.resolve();if(shared)return shared.observe(input);if(input)cache=input;const pending=tail.then(()=>run(cache||fromCache()));tail=pending.catch(e=>publish({phase:'error',message:'Capturarea automată nu a reușit: '+e.message}));return tail;}
g.TTEntryAuto={state,observe};
g.addEventListener('message',e=>{if(e.source===g.parent&&e.origin===g.location.origin&&e.data?.ttEntryAutoState)paint();});
g.addEventListener('tt-entry-auto-state',paint);
if(!demo&&!shared){g.addEventListener('tt-decision-ai-updated',()=>observe());g.addEventListener('storage',e=>{if(e.key===CACHE){cache=null;observe();}else if(e.key==='tt_trading212_portfolio_v1')observe();});observe();}
paint();
})(window);
