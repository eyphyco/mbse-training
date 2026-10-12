import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { IconExpand, IconFit, IconX, IconZoomIn, IconZoomOut } from '../components/icons';
import {
  anchorScroll,
  clampZoom,
  fitZoom,
  readStoredZoom,
  stepZoom,
  storeZoom,
  wheelFactor,
} from './zoom';

/**
 * 図の拡大縮小と移動。高解像度の画面で図の文字が小さく見える、という指摘から入れた（2026-10-13）。
 *
 * 操作は地図アプリや PDF ビューアと同じ作法に寄せる（新しく覚えさせない）。
 *   - ボタン（− / 倍率 / +）。どの端末でも効き、存在そのものが「拡大できる」と知らせる
 *   - PC: Ctrl（Mac は ⌘）+ ホイール。トラックパッドのピンチも Ctrl 付きホイールで来る。
 *     ホイールだけではページのスクロールのまま（奪うと本文が読み進められなくなる）
 *   - スマホ: 2 本指のピンチは図だけを拡大。1 本指はふつうのスクロール
 *   - はみ出したら、マウスはドラッグで動かせる。4px 動くまではクリック扱い（誤り指摘の図を押せる）
 *   - キーボード: 図に焦点があるとき + − 0
 *   - 全画面: スマホの細い画面で図を読むための逃げ道。<dialog> の showModal で開き、
 *     Esc・焦点の閉じ込め・背面の無効化はブラウザに任せる
 *
 * やめた案:
 *   - CSS の transform: scale で拡大。スクロール量に効かず、はみ出した所に届かない。
 *     svg の width/height を変える（viewBox は据え置き）ほうが、ふつうのスクロールで済む
 *   - ダブルクリック／ダブルタップで拡大。誤り指摘の図では押すことが答えになるので衝突する
 *   - 1 本指のドラッグで図を動かす。ページのスクロールを図が奪い、図の多い教材で先へ進めなくなる
 */

type Anchor = { x: number; y: number; from: number; to: number; page: boolean };

export function ZoomPane({
  mode,
  contentW,
  contentH,
  label,
  onExpand,
  onClose,
  children,
}: {
  mode: 'inline' | 'full';
  /** 等倍での図の大きさ（レイアウトの座標） */
  contentW: number;
  contentH: number;
  label: string;
  onExpand?: () => void;
  onClose?: () => void;
  children: (zoom: number) => ReactNode;
}) {
  const full = mode === 'full';
  const scroller = useRef<HTMLDivElement>(null);
  // 全画面は枠を測ってから倍率を決めるので、測るまでは null（等倍で一瞬描いてから縮むのを防ぐ）
  const [zoom, setZoomState] = useState<number | null>(() => (full ? null : readStoredZoom()));
  // ホイール・ピンチの登録し直しを避けるため、今の倍率は ref でも持つ。倍率を変える 2 か所で一緒に書く
  const zoomRef = useRef(zoom ?? 1);
  const anchor = useRef<Anchor | null>(null);
  const [pannable, setPannable] = useState(false);

  const fit = useCallback(() => {
    const el = scroller.current;
    if (!el) return 1;
    // 図の周りに 16px ずつ余白を残す
    return fitZoom(contentW, contentH, el.clientWidth - 32, el.clientHeight - 32);
  }, [contentW, contentH]);

  /*
    全画面の初期倍率は枠の大きさで決める。ただし <dialog> は子の描画が済んだ後に showModal で開くので、
    初回はまだ幅が 0。大きさが付いた最初の時点（ResizeObserver の初回）で決める。
  */
  const fitted = useRef(!full);

  /** 倍率を変える。clientX/Y を渡すと、その点が動かないようにスクロールを合わせる */
  const zoomTo = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const el = scroller.current;
      const from = zoomRef.current;
      const to = clampZoom(next);
      if (!el || Math.abs(to - from) < 0.0005) return;
      const r = el.getBoundingClientRect();
      // 指定が無ければ見えている所の真ん中を据える（ボタン・キー）
      const x = clientX === undefined ? el.clientWidth / 2 : clientX - r.left;
      const y = clientY === undefined ? el.clientHeight / 2 : clientY - r.top;
      // 埋め込みの図は縦にスクロールしない（縦はページが伸びる）。縦の据え置きはページのスクロールで行う
      anchor.current = { x, y, from, to, page: !full && clientY !== undefined };
      zoomRef.current = to;
      setZoomState(to);
      if (!full) storeZoom(to);
    },
    [full],
  );

  // 拡大後の大きさが DOM に入ってから、スクロールを合わせる
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    anchor.current = null;
    if (!el) return;
    if (a) {
      el.scrollLeft = anchorScroll(el.scrollLeft, a.x, a.from, a.to);
      if (full) el.scrollTop = anchorScroll(el.scrollTop, a.y, a.from, a.to);
      else if (a.page) {
        // 指の下の点は図の上端から a.y にあった。拡大で a.y * to/from に移るので、その差だけページを送る
        window.scrollBy(0, a.y * (a.to / a.from - 1));
      }
    }
    setPannable(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  }, [zoom, full]);

  // 窓の大きさが変わると、はみ出すかどうかも変わる
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!fitted.current && el.clientWidth > 0) {
        fitted.current = true;
        zoomRef.current = fit();
        setZoomState(zoomRef.current);
        return; // 倍率が入ると下の useLayoutEffect がはみ出しを測り直す
      }
      setPannable(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  /*
    ホイールとタッチは passive にできない（preventDefault でページの拡大・スクロールを止める）ので、
    React の onWheel ではなく addEventListener で { passive: false } を付けて登録する。
  */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * wheelFactor(e.deltaY, e.deltaMode), e.clientX, e.clientY);
    };

    // ピンチ。始めた時の指の間隔と倍率から、今の間隔に比例させる（積み上げると誤差でずれていく）
    let pinch: { dist: number; zoom: number } | null = null;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: dist(e.touches), zoom: zoomRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      zoomTo(
        (pinch.zoom * dist(e.touches)) / pinch.dist,
        (a.clientX + b.clientX) / 2,
        (a.clientY + b.clientY) / 2,
      );
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    // Safari は touch とは別にページ拡大のジェスチャを出すので、図の上ではそれも止める
    const stopGesture = (e: Event) => e.preventDefault();

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('gesturestart', stopGesture);
    el.addEventListener('gesturechange', stopGesture);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('gesturestart', stopGesture);
      el.removeEventListener('gesturechange', stopGesture);
    };
  }, [zoomTo]);

  // マウスのドラッグで動かす。タッチはブラウザのスクロールに任せる（慣性も付く）
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    drag.current = null; // 前回のドラッグの印が残っていると、次の正しいクリックまで捨ててしまう
    if (!el || !pannable || e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.left - dx;
    if (full) el.scrollTop = d.top - dy;
  };
  const endDrag = () => {
    if (drag.current?.moved) setDragging(false);
    // moved は直後の click を握りつぶすために次の click まで残す
    if (drag.current && !drag.current.moved) drag.current = null;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // ブラウザ自体の拡大（Ctrl +）は奪わない
    if (e.key === '+' || e.key === '=') zoomTo(stepZoom(zoomRef.current, 1));
    else if (e.key === '-') zoomTo(stepZoom(zoomRef.current, -1));
    else if (e.key === '0') zoomTo(full ? fit() : 1);
    else return;
    e.preventDefault();
  };

  const z = zoom ?? 1;
  const pct = `${Math.round(z * 100)}%`;
  const tool =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-1.5 text-muted transition-colors hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className={full ? 'flex h-full flex-col' : ''}>
      <div
        className={`flex items-center gap-0.5 ${full ? 'border-b border-edge px-3 py-2' : 'mb-1 justify-end'}`}
        role="toolbar"
        aria-label="図の拡大縮小"
      >
        {full && <p className="mr-auto truncate text-small font-semibold text-fg">{label}</p>}
        {full && (
          <p className="mr-3 hidden text-tiny text-subtle sm:block">
            <span className="pointer-coarse:hidden">Ctrl + ホイールで拡大縮小・ドラッグで移動</span>
            <span className="hidden pointer-coarse:inline">2 本指でつまんで拡大縮小</span>
          </p>
        )}
        <button
          type="button"
          className={tool}
          onClick={() => zoomTo(stepZoom(z, -1))}
          disabled={z <= 0.5}
          aria-label="縮小"
          title="縮小（−）"
        >
          <IconZoomOut size={16} />
        </button>
        <button
          type="button"
          className={`${tool} w-14 text-tiny tabular-nums`}
          onClick={() => zoomTo(1)}
          aria-label={`倍率 ${pct}。押すと等倍に戻す`}
          title="等倍に戻す（0）"
        >
          {pct}
        </button>
        <button
          type="button"
          className={tool}
          onClick={() => zoomTo(stepZoom(z, 1))}
          disabled={z >= 4}
          aria-label="拡大"
          title="拡大（+）"
        >
          <IconZoomIn size={16} />
        </button>
        {full && (
          <button
            type="button"
            className={tool}
            onClick={() => zoomTo(fit())}
            aria-label="画面に合わせる"
            title="画面に合わせる"
          >
            <IconFit size={16} />
          </button>
        )}
        {onExpand && (
          <button
            type="button"
            className={`${tool} ml-1`}
            onClick={onExpand}
            aria-label="全画面で見る"
            title="全画面で見る"
          >
            <IconExpand size={16} />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className={`${tool} ml-1`}
            onClick={onClose}
            aria-label="閉じる"
            title="閉じる（Esc）"
          >
            <IconX size={16} />
          </button>
        )}
      </div>
      {/*
        touch-action: pan-x pan-y … 1 本指のスクロールはブラウザに任せ、2 本指の拡大だけを自分で受ける。
        tabIndex … はみ出した図をキーボードの矢印でもスクロールでき、+ − 0 も届く（スクロール領域の作法）。
      */}
      <div
        ref={scroller}
        className={`dg-zoom touch-pan-x touch-pan-y ${full ? 'grid min-h-0 flex-1 overflow-auto p-4' : 'overflow-x-auto overflow-y-hidden'} ${pannable ? (dragging ? 'cursor-grabbing select-none' : 'cursor-grab') : ''}`}
        tabIndex={0}
        aria-label={`${label}（+ − 0 キーで拡大縮小）`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {/* 全画面では小さい図を真ん中に置く。margin:auto はグリッドの中ではみ出しても左上が切れない */}
        <div className={full ? 'm-auto' : 'w-max'}>{zoom !== null && children(zoom)}</div>
      </div>
    </div>
  );
}
