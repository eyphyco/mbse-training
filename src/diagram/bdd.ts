/**
 * ブロック定義図（bdd）のレイアウト。モデル → 座標。
 *
 * 1. 要素ごとに箱の中身（ステレオタイプ・名前・コンパートメント）を組んで大きさを出す
 * 2. 箱・ポート・関係を ELK（layered）に渡して並べさせる
 * 3. 戻ってきた座標に、端の記号（ひし形・三角・矢じり）を足して描ける形にする
 *
 * 上下の向きは SysML の慣習に合わせる。**全体・一般が上、部分・特化が下**。
 * 汎化はモデル上「特化 → 一般」の向きなので、ELK には逆向きに渡して戻す。
 */
import { BOX, FONT, FRAME, LINE_H, PORT, estimateWidth } from './metrics.ts';
import type { Measure } from './metrics.ts';
import {
  COMPARTMENTS,
  KIND_STEREOTYPE,
  checkModel,
  headerRest,
  portText,
  propText,
} from './model.ts';
import type { Element, Model, Port, PortSide, Relation } from './model.ts';
import {
  EDGE_LABEL_H,
  baseline,
  endMarker,
  frameHeader,
  loadElk,
  textRun,
  trimEnd,
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
import type { ElkExtendedEdge, ElkLabel, ElkNode } from 'elkjs/lib/elk-api.js';

/** 箱の中身。座標は箱の左上からの相対 */
interface BoxContent {
  w: number;
  h: number;
  texts: TextRun[];
  dividers: number[];
}

/**
 * 箱の中身を組む。幅は一番長い行で決まり、短い行は中央（名前区画）か左（コンパートメント）に寄せる。
 * 先に全部の行を測り、幅が決まってから x を振る（2 回回す）。
 */
export function blockContent(el: Element, measure: Measure): BoxContent {
  type Row = { text: string; style: TextRun['style']; lineH: number; align: 'center' | 'left' };
  const head: Row[] = [];
  const stereos = [KIND_STEREOTYPE[el.kind], ...(el.stereotypes ?? [])];
  // UML の決まり: 複数のステレオタイプは 1 つの «» の中にカンマで並べる
  head.push({
    text: `«${stereos.join(', ')}»`,
    style: { size: FONT.stereotype },
    lineH: LINE_H.stereotype,
    align: 'center',
  });
  head.push({
    text: el.name,
    style: { size: FONT.name, bold: true, italic: el.abstract },
    lineH: LINE_H.name,
    align: 'center',
  });
  for (const [k, v] of Object.entries(el.tags ?? {}))
    head.push({
      text: `{${k} = ${v}}`,
      style: { size: FONT.tag },
      lineH: LINE_H.tag,
      align: 'center',
    });

  const comps: Row[][] = [];
  for (const c of COMPARTMENTS) {
    const props = (el.props ?? []).filter((p) => p.kind === c.kind);
    if (props.length === 0) continue;
    const rows: Row[] = [];
    // 列挙リテラルの区画は UML の慣習で見出しを付けない
    if (c.kind !== 'literal')
      rows.push({
        text: c.title,
        style: { size: FONT.compTitle, italic: true },
        lineH: LINE_H.compTitle,
        align: 'center',
      });
    for (const p of props)
      rows.push({
        text: propText(p),
        style: { size: FONT.line },
        lineH: LINE_H.line,
        align: 'left',
      });
    comps.push(rows);
  }

  const widths = [...head, ...comps.flat()].map((r) => measure(r.text, r.style));
  const w = Math.ceil(Math.max(BOX.minW, ...widths.map((x) => x + BOX.padX * 2)));

  const texts: TextRun[] = [];
  const dividers: number[] = [];
  /*
    上下の辺にポートがあると、縁にまたがる四角の内側半分が文字に被る。その分だけ中を空ける。
    左右の辺は padX（12px）が四角の半分（6px）より広いので足さなくてよい。
  */
  const sides = new Set((el.ports ?? []).map(sideOf));
  const portInset = PORT / 2 + 2;
  let y = BOX.headPadY + (sides.has('north') ? portInset : 0);
  const place = (r: Row, mw: number) => {
    const x = r.align === 'center' ? w / 2 : BOX.padX;
    texts.push({
      text: r.text,
      x,
      y: baseline(y, r.lineH, r.style.size),
      w: mw,
      style: r.style,
      anchor: r.align === 'center' ? 'middle' : 'start',
    });
    y += r.lineH;
  };
  let i = 0;
  for (const r of head) place(r, widths[i++]);
  y += BOX.headPadY;
  for (const rows of comps) {
    dividers.push(y);
    y += BOX.compPadY;
    for (const r of rows) place(r, widths[i++]);
    y += BOX.compPadY;
  }
  if (sides.has('south')) y += portInset;
  return { w, h: Math.ceil(y), texts, dividers };
}

/** ポートを置く辺。指定が無ければ「入りは左、出は右」 */
function sideOf(p: Port): PortSide {
  return p.side ?? (p.direction === 'in' ? 'west' : 'east');
}

/** 関係の端の記号。source / target の意味は model.ts の表 */
function endsOf(r: Relation): { source?: EndKind; target?: EndKind } {
  switch (r.kind) {
    case 'composition':
      return { source: 'diamondFilled', target: r.targetNavigable ? 'arrow' : undefined };
    case 'aggregation':
      return { source: 'diamondHollow', target: r.targetNavigable ? 'arrow' : undefined };
    case 'generalization':
      return { target: 'triangle' };
    case 'dependency':
      return { target: 'arrow' };
    case 'association':
      return { target: r.targetNavigable ? 'arrow' : undefined };
  }
}

/**
 * ELK に渡すときに向きを逆にする関係。
 * 汎化は「一般を上」、依存は「依存される側（要求など）を上」に置きたい。
 */
const reversed = (r: Relation) => r.kind === 'generalization' || r.kind === 'dependency';

/** 汎化の線を一般の側で 1 点にまとめる（UML の「木の形」）。そのための ELK のポート */
const genPort = (id: string) => `${id}::gen`;

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  // 箱の間は、多重度とロール名が 2 段積めて線が見える分（14px × 2 + 余白）
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
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
  // 書いた順を崩さない。問題の作者が並べた順は、多くの場合読ませたい順
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.padding': '[top=4,left=4,bottom=4,right=4]',
};

/**
 * bdd を並べる。measure を省くと推定幅を使う（Node 用）。
 * 描けないモデル（checkModel が NG を返す）は例外にする。
 */
export async function layoutBdd(
  model: Model,
  measure: Measure = estimateWidth,
): Promise<DiagramLayout> {
  const ng = checkModel(model);
  if (ng.length > 0) throw new Error(`図にできない: ${ng.join(' / ')}`);

  const contents = new Map(model.elements.map((el) => [el.id, blockContent(el, measure)]));
  const hasGen = new Set(
    model.relations.filter((r) => r.kind === 'generalization').map((r) => r.target),
  );
  const portById = new Map(model.elements.flatMap((el) => (el.ports ?? []).map((p) => [p.id, p])));

  const label = (text: string, placement: 'HEAD' | 'TAIL' | 'CENTER'): ElkLabel => ({
    text,
    width: Math.ceil(measure(text, { size: FONT.edge })),
    height: EDGE_LABEL_H,
    layoutOptions: { 'elk.edgeLabels.placement': placement },
  });

  const children: ElkNode[] = model.elements.map((el) => {
    const c = contents.get(el.id)!;
    const ports = (el.ports ?? []).map((p) => ({
      id: p.id,
      width: PORT,
      height: PORT,
      labels: [
        {
          text: portText(p),
          width: Math.ceil(measure(portText(p), { size: FONT.edge })),
          height: EDGE_LABEL_H,
        },
      ],
      layoutOptions: {
        'elk.port.side': sideOf(p).toUpperCase(),
        // 四角を箱の縁にまたがせる（半分外・半分内）。v1.2 の図の描き方
        'elk.port.borderOffset': String(-PORT / 2),
      },
    }));
    if (hasGen.has(el.id))
      ports.push({
        id: genPort(el.id),
        width: 0,
        height: 0,
        labels: [],
        layoutOptions: { 'elk.port.side': 'SOUTH', 'elk.port.borderOffset': '0' },
      });
    return {
      id: el.id,
      width: c.w,
      height: c.h,
      ports,
      layoutOptions: {
        'elk.portConstraints': 'FIXED_SIDE',
        'elk.portLabels.placement': 'OUTSIDE',
      },
    };
  });

  const edges: ElkExtendedEdge[] = model.relations.map((r) => {
    const rev = reversed(r);
    const labels: ElkLabel[] = [];
    // 端のラベル。ELK の HEAD は ELK 上の target 端なので、逆向きに渡すものは入れ替える
    const srcPlace = rev ? 'HEAD' : 'TAIL';
    const tgtPlace = rev ? 'TAIL' : 'HEAD';
    if (r.sourceRole) labels.push(label(r.sourceRole, srcPlace));
    if (r.sourceMult) labels.push(label(r.sourceMult, srcPlace));
    if (r.targetRole) labels.push(label(r.targetRole, tgtPlace));
    if (r.targetMult) labels.push(label(r.targetMult, tgtPlace));
    const mid = [r.stereotype ? `«${r.stereotype}»` : '', r.name ?? ''].filter(Boolean).join(' ');
    if (mid) labels.push(label(mid, 'CENTER'));
    const from = rev ? (r.kind === 'generalization' ? genPort(r.target) : r.target) : r.source;
    const to = rev ? r.source : r.target;
    return { id: r.id, sources: [from], targets: [to], labels };
  });

  const elk = await loadElk();
  const graph: ElkNode = { id: 'root', layoutOptions: LAYOUT_OPTIONS, children, edges };
  const out = await elk.layout(graph);

  // ヘッダの札の下に中身を置く
  const { tab, header, tabW } = frameHeader(measure, model.frame.kind, headerRest(model.frame));
  const ox = FRAME.pad;
  const oy = FRAME.tabH + FRAME.pad;
  /*
    座標は整数に丸める。描く側で 0.5 ずらして 1px の線を画素に揃える（Diagram.tsx）。
    ELK は 150.25 のような端数を返し、そのままだと縁が 2 画素ににじんで細い線が灰色に見える
  */
  const shift = (p: Point): Point => ({ x: Math.round(p.x + ox), y: Math.round(p.y + oy) });

  const nodes: NodeShape[] = (out.children ?? []).map((n) => {
    const c = contents.get(n.id)!;
    const { x, y } = shift({ x: n.x ?? 0, y: n.y ?? 0 });
    const ports: PortShape[] = (n.ports ?? [])
      .filter((p) => portById.has(p.id))
      .map((p) => {
        const port = portById.get(p.id)!;
        const px = Math.round(x + (p.x ?? 0));
        const py = Math.round(y + (p.y ?? 0));
        const l = p.labels?.[0];
        return {
          id: p.id,
          x: px,
          y: py,
          size: PORT,
          side: sideOf(port),
          kind: port.kind,
          direction: port.direction,
          label: textRun(
            measure,
            l?.text ?? '',
            { size: FONT.edge },
            px + (l?.x ?? 0),
            baseline(py + (l?.y ?? 0), EDGE_LABEL_H, FONT.edge),
          ),
        };
      });
    return {
      id: n.id,
      x,
      y,
      w: c.w,
      h: c.h,
      texts: c.texts.map((t) => ({ ...t, x: t.x + x, y: t.y + y })),
      dividers: c.dividers.map((d) => d + y),
      ports,
    };
  });

  const relById = new Map(model.relations.map((r) => [r.id, r]));
  const edgeShapes: EdgeShape[] = (out.edges ?? []).map((e) => {
    const r = relById.get(e.id)!;
    const s = e.sections?.[0];
    let pts: Point[] = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(shift) : [];
    if (reversed(r)) pts = pts.reverse();
    // ELK は折れ点が始点と重なった点をそのまま返すことがある。記号の向きが出せなくなるので落とす
    pts = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
    const ends = endsOf(r);
    const markers: MarkerShape[] = [];
    if (pts.length >= 2) {
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
    }
    const texts = (e.labels ?? []).map((l) =>
      textRun(
        measure,
        l.text ?? '',
        { size: FONT.edge },
        (l.x ?? 0) + ox,
        baseline((l.y ?? 0) + oy, EDGE_LABEL_H, FONT.edge),
      ),
    );
    return { id: r.id, kind: r.kind, dashed: r.kind === 'dependency', points: pts, markers, texts };
  });

  return {
    width: Math.ceil(Math.max(tabW, out.width ?? 0) + FRAME.pad * 2),
    height: Math.ceil(oy + (out.height ?? 0) + FRAME.pad),
    tab,
    header,
    nodes,
    edges: edgeShapes,
  };
}
