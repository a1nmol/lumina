/*!
 * LocalOS service worker — installability + Web Push receipt for the
 * reminder-to-post flow (MASTER_PLAN.md §4.B "reminder-to-post").
 *
 * Deliberately minimal: no offline caching/asset precaching yet (this app is
 * server-rendered + data-heavy; a caching strategy is future scope, not part
 * of this feature). Two jobs only:
 *   1. Register instantly (skipWaiting + clients.claim) so a fresh install
 *      takes over without requiring a second visit.
 *   2. Show a system notification on an incoming `push` event, and focus (or
 *      open) the queue view, deep-linked to the post, on click.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LocalOS", body: event.data.text() };
  }

  const title = payload.title || "LocalOS";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: { url: payload.url || "/calendar?view=queue" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/calendar?view=queue";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === new URL(targetUrl, self.location.origin).pathname && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
