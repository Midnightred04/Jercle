// Jercle PWA: cache only public, versioned static resources, never private Firebase data.
const CACHE = 'jercle-static-v1';
const STATIC = ['./icons/icon-192.png','./icons/icon-512.png','./style.css'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('jercle-static-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;
  const filePath = url.pathname;
  if(!['/Jercle/icons/icon-192.png','/Jercle/icons/icon-512.png','/Jercle/style.css'].includes(filePath)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
