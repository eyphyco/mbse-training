import { describe, expect, it } from 'vitest';
import { nearestIndex } from './segmented';

// 実測値に近い並び（2px の内側余白 + 幅 28px + 隙間 2px）
const POS = [2, 32, 62];

describe('nearestIndex — つまみを離した位置から選択肢を決める', () => {
  it.each([
    [2, 0],
    [32, 1],
    [62, 2],
  ])('区画の真上 (%i) はその区画', (x, i) => {
    expect(nearestIndex(x, POS)).toBe(i);
  });

  it('半分より手前なら元の区画に戻る', () => {
    expect(nearestIndex(16, POS)).toBe(0);
  });

  it('半分を越えたら次の区画へ移る', () => {
    expect(nearestIndex(18, POS)).toBe(1);
  });

  it('ちょうど中間は手前側に倒す（先に見つけた方を残す）', () => {
    expect(nearestIndex(17, POS)).toBe(0);
  });

  it('左に振り切っても先頭で止まる', () => {
    expect(nearestIndex(-500, POS)).toBe(0);
  });

  it('右に振り切っても末尾で止まる', () => {
    expect(nearestIndex(500, POS)).toBe(2);
  });

  it('区画が 1 つでも落ちない', () => {
    expect(nearestIndex(999, [2])).toBe(0);
  });

  it('まだ測れていない（すべて 0）ときは先頭', () => {
    expect(nearestIndex(0, [0, 0, 0])).toBe(0);
  });
});
