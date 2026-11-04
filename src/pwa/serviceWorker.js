/* Blanky service worker. vite.config.ts fills the build tokens and emits /sw.js.
   Only the app shell and same-origin static files are cached. Supabase, Google
   and Edge Function requests always go to the network, so data stays live. */
const VERSION = '__BLANKY_SW_VERSION__'
const PRECACHE = __BLANKY_PRECACHE__
const SHELL = '/index.html'
const STATIC_CACHE = 'blanky-static-' + VERSION
const RUNTIME_CACHE = 'blanky-runtime-' + VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('blanky-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

// The page asks a waiting worker to take over after the user accepts the update.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations: network first so OAuth returns and deploys are never stale;
  // the cached shell keeps the installed app opening offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) (await caches.open(STATIC_CACHE)).put(SHELL, response.clone())
        return response
      } catch {
        return (await caches.match(SHELL)) ?? Response.error()
      }
    })())
    return
  }

  // Hashed build files never change; everything else revalidates in the background.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) (await caches.open(RUNTIME_CACHE)).put(request, response.clone())
      return response
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    const network = fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(RUNTIME_CACHE)).put(request, response.clone())
      return response
    })
    if (cached) {
      event.waitUntil(network.catch(() => undefined))
      return cached
    }
    return network
  })())
})
