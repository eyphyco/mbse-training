import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT, SLIDE } from './motion';
import { IconDiagram } from './icons';

/* ボタン: バリアントとサイズを固定し、画面ごとに書き分けないようにする。
   primary は紫 → 青のグラデーション（WHITEBOARD の「エージェントに依頼」）。1 画面に 1 つだけ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary border border-transparent',
  secondary:
    'bg-raised text-fg border border-edge hover:border-accent-line hover:text-accent panel-flat',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-raised hover:text-fg',
  danger: 'bg-transparent text-danger border border-danger-line hover:bg-danger-soft',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-small gap-1.5 rounded-sm',
  md: 'h-9 px-4 text-body gap-1.5 rounded-sm',
  lg: 'h-11 px-5 text-body gap-2 rounded-md',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * すりガラスの板。レーン・詳細パネル・カードの外枠。
 * flat を付けると、ぼかしを掛けない札（板の上に載せる小さいもの）になる。
 */
export function Card({
  children,
  className = '',
  as: Tag = 'div',
  id,
  testId,
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'aside';
  id?: string;
  testId?: string;
  flat?: boolean;
}) {
  return (
    <Tag
      id={id}
      data-testid={testId}
      className={`${flat ? 'panel-flat bg-raised rounded-md' : 'panel bg-surface rounded-xl'} border border-edge ${className}`}
    >
      {children}
    </Tag>
  );
}

/** セクション見出し。左に色バー、右に件数の丸札（WHITEBOARD のレーン見出し） */
export function SectionTitle({
  children,
  sub,
  count,
  color,
  right,
}: {
  children: ReactNode;
  sub?: ReactNode;
  count?: number | string;
  color?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      {color && <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <h2 className="text-lead font-bold tracking-tight text-fg">{children}</h2>
      {sub && <span className="text-small text-muted">{sub}</span>}
      {count !== undefined && <CountPill>{count}</CountPill>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/** 件数の丸札 */
export function CountPill({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`tnum inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--c-tile-gray)] px-2 text-tiny font-bold text-muted ${className}`}
    >
      {children}
    </span>
  );
}

import type { TileTone } from './tones';
export type { TileTone } from './tones';

/** 札の左のパステルの四角。図種のアイコンを載せる（WHITEBOARD のサムネイルの代わり） */
export function Tile({
  kind,
  tone = 'blue',
  size = 44,
}: {
  kind: string;
  tone?: TileTone;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm"
      style={{
        width: size,
        height: size,
        background: `var(--c-tile-${tone})`,
        color: `var(--c-tile-${tone}-fg)`,
      }}
      aria-hidden="true"
    >
      <IconDiagram kind={kind} size={Math.round(size * 0.52)} />
    </span>
  );
}

/**
 * 進捗バー。高さ 4px、単色。0 から伸びる。
 */
export function Meter({
  value,
  total,
  delay = 0,
  color,
}: {
  value: number;
  total: number;
  delay?: number;
  color?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-sunken"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <motion.div
        className="h-full origin-left rounded-full"
        style={{
          width: '100%',
          background: color ?? (pct === 100 ? 'var(--c-lane-green)' : 'var(--g-primary)'),
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay }}
      />
    </div>
  );
}

/** ラベル。既定は無彩色。色は状態を表すときだけ使う */
export function Tag({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'purple';
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-raised text-muted',
    accent: 'border-accent-line bg-accent-soft text-accent',
    success: 'border-success-line bg-success-soft text-success',
    warning: 'border-warning-line bg-warning-soft text-warning',
    danger: 'border-danger-line bg-danger-soft text-danger',
    purple: 'border-transparent bg-[var(--c-tile-purple)] text-[var(--c-tile-purple-fg)]',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-tiny leading-4 font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * タブ。選択中は青の下線が滑って移る（WHITEBOARD の詳細パネルのタブ）。
 * layoutId は画面ごとに変える（同じ画面に 2 組あると下線が飛び移る）。
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  layoutId: string;
}) {
  return (
    <div role="tablist" className="flex border-b border-line">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`relative flex-1 px-2 py-2.5 text-small font-semibold whitespace-nowrap transition-colors ${
              on ? 'text-accent' : 'text-muted hover:text-fg'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="tnum ml-1 text-micro text-subtle">{t.count}</span>
            )}
            {on && (
              <motion.span
                layoutId={layoutId}
                transition={SLIDE}
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 画面には出さないが、変わったことを読み上げてもらうための領域。
 * 領域は常に置いておき、中身だけ差し替える（後から現れた要素は読み上げられないことがある）。
 */
export function LiveMessage({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {children}
    </div>
  );
}

/** 空のレーン・空の一覧。消さずに破線で残す（DESIGN.md §4.7） */
export function EmptySlot({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong px-4 py-5 text-center text-small leading-relaxed text-muted">
      {children}
    </div>
  );
}
