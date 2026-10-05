/**
 * 配色のコントラスト比を、実際に描画されたピクセルから測る。
 * 測る対象は画面が増えるたびに足す。
 *
 * 面は不透明になったが、それでもトークンの値だけでは足りない。
 * *-soft（色の膜）や下地の写真の上に直接載る文字があり、実際の地は
 * 重なった結果でしか決まらないので、スクリーンショットを撮って読む。
 * 明暗の両端を前景・背景と見なし、アンチエイリアスの外れ値を落とす。
 *
 * 使い方: node scripts/contrast.mjs [base-url]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const MIN = 4.5; // WCAG AA（通常サイズの文字）
const SCALE = 2;

/** 画像の一部を読み、明暗の両端からコントラスト比を出す */
function ratioOfRegion([base64, box]) {
  return (async () => {
    // CSP の connect-src が data: を許していないので fetch は使わず、自前で復号する
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(img.width, img.height);
    const cx = canvas.getContext('2d');
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(box.x, box.y, box.w, box.h).data;
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const ls = [];
    for (let i = 0; i < data.length; i += 4) {
      ls.push(0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]));
    }
    ls.sort((a, b) => a - b);
    /*
      端は「割合」ではなく「枚数」で取る。

      文字が箱に占める面積は箱の大きさで変わるので、1 パーセンタイルの
      ような割合だと、広い箱に短い文が載ったときにサンプルが文字の芯を
      通り越してアンチエイリアスの傾斜に入り、実際より低く出る
      （幅 1000px の判定パネルの見出しで、芯は rgb(176,38,54)=4.66:1
      なのに、1% の位置は縁の rgb(190,79,90) で 3.32:1 に見えていた）。

      枚数を決め打ちし、その中央値を取る。1 点だけの外れ値にも引かれない。
    */
    const edge = Math.min(400, Math.max(24, Math.round(ls.length * 0.002)));
    const mid = (part) => part[Math.floor(part.length / 2)];
    const lo = mid(ls.slice(0, edge));
    const hi = mid(ls.slice(-edge));
    return (hi + 0.05) / (lo + 0.05);
  })();
}

const rows = [];
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1150 },
    deviceScaleFactor: SCALE,
  });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('mbse-training:theme', t), theme);

  const measure = async (label, selector, nth = 0) => {
    const loc = page.locator(selector).nth(nth);
    if ((await page.locator(selector).count()) <= nth) throw new Error(`見つからない: ${selector}`);
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const shot = await page.screenshot();
    const r = await loc.boundingBox();
    const box = {
      x: Math.round(r.x * SCALE),
      y: Math.round(r.y * SCALE),
      w: Math.round(r.width * SCALE),
      h: Math.round(r.height * SCALE),
    };
    const ratio = await page.evaluate(ratioOfRegion, [shot.toString('base64'), box]);
    rows.push([theme, label, ratio]);
  };

  const open = async (path) => {
    await page.goto(`${base}/#${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
  };

  /*
    すりガラスの板の上の文字は、地が「透けた写真 + 板の色」で決まる。
    トークンの値だけでは分からないので、画面ごとに実際に描かれたものを測る。
  */
  await open('/');
  await measure('見出し (fg)', 'main h1');
  await measure('節の副題 (muted)', 'main h2 + span');
  await measure('網羅の比率 (accent)', 'main span.text-accent');
  await measure('札の補足 (muted)', '[data-testid=today] li span.text-tiny');
  await measure('主ボタンの白文字 (gradient)', '[data-testid=start-today]');
  await measure('ナビの現在地 (accent)', 'header nav a[aria-current="page"]');
  await measure('ナビの他 (muted)', 'header nav a:not([aria-current])', 1);
  await measure('データの所在 (rose)', '[data-testid=data-badge]');

  await open('/board?item=mu-association');
  await measure('レーン名 (fg)', '[data-testid=lane-untouched] h2');
  await measure('レーンの副題 (muted)', '[data-testid=lane-untouched] h2 + span');
  await measure('空レーンの文 (muted)', '[data-testid=lane-dropped] .border-dashed');
  await measure('札の名前 (fg)', '[data-item] span.line-clamp-2');
  await measure('札の補足 (muted)', '[data-item="mu-ibd-purpose"] span.text-micro');
  await measure('詳細の項目名 (muted)', '[data-testid=detail] dt');
  await measure('タブの現在地 (accent)', '[data-testid=detail] [role=tab][aria-selected=true]');

  await open('/learn/bdd');
  await measure('本文 (fg)', '[data-testid=section-bdd-purpose] .md p');
  await measure('表の見出し (muted)', '[data-testid=section-bdd-purpose] .md th');
  await measure('初出の語の札 (purple)', '[data-testid=section-bdd-purpose] p.text-tiny');

  /*
    図の中の文字。地は紙（dg-paper）か札（dg-tab）で、どちらも不透明。
    文字 1 つの箱を測るので、明暗の両端がそのまま文字と地になる。
  */
  await open('/notation');
  await page.locator('[data-testid=diagram][data-status=ready]').first().waitFor();
  await measure('図枠のヘッダ (dg-tab)', 'figure svg text', 1);
  await measure('図の区画の行 (dg-ink)', 'figure svg [data-ref="Vehicle"] > text', 3);
  await measure('図の多重度 (dg-ink)', 'figure svg [data-ref="comp:Vehicle-Wheel"] > text', 0);

  await ctx.close();
}
await browser.close();

let low = 0;
for (const [theme, label, ratio] of rows) {
  const ok = ratio >= MIN;
  if (!ok) low += 1;
  console.log(
    `${ok ? 'OK  ' : 'LOW '} ${theme.padEnd(5)} ${label.padEnd(24)} ${ratio.toFixed(2)}:1`,
  );
}
console.log(low === 0 ? `\n${rows.length} 件すべて ${MIN}:1 以上` : `\n${low} 件が ${MIN}:1 未満`);
process.exit(low === 0 ? 0 : 1);
