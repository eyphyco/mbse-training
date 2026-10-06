import { describe, expect, it } from 'vitest';
import { blockContent, layoutBdd } from './bdd';
import { describeModel } from './describe';
import { endMarker, trimEnd } from './layout';
import { MARKER, estimateWidth } from './metrics';
import { checkModel, headerText, isMultiplicity, propText } from './model';
import type { Model } from './model';
import { NOTATION } from '../data/notation';

const vehicle = (): Model => ({
  type: 'bdd',
  frame: { kind: 'bdd', ownerType: 'package', owner: 'V', name: 'S' },
  elements: [
    { id: 'Vehicle', kind: 'block', name: 'Vehicle' },
    { id: 'Wheel', kind: 'block', name: 'Wheel' },
    { id: 'EV', kind: 'block', name: 'EV' },
  ],
  relations: [
    {
      id: 'c',
      kind: 'composition',
      source: 'Vehicle',
      target: 'Wheel',
      targetMult: '4',
      targetRole: 'wheels',
    },
    { id: 'g', kind: 'generalization', source: 'EV', target: 'Vehicle' },
  ],
});

describe('多重度の綴り', () => {
  it.each(['1', '0..1', '*', '1..*', '2..4'])('%s は読める', (s) => {
    expect(isMultiplicity(s)).toBe(true);
  });
  it.each(['[4]', '4..2', '*..1', '1..', 'n', ''])('%s は読めない', (s) => {
    expect(isMultiplicity(s)).toBe(false);
  });
});

describe('図にできるかの検査', () => {
  it('正しいモデルは通る', () => {
    expect(checkModel(vehicle())).toEqual([]);
  });

  it('無い要素を指す関係・重複した id・読めない多重度を落とす', () => {
    const m = vehicle();
    m.relations.push({ id: 'c', kind: 'association', source: 'Vehicle', target: 'Nope' });
    m.relations[0].targetMult = '[4]';
    const ng = checkModel(m).join('\n');
    expect(ng).toContain('id「c」が重複');
    expect(ng).toContain('target「Nope」が無い');
    expect(ng).toContain('多重度「[4]」');
  });

  it('意味の誤り（ひし形の向きが逆）は落とさない。spot_error が描く図なので', () => {
    const m = vehicle();
    m.relations[0] = { ...m.relations[0], source: 'Wheel', target: 'Vehicle' };
    expect(checkModel(m)).toEqual([]);
  });

  it('図枠の略号は描くものをそのまま持つ（誤った略号も描ける）', () => {
    const m = vehicle();
    m.frame.kind = 'ibd';
    expect(checkModel(m)).toEqual([]);
    expect(headerText(m.frame)).toBe('ibd [package] V [S]');
  });

  it('標準ポートに向きを付けたら落とす（向きはフローポートだけ）', () => {
    const m = vehicle();
    m.elements[0].ports = [{ id: 'p', name: 'p', kind: 'standard', direction: 'in' }];
    expect(checkModel(m).join()).toContain('標準ポートに向きは無い');
  });
});

describe('コンパートメントの行', () => {
  it('パート・値・操作・制約・フロー属性を v1.2 の綴りにする', () => {
    expect(propText({ kind: 'part', name: 'wheels', type: 'Wheel', mult: '4' })).toBe(
      'wheels : Wheel [4]',
    );
    expect(propText({ kind: 'value', name: 'mass', type: 'Mass', default: '1500' })).toBe(
      'mass : Mass = 1500',
    );
    expect(propText({ kind: 'operation', name: 'go', params: 'v : Real', type: 'Boolean' })).toBe(
      'go(v : Real) : Boolean',
    );
    expect(propText({ kind: 'constraint', name: 'f = m * a' })).toBe('{f = m * a}');
    expect(propText({ kind: 'flowProperty', name: 'fuel', type: 'Fuel', direction: 'in' })).toBe(
      'in fuel : Fuel',
    );
  });
});

describe('箱の中身', () => {
  it('種別のステレオタイプが先頭に付き、制約ブロックは «constraint» と出る', () => {
    const c = blockContent({ id: 'n', kind: 'constraintBlock', name: 'N' }, estimateWidth);
    expect(c.texts[0].text).toBe('«constraint»');
  });

  it('追加のステレオタイプは 1 つの «» にカンマで並べる', () => {
    const c = blockContent(
      { id: 'n', kind: 'block', name: 'N', stereotypes: ['system'] },
      estimateWidth,
    );
    expect(c.texts[0].text).toBe('«block, system»');
  });

  it('幅は一番長い行で決まり、どの行も箱に収まる', () => {
    const c = blockContent(
      {
        id: 'n',
        kind: 'block',
        name: 'N',
        props: [{ kind: 'value', name: 'aVeryLongValuePropertyName', type: 'SomeValueType' }],
      },
      estimateWidth,
    );
    for (const t of c.texts) {
      const left = t.anchor === 'middle' ? t.x - t.w / 2 : t.x;
      expect(left).toBeGreaterThan(0);
      expect(left + t.w).toBeLessThan(c.w);
    }
  });

  it('区画ごとに仕切り線が 1 本、空の区画は出さない', () => {
    const c = blockContent(
      {
        id: 'n',
        kind: 'block',
        name: 'N',
        props: [
          { kind: 'part', name: 'a', type: 'A' },
          { kind: 'value', name: 'v', type: 'V' },
        ],
      },
      estimateWidth,
    );
    expect(c.dividers).toHaveLength(2);
    expect(c.texts.map((t) => t.text)).toEqual([
      '«block»',
      'N',
      'parts',
      'a : A',
      'values',
      'v : V',
    ]);
  });

  it('列挙リテラルの区画には見出しを付けない', () => {
    const c = blockContent(
      { id: 'n', kind: 'enumeration', name: 'E', props: [{ kind: 'literal', name: 'on' }] },
      estimateWidth,
    );
    expect(c.texts.map((t) => t.text)).toEqual(['«enumeration»', 'E', 'on']);
  });
});

describe('端の記号', () => {
  const tip = { x: 0, y: 0 };
  const prev = { x: 0, y: 100 };

  it('黒ひし形は塗り、白ひし形は塗らない', () => {
    expect(endMarker('diamondFilled', tip, prev).marker.filled).toBe(true);
    expect(endMarker('diamondHollow', tip, prev).marker.filled).toBe(false);
  });

  it('ひし形と三角は線を記号の根元で止める。矢じりは先端まで届かせる', () => {
    expect(endMarker('diamondFilled', tip, prev).trim).toBe(MARKER.diamondLen);
    expect(endMarker('triangle', tip, prev).trim).toBe(MARKER.triangleLen);
    expect(endMarker('arrow', tip, prev).trim).toBe(0);
  });

  it('記号は線の内側へ伸びる', () => {
    const d = endMarker('diamondFilled', tip, prev).marker.points;
    expect(d[2]).toEqual({ x: 0, y: MARKER.diamondLen });
  });

  it('trimEnd は指定した側の端だけ縮める', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
    ];
    expect(trimEnd(line, 10, 'end')).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
    ]);
    expect(trimEnd(line, 10, 'start')).toEqual([
      { x: 0, y: 10 },
      { x: 0, y: 50 },
    ]);
  });
});

describe('bdd のレイアウト', () => {
  it('全体は部分より上、一般は特化より上に置く', async () => {
    const l = await layoutBdd(vehicle());
    const y = (id: string) => l.nodes.find((n) => n.id === id)!.y;
    expect(y('Vehicle')).toBeLessThan(y('Wheel'));
    expect(y('Vehicle')).toBeLessThan(y('EV'));
  });

  it('黒ひし形は全体の側、白三角は一般の側に付く', async () => {
    const l = await layoutBdd(vehicle());
    const box = (id: string) => l.nodes.find((n) => n.id === id)!;
    const comp = l.edges.find((e) => e.id === 'c')!;
    const gen = l.edges.find((e) => e.id === 'g')!;
    const near = (p: { x: number; y: number }, id: string) => {
      const b = box(id);
      return p.y >= b.y - 1 && p.y <= b.y + b.h + 1 && p.x >= b.x - 1 && p.x <= b.x + b.w + 1;
    };
    expect(comp.markers[0].filled).toBe(true);
    expect(near(comp.markers[0].points[0], 'Vehicle')).toBe(true);
    expect(near(gen.markers[0].points[0], 'Vehicle')).toBe(true);
  });

  it('多重度とロール名は部分の側の端に出る', async () => {
    const l = await layoutBdd(vehicle());
    const wheel = l.nodes.find((n) => n.id === 'Wheel')!;
    const vehicleBox = l.nodes.find((n) => n.id === 'Vehicle')!;
    const comp = l.edges.find((e) => e.id === 'c')!;
    for (const t of comp.texts) {
      expect(Math.abs(t.y - wheel.y)).toBeLessThan(Math.abs(t.y - (vehicleBox.y + vehicleBox.h)));
    }
  });

  it('箱どうしが重ならない（記法見本の全図。入れ物は中に箱を持つので除く）', async () => {
    for (const s of NOTATION) {
      const l = await layoutBdd(s.model);
      const leaves = l.nodes.filter((n) => !n.container);
      for (const a of leaves)
        for (const b of leaves) {
          if (a === b) continue;
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${s.id}: ${a.id} と ${b.id}`).toBe(true);
        }
    }
  });

  it('図にできないモデルは理由を添えて例外にする', async () => {
    const m = vehicle();
    m.relations[0].target = 'Nope';
    await expect(layoutBdd(m)).rejects.toThrow('target「Nope」が無い');
  });
});

describe('読み上げ用の控え', () => {
  it('ヘッダ・要素・関係を、形の名前と意味の名前の両方で言う', () => {
    const lines = describeModel(vehicle());
    expect(lines[0]).toBe('図枠のヘッダ: bdd [package] V [S]');
    expect(lines).toContain(
      'Vehicle 側に黒ひし形の線で Wheel とつながる（コンポジション）（Wheel 側に wheels・4）',
    );
    expect(lines).toContain('EV から Vehicle へ白三角の矢印（汎化。Vehicle が一般の側）');
  });

  it('誤った図も描いてある通りに言う（正しい形に直さない）', () => {
    const m = vehicle();
    m.relations[0] = { ...m.relations[0], kind: 'aggregation' };
    expect(describeModel(m).join()).toContain('白ひし形');
  });
});
