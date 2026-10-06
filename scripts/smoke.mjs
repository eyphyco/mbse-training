#!/usr/bin/env node
/**
 * ブラウザでの通し操作（要: vite preview か dev サーバが起動していること）
 *   node scripts/smoke.mjs [baseUrl]
 *
 * 学習者の 1 日をそのまま流す。今日の分を解く → 通知で遷移が出る → ボードで札が動く →
 * 誤り指摘を図のクリックで答える → 模擬試験 → 試験日から逆算。
 *
 * この環境では Playwright が既定で起動しない。CLAUDE.md の「この環境の罠」を見ること。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const syllabus = JSON.parse(readFileSync(join(root, 'src/data/syllabus.json'), 'utf8'));
const itemCount = syllabus.exams.reduce(
  (n, e) => n + e.areas.reduce((m, a) => m + a.groups.reduce((k, g) => k + g.items.length, 0), 0),
  0,
);
const readDir = (d) =>
  readdirSync(join(root, d))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(join(root, d, f), 'utf8')));
const problems = readDir('src/data/problems');
const notation = readDir('src/data/notation');
const itemName = new Map(
  syllabus.exams.flatMap((e) =>
    e.areas.flatMap((a) => a.groups.flatMap((g) => g.items.map((i) => [i.id, i.name]))),
  ),
);

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => void d.accept());
const go = async (path) => {
  await page.goto(`${base}/#${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
};
const main = () => page.locator('main').innerText();

try {
  /* --- ホーム ------------------------------------------------------- */
  await go('/');
  let text = await main();
  check('ホームの主役は「今日やる分」', text.includes('今日やる分'));
  check('分母を出す', text.includes(`出題範囲 ${itemCount} 項目中`), `${itemCount} 項目`);
  check(
    'データの所在を常に出す',
    ((await page.getAttribute('[data-testid=data-badge]', 'aria-label')) ?? '').includes(
      'この端末のブラウザにだけ保存',
    ),
  );

  /*
    見た目は WHITEBOARD のすりガラス。板は半透明でぼかしを掛け、図の紙だけは不透明にする。
    図は試験の対象そのもので、下地が透けると線の濃さが場所で変わるため。
  */
  const glass = await page.evaluate(() => {
    const alpha = (c) => {
      const m = /^rgba?\(([^)]+)\)$/.exec(c);
      if (!m) return null;
      const parts = m[1].split(/[,/]/).map((v) => Number(v.trim()));
      return parts.length >= 4 ? parts[3] : 1;
    };
    const cs = getComputedStyle(document.querySelector('.panel'));
    const hd = getComputedStyle(document.querySelector('.panel-chrome'));
    return {
      panel: { alpha: alpha(cs.backgroundColor), blur: cs.backdropFilter },
      chrome: { alpha: alpha(hd.backgroundColor), blur: hd.backdropFilter },
      photo: getComputedStyle(document.body).backgroundImage,
    };
  });
  check(
    '板はすりガラス（半透明 + ぼかし）',
    glass.panel.alpha < 1 && /blur/.test(glass.panel.blur),
  );
  check('ヘッダもすりガラス', glass.chrome.alpha < 1 && /blur/.test(glass.chrome.blur));
  check('下地に写真が敷かれる', /url\(/.test(glass.photo));

  await page.click('button[aria-label="ダーク"]');
  await page.waitForTimeout(400);
  check('ダークに切り替わる', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await page.click('button[aria-label="ライト"]');
  await page.waitForTimeout(400);
  check('ライトに戻る', (await page.getAttribute('html', 'data-theme')) === 'light');

  await page.click('button:has-text("凡例")');
  await page.waitForTimeout(400);
  check('凡例を開ける', (await page.locator('[data-testid=legend]').count()) === 1);
  await page.click('button:has-text("凡例")');

  /* --- 今日の分を解く -------------------------------------------------- */
  await page.click('[data-testid=start-today]');
  await page.waitForSelector('[data-testid=problem]');
  const pid = await page.getAttribute('[data-testid=problem]', 'data-problem');
  const p1 = problems.find((p) => p.id === pid);
  check('今日の分の 1 問目が開く', !!p1 && (await main()).includes('今日やる分 1 /'), pid);
  for (const a of p1.answer ?? []) await page.click(`[data-choice="${a}"]`);
  await page.click('[data-testid=submit]');
  await page.waitForSelector('[data-testid=result]');
  check(
    '正解を正解と採点する',
    (await page.getAttribute('[data-testid=result]', 'data-correct')) === 'true',
  );
  text = await main();
  check('採点の後に次にいつ出るかを言う', /次は(明日|今日|\d+ 日後)/.test(text));
  const toast = await page.locator('[data-testid=toast]').first().innerText();
  check('通知に遷移を出す', toast.includes('未着手 → 定着 0'), toast.replace(/\n/g, ' / '));

  /* --- ボード -------------------------------------------------------- */
  await go('/board');
  const solvedLane = await page.locator('[data-testid=lane-solved]').innerText();
  const firstItem = itemName.get(p1.items[0]);
  check('解いた項目が「解いた」レーンに来る', solvedLane.includes(firstItem), firstItem);
  check(
    '空のレーンを消さずに残す',
    (await page.locator('[data-testid=lane-dropped]').innerText()).includes('空なのが正常'),
  );
  await page.click('[data-item="mu-multiplicity"]');
  await page.waitForSelector('[data-testid=detail]');
  check(
    '札を選ぶと左に詳細が出る',
    (await page.locator('[data-testid=detail]').innerText()).includes('多重度'),
  );
  await page.fill('[data-testid=detail] textarea', '多重度は相手の端に書く');
  await page.click('[data-testid=detail] button:has-text("貼る")');
  check(
    'メモを貼れる',
    (await page.locator('[data-testid=detail]').innerText()).includes('相手の端に書く'),
  );
  await page.click('[data-testid=detail] [role=tab]:has-text("教材")');
  await page.click('[data-testid=mark-read]');
  await page.waitForTimeout(700);
  check(
    '読んだ札は「読んだ」レーンへ動く',
    (await page.locator('[data-testid=lane-read]').innerText()).includes('多重度'),
  );
  check(
    '分母を出す（ボード）',
    (await page.locator('[data-testid=board-summary]').innerText()).includes(`/ ${itemCount} 項目`),
  );

  /* --- 誤り指摘: 図をクリックして答える ---------------------------------- */
  const spot = problems.find((p) => p.id === 'bdd-assoc-2');
  await go(`/problems/${spot.id}`);
  await page.waitForSelector('[data-testid=diagram][data-status=ready]');
  // 線の外接矩形の中心は L 字の線の上に無いことがあるので、線の端の記号（ひし形）を押す
  await page.locator(`svg [data-ref="${spot.errors[0].at}"] polygon`).first().click();
  check(
    '図をクリックすると指摘の印が付く',
    (await page.locator('.dg-mark-picked').count()) === 1 &&
      (await page.locator(`[data-ref-chip="${spot.errors[0].at}"][aria-pressed=true]`).count()) ===
        1,
  );
  await page.click('[data-testid=submit]');
  await page.waitForSelector('[data-testid=result]');
  check(
    '誤りを正しく指せば正解',
    (await page.getAttribute('[data-testid=result]', 'data-correct')) === 'true',
  );
  check('規則の名前で解説する', (await main()).includes('白ひし形と黒ひし形の取り違え'));
  check('採点後の印は「正解」の札', (await page.locator('.dg-mark-hit').count()) === 1);

  // 誤りでない所を指すと不正解になり、落とした項目になる
  await go('/problems/bdd-mult-2');
  await page.waitForSelector('[data-testid=diagram][data-status=ready]');
  await page.click('[data-ref-chip="Vehicle"]');
  await page.click('[data-testid=submit]');
  await page.waitForSelector('[data-testid=result]');
  check(
    '誤りでない所を指せば不正解',
    (await page.getAttribute('[data-testid=result]', 'data-correct')) === 'false',
  );
  check(
    '見落としを示す',
    (await page.locator('.dg-mark-miss').count()) === 1 &&
      (await page.locator('.dg-mark-wrong').count()) === 1,
  );
  await go('/board');
  check(
    '間違えた項目は「落とした」レーンへ',
    (await page.locator('[data-testid=lane-dropped]').innerText()).includes('多重度'),
  );

  /* --- 教材 ---------------------------------------------------------- */
  await go('/learn');
  check('教材は 12 章', (await page.locator('[data-testid^=chapter-]').count()) === 12);
  await go('/learn/bdd');
  await page.waitForSelector('[data-testid=diagram][data-status=ready]');
  text = await main();
  check('節の終わりに初出の語を出す', text.includes('この節で初めて出る語'));
  check('教材の中に図を描く', (await page.locator('[data-testid=diagram] svg').count()) > 0);

  // 項目を持たない節（章 0 の「試験の構造」）も読んだにでき、目次にチェックが入る
  await go('/learn/map');
  await page.click('[data-testid=read-map-exam]');
  await page.waitForTimeout(300);
  check(
    '項目の無い節も「読んだ」にできる',
    (await page.locator('[data-testid=read-map-exam]').count()) === 0 &&
      (await page.locator('[data-testid=section-map-exam]').innerText()).includes('読んだ'),
  );

  /* --- 問題の一覧 ------------------------------------------------------ */
  await go('/problems');
  check(
    '問題の一覧に分母を出す',
    (await page.locator('[data-testid=problem-count]').innerText()).includes(
      `/ ${problems.length} 問`,
    ),
  );
  await page.click('button[aria-pressed]:has-text("誤りを見つける")');
  const shown = await page.locator('[data-testid=problem-link]').count();
  check(
    '型で絞り込める',
    shown === problems.filter((p) => p.type === 'spot_error').length,
    `${shown} 問`,
  );

  /* --- 検索 ---------------------------------------------------------- */
  await go('/');
  await page.fill('[data-testid=search]', 'ロール名');
  await page.waitForTimeout(300);
  check(
    '検索で用語が引ける',
    (await page.locator('.panel-pop:not([role=tooltip])').innerText()).includes('ロール名'),
  );
  await page.fill('[data-testid=search]', '');

  /* --- 用語集 -------------------------------------------------------- */
  await go('/glossary');
  check('用語集は教材の初出から作る', (await main()).includes('初出: 第 1 章'));

  /* --- 模擬試験 ------------------------------------------------------ */
  await go('/exam');
  await page.click('[data-testid=start-mbf]');
  await page.waitForSelector('[data-testid=exam-question]');
  check(
    '模擬試験は途中で答えを見せない',
    (await page.locator('[data-testid=submit]').count()) === 0,
  );
  await page.click('[data-testid=exam-submit]');
  await page.waitForSelector('[data-testid=exam-result]');
  text = await main();
  check('結果を領域別に分解する', text.includes('領域別の正答率'));
  check('落とした項目を翌日から出す', text.includes('明日から'));

  /* --- 試験日から逆算 -------------------------------------------------- */
  await go('/settings');
  await page.fill('[data-testid=exam-date]', '2027-04-24');
  await go('/');
  check(
    '試験日から間に合うかを出す',
    /試験日まで \d+ 日/.test(await page.locator('[data-testid=plan]').innerText()),
  );

  /* --- 記法見本（図のレンダラ） ------------------------------------------- */
  await go('/notation');
  await page
    .locator('[data-testid=diagram][data-status=ready]')
    .nth(notation.length - 1)
    .waitFor({ timeout: 10000 });
  const dg = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('[data-testid=diagram] svg')];
    const overflow = [];
    for (const svg of svgs) {
      // 箱（レイアウトが見込んだ矩形 data-box）と、その g の直下の文字。ポートの名前は箱の外に置くので対象外
      for (const g of svg.querySelectorAll('g[data-kind=node]')) {
        const [x, y, w, h] = g.dataset.box.split(' ').map(Number);
        for (const t of g.querySelectorAll(':scope > text')) {
          const b = t.getBBox();
          if (
            b.x < x - 0.5 ||
            b.x + b.width > x + w + 0.5 ||
            b.y < y - 2 ||
            b.y + b.height > y + h + 2
          )
            overflow.push(`${g.dataset.ref}: ${t.textContent}`);
        }
      }
    }
    const paper = getComputedStyle(svgs[0]).backgroundColor;
    return {
      count: svgs.length,
      overflow,
      paperOpaque: !/rgba\(.*,\s*0?\.\d+\)$/.test(paper),
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
  check(
    '図の文字が箱からはみ出さない',
    dg.overflow.length === 0,
    dg.overflow.slice(0, 3).join(' / '),
  );
  check('図の紙は不透明', dg.paperOpaque);
  check('黒ひし形は塗り、白ひし形は中抜き', dg.filled > 0 && dg.hollow > 0);
  check('図に読み上げ用の控えが付く', dg.caption.includes('黒ひし形'));
  const kinds = await page.evaluate(() => ({
    ellipse: document.querySelectorAll('[data-testid=diagram] ellipse').length,
    dashedLine: document.querySelectorAll('[data-testid=diagram] polyline[stroke-dasharray]')
      .length,
  }));
  check(
    '楕円（ユースケース・開始）と点線（依存・制御フロー）も描く',
    kinds.ellipse > 0 && kinds.dashedLine > 0,
  );
  await page.click('button[aria-pressed]:has-text("act")');
  await page.waitForTimeout(300);
  const actCount = notation.filter((n) => n.model.type === 'act').length;
  check(
    '記法見本を図種で絞れる',
    (await page.locator('[data-testid=diagram]').count()) === actCount,
    `${actCount} 枚`,
  );

  /* --- 組み立て問題（パレット） ------------------------------------------ */
  await go('/problems/stm-build-2');
  await page.waitForSelector('[data-testid=diagram][data-status=ready]');
  const edgesBefore = await page.locator('[data-testid=build] g[data-kind=edge]').count();
  const transition = async (from, to, trigger) => {
    await page.selectOption('[data-field=from]', { label: from });
    await page.selectOption('[data-field=to]', { label: to });
    if (trigger) await page.fill('[data-field=trigger]', trigger);
    await page.click('[data-testid=place-relation]');
    await page.waitForTimeout(250);
  };
  await page.click('[data-tool=rel-transition]');
  await transition('開始（黒丸）', 'Off（状態）');
  check(
    '置いた瞬間に図が描き直される',
    (await page.locator('[data-testid=build] g[data-kind=edge]').count()) === edgesBefore + 1,
  );
  await transition('Off（状態）', 'Running（状態）', 'start');
  await transition('Running（状態）', 'Off（状態）', 'stop');
  await page.click('[data-testid=check-build]');
  check('検査で図の中の食い違いを見る', (await main()).includes('食い違いは見つかりませんでした'));
  await page.click('[data-testid=submit]');
  await page.waitForSelector('[data-testid=result]');
  check(
    '組み立て問題: 正解の図と同じモデルなら正解',
    (await page.getAttribute('[data-testid=result]', 'data-correct')) === 'true',
  );
  check('採点後に正解の図を出す', (await main()).includes('正解の図'));
  await go('/problems/uc-build-2');
  await page.waitForSelector('[data-testid=diagram][data-status=ready]');
  await page.click('[data-tool=rel-include]');
  await page.selectOption('[data-field=from]', { label: 'Start Engine（ユースケース）' });
  await page.selectOption('[data-field=to]', { label: 'Drive（ユースケース）' });
  await page.click('[data-testid=place-relation]');
  await page.click('[data-testid=submit]');
  await page.waitForSelector('[data-testid=result]');
  const wrong = await main();
  check(
    '組み立て問題: 向きを誤ると足りない・余分を言う',
    (await page.getAttribute('[data-testid=result]', 'data-correct')) === 'false' &&
      wrong.includes('足りないもの') &&
      wrong.includes('余分なもの'),
  );

  /* --- 狭い画面 ------------------------------------------------------ */
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/',
    '/board',
    '/learn/act',
    '/notation',
    '/problems/bdd-assoc-2',
    '/problems/stm-build-3',
  ]) {
    await go(path);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(`狭い画面で横にはみ出さない ${path}`, over <= 1, `${over}px`);
  }

  /* --- Service Worker（再訪と圏外） ------------------------------------- */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go('/learn/act');
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'なし';
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 5000)),
    ]);
    const names = await caches.keys();
    return reg?.active ? names.join(',') : '登録されない';
  });
  check(
    'Service Worker が入り、自分の名前のキャッシュだけを使う',
    /^(mbse-training-v\d+,?)+$/.test(sw),
    sw,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid=diagram][data-status=ready]', { timeout: 10000 });
  check('圏外でも開いたことのある画面と図が出る', (await main()).includes('アクティビティ図'));
  await page.context().setOffline(false);

  // 圏外で読み込みに失敗した資源の報告は、圏外の確かめの副作用なので数えない
  const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  check('コンソールにエラーが出ない', real.length === 0, real.slice(0, 2).join(' / '));
} catch (e) {
  check('通し操作', false, String(e).split('\n')[0]);
}

await browser.close();
const ng = results.filter((r) => !r).length;
console.log(`\n${results.length - ng} / ${results.length} passed`);
process.exit(ng === 0 ? 0 : 1);
