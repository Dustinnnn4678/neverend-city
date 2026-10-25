// Makes the site installable and gives a friendly offline screen. It always asks the network first, so visitors never
// get stale code (the cache is only used when the network fails).
const CACHE = 'neverend-shell-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'icon-192.png']).catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || !r.url.startsWith(self.location.origin)) return;     // never touch Supabase / Stripe / CDN calls
  e.respondWith(fetch(r).then(res => { if (res.ok && (r.mode === 'navigate' || /\.(js|css|png|jpg|json)$/.test(r.url))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
});
