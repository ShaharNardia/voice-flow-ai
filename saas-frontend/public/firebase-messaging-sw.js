/* Firebase Cloud Messaging background handler.
 * MUST live at absolute root /firebase-messaging-sw.js for FCM to find it.
 *
 * Uses the Firebase Hosting auto-served /__/firebase/init.json config so we
 * don't have to hardcode the public API key here.
 */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// When hosted under Firebase Hosting, /__/firebase/init.js self-registers
// firebase.initializeApp with the right config. For other hosts we fall back
// to a config passed via postMessage from the main app.
let initialized = false;

async function ensureInit() {
  if (initialized) return;
  try {
    // Firebase Hosting — auto init endpoint
    const resp = await fetch("/__/firebase/init.json");
    if (resp.ok) {
      const cfg = await resp.json();
      firebase.initializeApp(cfg);
      initialized = true;
      return;
    }
  } catch { /* fall through */ }
}

// Defer init until we get a push
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    await ensureInit();
    try {
      const data = event.data?.json() || {};
      const title = data.notification?.title || data.title || "VoiceFlow AI";
      const options = {
        body: data.notification?.body || data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: data.data || {},
      };
      await self.registration.showNotification(title, options);
    } catch (err) {
      console.error("FCM push handler error", err);
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url)) { w.focus(); return; }
      }
      return clients.openWindow(url);
    })
  );
});

// Try to initialize early so onBackgroundMessage works via the SDK too
ensureInit().then(() => {
  try {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || "VoiceFlow AI";
      const options = {
        body: payload.notification?.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: payload.data || {},
      };
      self.registration.showNotification(title, options);
    });
  } catch { /* messaging unsupported in this browser */ }
});
