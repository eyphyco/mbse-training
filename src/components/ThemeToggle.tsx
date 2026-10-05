import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useTheme } from '../theme/themeContext';
import { SLIDE } from './motion';
import { nearestIndex } from './segmented';
import type { ThemeChoice } from '../theme/theme';
import { IconMonitor, IconMoon, IconSun } from './icons';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'ライト', Icon: IconSun },
  { value: 'dark', label: 'ダーク', Icon: IconMoon },
  { value: 'system', label: 'システム設定に従う', Icon: IconMonitor },
];

/** 昇る／沈むときの移動量（px）。ボタンの高さより大きくして地平線の下に隠す */
const RISE_FROM = 14;

/**
 * セグメンテッドコントロール。3状態（ライト / ダーク / システム）を1つの操作子にまとめる。
 * 押しても、つまみをつまんで動かしても切り替えられる。
 */
export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const index = OPTIONS.findIndex((o) => o.value === choice);

  // animate() は MotionConfig の外なので、視差効果の設定は自分で見る
  const reduced = useReducedMotion();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState({ positions: [0, 0, 0], width: 28 });
  const x = useMotionValue(0);
  const dragging = useRef(false);

  // つまみの停止位置はボタンの実寸から測る（余白やサイズを変えても追従する）
  const measure = useCallback(() => {
    const btns = btnRefs.current.filter((b): b is HTMLButtonElement => b !== null);
    if (btns.length !== OPTIONS.length) return;
    setBox({ positions: btns.map((b) => b.offsetLeft), width: btns[0].offsetWidth });
  }, []);

  useLayoutEffect(() => {
    measure();
    if (!trackRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure]);

  /*
    その位置まで滑らせる。視差効果を減らす設定では時間 0 で置く。
    x.set() ではなく animate() を使うのは、つまみを離した直後に
    ドラッグ側の最終位置で上書きされてしまうため。
  */
  const settle = useCallback(
    (to: number) => animate(x, to, reduced ? { duration: 0 } : SLIDE),
    [reduced, x],
  );

  // 選択が変わったら（クリックでも OS 追従でも）その位置へ
  useEffect(() => {
    if (dragging.current) return;
    const controls = settle(box.positions[index] ?? 0);
    return () => controls.stop();
  }, [index, box, settle]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label="配色テーマ"
      className="relative inline-flex items-center gap-0.5 rounded-full border border-line bg-sunken p-0.5"
    >
      {/*
        つまみは 1 つだけ置いて動かす。ボタンの中に入れて layoutId で
        繋ぐ形だと、つかんで動かすことができないため。
      */}
      <motion.span
        aria-hidden
        data-testid="theme-thumb"
        drag="x"
        dragConstraints={{
          left: box.positions[0] ?? 0,
          right: box.positions[box.positions.length - 1] ?? 0,
        }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragStart={() => {
          dragging.current = true;
        }}
        onDragEnd={() => {
          dragging.current = false;
          const i = nearestIndex(x.get(), box.positions);
          // 同じ位置に戻すときも滑らせる（選択が変わらないと effect が走らないため）
          settle(box.positions[i]);
          if (OPTIONS[i].value !== choice) setChoice(OPTIONS[i].value);
        }}
        // つかんでいる間は横に伸びる。縦に太らせると溝からはみ出す
        whileTap={{ scaleX: 1.12 }}
        style={{ x, width: box.width }}
        className="panel-edge absolute inset-y-0.5 left-0 z-10 cursor-pointer rounded-full bg-solid shadow-card"
      />

      {OPTIONS.map(({ value, label, Icon }, i) => {
        const active = choice === value;
        return (
          <button
            key={value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            // 円の内側で切り抜いて、下辺を地平線に見立てる
            className={`relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full transition-colors sm:w-7 ${
              active ? 'text-fg' : 'text-subtle hover:text-muted'
            }`}
          >
            {/*
              選んだ側は下から昇り、外れた側は下へ沈む。
              沈んだあとは見えないまま元の位置へ戻し、控えめな明るさで出し直す
              （ラベルとして残す必要があるので、沈みっぱなしにはできない）。
            */}
            <motion.span
              initial={false}
              animate={
                active
                  ? { y: [RISE_FROM, 0], opacity: [0, 1], scale: [0.86, 1] }
                  : { y: [0, RISE_FROM, 0, 0], opacity: [1, 0, 0, 1], scale: 1 }
              }
              transition={
                active
                  ? // ゆっくり顔を出して、静かに収まる
                    { duration: 0.52, ease: [0.45, 0, 0.25, 1] }
                  : { duration: 0.5, times: [0, 0.42, 0.44, 1], ease: 'easeInOut' }
              }
              className="pointer-events-none relative z-20 flex"
            >
              <Icon size={16} />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
