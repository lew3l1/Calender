const CACHE_NAME = "calender-static-v1";
const APP_SHELL = ["./", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Only static app-shell assets are cached. Private API/auth responses are deliberately never cached.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.includes("/rest/") || url.pathname.includes("/auth/") || url.pathname.includes("/functions/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./")));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Calender", body: "У вас скоро событие.", url: "./" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Calender", {
      body: payload.body || "У вас скоро событие.",
      icon: "./icon.svg",
      badge: "./icon.svg",
      tag: payload.tag || "calender-reminder",
      data: { url: payload.url || "./" },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const match = clients.find((client) => client.url === target);
      return match ? match.focus() : self.clients.openWindow(target);
    })
  );
});