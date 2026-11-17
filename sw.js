const C = 'ledger-v1';
const FILES = ['./', './index.html', './manifest.json'];
self.addEventListener('install', e =>
  e.waitUntil(caches.open(C).then(c => c.addAll(FILES))));
self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(k =>
    Promise.all(k.filter(n => n !== C).map(n => caches.delete(n))))));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('api.upbit.com')) return; // 시세는 항상 새로 조회
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
