/* Only public diagnostic metadata. Never include response bodies or credentials. */
(function(g){
 'use strict';
 const operations={service:'Verificare serviciu',session:'Sesiune Google','read-index':'Citire index cloud','read-record':'Citire registru cloud','read-all':'Citire registre cloud','write-record':'Salvare registru cloud',sync:'Sincronizare'};
 const codes={storage_quota:'Spațiul local de salvare este plin',network_error:'Rețeaua nu a furnizat un răspuns accesibil',timeout:'Cererea a depășit timpul de așteptare',client_error:'Eroare pe dispozitiv',cloud_unavailable:'Serviciul nu a finalizat cererea',cloud_response_invalid:'Răspuns cloud incomplet sau incompatibil',cloud_not_configured:'Serviciu neconfigurat',cloud_worker_missing:'Serviciu nepublicat',cloud_protocol_mismatch:'Protocol incompatibil',session_expired:'Sesiune expirată',session_required:'Conectarea Google este necesară',account_mismatch:'Cont Google diferit',rate_limited:'Limită temporară de cereri',invalid_value:'Registru incompatibil',invalid_key:'Registru neacceptat',invalid_credentials:'Conexiune incompatibilă',record_too_large:'Registru prea mare',revision_conflict:'Revizie modificată',cloud_records_changed:'Date schimbate în timpul citirii',invalid_query:'Citire respinsă de serviciu',cloud_error:'Eroare cloud'};
 const keys={tt_journal_v1:'Jurnal manual',tt_trade_plans_v1:'Planuri',tt_ticket_capital:'Capitalul planurilor',tt_journal_settings_v1:'Setările jurnalului',tt_trading212_fills_v1:'Execuții Trading 212',tt_trading212_portfolio_v1:'Portofoliu Trading 212',tt_trading212_account_history_v1:'Istoricul contului',tt_trading212_cash_v1:'Depuneri și retrageri',tt_holdings_theses_v1:'Ipoteze dețineri',tt_holdings_symbols_v1:'Asocierea tickerelor',tt_holdings_benchmarks_v1:'Benchmark',wl_stocks:'Watchlist',tt_theme:'Tema aplicației',tt_pf_account:'Cont selectat',cloud_credentials:'Conexiunea Trading 212',tt_radar_access_v1:'Cheia de citire și parola Radarului',tt_europe_signals_v1:'Semnale Europa',tt_europe_risk_settings_v1:'Setări de risc Europa',tt_trade_evidence_v1:'Analize înaintea intrării'};
 // 19.10.2026 (I-697): și pachetele execuțiilor Trading 212 și ale registrului de învățare au nume în diagnostic
 const knownKey=k=>typeof k==='string'&&(Object.hasOwn(keys,k)||/^tt_trade_evidence_v1:[0-3][0-9a-f]$/.test(k)||/^tt_trading212_fills_v1:(0[0-9a-f]|cont)$/.test(k)||/^tt_holdings_forecast_sync_v1:[0-3][0-9a-f]$/.test(k));
 const label=k=>keys[k]||(String(k).startsWith('tt_trading212_fills_v1:')?'Execuții Trading 212 · '+(k.endsWith(':cont')?'starea importului':'pachetul '+k.slice(-2)):String(k).startsWith('tt_holdings_forecast_sync_v1:')?'Registrul de învățare · pachetul '+k.slice(-2):'Analize înaintea intrării · '+String(k).slice(-2));
 function sanitize(value,now=Date.now()){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(codes,value.code)||!Object.hasOwn(operations,value.operation))return null;
  if(value.key!==null&&!knownKey(value.key))return null;
  if(value.httpStatus!==null&&(!Number.isInteger(value.httpStatus)||value.httpStatus<100||value.httpStatus>599))return null;
  if(!Number.isSafeInteger(value.at)||value.at<=0||value.at>now+60000)return null;
  return {code:value.code,operation:value.operation,key:value.key,httpStatus:value.httpStatus,at:value.at};
 }
 function fromError(error,context={}){
  let code=error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014?'storage_quota':Object.hasOwn(codes,error?.message)?error.message:error?.name==='AbortError'||error?.name==='TimeoutError'?'timeout':error?.name==='TypeError'?'network_error':'client_error';
  const operation=Object.hasOwn(operations,context.operation)?context.operation:'sync';
  const status=context.httpStatus??error?.status;
  return {code,operation,key:knownKey(context.key)?context.key:null,httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,at:Date.now()};
 }
 function describe(value){
  const info=sanitize(value);if(!info)return 'Detaliile acestei erori nu sunt încă disponibile.';
  const pieces=[operations[info.operation]];
  if(info.key)pieces.push(label(info.key));
  pieces.push(codes[info.code]+' ['+info.code+']');
  if(info.httpStatus!==null)pieces.push('HTTP '+info.httpStatus);
  pieces.push(new Intl.DateTimeFormat('ro-RO',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(info.at)));
  return pieces.join(' · ');
 }
 g.TTCloudFailure=Object.freeze({sanitize,fromError,describe,label,codeText:c=>codes[c]||null});
})(typeof window!=='undefined'?window:globalThis);
