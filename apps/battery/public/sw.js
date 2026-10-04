/* 生活電量計 Service Worker：可安裝、離線可開啟。
 * - 頁面：網路優先，失敗時用快取，再不行顯示 offline.html。
 * - /_next/static：檔名含雜湊，快取優先。
 * - API：只有「一週電量」在離線時回傳最後一次成功的結果；其他 API 一律走網路（寫入不能離線假裝成功）。
 */
const VERSION = "sbm-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const SHELL = ["/", "/week", "/plan", "/review", "/onboarding", "/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];
const OFFLINE_READABLE_API = ["/api/activities/week"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // 個別加入：單一頁面失敗（例如尚未快篩被導向）不影響安裝
      Promise.all(SHELL.map((url) => cache.add(new Request(url, { credentials: "same-origin" })).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (OFFLINE_READABLE_API.includes(url.pathname)) event.respondWith(networkFirst(request, DATA_CACHE, null));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/offline.html"));
  }
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // ?demo=1 會回 redirect，不要把它當成頁面存起來
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ error: "目前離線，請連線後再試" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
