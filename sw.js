const C = 'ledger-v3';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== C).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  ));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })   // 항상 서버에 최신 여부를 확인
      .then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))   // 오프라인일 때만 저장본 사용
  );
});
