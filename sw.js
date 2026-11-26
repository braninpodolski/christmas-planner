// Offline support. Every app file is cached together as one version, so an update can never
// mix old and new modules. Bump CACHE whenever app files change so installed copies update.
const CACHE = 'xmas-v19';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './css/base.css', './css/desktop.css', './css/layout.css', './css/lists.css', './css/sheets.css',
  './js/actions.js', './js/calendar.js', './js/cloud-core.js', './js/cloud.js', './js/components.js', './js/constants.js', './js/data.js',
  './js/datefields.js', './js/dates.js', './js/desktop.js', './js/event-sheet.js', './js/firebase-config.js', './js/forms.js',
  './js/gift-drag.js', './js/ics.js', './js/identity.js', './js/main.js', './js/nav.js',
  './js/pages.js', './js/passjoin.js', './js/sheets.js', './js/store.js', './js/sync.js',
  './js/util.js',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const APP_PATHS = new Set(ASSETS.map(u => new URL(u, self.registration.scope).pathname));

self.addEventListener('install', e => {
  // fetch fresh copies (not the browser's HTTP cache) and store them all, or none
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return; // never touch GitHub, Firebase or sign-in traffic
  // only the app's own files: other pages on this site (like the sign-in test) load straight from the network
  if (sameOrigin && !APP_PATHS.has(url.pathname)) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: sameOrigin });
    if (cached) return cached; // this version's copy; a new version arrives with a new service worker
    const res = await fetch(e.request);
    if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
    return res;
  }));
});
