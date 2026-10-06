/**
 * レイアウトの結果（どの図種でも共通の形）と、それを作るための幾何。
 *
 * レンダラ（Diagram.tsx）は**ここで決めた座標をそのまま描くだけ**にしてある。
 * 判断を描画側に残すと、Node（validate・test）で確かめられない部分が増えるため。
 *
 * 形は「プリミティブの列」で持つ（矩形・楕円・折れ線・多角形）。9 図種で形が 30 種近くあり、
 * 種類ごとに描画の分岐を書くと Diagram.tsx が図種の知識を持ってしまう。
 * 形を作るのは layout 側、描くのは 5 種のプリミティブだけ、と分けた。
 */
import type ELKType from 'elkjs/lib/elk.bundled.js';
import { FONT, FRAME, LINE_H, MARKER } from './metrics.ts';
import type { Measure, TextStyle } from './metrics.ts';
import type { FlowDirection, PortSide } from './model.ts';

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
  anchor: 'start' | 'middle' | 'end';
}

/** 塗り。paper は紙の色（白抜き）、ink は線の色（黒塗り）、none は塗らない */
export type Fill = 'paper' | 'ink' | 'none';

export type Prim =
  | {
      t: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      r?: number;
      dash?: boolean;
      fill?: Fill;
    }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; dash?: boolean; fill?: Fill }
  | { t: 'line'; pts: Point[]; dash?: boolean }
  | { t: 'poly'; pts: Point[]; fill: Fill; dash?: boolean };

export interface PortShape {
  id: string;
  /** 四角の左上 */
  x: number;
  y: number;
  size: number;
  side: PortSide;
  kind: 'flow' | 'standard' | 'param' | 'pin';
  direction?: FlowDirection;
  label: TextRun;
}

export interface NodeShape {
  id: string;
  /** 指せる場所の外接矩形（文字のはみ出しもこの中で測る） */
  x: number;
  y: number;
  w: number;
  h: number;
  prims: Prim[];
  texts: TextRun[];
  ports: PortShape[];
  /**
   * 中に別の要素を入れる箱（パッケージ・主題・複合状態・パーティション）。
   * 線より先に描く（後に描くと、中を通る線を紙の色で隠してしまう）
   */
  container?: boolean;
  /** 指せない飾り（領域の区切りなど）。data-ref を付けない */
  inert?: boolean;
}

/** 端の記号。塗るかどうかは filled で分ける（白ひし形と黒ひし形の違いが頻出なので明示） */
export interface MarkerShape {
  shape: 'polygon' | 'polyline' | 'circle';
  points: Point[];
  filled: boolean;
}

export interface EdgeShape {
  id: string;
  kind: string;
  dashed: boolean;
  /** 端の記号の分だけ縮めた線 */
  points: Point[];
  markers: MarkerShape[];
  texts: TextRun[];
}

export interface DiagramLayout {
  width: number;
  height: number;
  /** 図枠の矩形（縁にポートが載る図は、ポートがはみ出す分だけ内側に寄る） */
  frame: { x: number; y: number; w: number; h: number };
  /** 図枠のヘッダの札（五角形） */
  tab: Point[];
  header: TextRun[];
  nodes: NodeShape[];
  edges: EdgeShape[];
  /** 図枠の縁に載るポート（ibd の囲みブロックのポート・par のパラメータ） */
  framePorts: PortShape[];
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
  anchor: TextRun['anchor'] = 'start',
): TextRun {
  return { text, x, y, w: measure(text, style), style, anchor };
}

/** 文字・形をまとめてずらす（相対座標で組んだ箱を、置き場所へ動かす） */
export function shiftText(t: TextRun, dx: number, dy: number): TextRun {
  return { ...t, x: t.x + dx, y: t.y + dy };
}

export function shiftPrim(p: Prim, dx: number, dy: number): Prim {
  switch (p.t) {
    case 'rect':
      return { ...p, x: p.x + dx, y: p.y + dy };
    case 'ellipse':
      return { ...p, cx: p.cx + dx, cy: p.cy + dy };
    case 'line':
    case 'poly':
      return { ...p, pts: p.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
  }
}

/**
 * 長い文を幅 maxW で折り返す。日本語は 1 文字ずつ、英語は語の切れ目で折る。
 * 要求の text・コメント・ユースケース名に使う（1 行に収めると箱が横に伸び切る）。
 */
export function wrapText(measure: Measure, text: string, style: TextStyle, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    // 語（英数字の連なり）と、それ以外の 1 文字ずつに分ける
    const tokens = para.match(/[A-Za-z0-9_.,:;'"()[\]{}=<>+\-*/%~^#&|!?]+ ?|\s|./gu) ?? [''];
    let line = '';
    for (const tok of tokens) {
      const next = line + tok;
      if (line && measure(next.trimEnd(), style) > maxW) {
        lines.push(line.trimEnd());
        line = tok.trimStart();
      } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/**
 * 図枠のヘッダの札。`bdd` だけ太字にして、残りを続ける。
 * 札は左上の五角形（右下の角を斜めに切る）。SysML の図枠の決まった形。
 * 座標は図枠の左上からの相対。
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

/** 札（五角形）を任意の位置・文字で作る。sd の alt / ref、act のパーティション名には使わない */
export function tabShape(measure: Measure, text: string, x: number, y: number, bold = true) {
  const style = { size: FONT.edge, bold };
  const h = 18;
  const cut = 6;
  const t = textRun(measure, text, style, x + 6, baseline(y, h, FONT.edge));
  const w = Math.ceil(t.w + 12 + cut);
  const pts: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h - cut },
    { x: x + w - cut, y: y + h },
    { x, y: y + h },
  ];
  return { prim: { t: 'poly', pts, fill: 'paper' } as Prim, text: t, w, h };
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

export type EndKind =
  'diamondFilled' | 'diamondHollow' | 'triangle' | 'arrow' | 'arrowFilled' | 'crosshair';

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
    case 'arrowFilled':
      // 塗った矢じり。シーケンス図の同期メッセージ（非同期は開いた矢じり）
      return {
        marker: {
          shape: 'polygon',
          filled: true,
          points: [
            tip,
            at(tip, u, MARKER.arrowLen, n, MARKER.arrowHalf),
            at(tip, u, MARKER.arrowLen, n, -MARKER.arrowHalf),
          ],
        } satisfies MarkerShape,
        trim: MARKER.arrowLen,
      };
    case 'crosshair': {
      // 包含（丸に十字）。円の中心と、十字の 4 点を持つ
      const R = MARKER.crossR;
      const c = at(tip, u, R, n, 0);
      return {
        marker: {
          shape: 'circle',
          filled: false,
          points: [c, at(c, u, -R, n, 0), at(c, u, R, n, 0), at(c, u, 0, n, -R), at(c, u, 0, n, R)],
        } satisfies MarkerShape,
        trim: R * 2,
      };
    }
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

/** 線の途中に置く黒三角（項目フロー）。from → to の向きを指す */
export function midTriangle(from: Point, to: Point): MarkerShape {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const u = unit(to, from); // 先端から根元へ
  const n = { x: -u.y, y: u.x };
  const tip = at(mid, u, -MARKER.flowLen / 2, n, 0);
  return {
    shape: 'polygon',
    filled: true,
    points: [
      tip,
      at(tip, u, MARKER.flowLen, n, MARKER.flowHalf),
      at(tip, u, MARKER.flowLen, n, -MARKER.flowHalf),
    ],
  };
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

/** 両端に記号を付け、その分だけ線を縮める */
export function withEnds(points: Point[], ends: { source?: EndKind; target?: EndKind }) {
  let pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  const markers: MarkerShape[] = [];
  if (pts.length < 2) return { points: pts, markers };
  if (ends.source) {
    const m = endMarker(ends.source, pts[0], pts[1]);
    markers.push(m.marker);
    pts = trimEnd(pts, m.trim, 'start');
  }
  if (ends.target) {
    const m = endMarker(ends.target, pts[pts.length - 1], pts[pts.length - 2]);
    markers.push(m.marker);
    pts = trimEnd(pts, m.trim, 'end');
  }
  return { points: pts, markers };
}

/** 折れ線のいちばん長い線分（札と項目フローの三角を置く所） */
export function longestSegment(points: Point[]): [Point, Point] {
  let best: [Point, Point] = [points[0], points[1] ?? points[0]];
  let len = -1;
  for (let k = 1; k < points.length; k += 1) {
    const l = Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
    if (l > len) {
      len = l;
      best = [points[k - 1], points[k]];
    }
  }
  return best;
}

/** 端の文字（多重度・ロール名）の高さ。ELK に渡すラベルの箱に使う */
export const EDGE_LABEL_H = LINE_H.edge;
