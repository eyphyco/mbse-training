/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * CSP を index.html に埋める。
 *
 * GitHub Pages はレスポンスヘッダを足せないので meta で入れる。
 * このアプリは外部と通信せず HTML も差し込まないため、これは多層防御。
 *
 * 配色の先読みスクリプトだけインライン（描画前に走らせる必要がある）なので、
 * その内容から sha256 を計算して許可する。手で書くと index.html を触るたびに
 * ずれるため、ビルド時に出す。
 *
 * frame-ancestors は meta では効かない（ヘッダ専用）。クリックジャッキング
 * 対策が要るなら、ヘッダを足せる配信元へ移す必要がある。
 */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
        );
        const policy = [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "form-action 'none'",
          `script-src 'self' ${hashes.join(' ')}`,
          "worker-src 'self' blob:",
          // Motion と図のレンダラが style を実行時に差し込む
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self'",
        ].join('; ');
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

// base は相対パスにしてある。GitHub Pages のプロジェクトページ
// (https://<user>.github.io/<repo>/) でもリポジトリ名を設定に埋め込まずに動く。
// ルーティングは HashRouter を使うので、Pages 側の 404 リライト設定も不要。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspMeta()],
  build: {
    target: 'esnext',
  },
  test: {
    // localStorage / sessionStorage / document を使うモジュールがあるため
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    // 次回出題日の丸めを確かめるので、実行環境の時間帯を固定する
    env: { TZ: 'Asia/Tokyo' },
  },
});
