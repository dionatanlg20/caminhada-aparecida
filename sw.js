// Guarda os arquivos do app para abrir mesmo sem internet.
// Mapas, satélite, rotas e busca de endereço sempre vêm da internet.
const CACHE = 'caminhada-v25';
const FILES = ['./', 'index.html', 'style.css?v=25', 'app.js?v=25', 'rota-oficial.js?v=25', 'rota-dutra.js?v=25', 'rota-fe.js?v=25', 'alertas.json', 'manifest.json', 'icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css'];
const SEMPRE_ONLINE = ['tile.openstreetmap.org', 'tiles.openfreemap.org', 'basemaps.cartocdn.com', 'arcgisonline.com',
  'routing.openstreetmap.de', 'nominatim.openstreetmap.org', 'ntfy.sh'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || SEMPRE_ONLINE.some((h) => e.request.url.includes(h))) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
