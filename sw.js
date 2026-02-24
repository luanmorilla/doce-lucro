/* =========================================================
   SERVICE WORKER — PWA OFFLINE SUPPORT (Doce Lucro)
   - App Shell precache
   - Navigation fallback to index.html
   - Network-first for critical files (updates)
   - Cache-first for static assets
   - Safer updates via version bump
   ✅ Fix: suporta URLs com query (?v=1) via ignoreSearch
========================================================= */

const VERSION = "v1.0.2"; // ✅ BUMP SEMPRE que publicar update
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
 * ✅ Inclui variações com query, pois seu index usa styles.css?v=1
 */
const PRECACHE_URLS = [
  u("./"),
  u("./index.html"),

  // CSS (com e sem query)
  u("./styles/styles.css"),
  u("./styles/styles.css?v=1"),

  // JS principais
  u("./src/app.js"),
  u("./src/state.js"),
  u("./src/ui.js"),
  u("./src/db.js"),
  u("./src/supabase.js"),

  // Manifest
  u("./manifest.webmanifest"),

  // ✅ se existir mesmo, descomente:
  // u("./assets/icons/icon-192.png"),
];

/* Install: precache app shell */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);

      for (const url of PRECACHE_URLS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn("[SW] Falha ao precache:", url, e);
        }
      }

      // ativa assim que instala
      await self.skipWaiting();
    })()
  );
});

/* Activate: limpa caches antigos */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (key !== PRECACHE && key !== RUNTIME ? caches.delete(key) : undefined)));

      await self.clients.claim();
    })()
  );
});

/**
 * ✅ Permite forçar update do SW via postMessage:
 * navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" })
 */
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Helpers
 */
function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

function isStaticAsset(url) {
  const p = url.pathname;
  return (
    p.endsWith(".css") ||
    p.endsWith(".js") ||
    p.endsWith(".webmanifest") ||
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".webp") ||
    p.endsWith(".svg") ||
    p.endsWith(".ico")
  );
}

/**
 * ✅ Arquivos críticos: sempre tentar pegar o mais novo (network-first)
 * Observação: usa pathname (ignora query), então funciona com ?v=1
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
    p.endsWith("/src/supabase.js") ||
    p.endsWith("/manifest.webmanifest") ||
    p.endsWith("/sw.js")
  );
}

/**
 * ✅ Cache match que suporta query (?v=1) e diferentes versões de URL
 */
async function matchAny(requestOrUrl) {
  // 1) tenta match exato
  const exact = await caches.match(requestOrUrl);
  if (exact) return exact;

  // 2) tenta ignorar query string
  const ignore = await caches.match(requestOrUrl, { ignoreSearch: true });
  if (ignore) return ignore;

  return null;
}

/* Fetch */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const scopeUrl = new URL(self.registration.scope);
  const inScope = url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
  if (!inScope) return;

  // ✅ Navegação: network-first + fallback index.html (ignora query)
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: "no-store" });
          const cache = await caches.open(RUNTIME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (_) {
          const cachedNav = await matchAny(request);
          if (cachedNav) return cachedNav;

          const cachedShell = await matchAny(u("./index.html"));
          if (cachedShell) return cachedShell;

          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // ✅ Críticos: network-first (pra não travar em versão velha)
  if (isCritical(url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: "no-store" });
          const cache = await caches.open(RUNTIME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (_) {
          const cached = await matchAny(request);
          if (cached) return cached;

          return new Response("Offline - arquivo crítico não disponível", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // ✅ Assets estáticos: cache-first (com suporte a ?v=1)
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await matchAny(request);
        if (cached) return cached;

        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (_) {
          return new Response("Offline - asset não disponível", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // Outros GETs: stale-while-revalidate simples
  event.respondWith(
    (async () => {
      const cached = await matchAny(request);

      const fetchPromise = fetch(request)
        .then(async (fresh) => {
          const cache = await caches.open(RUNTIME);
          cache.put(request, fresh.clone());
          return fresh;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    })()
  );
});