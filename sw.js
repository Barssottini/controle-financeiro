// Service Worker — North Finances
// Estratégia: rede primeiro (pega atualizações), cache como reserva (funciona offline).
// v3: o DOCUMENTO (app) NUNCA é servido de uma versão antiga em cache — crítico para a
// criptografia client-side (código velho gravaria dados em texto puro). Só assets estáticos
// (logos, manifest) usam cache de reserva offline.
const CACHE = 'bf-v7';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./index.html', './manifest.json', './logo-192.png', './logo-512.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Remove caches de versões antigas
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
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
