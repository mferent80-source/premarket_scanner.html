(function(){
'use strict';
const current=document.documentElement.dataset.appVersion,labels=document.querySelectorAll('[data-version]'),buttons=document.querySelectorAll('[data-update]');let latest=null;
labels.forEach(el=>{el.textContent='v'+current;el.title='Versiunea paginii deschise: '+current;});
async function check(){try{const u=new URL('version.json',location.href);u.searchParams.set('check',Date.now());const r=await fetch(u,{cache:'no-store',credentials:'omit'});if(!r.ok)return;const v=await r.json();if(!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(v.version))return;latest=v.version;buttons.forEach(el=>{el.hidden=latest===current;el.textContent='Versiune nouă · Update';el.title='Versiune nouă '+latest+'. Jurnalul și conexiunea salvată se păstrează.';});labels.forEach(el=>el.title='Pagina deschisă: '+current+' · publicată: '+latest);}catch(_){/* Keep the installed version visible while offline. */}}
/* 27.10.2026 (auditul A [4]): înainte de reîncărcare se șterg cache-urile carcasei VECHI (nu ale suitei, nu cel al versiunii noi, dacă s-a instalat deja),
   ca pe rețea lentă să nu mai poată fi servită carcasa veche. */
async function dropOldShell(){try{if(typeof caches==='undefined')return;const keep='tt-decision-phone-design-'+latest,keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('tt-decision-phone-')&&k!==keep).map(k=>caches.delete(k)));}catch(_){}}
buttons.forEach(el=>el.addEventListener('click',async()=>{if(!latest||latest===current)return;buttons.forEach(b=>b.disabled=true);try{if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration();if(registration)await registration.update();}}catch(_){}await dropOldShell();const u=new URL(location.href);u.searchParams.set('v',latest);location.replace(u.href);}));
check();setInterval(check,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});window.addEventListener('online',check);
})();
