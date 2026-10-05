import { useEffect, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { layoutBdd } from './bdd';
import { describeModel } from './describe';
import { headerText } from './model';
import type { Model, PortSide } from './model';
import type { Measure } from './metrics';
import type { DiagramLayout, Point, PortShape, TextRun } from './layout';
import { MARK_LABEL } from './marks';
import type { PickMark } from './marks';

/**
 * モデル JSON → SVG。**図のレンダラが製品の心臓**（DESIGN.md §1.2）。
 *
 * data-ref はモデルの id（spot_error で「どこを指したか」を取る口）、
 * data-kind は node / edge / port / frame（smoke が箱だけを選んで文字のはみ出しを測る）。
 *
 * ここは座標を描くだけ。どこに何を置くか・記号の形はすべて layout 側で決めてあり、
 * Node で test・validate できる。色は index.css の `.dg-*`（白黒。本番の図が白黒なので）。
 */

/*
  ブラウザでは文字幅を canvas で実測する（Node は推定。metrics.ts）。
  推定のままだと、OS のフォント次第で長い名前が箱からはみ出す。
  フォントは body から読む。svg の文字は body のフォントを継ぐので、測るものと描くものが一致する。
*/
let ctx: CanvasRenderingContext2D | null = null;
const canvasMeasure: Measure = (text, { size, bold, italic }) => {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  const family = getComputedStyle(document.body).fontFamily;
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 600 : 400} ${size}px ${family}`;
  return ctx.measureText(text).width;
};

const pts = (ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

function Text({ t }: { t: TextRun }) {
  return (
    <text
      x={t.x}
      y={t.y}
      fontSize={t.style.size}
      fontWeight={t.style.bold ? 600 : undefined}
      fontStyle={t.style.italic ? 'italic' : undefined}
      textAnchor={t.anchor}
      data-w={t.w.toFixed(1)}
    >
      {t.text}
    </text>
  );
}

const OUTWARD: Record<PortSide, Point> = {
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
};

/**
 * ポート。四角が箱の縁にまたがる。
 * フローポートだけ中に矢印を描く（v1.2: 入る / 出る / 両方向）。標準ポートは空の四角。
 */
function PortGlyph({ p }: { p: PortShape }) {
  const c = { x: p.x + p.size / 2, y: p.y + p.size / 2 };
  const o = OUTWARD[p.side];
  const n = { x: -o.y, y: o.x };
  const r = p.size * 0.3;
  const head = (dir: 1 | -1) => {
    // dir = 1 なら外向きの矢じり
    const tip = { x: c.x + o.x * r * dir, y: c.y + o.y * r * dir };
    const back = (s: number) => ({
      x: tip.x - o.x * r * 0.8 * dir + n.x * r * 0.7 * s,
      y: tip.y - o.y * r * 0.8 * dir + n.y * r * 0.7 * s,
    });
    return <polyline className="dg-line" points={pts([back(1), tip, back(-1)])} />;
  };
  return (
    <g data-ref={p.id} data-kind="port">
      <rect className="dg-box" x={p.x} y={p.y} width={p.size} height={p.size} />
      {p.kind === 'flow' && (
        <>
          <line
            className="dg-line"
            x1={c.x - o.x * r}
            y1={c.y - o.y * r}
            x2={c.x + o.x * r}
            y2={c.y + o.y * r}
          />
          {p.direction !== 'in' && head(1)}
          {p.direction !== 'out' && head(-1)}
        </>
      )}
      <Text t={p.label} />
    </g>
  );
}

/* --- 指摘（spot_error） ------------------------------------------- */

export interface PickProps {
  marks: Readonly<Record<string, PickMark>>;
  /** 採点後は undefined にして押せなくする */
  onToggle?: (ref: string) => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 指した箱（要素・ポート・ヘッダ）を囲む枠。線は MarkOverlay がなぞる */
function boxOf(layout: DiagramLayout, ref: string): Box | null {
  if (ref === 'frame') {
    const xs = layout.tab.map((p) => p.x);
    const ys = layout.tab.map((p) => p.y);
    return { x: 0, y: 0, w: Math.max(...xs), h: Math.max(...ys) };
  }
  const n = layout.nodes.find((x) => x.id === ref);
  if (n) return { x: n.x, y: n.y, w: n.w, h: n.h };
  for (const node of layout.nodes) {
    const p = node.ports.find((x) => x.id === ref);
    if (p) return { x: p.x, y: p.y, w: p.size, h: p.size };
  }
  return null;
}

/** 折れ線のいちばん長い線分の中点。線の札を置く所 */
function midOfLongest(points: Point[]): Point {
  let best = { len: -1, mid: points[0] };
  for (let k = 1; k < points.length; k += 1) {
    const a = points[k - 1];
    const b = points[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return best.mid;
}

/**
 * 指した場所の印。箱は外側を囲み、線は線そのものを太くなぞる。
 *
 * 線を外接矩形で囲む形は捨てた。L 字の線の外接矩形は隣の線や箱の文字まで覆い、
 * どれを指したのか分からなくなっていた（誤り指摘でいちばん大事な「どこを」がぼやける）。
 */
function MarkOverlay({
  layout,
  refId,
  mark,
}: {
  layout: DiagramLayout;
  refId: string;
  mark: PickMark;
}) {
  const label = MARK_LABEL[mark];
  // 札の幅は文字数で見込む（canvas を使うほどの精度は要らない。全角 11px）
  const lw = label.length * 11 + 12;
  const dash = mark === 'miss' ? '5 3' : undefined;
  const pill = (x: number, y: number) => {
    const lx = Math.min(Math.max(2, x), layout.width - lw - 2);
    const ly = Math.max(2, y);
    return (
      <>
        <rect className="dg-mark-pill" x={lx} y={ly} width={lw} height={16} rx={8} />
        <text x={lx + lw / 2} y={ly + 11.5} fontSize={11} textAnchor="middle" fontWeight={600}>
          {label}
        </text>
      </>
    );
  };

  const edge = layout.edges.find((e) => e.id === refId);
  if (edge) {
    const m = midOfLongest(edge.points);
    return (
      <g className={`dg-mark dg-mark-${mark}`} pointerEvents="none">
        <polyline className="dg-mark-trace" points={pts(edge.points)} strokeDasharray={dash} />
        {pill(m.x + 8, m.y - 8)}
      </g>
    );
  }

  const b = boxOf(layout, refId);
  if (!b) return null;
  const pad = 4;
  return (
    <g className={`dg-mark dg-mark-${mark}`} pointerEvents="none">
      <rect
        x={b.x - pad}
        y={b.y - pad}
        width={b.w + pad * 2}
        height={b.h + pad * 2}
        rx={6}
        strokeDasharray={dash}
      />
      {/* 札は箱の右上の外側に置き、箱の中の文字に被せない */}
      {pill(b.x + b.w - lw + pad, b.y - pad - 18)}
    </g>
  );
}

function Svg({ layout, label, pick }: { layout: DiagramLayout; label: string; pick?: PickProps }) {
  const active = !!pick?.onToggle;
  // クリックした要素から一番近い data-ref を拾う（ポートは箱の中にあるので内側が勝つ）
  const onClick = (ev: MouseEvent<SVGSVGElement>) => {
    if (!pick?.onToggle) return;
    const el = (ev.target as Element).closest('[data-ref]');
    const ref = el?.getAttribute('data-ref');
    if (ref) pick.onToggle(ref);
  };
  const onKey = (ev: KeyboardEvent<SVGGElement>, ref: string) => {
    if (!pick?.onToggle || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    ev.stopPropagation();
    pick.onToggle(ref);
  };
  // 押せる場所は Tab で辿れるようにする
  const focusable = (ref: string) =>
    active
      ? {
          tabIndex: 0,
          role: 'button',
          'aria-pressed': pick?.marks[ref] === 'picked',
          onKeyDown: (ev: KeyboardEvent<SVGGElement>) => onKey(ev, ref),
        }
      : {};

  return (
    <svg
      className={`dg block ${active ? 'dg-pickable' : ''}`}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role={active ? 'group' : 'img'}
      aria-label={label}
      onClick={onClick}
    >
      {/* 1px の線を画素の真ん中に置く。座標は layout で整数に丸めてある */}
      <g transform="translate(0.5 0.5)">
        <rect
          className="dg-frame"
          x={0}
          y={0}
          width={layout.width - 1}
          height={layout.height - 1}
        />
        <g data-ref="frame" data-kind="frame" aria-label="図枠のヘッダ" {...focusable('frame')}>
          <polygon className="dg-tab" points={pts(layout.tab)} />
          {layout.header.map((t, i) => (
            <Text key={i} t={t} />
          ))}
        </g>

        {layout.edges.map((e) => (
          <g key={e.id} data-ref={e.id} data-kind="edge" {...focusable(e.id)}>
            {/* 細い線は指しにくいので、見えない太い線を当たり判定にする */}
            {active && <polyline className="dg-hit" points={pts(e.points)} />}
            <polyline
              className="dg-line"
              points={pts(e.points)}
              strokeDasharray={e.dashed ? '6 4' : undefined}
            />
            {e.markers.map((m, i) =>
              m.shape === 'polygon' ? (
                <polygon
                  key={i}
                  className={m.filled ? 'dg-solid' : 'dg-box'}
                  points={pts(m.points)}
                />
              ) : (
                <polyline key={i} className="dg-line" points={pts(m.points)} />
              ),
            )}
            {e.texts.map((t, i) => (
              <Text key={i} t={t} />
            ))}
          </g>
        ))}

        {layout.nodes.map((n) => (
          <g key={n.id} data-ref={n.id} data-kind="node" {...focusable(n.id)}>
            <rect className="dg-box" x={n.x} y={n.y} width={n.w} height={n.h} />
            {n.dividers.map((y) => (
              <line key={y} className="dg-line" x1={n.x} y1={y} x2={n.x + n.w} y2={y} />
            ))}
            {n.texts.map((t, i) => (
              <Text key={i} t={t} />
            ))}
            {n.ports.map((p) => (
              <PortGlyph key={p.id} p={p} />
            ))}
          </g>
        ))}

        {pick &&
          Object.entries(pick.marks).map(([ref, mark]) => (
            <MarkOverlay key={ref} layout={layout} refId={ref} mark={mark} />
          ))}
      </g>
    </svg>
  );
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; layout: DiagramLayout; model: Model }
  | { status: 'error'; message: string };

export default function Diagram({
  model,
  className = '',
  pick,
}: {
  model: Model;
  className?: string;
  pick?: PickProps;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    layoutBdd(model, canvasMeasure).then(
      (layout) => alive && setState({ status: 'ready', layout, model }),
      (e: unknown) => alive && setState({ status: 'error', message: String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [model]);

  const header = headerText(model.frame);
  return (
    <figure className={className} data-testid="diagram" data-status={state.status}>
      {/* 図が画面より広いときは図の中だけ横に流す（縮めると文字が読めなくなる） */}
      <div className="overflow-x-auto">
        {state.status === 'ready' && state.model === model ? (
          <Svg layout={state.layout} label={`図 ${header}`} pick={pick} />
        ) : state.status === 'error' ? (
          <p className="rounded-md border border-danger-line bg-danger-soft p-4 text-small text-danger">
            図を描けませんでした: {state.message}
          </p>
        ) : (
          // 描き終わるまでの数十 ms。高さを持たせて、出来たときに下が跳ねすぎないようにする
          <div className="h-48 animate-pulse rounded-md bg-sunken" aria-hidden="true" />
        )}
      </div>
      {/* 読み上げ用の控え。色と形で伝えている内容を文で持つ */}
      <figcaption className="sr-only">
        <ul>
          {describeModel(model).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
