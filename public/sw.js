/* 班主任工作台 · Service Worker
 *
 * 为什么需要它：Chrome 判断「可安装」时要求页面注册了带 fetch 事件处理器的 SW。
 * 数据存在本机 IndexedDB，服务器只发静态文件，所以这里刻意不缓存 HTML 和 _next 产物：
 * 一旦缓存住旧页面，覆盖部署之后老师看到的还是旧界面，比"离线可看"更要紧。
 * 只对图标、清单、截图这类不会变味的静态资源做 cache-first，让安装体验更稳定。
 */

const CACHE = 'bzh-pwa-static-v1';

// 命中这些路径的 GET 请求才进缓存
const CACHE_FIRST = [
  /^\/icons\//,
  /^\/screenshots\//,
  /^\/manifest\.webmanifest$/,
  /^\/favicon\.ico$/,
];

self.addEventListener('install', (event) => {
  // 立刻接管，避免旧版本 SW 卡住更新
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 只处理同源 GET；Supabase 等跨域请求、以及所有写请求一律放行
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!CACHE_FIRST.some((re) => re.test(url.pathname))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (err) {
        const fallback = await cache.match(req);
        if (fallback) return fallback;
        throw err;
      }
    })()
  );
});
