/**
 * レイアウトの結果（どの図種でも共通の形）と、それを作るための幾何。
 *
 * レンダラ（Diagram.tsx）は**ここで決めた座標をそのまま描くだけ**にしてある。
 * 判断を描画側に残すと、Node（validate・test）で確かめられない部分が増えるため。
 */
import type ELKType from 'elkjs/lib/elk.bundled.js';
import { FONT, FRAME, LINE_H, MARKER } from './metrics.ts';
import type { Measure, TextStyle } from './metrics.ts';
import type { FlowDirection, PortSide, RelationKind } from './model.ts';

export interface Point {
  x: number;
  y: number;
}

/** 1 行の文字。y はベースライン */
export interface TextRun {
  text: string;
  x: number;
  y: number;
  /** レイアウトが見込んだ幅。smoke が実際の幅と比べてはみ出しを見る */
  w: number;
  style: TextStyle;
  anchor: 'start' | 'middle';
}

export interface PortShape {
  id: string;
  /** 四角の左上 */
  x: number;
  y: number;
  size: number;
  side: PortSide;
  kind: 'flow' | 'standard';
  direction?: FlowDirection;
  label: TextRun;
}

export interface NodeShape {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  texts: TextRun[];
  /** コンパートメントの仕切り線の y（絶対座標） */
  dividers: number[];
  ports: PortShape[];
}

/** 端の記号。塗るかどうかは filled で分ける（白ひし形と黒ひし形の違いが頻出なので明示） */
export interface MarkerShape {
  shape: 'polygon' | 'polyline';
  points: Point[];
  filled: boolean;
}

export interface EdgeShape {
  id: string;
  kind: RelationKind;
  dashed: boolean;
  /** 端の記号の分だけ縮めた線 */
  points: Point[];
  markers: MarkerShape[];
  texts: TextRun[];
}

export interface DiagramLayout {
  width: number;
  height: number;
  /** 図枠のヘッダの札（五角形） */
  tab: Point[];
  header: TextRun[];
  nodes: NodeShape[];
  edges: EdgeShape[];
}

/* ------------------------------------------------------------------ */

let elkPromise: Promise<InstanceType<typeof ELKType>> | null = null;

/**
 * elkjs は 1.6MB あるので、図が要る画面に来たときに初めて読む（DESIGN.md §10.2）。
 * Web Worker 版にしないのは、図が小さく（箱 10 個程度）、1 枚数 ms で済むため。
 * Worker を挟むと CSP の worker-src と Service Worker のキャッシュ対象が増えるだけになる。
 */
export function loadElk() {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default());
  return elkPromise;
}

/** ベースラインの位置。行の高さの真ん中に、x ハイトの中心が来るように置く */
export function baseline(top: number, lineH: number, size: number) {
  return top + lineH / 2 + size * 0.35;
}

export function textRun(
  measure: Measure,
  text: string,
  style: TextStyle,
  x: number,
  y: number,
  anchor: 'start' | 'middle' = 'start',
): TextRun {
  return { text, x, y, w: measure(text, style), style, anchor };
}

/**
 * 図枠のヘッダの札。`bdd` だけ太字にして、残りを続ける。
 * 札は左上の五角形（右下の角を斜めに切る）。SysML の図枠の決まった形。
 */
export function frameHeader(measure: Measure, kind: string, rest: string) {
  const kindStyle = { size: FONT.header, bold: true };
  const restStyle = { size: FONT.header };
  const y = baseline(0, FRAME.tabH, FONT.header);
  const k = textRun(measure, kind, kindStyle, FRAME.tabPadX, y);
  const gap = measure(' ', restStyle);
  const r = textRun(measure, rest, restStyle, k.x + k.w + gap, y);
  const tabW = r.x + r.w + FRAME.tabPadX + FRAME.tabCut;
  const tab: Point[] = [
    { x: 0, y: 0 },
    { x: tabW, y: 0 },
    { x: tabW, y: FRAME.tabH - FRAME.tabCut },
    { x: tabW - FRAME.tabCut, y: FRAME.tabH },
    { x: 0, y: FRAME.tabH },
  ];
  return { tab, header: [k, r], tabW };
}

/* --- 端の記号 ------------------------------------------------------ */

function unit(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const at = (p: Point, u: Point, along: number, n: Point, across: number): Point => ({
  x: p.x + u.x * along + n.x * across,
  y: p.y + u.y * along + n.y * across,
});

export type EndKind = 'diamondFilled' | 'diamondHollow' | 'triangle' | 'arrow';

/**
 * 線の端 tip に記号を描き、線をどこまで縮めるかを返す。
 * prev は tip の 1 つ手前の点（記号の向きを決める）。
 *
 * 白抜きの記号は中を紙の色で塗るが、線を記号の根元で止めておく。
 * 塗りで隠す作りにすると、塗りの色がテーマと食い違ったときに線が透けて
 * 白ひし形が黒ひし形に見える（試験で最も問われる区別が崩れる）。
 */
export function endMarker(kind: EndKind, tip: Point, prev: Point) {
  const u = unit(tip, prev); // tip から線の内側へ向かう
  const n = { x: -u.y, y: u.x };
  switch (kind) {
    case 'diamondFilled':
    case 'diamondHollow': {
      const L = MARKER.diamondLen;
      const H = MARKER.diamondHalf;
      return {
        marker: {
          shape: 'polygon',
          filled: kind === 'diamondFilled',
          points: [tip, at(tip, u, L / 2, n, H), at(tip, u, L, n, 0), at(tip, u, L / 2, n, -H)],
        } satisfies MarkerShape,
        trim: L,
      };
    }
    case 'triangle':
      return {
        marker: {
          shape: 'polygon',
          filled: false,
          points: [
            tip,
            at(tip, u, MARKER.triangleLen, n, MARKER.triangleHalf),
            at(tip, u, MARKER.triangleLen, n, -MARKER.triangleHalf),
          ],
        } satisfies MarkerShape,
        trim: MARKER.triangleLen,
      };
    case 'arrow':
      // 開いた矢じり。線は先端まで届かせる（矢じりの芯になる）
      return {
        marker: {
          shape: 'polyline',
          filled: false,
          points: [
            at(tip, u, MARKER.arrowLen, n, MARKER.arrowHalf),
            tip,
            at(tip, u, MARKER.arrowLen, n, -MARKER.arrowHalf),
          ],
        } satisfies MarkerShape,
        trim: 0,
      };
  }
}

/** 折れ線の端を d だけ内側へ縮める。端の線分が d より短ければその線分の手前で止める */
export function trimEnd(points: Point[], d: number, end: 'start' | 'end'): Point[] {
  if (d <= 0 || points.length < 2) return points;
  const pts = end === 'end' ? [...points] : [...points].reverse();
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const seg = Math.hypot(tip.x - prev.x, tip.y - prev.y);
  const k = Math.min(d, seg) / (seg || 1);
  pts[pts.length - 1] = { x: tip.x + (prev.x - tip.x) * k, y: tip.y + (prev.y - tip.y) * k };
  return end === 'end' ? pts : pts.reverse();
}

/** 端の文字（多重度・ロール名）の高さ。ELK に渡すラベルの箱に使う */
export const EDGE_LABEL_H = LINE_H.edge;
