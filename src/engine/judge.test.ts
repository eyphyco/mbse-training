import { describe, expect, it } from 'vitest';
import { judgeChoice, judgeSpot } from './judge';
import type { Problem } from '../data/types';

const base: Problem = {
  id: 'p',
  type: 'read_diagram',
  items: ['x'],
  level: 1,
  title: 't',
  prompt_md: 'q',
  explanation_md: 'e',
};

describe('選択肢の採点', () => {
  it('集合として一致すれば正解。順序は見ない', () => {
    const p = { ...base, answer: ['a', 'c'] };
    expect(judgeChoice(p, ['c', 'a'])).toBe(true);
    expect(judgeChoice(p, ['a'])).toBe(false);
    expect(judgeChoice(p, ['a', 'b', 'c'])).toBe(false);
  });
});

describe('誤り指摘の採点', () => {
  const p: Problem = {
    ...base,
    type: 'spot_error',
    errors: [
      { at: 'r1', kind: 'parts-vs-aggregation', why: '' },
      { at: 'r1', kind: 'part-mult-mismatch', why: '' },
      { at: 'frame', kind: 'header-kind', why: '' },
    ],
  };
  it('場所で数える。同じ場所の誤り 2 つは 1 回指せばよい', () => {
    expect(judgeSpot(p, ['frame', 'r1']).correct).toBe(true);
  });
  it('指し漏れと、誤りでない所を指したものを分けて返す', () => {
    expect(judgeSpot(p, ['r1', 'Vehicle'])).toEqual({
      correct: false,
      hits: ['r1'],
      misses: ['frame'],
      wrongs: ['Vehicle'],
    });
  });
});
