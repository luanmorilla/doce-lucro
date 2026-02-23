/* =========================================================
   SERVICE WORKER — PWA OFFLINE SUPPORT (Doce Lucro)
   - App Shell precache
   - Navigation fallback to index.html
   - Network-first for critical files (updates)
   - Cache-first for static assets
   - Safer updates via version bump
========================================================= */

const VERSION = "v1.0.1"; // ✅ BUMP SEMPRE que publicar update
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
  u("./"),
  u("./index.html"),
  u("./styles/styles.css"),
  u("./src/app.js"),
  u("./src/state.js"),
  u("./src/ui.js"),
  u("./src/db.js"),
  u("./manifest.webmanifest"),
  // ✅ se o arquivo existir mesmo, pode descomentar:
  // u("./assets/icons/icon-192.png"),
];

/* Install: precache app shell */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);

    for (const url of PRECACHE_URLS) {
      try {
        await cache.add(url);
      } catch (e) {
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
        if (key !== PRECACHE && key !== RUNTIME) return caches.delete(key);
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

/**
 * ✅ Arquivos críticos: sempre tentar pegar o mais novo (network-first)
 */
function isCritical(url) {
  const p = url.pathname;
  return (
    p.endsWith("/index.html") ||
    p.endsWith("/styles/styles.css") ||
    p.endsWith("/src/app.js") ||
    p.endsWith("/src/ui.js") ||
    p.endsWith("/src/state.js") ||
    p.endsWith("/src/db.js") ||
    p.endsWith("/manifest.webmanifest") ||
    p.endsWith("/sw.js")
  );
}

/* Fetch */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const scopeUrl = new URL(self.registration.scope);
  const inScope = url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);

  if (!inScope) return;

  // ✅ Navegação: network-first + fallback index.html
  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        const cachedNav = await caches.match(request);
        if (cachedNav) return cachedNav;

        const cachedShell = await caches.match(u("./index.html"));
        if (cachedShell) return cachedShell;

        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // ✅ Críticos: network-first (pra não travar em versão velha)
  if (isCritical(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response("Offline - arquivo crítico não disponível", {
          status: 503,
          headers: { "Content-Type": "text/plain" }
        });
      }
    })());
    return;
  }

  // Assets estáticos: cache-first
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