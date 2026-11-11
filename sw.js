/* Service worker: кеш оболонки застосунку, щоб він відкривався швидко й без мережі. */
const VERSION = "v2";
const CACHE = "detailing-" + VERSION;

const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "core.js",
  "api.js",
  "studio-config.js",
  "manifest.webmanifest",
  "assets/logo.svg",
  "assets/hero.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/s-wash.svg",
  "assets/s-interior.svg",
  "assets/s-polish.svg",
  "assets/s-ceramic.svg",
  "assets/s-headlight.svg",
  "assets/s-film.svg",
  "assets/g-1.svg",
  "assets/g-2.svg",
  "assets/g-3.svg",
  "assets/g-4.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Спершу віддаємо з кешу, паралельно оновлюємо кеш з мережі.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      if (req.mode === "navigate") return cache.match("index.html");
      return new Response("", { status: 504 });
    })
  );
});
