/* Private route data belongs to IndexedDB and its authenticated UID scope.
   This worker never caches API responses, receipts, RSC or authenticated HTML. */
/* global self, caches, fetch, URL, Response */
const STATIC_CACHE = "semancontrol-static-v2";
const FALLBACK = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(async (cache) => {
    // Workers assets may redirect offline.html to /offline. Normalize the
    // final HTML into a fresh response usable by a navigation's manual mode.
    const response = await fetch(FALLBACK);
    if (!response.ok) throw new Error("Offline fallback is unavailable");
    await cache.put(FALLBACK, new Response(await response.text(), { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    await cache.add("/pwa-icon.svg");
  }));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("semancontrol-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))), self.clients.claim()]));
});
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.headers.has("Authorization") || request.headers.has("RSC") || url.searchParams.has("_rsc")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(FALLBACK)) ?? Response.error()));
    return;
  }
  if (!url.pathname.startsWith("/_next/static/") && url.pathname !== "/pwa-icon.svg" && url.pathname !== FALLBACK) return;
  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && !response.headers.has("Set-Cookie")) {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      const assets = keys.filter((key) => new URL(key.url).pathname.startsWith("/_next/static/"));
      for (const stale of assets.slice(0, Math.max(0, assets.length - 60))) await cache.delete(stale);
    }
    return response;
  }));
});
