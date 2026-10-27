(function(g){
 'use strict';
 const $=id=>document.getElementById(id),routes=g.TTAppRoutes,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!routes)return;
 function tools(){
  const grid=$('toolGrid');if(!grid)return;
  const items=routes.all.filter(x=>x.group==='MODULE ACTIVE'||x.u==='desk/'),q=fold($('toolSearch').value.trim()),visible=items.filter(x=>fold(x.n+' '+x.description).includes(q));
  grid.innerHTML=visible.map(x=>'<article class="tool-card"><span class="tool-marker">'+esc(x.u==='candidate-engine/'?'MOTOR ORIGINAL':x.u.startsWith('journal/')?'JURNAL & CAPITAL':'INSTRUMENT ACTIV')+'</span><h2>'+esc(x.n)+'</h2><p>'+esc(x.description)+'</p><a href="'+esc(routes.url(x.u))+'" data-route="'+esc(x.u)+'">Deschide <span aria-hidden="true">→</span></a></article>').join('');
  $('toolCount').textContent=visible.length+' / '+items.length+' instrumente';$('toolEmpty').hidden=!!visible.length;
 }
 function theme(){if(!$('themeStatus'))return;let mode;try{mode=g.TTTheme?.get();}catch(_){}
  document.querySelectorAll('[data-theme-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.themeMode===mode));b.disabled=!g.TTTheme;});
  $('themeStatus').textContent=mode?'Tema curentă: '+({dark:'întunecată',light:'deschisă',auto:'după sistem'})[mode]+'.':'Preferința de temă nu poate fi confirmată.';
 }
 let source=g;
 try{if(g.parent!==g&&g.parent.location.origin===g.location.origin)source=g.parent;}catch(_){}
 function cloud(){if(!$('settingsAccount'))return;let state;try{state=source.TTCloud?.state();}catch(_){}
  if(!state){$('settingsAccount').textContent='Neverificat';$('settingsSync').textContent='Stare neconfirmată';$('settingsSync').dataset.state='checking';$('settingsCloudDetail').textContent='Starea contului nu este încă disponibilă. Deschide Cont & sincronizare pentru verificări.';return;}
  $('settingsAccount').textContent=state.checking?'Verific contul…':state.connected?'Google conectat':'Google neconectat';
  const status=g.TTAppSearch.cloudStatus(state,g.navigator.onLine!==false,!!(g.TTAppSearch.reteaSlaba&&g.TTAppSearch.reteaSlaba(g.navigator)));$('settingsSync').textContent=status.label;$('settingsSync').dataset.state=status.kind;
  $('settingsCloudDetail').textContent=state.error?'Sincronizarea necesită atenție: '+String(state.error):state.conflicts?.length?'Există '+state.conflicts.length+' conflicte. Verifică ambele versiuni înainte de înlocuire.':status.kind==='confirmed'?'Ultima sincronizare confirmată este afișată mai sus. Datele de piață au propriile verificări de actualitate.':'Verificările complete, backupul și starea sincronizării sunt în Cont & sincronizare.';
 }
 document.addEventListener('click',e=>{
  const mode=e.target.closest('[data-theme-mode]');if(mode){try{g.TTTheme.set(mode.dataset.themeMode);theme();}catch(_){$('themeStatus').textContent='Preferința nu a putut fi salvată. Verifică permisiunile de stocare ale browserului.';}return;}
  const a=e.target.closest('a[data-route]');if(!a||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button&&e.button!==0||a.target&&a.target!=='_self')return;
  const route=routes.canonical(a.dataset.route);if(route&&g.parent!==g){e.preventDefault();g.parent.postMessage({ttOpen:route},g.location.origin);}
 });
 if($('toolSearch')){$('toolSearch').addEventListener('input',tools);$('clearTools').addEventListener('click',()=>{$('toolSearch').value='';tools();$('toolSearch').focus();});tools();}
 if($('themeStatus')){
  theme();cloud();source.addEventListener('tt-cloud-state',cloud);g.addEventListener('online',cloud);g.addEventListener('offline',cloud);g.addEventListener('storage',e=>{if(e.key==='tt_theme'||e.key===null)theme();});
  g.addEventListener('pagehide',()=>source.removeEventListener('tt-cloud-state',cloud));
  let version;try{version=source.document.documentElement.dataset.appVersion;}catch(_){}
  if(version)$('settingsVersion').textContent='Versiune '+version;
  else if(typeof g.fetch==='function')g.fetch('../version.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('version');return r.json();}).then(x=>{if(typeof x.version==='string')$('settingsVersion').textContent='Versiune '+x.version;}).catch(()=>{});
 }
 // 19.10.2026 (I-713): „Acest aparat citește Trading 212” — setarea stă doar pe aparat; vechimea ultimei citiri la vedere
 function reader(){const box=$('t212Reader'),R=g.TTT212Reader;if(!box||!R)return;let on=true;try{on=R.setting(g.localStorage);}catch(_){}box.checked=on;
  try{$('t212ReaderState').textContent=R.describe({reader:on,latestAt:R.latest(g.localStorage,'live'),ownAt:R.own(g.localStorage,'live'),now:Date.now(),wokeAt:0,visible:false});}catch(_){$('t212ReaderState').textContent='Ultima citire Trading 212 nu poate fi verificată pe acest aparat.';}}
 if($('t212Reader')&&g.TTT212Reader){
  $('t212Reader').addEventListener('change',()=>{try{g.TTT212Reader.setSetting(g.localStorage,$('t212Reader').checked);}catch(_){$('t212ReaderState').textContent='Setarea nu a putut fi salvată pe acest aparat.';return;}reader();});
  reader();g.addEventListener('storage',e=>{if(!e.key||e.key==='tt_trading212_portfolio_v1'||e.key===g.TTT212Reader.KEY)reader();});
  if(g.TTShell)g.TTShell.every(reader,30000);else g.setInterval(()=>{if(!g.document.hidden)reader();},30000);
 }
})(window);
