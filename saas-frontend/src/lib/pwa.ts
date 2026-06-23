"use client";

/**
 * PWA helpers — service worker registration, install prompt management,
 * and Firebase Cloud Messaging token acquisition.
 */

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import app, { db } from "@/lib/firebase";

// Stash the beforeinstallprompt event so a UI control can show it later.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(canInstall: boolean) => void>();

function broadcastInstall(canInstall: boolean) {
  installListeners.forEach((l) => l(canInstall));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    broadcastInstall(true);
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    broadcastInstall(false);
  });
}

export function onInstallAvailable(cb: (canInstall: boolean) => void): () => void {
  installListeners.add(cb);
  cb(!!deferredInstallPrompt);
  return () => { installListeners.delete(cb); };
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredInstallPrompt) return "unavailable";
  await deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  broadcastInstall(false);
  return choice.outcome;
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Wait until after the page loads — don't contend with hydration.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed", err);
    });
    // Register the FCM SW at its OWN scope. Registering it at the default root
    // scope ("/") clobbers the app-shell sw.js registration — the two then
    // flip-flop active/waiting on every load, leaving a permanent `reg.waiting`
    // and a "new version available" banner that never clears. The dedicated
    // scope is the one Firebase Messaging uses by convention.
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js", { scope: "/firebase-cloud-messaging-push-scope" })
      .catch(() => null);
  });
}

/**
 * Ask the user for notification permission and return an FCM registration
 * token, stored on `users/{uid}.fcmTokens` so the backend can push later.
 */
export async function requestPushPermission(uid: string): Promise<{ ok: boolean; reason?: string; token?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "Server-side" };
  if (!(await isSupported().catch(() => false))) return { ok: false, reason: "Push not supported in this browser" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: `Permission ${perm}` };
  try {
    const messaging = getMessaging(app);
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return { ok: false, reason: "NEXT_PUBLIC_FIREBASE_VAPID_KEY not configured" };
    const token = await getToken(messaging, { vapidKey });
    if (!token) return { ok: false, reason: "No FCM token returned" };
    await setDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) }, { merge: true });
    // Listen for foreground messages and show notification via the SW
    onMessage(messaging, (payload) => {
      const reg = navigator.serviceWorker.controller;
      if (!reg) return;
      reg.postMessage({
        type: "SHOW_NOTIFICATION",
        title: payload.notification?.title || "VoiceFlow AI",
        options: {
          body: payload.notification?.body || "",
          icon: "/icons/icon-192.png",
          data: payload.data || {},
        },
      });
    });
    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Unknown error" };
  }
}
