(function(){
'use strict';
const current=document.documentElement.dataset.appVersion,labels=document.querySelectorAll('[data-version]'),buttons=document.querySelectorAll('[data-update]');let latest=null;
labels.forEach(el=>{el.textContent='v'+current;el.title='Versiunea paginii deschise: '+current;});
async function check(){try{const u=new URL('version.json',location.href);u.searchParams.set('check',Date.now());const r=await fetch(u,{cache:'no-store',credentials:'omit'});if(!r.ok)return;const v=await r.json();if(!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(v.version))return;latest=v.version;buttons.forEach(el=>{el.hidden=latest===current;el.textContent='Versiune nouă · Update';el.title='Versiune nouă '+latest+'. Jurnalul se păstrează; Trading 212 va necesita reconectare.';});labels.forEach(el=>el.title='Pagina deschisă: '+current+' · publicată: '+latest);}catch(_){/* Keep the installed version visible while offline. */}}
buttons.forEach(el=>el.addEventListener('click',async()=>{if(!latest||latest===current)return;buttons.forEach(b=>b.disabled=true);try{if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration();if(registration)await registration.update();}}catch(_){}const u=new URL(location.href);u.searchParams.set('v',latest);location.replace(u.href);}));
check();setInterval(check,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});window.addEventListener('online',check);
})();
