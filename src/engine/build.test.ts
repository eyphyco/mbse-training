import { describe, expect, it } from 'vitest';
import { addElement, addRelation, endCandidates, judgeBuild, removeAdded } from './build';
import { PALETTES } from '../diagram/palette';
import type { Model } from '../diagram/model';
import { PROBLEMS } from '../data/content';
import { grade } from './judge';

const tool = (type: Model['type'], id: string) =>
  [...PALETTES[type].elements, ...PALETTES[type].relations].find((t) => t.id === id)!;

const base = (): Model => ({
  type: 'bdd',
  frame: { kind: 'bdd', ownerType: 'package', owner: 'P' },
  elements: [
    { id: 'V', kind: 'block', name: 'Vehicle' },
    { id: 'W', kind: 'block', name: 'Wheel' },
  ],
  relations: [],
});

const must = (r: { model: Model } | { error: string }) => {
  if ('error' in r) throw new Error(r.error);
  return r.model;
};

describe('置く・引く・外す', () => {
  it('置いたものは u の連番。土台の id と重ならない', () => {
    const m = must(addElement(base(), tool('bdd', 'block') as never, { name: 'Engine' }));
    expect(m.elements.at(-1)).toMatchObject({ id: 'u1', kind: 'block', name: 'Engine' });
  });

  it('名前が無ければ置かない。要求は id と text も要る', () => {
    expect(addElement(base(), tool('bdd', 'block') as never, {})).toEqual({
      error: '名前を入れてください',
    });
    const req: Model = { ...base(), type: 'req' };
    expect('error' in addElement(req, tool('req', 'requirement') as never, { name: 'R' })).toBe(
      true,
    );
  });

  it('ガードの [ ] と効果の / は書いても書かなくてもよい', () => {
    const m: Model = {
      type: 'stm',
      frame: { kind: 'stm', ownerType: 'stateMachine', owner: 'S' },
      elements: [
        { id: 'a', kind: 'state', name: 'A' },
        { id: 'b', kind: 'state', name: 'B' },
      ],
      relations: [],
    };
    const r = must(
      addRelation(m, tool('stm', 'transition') as never, 'a', 'b', {
        trigger: 'go',
        guard: '[x > 0]',
        effect: '/ beep',
      }),
    ).relations[0];
    expect(r).toMatchObject({ guard: 'x > 0', effect: 'beep' });
  });

  it('要素を外すと、つながる関係も外れる', () => {
    let m = must(addElement(base(), tool('bdd', 'block') as never, { name: 'Engine' }));
    m = must(addRelation(m, tool('bdd', 'composition') as never, 'V', 'u1', {}));
    m = removeAdded(m, 'u1');
    expect(m.elements.map((e) => e.id)).toEqual(['V', 'W']);
    expect(m.relations).toEqual([]);
  });

  it('関係の元・先の候補は、その関係が結べる種類だけ', () => {
    const req: Model = {
      type: 'req',
      frame: { kind: 'req', ownerType: 'package', owner: 'R' },
      elements: [
        { id: 'r', kind: 'requirement', name: 'R', reqId: '1', text: 't' },
        { id: 'b', kind: 'block', name: 'B' },
        { id: 't', kind: 'testCase', name: 'T' },
      ],
      relations: [],
    };
    const satisfy = PALETTES.req.relations.find((t) => t.id === 'satisfy')!;
    expect(endCandidates(req, satisfy.from).map((c) => c.id)).toEqual(['b']);
    expect(endCandidates(req, satisfy.to).map((c) => c.id)).toEqual(['r']);
  });
});

describe('照合', () => {
  const answer = (): Model => ({
    ...base(),
    relations: [
      {
        id: 'k',
        kind: 'composition',
        source: 'V',
        target: 'W',
        targetRole: 'wheels',
        targetMult: '4',
      },
    ],
  });

  it('id ではなく種類と名前で照合する。名前の大小文字と前後の空白は無視', () => {
    const built: Model = {
      ...base(),
      relations: [
        {
          id: 'u9',
          kind: 'composition',
          source: 'V',
          target: 'W',
          targetRole: ' Wheels',
          targetMult: '4',
        },
      ],
    };
    expect(judgeBuild(answer(), built).correct).toBe(true);
  });

  it('ひし形の種類・向き・多重度の違いを、足りない・余分として言う', () => {
    const built: Model = {
      ...base(),
      relations: [
        {
          id: 'u1',
          kind: 'aggregation',
          source: 'V',
          target: 'W',
          targetRole: 'wheels',
          targetMult: '4',
        },
      ],
    };
    const r = judgeBuild(answer(), built);
    expect(r.correct).toBe(false);
    expect(r.missing[0]).toContain('コンポジション');
    expect(r.extra[0]).toContain('共有集約');
  });

  it('正解に無い欄はどちらでもよい', () => {
    const a = answer();
    delete a.relations[0].targetRole;
    expect(judgeBuild(a, answer()).correct).toBe(true);
  });

  it('向きの無い線（関連・コネクタ・束縛）は両端を入れ替えても同じ', () => {
    const a: Model = {
      ...base(),
      relations: [{ id: 'k', kind: 'association', source: 'V', target: 'W' }],
    };
    const b: Model = {
      ...base(),
      relations: [{ id: 'u', kind: 'association', source: 'W', target: 'V' }],
    };
    expect(judgeBuild(a, b).correct).toBe(true);
  });

  it('ガード・トリガは空白を無視して比べる', () => {
    const s = (guard: string): Model => ({
      type: 'stm',
      frame: { kind: 'stm', ownerType: 'stateMachine', owner: 'S' },
      elements: [
        { id: 'a', kind: 'state', name: 'A' },
        { id: 'b', kind: 'state', name: 'B' },
      ],
      relations: [{ id: 't', kind: 'transition', source: 'a', target: 'b', guard }],
    });
    expect(judgeBuild(s('fuel > 0'), s('fuel>0')).correct).toBe(true);
  });

  it('シーケンス図のメッセージは順序ごと比べる', () => {
    const sd = (order: string[]): Model => ({
      type: 'sd',
      frame: { kind: 'sd', ownerType: 'interaction', owner: 'I' },
      elements: [
        { id: 'a', kind: 'lifeline', name: 'a' },
        { id: 'b', kind: 'lifeline', name: 'b' },
      ],
      relations: [],
      steps: order.map((label, i) => ({
        kind: 'message' as const,
        id: `m${i}`,
        sort: 'async' as const,
        from: 'a',
        to: 'b',
        label,
      })),
    });
    expect(judgeBuild(sd(['x', 'y']), sd(['x', 'y'])).correct).toBe(true);
    expect(judgeBuild(sd(['x', 'y']), sd(['y', 'x'])).correct).toBe(false);
  });
});

describe('組み立て問題（全問）', () => {
  const builds = PROBLEMS.filter((p) => p.type === 'build_fragment');

  it('ある', () => {
    expect(builds.length).toBeGreaterThanOrEqual(20);
  });

  it('正解の図を組めば正解、土台のままでは不正解', () => {
    for (const p of builds) {
      expect(grade(p, { choices: [], picks: [], built: p.answer_model }), p.id).toBe(true);
      expect(grade(p, { choices: [], picks: [], built: p.model }), p.id).toBe(false);
    }
  });
});
