/* VoiceFlow AI — app-shell service worker v5.
 * v5 changes:
 *   - Root cause of the perpetual "new version available" banner: the FCM SW
 *     was registered at the same root scope as this one (see pwa.ts), so the
 *     two flip-flopped active/waiting every load. FCM SW now registers at its
 *     own scope. This bump forces one clean activation on existing clients.
 * v4 changes:
 *   - Removed broken UPDATE_AVAILABLE broadcast from install event
 *   - hardReload waits for controllerchange (now with a 3s timeout fallback)
 */

const CACHE = "voiceflow-shell-v5";
const APP_SHELL = [
  "/",
  "/dashboard",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => null))
  );
  // Do NOT skipWaiting automatically — wait for user to confirm reload.
  // Hard-reload from the UI sends SKIP_WAITING to trigger immediate takeover.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API calls or Firebase SDK traffic
  if (url.hostname.endsWith("cloudfunctions.net")) return;
  if (url.hostname.endsWith("googleapis.com")) return;
  if (url.hostname.endsWith("firebaseio.com")) return;
  if (url.hostname.endsWith("openai.com")) return;
  if (url.hostname.endsWith("firebaseapp.com") && url.pathname.includes("/__/")) return;

  // Network-first, falling back to cache.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (
          resp.ok &&
          (req.destination === "document" ||
            req.destination === "script" ||
            req.destination === "style")
        ) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return resp;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
  );
});

// Message handler
self.addEventListener("message", (event) => {
  // Hard-reload: UI sends this → SW activates immediately → all clients reload
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // FCM push notification fallback
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

// NOTE: broadcasting UPDATE_AVAILABLE from the *install* event is a no-op —
// a waiting SW has no clients.  The page detects updates via the
// registration's updatefound/statechange events instead (see Topbar.tsx).
// We keep this comment so future readers don't re-add the broken pattern.
