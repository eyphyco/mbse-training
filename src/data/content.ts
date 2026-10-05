import { parseLesson } from './lessonParser';
import type { Lesson, LessonSection, Problem } from './types';
import { ALL_ITEMS, ITEM_INDEX } from './syllabus';

/**
 * 教材と問題をまとめて読む所。画面はここからだけ引く。
 *
 * 教材は Markdown（src/data/lessons/*.md）を Vite の ?raw で文字列として取り込み、
 * lessonParser で読む。Node 側（validate・coverage）も同じパーサを使う。
 */
const lessonFiles = import.meta.glob('./lessons/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const LESSONS: Lesson[] = Object.entries(lessonFiles)
  .map(([file, src]) => parseLesson(src, file))
  .sort((a, b) => a.no - b.no);

const problemFiles = import.meta.glob('./problems/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, Problem[]>;

export const PROBLEMS: Problem[] = Object.values(problemFiles).flat();
export const PROBLEM_BY_ID = new Map(PROBLEMS.map((p) => [p.id, p]));

/** 項目 → その項目を扱う節（と章） */
export const SECTION_BY_ITEM = new Map<string, { lesson: Lesson; section: LessonSection }>(
  LESSONS.flatMap((lesson) =>
    lesson.sections.flatMap((section) =>
      section.items.map((id) => [id, { lesson, section }] as const),
    ),
  ),
);

/** 学ぶ順（教材の章・節の順）に並べた項目。新規の導入はこの順で出す */
export const ITEM_ORDER: string[] = LESSONS.flatMap((l) => l.sections.flatMap((s) => s.items));

/** 項目 → 紐づく問題（Lv の順） */
export const PROBLEMS_BY_ITEM = new Map<string, Problem[]>(
  ALL_ITEMS.map((i) => [
    i.id,
    PROBLEMS.filter((p) => p.items.includes(i.id)).sort((a, b) => a.level - b.level),
  ]),
);

/** 問題がある項目（今日やる分に出せるもの） */
export const ASKABLE = new Set(
  ALL_ITEMS.filter((i) => PROBLEMS_BY_ITEM.get(i.id)!.length > 0).map((i) => i.id),
);

/** 節 → その節で解く問題（節の項目に紐づく問題） */
export function problemsOfSection(section: LessonSection): Problem[] {
  const ids = new Set(section.items);
  return PROBLEMS.filter((p) => ids.has(p.items[0])).sort((a, b) => a.level - b.level);
}

export function itemName(id: string): string {
  return ITEM_INDEX.get(id)?.item.name ?? id;
}

/** 用語集（DESIGN.md §7.2。教材の初出から自動で作る。手で二重管理しない） */
export interface GlossaryEntry {
  term: string;
  reading?: string;
  def: string;
  lesson: Lesson;
  section: LessonSection;
}
export const GLOSSARY: GlossaryEntry[] = LESSONS.flatMap((lesson) =>
  lesson.sections.flatMap((section) =>
    (section.terms ?? []).map((t) => ({ ...t, lesson, section })),
  ),
).sort((a, b) => (a.reading ?? a.term).localeCompare(b.reading ?? b.term, 'ja'));
