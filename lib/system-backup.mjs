import './daily-series.js?v=26.10.09.1822';
import './holdings-forecast.js?v=26.10.09.1822';
import './holdings-forecast-storage.js?v=26.10.09.1822';
import './holdings-strategy.js?v=26.10.09.1822';
import './holdings-account-risk.js?v=26.10.09.1822';
import './trade-plan-store.js?v=26.10.09.1822';
import {KEYS as CLOUD_KEYS, validateValue} from './cloud-sync-model.mjs?v=26.10.09.1822';

// Explicit data addresses only. Credentials, sessions, cloud baselines, quote caches
// and executable/network configuration are never visited by this module.
export const FORMAT = 'tt-system-backup-v1';
export const MAX_BYTES = 128 * 1024 * 1024;
export const GROUPS = Object.freeze({
  trading:'Cont, execuții și jurnal', plans:'Planuri și simulări',
  holdings:'Dețineri și preferințe', models:'Rapoarte modele AI',
  research:'Estimări și validări', settings:'Setări și watchlist'
});
const fixed = {
  trading:['tt_journal_v1','tt_journal_settings_v1','tt_trading212_fills_v1','tt_trading212_portfolio_v1','tt_trading212_account_history_v1','tt_trading212_cash_v1','tt_trading212_position_history_v1','tt_equity_snapshots_v1','tt_equity_events_v1','tt_mfx_journal_v1'],
  plans:['tt_trade_plans_v1','trade_plans_v1','tt_trade_evidence_v1','tt_shadow_book_v1'],
  holdings:['tt_holdings_theses_v1','tt_holdings_symbols_v1','tt_holdings_benchmarks_v1','tt_holdings_sector_benchmarks_v1','tt_holdings_events_v1','tt_holdings_alerts_v1','tt_holdings_regime_alerts_v1','tt_holdings_limits_v1','tt_holdings_visits_v1','tt_holdings_layout_v1','tt_holdings_view_v1'],
  research:['tt_holdings_strategy_directory_v1'],
  settings:['tt_theme','tt_pf_account','tt_pf_riskpct','tt_ticket_capital','tt_account_size_v1','tt_governor_cfg_v1','tt_europe_signals_v1','tt_europe_risk_settings_v1','wl_stocks','wl_price_alerts','wl_sound','tt_decision_models_v1','tt_decision_ai_model','tt_morning_check_v1']
};
const prefixes = {
  holdings:['tt_holdings_roster_v1:','tt_holdings_verdict_changes_v1:'],
  models:['tt_holdings_neural_v1:','tt_holdings_hmm_v1:','tt_holdings_isolation_v1:','tt_holdings_quantile_v1:','tt_holdings_garch_v1:','tt_holdings_knn_v1:'],
  research:['tt_holdings_forecast_v1:','tt_holdings_forecast_restore_v1:','tt_holdings_strategy_v1:','tt_holdings_strategy_settings_v1:','tt_holdings_account_risk_v1:','tt_holdings_account_risk_settings_v1:','tt_holdings_learning_v1:','tt_holdings_auto_learning_v1:','tt_holdings_model_history_v1:']
};
const stores = {
  plans:{database:'tt_trade_plans_store_v1',store:'register'},
  models:{database:'tt_holdings_ai_reports_v1',store:'reports'},
  history:{database:'tt_holdings_forecasts_v1',store:'history'}
};
const rawKeys = new Set(['tt_theme','tt_pf_account','tt_ticket_capital','tt_pf_riskpct','tt_account_size_v1','wl_sound','tt_decision_ai_model']);
const bytes = x => new TextEncoder().encode(x).length;
const json = x => JSON.stringify(x);
const clone = x => JSON.parse(json(x));
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x,k));
const id = e => json([e.target,e.key]);
const valueEqual = (a,b) => json(a) === json(b);
const fail = message => { throw Error(message); };

export function groupFor(target,key) {
  if(typeof key !== 'string' || !key || key.length > 2000) return null;
  let group = Object.keys(fixed).find(g => fixed[g].includes(key)) || Object.keys(prefixes).find(g => prefixes[g].some(p => key.startsWith(p) && key.length > p.length));
  if(target === 'local') return group || null;
  if(target === 'plans') return key === 'tt_trade_plans_v1' ? 'plans' : null;
  if(target === 'models') return group === 'models' ? group : null;
  if(target === 'history') return group === 'research' ? group : null;
  return null;
}
export async function digest(text) {
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2,'0')).join('');
}
function parse(raw) {
  return JSON.parse(raw,(k,v) => {
    if(['__proto__','constructor','prototype'].includes(k)) fail('Proprietate JSON incompatibilă.');
    return v;
  });
}
function payload(entry) {
  if(entry.target === 'plans') {
    const r = entry.value;
    if(!exact(r,['revision','raw','localRaw']) || !Number.isSafeInteger(r.revision) || r.revision < 1 || r.revision >= Number.MAX_SAFE_INTEGER || ![r.raw,r.localRaw].every(x => x === null || typeof x === 'string')) fail('Copia planurilor este incompatibilă.');
    for(const raw of [r.raw,r.localRaw]) if(raw !== null && !Array.isArray(parse(raw))) fail('Lista planurilor este incompatibilă.');
    return r.raw === null ? [] : parse(r.raw);
  }
  if(typeof entry.value !== 'string' || bytes(entry.value) > 64 * 1024 * 1024) fail('Registru incompatibil sau prea mare.');
  if(rawKeys.has(entry.key)) return entry.value;
  return parse(entry.value);
}
function identity(key,prefix='tt_holdings_forecast_v1:') {
  return globalThis.HoldingsForecastStorage.identity(key.replace(prefix,'tt_holdings_forecast_v1:'));
}
function check(entry,now=Date.now()) {
  try {
    if(!groupFor(entry.target,entry.key)) fail('Registrul nu face parte din backup.');
    const value = payload(entry);
    if(CLOUD_KEYS.includes(entry.key)) validateValue(entry.key,value);
    if(entry.key.startsWith('tt_holdings_forecast_v1:')) {
      const e = identity(entry.key), F=globalThis.HoldingsForecast;
      if(!e || !exact(value,['version','entries']) || value.version !== F.VERSION || !Array.isArray(value.entries) || value.entries.length > F.MAX || value.entries.some(r => !F.validEntry(r,e,now)) || new Set(value.entries.map(r => r.id)).size !== value.entries.length) fail('Registru de estimări incompatibil.');
    } else if(entry.key.startsWith('tt_holdings_strategy_v1:')) {
      globalThis.HoldingsStrategy.document(entry.value,globalThis.HoldingsStrategy.identity(entry.key),now);
    } else if(entry.key.startsWith('tt_holdings_account_risk_v1:')) {
      globalThis.HoldingsAccountRisk.document(entry.value,globalThis.HoldingsAccountRisk.identity(entry.key),now);
    } else if(entry.key === 'tt_holdings_strategy_directory_v1') {
      globalThis.HoldingsStrategy.directory(entry.value);
    } else if(entry.key.startsWith('tt_holdings_strategy_settings_v1:')) {
      if(!globalThis.HoldingsStrategy.validSettings(value)) fail('Setări de simulare incompatibile.');
    } else if(entry.key.startsWith('tt_holdings_account_risk_settings_v1:')) {
      if(!globalThis.HoldingsAccountRisk.validSettings(value)) fail('Limite de risc incompatibile.');
    } else if(groupFor(entry.target,entry.key) === 'models') {
      if(!object(value) || !object(value.result) || typeof value.result.version !== 'string' || !Number.isFinite(value.trainedAt) || value.trainedAt <= 0 || value.trainedAt > now || typeof value.symbol !== 'string' || typeof value.currency !== 'string') fail('Raport model incompatibil.');
      const model=entry.key.slice('tt_holdings_'.length).split('_v1:')[0];
      if(value.result.version!==globalThis.HoldingsForecast.VERSIONS[model]) fail('Versiunea raportului modelului este incompatibilă.');
    } else if(!rawKeys.has(entry.key) && !object(value) && !Array.isArray(value)) {
      if(entry.key !== 'tt_holdings_view_v1' || !['quick','full'].includes(value)) fail('Structură de registru incompatibilă.');
    }
    return {valid:true,error:null,rows:countRows(value)};
  } catch(error) { return {valid:false,error:error.message,rows:null}; }
}
function countRows(value) {
  if(Array.isArray(value)) return value.length;
  if(Array.isArray(value?.entries)) return value.entries.length;
  if(object(value?.accounts)) return Object.values(value.accounts).reduce((n,a) => n+(a?.items?.length||0),0);
  if(object(value)) return Object.keys(value).length;
  return 1;
}
function manifest(entries) {
  return entries.map(e => [e.target,e.key,e.bytes,e.sha256]);
}
export async function createArchive(snapshot,{owner=null,appVersion='',origin='',now=Date.now()}={}) {
  const entries = [];
  for(const e of snapshot) {
    const group = groupFor(e.target,e.key);
    if(!group) continue;
    const content = json(e.value);
    entries.push({...clone(e),group,bytes:bytes(content),sha256:await digest(content),...check(e,now)});
  }
  entries.sort((a,b) => id(a).localeCompare(id(b)));
  if(entries.length>10000) fail('Backupul depășește limita de 10.000 registre.');
  if(new Set(entries.map(id)).size !== entries.length) fail('Adrese duplicate în backup.');
  const archive = {format:FORMAT,exportedAt:now,appVersion,origin,owner,entries,manifest:{entries:entries.length,bytes:entries.reduce((n,e) => n+e.bytes,0),sha256:await digest(json(manifest(entries)))}};
  if(bytes(json(archive)) > MAX_BYTES) fail('Backupul depășește 128 MB. Exportă și registrele individuale din Analiza deținerilor.');
  return archive;
}
export async function readArchive(raw,{owner=null,now=Date.now()}={}) {
  if(typeof raw !== 'string' || bytes(raw) > MAX_BYTES) fail('Backupul depășește limita de 128 MB.');
  const a = parse(raw);
  if(!exact(a,['format','exportedAt','appVersion','origin','owner','entries','manifest']) || a.format !== FORMAT || !Number.isFinite(a.exportedAt) || a.exportedAt <= 0 || a.exportedAt > now+60000 || typeof a.appVersion !== 'string' || a.appVersion.length > 100 || typeof a.origin !== 'string' || a.origin.length > 1000 || a.owner !== null && (typeof a.owner !== 'string' || !a.owner || a.owner.length > 500) || !Array.isArray(a.entries) || a.entries.length > 10000 || !exact(a.manifest,['entries','bytes','sha256'])) fail('Format de backup incompatibil.');
  if(a.owner && a.owner !== owner) fail('Backupul aparține unui cont Google diferit sau acest dispozitiv nu are încă același cont. Conectează contul corect înainte de restaurare.');
  if(new Set(a.entries.map(id)).size !== a.entries.length) fail('Backupul conține adrese duplicate.');
  for(const e of a.entries) {
    if(!exact(e,['target','key','value','group','bytes','sha256','valid','error','rows']) || !groupFor(e.target,e.key) || groupFor(e.target,e.key) !== e.group || typeof e.valid !== 'boolean' || e.error !== null && typeof e.error !== 'string') fail('Backupul conține o adresă sau metadate incompatibile.');
    const content = json(e.value);
    if(bytes(content) !== e.bytes || await digest(content) !== e.sha256) fail('Integritatea backupului nu corespunde. Registrul modificat nu a fost importat.');
  }
  if(a.manifest.entries !== a.entries.length || a.manifest.bytes !== a.entries.reduce((n,e) => n+e.bytes,0) || a.manifest.sha256 !== await digest(json(manifest(a.entries)))) fail('Manifestul backupului nu corespunde conținutului.');
  // The manifest detects accidental changes. It is not a signature or proof
  // that an observation was actually captured before its outcome.
  return {...a,entries:a.entries.map(e => ({...e,...check(e,now)}))};
}
function imported(entry,before,now) {
  if(!entry.key.startsWith('tt_holdings_forecast_v1:')) {
    if(entry.key.startsWith('tt_holdings_strategy_v1:')) {
      const d=parse(entry.value),local=globalThis.HoldingsStrategy.document(before,globalThis.HoldingsStrategy.identity(entry.key),now);
      const rows=new Map(local.entries.map(r=>[r.id,r]));
      for(const r of d.entries) if(!rows.has(r.id)) {r.verification={state:'unverifiable',checkedAt:null,sessions:0,reason:'Simulare restaurată; rezultatul nu dovedește momentul capturii. Verdictul original trebuie reverificat.'};rows.set(r.id,r);}
      const value=json({version:d.version,entries:[...rows.values()]});
      globalThis.HoldingsStrategy.document(value,globalThis.HoldingsStrategy.identity(entry.key),now);
      return value;
    }
    return clone(entry.value);
  }
  const e=identity(entry.key), incoming=parse(entry.value), local=before === null ? {version:incoming.version,entries:[]} : parse(before);
  if(!check({...entry,value:json(local)},now).valid) fail('Registrul local de estimări este incompatibil. Exportă-l și folosește recuperarea individuală.');
  const rows=new Map(local.entries.map(r => [r.id,r]));
  for(const r of incoming.entries) if(!rows.has(r.id)) {
    const restored=clone(r); restored.restoredAt=now;
    restored.verification={state:restored.outcome ? 'unverifiable':'pending',checkedAt:null,sessions:0,reason:'Estimare restaurată; rezultatul cere reverificarea sursei publice.'};
    rows.set(r.id,restored);
  }
  const value=json({version:globalThis.HoldingsForecast.VERSION,entries:[...rows.values()].sort((a,b) => a.source.t-b.source.t || a.id.localeCompare(b.id))});
  if(!check({...entry,value},now).valid || bytes(value) > globalThis.HoldingsForecast.MAX_BYTES) fail('Registrul de estimări este plin sau incompatibil.');
  return value;
}

// Controller depends on a narrow adapter, allowing the same failure and
// concurrent-write scenarios to be tested without replacing browser code.
export function createController(adapter,{owner=async()=>null,now=Date.now}={}) {
  const previews=new WeakMap();
  async function preview(raw) {
    const at=now(), account=await owner(), archive=await readArchive(raw,{owner:account,now:at}), current=await adapter.snapshot(), byId=new Map(current.map(e => [id(e),e.value]));
    const rows=archive.entries.map(e => {
      const before=byId.has(id(e)) ? byId.get(id(e)) : null;
      let error=e.error,after=null;
      if(e.valid) try {after=imported(e,before,at);} catch(err) {error=err.message;}
      return {...e,id:id(e),before,after,status:error?'invalid':valueEqual(before,e.value)?'same':before===null?'new':'different',error};
    });
    // Importing plan register and legacy mirror is one coherent selection.
    let plans=rows.filter(e => e.key==='tt_trade_plans_v1');
    if(plans.length && plans.every(e=>e.valid)) {
      try {
        const local=plans.find(e=>e.target==='local')?.value??null, durable=plans.find(e=>e.target==='plans')?.value??null;
        const effective=globalThis.TTPlanStore.reconcile(durable,local).raw;
        for(const target of ['local','plans']) {
          let row=plans.find(e=>e.target===target);
          const before=byId.get(id({target,key:'tt_trade_plans_v1'}))??null;
          const after=target==='local'?effective:{revision:(before?.revision||0)+1,raw:effective,localRaw:effective};
          if(!row) {row={target,key:'tt_trade_plans_v1',id:id({target,key:'tt_trade_plans_v1'}),group:'plans',before,valid:true,error:null,rows:payload({target:'local',key:'tt_trade_plans_v1',value:effective??'[]'}).length};rows.push(row);}
          row.after=after;row.status=valueEqual(before,after)?'same':before===null?'new':'different';
        }
      } catch(error) {for(const row of plans){row.status='invalid';row.error=error.message;}}
      plans=rows.filter(e=>e.key==='tt_trade_plans_v1');
    }
    const publicPlan={archive,rows};
    previews.set(publicPlan,{rows:clone(rows),owner:account,pairs:plans.filter(e=>e.status!=='same').map(e=>e.id)});
    return publicPlan;
  }
  async function restore(plan,selected) {
    const saved=previews.get(plan);
    if(!saved || !Array.isArray(selected) || new Set(selected).size !== selected.length || !selected.length) fail('Selectează registre din previzualizarea curentă.');
    if(await owner() !== saved.owner) fail('Contul s-a schimbat. Reîncarcă previzualizarea.');
    const chosen=saved.rows.filter(e => selected.includes(e.id));
    if(chosen.length !== selected.length || chosen.some(e => ['same','invalid'].includes(e.status))) fail('Selecție de restaurare incompatibilă.');
    if(saved.pairs.some(k => selected.includes(k)) && saved.pairs.some(k => !selected.includes(k))) fail('Selectează împreună copiile registrului planurilor.');
    const changes=chosen.map(e => ({target:e.target,key:e.key,before:e.before,after:e.after}));
    return adapter.exclusive(async() => {
      if(await owner() !== saved.owner) fail('Contul s-a schimbat. Reîncarcă previzualizarea.');
      const current=new Map((await adapter.snapshot()).map(e => [id(e),e.value]));
      if(changes.some(e => !valueEqual(current.get(id(e))??null,e.before))) fail('Datele s-au modificat după previzualizare. Alege din nou fișierul; nimic nu a fost înlocuit.');
      const previous=await adapter.recovery();
      if(previous && !['committed','undone','rolled-back'].includes(previous.state)) fail('Există o restaurare întreruptă. Recuperează copia anterioară înainte de un import nou.');
      const record={version:FORMAT,at:now(),owner:saved.owner,state:'prepared',changes};
      await adapter.saveRecovery(record); // Must commit before any app data changes.
      try {
        record.state='applying';await adapter.saveRecovery(record);
        for(const target of ['plans','models','history','local']) {
          const batch=changes.filter(e => e.target===target);
          if(batch.length) await adapter.replace(target,batch);
        }
        record.state='committed';await adapter.saveRecovery(record);
        previews.delete(plan);
        return {saved:changes.length,at:record.at};
      } catch(error) {
        const rollback=await recover(record);
        fail(error.message+(rollback.pending?' Copia de recuperare este păstrată; recuperarea cere reverificare.':' Datele anterioare au fost recuperate.'));
      }
    });
  }
  async function recover(record) {
    let pending=0,restored=0;
    const current=new Map((await adapter.snapshot()).map(e => [id(e),e.value]));
    for(const target of ['local','history','models','plans']) {
      const changes=[];
      for(const e of record.changes.filter(e => e.target===target)) {
        const value=current.get(id(e))??null;
        if(valueEqual(value,e.before)) continue;
        if(!valueEqual(value,e.after)) {pending++;continue;}
        changes.push({...e,before:e.after,after:e.before});
      }
      if(changes.length) try {await adapter.replace(target,changes);restored+=changes.length;} catch {pending+=changes.length;}
    }
    record.state=pending?'recovery-needed':record.state==='committed'?'undone':'rolled-back';
    await adapter.saveRecovery(record);
    return {restored,pending};
  }
  async function undo() {
    return adapter.exclusive(async() => {
      const record=await adapter.recovery();
      if(!record || ['undone','rolled-back'].includes(record.state)) fail('Nu există o restaurare de anulat.');
      if(await owner() !== record.owner) fail('Copia de recuperare aparține altui cont.');
      return recover(record);
    });
  }
  async function exportAll(options={}) {
    const first=await adapter.snapshot(),account=await owner();
    const archive=await createArchive(first,{...options,owner:account,now:now()});
    const second=await adapter.snapshot();
    const canonical=xs=>json(xs.slice().sort((a,b)=>id(a).localeCompare(id(b))));
    if(canonical(first)!==canonical(second) || account!==await owner()) fail('Datele s-au modificat în timpul exportului. Așteaptă finalizarea actualizărilor și încearcă din nou.');
    return archive;
  }
  return {preview,restore,undo,status:()=>adapter.recovery(),export:exportAll};
}

export function browserAdapter({storage=globalThis.localStorage,factory=globalThis.indexedDB,locks=globalThis.navigator?.locks,timeoutMs=8000,databasePrefix=''}={}) {
  const dataStores=Object.fromEntries(Object.entries(stores).map(([target,config])=>[target,{...config,database:databasePrefix+config.database}]));
  async function open(database,store) {
    if(!factory?.open) fail('Stocarea separată a browserului nu poate fi verificată. Backupul complet nu este confirmat.');
    return new Promise((resolve,reject) => {
      let settled=false,request;
      const timer=setTimeout(()=>finish(Error('Accesul la datele browserului a expirat.')),timeoutMs);
      function finish(error,db) {if(settled){db?.close();return;}settled=true;clearTimeout(timer);error?reject(error):resolve(db);}
      try {request=factory.open(database,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);};request.onsuccess=()=>finish(null,request.result);request.onerror=()=>finish(Error('Datele păstrate separat nu pot fi citite.'));request.onblocked=()=>finish(Error('O altă fereastră blochează datele browserului.'));} catch(error){finish(error);}
    });
  }
  async function operate(config,mode,work) {
    const db=await open(config.database,config.store);
    try {return await new Promise((resolve,reject) => {
      const tx=db.transaction(config.store,mode),store=tx.objectStore(config.store);let result,settled=false;
      const timer=setTimeout(()=>{finish(Error('Citirea sau salvarea backupului a expirat.'));try{tx.abort();}catch{}},timeoutMs);
      function finish(error){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);}
      tx.oncomplete=()=>finish();tx.onabort=tx.onerror=()=>finish(tx.error||Error('Salvarea backupului a fost refuzată.'));
      try {work(store,value=>{result=value;},error=>{finish(error);try{tx.abort();}catch{}});} catch(error){finish(error);try{tx.abort();}catch{}}
    });} finally {db.close();}
  }
  const recoveryStore={database:databasePrefix+'tt_system_backup_recovery_v1',store:'recovery'};
  async function snapshot() {
    const result=[];
    for(let n=0;n<storage.length;n++) {
      const key=storage.key(n);
      if(groupFor('local',key)) result.push({target:'local',key,value:storage.getItem(key)});
    }
    // A failure in any database fails the entire export, never silently partial.
    for(const [target,config] of Object.entries(dataStores)) {
      const records=await operate(config,'readonly',(store,done,abort)=> {
        const entries=[],r=store.openCursor();
        r.onsuccess=()=> {const c=r.result;if(!c){done(entries);return;}if(groupFor(target,c.key)) entries.push({target,key:c.key,value:c.value});c.continue();};r.onerror=()=>abort(Error('Registrul separat nu poate fi citit.'));
      });
      result.push(...records);
    }
    return result;
  }
  async function replace(target,changes) {
    if(changes.some(e => !groupFor(target,e.key))) fail('Adresă de restaurare incompatibilă.');
    if(target==='local') {
      // Compare again immediately before every synchronous write.
      for(const c of changes) {
        if(!valueEqual(storage.getItem(c.key),c.before)) fail('Registrul local s-a modificat în timpul restaurării.');
        if(c.after===null) storage.removeItem(c.key);else storage.setItem(c.key,c.after);
      }
      return;
    }
    await operate(dataStores[target],'readwrite',(store,done,abort)=> {
      let pending=changes.length;
      for(const c of changes) {
        const r=store.get(c.key);r.onsuccess=()=> {
          if(!valueEqual(r.result??null,c.before)) {abort(Error('Registrul separat s-a modificat în timpul restaurării.'));return;}
          if(--pending) return;
          for(const e of changes) {if(e.after===null) store.delete(e.key);else store.put(e.after,e.key);}done(true);
        };
      }
    });
  }
  const recovery=()=>operate(recoveryStore,'readonly',(s,done)=>{const r=s.get('latest');r.onsuccess=()=>done(r.result??null);});
  const saveRecovery=value=>operate(recoveryStore,'readwrite',(s,done)=>{s.put(clone(value),'latest');done(true);});
  async function exclusive(fn) {
    if(!locks?.request) fail('Browserul nu oferă protecție între ferestre pentru restaurare. Exportul rămâne disponibil; restaurează într-un browser actual.');
    // Same locks as cloud, plans, evidence and Europe writers. Ordinary IDB
    // writers are additionally protected by transactional compare-and-swap.
    return locks.request('tt-system-backup',()=>locks.request('tt-cloud-sync',()=>locks.request('tt_trade_plans_v1',()=>locks.request('tt_trade_evidence_v1',()=>locks.request('tt_europe_signals_v1',fn)))));
  }
  return {snapshot,replace,recovery,saveRecovery,exclusive};
}
