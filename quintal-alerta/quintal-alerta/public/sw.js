self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* payload inválido */ }
  event.waitUntil(
    self.registration.showNotification(d.title || "🎟️ QUINTAL BUTIÁ", {
      body: d.body || "Ingressos disponíveis!",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || "quintal",
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
