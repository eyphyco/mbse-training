/**
 * 進捗（DESIGN.md §8.4）。このブラウザの localStorage にだけ置く。サーバへは送らない。
 *
 * 持ち主は「項目」。問題は項目を測る道具で、定着度は項目ごとに付く（EXAM.md §2）。
 * 1 問は複数の項目にまたがるので、1 回答えると紐づく項目すべてが動く。
 */
import { MATURE, P90_DAYS, addDays, daysBetween, review } from './srs';
import type { IntervalMode, ItemState } from './srs';

export interface ProblemRecord {
  attempts: number;
  solved: boolean;
  lastOn: string;
  lastCorrect: boolean;
}

export interface HistoryEntry {
  problemId: string;
  items: string[];
  /** ISO 時刻 */
  at: string;
  correct: boolean;
}

export interface ExamRecord {
  at: string;
  examId: string;
  score: number;
  total: number;
  /** 領域 id → 正答率 */
  byArea: Record<string, { correct: number; total: number }>;
  /** 時間切れで終わったか */
  timedOut: boolean;
  seconds: number;
}

export interface Memo {
  at: string;
  text: string;
}

export interface Settings {
  /** 試験日（JST の暦日）。未設定なら逆算を出さない */
  examDate: string | null;
  mode: IntervalMode;
  /** 何日に 1 項目を新しく始めるか（EXAM.md §2.4: 1 年なら 3、半年なら 1） */
  paceDays: number;
}

export interface ProgressData {
  version: 1;
  items: Record<string, ItemState>;
  /** 教材を読んだ日。項目 id → 暦日 */
  read: Record<string, string>;
  /**
   * 教材の節を読んだ日。節 id → 暦日。
   * 項目を持たない節（章 0 の「試験の構造」など）は read に記録する先が無く、
   * 「読んだ」を付けられなかった。節そのものの記録を別に持つ（版は 1 のまま。無ければ空で読む）
   */
  sections: Record<string, string>;
  problems: Record<string, ProblemRecord>;
  history: HistoryEntry[];
  exams: ExamRecord[];
  memos: Record<string, Memo[]>;
  settings: Settings;
}

export const STORAGE_KEY = 'mbse-training:progress';
/** 履歴は直近だけ持つ。localStorage の上限（約 5MB）に届かせない */
export const HISTORY_LIMIT = 2000;

export function emptyProgress(): ProgressData {
  return {
    version: 1,
    items: {},
    read: {},
    sections: {},
    problems: {},
    history: [],
    exams: [],
    memos: {},
    settings: { examDate: null, mode: 'standard', paceDays: 3 },
  };
}

/** 読み込んだものを今の形に揃える。壊れていたら空から始める（学習は止めない） */
export function normalize(raw: unknown): ProgressData {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return base;
  const r = raw as Partial<ProgressData>;
  return {
    version: 1,
    items: r.items ?? {},
    read: r.read ?? {},
    sections: r.sections ?? {},
    problems: r.problems ?? {},
    history: Array.isArray(r.history) ? r.history : [],
    exams: Array.isArray(r.exams) ? r.exams : [],
    memos: r.memos ?? {},
    settings: { ...base.settings, ...(r.settings ?? {}) },
  };
}

export function loadProgress(): ProgressData {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? normalize(JSON.parse(s)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(data: ProgressData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/* --- レーン（DESIGN.md §4.2） --------------------------------------- */

export type Lane = 'dropped' | 'solved' | 'read' | 'untouched' | 'mature' | 'outside';

export function laneOf(data: ProgressData, itemId: string, inScope = true): Lane {
  if (!inScope) return 'outside';
  const st = data.items[itemId];
  if (st) {
    if (st.level >= MATURE) return 'mature';
    if (st.level === 0 && st.lapses > 0 && st.streak === 0) return 'dropped';
    return 'solved';
  }
  return data.read[itemId] ? 'read' : 'untouched';
}

/* --- 答えを記録する --------------------------------------------------- */

/** 項目 1 つがどこからどこへ動いたか。通知に出す（DESIGN.md §4.8） */
export interface Transition {
  itemId: string;
  fromLevel: number | null;
  toLevel: number;
  fromLane: Lane;
  toLane: Lane;
  dueOn: string;
  /** 出題日より前に解いたので level を上げなかった */
  early: boolean;
}

export function recordAnswer(
  data: ProgressData,
  problemId: string,
  items: string[],
  correct: boolean,
  now: Date,
  today: string,
): { data: ProgressData; transitions: Transition[] } {
  const next: ProgressData = {
    ...data,
    items: { ...data.items },
    problems: { ...data.problems },
  };
  const transitions: Transition[] = [];
  for (const itemId of items) {
    const prev = data.items[itemId];
    const st = review(prev, correct, today, data.settings.mode);
    next.items[itemId] = st;
    transitions.push({
      itemId,
      fromLevel: prev ? prev.level : null,
      toLevel: st.level,
      fromLane: laneOf(data, itemId),
      toLane: laneOf(next, itemId),
      dueOn: st.dueOn,
      early: correct && !!prev && today < prev.dueOn,
    });
  }
  const pr = data.problems[problemId];
  next.problems[problemId] = {
    attempts: (pr?.attempts ?? 0) + 1,
    solved: (pr?.solved ?? false) || correct,
    lastOn: today,
    lastCorrect: correct,
  };
  next.history = [{ problemId, items, at: now.toISOString(), correct }, ...data.history].slice(
    0,
    HISTORY_LIMIT,
  );
  return { data: next, transitions };
}

/** 教材の節を読んだ。初めて読んだ日だけ残す。節 id を渡すと節そのものも記録する */
export function markRead(
  data: ProgressData,
  itemIds: string[],
  today: string,
  sectionId?: string,
): ProgressData {
  const read = { ...data.read };
  const sections = { ...data.sections };
  let changed = false;
  for (const id of itemIds)
    if (!read[id]) {
      read[id] = today;
      changed = true;
    }
  if (sectionId && !sections[sectionId]) {
    sections[sectionId] = today;
    changed = true;
  }
  return changed ? { ...data, read, sections } : data;
}

/**
 * 節を読み終えたか。節を「読んだ」にしたか、節の項目をすべて読んだ・解いたなら読み終えた。
 * ボードで項目を読んだにした場合も、教材の節に反映されるように項目からも判定する
 */
export function sectionRead(data: ProgressData, section: { id: string; items: string[] }): boolean {
  if (data.sections[section.id]) return true;
  return section.items.length > 0 && section.items.every((it) => data.read[it] || data.items[it]);
}

/**
 * 模擬試験で落とした項目は level 0 に落とす（EXAM.md §5.3）。
 * 「点数を見るだけ」で終わらせず、翌日から出てくるようにする。
 */
export function dropItems(data: ProgressData, itemIds: string[], today: string): ProgressData {
  const items = { ...data.items };
  for (const id of itemIds) {
    const prev = items[id];
    items[id] = review(prev, false, today, data.settings.mode);
  }
  return { ...data, items };
}

/* --- 今日やる分（EXAM.md §4） ----------------------------------------- */

export interface TodayPlan {
  /** 期限切れ。古い順 */
  overdue: string[];
  /** 今日が期限 */
  due: string[];
  /** 新しく始める項目（導入ペースに従う）。無ければ null */
  fresh: string | null;
  /** 次に何かが出る日（今日やる分が 0 のときに言う） */
  nextOn: string | null;
}

/**
 * @param order   学ぶ順に並べた項目（教材の章の順）。新規はこの順で出す
 * @param askable 問題がある項目。問題が無い項目は「出せない」ので数えない
 */
export function todayPlan(
  data: ProgressData,
  today: string,
  order: string[],
  askable: ReadonlySet<string>,
): TodayPlan {
  const entries = Object.entries(data.items).filter(([id]) => askable.has(id));
  const overdue = entries
    .filter(([, s]) => s.dueOn < today)
    .sort(([, a], [, b]) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
    .map(([id]) => id);
  const due = entries.filter(([, s]) => s.dueOn === today).map(([id]) => id);

  // 導入ペース: 最後に導入した日から paceDays 経っていれば 1 つ
  const lastIntro = entries
    .map(([, s]) => s.introducedOn)
    .sort()
    .at(-1);
  const paceOk = !lastIntro || daysBetween(lastIntro, today) >= data.settings.paceDays;
  const fresh = paceOk ? (order.find((id) => askable.has(id) && !data.items[id]) ?? null) : null;

  const future = entries
    .map(([, s]) => s.dueOn)
    .filter((d) => d > today)
    .sort();
  const nextIntro = lastIntro ? addDays(lastIntro, data.settings.paceDays) : null;
  const candidates = [future[0], fresh ? null : nextIntro].filter((d): d is string => !!d);
  return { overdue, due, fresh, nextOn: candidates.sort()[0] ?? null };
}

/* --- 試験日からの逆算（EXAM.md §3） ------------------------------------ */

export interface PlanStatus {
  daysLeft: number;
  /** 新規項目の導入期限まで（試験日 − 9 割が定着する日数） */
  deadlineIn: number;
  untouched: number;
  /** 今のペースで未着手を全部始めるのに要る日数 */
  daysNeeded: number;
  /** 期限までに始められず、定着に届かない項目の数 */
  short: number;
}

export function planStatus(
  data: ProgressData,
  today: string,
  allItems: string[],
): PlanStatus | null {
  const { examDate, mode, paceDays } = data.settings;
  if (!examDate) return null;
  const daysLeft = daysBetween(today, examDate);
  const deadlineIn = daysLeft - P90_DAYS[mode];
  const untouched = allItems.filter((id) => !data.items[id]).length;
  const daysNeeded = untouched * paceDays;
  const canStart = deadlineIn < 0 ? 0 : Math.floor(deadlineIn / paceDays) + 1;
  return {
    daysLeft,
    deadlineIn,
    untouched,
    daysNeeded,
    short: Math.max(0, untouched - canStart),
  };
}
