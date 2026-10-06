/**
 * シーケンス図（sd）のレイアウト。中身が「順序」なので ELK は使わず、上から下へ積む。
 *
 * - ライフラインは左から書いた順。列の間は、間を渡るメッセージの札が収まる幅まで広げる
 * - メッセージは 1 本ごとに下へ。矢じりの形で 3 種を描き分ける（ここが試験に出る）
 *     同期: 実線 + 塗った矢じり / 非同期: 実線 + 開いた矢じり / 返信: 点線 + 開いた矢じり
 * - 複合フラグメント（alt・opt・loop…）と相互作用参照（ref）は、中身を積んでから外枠を決める
 */
import { FONT, FRAME, LINE_H } from './metrics.ts';
import type { Measure } from './metrics.ts';
import { headerRest, usageText } from './model.ts';
import type { Model, Step } from './model.ts';
import { baseline, frameHeader, shiftText, tabShape, textRun, withEnds } from './layout.ts';
import type { DiagramLayout, EdgeShape, NodeShape, Prim, TextRun } from './layout.ts';

const HEAD_H = 30;
/** メッセージ 1 本の高さ（札 + 線） */
const MSG_H = 30;
const SELF_W = 34;
const SELF_H = 18;
/** フラグメントの枠と中身の間 */
const FRAG_PAD = 14;

export async function layoutSd(model: Model, measure: Measure): Promise<DiagramLayout> {
  const { tab, header, tabW } = frameHeader(measure, model.frame.kind, headerRest(model.frame));
  const lifelines = model.elements.filter((e) => e.kind === 'lifeline');
  const index = new Map(lifelines.map((l, i) => [l.id, i]));
  const style = { size: FONT.edge };
  const headStyle = { size: FONT.name };
  const steps = model.steps ?? [];

  /* --- 列の位置 -------------------------------------------------- */
  const heads = lifelines.map((l) => {
    const text = usageText(l);
    const w = Math.ceil(Math.max(84, measure(text, headStyle) + 20));
    return { el: l, text, w };
  });
  const n = lifelines.length;
  // gap[i] は列 i と i+1 の中心の間
  const gap = heads.slice(0, -1).map((h, i) => h.w / 2 + heads[i + 1].w / 2 + 36);
  let rightRoom = 0; // 右端の列から右へ要る幅（自己メッセージ）
  const needs: { lo: number; hi: number; w: number }[] = [];
  const collect = (list: Step[]) => {
    for (const s of list) {
      if (s.kind === 'message') {
        const a = index.get(s.from)!;
        const b = index.get(s.to)!;
        const w = measure(s.label, style);
        if (a === b) {
          if (a === n - 1) rightRoom = Math.max(rightRoom, SELF_W + 8 + w + 12);
          else needs.push({ lo: a, hi: a + 1, w: SELF_W + 8 + w + heads[a + 1].w / 2 });
        } else needs.push({ lo: Math.min(a, b), hi: Math.max(a, b), w: w + 30 });
      } else if (s.kind === 'ref') {
        const ids = s.covers.map((c) => index.get(c)!);
        const lo = Math.min(...ids);
        const hi = Math.max(...ids);
        const w = measure(s.name, { size: FONT.name, bold: true }) + 70;
        if (lo === hi) rightRoom = Math.max(rightRoom, hi === n - 1 ? w / 2 : 0);
        else needs.push({ lo, hi, w });
      } else for (const o of s.operands) collect(o.steps);
    }
  };
  collect(steps);
  needs.sort((p, q) => p.hi - p.lo - (q.hi - q.lo));
  for (const k of needs) {
    const have = gap.slice(k.lo, k.hi).reduce((s, g) => s + g, 0);
    if (have < k.w) {
      const add = (k.w - have) / (k.hi - k.lo);
      for (let i = k.lo; i < k.hi; i += 1) gap[i] += add;
    }
  }
  const pad = FRAME.pad;
  const xs: number[] = [];
  let x = pad + (heads[0]?.w ?? 0) / 2 + 10;
  for (let i = 0; i < n; i += 1) {
    xs.push(Math.round(x));
    x += gap[i] ?? 0;
  }

  /* --- 手順を積む ------------------------------------------------ */
  const top = FRAME.tabH + pad;
  let y = top + HEAD_H + 16;
  const edges: EdgeShape[] = [];
  const frags: NodeShape[] = [];

  /** 積んだ中身の左右の広がり（外枠を決めるのに使う） */
  type Span = { lo: number; hi: number };
  const widen = (sp: Span, lo: number, hi: number) => {
    sp.lo = Math.min(sp.lo, lo);
    sp.hi = Math.max(sp.hi, hi);
  };

  const lay = (list: Step[], depth: number): Span => {
    const sp: Span = { lo: Infinity, hi: -Infinity };
    for (const s of list) {
      if (s.kind === 'message') {
        const a = xs[index.get(s.from)!];
        const b = xs[index.get(s.to)!];
        const head = s.sort === 'sync' ? ('arrowFilled' as const) : ('arrow' as const);
        const texts: TextRun[] = [];
        if (a === b) {
          y += 8;
          const pts = [
            { x: a, y },
            { x: a + SELF_W, y },
            { x: a + SELF_W, y: y + SELF_H },
            { x: a, y: y + SELF_H },
          ];
          const ended = withEnds(pts, { target: head });
          texts.push(
            textRun(
              measure,
              s.label,
              style,
              a + SELF_W + 6,
              baseline(y + 2, LINE_H.edge, FONT.edge),
            ),
          );
          edges.push({
            id: s.id,
            kind: `message-${s.sort}`,
            dashed: s.sort === 'reply',
            points: ended.points,
            markers: ended.markers,
            texts,
          });
          widen(sp, a - 10, a + SELF_W + 6 + texts[0].w);
          y += SELF_H + 16;
        } else {
          y += MSG_H - 8;
          const pts = [
            { x: a, y },
            { x: b, y },
          ];
          const ended = withEnds(pts, { target: head });
          texts.push(textRun(measure, s.label, style, Math.round((a + b) / 2), y - 5, 'middle'));
          edges.push({
            id: s.id,
            kind: `message-${s.sort}`,
            dashed: s.sort === 'reply',
            points: ended.points,
            markers: ended.markers,
            texts,
          });
          widen(sp, Math.min(a, b), Math.max(a, b));
          y += 8;
        }
      } else if (s.kind === 'ref') {
        y += 10;
        const ids = s.covers.map((c) => index.get(c)!);
        const lo = Math.min(...ids);
        const hi = Math.max(...ids);
        const nameStyle = { size: FONT.name, bold: true };
        const nw = measure(s.name, nameStyle);
        let left = xs[lo] - heads[lo].w / 2 - 6 + depth * 4;
        let right = xs[hi] + heads[hi].w / 2 + 6 - depth * 4;
        if (right - left < nw + 60) {
          const c = (left + right) / 2;
          left = c - (nw + 60) / 2;
          right = c + (nw + 60) / 2;
        }
        left = Math.round(left);
        right = Math.round(right);
        const h = 40;
        const t = tabShape(measure, 'ref', left, y);
        frags.push({
          id: s.id,
          x: left,
          y,
          w: right - left,
          h,
          container: true,
          prims: [{ t: 'rect', x: left, y, w: right - left, h, fill: 'paper' }, t.prim],
          texts: [
            t.text,
            textRun(
              measure,
              s.name,
              nameStyle,
              Math.round((left + right) / 2),
              baseline(y + 16, LINE_H.name, FONT.name),
              'middle',
            ),
          ],
          ports: [],
        });
        widen(sp, left, right);
        y += h + 6;
      } else {
        y += 12;
        const fTop = y;
        const label = `${s.operator}${s.arg ?? ''}`;
        const t = tabShape(measure, label, 0, fTop);
        y += t.h + 4;
        const inner: Span = { lo: Infinity, hi: -Infinity };
        const seps: number[] = [];
        const guards: { text: string; y: number }[] = [];
        s.operands.forEach((o, i) => {
          if (i > 0) {
            y += 8;
            seps.push(y);
            y += 6;
          }
          if (o.guard) {
            guards.push({ text: `[${o.guard}]`, y: baseline(y, LINE_H.edge, FONT.edge) });
            y += LINE_H.edge;
          }
          const sub = lay(o.steps, depth + 1);
          widen(inner, sub.lo, sub.hi);
        });
        y += 10;
        const guardW = Math.max(0, ...guards.map((g) => measure(g.text, style)));
        let left = (Number.isFinite(inner.lo) ? inner.lo : xs[0]) - FRAG_PAD - 10;
        let right = (Number.isFinite(inner.hi) ? inner.hi : xs[0]) + FRAG_PAD + 10;
        right = Math.max(right, left + t.w + guardW + 30);
        left = Math.round(left);
        right = Math.round(right);
        const tab2 = tabShape(measure, label, left, fTop);
        const prims: Prim[] = [
          { t: 'rect', x: left, y: fTop, w: right - left, h: y - fTop, fill: 'none' },
          tab2.prim,
          ...seps.map((sy): Prim => ({
            t: 'line',
            pts: [
              { x: left, y: sy },
              { x: right, y: sy },
            ],
            dash: true,
          })),
        ];
        frags.push({
          id: s.id,
          x: left,
          y: fTop,
          w: right - left,
          h: y - fTop,
          container: true,
          prims,
          texts: [tab2.text, ...guards.map((g) => textRun(measure, g.text, style, left + 10, g.y))],
          ports: [],
        });
        widen(sp, left, right);
        y += 4;
      }
    }
    return sp;
  };
  const all = lay(steps, 0);
  y += 20;
  const bottom = y;

  /* --- ライフライン ---------------------------------------------- */
  const lifeNodes: NodeShape[] = heads.map((h, i) => {
    const cx = xs[i];
    const left = Math.round(cx - h.w / 2);
    return {
      id: h.el.id,
      x: left,
      y: top,
      w: h.w,
      h: bottom - top,
      container: true,
      prims: [
        { t: 'rect', x: left, y: top, w: h.w, h: HEAD_H, fill: 'paper' },
        {
          t: 'line',
          pts: [
            { x: cx, y: top + HEAD_H },
            { x: cx, y: bottom },
          ],
          dash: true,
        },
      ],
      texts: [
        textRun(
          measure,
          h.text,
          headStyle,
          cx,
          baseline(top + 6, LINE_H.name, FONT.name),
          'middle',
        ),
      ],
      ports: [],
    };
  });

  const right = Math.max(
    xs[n - 1] + (heads[n - 1]?.w ?? 0) / 2 + rightRoom,
    Number.isFinite(all.hi) ? all.hi : 0,
    ...frags.map((f) => f.x + f.w),
    tabW,
  );
  const frame = { x: 0, y: 0, w: Math.ceil(right + pad), h: Math.ceil(bottom + pad) };
  return {
    width: frame.w + 1,
    height: frame.h + 1,
    frame,
    tab,
    header: header.map((t) => shiftText(t, 0, 0)),
    nodes: [...lifeNodes, ...frags],
    edges,
    framePorts: [],
  };
}
