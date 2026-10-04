/* Service worker: makes the app start with no network.
   Online, every file is fetched fresh from the network (and the copy kept), so a deploy shows up
   on the next load with nothing to clear. Offline, or when the network does not answer in time,
   the kept copy is served. The cache is a fallback, never the first choice: that is what keeps a
   stale version from sticking. */
const CACHE = 'freehand-files-v1';
// Everything the page needs, relative to this file. A page test fails if a file in public/ is missing here.
const FILES = ['./', 'index.html', 'ui.js', 'engine.js', 'drills.js', 'canvas.js', 'store.js', 'sync.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'fonts/bricolage-grotesque.woff2', 'fonts/instrument-sans.woff2', 'fonts/ibm-plex-mono-400.woff2', 'fonts/ibm-plex-mono-500.woff2'];
const NETWORK_WAIT_MS = 4000; // a dead-slow connection should not leave a blank screen

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache, so the kept copies are the deployed ones.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), NETWORK_WAIT_MS);
      // no-cache: ask the server every time whether the file changed (Pages would otherwise serve a 10 minute old copy).
      const res = await fetch(req, { cache: 'no-cache', signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const kept = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./') : null);
      if (kept) return kept;
      throw err;
    }
  })());
});
