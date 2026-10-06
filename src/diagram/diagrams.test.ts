import { describe, expect, it } from 'vitest';
import { layoutDiagram } from './diagrams';
import { flattenSteps } from './model';
import type { DiagramLayout, EdgeShape, NodeShape } from './layout';
import { NOTATION } from '../data/notation';

/*
  9 図種のレイアウトで、記法として崩れてはいけない所を確かめる。
  見た目の細部は記法見本（#/notation）を目で見る。ここは「形の決まり」だけ。
*/
const get = async (id: string) => {
  const s = NOTATION.find((x) => x.id === id)!;
  return { model: s.model, l: await layoutDiagram(s.model) };
};
const node = (l: DiagramLayout, id: string) => l.nodes.find((n) => n.id === id) as NodeShape;
const edge = (l: DiagramLayout, id: string) => l.edges.find((e) => e.id === id) as EdgeShape;

describe('全図種', () => {
  it('記法見本はすべて描け、要素は箱に、関係とメッセージは 2 点以上の線になる', async () => {
    for (const s of NOTATION) {
      const l = await layoutDiagram(s.model);
      const ids = new Set(l.nodes.map((n) => n.id));
      for (const e of s.model.elements) expect(ids.has(e.id), `${s.id}: ${e.id}`).toBe(true);
      const want = [
        ...s.model.relations.map((r) => r.id),
        ...flattenSteps(s.model.steps)
          .filter((x) => x.kind === 'message')
          .map((x) => x.id),
      ];
      for (const id of want)
        expect(edge(l, id)?.points.length ?? 0, `${s.id}: ${id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('箱は図枠の中に収まる', async () => {
    for (const s of NOTATION) {
      const l = await layoutDiagram(s.model);
      for (const n of l.nodes) {
        // act のパラメータノードだけは図枠の縁にまたがる
        const onBorder = (s.model.framePorts ?? []).some((p) => p.id === n.id);
        if (onBorder) continue;
        expect(n.x, `${s.id}: ${n.id}`).toBeGreaterThanOrEqual(l.frame.x);
        expect(n.y, `${s.id}: ${n.id}`).toBeGreaterThanOrEqual(l.frame.y);
        expect(n.x + n.w, `${s.id}: ${n.id}`).toBeLessThanOrEqual(l.frame.x + l.frame.w);
        expect(n.y + n.h, `${s.id}: ${n.id}`).toBeLessThanOrEqual(l.frame.y + l.frame.h);
      }
    }
  });
});

describe('ibd・par', () => {
  it('図枠のポートは図枠の縁にまたがる（囲みブロック自身のポート）', async () => {
    const { l } = await get('ibd-power');
    const p = l.framePorts[0];
    expect(Math.abs(p.x + p.size / 2 - l.frame.x)).toBeLessThanOrEqual(1);
  });

  it('入れ子のパートは親の箱の中、親は入れ物として先に描く', async () => {
    const { l } = await get('ibd-nested');
    const engine = node(l, 'engine');
    const pistons = node(l, 'pistons');
    expect(engine.container).toBe(true);
    expect(pistons.x).toBeGreaterThan(engine.x);
    expect(pistons.x + pistons.w).toBeLessThan(engine.x + engine.w);
    expect(l.nodes.indexOf(engine)).toBeLessThan(l.nodes.indexOf(pistons));
  });

  it('項目フローは線の途中の黒三角', async () => {
    const { l } = await get('ibd-power');
    const c2 = edge(l, 'c2');
    expect(c2.markers.some((m) => m.shape === 'polygon' && m.filled)).toBe(true);
  });

  it('制約パラメータの名前は箱の内側に書く', async () => {
    const { l } = await get('par-newton');
    const n = node(l, 'newton');
    for (const p of n.ports) {
      const t = p.label;
      const left = t.anchor === 'end' ? t.x - t.w : t.x;
      expect(left).toBeGreaterThanOrEqual(n.x);
      expect(left + t.w).toBeLessThanOrEqual(n.x + n.w);
    }
  });

  it('束縛コネクタには矢じりが無い', async () => {
    const { l } = await get('par-newton');
    for (const e of l.edges) expect(e.markers).toEqual([]);
  });
});

describe('req・pkg・uc', () => {
  it('包含の丸に十字は入れ物（親要求）の側に付く', async () => {
    const { l } = await get('req-relations');
    const k = edge(l, 'k1');
    const circle = k.markers.find((m) => m.shape === 'circle')!;
    const parent = node(l, 'r1');
    const child = node(l, 'r11');
    const dist = (n: NodeShape) =>
      Math.abs(circle.points[0].y - (n.y + n.h / 2)) +
      Math.abs(circle.points[0].x - (n.x + n.w / 2));
    expect(dist(parent)).toBeLessThan(dist(child));
  });

  it('依存（satisfy など）は点線で、矢じりは要求の側', async () => {
    const { l } = await get('req-relations');
    const s = edge(l, 's1');
    expect(s.dashed).toBe(true);
    const tip = s.markers[0].points[1];
    const req = node(l, 'r11');
    expect(Math.abs(tip.y - (req.y + req.h))).toBeLessThanOrEqual(2);
  });

  it('ユースケースの線は楕円の縁で止まる（外接矩形の角で止まらない）', async () => {
    const { l } = await get('uc-vehicle');
    const n = node(l, 'drive');
    const end = edge(l, 'a1').points.at(-1)!;
    const u = (end.x - (n.x + n.w / 2)) / (n.w / 2);
    const v = (end.y - (n.y + n.h / 2)) / (n.h / 2);
    expect(Math.abs(u * u + v * v - 1)).toBeLessThan(0.15);
  });

  it('アクターは主題の外、ユースケースは中', async () => {
    const { l } = await get('uc-vehicle');
    const sys = node(l, 'sys');
    const driver = node(l, 'driver');
    const drive = node(l, 'drive');
    expect(driver.x + driver.w).toBeLessThanOrEqual(sys.x);
    expect(drive.x).toBeGreaterThan(sys.x);
  });
});

describe('act', () => {
  it('制御フローは点線、オブジェクトフローは実線。どちらも先に開いた矢じり', async () => {
    const a = await get('act-start');
    expect(edge(a.l, 'f1').dashed).toBe(true);
    const o = await get('act-objects');
    expect(edge(o.l, 'o2').dashed).toBe(false);
    expect(edge(o.l, 'o2').markers[0].shape).toBe('polyline');
  });

  it('流れは上から下。開始が一番上、終了が一番下', async () => {
    const { l } = await get('act-start');
    const y = (id: string) => node(l, id).y;
    expect(y('i')).toBeLessThan(y('a1'));
    expect(y('a1')).toBeLessThan(y('d'));
    expect(y('j')).toBeLessThan(y('end'));
  });

  it('フォークの先の 2 つは同じ段に並び、棒は 2 つの上に渡る', async () => {
    const { l } = await get('act-start');
    const a3 = node(l, 'a3');
    const a4 = node(l, 'a4');
    const f = node(l, 'f');
    expect(a3.y).toBe(a4.y);
    expect(f.x).toBeLessThanOrEqual(a3.x + a3.w / 2);
    expect(f.x + f.w).toBeGreaterThanOrEqual(a4.x + a4.w / 2);
  });

  it('アクションは自分のパーティションの列の中にある', async () => {
    const { model, l } = await get('act-partition');
    for (const e of model.elements) {
      if (!e.parent) continue;
      const lane = node(l, e.parent);
      const n = node(l, e.id);
      expect(n.x, e.id).toBeGreaterThanOrEqual(lane.x);
      expect(n.x + n.w, e.id).toBeLessThanOrEqual(lane.x + lane.w);
    }
  });

  it('判断の出口のガードを、出口の近くに書く', async () => {
    const { l } = await get('act-start');
    const f3 = edge(l, 'f3');
    expect(f3.texts[0].text).toBe('[ok]');
    const start = f3.points[0];
    expect(Math.hypot(f3.texts[0].x - start.x, f3.texts[0].y - start.y)).toBeLessThan(30);
  });
});

describe('stm・sd', () => {
  it('直交領域の間に点線の区切り', async () => {
    const { l } = await get('stm-regions');
    const op = node(l, 'op');
    expect(op.prims.some((p) => p.t === 'line' && p.dash)).toBe(true);
  });

  it('遷移の札は トリガ [ガード] / 効果', async () => {
    const { l } = await get('stm-engine');
    expect(edge(l, 't1').texts.map((t) => t.text)).toEqual(['start [fuel > 0] / ignite']);
  });

  it('メッセージは書いた順に上から下。同期は塗った矢じり、非同期は開いた矢じり、返信は点線', async () => {
    const { model, l } = await get('sd-start');
    const msgs = flattenSteps(model.steps).filter((s) => s.kind === 'message');
    const ys = msgs.map((m) => edge(l, m.id).points[0].y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(edge(l, 'm2').markers[0]).toMatchObject({ shape: 'polygon', filled: true });
    expect(edge(l, 'm1').markers[0].shape).toBe('polyline');
    expect(edge(l, 'm3').dashed).toBe(true);
  });

  it('ref の箱は覆うライフラインにまたがる', async () => {
    const { l } = await get('sd-start');
    const ref = node(l, 'r1');
    const ecu = node(l, 'e');
    const engine = node(l, 'g');
    expect(ref.x).toBeLessThanOrEqual(ecu.x + ecu.w / 2);
    expect(ref.x + ref.w).toBeGreaterThanOrEqual(engine.x + engine.w / 2);
  });
});
