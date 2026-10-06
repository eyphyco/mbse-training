/*
  再訪を速くし、電車の中でも読めるようにするための最小の Service Worker（DESIGN.md §10.1）。

  方針は 2 つだけ。
    - /assets/ 配下は「名前が中身を表す」（ビルドでハッシュが付く）のでキャッシュ優先。
      古いものが返る心配がない。図のレイアウト（elkjs）のチャンクが 1.4MB あり、ここが効く。
    - それ以外（index.html などの入口）はネットワーク優先。
      新しい版を出したときに古い画面が居座らないようにする。圏外ならキャッシュを返す。

  キャッシュの名前は必ず「mbse-training-」で始め、掃除も自分の接頭辞のものだけにする。
  GitHub Pages では sql-training と同じオリジン（eyphyco.github.io）に載り、
  Cache Storage はオリジン単位で共有される。sql-training の写しのまま 'sql-training-v1' を
  使っていた版は、相手の箱に書き込み、版を上げると相手のキャッシュを消す作りだった。

  更新は skipWaiting + clients.claim で即座に入れ替える。資産の名前が変わるだけなので、
  途中で入れ替わっても矛盾しない。進捗は localStorage にあり、ここでは触らない。
*/
const PREFIX = 'mbse-training-';
const CACHE = `${PREFIX}v1`;

const isHashedAsset = (url) => url.pathname.includes('/assets/');

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)),
      );
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
        const hit = await caches.match(request, { cacheName: CACHE });
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
        // 圏外。入口（./ と ./index.html）はどちらで来ても同じ中身を返す
        const cache = await caches.open(CACHE);
        const hit =
          (await cache.match(request)) ??
          (request.mode === 'navigate'
            ? await cache.match(new URL('./', self.registration.scope))
            : undefined);
        if (hit) return hit;
        throw e;
      }
    })(),
  );
});
