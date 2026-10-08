(function(g){
'use strict';
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let lastScope=null;
function render(c){
 const host=g.document.getElementById('deskAlerts');if(!host)return;
 const selected=c.demo?null:g.T212Snapshot?.read('live'),capital=c.capital,scope=c.demo?'educational-demo':selected?.[0],snapshot=c.demo?{fetchedAt:new Date().toISOString(),positions:(capital?.rows||[]).map(p=>({...p,instrumentCurrency:p.quoteCurrency}))}:selected?.[1];
 let analyses={};if(!c.demo)try{analyses=JSON.parse(g.localStorage.getItem('tt_holdings_analysis_v1')||'{}');}catch{}
 const report=g.TTDeskAlerts.build({scope,snapshot,capital:c.demo?{...capital,scope,snapshotAt:snapshot.fetchedAt}:capital,analyses,scan:c.scan?.updatedAt?c.scan:null,validation:c.validation,simulation:c.demo}),open=scope===lastScope&&host.querySelector('details')?.open;lastScope=scope;
 const card=r=>'<article class="desk-alert" data-severity="'+esc(r.severity)+'"><div><b>'+esc(r.title)+'</b><p>'+esc(r.reason)+'</p><p>'+esc(r.next)+'</p></div><button data-alert-open="'+esc(r.module)+'">DESCHIDE →</button></article>';
 host.innerHTML='<header class="head"><div><span class="eyebrow">'+(c.demo?'DEMO FICTIV · ':'')+'CONTROL CURENT</span><h2>Alerte concrete <small>'+report.rows.length+'</small></h2></div><span class="detail-note">Invest · trend · surse · modele</span></header><div class="desk-alert-list">'+(report.rows.length?report.rows.slice(0,3).map(card).join(''):'<p class="detail-note">Nicio alertă din datele verificate. Verifică separat ordinele și evenimentele la broker.</p>')+(report.rows.length>3?'<details><summary>Arată încă '+(report.rows.length-3)+' observații</summary>'+report.rows.slice(3).map(card).join('')+'</details>':'')+'</div><p class="detail-note">'+esc(report.limits)+'</p>';
 if(host.querySelector('details'))host.querySelector('details').open=!!open;
 host.querySelectorAll('[data-alert-open]').forEach(button=>{button.onclick=()=>c.onOpen?.(button.dataset.alertOpen);});
}
g.TTDeskAlertsUI={render};
})(window);
