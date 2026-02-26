const CACHE_NAME = "chess-cache";
self.addEventListener("install", e => {
e.waitUntil(
caches.open(CACHE_NAME)
.then(cache => cache.addAll([
"./",
"./index.html",
"./style.css",
"./script.js",
"./manifest.json"
]))
);
});
self.addEventListener("fetch", e => {
e.respondWith(
caches.match(e.request)
.then(res => res || fetch(e.request))
);
});