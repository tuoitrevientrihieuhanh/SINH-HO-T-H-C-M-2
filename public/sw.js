const CACHE_NAME = 'tan-hung-he-2026-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/public/manifest.json'
];

// Installs and caches structural base resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Intelligent precaching of core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Cleans up any mismatched previous caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheKeys => {
      return Promise.all(
        cacheKeys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache bundle:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Main interceptor to serve resources from cache or fetch with smart strategies
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Focus only on GET requests bypass others
  if (request.method !== 'GET') {
    return;
  }

  // Define strategy for HTML files and root path (Network-First then fallback to cache)
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          // Put the fresh HTML in the cache
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, cacheCopy);
          });
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/') || caches.match('/index.html');
        })
    );
    return;
  }

  // Strategy for Images (both local, dynamic base64, or external Unsplash, cloud assets)
  // We use Cache-First, falling back to network and updating cache.
  const isImage = request.destination === 'image' || 
                  url.hostname.includes('unsplash.com') || 
                  url.hostname.includes('images.unsplash.com') ||
                  url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i);

  if (isImage) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          // Serve from cache but fetch fresh image in background to update cache (Stale-while-revalidate)
          fetch(request).then(networkResponse => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {/* Ignore background error */});
          return cachedResponse;
        }

        // If not in cache, fetch from network and save to cache
        return fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, cacheCopy);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Return placeholder if offline and image not cached
          return caches.match('/favicon.ico');
        });
      })
    );
    return;
  }

  // Strategy for external fonts (Google Fonts) and stylesheets, scripts
  if (url.hostname.includes('fonts.googleapis.com') || 
      url.hostname.includes('fonts.gstatic.com') || 
      request.destination === 'font' || 
      request.destination === 'style' || 
      request.destination === 'script') {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          return null;
        });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Standard Stale-While-Revalidate for other local static assets
  if (request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          console.warn('[Service Worker] Offline fallback for origin resource:', url.pathname);
        });

        return cachedResponse || fetchPromise;
      })
    );
  }
});
