// Cache only the application shell. Market data and scans always require network.
const CACHE = 'tt-decision-phone-design-26.10.28.0214';
const SHELL = ['./', './index.html', './manifest.webmanifest', './install.js?v=phone-20261003', './icons/icon-192.png', './icons/icon-512.png'];
const VERSION = CACHE.slice(CACHE.lastIndexOf('-') + 1);
/* 27.10.2026 (I-746, auditul A [13], [14]): în cache intră și foile de stil + scripturile pe care le cere carcasa, citite din index.html la instalare,
   cu `?v=` exact. Fiecare fișier intră separat: unul care pică (404, timeout) e scris în consolă și nu lasă carcasa fără service worker. */
function shellAssets(html) {
  const out = [], base = new URL('./index.html', self.registration.scope);
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>|<link\b(?=[^>]*\srel="stylesheet")[^>]*\shref="([^"]+)"[^>]*>/g)) {
    try { const u = new URL(m[1] || m[2], base); if (u.origin === self.location.origin) out.push(u.href); } catch (_) { /* adresă nevalidă: rămâne pe rețea */ }
  }
  return out;
}
async function precacheOne(cache, url) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    await cache.put(url, response.clone());
    return response;
  } catch (e) {
    console.warn('[SW carcasă] nu a intrat în cache:', url, e && e.message);
    return null;
  }
}
async function installShell() {
  const cache = await caches.open(CACHE), at = path => new URL(path, self.registration.scope).href;
  const page = await precacheOne(cache, at('./index.html'));
  let assets = [];
  if (page) try { assets = shellAssets(await page.text()); } catch (_) { assets = []; }
  const rest = [...new Set([...SHELL.filter(path => path !== './index.html').map(at), ...assets])];
  await Promise.allSettled(rest.map(url => precacheOne(cache, url)));
}
self.addEventListener('install', event => {
  event.waitUntil(installShell().then(() => self.skipWaiting()));
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
  if (shellNavigation) { event.respondWith(shellNavigationResponse(event, request)); return; }
  // scripturile și foile de stil ale carcasei: cu `?v=` ⇒ copia EXACTĂ din cache, altfel rețeaua (o altă versiune nu primește niciodată copia veche)
  if (request.destination === 'script' || request.destination === 'style') { event.respondWith(shellAsset(event, request, url)); return; }
  const allowed = SHELL.some(path => new URL(path, self.registration.scope).href === url.href);
  if (!allowed) return;
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
const offlineScreen = () => new Response('<!doctype html><html lang="ro"><meta name="viewport" content="width=device-width"><title>Trading Tools — Offline</title><body style="background:#0b1017;color:#e9eef1;font:18px system-ui;padding:30px"><h1>Trading Tools</h1><p>Ești offline. Conectează telefonul la internet pentru date și scanări actualizate.</p><button onclick="location.reload()" style="padding:14px;font:inherit">Reîncearcă</button></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
function cachedShell(request) {
  const at = path => new URL(path, self.registration.scope).href;
  return caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match(at('./'))).then(hit => hit || caches.match(at('./index.html'))).catch(() => null);
}
function shellAsset(event, request, url) {
  const versioned = /[?&]v=/.test(url.search);
  const network = () => fetch(request).then(response => {
    if (versioned && response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  });
  // fără `?v=` (de ex. un fișier al carcasei încă neversionat): rețeaua întâi, copia exactă doar fără rețea
  if (!versioned) return network().catch(async () => (await caches.match(request)) || Response.error());
  return caches.match(request).then(hit => hit || network(), () => network());
}
// 27.10.2026 (auditul A [4]): „Actualizează” navighează cu `?v=<versiunea publicată>`. Dacă versiunea cerută e MAI NOUĂ decât a acestui service worker,
// copia din cache e carcasa veche ⇒ fără pragul de 3,5 s: se așteaptă rețeaua (altfel butonul reîncărca tot vechiul pe rețea lentă).
const newerThanShell = request => {
  let wanted = null;
  try { wanted = new URL(request.url).searchParams.get('v'); } catch (_) { wanted = null; }
  return !!wanted && /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(wanted) && wanted > VERSION;
};
function shellNavigationResponse(event, request) {
  return new Promise(resolve => {
    let done = false;
    const finish = response => { if (!done && response) { done = true; resolve(response); } };
    const timer = newerThanShell(request) ? null : setTimeout(() => { cachedShell(request).then(finish); }, HTML_NET_TIMEOUT_MS);
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

