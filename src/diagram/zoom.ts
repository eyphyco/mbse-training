/**
 * 図の拡大縮小の計算（画面に触らない部分）。ZoomPane.tsx が使う。
 *
 * 倍率はブラウザの拡大（Ctrl + / −）と同じ刻みにする。慣れた刻みなので
 * 「もう 1 段」が予想どおりに効く。連続値にするのはピンチとホイールだけ。
 *
 * 図は SVG なので、拡大は svg の width/height を変えるだけで済む（viewBox は据え置き）。
 * 文字幅の実測・はみ出し検査はレイアウトの座標（拡大前）で行うので、倍率の影響を受けない。
 */

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * 1 段上げる／下げる。ピンチの後の 1.37 倍のような半端な値からでも、
 * 「次に大きい刻み」へ進む（1.37 → 1.5。1.25 に戻ると押したのに縮んで見える）。
 */
export function stepZoom(z: number, dir: 1 | -1): number {
  const eps = 0.001;
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + eps) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - eps) ?? ZOOM_MIN;
}

/** 枠に収まる倍率。全画面を開いたときの初期値。小さい図を巨大にしないよう上限を持つ */
export function fitZoom(contentW: number, contentH: number, viewW: number, viewH: number, cap = 2) {
  if (contentW <= 0 || contentH <= 0 || viewW <= 0 || viewH <= 0) return 1;
  return clampZoom(Math.min(viewW / contentW, viewH / contentH, cap));
}

/**
 * 指（またはマウス）の下の点が動かないように、拡大後のスクロール位置を出す。
 * scroll … 拡大前のスクロール量、p … スクロール枠の左上から指までの距離。
 * 図の上の点 (scroll + p) は拡大で to/from 倍の位置へ移るので、そこから p 戻す。
 */
export function anchorScroll(scroll: number, p: number, from: number, to: number) {
  return Math.max(0, ((scroll + p) * to) / from - p);
}

/**
 * Ctrl + ホイール（トラックパッドのピンチも Ctrl 付きのホイールで来る）の 1 回分の倍率。
 * マウスのホイール 1 ノッチは deltaY ≈ 100、トラックパッドは 1〜10 の細かい値で連続して来る。
 * exp にしておくと、どちらでも「同じ量回せば同じだけ拡大」になり、行って戻ると元に戻る。
 * 1 ノッチで約 1.16 倍（ブラウザの 1 段 1.1〜1.25 と同程度）。
 */
export function wheelFactor(deltaY: number, deltaMode = 0) {
  const px = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-Math.max(-300, Math.min(300, px)) * 0.0015);
}

/*
  選んだ倍率はこの端末に覚えておく。高解像度の画面で「文字が小さい」と感じた人は、
  図ごとではなくどの図でも同じだけ大きくしたいはずなので、図ごとには持たない。
  全画面での倍率は「枠に合わせる」から始まる一時的なものなので覚えない。
*/
export const ZOOM_KEY = 'mbse-training:diagram-zoom';

export function readStoredZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(v) && v > 0 ? clampZoom(v) : 1;
  } catch {
    return 1;
  }
}

export function storeZoom(z: number) {
  try {
    if (Math.abs(z - 1) < 0.001) localStorage.removeItem(ZOOM_KEY);
    else localStorage.setItem(ZOOM_KEY, String(Math.round(z * 100) / 100));
  } catch {
    /* 覚えられなくても拡大はできる */
  }
}
