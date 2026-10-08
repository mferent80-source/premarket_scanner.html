(function(g){'use strict';
const finite=Number.isFinite,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=v=>typeof v==='string'&&(/^[A-Z]{3}$/.test(v)||v==='GBp')?v:null;
const fmt=(v,c='',signed=false)=>finite(v)?(signed&&v>0?'+':'')+v.toLocaleString('ro-RO',{maximumFractionDigits:Math.abs(v)>0&&Math.abs(v)<.01?6:2})+(c?' '+c:''):'—';
const date=at=>new Date(at).toLocaleString('ro-RO',{timeZone:'Europe/Bucharest'}),preferences=new Map(),sources=new Map();
function build(data,{scope,environment='live',position,at,now=Date.now(),days=30,metric='price'}={}){
 days=[7,30,90].includes(days)?days:30;metric=metric==='pnl'?'pnl':'price';
 const unit=currency(metric==='price'?position?.instrumentCurrency:position?.currency),t=Date.parse(at),account=data?.version===1?data.accounts?.[scope]:null;
 const empty=reason=>({days,metric,unit,points:[],delta:null,pct:null,breaks:0,reason,stale:finite(t)&&now-t>300000});
 if(!position||!finite(t)||t>now+60000||!finite(position.quantity)||position.quantity<=0)return empty('Citirea curentă a poziției este indisponibilă.');
 if(!unit)return empty('Moneda seriei nu este verificată.');
 if(account&&account.environment!==environment)return empty('Istoricul aparține altui mediu.');
 if(data&&data.version!==1)return empty('Formatul istoricului nu poate fi verificat.');
 const lastDay=g.T212Daily.day(t),cutoff=new Date(lastDay+'T12:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-(days-1));const firstDay=cutoff.toISOString().slice(0,10),daily=new Map();
 for(const x of Array.isArray(account?.days)?account.days:[]){const stamp=Date.parse(x?.at);if(!finite(stamp)||stamp>t||stamp>now+60000||!Array.isArray(x.positions))continue;const d=g.T212Daily.day(stamp);if(d<firstDay||d>lastDay)continue;const old=daily.get(d);if(!old||stamp>Date.parse(old.at))daily.set(d,{at:x.at,positions:x.positions});}
 daily.set(lastDay,{at,positions:[position]});
 let segment=0,previous=null,breaks=0;const points=[];
 for(const [d,x] of [...daily].sort((a,b)=>a[0].localeCompare(b[0]))){
  const matches=x.positions.filter(p=>p?.ticker===position.ticker),p=matches.length===1?matches[0]:null;
  const value=metric==='price'?p?.currentPrice:p?.unrealized,denomination=currency(metric==='price'?p?.instrumentCurrency:p?.currency);
  if(!p||!finite(p.quantity)||p.quantity<=0||!finite(value)||metric==='price'&&value<=0||denomination!==unit){if(previous)breaks++;previous=null;segment++;continue;}
  const comparable=previous&&finite(p.averagePrice)&&p.averagePrice>0&&finite(previous.averagePrice)&&previous.averagePrice>0&&p.quantity===previous.quantity&&p.averagePrice===previous.averagePrice&&p.instrumentCurrency===previous.instrumentCurrency&&currency(p.instrumentCurrency);
  if(previous&&!comparable){segment++;breaks++;}
  points.push({at:x.at,day:d,value,unit,quantity:p.quantity,averagePrice:finite(p.averagePrice)?p.averagePrice:null,instrumentCurrency:currency(p.instrumentCurrency),segment});previous=p;
 }
 const first=points[0],last=points.at(-1),comparable=points.length>1&&last.day===lastDay&&first.segment===last.segment&&finite(first.averagePrice)&&first.averagePrice>0;
 const raw=comparable?last.value-first.value:null,delta=finite(raw)?raw:null,rawPct=metric==='price'&&delta!==null?(last.value/first.value-1)*100:null,pct=finite(rawPct)?rawPct:null;
 const span=first&&last?Math.round((Date.parse(last.day+'T12:00:00Z')-Date.parse(first.day+'T12:00:00Z'))/86400000)+1:0;
 return {days,metric,unit,points,delta,pct,breaks,span,stale:now-t>300000,reason:!last||last.day!==lastDay?'Citirea curentă lipsește din seria comparabilă.':points.length<2?'Sincronizează în cel puțin două zile diferite pentru o comparație.':delta===null?'Comparație blocată: cantitate, cost mediu, monedă sau date lipsă între citiri.':'De la prima la ultima citire afișată; nu reprezintă un randament zilnic.'};
}
function coords(m){const xs=m.points,min=Math.min(...xs.map(p=>p.value)),max=Math.max(...xs.map(p=>p.value)),scale=Math.max(Math.abs(min),Math.abs(max),1),lo=min/scale,hi=max/scale,range=hi-lo;
 const start=Date.parse(xs[0].at),span=Date.parse(xs.at(-1).at)-start;
 return xs.map(p=>({x:span?44+(Date.parse(p.at)-start)/span*552:320,y:range?164-(p.value/scale-lo)/range*130:99}));}
function selectedText(m,index){const p=m.points[index];return p?date(p.at)+' · '+fmt(p.value,m.unit)+' · '+fmt(p.quantity)+' unități · cost mediu '+fmt(p.averagePrice,p.instrumentCurrency):'Nicio citire verificată.';}
function content(m,state){
 const label=m.metric==='price'?'Preț':'P&L nerealizat · broker',tone=m.delta===null?'':m.delta<0?'negative':m.delta>0?'positive':'',movement=m.delta===null?(m.points.length<2?'Reper insuficient':'Comparație blocată'):m.delta>0?'În creștere':m.delta<0?'În scădere':'Neschimbat',xs=m.points,n=xs.length;
 const controls='<div class="history-controls"><div role="group" aria-label="Perioada istoricului">'+[7,30,90].map(d=>'<button data-history-days="'+d+'" aria-pressed="'+(m.days===d)+'">'+d+' zile</button>').join('')+'</div><div role="group" aria-label="Seria afișată">'+[['price','Preț'],['pnl','P&L broker']].map(([v,l])=>'<button data-history-metric="'+v+'" aria-pressed="'+(m.metric===v)+'">'+l+'</button>').join('')+'</div></div>';
 let html='<header><h3>Istoricul poziției</h3><small>Citiri observate'+(m.stale?' · snapshot vechi':'')+'</small></header>'+controls+'<div class="history-summary"><div><small>'+esc(label+' · '+(m.unit||'monedă?'))+'</small><strong class="'+tone+'">'+movement+'</strong></div><div><small>Schimbare în interval</small><b class="'+tone+'">'+esc(fmt(m.delta,m.unit,true))+(m.pct!==null?' · '+esc(fmt(m.pct,'%',true)):'')+'</b></div><div><small>Acoperire</small><b>'+n+' citiri'+(n?' / '+m.span+' zile':'')+'</b></div></div><p class="history-note">'+esc(m.reason)+'</p>';
 if(!n)return html+'<p class="history-note">Se păstrează ultima citire din fiecare zi, ora București. Istoricul începe la sincronizările observate în acest browser.</p>';
 const xy=coords(m);let index=xs.findIndex(p=>p.at===state.selectedAt);if(index<0)index=n-1;state.selectedAt=xs[index].at;
 html+='<svg class="history-chart" viewBox="0 0 640 200" role="img" aria-label="'+esc(label+' în '+m.unit+' · '+n+' citiri. '+movement)+'"><path class="history-axis" d="M44 30V170H596"/>'+xy.slice(1).map((p,i)=>xs[i].segment===xs[i+1].segment?'<path class="history-connection" d="M'+xy[i].x+' '+xy[i].y+'L'+p.x+' '+p.y+'"/>':'').join('')+xy.map(p=>'<circle class="history-point" cx="'+p.x+'" cy="'+p.y+'" r="3"/>').join('')+'<circle data-history-marker class="history-marker" cx="'+xy[index].x+'" cy="'+xy[index].y+'" r="7"/><text x="44" y="18">'+esc(fmt(Math.max(...xs.map(p=>p.value)),m.unit))+'</text><text x="596" y="185" text-anchor="end">'+esc(xs.at(-1).day)+'</text><text x="44" y="185">'+esc(xs[0].day)+'</text></svg>';
 html+='<div class="history-inspect"><button data-history-step="-1" aria-label="Citirea precedentă" '+(index===0?'disabled':'')+'>←</button><label>Explorează citirile<input type="range" data-history-index min="0" max="'+(n-1)+'" step="1" value="'+index+'" aria-label="Citirea selectată" aria-valuetext="'+esc(selectedText(m,index))+'" '+(n<2?'disabled':'')+'></label><button data-history-step="1" aria-label="Citirea următoare" '+(index===n-1?'disabled':'')+'>→</button></div><p class="history-selection" data-history-selection role="status">'+esc(selectedText(m,index))+'</p><details><summary>Tabelul citirilor · '+n+'</summary><div class="history-table"><table><thead><tr><th>Citire · București</th><th>'+esc(label+' · '+m.unit)+'</th><th>Cantitate</th></tr></thead><tbody>'+xs.map(p=>'<tr><td>'+esc(date(p.at))+'</td><td>'+esc(fmt(p.value))+'</td><td>'+esc(fmt(p.quantity))+'</td></tr>').join('')+'</tbody></table></div></details><p class="history-note">Punctele sunt citiri broker, fără confirmarea închiderii. Liniile punctate leagă citiri comparabile; zilele fără sincronizare nu sunt completate. Schimbarea cantității sau costului întrerupe comparația. P&L-ul poate include FX și costuri.</p>';
 return html;
}
function markup(data,options){const key=JSON.stringify([options.scope,options.environment,options.position.ticker]);sources.set(key,{data,options});const state=preferences.get(key)||{days:30,metric:'price',selectedAt:null};preferences.set(key,state);return '<section class="position-history" data-position-history="'+esc(key)+'" aria-label="Istoricul poziției '+esc(options.position.ticker)+'">'+content(build(data,{...options,...state}),state)+'</section>';}
function bind(root=document){for(const host of root.querySelectorAll('[data-position-history]')){
 const key=host.dataset.positionHistory;
 const model=()=>{const source=sources.get(key);return source&&build(source.data,{...source.options,...preferences.get(key)});};
 const select=index=>{const m=model(),state=preferences.get(key);if(!m?.points.length)return;index=Math.max(0,Math.min(m.points.length-1,index));state.selectedAt=m.points[index].at;const slider=host.querySelector('[data-history-index]');slider.value=index;slider.setAttribute('aria-valuetext',selectedText(m,index));host.querySelector('[data-history-selection]').textContent=selectedText(m,index);for(const b of host.querySelectorAll('[data-history-step]'))b.disabled=Number(b.dataset.historyStep)<0?index===0:index===m.points.length-1;const point=coords(m)[index],marker=host.querySelector('[data-history-marker]');marker.setAttribute('cx',point.x);marker.setAttribute('cy',point.y);};
 host.oninput=e=>{if(e.target.matches('[data-history-index]'))select(Number(e.target.value));};
 host.onclick=e=>{const button=e.target.closest('button');if(!button||!host.contains(button))return;const state=preferences.get(key);if(button.dataset.historyStep){select(Number(host.querySelector('[data-history-index]').value)+Number(button.dataset.historyStep));return;}let selector;if(button.dataset.historyDays){state.days=Number(button.dataset.historyDays);selector='[data-history-days="'+state.days+'"]';}else if(button.dataset.historyMetric){state.metric=button.dataset.historyMetric;selector='[data-history-metric="'+state.metric+'"]';}else return;const open=host.querySelector('details')?.open;host.innerHTML=content(model(),state);if(host.querySelector('details'))host.querySelector('details').open=!!open;host.querySelector(selector)?.focus({preventScroll:true});};
}}
g.PositionHistory={build,markup,bind};
})(typeof window!=='undefined'?window:globalThis);
