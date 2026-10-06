import { describe, expect, it } from 'vitest';
import { INTERVALS, addDays, dayOf, daysBetween, dueLabel, review } from './srs';
import {
  emptyProgress,
  laneOf,
  markRead,
  normalize,
  planStatus,
  sectionRead,
  recordAnswer,
  todayPlan,
} from './progress';

describe('暦日（JST 固定）', () => {
  it('UTC の 15:00 は JST の翌日 0:00', () => {
    expect(dayOf(Date.parse('2026-10-05T14:59:59Z'))).toBe('2026-10-05');
    expect(dayOf(Date.parse('2026-10-05T15:00:00Z'))).toBe('2026-10-06');
  });
  it('月末・年末・うるう日をまたいで足し引きできる', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-06', '2027-10-06')).toBe(365);
  });
});

describe('定着度の更新', () => {
  const T = '2026-10-06';

  it('初めて解いたら導入。level 0 で明日また出る', () => {
    const s = review(undefined, true, T, 'standard');
    expect(s).toMatchObject({ level: 0, dueOn: '2026-10-07', introducedOn: T });
  });

  it('出題日に正解すると 1 段上がり、間隔は標準表のとおり', () => {
    let s = review(undefined, true, T, 'standard');
    let day = s.dueOn;
    const gaps: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      s = review(s, true, day, 'standard');
      gaps.push(daysBetween(day, s.dueOn));
      day = s.dueOn;
    }
    expect(gaps).toEqual([3, 7, 16, 35, 90, 90]);
    expect(s.level).toBe(5); // 上限で止まる
  });

  it('詰め間隔は 1-2-4-8-16', () => {
    expect(INTERVALS.compact.slice(0, 5)).toEqual([1, 2, 4, 8, 16]);
  });

  it('間違えたら 1 段下げではなく level 0、次は明日、落とした回数が増える', () => {
    const s = review(
      { level: 4, dueOn: T, streak: 4, lapses: 1, lastOn: T, introducedOn: T },
      false,
      T,
      'standard',
    );
    expect(s).toMatchObject({ level: 0, streak: 0, lapses: 2, dueOn: '2026-10-07' });
  });

  it('出題日より前に正解しても上げない（先回りで間隔を飛ばせない）', () => {
    const prev = {
      level: 2,
      dueOn: '2026-10-10',
      streak: 2,
      lapses: 0,
      lastOn: T,
      introducedOn: T,
    };
    const s = review(prev, true, T, 'standard');
    expect(s.level).toBe(2);
    expect(s.dueOn).toBe('2026-10-10');
  });

  it('同じ日に 2 回正解しても 1 段だけ', () => {
    const prev = {
      level: 1,
      dueOn: T,
      streak: 1,
      lapses: 0,
      lastOn: '2026-10-03',
      introducedOn: '2026-10-02',
    };
    const once = review(prev, true, T, 'standard');
    const twice = review(once, true, T, 'standard');
    expect(twice.level).toBe(2);
  });

  it('次にいつ出るかを言う', () => {
    expect(dueLabel('2026-10-07', T)).toBe('明日');
    expect(dueLabel('2026-10-09', T)).toBe('3 日後');
    expect(dueLabel('2026-10-04', T)).toBe('2 日遅れ');
  });
});

describe('レーン', () => {
  const T = '2026-10-06';
  it('未着手 → 読んだ → 解いた → 落とした → 定着', () => {
    let d = emptyProgress();
    expect(laneOf(d, 'a')).toBe('untouched');
    d = markRead(d, ['a'], T);
    expect(laneOf(d, 'a')).toBe('read');
    d = recordAnswer(d, 'p1', ['a'], true, new Date(), T).data;
    expect(laneOf(d, 'a')).toBe('solved');
    d = recordAnswer(d, 'p1', ['a'], false, new Date(), T).data;
    expect(laneOf(d, 'a')).toBe('dropped');
    d.items.a = { ...d.items.a, level: 5, streak: 5 };
    expect(laneOf(d, 'a')).toBe('mature');
    expect(laneOf(d, 'a', false)).toBe('outside');
  });

  it('答えると、紐づく項目すべての遷移が返る', () => {
    const r = recordAnswer(emptyProgress(), 'p1', ['a', 'b'], false, new Date(), T);
    expect(r.transitions.map((t) => [t.itemId, t.fromLane, t.toLane])).toEqual([
      ['a', 'untouched', 'dropped'],
      ['b', 'untouched', 'dropped'],
    ]);
    expect(r.data.problems.p1).toMatchObject({ attempts: 1, solved: false });
  });
});

describe('節を読んだ', () => {
  const T = '2026-10-06';
  it('項目を持たない節も、節そのものを読んだにできる', () => {
    const d = markRead(emptyProgress(), [], T, 'map-exam');
    expect(sectionRead(d, { id: 'map-exam', items: [] })).toBe(true);
    expect(sectionRead(d, { id: 'map-howto', items: [] })).toBe(false);
  });
  it('項目をすべて読んだ・解いた節は、節を押していなくても読んだ', () => {
    const d = markRead(emptyProgress(), ['a', 'b'], T);
    expect(sectionRead(d, { id: 's', items: ['a', 'b'] })).toBe(true);
    expect(sectionRead(d, { id: 's', items: ['a', 'c'] })).toBe(false);
  });
  it('古い保存データ（節の記録が無い）も空として読める', () => {
    expect(normalize({ version: 1, read: { a: T } }).sections).toEqual({});
  });
});

describe('今日やる分', () => {
  const T = '2026-10-06';
  const order = ['a', 'b', 'c'];
  const askable = new Set(order);

  it('何も始めていなければ、最初の項目を新しく出す', () => {
    expect(todayPlan(emptyProgress(), T, order, askable)).toMatchObject({
      overdue: [],
      due: [],
      fresh: 'a',
    });
  });

  it('期限切れは古い順。導入ペースが来ていなければ新規は出さず、次に出る日を言う', () => {
    const d = emptyProgress();
    d.items.a = {
      level: 1,
      dueOn: '2026-10-04',
      streak: 1,
      lapses: 0,
      lastOn: '2026-10-01',
      introducedOn: '2026-10-01',
    };
    d.items.b = {
      level: 1,
      dueOn: '2026-10-02',
      streak: 1,
      lapses: 0,
      lastOn: '2026-10-01',
      introducedOn: T,
    };
    const p = todayPlan(d, T, order, askable);
    expect(p.overdue).toEqual(['b', 'a']);
    expect(p.fresh).toBeNull();
    expect(p.nextOn).toBe('2026-10-09'); // 導入から 3 日後
  });

  it('問題が無い項目は出さない', () => {
    expect(todayPlan(emptyProgress(), T, order, new Set(['c'])).fresh).toBe('c');
  });
});

describe('試験日からの逆算', () => {
  it('導入期限までに始められない項目の数を出す', () => {
    const d = emptyProgress();
    d.settings = { examDate: '2027-04-24', mode: 'standard', paceDays: 3 };
    const items = Array.from({ length: 38 }, (_, i) => `i${i}`);
    const s = planStatus(d, '2026-10-06', items)!;
    expect(s.daysLeft).toBe(200);
    expect(s.deadlineIn).toBe(60);
    expect(s.daysNeeded).toBe(114);
    expect(s.short).toBe(38 - 21);
  });

  it('試験日が無ければ逆算しない', () => {
    expect(planStatus(emptyProgress(), '2026-10-06', ['a'])).toBeNull();
  });
});

describe('読み込み', () => {
  it('壊れたデータや違う版は空から始める', () => {
    expect(normalize(null)).toEqual(emptyProgress());
    expect(normalize({ version: 99 })).toEqual(emptyProgress());
  });
  it('設定の欠けは既定値で埋める', () => {
    expect(normalize({ version: 1, settings: { paceDays: 1 } }).settings).toEqual({
      examDate: null,
      mode: 'standard',
      paceDays: 1,
    });
  });
});
