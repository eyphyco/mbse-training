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
 * レンダラと規則エンジンが入るまでは、構造だけ見る。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/data/problems');

if (!existsSync(dir)) {
  console.log('問題データはまだ無い（src/data/problems/）。');
  process.exit(0);
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

const problems = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const ng = [];
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
}

console.log(`問題 ${problems.length} 問`);
for (const m of ng) console.log(`  NG  ${m}`);
console.log(ng.length === 0 ? '検証 OK' : `\n${ng.length} 件`);
process.exit(ng.length === 0 ? 0 : 1);
