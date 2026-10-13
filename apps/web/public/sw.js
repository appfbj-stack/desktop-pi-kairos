// Service worker minimo (PWA install). Sem cache agressivo - backend centralizado.
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", () => {
  // Network-only. Banco fica no servidor, sem cache de dados sensiveis.
});
