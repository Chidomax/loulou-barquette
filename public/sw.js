/* Loulou Barquette – service worker de l'application mobile.
 * Pages : réseau d'abord (toujours la dernière version du site), page hors connexion en secours.
 * Fichiers statiques du site (scripts, styles, icônes, polices) : cache d'abord, pour un démarrage rapide.
 * Rien n'est mis en cache pour les commandes, les paiements ou les comptes (autres domaines ou requêtes non GET). */
const VERSION = 'lb-v1'
const STATIC = `${VERSION}-static`
const PRECACHE = ['/offline.html', '/icon-192.png', '/icon-512.png', '/logo512.png', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isStaticAsset = (url) =>
  url.origin === self.location.origin && (/^\/assets\//.test(url.pathname) || /\.(png|webp|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname))
const isFont = (url) => url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com'

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Pages du site : réseau d'abord, page hors connexion si pas de réseau
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }

  // Fichiers statiques et polices : cache d'abord
  if (isStaticAsset(url) || isFont(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
  // Tout le reste (base de données, paiements, cartes) passe directement par le réseau
})

// Clic sur une notification : ouvre (ou ramène au premier plan) la page concernée
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(target); return c.focus() }
      return self.clients.openWindow(target)
    }),
  )
})
