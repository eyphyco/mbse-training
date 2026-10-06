/**
 * アクティビティ図（act）のレイアウト。ELK を使わず自前で並べる。
 *
 * ELK をやめた理由: パーティション（スイムレーン）を入れ物として ELK に渡すと、
 * 流れが帯を行き来する図（運転者 → 車両 → 運転者）で帯が縦に積まれて崩れた（2026-10-06 に試した）。
 * ELK の partitioning も「帯の順に一方向にしか流れない」前提で、行き来できない。
 *
 * そこで:
 *   1. 段（上から何番目か）は、戻りの線を除いた最長路で決める
 *   2. 列はパーティション。同じ段・同じ列に複数あれば、前の段の位置の平均で並べる
 *   3. 線は自分で直角に引く。判断ノードは行き先の側の角から出し、
 *      戻りの線（ループ）は右の通り道を回す。途中の箱に当たる線は右へ迂回させる
 *
 * 図はどれも小さい（ノード 15 個まで）。この程度なら素朴な規則で読める図になる。
 */
import { FONT, FRAME, LINE_H, PORT } from './metrics.ts';
import type { Measure } from './metrics.ts';
import { headerRest, usageText } from './model.ts';
import type { Element, Model, Port } from './model.ts';
import { baseline, frameHeader, shiftPrim, shiftText, textRun, withEnds } from './layout.ts';
import type { DiagramLayout, EdgeShape, NodeShape, Point, PortShape, TextRun } from './layout.ts';
import {
  actionBox,
  barBox,
  diamondBox,
  finalBox,
  flowFinalBox,
  initialBox,
  objectNodeBox,
} from './shapes.ts';
import type { Box, Rect } from './shapes.ts';

/** 段の間（矢じり・ガードの札・ピンの名前が入る分） */
const ROW_GAP = 40;
/** ノードどうしの横の間 */
const COL_GAP = 28;
/** パーティションの見出しの高さ */
const LANE_HEAD = 26;
const LANE_PAD = 20;
/** ピンの名前の分、箱の上下に空ける */
const PIN_LABEL = 18;

interface Item {
  id: string;
  el: Element | null;
  box: Box;
  lane: number;
  rank: number;
  order: number;
  pins: { port: Port; dx: number; top: boolean; label: string }[];
  /** 上下に出るピンの名前の分 */
  padTop: number;
  padBottom: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxOf(el: Element, measure: Measure): Box {
  switch (el.kind) {
    case 'initial':
      return initialBox();
    case 'final':
      return finalBox();
    case 'flowFinal':
      return flowFinalBox();
    case 'decision':
    case 'merge':
      return diamondBox();
    case 'fork':
    case 'join':
      return barBox(60);
    case 'objectNode':
      return objectNodeBox(el, measure);
    default:
      return actionBox(el, measure);
  }
}

const isDiamond = (it: Item) => it.el?.kind === 'decision' || it.el?.kind === 'merge';
const isBar = (it: Item) => it.el?.kind === 'fork' || it.el?.kind === 'join';
const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

export async function layoutAct(model: Model, measure: Measure): Promise<DiagramLayout> {
  const { tab, header, tabW } = frameHeader(measure, model.frame.kind, headerRest(model.frame));
  const partitions = model.elements.filter((e) => e.kind === 'partition');
  const laneOf = (el: Element) =>
    Math.max(
      0,
      partitions.findIndex((p) => p.id === el.parent),
    );
  const style = { size: FONT.edge };

  /* --- ノードとピン ------------------------------------------------ */
  const items: Item[] = [];
  const byId = new Map<string, Item>();
  /** ピン → 持ち主のアクション */
  const ownerOfPin = new Map<string, Item>();
  model.elements.forEach((el, order) => {
    if (el.kind === 'partition') return;
    const box = boxOf(el, measure);
    const pinsIn = (el.ports ?? []).filter(
      (p) => (p.side ?? (p.direction === 'out' ? 'south' : 'north')) === 'north',
    );
    const pinsOut = (el.ports ?? []).filter((p) => !pinsIn.includes(p));
    // ピンは上（入力）と下（出力）の辺に、名前の幅だけ空けて並べる
    const lay = (ps: Port[], top: boolean) => {
      const labels = ps.map((p) => usageText({ name: p.name, type: p.type }));
      const widths = labels.map((l) => measure(l, style));
      const total = widths.reduce((s, w) => s + PORT + 6 + w + 14, 0);
      return { ps, labels, widths, total, top };
    };
    const a = lay(pinsIn, true);
    const b = lay(pinsOut, false);
    const w = Math.ceil(Math.max(box.w, a.total + 16, b.total + 16));
    const pins: Item['pins'] = [];
    for (const g of [a, b]) {
      let x = (w - g.total) / 2 + 7;
      g.ps.forEach((p, i) => {
        pins.push({ port: p, dx: Math.round(x), top: g.top, label: g.labels[i] });
        x += PORT + 6 + g.widths[i] + 14;
      });
    }
    const it: Item = {
      id: el.id,
      el,
      box,
      lane: laneOf(el),
      rank: 0,
      order,
      pins,
      padTop: a.ps.length ? PIN_LABEL : 0,
      padBottom: b.ps.length ? PIN_LABEL : 0,
      x: 0,
      y: 0,
      w,
      h: box.h,
    };
    items.push(it);
    byId.set(el.id, it);
    for (const p of el.ports ?? []) ownerOfPin.set(p.id, it);
  });

  /* アクティビティパラメータノード（図枠の縁）。入力は上の縁、出力は下の縁 */
  const params = (model.framePorts ?? []).map((p) => {
    const text = usageText({ name: p.name, type: p.type });
    const t = textRun(measure, text, style, 0, 0, 'middle');
    return {
      port: p,
      text: t,
      w: Math.ceil(t.w + 16),
      h: 24,
      top: p.direction !== 'out',
      x: 0,
      y: 0,
    };
  });
  const paramById = new Map(params.map((p) => [p.port.id, p]));

  const ownerOf = (id: string) => byId.get(id) ?? ownerOfPin.get(id);
  const flows = model.relations.filter((r) => r.kind === 'controlFlow' || r.kind === 'objectFlow');

  /* --- 段: 戻りの線を除いた最長路 --------------------------------- */
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>(items.map((i) => [i.id, 0]));
  for (const r of flows) {
    const s = ownerOf(r.source);
    const t = ownerOf(r.target);
    if (!s || !t) continue;
    succ.set(s.id, [...(succ.get(s.id) ?? []), t.id]);
    indeg.set(t.id, (indeg.get(t.id) ?? 0) + 1);
  }
  const back = new Set<string>(); // `${s}>${t}`
  const state = new Map<string, 1 | 2>();
  const dfs = (v: string) => {
    state.set(v, 1);
    for (const w of succ.get(v) ?? []) {
      if (state.get(w) === 1) back.add(`${v}>${w}`);
      else if (!state.has(w)) dfs(w);
    }
    state.set(v, 2);
  };
  // 入口から先に辿る（開始ノード・入力の無いもの）。残りは書いた順
  for (const it of items)
    if (it.el?.kind === 'initial' || indeg.get(it.id) === 0) if (!state.has(it.id)) dfs(it.id);
  for (const it of items) if (!state.has(it.id)) dfs(it.id);
  const isBack = (s: string, t: string) => back.has(`${s}>${t}`) || s === t;

  // 最長路（前向きの線だけ）。DAG なので段を伸ばすだけで収束する
  for (let k = 0; k < items.length; k += 1)
    for (const it of items)
      for (const w of succ.get(it.id) ?? [])
        if (!isBack(it.id, w)) {
          const t = byId.get(w)!;
          if (t.rank < it.rank + 1) t.rank = it.rank + 1;
        }
  const maxRank = Math.max(0, ...items.map((i) => i.rank));

  /* --- 列の幅 ---------------------------------------------------- */
  const laneCount = Math.max(1, partitions.length);
  const cells = new Map<string, Item[]>();
  for (const it of items) {
    const k = `${it.lane}:${it.rank}`;
    cells.set(k, [...(cells.get(k) ?? []), it]);
  }
  const cellW = (list: Item[]) => list.reduce((s, i) => s + i.w, 0) + COL_GAP * (list.length - 1);
  const laneHeads = partitions.map((p) => {
    const label = [p.stereotypes?.length ? `«${p.stereotypes.join(', ')}»` : '', usageText(p)]
      .filter(Boolean)
      .join(' ');
    return textRun(measure, label, { size: FONT.name, bold: true }, 0, 0, 'middle');
  });
  const laneW = Array.from({ length: laneCount }, (_, l) =>
    Math.ceil(
      Math.max(
        140,
        (laneHeads[l]?.w ?? 0) + 24,
        ...[...cells.entries()]
          .filter(([k]) => k.startsWith(`${l}:`))
          .map(([, v]) => cellW(v) + LANE_PAD * 2),
      ),
    ),
  );

  /* --- 縦の位置 -------------------------------------------------- */
  const pad = FRAME.pad;
  const topParams = params.filter((p) => p.top);
  const bottomParams = params.filter((p) => !p.top);
  // 図枠の上辺。上の縁にパラメータがあれば、その半分だけ図枠を下げて余白にする
  const frameY = topParams.length ? 12 : 0;
  const frameX = params.length ? 0 : 0;
  let y = frameY + FRAME.tabH + pad + (topParams.length ? 16 : 0);
  const laneTop = y;
  if (partitions.length) y += LANE_HEAD + 12;
  const rowY: number[] = [];
  for (let r = 0; r <= maxRank; r += 1) {
    const row = items.filter((i) => i.rank === r);
    const top = Math.max(0, ...row.map((i) => i.padTop));
    const body = Math.max(0, ...row.map((i) => i.h));
    const bottom = Math.max(0, ...row.map((i) => i.padBottom));
    rowY.push(y + top);
    for (const i of row) i.y = Math.round(y + top + (body - i.h) / 2);
    y += top + body + bottom + ROW_GAP;
  }
  const contentBottom = y - ROW_GAP + pad;

  /* --- 横の位置: 前の段の位置の平均で並べる ---------------------- */
  const laneX: number[] = [];
  let lx = frameX + pad;
  for (let l = 0; l < laneCount; l += 1) {
    laneX.push(lx);
    lx += laneW[l];
  }
  const preds = new Map<string, Item[]>();
  for (const r of flows) {
    const s = ownerOf(r.source);
    const t = ownerOf(r.target);
    if (s && t && !isBack(s.id, t.id)) preds.set(t.id, [...(preds.get(t.id) ?? []), s]);
  }
  for (let r = 0; r <= maxRank; r += 1)
    for (let l = 0; l < laneCount; l += 1) {
      const list = cells.get(`${l}:${r}`) ?? [];
      const bary = (i: Item) => {
        const ps = preds.get(i.id) ?? [];
        return ps.length ? ps.reduce((s, p) => s + p.x + p.w / 2, 0) / ps.length : Infinity;
      };
      list.sort((a, b) => {
        const d = bary(a) - bary(b);
        return Number.isFinite(d) && d !== 0 ? d : a.order - b.order;
      });
      /*
        前の段の真下を目標に置き、左から順に重ならないよう押し出す。
        列の中央に詰める置き方だと、フォークの先の箱が隣の流れの下に入り、線が絡んだ
        （act の見本で、Warn Driver からの線と start への線が重なった）。
        パーティションがある図は列の右端を越えたら左へ戻す。無い図は右へ伸ばしてよい
      */
      const lo = laneX[l] + LANE_PAD;
      const hi = partitions.length ? laneX[l] + laneW[l] - LANE_PAD : Infinity;
      const center = laneX[l] + laneW[l] / 2;
      let prev = lo - COL_GAP;
      for (const i of list) {
        const b = bary(i);
        const want = (Number.isFinite(b) ? b : center) - i.w / 2;
        i.x = Math.round(Math.max(want, prev + COL_GAP, lo));
        prev = i.x + i.w;
      }
      const over = prev - hi;
      if (over > 0) for (const i of list) i.x = Math.round(Math.max(lo, i.x - over));
    }
  // パーティションの無い図は、左の空きを詰め、押し出した分だけ列を広げる
  if (!partitions.length && items.length) {
    const minX = Math.min(...items.map((i) => i.x));
    const dx = minX - (laneX[0] + LANE_PAD);
    if (dx > 0) for (const i of items) i.x -= dx;
    laneW[0] = 0;
  }
  if (!partitions.length && items.length)
    laneW[0] = Math.max(laneW[0], Math.max(...items.map((i) => i.x + i.w)) + LANE_PAD - laneX[0]);

  /* フォーク・ジョインの棒は、つながる相手の広がりに合わせて伸ばす */
  for (const it of items.filter(isBar)) {
    const others: Item[] = [];
    for (const r of flows) {
      const s = ownerOf(r.source);
      const t = ownerOf(r.target);
      if (s === it && t) others.push(t);
      if (t === it && s) others.push(s);
    }
    if (others.length < 2) continue;
    const xs = others.map((o) => o.x + o.w / 2);
    const lo = Math.min(...xs) - 16;
    const hi = Math.max(...xs) + 16;
    // 同じ段のほかの箱に被るなら、その手前で止める（被ると棒が箱を貫いて見える）
    let a = lo;
    let b = hi;
    const mid = it.x + it.w / 2;
    for (const o of items)
      if (o !== it && o.rank === it.rank && o.x < b && o.x + o.w > a) {
        if (o.x + o.w / 2 < mid) a = Math.max(a, o.x + o.w + 14);
        else b = Math.min(b, o.x - 14);
      }
    if (b - a < 40) continue;
    it.x = Math.round(a);
    it.w = Math.round(Math.max(40, b - a));
  }

  /* パラメータノードは、つながる相手の真上（真下）に置く */
  const rightEdge = laneX[laneCount - 1] + laneW[laneCount - 1] + pad;
  let usedTop = frameX + tabW + 12;
  for (const p of topParams) {
    const r = flows.find((f) => f.source === p.port.id);
    const t = r && ownerOf(r.target);
    const want = t ? t.x + t.w / 2 - p.w / 2 : usedTop;
    p.x = Math.round(Math.max(want, usedTop));
    p.y = frameY - p.h / 2;
    usedTop = p.x + p.w + 12;
  }
  let usedBottom = frameX + 12;
  for (const p of bottomParams) {
    const r = flows.find((f) => f.target === p.port.id);
    const s = r && ownerOf(r.source);
    const want = s ? s.x + s.w / 2 - p.w / 2 : usedBottom;
    p.x = Math.round(Math.max(want, usedBottom));
    usedBottom = p.x + p.w + 12;
  }
  const frameW = Math.ceil(Math.max(rightEdge, usedTop, usedBottom, tabW + pad) - frameX);
  const frameH = Math.ceil(contentBottom - frameY + (bottomParams.length ? 22 : 0));
  for (const p of bottomParams) p.y = frameY + frameH - p.h / 2;

  /* --- 線 ------------------------------------------------------- */
  const rectOf = (id: string): Rect | null => {
    const it = byId.get(id);
    if (it) return { x: it.x, y: it.y, w: it.w, h: it.h };
    const p = paramById.get(id);
    return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
  };
  const pinRect = (id: string): Rect | null => {
    const it = ownerOfPin.get(id);
    const pin = it?.pins.find((p) => p.port.id === id);
    if (!it || !pin) return null;
    return {
      x: it.x + pin.dx,
      y: pin.top ? it.y - PORT / 2 : it.y + it.h - PORT / 2,
      w: PORT,
      h: PORT,
    };
  };
  /** 線が箱に当たるか（両端の箱は除く） */
  const blocked = (a: Point, b: Point, skip: Set<string>) =>
    items.some((it) => {
      if (skip.has(it.id)) return false;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      return x1 > it.x - 4 && x0 < it.x + it.w + 4 && y1 > it.y - 4 && y0 < it.y + it.h + 4;
    });
  /** 2 つの段の間にある箱の右端（迂回する通り道） */
  const channelRight = (y0: number, y1: number, skip: Set<string>) =>
    Math.max(
      0,
      ...items
        .filter(
          (it) => !skip.has(it.id) && it.y + it.h > Math.min(y0, y1) && it.y < Math.max(y0, y1),
        )
        .map((it) => it.x + it.w),
    );

  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const r of flows) {
    const s = ownerOf(r.source)?.id ?? r.source;
    const t = ownerOf(r.target)?.id ?? r.target;
    outCount.set(s, (outCount.get(s) ?? 0) + 1);
    inCount.set(t, (inCount.get(t) ?? 0) + 1);
  }

  let loopLane = 0;
  const edges: EdgeShape[] = flows.map((r) => {
    const sItem = ownerOf(r.source);
    const tItem = ownerOf(r.target);
    const S = rectOf(sItem?.id ?? r.source)!;
    const T = rectOf(tItem?.id ?? r.target)!;
    const sPin = pinRect(r.source);
    const tPin = pinRect(r.target);
    const skip = new Set([sItem?.id ?? '', tItem?.id ?? '']);
    const backward = !!sItem && !!tItem && isBack(sItem.id, tItem.id);
    let pts: Point[];
    let exit: 'down' | 'left' | 'right' = 'down';

    if (backward) {
      // 戻り（ループ）: 右の辺から出て、右の通り道を上り、相手の右の辺へ
      const a = { x: S.x + S.w, y: Math.round(cy(S)) };
      const b = { x: T.x + T.w, y: Math.round(cy(T)) };
      const ch = Math.max(channelRight(T.y, S.y + S.h, new Set()), a.x, b.x) + 18 + loopLane * 10;
      loopLane += 1;
      pts = [a, { x: ch, y: a.y }, { x: ch, y: b.y }, b];
      exit = 'right';
    } else {
      // 出る所
      let a: Point;
      if (sPin) a = { x: Math.round(cx(sPin)), y: sPin.y + sPin.h };
      else if (sItem && isDiamond(sItem) && (outCount.get(sItem.id) ?? 0) > 1) {
        const dx = cx(T) - cx(S);
        if (dx < -4) {
          a = { x: S.x, y: Math.round(cy(S)) };
          exit = 'left';
        } else if (dx > 4) {
          a = { x: S.x + S.w, y: Math.round(cy(S)) };
          exit = 'right';
        } else a = { x: Math.round(cx(S)), y: S.y + S.h };
      } else if (sItem && isBar(sItem))
        a = { x: Math.round(Math.min(Math.max(cx(T), S.x + 8), S.x + S.w - 8)), y: S.y + S.h };
      else a = { x: Math.round(cx(S)), y: S.y + S.h };

      // 入る所
      let b: Point;
      let enter: 'down' | 'side' = 'down';
      if (tPin) b = { x: Math.round(cx(tPin)), y: tPin.y };
      else if (
        tItem &&
        isDiamond(tItem) &&
        (inCount.get(tItem.id) ?? 0) > 1 &&
        Math.abs(a.x - cx(T)) > 4
      ) {
        b = a.x < cx(T) ? { x: T.x, y: Math.round(cy(T)) } : { x: T.x + T.w, y: Math.round(cy(T)) };
        enter = 'side';
      } else if (tItem && isBar(tItem))
        b = { x: Math.round(Math.min(Math.max(a.x, T.x + 8), T.x + T.w - 8)), y: T.y };
      else b = { x: Math.round(cx(T)), y: T.y };

      const above = b.y - Math.round(ROW_GAP / 2) - (tItem?.padTop ?? 0) / 2;
      if (exit === 'down' && enter === 'down') {
        if (a.x === b.x && !blocked(a, b, skip)) pts = [a, b];
        else {
          const elbow = [a, { x: a.x, y: above }, { x: b.x, y: above }, b];
          pts = elbow;
          if (blocked(a, { x: a.x, y: above }, skip)) {
            // 真下に箱がある: 一段下りてから右の通り道へ逃がす
            const y1 = a.y + 12;
            const ch = Math.max(channelRight(a.y, above, skip), a.x, b.x) + 18;
            pts = [
              a,
              { x: a.x, y: y1 },
              { x: ch, y: y1 },
              { x: ch, y: above },
              { x: b.x, y: above },
              b,
            ];
          }
        }
      } else if (exit !== 'down' && enter === 'down') {
        pts = [a, { x: b.x, y: a.y }, b];
        if (blocked({ x: b.x, y: a.y }, b, skip)) {
          const ch = Math.max(channelRight(a.y, b.y, skip), a.x, b.x) + 18;
          pts = [a, { x: ch, y: a.y }, { x: ch, y: above }, { x: b.x, y: above }, b];
        }
      } else if (exit === 'down' && enter === 'side') {
        pts = [a, { x: a.x, y: b.y }, b];
        if (blocked(a, { x: a.x, y: b.y }, skip)) {
          const ch = Math.max(channelRight(a.y, b.y, skip), a.x, b.x) + 18;
          pts = [a, { x: a.x, y: a.y + 12 }, { x: ch, y: a.y + 12 }, { x: ch, y: b.y }, b];
        }
      } else {
        const ch =
          exit === 'right'
            ? Math.max(channelRight(a.y, b.y, skip), a.x, b.x) + 18
            : Math.min(a.x, b.x) - 18;
        pts = [a, { x: ch, y: a.y }, { x: ch, y: b.y }, b];
      }
    }

    const ended = withEnds(pts, { target: 'arrow' });
    const texts: TextRun[] = [];
    if (r.guard) {
      const g = `[${r.guard}]`;
      const a = pts[0];
      const t =
        exit === 'down'
          ? textRun(measure, g, style, a.x + 5, baseline(a.y + 2, LINE_H.edge, FONT.edge))
          : exit === 'left'
            ? textRun(measure, g, style, a.x - 4, a.y - 4, 'end')
            : textRun(measure, g, style, a.x + 4, a.y - 4);
      texts.push(t);
    }
    return {
      id: r.id,
      kind: r.kind,
      dashed: r.kind === 'controlFlow',
      points: ended.points,
      markers: ended.markers,
      texts,
    };
  });

  /* --- 箱 ------------------------------------------------------- */
  const nodes: NodeShape[] = [];
  partitions.forEach((p, l) => {
    const x = laneX[l];
    const w = laneW[l];
    const h = contentBottom - laneTop;
    const head = laneHeads[l];
    nodes.push({
      id: p.id,
      x,
      y: laneTop,
      w,
      h,
      container: true,
      prims: [
        { t: 'rect', x, y: laneTop, w, h, fill: 'paper' },
        {
          t: 'line',
          pts: [
            { x, y: laneTop + LANE_HEAD },
            { x: x + w, y: laneTop + LANE_HEAD },
          ],
        },
      ],
      texts: [{ ...head, x: x + w / 2, y: baseline(laneTop + 4, LINE_H.name, FONT.name) }],
      ports: [],
    });
  });
  for (const it of items) {
    const painted = it.box.paint(it.w, it.h, []);
    const ports: PortShape[] = it.pins.map((p) => {
      const px = it.x + p.dx;
      const py = p.top ? it.y - PORT / 2 : it.y + it.h - PORT / 2;
      // 名前は四角の右。入力ピンは上、出力ピンは下に出す（線は四角の真上・真下から来る）
      const ly = p.top ? py - 3 : py + PORT + LINE_H.edge - 2;
      return {
        id: p.port.id,
        x: px,
        y: py,
        size: PORT,
        side: p.top ? 'north' : 'south',
        kind: 'pin',
        direction: p.port.direction,
        label: textRun(measure, p.label, style, px + PORT + 4, ly),
      };
    });
    nodes.push({
      id: it.id,
      x: it.x,
      y: it.y,
      w: it.w,
      h: it.h,
      prims: painted.prims.map((q) => shiftPrim(q, it.x, it.y)),
      texts: painted.texts.map((t) => shiftText(t, it.x, it.y)),
      ports,
    });
  }
  for (const p of params) {
    nodes.push({
      id: p.port.id,
      x: p.x,
      y: Math.round(p.y),
      w: p.w,
      h: p.h,
      prims: [{ t: 'rect', x: p.x, y: Math.round(p.y), w: p.w, h: p.h, fill: 'paper' }],
      texts: [
        { ...p.text, x: p.x + p.w / 2, y: baseline(Math.round(p.y) + 4, LINE_H.line, FONT.edge) },
      ],
      ports: [],
    });
  }

  const frame = { x: frameX, y: frameY, w: frameW, h: frameH };
  return {
    width: Math.ceil(frame.x + frame.w + 1),
    height: Math.ceil(Math.max(frame.y + frame.h, ...params.map((p) => p.y + p.h)) + 1),
    frame,
    tab: tab.map((q) => ({ x: q.x + frame.x, y: q.y + frame.y })),
    header: header.map((t) => shiftText(t, frame.x, frame.y)),
    nodes,
    edges,
    framePorts: [],
  };
}
