// Cache only the application shell. Market data and scans always require network.
const CACHE = 'tt-decision-phone-20261003-v2';
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
    if (request.mode === 'navigate') return new Response('<!doctype html><html lang="ro"><meta name="viewport" content="width=device-width"><title>Trading Tools — Offline</title><body style="background:#090d12;color:#e9eef1;font:18px system-ui;padding:30px"><h1>Trading Tools</h1><p>Ești offline. Conectează telefonul la internet pentru date și scanări actualizate.</p><button onclick="location.reload()" style="padding:14px;font:inherit">Reîncearcă</button></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    return (await caches.match(request)) || Response.error();
  }));
});
