/* =========================================================
   SERVICE WORKER — Doce Lucro (PWA Offline / Updates Safe) — FIXED
   - App Shell precache (sem redirect)
   - Navigation: network-first + fallback index.html (não cacheia por URL)
   - Critical files: network-first (evita versão antiga)
   - Static assets: cache-first
   - Safer update flow: VERSION bump + SKIP_WAITING
========================================================= */

const VERSION = "v1.0.4"; // ✅ BUMP SEMPRE que publicar update
const PREFIX = "doce-lucro";
const PRECACHE = `${PREFIX}-precache-${VERSION}`;
const RUNTIME = `${PREFIX}-runtime-${VERSION}`;

/** URL absoluta respeitando scope (subpasta/preview/vercel) */
function u(path) {
  return new URL(path, self.registration.scope).toString();
}

/** App Shell essencial (sem "./" para evitar redirect) */
const APP_SHELL = [
  u("./index.html"),

  // CSS
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
];

/* ---------------------------
   INSTALL: precache shell
--------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);

      for (const url of APP_SHELL) {
        try {
          // evita cache de redirects/erros durante precache
          const res = await fetch(url, { cache: "no-store" });
          if (res && res.status >= 200 && res.status < 300 && !res.redirected) {
            await cache.put(url, res.clone());
          }
        } catch (e) {
          console.warn("[SW] Falha ao precache:", url, e);
        }
      }

      await self.skipWaiting();
    })()
  );
});

/* ---------------------------
   ACTIVATE: clean + claim + nav preload
--------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          const isOurs = key.startsWith(`${PREFIX}-`);
          const keep = key === PRECACHE || key === RUNTIME;
          return isOurs && !keep ? caches.delete(key) : undefined;
        })
      );

      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {}
      }

      await self.clients.claim();
    })()
  );
});

/* ---------------------------
   MESSAGE: force update
--------------------------- */
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

/* ---------------------------
   HELPERS
--------------------------- */
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
    p.endsWith(".ico") ||
    p.endsWith(".woff") ||
    p.endsWith(".woff2")
  );
}

function isCritical(url) {
  const p = url.pathname;
  // ⚠️ NÃO inclui sw.js (pra não atrapalhar update)
  return (
    p.endsWith("/index.html") ||
    p.endsWith("/styles/styles.css") ||
    p.endsWith("/src/app.js") ||
    p.endsWith("/src/ui.js") ||
    p.endsWith("/src/state.js") ||
    p.endsWith("/src/db.js") ||
    p.endsWith("/src/supabase.js") ||
    p.endsWith("/manifest.webmanifest")
  );
}

/** Cache match que suporta query (?v=1) */
async function matchAny(requestOrUrl) {
  const exact = await caches.match(requestOrUrl);
  if (exact) return exact;

  const ignore = await caches.match(requestOrUrl, { ignoreSearch: true });
  if (ignore) return ignore;

  return null;
}

/**
 * Cache PUT seguro:
 * - só guarda OK
 * - evita redirect
 * - evita opaque
 */
async function cachePutSafe(cacheName, request, response) {
  try {
    if (!response) return;
    if (!(response.status >= 200 && response.status < 300)) return;
    if (response.redirected) return;
    if (response.type === "opaque") return;

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {}
}

/* ---------------------------
   FETCH
--------------------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Só dentro do scope
  const scopeUrl = new URL(self.registration.scope);
  const inScope = url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
  if (!inScope) return;

  // ✅ NÃO intercepta o próprio sw.js (evita update travar)
  if (url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // ✅ NAVIGATION: network-first + fallback index.html (NÃO cacheia por URL de rota)
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;

          // pega sempre o HTML mais novo
          const fresh = await fetch(request, { cache: "no-store" });
          return fresh;
        } catch (_) {
          // fallback pro shell (index.html)
          const cachedShell = await matchAny(u("./index.html"));
          if (cachedShell) return cachedShell;

          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // ✅ CRITICAL: network-first (e cacheia a versão boa)
  if (isCritical(url)) {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) {
            await cachePutSafe(RUNTIME, request, preloaded);
            return preloaded;
          }

          const fresh = await fetch(request, { cache: "no-store" });
          await cachePutSafe(RUNTIME, request, fresh);
          return fresh;
        } catch (_) {
          const cached = await matchAny(request);
          if (cached) return cached;

          return new Response("Offline - arquivo crítico não disponível", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // ✅ STATIC ASSETS: cache-first (+ ignoreSearch)
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await matchAny(request);
        if (cached) return cached;

        try {
          const fresh = await fetch(request);
          await cachePutSafe(RUNTIME, request, fresh);
          return fresh;
        } catch (_) {
          return new Response("Offline - asset não disponível", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // ✅ OTHER GETs: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await matchAny(request);

      const fetchPromise = (async () => {
        try {
          const fresh = await fetch(request);
          await cachePutSafe(RUNTIME, request, fresh);
          return fresh;
        } catch {
          return null;
        }
      })();

      return (
        cached ||
        (await fetchPromise) ||
        new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      );
    })()
  );
});