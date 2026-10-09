import {browserAdapter,createController,GROUPS,MAX_BYTES} from '../../lib/system-backup.mjs?v=26.10.09.1822';

const $=id=>document.getElementById(id),cloud=()=>parent!==window?parent.TTCloud:null;
const privateStore=()=>parent!==window&&parent.TTCloudStore?parent.TTCloudStore:window.TTCloudStore;
const owner=async()=>{
  const durable=await privateStore().get('owner'),legacy=localStorage.getItem('tt_cloud_owner');
  if(durable!==null&&typeof durable!=='string'||durable&&legacy&&durable!==legacy)throw Error('Identitatea contului de pe acest dispozitiv este incompatibilă. Verifică Cont & sincronizare înainte de backup.');
  return durable||legacy||null;
};
const controller=createController(browserAdapter(),{owner});
let plan=null,busy=false,reading=0;
const labels={tt_journal_v1:'Jurnal manual',tt_journal_settings_v1:'Setări jurnal',tt_trading212_fills_v1:'Execuții Trading 212',tt_trading212_portfolio_v1:'Snapshot Trading 212',tt_trading212_account_history_v1:'Istoricul valorii contului',tt_trading212_cash_v1:'Depuneri, retrageri și dividende',tt_trading212_position_history_v1:'Istoricul pozițiilor',tt_trade_plans_v1:'Planuri de tranzacționare',trade_plans_v1:'Planuri anterioare',tt_trade_evidence_v1:'Analize înaintea intrării',tt_shadow_book_v1:'Simulări',tt_holdings_theses_v1:'Teze și repere de reevaluare',tt_holdings_symbols_v1:'Asocierea simbolurilor',tt_holdings_benchmarks_v1:'Benchmarkuri',tt_holdings_sector_benchmarks_v1:'Benchmarkuri sectoriale',tt_holdings_events_v1:'Evenimente dețineri',tt_holdings_alerts_v1:'Alerte dețineri',tt_holdings_regime_alerts_v1:'Schimbări de regim',tt_holdings_limits_v1:'Limite de concentrare',tt_holdings_visits_v1:'Istoricul vizitelor',tt_holdings_layout_v1:'Preferințe de afișare',tt_holdings_view_v1:'Vedere rapidă sau detaliată',tt_holdings_strategy_directory_v1:'Lista simulărilor',tt_europe_signals_v1:'Istoricul semnalelor Europa',tt_europe_risk_settings_v1:'Calculator risc Europa',wl_stocks:'Watchlist',tt_theme:'Temă',tt_pf_account:'Cont selectat',tt_ticket_capital:'Capital de lucru',tt_governor_cfg_v1:'Limite de risc',tt_equity_snapshots_v1:'Observații equity',tt_equity_events_v1:'Evenimente equity'};
const models={neural:'MLP și boosting',hmm:'HMM',isolation:'Isolation Forest',quantile:'Quantile',garch:'GARCH',knn:'KNN'};
const prefixes={forecast:'Estimări',forecast_restore:'Arhiva restaurărilor',strategy:'Simulare strategie',strategy_settings:'Setări strategie',account_risk:'Evaluare risc cont',account_risk_settings:'Limite risc cont',learning:'Învățare probabilistică',auto_learning:'Reantrenare automată',model_history:'Istoricul modelelor',roster:'Favorite și comparație',verdict_changes:'Schimbări de verdict'};
const fmt=n=>n.toLocaleString('ro-RO'),size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
function label(row) {
  const base=row.key.split(':')[0],suffix=row.key.slice(base.length+1);let name=labels[base];
  if(!name) {
    const type=base.replace('tt_holdings_','').replace('_v1','');name=models[type]||prefixes[type]||base.replace(/^tt_|_v1$/g,'').replaceAll('_',' ');
    try {const pieces=suffix.startsWith('[')?JSON.parse(suffix):suffix.split('|').map(decodeURIComponent);const ticker=pieces[2]||pieces[1];if(ticker&&typeof ticker==='string'&&ticker.length<60)name+=' · '+ticker.replace(/_US_EQ$/,'');} catch{}
  }
  return name+(row.target==='local'?'':' · copie separată');
}
function message(text) {$('backupMessage').textContent=text;}
function controls() {
  $('backupExport').disabled=busy;$('backupFile').disabled=busy;
  const selected=selection();$('backupApply').disabled=busy||!plan||!selected.length;
  $('backupSelection').textContent=plan?fmt(selected.length)+' registre selectate.':'';
}
function selection(){return [...$('backupPreview').querySelectorAll('input[data-backup-row]')].filter(e=>e.checked&&!e.disabled).map(e=>e.value);}
function changed() {
  const plans=plan?.rows.filter(r=>r.key==='tt_trade_plans_v1'&&!['same','invalid'].includes(r.status))||[];
  for(const group of $('backupPreview').querySelectorAll('input[data-backup-group]')) {
    const boxes=[...$('backupPreview').querySelectorAll('input[data-backup-row]')].filter(b=>b.dataset.group===group.value&&!b.disabled);
    group.checked=boxes.length>0&&boxes.every(b=>b.checked);group.indeterminate=boxes.some(b=>b.checked)&&!group.checked;
  }
  if(plans.length) for(const input of $('backupPreview').querySelectorAll('input[data-backup-row]')) input.onchange=()=> {
    if(plans.some(p=>p.id===input.value)) for(const box of $('backupPreview').querySelectorAll('input[data-backup-row]')) if(plans.some(p=>p.id===box.value))box.checked=input.checked;
    changed();
  };
  controls();
}
function renderPreview() {
  const host=$('backupPreview');host.replaceChildren();if(!plan)return;
  const planIsNew=plan.rows.filter(r=>r.key==='tt_trade_plans_v1').every(r=>r.status==='new');
  const heading=document.createElement('p');heading.textContent='Backup din '+new Date(plan.archive.exportedAt).toLocaleString('ro-RO')+' · v'+plan.archive.appVersion+' · '+size(plan.archive.manifest.bytes)+'.';host.append(heading);
  for(const [group,title] of Object.entries(GROUPS)) {
    const rows=plan.rows.filter(r=>r.group===group);if(!rows.length)continue;
    const detail=document.createElement('details');detail.className='backup-group';
    const summary=document.createElement('summary');summary.textContent=title+' · '+rows.length+' registre';detail.append(summary);
    const selectLabel=document.createElement('label');selectLabel.className='backup-check';const check=document.createElement('input');check.type='checkbox';check.dataset.backupGroup='';check.value=group;
    const text=document.createElement('span');text.textContent='Selectează registrele disponibile din această categorie';selectLabel.append(check,text);detail.append(selectLabel);
    check.onchange=()=>{for(const box of detail.querySelectorAll('[data-backup-row]'))if(!box.disabled)box.checked=check.checked;changed();};
    for(const row of rows) {
      const item=document.createElement('label');item.className='backup-row';const input=document.createElement('input');input.type='checkbox';input.dataset.backupRow='';input.dataset.group=group;input.value=row.id;input.checked=row.status==='new'&&(row.key!=='tt_trade_plans_v1'||planIsNew);input.disabled=['same','invalid'].includes(row.status);
      const body=document.createElement('span'),name=document.createElement('b'),status=document.createElement('small');name.textContent=label(row);
      status.textContent=({same:'Identic · se păstrează',new:'Lipsește local · poate fi adăugat',different:'Diferă · selectează explicit pentru restaurare',invalid:'Restaurare blocată'})[row.status]+(row.rows!==null?' · '+fmt(row.rows||0)+' înregistrări':'')+(row.error?' · '+row.error:'');
      body.append(name,status);item.append(input,body);detail.append(item);input.onchange=changed;
    }
    host.append(detail);
  }
  const invalid=plan.rows.filter(r=>r.status==='invalid').length;
  message('Integritate verificată. '+(invalid?invalid+' registre incompatibile rămân în fișier, cu importul blocat. ':'')+'Previzualizarea nu modifică datele.');changed();
}
function download(archive) {
  const blob=new Blob([JSON.stringify(archive)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='trading-tools-backup-'+new Date(archive.exportedAt).toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function state() {
  try {const s=await controller.status();$('backupUndo').disabled=busy||!s||['undone','rolled-back'].includes(s.state);$('backupRecovery').textContent=s?'Copia anterioară: '+new Date(s.at).toLocaleString('ro-RO')+' · '+({committed:'restaurare finalizată, poate fi anulată',undone:'restaurare anulată','rolled-back':'date anterioare recuperate',prepared:'restaurare întreruptă · recuperează copia',applying:'restaurare întreruptă · recuperează copia','recovery-needed':'recuperare parțială · există modificări ulterioare'})[s.state]:'';}catch(error){$('backupUndo').disabled=true;$('backupRecovery').textContent=error.message;}
}
async function run(fn) {if(busy)return;busy=true;controls();try {await fn();}catch(error){message(error.message);}finally{busy=false;controls();await state();}}
async function pause() {
  if(cloud()) await cloud().pauseForBackup();else await privateStore().put('backup-pause',true);
}
$('backupExport').onclick=()=>run(async()=> {
  message('Citesc toate registrele și modelele păstrate…');
  const archive=await controller.export({appVersion:parent!==window?parent.document.documentElement.dataset.appVersion||'':(await fetch('../version.json',{cache:'no-store'}).then(r=>r.json())).version,origin:location.origin});
  download(archive);message('Backup descărcat · '+fmt(archive.entries.length)+' registre · '+size(archive.manifest.bytes)+'. '+(archive.entries.some(e=>!e.valid)?'Include și copii incompatibile pentru recuperare; importul lor este blocat.':'Integritatea fiecărui registru este inclusă în manifest.'));
});
$('backupFile').onchange=async event=> {
  const file=event.target.files?.[0],token=++reading;plan=null;renderPreview();controls();if(!file)return;
  if(file.size>MAX_BYTES){message('Fișierul depășește limita de 128 MB.');return;}
  await run(async()=> {message('Verific backupul și compar cu datele acestui dispozitiv…');const next=await controller.preview(await file.text());if(token!==reading)return;plan=next;renderPreview();});
};
$('backupApply').onclick=()=>run(async()=> {
  const selected=selection();message('Păstrez copia anterioară și restaurez selecția…');await pause();
  const result=await controller.restore(plan,selected);plan=null;renderPreview();$('backupFile').value='';
  message(fmt(result.saved)+' registre restaurate. Reîncarcă aplicația pentru a reciti datele. Sincronizarea rămâne suspendată până la „Sincronizează acum”; poți anula restaurarea înainte.');$('backupReload').hidden=false;
});
$('backupUndo').onclick=()=>run(async()=> {
  await pause();const result=await controller.undo();plan=null;renderPreview();
  message(result.pending?'Recuperare parțială: '+result.pending+' registre au modificări ulterioare sau nu au putut fi salvate. Acestea au fost păstrate; copia anterioară rămâne disponibilă.':fmt(result.restored)+' registre recuperate. Sincronizarea rămâne suspendată până la verificarea datelor.');$('backupReload').hidden=false;
});
$('backupReload').onclick=()=>{if(parent!==window)parent.location.reload();else location.reload();};
state();controls();
