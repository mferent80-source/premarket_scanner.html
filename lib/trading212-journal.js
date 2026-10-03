// Broker executions remain distinct from manually paired trade plans.
(function(g){
'use strict';
const KEY='tt_trading212_fills_v1';
function read(){const raw=localStorage.getItem(KEY);if(!raw)return {accounts:{}};const data=JSON.parse(raw);if(!data.accounts||typeof data.accounts!=='object')throw Error('Jurnal Trading 212 incompatibil.');return data;}
function merge(scope,environment,items,nextCursor,fetchedAt){
 const data=read(),a=data.accounts[scope]||{environment,items:[]},byId=new Map(a.items.map(x=>[x.id,x]));let skipped=0;
 for(const item of items){if(!item.id||!item.ticker||!['BUY','SELL'].includes(item.side)||!(item.quantity>0)||!(item.price>0)||!Number.isFinite(Date.parse(item.date))){skipped++;continue;}byId.set(item.id,{...item});}
 a.items=[...byId.values()].sort((x,y)=>Date.parse(y.date)-Date.parse(x.date));a.environment=environment;a.nextCursor=nextCursor;a.fetchedAt=fetchedAt;a.complete=!nextCursor;data.accounts[scope]=a;localStorage.setItem(KEY,JSON.stringify(data));return {count:a.items.length,skipped,complete:a.complete};
}
function render(){const host=document.getElementById('t212Journal');if(!host)return;const escape=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));try{const accounts=Object.values(read().accounts);host.innerHTML=accounts.length?accounts.map(a=>`<h3>Trading 212 · ${a.environment==='demo'?'DEMO':'INVEST'} · ${a.items.length} execuții</h3><p>${a.complete?'Istoricul disponibil a fost parcurs integral':'Import în curs / parțial'} · ${escape(a.fetchedAt)}</p><div style="overflow:auto;max-height:520px"><table style="width:100%;min-width:650px"><thead><tr><th>Data</th><th>Ticker</th><th>Operație</th><th>Cantitate</th><th>Preț</th><th>P&amp;L broker</th></tr></thead><tbody>${a.items.map(x=>`<tr><td>${escape(x.date)}</td><td>${escape(x.ticker)}</td><td>${escape(x.side)}</td><td>${escape(x.quantity)}</td><td>${escape(x.price)} ${escape(x.priceCurrency)}</td><td>${escape(x.realized)} ${escape(x.currency)}</td></tr>`).join('')}</tbody></table></div>`).join(''):'Conectează Trading 212 pentru importul automat al execuțiilor.';}catch(e){host.textContent='Jurnalul brokerului nu poate fi citit: '+e.message;}}
g.T212J={merge,read,render};if(typeof document!=='undefined'){render();g.addEventListener('storage',render);}
})(typeof window!=='undefined'?window:globalThis);
