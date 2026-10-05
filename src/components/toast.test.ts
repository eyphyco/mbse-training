import { describe, expect, it } from 'vitest';
import { dismissToast, pushToast, relativeLabel, VISIBLE_LIMIT, type Toast } from './toast';

const toast = (id: number, at = 0): Toast => ({ id, text: `t${id}`, tone: 'neutral', at });

describe('pushToast', () => {
  it('新しいものを先頭に積む', () => {
    const list = pushToast(pushToast([], toast(1)), toast(2));
    expect(list.map((t) => t.id)).toEqual([2, 1]);
  });

  it('枚数の上限を超えたら古いほうから落とす', () => {
    let list: Toast[] = [];
    for (let i = 1; i <= VISIBLE_LIMIT + 2; i += 1) list = pushToast(list, toast(i));
    expect(list).toHaveLength(VISIBLE_LIMIT);
    expect(list[list.length - 1].id).toBe(3);
  });
});

describe('dismissToast', () => {
  it('その 1 枚だけ外す', () => {
    const list = [toast(3), toast(2), toast(1)];
    expect(dismissToast(list, 2).map((t) => t.id)).toEqual([3, 1]);
  });

  it('無い id では何も変わらない', () => {
    const list = [toast(1)];
    expect(dismissToast(list, 9)).toEqual(list);
  });
});

describe('relativeLabel', () => {
  const now = 1_000_000_000;
  const ago = (ms: number) => relativeLabel(now - ms, now);

  it.each([
    [0, 'たった今'],
    [59_000, 'たった今'],
    [60_000, '1 分前'],
    [59 * 60_000, '59 分前'],
    [60 * 60_000, '1 時間前'],
    [23 * 3600_000, '23 時間前'],
    [24 * 3600_000, '1 日前'],
  ])('%i ミリ秒前は %s', (ms, expected) => {
    expect(ago(ms)).toBe(expected);
  });

  it('時計が巻き戻っても負の数を出さない', () => {
    expect(relativeLabel(now + 5000, now)).toBe('たった今');
  });
});
