/**
 * 箱と線の図を ELK（layered）で並べる共通部分。bdd・ibd・par・pkg・req・uc・stm が使う。
 * （act と sd は並べ方が違うので別に持つ。act.ts・sd.ts の頭に理由）
 *
 * 図枠そのものを ELK の入れ物 1 つにしてある。図枠の縁に載るポート（ibd の囲みブロックの
 * ポート・par のパラメータ）を、入れ物の縁のポートとしてそのまま並べられるため。
 * 入れ子（パッケージの中身・複合状態）は INCLUDE_CHILDREN で 1 回に並べる。
 * 入れ子ごとに別々に並べると、入れ子をまたぐ線（主題の外のアクター → 中のユースケース）が引けない。
 */
import { FONT, FRAME, PORT, estimateWidth } from './metrics.ts';
import type { Measure } from './metrics.ts';
import type { FlowDirection, PortSide } from './model.ts';
import {
  EDGE_LABEL_H,
  baseline,
  frameHeader,
  loadElk,
  longestSegment,
  midTriangle,
  shiftPrim,
  shiftText,
  textRun,
  withEnds,
} from './layout.ts';
import type {
  DiagramLayout,
  EdgeShape,
  EndKind,
  MarkerShape,
  NodeShape,
  Point,
  PortShape,
  TextRun,
} from './layout.ts';
import { clipToOutline } from './shapes.ts';
import type { Box, Rect } from './shapes.ts';
import type { ElkExtendedEdge, ElkLabel, ElkNode, ElkPort } from 'elkjs/lib/elk-api.js';

export interface GPort {
  id: string;
  side: PortSide;
  kind: PortShape['kind'];
  direction?: FlowDirection;
  label: string;
  /** 位置を決めてある（制約パラメータ）。箱からの相対、四角の左上 */
  fixed?: { x: number; y: number; label: TextRun };
}

export interface GNode {
  id: string;
  box: Box;
  ports: GPort[];
  children: GNode[];
  inert?: boolean;
}

export interface GLabel {
  text: string;
  at: 'source' | 'target' | 'center';
}

export interface GEdge {
  id: string;
  kind: string;
  /** モデルの向き（source → target）。ELK に渡す向きは reverse で決める */
  source: string;
  target: string;
  /** ELK に逆向きで渡す（汎化・依存: 一般の側・依存される側を上に置くため） */
  reverse?: boolean;
  /** 汎化の線を一般の側で 1 点にまとめる（UML の「木の形」） */
  merge?: boolean;
  ends: { source?: EndKind; target?: EndKind };
  dashed?: boolean;
  labels: GLabel[];
  /** 項目フロー。線の途中に黒三角を置き、札を添える */
  flows?: { text: string; reverse?: boolean }[];
}

export interface GraphSpec {
  kind: string;
  rest: string;
  direction: 'DOWN' | 'RIGHT';
  framePorts: GPort[];
  nodes: GNode[];
  edges: GEdge[];
  /** 層の間隔（既定 64）。端に多重度とロール名を 2 段積む bdd は広く要る */
  layerGap?: number;
}

const FRAME_ID = '__frame';
const mergePort = (id: string) => `${id}::gen`;

function baseOptions(spec: GraphSpec): Record<string, string> {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': spec.direction,
    'elk.edgeRouting': 'ORTHOGONAL',
    // 箱の間は、多重度とロール名が 2 段積めて線が見える分（14px × 2 + 余白）
    'elk.layered.spacing.nodeNodeBetweenLayers': String(spec.layerGap ?? 64),
    'elk.spacing.nodeNode': '40',
    'elk.spacing.edgeNode': '20',
    /*
      箱の縁から最初の折れ点まで。既定の 10px だと、ひし形（16px）も三角（13px）も
      入りきらず、記号の分だけ線を縮めたところで線が消えていた。記号 + 線が見える 8px
    */
    'elk.layered.spacing.edgeNodeBetweenLayers': '24',
    'elk.spacing.edgeEdge': '14',
    'elk.spacing.edgeLabel': '3',
    'elk.spacing.labelLabel': '2',
    'elk.spacing.portPort': '18',
    // 書いた順を崩さない。問題の作者が並べた順は、多くの場合読ませたい順
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  };
}

/**
 * 並べる。measure を省くと推定幅を使う（Node 用）。
 */
export async function layoutGraph(
  spec: GraphSpec,
  measure: Measure = estimateWidth,
): Promise<DiagramLayout> {
  const opts = baseOptions(spec);
  const { tab, header, tabW } = frameHeader(measure, spec.kind, spec.rest);
  const mergeTargets = new Set(spec.edges.filter((e) => e.merge).map((e) => e.target));
  const mergeSide = spec.direction === 'DOWN' ? 'SOUTH' : 'EAST';

  const label = (text: string, placement: 'HEAD' | 'TAIL' | 'CENTER'): ElkLabel => ({
    text,
    width: Math.ceil(measure(text, { size: FONT.edge })),
    height: EDGE_LABEL_H,
    layoutOptions: { 'elk.edgeLabels.placement': placement },
  });

  const portOf = (p: GPort): ElkPort =>
    p.fixed
      ? { id: p.id, width: PORT, height: PORT, x: p.fixed.x, y: p.fixed.y }
      : {
          id: p.id,
          width: PORT,
          height: PORT,
          labels: [
            {
              text: p.label,
              width: Math.ceil(measure(p.label, { size: FONT.edge })),
              height: EDGE_LABEL_H,
            },
          ],
          layoutOptions: {
            'elk.port.side': p.side.toUpperCase(),
            // 四角を箱の縁にまたがせる（半分外・半分内）。v1.2 の図の描き方
            'elk.port.borderOffset': String(-PORT / 2),
          },
        };

  const nodeById = new Map<string, GNode>();
  const portById = new Map<string, GPort>();
  const toElk = (n: GNode): ElkNode => {
    nodeById.set(n.id, n);
    for (const p of n.ports) portById.set(p.id, p);
    const ports = n.ports.map(portOf);
    if (mergeTargets.has(n.id))
      ports.push({
        id: mergePort(n.id),
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': mergeSide, 'elk.port.borderOffset': '0' },
      });
    const fixed = n.ports.some((p) => p.fixed);
    const layoutOptions: Record<string, string> = {
      'elk.portConstraints': fixed ? 'FIXED_POS' : 'FIXED_SIDE',
      'elk.portLabels.placement': 'OUTSIDE',
    };
    if (n.children.length === 0)
      return { id: n.id, width: n.box.w, height: n.box.h, ports, layoutOptions };
    const pad = n.box.pad ?? { top: 12, left: 12, bottom: 12, right: 12 };
    return {
      id: n.id,
      ports,
      children: n.children.map(toElk),
      layoutOptions: {
        ...opts,
        ...layoutOptions,
        'elk.padding': `[top=${pad.top},left=${pad.left},bottom=${pad.bottom},right=${pad.right}]`,
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${n.box.w}, ${n.box.h})`,
      },
    };
  };

  const frameNode: ElkNode = {
    id: FRAME_ID,
    children: spec.nodes.map(toElk),
    ports: spec.framePorts.map((p) => {
      portById.set(p.id, p);
      return portOf(p);
    }),
    layoutOptions: {
      ...opts,
      'elk.padding': `[top=${FRAME.tabH + FRAME.pad},left=${FRAME.pad},bottom=${FRAME.pad},right=${FRAME.pad}]`,
      'elk.portConstraints': 'FIXED_SIDE',
      // 図枠のポートの名前は図枠の内側に書く（外は図の外になる）
      'elk.portLabels.placement': 'INSIDE',
      'elk.nodeSize.constraints': 'MINIMUM_SIZE PORTS PORT_LABELS',
      'elk.nodeSize.minimum': `(${Math.ceil(tabW + FRAME.pad)}, ${FRAME.tabH + FRAME.pad * 2})`,
    },
  };

  const edges: ElkExtendedEdge[] = spec.edges.map((e) => {
    const rev = !!e.reverse;
    // 端のラベル。ELK の HEAD は ELK 上の target 端なので、逆向きに渡すものは入れ替える
    const place = (at: GLabel['at']) =>
      at === 'center' ? 'CENTER' : (at === 'source') !== rev ? 'TAIL' : 'HEAD';
    const labels = e.labels.map((l) => label(l.text, place(l.at)));
    for (const f of e.flows ?? []) labels.push(label(f.text, 'CENTER'));
    const from = rev ? (e.merge ? mergePort(e.target) : e.target) : e.source;
    const to = rev ? e.source : e.target;
    return { id: e.id, sources: [from], targets: [to], labels };
  });

  /*
    入れ子が無い図は、図枠の入れ物の中だけで並べる（線も入れ物に持たせる）。
    INCLUDE_CHILDREN と considerModelOrder を同時に使うと elkjs 0.12 の交差削減が落ちる
    （TypeError: reading 'a'。2026-10-06 に bdd の見本 5 枚すべてで再現）。
    入れ子のある図だけ INCLUDE_CHILDREN にし、そのときは書いた順の考慮を諦める
  */
  const nested = spec.nodes.some((n) => n.children.length > 0);
  if (nested) {
    const strip = (n: ElkNode) => {
      if (n.layoutOptions) n.layoutOptions['elk.layered.considerModelOrder.strategy'] = 'NONE';
      for (const k of n.children ?? []) strip(k);
    };
    strip(frameNode);
  } else frameNode.edges = edges;
  const elk = await loadElk();
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      ...opts,
      ...(nested
        ? {
            'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
            'elk.layered.considerModelOrder.strategy': 'NONE',
          }
        : {}),
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children: [frameNode],
    edges: nested ? edges : [],
  };
  const out = await elk.layout(graph);
  const F = out.children![0];
  const outEdges = nested ? (out.edges ?? []) : (F.edges ?? []);

  // 図枠の縁にポートがあれば、半分はみ出す分だけ外に余白を取る
  const m = spec.framePorts.length > 0 ? Math.ceil(PORT / 2) + 2 : 0;
  const ox = m - (F.x ?? 0);
  const oy = m - (F.y ?? 0);
  /*
    座標は整数に丸める。描く側で 0.5 ずらして 1px の線を画素に揃える（Diagram.tsx）。
    ELK は 150.25 のような端数を返し、そのままだと縁が 2 画素ににじんで細い線が灰色に見える
  */
  const shift = (p: Point): Point => ({ x: Math.round(p.x + ox), y: Math.round(p.y + oy) });
  const frame = { x: m, y: m, w: Math.round(F.width ?? 0), h: Math.round(F.height ?? 0) };

  const portShape = (p: ElkPort, nx: number, ny: number): PortShape => {
    const g = portById.get(p.id)!;
    const px = Math.round(p.x ?? 0) + ox;
    const py = Math.round(p.y ?? 0) + oy;
    if (g.fixed)
      return {
        id: p.id,
        x: px,
        y: py,
        size: PORT,
        side: g.side,
        kind: g.kind,
        direction: g.direction,
        label: shiftText(g.fixed.label, nx, ny),
      };
    const l = p.labels?.[0];
    return {
      id: p.id,
      x: px,
      y: py,
      size: PORT,
      side: g.side,
      kind: g.kind,
      direction: g.direction,
      // shapeCoords ROOT ではポートのラベルも絶対座標で返ってくる（elkjs 0.12 で実測）
      label: textRun(
        measure,
        l?.text ?? g.label,
        { size: FONT.edge },
        l ? Math.round(l.x ?? 0) + ox : px,
        baseline(l ? Math.round(l.y ?? 0) + oy : py, EDGE_LABEL_H, FONT.edge),
      ),
    };
  };

  const rects = new Map<string, Rect>();
  const containers: NodeShape[] = [];
  const leaves: NodeShape[] = [];
  const walk = (n: ElkNode) => {
    const g = nodeById.get(n.id)!;
    const { x, y } = shift({ x: n.x ?? 0, y: n.y ?? 0 });
    const w = Math.round(n.width ?? g.box.w);
    const h = Math.round(n.height ?? g.box.h);
    rects.set(n.id, { x, y, w, h });
    const kids = (n.children ?? []).map((k) => ({
      x: Math.round((k.x ?? 0) + ox) - x,
      y: Math.round((k.y ?? 0) + oy) - y,
      w: Math.round(k.width ?? 0),
      h: Math.round(k.height ?? 0),
    }));
    const painted = g.box.paint(w, h, kids);
    const shape: NodeShape = {
      id: n.id,
      x,
      y,
      w,
      h,
      prims: painted.prims.map((p) => shiftPrim(p, x, y)),
      texts: painted.texts.map((t) => shiftText(t, x, y)),
      ports: (n.ports ?? []).filter((p) => portById.has(p.id)).map((p) => portShape(p, x, y)),
      container: g.children.length > 0,
      inert: g.inert,
    };
    (shape.container ? containers : leaves).push(shape);
    for (const k of n.children ?? []) walk(k);
  };
  for (const k of F.children ?? []) walk(k);

  const edgeById = new Map(spec.edges.map((e) => [e.id, e]));
  const edgeShapes: EdgeShape[] = outEdges.map((e) => {
    const g = edgeById.get(e.id)!;
    const s = e.sections?.[0];
    let pts: Point[] = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(shift) : [];
    if (g.reverse) pts = pts.reverse();
    pts = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
    // 楕円・ひし形・丸の端は、外接矩形の縁から形の縁まで伸ばす
    const clip = (id: string, end: 'start' | 'end') => {
      const node = nodeById.get(id);
      const r = rects.get(id);
      if (!node?.box.outline || !r || pts.length < 2) return;
      if (end === 'start') pts[0] = clipToOutline(node.box.outline, r, pts[1], pts[0]);
      else
        pts[pts.length - 1] = clipToOutline(
          node.box.outline,
          r,
          pts[pts.length - 2],
          pts[pts.length - 1],
        );
    };
    clip(g.source, 'start');
    clip(g.target, 'end');
    const ended = withEnds(pts, g.ends);
    const markers: MarkerShape[] = [...ended.markers];
    for (const f of g.flows ?? []) {
      const [a, b] = longestSegment(ended.points);
      markers.push(f.reverse ? midTriangle(b, a) : midTriangle(a, b));
    }
    const texts = (e.labels ?? []).map((l) =>
      textRun(
        measure,
        l.text ?? '',
        { size: FONT.edge },
        Math.round((l.x ?? 0) + ox),
        baseline(Math.round((l.y ?? 0) + oy), EDGE_LABEL_H, FONT.edge),
      ),
    );
    return {
      id: g.id,
      kind: g.kind,
      dashed: !!g.dashed,
      points: ended.points,
      markers,
      texts,
    };
  });

  /*
    図枠のポートの名前は、ELK に任せると縁のすぐ内側の下に置かれ、つながる先のパートの
    ポートの名前と重なった（ibd の見本で再現）。線の上側に自分で置く
  */
  const framePorts = (F.ports ?? []).map((p) => {
    const s = portShape(p, frame.x, frame.y);
    if (s.kind === 'param' && spec.framePorts.find((g) => g.id === p.id)?.fixed) return s;
    const t = s.label;
    const y = s.y - 3;
    if (s.side === 'west')
      return { ...s, label: { ...t, x: s.x + s.size + 4, y, anchor: 'start' as const } };
    if (s.side === 'east') return { ...s, label: { ...t, x: s.x - 4, y, anchor: 'end' as const } };
    return s;
  });

  return {
    width: Math.ceil(frame.w + m * 2 + 1),
    height: Math.ceil(frame.h + m * 2 + 1),
    frame,
    tab: tab.map((p) => ({ x: p.x + frame.x, y: p.y + frame.y })),
    header: header.map((t) => shiftText(t, frame.x, frame.y)),
    nodes: [...containers, ...leaves],
    edges: edgeShapes,
    framePorts,
  };
}
