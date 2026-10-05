/**
 * 配色のコントラスト比を、実際に描画されたピクセルから測る。
 * 測る対象は画面が増えるたびに足す（図の中の文字は、レンダラが入ってから）。
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
    if ((await loc.count()) === 0) throw new Error(`見つからない: ${selector}`);
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

  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  /*
    地の上に直接載る文字と、面の上の文字の両方を測る。
    下地を写真にしたので地の明るさは場所で振れる（狭く抑えてあるが 0 ではない）。
    図のレンダラが入ったら、図の中の文字とステレオタイプもここに足す。
  */
  await measure('節の見出し (muted)', 'main h2');
  await measure('進捗の本文 (fg)', 'main p.text-lead');
  await measure('出典の注記 (muted)', 'main p.text-small');
  await measure('領域の比率 (accent)', 'main span.text-accent');
  await measure('項目数 (subtle)', 'main span.text-subtle');
  await measure('定義リストの見出し (subtle)', 'main dt');
  await measure('ナビの現在地 (accent)', 'header nav a[aria-current="page"]');

  await ctx.close();
}
await browser.close();

let low = 0;
for (const [theme, label, ratio] of rows) {
  const ok = ratio >= MIN;
  if (!ok) low += 1;
  console.log(
    `${ok ? 'OK  ' : 'LOW '} ${theme.padEnd(5)} ${label.padEnd(26)} ${ratio.toFixed(2)}:1`,
  );
}
console.log(low === 0 ? `\n${rows.length} 件すべて ${MIN}:1 以上` : `\n${low} 件が ${MIN}:1 未満`);
process.exit(low === 0 ? 0 : 1);
