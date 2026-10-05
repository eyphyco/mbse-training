import raw from './syllabus.json';

/**
 * 出題範囲。公式の coverage map（OMG の試験情報シート）をそのまま写したもの。
 * 階層は PDF の見た目に合わせて 領域 → 群 → 項目 の 3 段にしてある。
 *
 * **この表が「網羅」の分母**。問題はすべてどれかの項目に紐づく（DESIGN.md §3）。
 */
export interface SyllabusItem {
  id: string;
  name: string;
  /** 読む側（mu）と作る側（mbf）で同じ概念を指すものを結ぶ鍵 */
  topic: string;
}
export interface SyllabusGroup {
  id: string;
  name: string;
  weight: number;
  items: SyllabusItem[];
}
export interface SyllabusArea {
  id: string;
  name: string;
  weight: number;
  groups: SyllabusGroup[];
}
export interface Exam {
  id: string;
  name: string;
  questions: number;
  /** 日本語で受けるときの時間。英語圏は minutesNativeEnglish */
  minutes: number;
  minutesNativeEnglish: number;
  pass: number;
  passPercent: number;
  prereq: string | null;
  areas: SyllabusArea[];
}
export interface Syllabus {
  standard: string;
  source: string;
  fetchedOn: string;
  exams: Exam[];
}

export const SYLLABUS = raw as Syllabus;

export const EXAM_BY_ID = new Map(SYLLABUS.exams.map((e) => [e.id, e]));

/** 試験 1 つ分の項目を平らに並べる */
export function itemsOf(exam: Exam): SyllabusItem[] {
  return exam.areas.flatMap((a) => a.groups.flatMap((g) => g.items));
}

/** 全試験の項目。学習計画の分母はこれ */
export const ALL_ITEMS: SyllabusItem[] = SYLLABUS.exams.flatMap(itemsOf);

/** 項目 id → どの試験・領域・群に属するか */
export const ITEM_INDEX = new Map(
  SYLLABUS.exams.flatMap((exam) =>
    exam.areas.flatMap((area) =>
      area.groups.flatMap((group) =>
        group.items.map((item) => [item.id, { exam, area, group, item }] as const),
      ),
    ),
  ),
);
