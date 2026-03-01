// Service Worker for ashcroft.cloud PWA
// Basic caching strategy: cache-first for app shell, network-first for API calls

const CACHE_NAME = 'ashcroft-v1772407071';
const STATIC_ASSETS = [
  '/app/css/shared.css',
  '/app/shared.css',
  '/app/shared.js',
  '/app/js/shared/api.js',
  '/app/js/shared/auth.js',
  '/app/js/shared/ui.js',
  '/app/js/shared/components.js',
  '/app/js/shared/nav.js',
  '/app/manifest.json',
  '/app/dashboard.html',
  '/app/tasks.html',
  '/app/events.html',
  '/app/grocery.html',
  '/app/notes.html',
  '/app/kanban.html',
  '/app/settings.html'
];

// Install: Cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Caching app shell');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // API requests: Network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache API errors
          if (!response.ok) {
            return response;
          }
          // Cache successful GET API responses briefly
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache for API requests
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets: Cache-first strategy
  if (STATIC_ASSETS.some(asset => url.pathname === asset) || 
      url.pathname.endsWith('.css') || 
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.html')) {
    
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          // Don't cache failed responses
          if (!response.ok) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // For everything else, just fetch normally
  event.respondWith(fetch(request));
});

// Handle background sync if needed (future enhancement)
self.addEventListener('sync', (event) => {
  console.log('SW: Background sync:', event.tag);
  // Could be used for offline form submissions
});