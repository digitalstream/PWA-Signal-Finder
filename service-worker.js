// service-worker.js





const FILES_TO_CACHE = [
  "/signalFinder/",
  "index.html"
];

const staticCacheName = 'signal-finder-site-static';

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(staticCacheName)
      .then(cache => {
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        console.log('Files cached successfully');
      })
      .catch(error => {
        console.error('Failed to cache files:', error);
      })
  );
});





