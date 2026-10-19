(function(g){
  'use strict';
  const SYMBOL=/^[A-Z0-9][A-Z0-9.^=-]{0,24}$/;
  const BROKER=/^[A-Z0-9][A-Z0-9_.^=-]{0,49}$/;
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const text=v=>typeof v==='string'?v.slice(0,180):'';
  const symbol=v=>typeof v==='string'&&SYMBOL.test(v)?v:null;
  function read(storage,key,fallback){try{const value=JSON.parse(storage.getItem(key)||'null');return value===null?fallback:value;}catch{return fallback;}}
  function collect(storage,modules){
    const rows=modules.map(m=>({group:'Module',label:m.n,detail:m.group,u:m.u,i:m.i,query:''}));
    function addScan(items,group,u){
      if(!Array.isArray(items))return;
      const seen=new Set();
      for(const item of items.slice(0,3000)){
        const sym=symbol(item?.symbol),mode=['momentum','reversal'].includes(item?.mode)?item.mode:null;
        if(!sym||seen.has(sym+'|'+mode))continue;
        seen.add(sym+'|'+mode);
        const params=new URLSearchParams({symbol:sym});if(mode)params.set('mode',mode);
        rows.push({group,label:sym,detail:text(item.reason)||'Rezultat salvat pe acest dispozitiv',u,i:'⌕',query:params.toString()});
      }
    }
    const scan=read(storage,'ce_results_v2',null)||read(storage,'ce_results_v1',{});
    addScan([...(Array.isArray(scan?.momentum)?scan.momentum:[]),...(Array.isArray(scan?.reversal)?scan.reversal:[]),...(Array.isArray(scan?.analyses)?scan.analyses:[])],'Premarket Scanner','candidate-engine/');
    const own=read(storage,'tt_independent_scanner_v1',{});
    addScan(own?.items,'Verdict independent','scanner-verdicts/');
    const accounts=read(storage,'tt_trading212_portfolio_v1',{}),maps=read(storage,'tt_holdings_symbols_v1',{});
    const entries=accounts&&typeof accounts==='object'&&!Array.isArray(accounts)?Object.entries(accounts).filter(([,a])=>a&&a.environment==='live'):[];
    entries.sort((a,b)=>Number(b[1].active===true)-Number(a[1].active===true)||(Date.parse(b[1].fetchedAt)||0)-(Date.parse(a[1].fetchedAt)||0));
    const current=entries[0];
    if(current&&Array.isArray(current[1].positions)){
      const [scope,account]=current;
      for(const p of account.positions.slice(0,3000)){
        if(!p||typeof p.ticker!=='string'||!BROKER.test(p.ticker)||!Number.isFinite(p.quantity)||p.quantity<=0)continue;
        const mapped=symbol(maps?.[p.ticker]),sym=mapped||symbol(p.ticker.replace(/_US_EQ$/,''))||p.ticker;
        rows.push({group:'Portofoliu',label:sym,detail:text(p.name)||p.ticker,u:'holdings/',i:'◬',query:'',target:{scope,ticker:p.ticker,environment:account.environment}});
      }
    }
    const journal=read(storage,'tt_journal_v1',[]),journalRows=new Map();
    if(Array.isArray(journal))for(const item of journal.slice(-5000).reverse()){
      const sym=symbol(item?.sym);if(!sym)continue;
      if(!journalRows.has(sym))journalRows.set(sym,{open:0,closed:0,sources:new Set()});
      const counts=journalRows.get(sym);
      if(item.status==='open'||item.exit==null)counts.open++;
      if(item.status==='closed'||item.exit!=null&&item.status!=='open')counts.closed++;
      counts.sources.add(text(item.source)||'manual');
    }
    for(const [sym,counts] of journalRows){
      const sources=[...counts.sources],detail=(journal.length>5000?'În ultimele 5.000 execuții · ':'Execuții salvate · ')+'În curs: '+counts.open+' · Închise: '+counts.closed+' · Surse: '+sources.slice(0,3).join(', ')+(sources.length>3?'…':'');
      rows.push({group:'Jurnal',label:sym,detail,u:'journal/#exec',i:'▤',query:new URLSearchParams({symbol:sym}).toString()});
    }
    return rows;
  }
  // 19.10.2026 (I-705): filtrarea separată de citire — carcasa citește rândurile o dată și filtrează la fiecare tastă
  function search(storage,modules,query){return filter(collect(storage,modules),query);}
  function filter(rows,query){
    const q=fold(String(query||'').trim()).slice(0,160);
    if(!q)return rows.filter(r=>r.group==='Module').slice(0,12);
    const groups=new Map();
    for(const row of rows){if(!fold(row.label+' '+row.detail).includes(q))continue;if(!groups.has(row.group))groups.set(row.group,[]);const list=groups.get(row.group);if(list.length<8)list.push(row);}
    return [...groups.values()].flat();
  }
  function cloudStatus(state={},online=true){
    if(state.checking)return {kind:'checking',label:'Verific sincronizarea'};
    if(Array.isArray(state.conflicts)&&state.conflicts.length)return {kind:'conflict',label:'Conflict de sincronizare'};
    if(state.error)return {kind:'error',label:'Eroare de sincronizare'};
    if(!online)return {kind:'offline',label:'Offline · date locale'};
    if(state.backupPaused)return {kind:'paused',label:'Sincronizare suspendată'};
    if(state.busy)return {kind:'busy',label:'Sincronizare în curs'};
    if(!state.connected)return {kind:'local',label:'Date pe acest dispozitiv'};
    if(!state.ready)return {kind:'paused',label:'Sincronizare indisponibilă'};
    if(state.pending===true)return {kind:'pending',label:'Modificări locale'};
    if(!Number.isFinite(state.lastSync)||state.lastSync<=0)return {kind:'pending',label:'Prima sincronizare în așteptare'};
    const time=new Intl.DateTimeFormat('ro-RO',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(state.lastSync));
    return {kind:'confirmed',label:'Sincronizat la '+time};
  }
  g.TTAppSearch={search,filter,collect,symbol,cloudStatus};
})(typeof window!=='undefined'?window:globalThis);
