/*
 * Fasal-Pramaan service worker (hand-written, vanilla JS — no build step).
 *
 * Strategy:
 *  - cache-first  : /_next/static/* (immutable hashed assets), /icons, fonts
 *  - network-first: page navigations, falling back to the cached "/farmer"
 *                   shell when offline
 *  - NEVER cache  : /api/* or Supabase domains (evidence/auth must be live)
 *
 * Offline capture honesty: captures are NOT queued across sessions. Draft
 * claim state survives only via sessionStorage for the current session; a
 * full IndexedDB outbox is future work. This worker only guarantees that the
 * farmer shell ("/farmer") and static assets open without a network.
 */

const VERSION = "v2"; // bump to invalidate all caches on deploy
const SHELL_CACHE = `fp-shell-${VERSION}`;
const ASSET_CACHE = `fp-assets-${VERSION}`;
const SHELL_URL = "/farmer";

const SUPABASE_HOST_RE = /\.supabase\.(co|in)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.add(new Request(SHELL_URL, { cache: "reload" }));
      } catch {
        // First run may be offline or the shell route may not exist yet;
        // activation proceeds regardless.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("fp-") && !name.endsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isNeverCached(url) {
  if (SUPABASE_HOST_RE.test(url.hostname)) return true;
  return url.origin === self.location.origin && url.pathname.startsWith("/api/");
}

function isCacheFirstAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    /\.(?:woff2?|ttf|otf)$/i.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(event) {
  try {
    const response = await fetch(event.request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(event.request, response.clone());
    }
    return response;
  } catch {
    const cachedPage = await caches.match(event.request);
    if (cachedPage) return cachedPage;
    const shell = await caches.match(SHELL_URL);
    if (shell) return shell;
    return new Response(
      "<!doctype html><meta charset=\"utf-8\"><title>Offline</title><p style=\"font-family:system-ui;padding:2rem\">You are offline. Reopen the app to load the last cached farmer screen.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function networkOnly(request) {
  // Pass-through: no caching layer touches /api/* or Supabase traffic.
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (isNeverCached(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
  // Same-origin non-navigate requests that match nothing above fall through
  // to the browser's default handling (no interception).
});
