(function(){'use strict';
const $=id=>document.getElementById(id),checks=window.TTOperationalChecks,cloud=()=>parent!==window?parent.TTCloud:null,labels={good:'Verificat',warning:'Atenție',blocked:'Blocat',unknown:'Neconfirmat'};
let storage=null,busy=false;
function input(){let s={},snapshot=null,snapshotError=false,local;try{s=cloud()?.state()||{};}catch{}try{local=localStorage;}catch{}
 try{snapshot=(parent!==window?parent:window).T212Snapshot?.read('live');const raw=local?.getItem('tt_trading212_portfolio_v1');if(raw){const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))snapshotError=true;}}catch{snapshotError=true;}
 const supported='Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
 return {cloud:s,snapshot,snapshotError,online:navigator.onLine,permission:supported?Notification.permission:'unsupported',storage,appVersion:parent!==window?parent.document.documentElement.dataset.appVersion:document.documentElement.dataset.appVersion,local};
}
function render(){const r=checks.build(input()),host=$('operationalChecks');host.replaceChildren();for(const item of r.rows){const card=document.createElement('div');card.className='operational-row';const title=document.createElement('h3'),badge=document.createElement('span'),detail=document.createElement('p'),action=document.createElement('p');title.textContent=item.title;badge.className='operational-badge '+item.state;badge.textContent=labels[item.state];detail.textContent=item.detail;action.textContent=item.action;action.className='muted';card.append(title,badge,detail,action);host.append(card);}
 $('operationalSummary').textContent=r.counts.good+' verificate · '+r.counts.warning+' de urmărit · '+r.counts.blocked+' blocate · '+r.counts.unknown+' neconfirmate';
 ['operationalRefresh','operationalStorage','operationalExport'].forEach(id=>$(id).disabled=busy);
}
async function testStorage(){const i=input();storage=await checks.probe({local:i.local,privateStore:(parent!==window?parent.TTCloudStore:null)||window.TTCloudStore});render();}
async function run(refresh){if(busy)return;busy=true;$('operationalMessage').textContent=refresh?'Verific serviciile și salvarea locală…':'Verific scrierea, recitirea și eliminarea valorilor temporare…';render();try{
 const jobs=[testStorage()];if(refresh){const c=cloud();if(c){let timer;const work=(async()=>{try{await Promise.race([c.recheck(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),8000);})]);return true;}catch{return false;}finally{clearTimeout(timer);}})();jobs.push(work);}}
 const results=await Promise.all(jobs);$('operationalMessage').textContent=results[1]===false?'Serviciul nu a confirmat reverificarea. Rezultatele stocării sunt afișate separat.':'Verificare încheiată. Stările neconfirmate cer pașii indicați mai jos.';
 }catch{$('operationalMessage').textContent='Verificarea nu a putut fi încheiată. Datele personale rămân păstrate.';}finally{busy=false;render();}}
function download(){const data=checks.report(input()),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='trading-tools-diagnostic-'+data.checkedAt.replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('operationalMessage').textContent='Raport de diagnostic descărcat. Nu include identitatea contului, date financiare, chei API sau abonamente push.';}
 $('operationalRefresh').onclick=()=>run(true);$('operationalStorage').onclick=()=>run(false);$('operationalExport').onclick=download;
 window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.ttCloudState)render();});window.addEventListener('online',render);window.addEventListener('offline',render);window.addEventListener('storage',e=>{if(e.key==='tt_trading212_portfolio_v1')render();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});setInterval(()=>{if(!document.hidden)render();},60000);render();
})();
