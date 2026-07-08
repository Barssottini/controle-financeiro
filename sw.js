// Service Worker — Barssottini & Finanças
// Estratégia: rede primeiro (pega atualizações), cache como reserva (funciona offline)
const CACHE = 'bf-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./index.html', './manifest.json', './logo-192.png', './logo-512.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // APIs de cotação sempre vão direto à rede, sem cache
  if (/coingecko|brapi/.test(e.request.url)) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
