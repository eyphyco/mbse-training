/**
 * 要素 1 つの形（箱の中身）。要素 → 大きさと、その大きさで描くプリミティブ。
 *
 * 座標はすべて箱の左上からの相対。置き場所はレイアウト（graph.ts / act.ts / sd.ts）が決める。
 * 入れ物（パッケージ・主題・複合状態）は大きさを ELK が決めるので、paint は
 * **最終の大きさと中身の位置を受け取ってから**描く（領域の区切り線は中身の位置で決まる）。
 *
 * 形は v1.2 の記法に合わせる。迷った所と、決めた理由を各関数の頭に書く。
 */
import { BOX, FONT, LINE_H, PORT } from './metrics.ts';
import type { Measure, TextStyle } from './metrics.ts';
import { COMPARTMENTS, KIND_STEREOTYPE, propText, usageText } from './model.ts';
import type { Element, Port, PortSide } from './model.ts';
import { baseline, wrapText } from './layout.ts';
import type { Point, Prim, TextRun } from './layout.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Painted {
  prims: Prim[];
  texts: TextRun[];
}

/** 外形。線の端をこの形の縁で止める（ELK は外接矩形の縁で止めるため） */
export type Outline = 'rect' | 'ellipse' | 'diamond';

export interface Box {
  /** 葉はこの大きさ、入れ物は最小の大きさ */
  w: number;
  h: number;
  /** 入れ物なら中身を置く余白 */
  pad?: { top: number; left: number; bottom: number; right: number };
  outline?: Outline;
  /** 位置を決めて置くポート（制約パラメータ）。四角の左上、箱からの相対 */
  fixedPorts?: { id: string; x: number; y: number; side: PortSide; label: TextRun }[];
  paint(w: number, h: number, kids: Rect[]): Painted;
}

type Row = { text: string; style: TextStyle; lineH: number; align: 'center' | 'left' };

const stereoRow = (names: string[]): Row => ({
  // UML の決まり: 複数のステレオタイプは 1 つの «» の中にカンマで並べる
  text: `«${names.join(', ')}»`,
  style: { size: FONT.stereotype },
  lineH: LINE_H.stereotype,
  align: 'center',
});
const nameRow = (text: string, italic?: boolean): Row => ({
  text,
  style: { size: FONT.name, bold: true, italic },
  lineH: LINE_H.name,
  align: 'center',
});
const lineRow = (text: string, align: Row['align'] = 'left'): Row => ({
  text,
  style: { size: FONT.line },
  lineH: LINE_H.line,
  align,
});
const titleRow = (text: string): Row => ({
  text,
  style: { size: FONT.compTitle, italic: true },
  lineH: LINE_H.compTitle,
  align: 'center',
});

/** 種別のステレオタイプと、足したステレオタイプ */
export function stereotypesOf(el: Element): string[] {
  const own = KIND_STEREOTYPE[el.kind];
  return [...(own ? [own] : []), ...(el.stereotypes ?? [])];
}

/** 箱の中身（文字と仕切り線）。座標は箱の左上からの相対 */
export interface BoxContent {
  w: number;
  h: number;
  texts: TextRun[];
  dividers: number[];
}

/**
 * 名前区画 + コンパートメントの箱を組む。幅は一番長い行で決まり、
 * 短い行は中央（名前区画）か左（コンパートメント）に寄せる。
 * 先に全部の行を測り、幅が決まってから x を振る（2 回回す）。
 */
function stack(
  head: Row[],
  comps: Row[][],
  measure: Measure,
  opts: { minW?: number; insetTop?: number; insetBottom?: number; padX?: number } = {},
): BoxContent {
  const padX = opts.padX ?? BOX.padX;
  const widths = [...head, ...comps.flat()].map((r) => measure(r.text, r.style));
  const w = Math.ceil(Math.max(opts.minW ?? BOX.minW, ...widths.map((x) => x + padX * 2)));
  const texts: TextRun[] = [];
  const dividers: number[] = [];
  let y = BOX.headPadY + (opts.insetTop ?? 0);
  const place = (r: Row, mw: number) => {
    texts.push({
      text: r.text,
      x: r.align === 'center' ? w / 2 : padX,
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
  y += opts.insetBottom ?? 0;
  return { w, h: Math.ceil(y), texts, dividers };
}

/** 割り当ての区画（mu-alloc-repr）。見出しは v1.2 の綴りのまま */
function allocComps(el: Element): Row[][] {
  const out: Row[][] = [];
  if (el.allocatedFrom?.length)
    out.push([titleRow('allocatedFrom'), ...el.allocatedFrom.map((t) => lineRow(t))]);
  if (el.allocatedTo?.length)
    out.push([titleRow('allocatedTo'), ...el.allocatedTo.map((t) => lineRow(t))]);
  return out;
}

/** ポートを置く辺。指定が無ければ「入りは左、出は右」 */
export function sideOf(p: Port): PortSide {
  return p.side ?? (p.direction === 'in' ? 'west' : 'east');
}

/**
 * ブロック類の箱（bdd の定義・要求・テストケース・ビューポイント）。
 *
 * 要求の text は折り返す（1 行に収めると箱が横に伸び切り、図が読めない幅になる）。
 * 幅 220px は、本番の図で要求の箱がおよそ 30 字で折れているのに合わせた。
 */
export function blockContent(el: Element, measure: Measure): BoxContent {
  const head: Row[] = [];
  const stereos = stereotypesOf(el);
  if (stereos.length > 0) head.push(stereoRow(stereos));
  head.push(nameRow(el.name, el.abstract));
  const comps: Row[][] = [];
  if (el.kind === 'viewpoint') {
    // ビューポイントのタグは区画に並べる（stakeholders・purpose など。1 行が長い）
    const rows = Object.entries(el.tags ?? {}).flatMap(([k, v]) =>
      wrapText(measure, `${k} = "${v}"`, { size: FONT.line }, 240).map((t) => lineRow(t)),
    );
    if (rows.length > 0) comps.push(rows);
  } else
    for (const [k, v] of Object.entries(el.tags ?? {}))
      head.push({
        text: `{${k} = ${v}}`,
        style: { size: FONT.tag },
        lineH: LINE_H.tag,
        align: 'center',
      });

  if (el.kind === 'requirement') {
    const rows: Row[] = [];
    if (el.reqId !== undefined) rows.push(lineRow(`id = "${el.reqId}"`));
    if (el.text !== undefined)
      rows.push(
        ...wrapText(measure, `text = "${el.text}"`, { size: FONT.line }, 220).map((t) =>
          lineRow(t),
        ),
      );
    if (rows.length > 0) comps.push(rows);
  }

  for (const c of COMPARTMENTS) {
    const props = (el.props ?? []).filter((p) => p.kind === c.kind);
    if (props.length === 0) continue;
    const rows: Row[] = [];
    // 列挙リテラルの区画は UML の慣習で見出しを付けない
    if (c.kind !== 'literal') rows.push(titleRow(c.title));
    for (const p of props) rows.push(lineRow(propText(p)));
    comps.push(rows);
  }
  comps.push(...allocComps(el));

  /*
    上下の辺にポートがあると、縁にまたがる四角の内側半分が文字に被る。その分だけ中を空ける。
    左右の辺は padX（12px）が四角の半分（6px）より広いので足さなくてよい。
  */
  const sides = new Set((el.ports ?? []).map(sideOf));
  const portInset = PORT / 2 + 2;
  return stack(head, comps, measure, {
    insetTop: sides.has('north') ? portInset : 0,
    insetBottom: sides.has('south') ? portInset : 0,
  });
}

const rectPaint =
  (c: BoxContent, opts: { r?: number; dash?: boolean } = {}) =>
  (w: number, h: number): Painted => ({
    prims: [
      { t: 'rect', x: 0, y: 0, w, h, r: opts.r, dash: opts.dash, fill: 'paper' },
      ...c.dividers.map((y): Prim => ({
        t: 'line',
        pts: [
          { x: 0, y },
          { x: w, y },
        ],
      })),
    ],
    // 中央寄せの行は、ELK が箱を広げたときも真ん中に来るように付け直す
    texts: c.texts.map((t) => (t.anchor === 'middle' ? { ...t, x: w / 2 } : t)),
  });

export function blockBox(el: Element, measure: Measure): Box {
  const c = blockContent(el, measure);
  return { w: c.w, h: c.h, paint: rectPaint(c) };
}

/**
 * 使用の箱（ibd のパート・参照・値属性）。`engine : Engine [1]`。
 *
 * 参照プロパティは**点線の箱**（v1.2）。パートとの見分けは線の種類だけなので、
 * spot_error で問える。中にパートを入れる入れ物にもなる（入れ子のパート）。
 */
export function usageBox(el: Element, measure: Measure, container: boolean): Box {
  const head: Row[] = [];
  if (el.stereotypes?.length) head.push(stereoRow(el.stereotypes));
  head.push({ ...nameRow(usageText(el)), style: { size: FONT.name, bold: false } });
  const comps = allocComps(el);
  const c = stack(head, comps, measure, { minW: 110 });
  const dash = el.kind === 'reference';
  if (!container) return { w: c.w, h: c.h, paint: rectPaint(c, { dash }) };
  return {
    w: c.w,
    h: c.h + 30,
    pad: { top: c.h + 12, left: 16, bottom: 16, right: 16 },
    paint: rectPaint(c, { dash }),
  };
}

/**
 * 制約プロパティ（par）。角の丸い箱に `eq : NewtonLaw` と `{F = m * a}`。
 * パラメータは縁の小さな四角で、名前は**箱の内側**に書く（v1.2 の図の書き方）。
 *
 * 名前を内側に書くと中央の式と重なりうるので、パラメータは式の下の行に 1 つずつ並べ、
 * 位置を ELK に任せず固定する（FIXED_POS）。左右どちらの辺かは side、無ければ前半を左。
 */
export function constraintPropertyBox(el: Element, measure: Measure): Box {
  const head: Row[] = [];
  if (el.stereotypes?.length) head.push(stereoRow(el.stereotypes));
  head.push({ ...nameRow(usageText(el)), style: { size: FONT.name, bold: false } });
  if (el.expr) head.push(lineRow(`{${el.expr}}`, 'center'));
  const c = stack(head, [], measure, { minW: 120 });

  const params = el.ports ?? [];
  const half = Math.ceil(params.length / 2);
  const sides = params.map((p, i) => p.side ?? (i < half ? 'west' : 'east'));
  const style = { size: FONT.edge };
  const labelW = (s: PortSide) =>
    Math.max(0, ...params.filter((_, i) => sides[i] === s).map((p) => measure(p.name, style)));
  const inner = PORT / 2 + 4;
  const w = Math.ceil(Math.max(c.w, labelW('west') + labelW('east') + inner * 2 + 24));
  const rowH = 20;
  const rowsWest = sides.filter((s) => s === 'west').length;
  const rowsEast = sides.filter((s) => s === 'east').length;
  const top = c.h - 2;
  const h = Math.ceil(top + Math.max(rowsWest, rowsEast, 0) * rowH + 6);
  const count: Record<string, number> = { west: 0, east: 0 };
  const fixedPorts = params.map((p, i) => {
    const s = sides[i] === 'east' ? 'east' : 'west';
    const k = count[s]++;
    const cy = top + k * rowH + rowH / 2;
    const x = s === 'west' ? -PORT / 2 : w - PORT / 2;
    const y = cy - PORT / 2;
    const lx = s === 'west' ? inner : w - inner;
    const label: TextRun = {
      text: p.name,
      x: lx,
      y: baseline(cy - LINE_H.edge / 2, LINE_H.edge, FONT.edge),
      w: measure(p.name, style),
      style,
      anchor: s === 'west' ? 'start' : 'end',
    };
    return { id: p.id, x, y, side: s as PortSide, label };
  });
  return {
    w,
    h,
    fixedPorts,
    paint: (pw, ph) => ({
      prims: [{ t: 'rect', x: 0, y: 0, w: pw, h: ph, r: 12, fill: 'paper' }],
      texts: c.texts.map((t) => (t.anchor === 'middle' ? { ...t, x: pw / 2 } : t)),
    }),
  };
}

/**
 * パッケージ（フォルダの形）。左上に札。
 * 中身を描くときは名前を札に、描かないときは本体の真ん中に書く（UML の 2 つの書き方）。
 * model・modelLibrary・view は同じ形にステレオタイプを付ける。
 */
export function packageBox(el: Element, measure: Measure, container: boolean): Box {
  const stereos = stereotypesOf(el);
  const tabH = 18;
  if (container) {
    const label = `${stereos.length ? `«${stereos.join(', ')}» ` : ''}${el.name}`;
    const style = { size: FONT.name, bold: true };
    const tw = Math.ceil(measure(label, style) + 16);
    return {
      w: tw + 40,
      h: tabH + 40,
      pad: { top: tabH + 14, left: 16, bottom: 16, right: 16 },
      paint: (w, h) => ({
        prims: [
          { t: 'rect', x: 0, y: 0, w: tw, h: tabH, fill: 'paper' },
          { t: 'rect', x: 0, y: tabH, w, h: h - tabH, fill: 'paper' },
        ],
        texts: [
          {
            text: label,
            x: 8,
            y: baseline(0, tabH, FONT.name),
            w: tw - 16,
            style,
            anchor: 'start',
          },
        ],
      }),
    };
  }
  const head: Row[] = [];
  if (stereos.length) head.push(stereoRow(stereos));
  head.push(nameRow(el.name));
  const c = stack(head, [], measure, { insetTop: tabH, minW: 100 });
  const tw = Math.min(46, c.w * 0.4);
  return {
    w: c.w,
    h: c.h + 6,
    paint: (w, h) => ({
      prims: [
        { t: 'rect', x: 0, y: 0, w: tw, h: tabH * 0.6, fill: 'paper' },
        { t: 'rect', x: 0, y: tabH * 0.6, w, h: h - tabH * 0.6, fill: 'paper' },
      ],
      texts: c.texts.map((t) => (t.anchor === 'middle' ? { ...t, x: w / 2 } : t)),
    }),
  };
}

/** アクター（棒人間）。名前は足の下 */
export function actorBox(el: Element, measure: Measure): Box {
  const style = { size: FONT.name, bold: true };
  const head = el.stereotypes?.length ? `«${el.stereotypes.join(', ')}»` : '';
  const nw = measure(el.name, style);
  const sw = head ? measure(head, { size: FONT.stereotype }) : 0;
  const w = Math.ceil(Math.max(40, nw + 4, sw + 4));
  const fig = 46;
  const h = fig + LINE_H.name + (head ? LINE_H.stereotype : 0) + 2;
  return {
    w,
    h,
    paint: (pw) => {
      const cx = pw / 2;
      const prims: Prim[] = [
        { t: 'ellipse', cx, cy: 8, rx: 7, ry: 7, fill: 'paper' },
        {
          t: 'line',
          pts: [
            { x: cx, y: 15 },
            { x: cx, y: 31 },
          ],
        },
        {
          t: 'line',
          pts: [
            { x: cx - 11, y: 21 },
            { x: cx + 11, y: 21 },
          ],
        },
        {
          t: 'line',
          pts: [
            { x: cx - 10, y: 44 },
            { x: cx, y: 31 },
            { x: cx + 10, y: 44 },
          ],
        },
      ];
      const texts: TextRun[] = [];
      let y = fig;
      if (head) {
        texts.push({
          text: head,
          x: cx,
          y: baseline(y, LINE_H.stereotype, FONT.stereotype),
          w: sw,
          style: { size: FONT.stereotype },
          anchor: 'middle',
        });
        y += LINE_H.stereotype;
      }
      texts.push({
        text: el.name,
        x: cx,
        y: baseline(y, LINE_H.name, FONT.name),
        w: nw,
        style,
        anchor: 'middle',
      });
      return { prims, texts };
    },
  };
}

/**
 * ユースケース（楕円）。名前は折り返して中に収める。
 * 矩形 (tw, th) が楕円に入る条件 (tw/2a)² + (th/2b)² ≤ 1 を、a = tw/√2・b = th/√2 で満たす。
 */
export function ellipseUseCaseBox(el: Element, measure: Measure): Box {
  const style = { size: FONT.name, bold: false };
  const lines = wrapText(measure, el.name, style, 150);
  const head = el.stereotypes?.length ? `«${el.stereotypes.join(', ')}»` : '';
  const rows = [...(head ? [head] : []), ...lines];
  const tw = Math.max(...rows.map((l) => measure(l, style)));
  const th = rows.length * LINE_H.name;
  const w = Math.ceil(Math.max(110, tw * Math.SQRT2 + 12));
  const h = Math.ceil(Math.max(44, th * Math.SQRT2 + 8));
  return {
    w,
    h,
    outline: 'ellipse',
    paint: (pw, ph) => {
      const top = ph / 2 - th / 2;
      return {
        prims: [{ t: 'ellipse', cx: pw / 2, cy: ph / 2, rx: pw / 2, ry: ph / 2, fill: 'paper' }],
        texts: rows.map((text, i) => ({
          text,
          x: pw / 2,
          y: baseline(top + i * LINE_H.name, LINE_H.name, FONT.name),
          w: measure(text, i === 0 && head ? { size: FONT.stereotype } : style),
          style: i === 0 && head ? { size: FONT.stereotype } : style,
          anchor: 'middle' as const,
        })),
      };
    },
  };
}

/** 主題（システムの境界）。名前は上辺の内側 */
export function subjectBox(el: Element, measure: Measure): Box {
  const head: Row[] = [];
  if (el.stereotypes?.length) head.push(stereoRow(el.stereotypes));
  head.push(nameRow(el.name));
  const c = stack(head, [], measure);
  return {
    w: c.w + 40,
    h: c.h + 40,
    pad: { top: c.h + 8, left: 20, bottom: 20, right: 20 },
    paint: (w, h) => ({
      prims: [{ t: 'rect', x: 0, y: 0, w, h, fill: 'paper' }],
      texts: c.texts.map((t) => ({ ...t, x: w / 2 })),
    }),
  };
}

/**
 * コメント（右上の角を折った長方形）。«rationale»・«problem» は本文の上に書く。
 * 本文は 200px で折り返す。
 */
export function commentBox(el: Element, measure: Measure): Box {
  const style = { size: FONT.line };
  const fold = 10;
  const rows: { text: string; style: TextStyle }[] = [];
  if (el.stereotypes?.length)
    rows.push({ text: `«${el.stereotypes.join(', ')}»`, style: { size: FONT.stereotype } });
  for (const l of wrapText(measure, el.text ?? el.name, style, 200)) rows.push({ text: l, style });
  const tw = Math.max(...rows.map((r) => measure(r.text, r.style)));
  const w = Math.ceil(tw + 16 + fold);
  const h = Math.ceil(rows.length * LINE_H.line + 12);
  return {
    w,
    h,
    paint: (pw, ph) => ({
      prims: [
        {
          t: 'poly',
          fill: 'paper',
          pts: [
            { x: 0, y: 0 },
            { x: pw - fold, y: 0 },
            { x: pw, y: fold },
            { x: pw, y: ph },
            { x: 0, y: ph },
          ],
        },
        {
          t: 'line',
          pts: [
            { x: pw - fold, y: 0 },
            { x: pw - fold, y: fold },
            { x: pw, y: fold },
          ],
        },
      ],
      texts: rows.map((r, i) => ({
        text: r.text,
        x: 8,
        y: baseline(6 + i * LINE_H.line, LINE_H.line, r.style.size),
        w: measure(r.text, r.style),
        style: r.style,
        anchor: 'start' as const,
      })),
    }),
  };
}

/**
 * 状態（角の丸い箱）。entry / do / exit は仕切り線の下に左寄せ。
 * 中に状態を入れる複合状態は、名前の下に線を引いて中身を置く。
 * 直交領域（region が 2 つ以上）は、領域の間に**点線**を引く（v1.2 の書き方）。
 */
export function stateBox(el: Element, measure: Measure, container: boolean): Box {
  const head: Row[] = [nameRow(el.name)];
  const acts: Row[] = [];
  if (el.entry) acts.push(lineRow(`entry / ${el.entry}`));
  if (el.doActivity) acts.push(lineRow(`do / ${el.doActivity}`));
  if (el.exit) acts.push(lineRow(`exit / ${el.exit}`));
  const c = stack(head, acts.length ? [acts] : [], measure, { minW: 90 });
  const r = 12;
  if (!container) return { w: c.w, h: c.h, paint: rectPaint(c, { r }) };
  return {
    w: c.w + 20,
    h: c.h + 40,
    pad: { top: c.h + 12, left: 16, bottom: 16, right: 16 },
    paint: (w, h, kids) => {
      const base = rectPaint(c, { r })(w, h);
      const sep: Prim[] = [
        {
          t: 'line',
          pts: [
            { x: 0, y: c.h },
            { x: w, y: c.h },
          ],
        },
      ];
      // 直交領域の区切り。並んだ領域の間の真ん中に点線
      const regions = [...kids].sort((a, b) => a.x - b.x || a.y - b.y);
      for (let k = 1; k < regions.length; k += 1) {
        const a = regions[k - 1];
        const b = regions[k];
        if (b.x >= a.x + a.w) {
          const x = Math.round((a.x + a.w + b.x) / 2);
          sep.push({
            t: 'line',
            pts: [
              { x, y: c.h },
              { x, y: h },
            ],
            dash: true,
          });
        } else {
          const y = Math.round((a.y + a.h + b.y) / 2);
          sep.push({
            t: 'line',
            pts: [
              { x: 0, y },
              { x: w, y },
            ],
            dash: true,
          });
        }
      }
      return { prims: [...base.prims, ...sep], texts: base.texts };
    },
  };
}

/** 領域（見えない入れ物）。区切り線は親の状態が引く */
export function regionBox(): Box {
  return {
    w: 40,
    h: 30,
    pad: { top: 10, left: 10, bottom: 10, right: 10 },
    paint: () => ({ prims: [], texts: [] }),
  };
}

/* --- 制御ノードと擬似状態 ---------------------------------------- */

/** 開始ノード・開始擬似状態（黒丸） */
export function initialBox(): Box {
  return {
    w: 18,
    h: 18,
    outline: 'ellipse',
    paint: () => ({
      prims: [{ t: 'ellipse', cx: 9, cy: 9, rx: 9, ry: 9, fill: 'ink' }],
      texts: [],
    }),
  };
}

/** 終了ノード・終了状態（二重丸。外は白、中は黒） */
export function finalBox(): Box {
  return {
    w: 22,
    h: 22,
    outline: 'ellipse',
    paint: () => ({
      prims: [
        { t: 'ellipse', cx: 11, cy: 11, rx: 11, ry: 11, fill: 'paper' },
        { t: 'ellipse', cx: 11, cy: 11, rx: 6.5, ry: 6.5, fill: 'ink' },
      ],
      texts: [],
    }),
  };
}

/** フロー終了ノード（丸に ×）。そのトークンだけを止める（アクティビティは続く） */
export function flowFinalBox(): Box {
  const r = 10;
  const d = r * Math.SQRT1_2;
  return {
    w: r * 2,
    h: r * 2,
    outline: 'ellipse',
    paint: () => ({
      prims: [
        { t: 'ellipse', cx: r, cy: r, rx: r, ry: r, fill: 'paper' },
        {
          t: 'line',
          pts: [
            { x: r - d, y: r - d },
            { x: r + d, y: r + d },
          ],
        },
        {
          t: 'line',
          pts: [
            { x: r + d, y: r - d },
            { x: r - d, y: r + d },
          ],
        },
      ],
      texts: [],
    }),
  };
}

/** 判断・マージ・選択（ひし形） */
export function diamondBox(): Box {
  const s = 30;
  return {
    w: s,
    h: s,
    outline: 'diamond',
    paint: () => ({
      prims: [
        {
          t: 'poly',
          fill: 'paper',
          pts: [
            { x: s / 2, y: 0 },
            { x: s, y: s / 2 },
            { x: s / 2, y: s },
            { x: 0, y: s / 2 },
          ],
        },
      ],
      texts: [],
    }),
  };
}

/** フォーク・ジョイン（黒い棒）。幅はつながる線の広がりに合わせてレイアウトが決める */
export function barBox(w: number): Box {
  return {
    w,
    h: 6,
    paint: (pw, ph) => ({
      prims: [{ t: 'rect', x: 0, y: 0, w: pw, h: ph, fill: 'ink' }],
      texts: [],
    }),
  };
}

/**
 * アクション類。角の丸い箱が基本で、シグナル送信は右が尖った五角形、
 * イベント受理は左が凹んだ五角形、時間イベント受理は砂時計 + 下に名前。
 * 振る舞い呼び出しは右下に熊手（rake）の印を付ける（v1.2 の書き方）。
 */
export function actionBox(el: Element, measure: Measure): Box {
  if (el.kind === 'acceptTime') {
    const style = { size: FONT.line };
    const nw = measure(el.name, style);
    const w = Math.ceil(Math.max(30, nw + 4));
    const g = 22;
    return {
      w,
      h: g + LINE_H.line + 2,
      paint: (pw) => {
        const cx = pw / 2;
        return {
          prims: [
            {
              t: 'poly',
              fill: 'paper',
              pts: [
                { x: cx - 9, y: 0 },
                { x: cx + 9, y: 0 },
                { x: cx - 9, y: g },
                { x: cx + 9, y: g },
              ],
            },
          ],
          texts: [
            {
              text: el.name,
              x: cx,
              y: baseline(g + 1, LINE_H.line, FONT.line),
              w: nw,
              style,
              anchor: 'middle',
            },
          ],
        };
      },
    };
  }
  const style = { size: FONT.name };
  const label = el.kind === 'callBehavior' && el.type ? usageText(el) : el.name;
  const lines = wrapText(measure, label, style, 150);
  const tw = Math.max(...lines.map((l) => measure(l, style)));
  const notch = el.kind === 'sendSignal' || el.kind === 'acceptEvent' ? 14 : 0;
  const rake = el.kind === 'callBehavior' ? 16 : 0;
  const w = Math.ceil(Math.max(90, tw + 24 + notch + rake));
  const h = Math.ceil(Math.max(38, lines.length * LINE_H.name + 16));
  return {
    w,
    h,
    paint: (pw, ph) => {
      const prims: Prim[] = [];
      if (el.kind === 'sendSignal')
        prims.push({
          t: 'poly',
          fill: 'paper',
          pts: [
            { x: 0, y: 0 },
            { x: pw - notch, y: 0 },
            { x: pw, y: ph / 2 },
            { x: pw - notch, y: ph },
            { x: 0, y: ph },
          ],
        });
      else if (el.kind === 'acceptEvent')
        prims.push({
          t: 'poly',
          fill: 'paper',
          pts: [
            { x: 0, y: 0 },
            { x: pw, y: 0 },
            { x: pw, y: ph },
            { x: 0, y: ph },
            { x: notch, y: ph / 2 },
          ],
        });
      else prims.push({ t: 'rect', x: 0, y: 0, w: pw, h: ph, r: 10, fill: 'paper' });
      if (rake) {
        // 熊手: 縦の柄と、横棒から下がる 3 本の歯
        const x0 = pw - 18;
        const y0 = ph - 16;
        prims.push(
          {
            t: 'line',
            pts: [
              { x: x0 + 5, y: y0 },
              { x: x0 + 5, y: y0 + 11 },
            ],
          },
          {
            t: 'line',
            pts: [
              { x: x0, y: y0 + 11 },
              { x: x0, y: y0 + 5 },
              { x: x0 + 10, y: y0 + 5 },
              { x: x0 + 10, y: y0 + 11 },
            ],
          },
        );
      }
      const cx =
        (el.kind === 'acceptEvent' ? notch : 0) / 2 +
        (pw - (el.kind === 'sendSignal' ? notch : 0) - rake) / 2;
      const top = ph / 2 - (lines.length * LINE_H.name) / 2;
      return {
        prims,
        texts: lines.map((text, i) => ({
          text,
          x: cx,
          y: baseline(top + i * LINE_H.name, LINE_H.name, FONT.name),
          w: measure(text, style),
          style,
          anchor: 'middle' as const,
        })),
      };
    },
  };
}

/** オブジェクトノード（四角に `name : Type`） */
export function objectNodeBox(el: Element, measure: Measure): Box {
  const c = stack([lineRow(usageText(el), 'center')], [], measure, { minW: 80 });
  return { w: c.w, h: c.h, paint: rectPaint(c) };
}

/* --- 線の端を形の縁で止める ------------------------------------- */

/**
 * 線が外接矩形の縁で止まっている端を、楕円・ひし形の縁まで伸ばす。
 * from は線の 1 つ手前の点、to は外接矩形の縁の点。
 */
export function clipToOutline(outline: Outline, r: Rect, from: Point, to: Point): Point {
  if (outline === 'rect') return to;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (outline === 'ellipse') {
    // from + t·d が楕円の縁に来る t のうち小さい方
    const a = r.w / 2;
    const b = r.h / 2;
    const px = (from.x - cx) / a;
    const py = (from.y - cy) / b;
    const qx = dx / a;
    const qy = dy / b;
    const A = qx * qx + qy * qy;
    const B = 2 * (px * qx + py * qy);
    const C = px * px + py * py - 1;
    const D = B * B - 4 * A * C;
    if (D < 0) return to;
    const t = (-B - Math.sqrt(D)) / (2 * A);
    if (t < 0) return to;
    return { x: Math.round(from.x + dx * t), y: Math.round(from.y + dy * t) };
  }
  // ひし形: 4 辺との交点のうち最も手前
  const pts = [
    { x: cx, y: r.y },
    { x: r.x + r.w, y: cy },
    { x: cx, y: r.y + r.h },
    { x: r.x, y: cy },
  ];
  let best = Infinity;
  for (let k = 0; k < 4; k += 1) {
    const p = pts[k];
    const q = pts[(k + 1) % 4];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - from.x) * ey - (p.y - from.y) * ex) / den;
    const u = ((p.x - from.x) * dy - (p.y - from.y) * dx) / den;
    if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best === Infinity
    ? to
    : { x: Math.round(from.x + dx * best), y: Math.round(from.y + dy * best) };
}
