// --- CONFIGURATION ---
const CACHE_NAME = 'signal-finder-v3'; // Increment this to force an update on user devices

const FILES_TO_CACHE = [
  './',                     // The root (index.html)
  'index.html',
  'style.css',              // Added: Critical for styling
  'app.js',
  'manifest.json',
  'transmitters.json',      // Added: Initial data seed
  'icon.png',
  'images/bg-shinny.jpg',   // Added: Desktop Background
  'images/bg-shinny-sm.jpg' // Added: Mobile Background
];

// --- INSTALL EVENT ---
self.addEventListener('install', evt => {
  console.log('[ServiceWorker] Installing version:', CACHE_NAME);
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting(); // Force this SW to become active immediately
});

// --- ACTIVATE EVENT (Cleanup) ---
self.addEventListener('activate', evt => {
  console.log('[ServiceWorker] Activating...');
  evt.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          // If the cache name doesn't match current version, delete it
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control of all open clients
});

// --- FETCH EVENT (Strategy Logic) ---
self.addEventListener('fetch', evt => {
  
  // 1. STRATEGY: NETWORK-FIRST (For Data)
  // We always want fresh transmitter data if possible.
  if (evt.request.url.includes('transmitters.json')) {
    evt.respondWith(
      fetch(evt.request)
        .then(response => {
          // If network works, update the cache copy
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(evt.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails (Offline), return cached data
          console.log('[ServiceWorker] Network down. Serving cached data.');
          return caches.match(evt.request);
        })
    );
    return;
  }

  // 2. STRATEGY: CACHE-FIRST (For Assets)
  // HTML, CSS, JS, Images don't change often. Load fast from cache.
  evt.respondWith(
    caches.match(evt.request).then(response => {
      // Return cached file if found, otherwise go to network
      return response || fetch(evt.request);
    })
  );
});