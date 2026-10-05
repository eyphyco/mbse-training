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
