import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './theme/ThemeProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

/*
  開いたままのタブで新しい版が出ると、古い入口が指す遅延チャンク（elk.bundled-<旧ハッシュ>.js）は
  GitHub Pages から消えて 404 になる。実際に「図を描けませんでした: Failed to fetch dynamically
  imported module」が出た（2026-10-12）。Vite は動的 import の失敗で vite:preloadError を投げるので、
  ここで 1 回だけ読み直して新しい入口を取りに行く。
  間隔を空けずに読み直しを繰り返さないよう、直前に読み直していたら（圏外など、読み直しても
  直らない場合）そのまま失敗させ、図の側のエラー表示に任せる。
*/
const RELOADED_AT = 'mbse-training:preload-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  if (!navigator.onLine) return;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED_AT)) || 0;
  } catch {
    return; // 印を残せないなら、読み直しが止まらない恐れがあるのでやらない
  }
  if (Date.now() - last < 10_000) return;
  try {
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

/*
  再訪と、電車の中での学習のために資産を持っておく（public/sw.js）。
  開発中は登録しない（更新のたびに古いものを掴むと分かりにくいため）。
*/
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 使えない環境（プライベートモード等）でも学習は続けられる */
    });
  });
}
