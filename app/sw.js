// Cache only the application shell. Market data and scans always require network.
const CACHE = 'tt-decision-phone-design-26.10.19.2040';
const SHELL = ['./', './index.html', './manifest.webmanifest', './install.js?v=phone-20261003', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tt-decision-phone-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Module links and updates add queries to the same shell document.
  // Only document navigation ignores those queries; asset versions remain exact.
  const shellNavigation = request.mode === 'navigate' && ['./', './index.html'].some(path =>
    new URL(path, self.registration.scope).pathname === url.pathname);
  const allowed = shellNavigation || SHELL.some(path => new URL(path, self.registration.scope).href === url.href);
  if (!allowed) return;
  if (shellNavigation) { event.respondWith(shellNavigationResponse(event, request)); return; }
  event.respondWith(fetch(request, { cache: 'no-cache' }).then(response => {
    if (response.ok) {
      const cachedResponse = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, cachedResponse)).catch(() => {}));
    }
    return response;
  }).catch(async () => {
    // Never present an offline trading screen as a current scan.
    if (request.mode === 'navigate') return offlineScreen();
    return (await caches.match(request)) || Response.error();
  }));
});
// 19.10.2026 (I-705): pe semnal slab carcasa nu mai stă albă cât durează rețeaua — după 3,5 s (ca HTML_NET_TIMEOUT_MS din sw-app.js)
// se servește copia din cache, iar răspunsul rețelei o actualizează în fundal. Carcasa e doar meniul: modulele își cer datele singure.
// Fără rețea deloc (cererea pică) rămâne ecranul „Ești offline”, ca înainte.
const HTML_NET_TIMEOUT_MS = 3500;
const offlineScreen = () => new Response('<!doctype html><html lang="ro"><meta name="viewport" content="width=device-width"><title>Trading Tools — Offline</title><body style="background:#090d12;color:#e9eef1;font:18px system-ui;padding:30px"><h1>Trading Tools</h1><p>Ești offline. Conectează telefonul la internet pentru date și scanări actualizate.</p><button onclick="location.reload()" style="padding:14px;font:inherit">Reîncearcă</button></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
function cachedShell(request) {
  const at = path => new URL(path, self.registration.scope).href;
  return caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match(at('./'))).then(hit => hit || caches.match(at('./index.html'))).catch(() => null);
}
function shellNavigationResponse(event, request) {
  return new Promise(resolve => {
    let done = false;
    const finish = response => { if (!done && response) { done = true; resolve(response); } };
    const timer = setTimeout(() => { cachedShell(request).then(finish); }, HTML_NET_TIMEOUT_MS);
    const network = fetch(request, { cache: 'no-cache' }).then(response => {
      clearTimeout(timer);
      const copy = response.ok ? response.clone() : null;
      finish(response);
      if (copy) return caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }, () => { clearTimeout(timer); finish(offlineScreen()); });
    event.waitUntil(network);
  });
}

// Notifications contain no portfolio amounts or API credentials.
async function receipt(data,phase){try{const url=new URL(data.receiptUrl);if(url.origin!=='https://premarket-scanner-html.mferent80.workers.dev'||url.pathname!=='/api/cloud/push/receipt'||typeof data.receipt!=='string')return;await fetch(url.href,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:data.receipt,phase})});}catch{}}
self.addEventListener('push',event=>{event.waitUntil((async()=>{let data={};try{data=event.data?.json()||{};}catch{}await self.registration.showNotification('Trading Tools',{body:typeof data.body==='string'?data.body.slice(0,200):'Ai o alertă nouă în inbox.',icon:new URL('./icons/icon-192.png',self.registration.scope).href,tag:'trading-tools-monitor',data:{receipt:data.receipt,receiptUrl:data.receiptUrl}});await receipt(data,'received');})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{await receipt(event.notification.data||{},'opened');const target=new URL('./?module=app%2Fsync%2F',self.registration.scope).href,windows=await self.clients.matchAll({type:'window',includeUncontrolled:true}),client=windows.find(c=>c.url.startsWith(self.registration.scope));if(client){await client.navigate(target);await client.focus();}else await self.clients.openWindow(target);})());});

