// Service Worker：离线缓存（由 build.js 生成 dist/sw.js，缓存版本号每次发布自动更新）
const CACHE = 'notes-f3d2c3cc70';
const CORE = ['/', '/assets/style.css', '/assets/main.js', '/search.json', '/manifest.webmanifest', '/assets/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
  // 有登录的网站还要缓存账号文件；没有的话忽略
  caches.open(CACHE).then((c) => c.add('/auth.json').catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// 网络优先（3 秒超时），失败则用缓存；页面、搜索数据都能离线打开
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('/')) || Response.error();
    return Response.error();
  }
}

// 静态资源：先用缓存秒开，后台再更新
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || update;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isAsset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/images/');
  e.respondWith(isAsset ? staleWhileRevalidate(e.request) : networkFirst(e.request));
});
