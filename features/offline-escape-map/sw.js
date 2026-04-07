/* ===================================================================
   sw.js  —  Service Worker for Offline Escape Map
   Cache strategy: Cache-First for tiles, pre-cache app shell
   =================================================================== */

var CACHE_NAME = 'vortex-map-shell-v2';
var TILE_CACHE = 'vortex-map-tiles-v2';

// App shell files to pre-cache
var PRECACHE_URLS = [
  './',
  'index.html',
  'css/map.css',
  'js/map.js',
  'js/disaster.js',
  'js/location.js',
  'data/shelters.geojson',
  'data/zones_earthquake.geojson',
  'data/zones_cyclone.geojson',
  'data/zones_flood.geojson',
  'data/routes.geojson',
];

// 256×256 gray placeholder tile as base64-encoded PNG
var GRAY_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADO' +
  'CBOoAAAAS0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4G0TQAAF9WRNQAAAA' +
  'ASUVORK5CYII=';

/* ---------- Install ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

/* ---------- Activate ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME && key !== TILE_CACHE;
          })
          .map(function (key) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // --- Tile requests (OpenStreetMap) → Cache-First ---
  if (url.indexOf('tile.openstreetmap.org') !== -1) {
    event.respondWith(
      caches.open(TILE_CACHE).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          if (cached) return cached;

          return fetch(event.request)
            .then(function (response) {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(function () {
              // Offline fallback — gray placeholder tile
              return fetch(GRAY_TILE);
            });
        });
      })
    );
    return;
  }

  // --- App shell → Cache-First, fallback to network ---
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;

      return fetch(event.request).then(function (response) {
        // Optionally cache new requests dynamically
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
