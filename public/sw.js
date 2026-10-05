// LMIROS service worker — phone notifications only. No offline caching: the
// app is live data, and a cached page is exactly what made saves look lost.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "LMIROS", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "LMIROS", {
      body: msg.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: msg.tag || undefined,
      renotify: !!msg.tag,
      data: { url: msg.url || "/" },
    })
  );
});

// Tap → focus an open LMIROS window on that page, or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) return w.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
