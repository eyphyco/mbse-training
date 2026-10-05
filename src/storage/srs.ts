/**
 * 定着度と次回出題日（EXAM.md §2）。すべて純粋関数。
 *
 * 日付は「JST の暦日」の文字列（`2026-10-06`）で持つ。時刻で持つと、
 * 23:59 に解いた問題と 00:01 に解いた問題で「明日」がずれる。
 * 端末の時間帯にも依らせない（海外で開いても日本の暦で数える。試験は日本で受ける）。
 */

/** 間隔（日）。index = 答えた後の level。最後の値は 5 以降に使い回す。scripts/plan.mjs と同じ */
export const INTERVALS = {
  standard: [1, 3, 7, 16, 35, 90],
  compact: [1, 2, 4, 8, 16, 40],
} as const;
export type IntervalMode = keyof typeof INTERVALS;

/** 定着とみなす level（EXAM.md §2.1） */
export const MATURE = 5;
export const MAX_LEVEL = 5;

/** 9 割の項目が導入から定着するまでの日数（EXAM.md §2.3 で回した値）。導入期限に使う */
export const P90_DAYS: Record<IntervalMode, number> = { standard: 140, compact: 70 };

export interface ItemState {
  /** 0〜5 */
  level: number;
  /** 次に出る日（JST の暦日） */
  dueOn: string;
  /** 連続正解 */
  streak: number;
  /** 落とした回数（弱点の指標） */
  lapses: number;
  /** 最後に答えた日。同じ日に何度解いても 1 段しか上がらないようにする */
  lastOn: string;
  /** 初めて解いた日 */
  introducedOn: string;
}

const JST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** その瞬間の JST の暦日 */
export function dayOf(at: Date | number): string {
  return JST.format(typeof at === 'number' ? new Date(at) : at);
}

/** 暦日に日数を足す。UTC の正午で計算して夏時間・時間帯の端を踏まない */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d, 12) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** b − a（日） */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

export function gapOf(level: number, mode: IntervalMode): number {
  const g = INTERVALS[mode];
  return g[Math.min(level, g.length - 1)];
}

/**
 * 1 回答えた結果で定着度を進める。
 *
 * - **間違えたら level 0**、次は明日。1 段下げにしない（半端に残すと「分かった気」で試験を迎える）
 * - 正解でも、**出題日より前**に解いたものは上げない（先回りで解けば間隔を飛ばせてしまう）。
 *   次の出題日も動かさない
 * - 同じ日に 2 回正解しても 1 段だけ（上の規則から自然にそうなる。出題日が明日以降へ動くため）
 */
export function review(
  prev: ItemState | undefined,
  correct: boolean,
  today: string,
  mode: IntervalMode,
): ItemState {
  const base: ItemState = prev ?? {
    level: 0,
    dueOn: today,
    streak: 0,
    lapses: 0,
    lastOn: today,
    introducedOn: today,
  };
  if (!correct) {
    return {
      ...base,
      level: 0,
      streak: 0,
      lapses: base.lapses + 1,
      dueOn: addDays(today, gapOf(0, mode)),
      lastOn: today,
    };
  }
  if (prev && today < prev.dueOn) {
    return { ...prev, streak: prev.streak + 1, lastOn: today };
  }
  // 初めて解いた日は導入日。level 0 のまま明日もう一度出す（plan.mjs の導入と同じ）
  const level = prev ? Math.min(MAX_LEVEL, prev.level + 1) : 0;
  return {
    ...base,
    level,
    streak: base.streak + 1,
    dueOn: addDays(today, gapOf(level, mode)),
    lastOn: today,
  };
}

/** 「次は〜」の言い方（DESIGN.md §4.5。違反ではなく次にいつ出るかを言う） */
export function dueLabel(dueOn: string, today: string): string {
  const d = daysBetween(today, dueOn);
  if (d < 0) return `${-d} 日遅れ`;
  if (d === 0) return '今日';
  if (d === 1) return '明日';
  if (d === 2) return 'あさって';
  return `${d} 日後`;
}
