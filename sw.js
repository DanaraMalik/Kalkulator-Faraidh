// Kalkulator Faraidh — Service Worker
// Strategi: halaman utama (index.html) = NETWORK-FIRST agar update dari GitHub langsung
// terpakai; bila offline / jaringan lambat (>4 detik) dipakai salinan tersimpan.
// File lain (manifest, ikon) = cache dulu, diperbarui di latar belakang.
// PENTING: naikkan angka CACHE_NAME hanya bila daftar ASSETS berubah.
const CACHE_NAME = 'faraidh-cache-v2';
const ASSETS = ['./', './index.html', './manifest.json'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache:'reload' = abaikan cache HTTP (GitHub Pages memberi max-age 10 menit)
      cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isPage(request, url) {
  return request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const fetchFresh = fetch(request.url, { cache: 'no-cache' }).then((response) => {
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS));
  try {
    return await Promise.race([fetchFresh, timeout]);
  } catch (err) {
    const cached = (await cache.match(request)) || (await cache.match('./index.html'));
    if (cached) return cached;
    return fetchFresh; // tidak ada salinan: tunggu jaringan apa adanya
  }
}

async function cacheThenRefresh(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;              // HEAD (cek pembaruan) langsung ke jaringan
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // biarkan permintaan lintas-situs
  event.respondWith(isPage(request, url) ? networkFirst(request) : cacheThenRefresh(request));
});
