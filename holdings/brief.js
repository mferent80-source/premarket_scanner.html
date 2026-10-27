/* „Portofoliul pe scurt” (15.10.2026), în stilul paginii Astăzi: Contul · Tendința · Datele, banda „De urmărit” și
   ponderile în cont. Doar citește pozițiile, snapshot-ul și analizele EOD deja calculate; nu scrie nimic. */
(function(g){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=Number.isFinite;
// rezultatele cu o singură zecimală
const num=(n,d=1)=>finite(n)?n.toLocaleString('ro-RO',{minimumFractionDigits:0,maximumFractionDigits:d}):'—';
const round=(n,d=1)=>finite(n)?Math.round(n*10**d)/10**d:n;
const signed=(n,d=1)=>{const r=round(n,d);return finite(r)?(r>0?'+':r<0?'−':'')+num(Math.abs(r),d):'—';};
const tone=n=>{const r=round(n);return finite(r)?r>0?'positive':r<0?'negative':'':'';};
/* 27.10.2026 (audit B 🔵 [6]): „Citit” = copie sub 5 minute, ca pe Astăzi (today-dashboard) și în calculele de risc — nu ziua calendaristică a aparatului
   (la 23:30 o copie de la 09:00 era „Citit” aici și „De actualizat” pe Astăzi). Un minut în viitor e tolerat (ceasuri). */
const proaspat=(iso,now)=>{const t=Date.parse(iso);return finite(t)&&now-t>=-60000&&now-t<=300000;};
let expanded=false;
const pill=(text,kind)=>'<span class="pill '+kind+'">'+esc(text)+'</span>';
const short=t=>String(t||'').replace(/_[A-Z]{2}_EQ$|_EQ$/,'');
const when=iso=>{const t=Date.parse(iso);if(!finite(t))return null;const d=new Date(t);return d.toLocaleDateString('ro-RO',{day:'2-digit',month:'2-digit'})+', '+d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});};
function summary({positions=[],models=[],snapshot=null}={}){
 const cur=snapshot?.summary?.currency,total=snapshot?.summary?.totalValue,valid=/^[A-Z]{3}$/.test(cur||'');
 const rows=positions.map((p,i)=>{const m=models[i]||null,weight=valid&&total>0&&p.currency===cur&&finite(p.value)?p.value/total*100:null;return {p,m,weight};});
 const same=rows.filter(r=>valid&&r.p.currency===cur),valued=same.filter(r=>finite(r.p.value));
 const invested=valued.length?valued.reduce((s,r)=>s+r.p.value,0):null;
 const pnlRows=same.filter(r=>finite(r.p.unrealized)),pnl=pnlRows.length?pnlRows.reduce((s,r)=>s+r.p.unrealized,0):null;
 const ready=rows.filter(r=>r.m),up=ready.filter(r=>r.m.medium==='Ascendent').length,down=ready.filter(r=>r.m.medium==='Descendent').length;
 const attention=ready.filter(r=>r.m.attention?.length).sort((a,b)=>b.m.attention.length-a.m.attention.length||(b.weight??-1)-(a.weight??-1));
 const asOf=[...new Set(ready.map(r=>r.m.asOf).filter(Boolean))].sort();
 return {cur:valid?cur:null,total:finite(total)&&total>0?total:null,invested,investedCovered:valued.length,pnl,pnlCovered:pnlRows.length,rows,count:positions.length,ready:ready.length,up,down,attention,missing:positions.length-ready.length,asOf,fetchedAt:snapshot?.fetchedAt||null,biggest:rows.filter(r=>finite(r.weight)).sort((a,b)=>b.weight-a.weight)[0]||null};
}
function markup(ctx={}){
 const s=summary(ctx),c=s.cur?' '+s.cur:'',demo=!!ctx.demo,stamp=when(s.fetchedAt),fresh=proaspat(s.fetchedAt,ctx.now??Date.now()),part=(k)=>k<s.count?' <small>(acoperit '+k+'/'+s.count+')</small>':'';
 if(!s.count)return '<div class="brief pf-brief"><article><div class="brief-top"><span class="brief-label">Contul</span>'+pill('Fără poziții','idle')+'</div><h2>Nicio deținere sincronizată</h2><div class="brief-facts"><span>Poziții în snapshot <b>0</b></span><span>Trend mediu ascendent <b>0</b></span><span>Necesită atenție <b>0</b></span><span>Date indisponibile <b>0</b></span></div></article></div>';
 const account='<article><div class="brief-top"><span class="brief-label">Contul</span>'+pill(demo?'Exemplu · date fictive':stamp?(fresh?'Citit ':'De actualizat · ')+stamp:'Neverificat',demo?'idle':stamp&&fresh?'ok':'warn')+'</div>'
  +'<h2 class="num">'+esc(s.total!==null&&s.cur?num(s.total)+c:'Valoare neverificată')+'</h2>'
  +'<div class="brief-facts"><span>P&amp;L nerealizat <b class="'+tone(s.pnl)+'">'+esc(signed(s.pnl)+c)+'</b>'+part(s.pnlCovered)+'</span><span>Poziții în snapshot <b>'+s.count+'</b></span>'
  +(s.invested!==null?'<span>Investit <b>'+esc(num(s.invested)+c)+'</b>'+part(s.investedCovered)+'</span>':'')
  +(s.biggest?'<span>Cea mai mare <b>'+esc(short(s.biggest.p.ticker))+' '+esc(num(s.biggest.weight))+'%</b></span>':'')+'</div>'
  +'<a class="brief-go" href="#holdingFilters" data-brief-go="list">Lista pozițiilor ↓</a></article>';
 const trend='<article><div class="brief-top"><span class="brief-label">Tendința</span>'+(s.attention.length?pill(s.attention.length+(s.attention.length===1?' cere atenție':' cer atenție'),'warn'):s.ready?pill('Fără semnale de atenție','ok'):pill('Neanalizat','idle'))+'</div>'
  +'<h2>'+(s.ready?esc(s.up+' din '+s.ready+' în trend mediu ascendent'):'Analiza nu a rulat încă')+'</h2>'
  +'<div class="brief-facts"><span>Trend mediu ascendent <b>'+s.up+'</b></span><span>Descendent <b>'+s.down+'</b></span><span>Necesită atenție <b>'+s.attention.length+'</b></span></div>'
  +'<a class="brief-go" href="#holdingComparison" data-brief-go="compare">Compară două dețineri ↓</a></article>';
 const data='<article><div class="brief-top"><span class="brief-label">Datele</span>'+(s.missing?pill('Date indisponibile '+s.missing,'bad'):s.asOf.length?pill('EOD '+s.asOf.at(-1),'ok'):pill('Neverificat','idle'))+'</div>'
  +'<h2>'+esc(s.missing?s.ready+' din '+s.count+' analizate la zi':'Analiză la zi pentru toate cele '+s.count)+'</h2>'
  +'<div class="brief-facts"><span>Date indisponibile <b>'+s.missing+'</b></span>'+(s.asOf.length?'<span>EOD <b>'+esc(s.asOf.join(', '))+'</b></span>':'')+(stamp?'<span>Snapshot <b>'+esc(stamp)+'</b></span>':'')+'</div>'
  +'<a class="brief-go" href="#workspace-reports" data-brief-go="reports">Rapoarte &amp; evenimente ↓</a></article>';
 const watch=s.attention.slice(0,3).map(r=>'<button type="button" class="pf-watch-item" data-brief-open="'+esc(r.p.ticker)+'"><b>'+esc(short(r.p.ticker))+'</b> '+esc(r.m.attention[0])+(r.m.attention.length>1?' <small>+'+(r.m.attention.length-1)+'</small>':'')+'</button>').join('');
 const attention='<div class="attention-strip pf-watch"><p><strong>De urmărit</strong>'+(s.attention.length?'<span class="pf-watch-list">'+watch+(s.attention.length>3?'<span class="pf-watch-more">încă '+(s.attention.length-3)+' în listă</span>':'')+'</span>':'<span>'+(s.ready?'Nicio poziție analizată nu are semnale de atenție în EOD.':'Rulează „Analizează deținerile” pentru semnalele EOD.')+'</span>')+'</p><a href="#holdingFilters" data-brief-go="attention">Filtrează lista ↓</a></div>';
 const ordered=[...s.rows].sort((a,b)=>(b.weight??-1)-(a.weight??-1)),limit=6;
 const row=(r,i)=>'<button type="button" class="pf-weight-row" data-brief-open="'+esc(r.p.ticker)+'"'+(i>=limit?' data-extra'+(expanded?'':' hidden'):'')+'><span class="pf-weight-name"><b>'+esc(short(r.p.ticker))+'</b><small>'+esc(r.p.name||'')+'</small></span><span class="numeric">'+esc(finite(r.p.value)?num(r.p.value)+(r.p.currency?' '+r.p.currency:''):'—')+'</span><span class="numeric '+tone(r.p.unrealized)+'">'+esc(signed(r.p.unrealized))+'</span><span class="pf-weight-bar"><em>'+esc(r.weight===null?'—':num(r.weight)+'%')+'</em><span><i style="width:'+(r.weight===null?0:Math.min(100,Math.max(0,r.weight)).toFixed(1))+'%"></i></span></span><span class="pf-weight-trend">'+esc(r.m?.medium||'neanalizat')+'</span></button>';
 const weights='<section class="pf-weights" aria-label="Ponderi în cont"><div class="pf-weights-head"><div><span class="eyebrow">TRADING 212 INVEST</span><h2>Ponderi în cont</h2></div><span class="meta">'+esc(s.cur&&s.total!==null?'Pondere = valoare / valoarea contului în '+s.cur:'Ponderi neverificate: valoarea sau moneda contului lipsește')+'</span></div>'
  +'<div class="pf-weight-headings"><span>Instrument</span><span>Valoare</span><span>P&amp;L nerealizat</span><span>Pondere</span><span>Trend mediu</span></div>'
  +ordered.map(row).join('')+(ordered.length>limit?'<button type="button" class="pf-weights-more" data-brief-more aria-expanded="'+expanded+'">'+(expanded?'Mai puține ↑':'Toate cele '+ordered.length+' ↓')+'</button>':'')+'</section>';
 return '<div class="brief pf-brief">'+account+trend+data+'</div>'+attention+weights;
}
function render(host,ctx){if(!host)return;const html=markup(ctx);if(host.dataset.briefHtml!==html){host.innerHTML=html;host.dataset.briefHtml=html;}}
function bind(host,{open,tab,list}={}){
 if(!host||host.dataset.briefBound)return;host.dataset.briefBound='1';
 host.addEventListener('click',e=>{
  const o=e.target.closest('[data-brief-open]');if(o){e.preventDefault();open?.(o.dataset.briefOpen);return;}
  const more=e.target.closest('[data-brief-more]');if(more){const show=more.getAttribute('aria-expanded')!=='true';expanded=show;host.querySelectorAll('[data-extra]').forEach(x=>{x.hidden=!show;});more.setAttribute('aria-expanded',String(show));more.textContent=show?'Mai puține ↑':'Toate cele '+host.querySelectorAll('.pf-weight-row').length+' ↓';return;}
  const go=e.target.closest('[data-brief-go]');if(!go)return;e.preventDefault();
  const k=go.dataset.briefGo;
  if(k==='reports'){tab?.('reports');return;}
  tab?.('holdings');
  if(k==='compare'){const d=document.getElementById('holdingComparison');if(d){d.open=true;d.scrollIntoView({block:'start',behavior:'smooth'});}return;}
  list?.(k==='attention'?'attention':null);
 });
}
g.HoldingsBrief={summary,markup,render,bind};
if(typeof module!=='undefined'&&module.exports)module.exports=g.HoldingsBrief;
})(typeof window!=='undefined'?window:globalThis);
