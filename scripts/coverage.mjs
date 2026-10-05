#!/usr/bin/env node
/**
 * 出題範囲に穴が無いかを見る。
 *
 * 網羅は「気をつける」では達成できない。**穴があると落ちる**形にして
 * 初めて設計になる（DESIGN.md §3・EXAM.md §1.3）。
 *
 *   node scripts/coverage.mjs
 *
 * 落とす条件（「問題が揃った」と宣言した章の項目について）:
 *   - 問題が MIN 問未満の項目がある
 *   - その項目だけを扱う問題（専用問題）が 1 問も無い項目がある
 *   - 出題範囲に無い項目 id を指している問題がある（これは章に関わらず落とす）
 *
 * 章の札 `problemsReady: true` が「この章の項目は問題が揃っている」という宣言。
 * 図のレンダラがまだ無い章（ibd・act など）は図を使う問題を作れないので、宣言せずに置き、
 * 足りない数だけを報告する（落とさない）。宣言した章に 1 つでも穴があれば落ちる。
 *
 * 全項目を常に落とす形にしなかったのは、レンダラの順にしか問題を作れないため。
 * そうすると CI が常に赤になり、赤が「いつものこと」になって本当の穴を見逃す。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLesson } from '../src/data/lessonParser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 3; // 1 項目あたり Lv1 / Lv2 / Lv3

const syllabus = JSON.parse(readFileSync(join(root, 'src/data/syllabus.json'), 'utf8'));
const items = syllabus.exams.flatMap((e) =>
  e.areas.flatMap((a) =>
    a.groups.flatMap((g) =>
      g.items.map((i) => ({ ...i, exam: e.id, area: a.name, group: g.name })),
    ),
  ),
);
const known = new Set(items.map((i) => i.id));

const dir = join(root, 'src/data/problems');
const problems = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  : [];

const lessonDir = join(root, 'src/data/lessons');
const lessons = readdirSync(lessonDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => parseLesson(readFileSync(join(lessonDir, f), 'utf8'), f));
/** 問題が揃ったと宣言した章の項目 */
const ready = new Set(
  lessons.filter((l) => l.problemsReady).flatMap((l) => l.sections.flatMap((s) => s.items)),
);

const count = new Map(items.map((i) => [i.id, 0]));
const soleCount = new Map(items.map((i) => [i.id, 0]));
const unknown = new Set();

for (const p of problems) {
  const ids = p.items ?? [];
  for (const id of ids) {
    if (!known.has(id)) unknown.add(`${p.id} → ${id}`);
    else count.set(id, count.get(id) + 1);
  }
  // 1 項目だけを扱う問題を「専用問題」と数える
  if (ids.length === 1 && known.has(ids[0])) soleCount.set(ids[0], soleCount.get(ids[0]) + 1);
}

const allThin = items.filter((i) => count.get(i.id) < MIN);
const thin = allThin.filter((i) => ready.has(i.id));
const noSole = items.filter(
  (i) => ready.has(i.id) && count.get(i.id) >= MIN && soleCount.get(i.id) === 0,
);

console.log(`出題範囲 ${items.length} 項目 / 問題 ${problems.length} 問`);
console.log(`充足 ${items.length - allThin.length} / ${items.length} 項目（1 項目 ${MIN} 問以上）`);
console.log(
  `問題が揃ったと宣言した章: ${lessons
    .filter((l) => l.problemsReady)
    .map((l) => `第 ${l.no} 章 ${l.title}`)
    .join('、')}（${ready.size} 項目）`,
);
console.log(
  `未作成（宣言前の章）: ${allThin.length - thin.length} 項目。レンダラが入った章から揃える\n`,
);

if (thin.length > 0) {
  console.log(`宣言した章で、問題が ${MIN} 問に届かない項目 ${thin.length} 件:`);
  for (const i of thin.slice(0, 40)) {
    console.log(`  ${String(count.get(i.id)).padStart(2)} 問  [${i.exam}] ${i.id}  ${i.name}`);
  }
  if (thin.length > 40) console.log(`  … ほか ${thin.length - 40} 件`);
}
if (noSole.length > 0) {
  console.log(
    `\nその項目だけを扱う問題が無い ${noSole.length} 件（またがる問題ばかりだと薄くなる）:`,
  );
  for (const i of noSole.slice(0, 20)) console.log(`  [${i.exam}] ${i.id}  ${i.name}`);
}
if (unknown.size > 0) {
  console.log(`\n出題範囲に無い項目を指している問題 ${unknown.size} 件:`);
  for (const u of unknown) console.log(`  ${u}`);
}

const ng = thin.length + noSole.length + unknown.size;
console.log(ng === 0 ? '\n穴なし' : `\n${ng} 件の穴`);
process.exit(ng === 0 ? 0 : 1);
