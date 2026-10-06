import { describe, expect, it } from 'vitest';
import { RULES, findIssues, pickableRefs, refLabel } from './rules';
import type { Model } from './model';
import { NOTATION } from '../data/notation';

/*
  bdd 以外の図種の規則。どれも「図の中の食い違い」として判定できるものに限っている（rules.ts の頭）。
  正しい形（記法見本）では何も出ないことは rules.test.ts が見ている。
*/
const kinds = (model: Model) => findIssues(model).map((i) => `${i.at}:${i.kind}`);
const find = (id: string) => structuredClone(NOTATION.find((s) => s.id === id)!.model);

describe('ヘッダ', () => {
  it('図種ごとに [ ] の型が決まっている', () => {
    const m = find('act-start');
    m.frame.ownerType = 'block';
    expect(kinds(m)).toEqual(['frame:header-owner-type']);
    const s = find('sd-start');
    s.frame.ownerType = 'interaction';
    expect(kinds(s)).toEqual([]);
  });
});

describe('ibd・par', () => {
  it('隣どうしのフローポートは out → in、図枠のポートとは同じ向き', () => {
    const m = find('ibd-power');
    expect(kinds(m)).toEqual([]);
    m.elements[1].ports![0].direction = 'out'; // engine.fuelIn を out に
    expect(kinds(m)).toEqual(['c2:flow-direction-mismatch']);
  });

  it('つないだポートの型が違う・項目フローが逆を指す', () => {
    const m = find('ibd-power');
    m.elements[1].ports![0].type = 'Torque';
    m.relations[1].itemFlows = [{ item: 'fuel : Fuel', reverse: true }];
    expect(kinds(m)).toEqual(['c2:connector-type-mismatch', 'c2:itemflow-reversed']);
  });

  it('使用の図に定義の箱', () => {
    const m = find('ibd-nested');
    m.elements.push({ id: 'B', kind: 'block', name: 'Engine' });
    expect(kinds(m)).toEqual(['B:definition-in-usage-diagram']);
  });

  it('式に無いパラメータ・束縛の型違い', () => {
    const m = find('par-newton');
    const newton = m.elements.find((e) => e.id === 'newton')!;
    newton.ports![2].name = 'v';
    expect(kinds(m)).toEqual(['newton.a:param-not-in-expr']);
    const n = find('par-newton');
    n.elements.find((e) => e.id === 'newton')!.ports![1].type = 'Force';
    expect(kinds(n)).toEqual(['b2:binding-type-mismatch']);
  });

  it('制約ブロックの式とパラメータの区画が揃っていない', () => {
    const m: Model = {
      type: 'bdd',
      frame: { kind: 'bdd', ownerType: 'package', owner: 'P' },
      elements: [
        {
          id: 'N',
          kind: 'constraintBlock',
          name: 'N',
          props: [
            { kind: 'constraint', name: 'f = m * a + sqrt(x)' },
            { kind: 'parameter', name: 'f' },
            { kind: 'parameter', name: 'm' },
            { kind: 'parameter', name: 'q' },
          ],
        },
      ],
      relations: [],
    };
    expect(kinds(m)).toEqual(['N:expr-var-missing-param', 'N:param-not-in-expr']);
  });
});

describe('pkg・req・uc', () => {
  it('«conform» の向き・持ち主が 2 つ', () => {
    const m = find('pkg-view');
    m.relations[0] = { ...m.relations[0], source: 'vp', target: 'v' };
    expect(kinds(m)).toEqual(['d1:conform-reversed']);
    const o = find('pkg-model');
    o.relations.push({ id: 'k', kind: 'containment', source: 'beh', target: 'veh' });
    expect(kinds(o)).toEqual(['veh:owned-twice']);
  });

  it('satisfy・verify・deriveReqt の向きと端', () => {
    const m = find('req-relations');
    const rel = (id: string) => m.relations.find((r) => r.id === id)!;
    rel('s1').source = 'r11';
    rel('s1').target = 'brake';
    rel('v1').source = 'r1';
    rel('v1').target = 'tc';
    rel('d1').source = 'brake';
    expect(kinds(m)).toEqual([
      'd1:derive-non-requirement',
      's1:satisfy-reversed',
      'v1:verify-reversed',
    ]);
  });

  it('要求の text が無い・要求の中に要求でないもの', () => {
    const m = find('req-relations');
    delete m.elements[0].text;
    m.relations.push({ id: 'k2', kind: 'containment', source: 'r1', target: 'brake' });
    expect(kinds(m)).toEqual(['k2:req-containment-non-req', 'r1:requirement-missing-text']);
  });

  it('アクターは主題の外・関連と include の相手', () => {
    const m = find('uc-vehicle');
    m.elements.find((e) => e.id === 'mech')!.parent = 'sys';
    m.relations.push(
      { id: 'x1', kind: 'association', source: 'drive', target: 'park' },
      { id: 'x2', kind: 'association', source: 'driver', target: 'mech' },
      { id: 'x3', kind: 'include', source: 'driver', target: 'start' },
    );
    expect(kinds(m)).toEqual([
      'mech:actor-inside-subject',
      'x1:association-between-usecases',
      'x2:association-between-actors',
      'x3:include-with-actor',
    ]);
  });
});

describe('act・stm・sd', () => {
  it('開始に入る線・終了から出る線・ガードの無い出口', () => {
    const m = find('act-start');
    m.relations.find((r) => r.id === 'f4')!.guard = undefined;
    m.relations.push(
      { id: 'x1', kind: 'controlFlow', source: 'a1', target: 'i' },
      { id: 'x2', kind: 'controlFlow', source: 'end', target: 'a1' },
    );
    expect(kinds(m)).toEqual([
      'f4:decision-without-guard',
      'x1:initial-has-incoming',
      'x2:final-has-outgoing',
    ]);
  });

  it('物はピンを通る・制御はピンに入らない・ピンの型', () => {
    const m = find('act-objects');
    m.relations[1] = { ...m.relations[1], source: 'a1' };
    m.elements[1].ports![0].type = 'Fuel';
    m.relations.push({ id: 'x', kind: 'controlFlow', source: 'a1.out', target: 'a2' });
    expect(kinds(m)).toEqual(['o2:objectflow-without-pin', 'x:controlflow-on-pin']);
    const n = find('act-objects');
    n.elements[1].ports![0].type = 'Fuel';
    expect(kinds(n)).toEqual(['o2:pin-type-mismatch']);
  });

  it('開始からの遷移にトリガ・1 つの領域に開始が 2 つ（余分な方を指す）', () => {
    const m = find('stm-regions');
    m.relations[1].trigger = 'go';
    m.elements.push({ id: 'i9', kind: 'initial', name: '', parent: 'r1' });
    expect(kinds(m)).toEqual(['i9:two-initials-in-region', 't1:initial-has-trigger']);
  });

  it('非同期への返信・ガードの無い alt の区画', () => {
    const m = find('sd-start');
    const steps = m.steps!;
    if (steps[1].kind === 'message') steps[1].sort = 'async';
    if (steps[3].kind === 'fragment') steps[3].operands[1].guard = undefined;
    expect(kinds(m)).toEqual(['f1:alt-operand-without-guard', 'm3:reply-without-call']);
  });

  it('«allocate» の先が要求・区画と矢印の向きの食い違い', () => {
    const m: Model = {
      type: 'bdd',
      frame: { kind: 'bdd', ownerType: 'package', owner: 'P' },
      elements: [
        { id: 'f', kind: 'activity', name: 'Drive' },
        { id: 'e', kind: 'block', name: 'Engine', allocatedTo: ['«activity» Drive'] },
        { id: 'r', kind: 'requirement', name: 'R', reqId: '1', text: 't' },
      ],
      relations: [
        { id: 'a', kind: 'dependency', stereotype: 'allocate', source: 'f', target: 'e' },
        { id: 'b', kind: 'dependency', stereotype: 'allocate', source: 'e', target: 'r' },
      ],
    };
    expect(kinds(m)).toEqual(['a:allocate-compartment-mismatch', 'b:allocate-to-requirement']);
  });
});

describe('指せる場所と呼び名', () => {
  it('図枠のポート・メッセージ・フラグメントも指せ、日本語の呼び名がある', () => {
    for (const s of NOTATION)
      for (const ref of pickableRefs(s.model)) expect(refLabel(s.model, ref), ref).not.toBe(ref);
    const sd = find('sd-start');
    expect(refLabel(sd, 'm2')).toBe('ecu → engine の同期メッセージ crank()');
  });

  it('規則にはすべて見出しと解説がある', () => {
    for (const [k, r] of Object.entries(RULES)) {
      expect(r.title, k).toBeTruthy();
      expect(r.explain.length, k).toBeGreaterThan(20);
    }
  });
});
