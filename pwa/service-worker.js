// PWA service worker (logica). Wordt geladen via /sw.js in de site-root (scope /).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Bewust geen interceptie. Listener moet bestaan voor installability.
});
