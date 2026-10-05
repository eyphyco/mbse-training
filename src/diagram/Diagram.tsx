import { useEffect, useState } from 'react';
import { layoutBdd } from './bdd';
import { describeModel } from './describe';
import { headerText } from './model';
import type { Model, PortSide } from './model';
import type { Measure } from './metrics';
import type { DiagramLayout, Point, PortShape, TextRun } from './layout';

/**
 * モデル JSON → SVG。**図のレンダラが製品の心臓**（DESIGN.md §1.2）。
 *
 * data-ref はモデルの id（spot_error で「どこを指したか」を取る口。DESIGN.md §13 手順 3）、
 * data-kind は node / edge / port（smoke が箱だけを選んで文字のはみ出しを測る）。
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

function Svg({ layout, label }: { layout: DiagramLayout; label: string }) {
  return (
    <svg
      className="dg block"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={label}
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
        <polygon className="dg-tab" points={pts(layout.tab)} />
        {layout.header.map((t, i) => (
          <Text key={i} t={t} />
        ))}

        {layout.edges.map((e) => (
          <g key={e.id} data-ref={e.id} data-kind="edge">
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
          <g key={n.id} data-ref={n.id} data-kind="node">
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
      </g>
    </svg>
  );
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; layout: DiagramLayout; model: Model }
  | { status: 'error'; message: string };

export default function Diagram({ model, className = '' }: { model: Model; className?: string }) {
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
          <Svg layout={state.layout} label={`図 ${header}`} />
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
