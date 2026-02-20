/* =========================================================
   SERVICE WORKER — PWA OFFLINE SUPPORT (Doce Lucro)
   - App Shell precache
   - Navigation fallback to index.html
   - Cache-first for static assets
   - Safer updates via version bump
========================================================= */

const VERSION = "v1.0.0"; // 👈 mude quando publicar update
const PRECACHE = `doce-lucro-precache-${VERSION}`;
const RUNTIME = `doce-lucro-runtime-${VERSION}`;

/**
 * Monta URL absoluta respeitando o escopo (subpasta, preview etc.)
 */
function u(path) {
  return new URL(path, self.registration.scope).toString();
}

/**
 * App Shell (o essencial para o app abrir offline)
 */
const PRECACHE_URLS = [
  u("./"),                 // scope root
  u("./index.html"),
  u("./styles/styles.css"),
  u("./src/app.js"),
  u("./src/state.js"),
  u("./src/ui.js"),
  u("./src/db.js"),
  u("./manifest.webmanifest"),
  // Se você tiver ícones essenciais, coloque aqui também:
  // u("./assets/icons/icon-192.png"),
];

/* Install: precache app shell */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);

    // Cacheia um por um (evita falhar tudo por 1 arquivo)
    for (const url of PRECACHE_URLS) {
      try {
        await cache.add(url);
      } catch (e) {
        // Não mata o install; mas é bom saber no devtools
        // (em produção você pode remover o console)
        console.warn("[SW] Falha ao precache:", url, e);
      }
    }

    await self.skipWaiting();
  })());
});

/* Activate: limpa caches antigos */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        if (key !== PRECACHE && key !== RUNTIME) {
          return caches.delete(key);
        }
      })
    );

    await self.clients.claim();
  })());
});

/**
 * Helpers
 */
function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
}

function isStaticAsset(url) {
  return (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  );
}

/* Fetch */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Só tratar requests dentro do escopo do SW
  // (evita mexer em requests externos)
  const scopeUrl = new URL(self.registration.scope);
  const inScope = url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);

  if (!inScope) {
    // Para externos: deixa ir direto (ou você pode cachear fonts depois)
    return;
  }

  // Navegação: network-first com fallback do index.html
  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        // offline: tenta cache da navegação, senão cai pro index.html (app shell)
        const cachedNav = await caches.match(request);
        if (cachedNav) return cachedNav;

        const cachedShell = await caches.match(u("./index.html"));
        if (cachedShell) return cachedShell;

        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // Assets estáticos: cache-first (rápido e bom offline)
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        return new Response("Offline - asset não disponível", {
          status: 503,
          headers: { "Content-Type": "text/plain" }
        });
      }
    })());
    return;
  }

  // Outros GETs: stale-while-revalidate simples
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const fetchPromise = fetch(request)
      .then(async (fresh) => {
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      })
      .catch(() => null);

    return cached || (await fetchPromise) || new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain" }
    });
  })());
});