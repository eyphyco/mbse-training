#!/usr/bin/env node
/**
 * 問題データの検証。
 *
 * ここの要は「**期待するものが、自分の採点条件を満たしているか**」を見ること。
 * sql-training は全問の模範解答を実際に DuckDB で流していた。ここでは
 *   - モデル JSON が図にできるか
 *   - spot_error の「誤り」が、実際に妥当性規則で検出できるか
 *   - 教材で未定義語が先に出ていないか（DESIGN.md §7.2）
 * を見る。採点条件の書き間違いがその場で出る。
 *
 * 図は**本物のレイアウト**（src/diagram/bdd.ts）を Node で回して確かめる。
 * Node 22.18 以降は .ts を型を剥がして直接読めるので、レンダラと別の検査器を持たない
 * （二重に持つと、検査は通るのに画面では描けない、がいずれ起きる）。
 *
 * 規則エンジン（spot_error の誤りの検出）は DESIGN.md §13 の手順 3 で入る。
 * それまでは errors[].at がモデルの中に実在するかだけ見る。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutBdd } from '../src/diagram/bdd.ts';
import { checkModel } from '../src/diagram/model.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/data/problems');
const notationDir = join(root, 'src/data/notation');

const readAll = (d) =>
  existsSync(d)
    ? readdirSync(d)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => JSON.parse(readFileSync(join(d, f), 'utf8')))
    : [];

/** モデルが図にできるか。描けなければ理由の列を返す */
async function drawable(model) {
  const ng = checkModel(model);
  if (ng.length > 0) return ng;
  try {
    const l = await layoutBdd(model);
    if (l.nodes.length !== model.elements.length) return ['描かれない要素がある'];
    const lost = l.edges.filter((e) => e.points.length < 2).map((e) => e.id);
    if (lost.length > 0) return [`線が引けない関係: ${lost.join(', ')}`];
    return [];
  } catch (e) {
    return [String(e)];
  }
}

/** モデルの中にある id（要素・ポート・関係）。errors[].at の行き先 */
const idsOf = (model) =>
  new Set([
    ...model.elements.flatMap((e) => [e.id, ...(e.ports ?? []).map((p) => p.id)]),
    ...model.relations.map((r) => r.id),
  ]);

const ng = [];

// 記法見本。問題ではないが、図にできることは同じく保証する
const notation = readAll(notationDir);
for (const s of notation) {
  for (const m of await drawable(s.model)) ng.push(`記法見本 ${s.id}: ${m}`);
}
console.log(`記法見本 ${notation.length} 枚`);

if (!existsSync(dir)) {
  console.log('問題データはまだ無い（src/data/problems/）。');
  for (const m of ng) console.log(`  NG  ${m}`);
  process.exit(ng.length === 0 ? 0 : 1);
}

const TYPES = new Set([
  'read_diagram',
  'spot_error',
  'build_fragment',
  'choose_construct',
  'trace_match',
  'param_eval',
  'written',
]);

const problems = readAll(dir);

const seen = new Set();
for (const p of problems) {
  const at = p.id ?? '(id なし)';
  if (!p.id) ng.push('id が無い問題がある');
  else if (seen.has(p.id)) ng.push(`${at}: id が重複している`);
  else seen.add(p.id);
  if (!TYPES.has(p.type)) ng.push(`${at}: 知らない type「${p.type}」`);
  if (!Array.isArray(p.items) || p.items.length === 0)
    ng.push(`${at}: items（出題範囲の項目）が無い`);
  if (![1, 2, 3].includes(p.level)) ng.push(`${at}: level は 1〜3`);
  if (!p.prompt_md) ng.push(`${at}: prompt_md が無い`);
  if (!p.explanation_md) ng.push(`${at}: explanation_md が無い`);
  if (p.type === 'spot_error' && !(p.errors?.length > 0))
    ng.push(`${at}: spot_error に errors が無い`);
  if (p.model) {
    for (const m of await drawable(p.model)) ng.push(`${at}: ${m}`);
    const ids = idsOf(p.model);
    for (const e of p.errors ?? [])
      if (!ids.has(e.at)) ng.push(`${at}: errors の at「${e.at}」がモデルの中に無い`);
  }
}

console.log(`問題 ${problems.length} 問`);
for (const m of ng) console.log(`  NG  ${m}`);
console.log(ng.length === 0 ? '検証 OK' : `\n${ng.length} 件`);
process.exit(ng.length === 0 ? 0 : 1);
