// Service Worker Ooble : notifications push, et mise à jour des fenêtres du back-office.
// Ce fichier reçoit un numéro à chaque publication (voir vite.config.ts) : le navigateur voit donc
// un nouveau service worker à chaque mise en ligne, dès qu'une page du site s'ouvre quelque part.
// Nouvelle version active tout de suite (pas d'attente de fermeture des onglets).
let replacing = false;
self.addEventListener("install", () => {
  // Une version précédente tournait déjà : c'est une mise à jour (et non une première visite).
  replacing = !!self.registration.active;
  self.skipWaiting();
});
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  await self.clients.claim();
  if (!replacing) return;
  // Fenêtres du back-office encore ouvertes sur une ancienne version (même vieille de plusieurs jours) :
  // elles se rechargent sur la nouvelle. L'app des clients se met à jour d'elle-même, sans interrompre un achat.
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const w of wins) {
    const path = new URL(w.url).pathname;
    if ((path === "/admin" || path.startsWith("/admin/") || path.startsWith("/en/admin")) && "navigate" in w) w.navigate(w.url).catch(() => {});
  }
})()));

self.addEventListener("push", (event) => {
  let payload = { title: "Ooble", body: "", url: "/app" };
  try { payload = { ...payload, ...event.data.json() }; } catch { /* message sans contenu */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
      tag: payload.url,
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
