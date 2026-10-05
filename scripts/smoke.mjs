#!/usr/bin/env node
/**
 * ブラウザでの疎通確認（要: vite preview か dev サーバが起動していること）
 *   node scripts/smoke.mjs [baseUrl]
 *
 * 画面が増えたらここに足していく。今は足場と記法見本（図のレンダラ）の分。
 *
 * この環境では Playwright が既定で起動しない。CLAUDE.md の「この環境の罠」を見ること。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const syllabus = JSON.parse(readFileSync(join(root, 'src/data/syllabus.json'), 'utf8'));
const itemCount = syllabus.exams.reduce(
  (n, e) => n + e.areas.reduce((m, a) => m + a.groups.reduce((k, g) => k + g.items.length, 0), 0),
  0,
);

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  const text = await page.locator('main').innerText();
  check('ホームが表示される', text.includes('学習の進捗'));
  check('出題範囲が読める', text.includes(`${itemCount} 項目`), `${itemCount} 項目`);
  check('試験の要項が出る', text.includes('90 問') && text.includes('135 分'));

  /*
    下地は写真、前景は不透明（sql-training から引き継いだ作り）。
    透ける面が 1 つでも残ると、その上の文字だけコントラストが場所で変わり、
    contrast の測定値が当てにならなくなる。
  */
  const surfaces = await page.evaluate(() => {
    const alpha = (c) => {
      const m = /^rgba?\(([^)]+)\)$/.exec(c);
      if (!m) return null;
      const parts = m[1].split(/[,/]/).map((v) => Number(v.trim()));
      return parts.length >= 4 ? parts[3] : 1;
    };
    const of = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { alpha: alpha(cs.backgroundColor), blur: cs.backdropFilter };
    };
    return {
      panel: of('.panel'),
      chrome: of('.panel-chrome'),
      photo: getComputedStyle(document.body).backgroundImage,
    };
  });
  check('カードが下地を透かさない', surfaces.panel?.alpha === 1 && surfaces.panel.blur === 'none');
  check(
    'ヘッダが下地を透かさない',
    surfaces.chrome?.alpha === 1 && surfaces.chrome.blur === 'none',
  );
  check('下地に写真が敷かれる', /url\(/.test(surfaces.photo) && /gradient\(/.test(surfaces.photo));

  // 配色の切り替え（3 状態のセグメンテッドコントロール）
  await page.click('button[aria-label="ダーク"]');
  await page.waitForTimeout(500);
  check('ダークに切り替わる', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await page.click('button[aria-label="ライト"]');
  await page.waitForTimeout(500);
  check('ライトに戻る', (await page.getAttribute('html', 'data-theme')) === 'light');

  // まだ無い画面も、何が入るかを出して白紙にしない
  await page.goto(`${base}#/board`, { waitUntil: 'networkidle' });
  check(
    '未実装の画面も行き先を説明する',
    (await page.locator('main').innerText()).includes('出題範囲ボード'),
  );

  /*
    記法見本（図のレンダラ）。図は製品の心臓なので、描けたかだけでなく
    **文字が箱に収まっているか**を実描画で測る。レイアウトは canvas で測った幅で
    箱を作るが、svg の文字が別のフォントで描かれると食い違う（その検出）。
  */
  const notation = JSON.parse(readFileSync(join(root, 'src/data/notation/bdd.json'), 'utf8'));
  await page.goto(`${base}#/notation`, { waitUntil: 'networkidle' });
  await page
    .locator('[data-testid=diagram][data-status=ready]')
    .nth(notation.length - 1)
    .waitFor({ timeout: 10000 });
  const dg = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('[data-testid=diagram] svg')];
    const overflow = [];
    for (const svg of svgs) {
      // 箱（g の直下の rect）と、その g の直下の文字。ポートの名前は箱の外に置くので対象外
      for (const g of svg.querySelectorAll('g[data-kind=node]')) {
        const rect = g.querySelector(':scope > rect.dg-box');
        const texts = g.querySelectorAll(':scope > text');
        const r = rect.getBBox();
        for (const t of texts) {
          const b = t.getBBox();
          if (b.x < r.x || b.x + b.width > r.x + r.width + 0.5)
            overflow.push(`${g.dataset.ref}: ${t.textContent}`);
        }
      }
    }
    const all = svgs.map((s) => s.textContent).join(' ');
    return {
      count: svgs.length,
      overflow,
      header: all.includes('bdd') && all.includes('[package]'),
      filled: document.querySelectorAll('[data-testid=diagram] polygon.dg-solid').length,
      hollow: document.querySelectorAll('[data-ref^="agg:"] polygon.dg-box').length,
      caption: document.querySelector('[data-testid=diagram] figcaption')?.textContent ?? '',
    };
  });
  check(
    '記法見本の図がすべて描ける',
    dg.count === notation.length,
    `${dg.count} / ${notation.length}`,
  );
  check('図枠のヘッダが付く', dg.header);
  check(
    '図の文字が箱からはみ出さない',
    dg.overflow.length === 0,
    dg.overflow.slice(0, 3).join(' / '),
  );
  check('黒ひし形は塗り、白ひし形は中抜き', dg.filled > 0 && dg.hollow > 0);
  check('図に読み上げ用の控えが付く', dg.caption.includes('黒ひし形'));

  check('コンソールにエラーが出ない', errors.length === 0, errors.slice(0, 2).join(' / '));
} catch (e) {
  check('通し操作', false, String(e).split('\n')[0]);
}

await browser.close();
const ng = results.filter((r) => !r).length;
console.log(`\n${results.length - ng} / ${results.length} passed`);
process.exit(ng === 0 ? 0 : 1);
