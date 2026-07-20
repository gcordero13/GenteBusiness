self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A fetch handler is required for installability; this one is a plain
// network passthrough (no offline caching).
self.addEventListener("fetch", () => {});
