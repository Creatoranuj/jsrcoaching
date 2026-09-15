const CACHE_NAME = 'naveen-bharat-__NB_BUILD_SHA__';
// Precache only assets that are ACTUALLY used on first paint. The previously
// listed /branding/logo_primary_web.webp (53 KB) is orphaned in code; the
// real brand mark used by the app shell + <head> preload is /brand/nb-mark.webp.
const STATIC_ASSETS = [
  '/',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/brand/nb-mark.webp',
];

// Install — precache static shell only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // addAll is atomic — if one asset fails, nothing caches. Split '/'
      // into its own guarded add so a transient 401/5xx on the shell
      // doesn't nuke the icon/brand precache (and vice versa).
      await cache.addAll(STATIC_ASSETS.filter((u) => u !== '/')).catch(() => {});
      await cache.add('/').catch(() => {});
    })
  );
  self.skipWaiting();
});


// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — strategy per resource type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // OAuth redirect path must always hit network — never cache.
  if (url.pathname.startsWith('/~oauth')) return;

  // Never intercept Vite dev URLs or source modules — let the browser hit the
  // network directly so a re-prebundle never strands the page on a 404'd hash.
  if (
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/src/')
  ) {
    return;
  }

  // Don't cache the PWA manifest — preview returns 401 sometimes; let it self-heal.
  if (url.pathname === '/manifest.json') {
    return;
  }

  // Network-first for Supabase API calls
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // NETWORK-FIRST for hashed JS/CSS assets (prevents stale chunk errors)
  if (
    url.pathname.startsWith('/assets/') &&
    /\.(js|css)(\?|$)/.test(url.pathname)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Promise.reject('no-cache')))
    );
    return;
  }

  // Cache-first for static images, fonts, icons
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-only for HTML navigation (SPA). We intentionally do NOT cache the
  // navigation response — caching index.html pins references to old Vite
  // optimized-deps hashes and causes blank-screen after redeploys.
  if (request.mode === 'navigate') {
    // BUGFIX: `||` on two Promises always picks the first (Promises are
    // truthy). The old fallback chain therefore resolved to `undefined`
    // when '/' wasn't cached, throwing TypeError in respondWith. Use a
    // real async fallback chain with an Offline response of last resort.
    event.respondWith(
      fetch(request).catch(async () => {
        // Try the exact requested URL first (deep-link cold offline),
        // then the shell, then a dashboard fallback, then plain 503.
        const cached =
          (await caches.match(request)) ??
          (await caches.match('/')) ??
          (await caches.match('/dashboard'));
        return cached ?? new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
    );

    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
