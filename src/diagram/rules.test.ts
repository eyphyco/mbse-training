import { describe, expect, it } from 'vitest';
import { findIssues } from './rules';
import type { Model } from './model';
import { NOTATION } from '../data/notation';

const m = (): Model => ({
  type: 'bdd',
  frame: { kind: 'bdd', ownerType: 'package', owner: 'P' },
  elements: [
    {
      id: 'V',
      kind: 'block',
      name: 'Vehicle',
      props: [
        { kind: 'part', name: 'wheels', type: 'Wheel', mult: '4' },
        { kind: 'value', name: 'mass', type: 'Mass' },
      ],
    },
    { id: 'W', kind: 'block', name: 'Wheel' },
    { id: 'M', kind: 'valueType', name: 'Mass' },
  ],
  relations: [
    {
      id: 'r',
      kind: 'composition',
      source: 'V',
      target: 'W',
      targetMult: '4',
      targetRole: 'wheels',
    },
  ],
});

const kinds = (model: Model) => findIssues(model).map((i) => `${i.at}:${i.kind}`);

describe('妥当性規則', () => {
  it('正しい図には何も出ない（記法見本もすべて）', () => {
    expect(kinds(m())).toEqual([]);
    for (const s of NOTATION) expect(kinds(s.model), s.id).toEqual([]);
  });

  it('parts 区画にあるのに白ひし形', () => {
    const x = m();
    x.relations[0].kind = 'aggregation';
    expect(kinds(x)).toEqual(['r:parts-vs-aggregation']);
  });

  it('多重度とロール名を全体の側に書いた', () => {
    const x = m();
    x.relations[0] = {
      ...x.relations[0],
      targetMult: undefined,
      targetRole: undefined,
      sourceMult: '4',
      sourceRole: 'wheels',
    };
    expect(kinds(x)).toEqual(['r:composite-end-mult', 'r:role-wrong-end']);
  });

  it('ひし形の向きが逆', () => {
    const x = m();
    x.relations[0] = {
      ...x.relations[0],
      source: 'W',
      target: 'V',
      targetRole: undefined,
      targetMult: undefined,
    };
    x.elements[1].props = [{ kind: 'part', name: 'v', type: 'Vehicle' }];
    x.elements[0].props = [];
    // Wheel が Vehicle を持つ形で区画とも一致する。矛盾は無い（向きが逆と言えるのは区画と食い違うときだけ）
    expect(kinds(x)).toEqual([]);
    // Vehicle の parts 区画には wheels があるのに、ひし形は Wheel の側
    x.elements[0].props = [{ kind: 'part', name: 'wheels', type: 'Wheel', mult: '4' }];
    x.elements[1].props = [];
    expect(kinds(x)).toEqual(['r:composition-reversed']);
  });

  it('区画と線で多重度が違う', () => {
    const x = m();
    x.relations[0].targetMult = '2';
    expect(kinds(x)).toEqual(['r:part-mult-mismatch']);
  });

  it('値属性をブロックで、パートを値型で型付けした', () => {
    const x = m();
    x.elements[0].props = [
      { kind: 'part', name: 'mass', type: 'Mass' },
      { kind: 'value', name: 'wheel', type: 'Wheel' },
    ];
    expect(kinds(x)).toEqual(['V:part-typed-by-valuetype', 'V:value-typed-by-block']);
  });

  it('ヘッダの略号と型', () => {
    const x = m();
    x.frame = { kind: 'ibd', ownerType: 'activity', owner: 'P' };
    expect(kinds(x)).toEqual(['frame:header-kind', 'frame:header-owner-type']);
  });

  it('ブロックが値型を特化する', () => {
    const x = m();
    x.relations.push({ id: 'g', kind: 'generalization', source: 'W', target: 'M' });
    expect(kinds(x)).toEqual(['g:generalization-across-kinds']);
  });
});
