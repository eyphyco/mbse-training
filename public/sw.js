/*
  再訪を速くし、電車の中でも読めるようにするための最小の Service Worker。

  方針は 2 つだけ。
    - /assets/ 配下と .wasm は「名前が中身を表す」（ビルドでハッシュが付く）ので
      キャッシュ優先。古いものが返る心配がない。DuckDB の wasm は 8MB あるので、
      ここが効く。
    - それ以外（index.html などの入口）はネットワーク優先。
      新しい版を出したときに古い画面が居座らないようにする。

  更新は skipWaiting + clients.claim で即座に入れ替える。資産の名前が変わるだけなので、
  途中で入れ替わっても矛盾しない。
*/
const CACHE = 'sql-training-v1';

const isHashedAsset = (url) => url.pathname.includes('/assets/') || url.pathname.endsWith('.wasm');

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) void (await caches.open(CACHE)).put(request, res.clone());
        return res;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res.ok) void (await caches.open(CACHE)).put(request, res.clone());
        return res;
      } catch (e) {
        const hit = await caches.match(request);
        if (hit) return hit;
        throw e;
      }
    })(),
  );
});
