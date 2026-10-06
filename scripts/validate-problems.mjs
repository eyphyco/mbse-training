#!/usr/bin/env node
/**
 * 問題データと教材の検証。
 *
 * ここの要は「**期待するものが、自分の採点条件を満たしているか**」を見ること。
 * sql-training は全問の模範解答を実際に DuckDB で流していた。ここでは
 *   - モデル JSON が図にできるか（本物のレイアウトを Node で回す）
 *   - spot_error の「誤り」が、規則で**ぴったり**検出できるか（書き漏れも書き過ぎも落とす）
 *   - 正しい図として見せるもの（read_diagram の図・正解の選択肢の図）に誤りが無いか
 *   - 教材で、定義される前に語が使われていないか（DESIGN.md §7.2）
 * を見る。採点条件の書き間違いがその場で出る。
 *
 * Node 22.18 以降は .ts を型を剥がして直接読めるので、レンダラ・規則と別の検査器を持たない
 * （二重に持つと、検査は通るのに画面では描けない、がいずれ起きる）。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutDiagram } from '../src/diagram/diagrams.ts';
import { checkModel, flattenSteps, allPorts } from '../src/diagram/model.ts';
import { PALETTES } from '../src/diagram/palette.ts';
import { judgeBuild } from '../src/engine/build.ts';
import { RULES, findIssues, pickableRefs } from '../src/diagram/rules.ts';
import { parseLesson } from '../src/data/lessonParser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (d) =>
  existsSync(d)
    ? readdirSync(d)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => JSON.parse(readFileSync(join(d, f), 'utf8')))
    : [];

const ng = [];

/** モデルが図にできるか。描けなければ理由の列を返す */
async function drawable(model) {
  const bad = checkModel(model);
  if (bad.length > 0) return bad;
  try {
    const l = await layoutDiagram(model);
    const drawn = new Set(l.nodes.map((n) => n.id));
    const lostEl = model.elements.filter((e) => !drawn.has(e.id)).map((e) => e.id);
    if (lostEl.length > 0) return [`描かれない要素: ${lostEl.join(', ')}`];
    const edges = new Map(l.edges.map((e) => [e.id, e]));
    const want = [
      ...model.relations.map((r) => r.id),
      ...flattenSteps(model.steps)
        .filter((s) => s.kind === 'message')
        .map((s) => s.id),
    ];
    const lost = want.filter((id) => (edges.get(id)?.points.length ?? 0) < 2);
    if (lost.length > 0) return [`線が引けない関係: ${lost.join(', ')}`];
    return [];
  } catch (e) {
    return [String(e)];
  }
}

const key = (i) => `${i.at}:${i.kind}`;

/* --- 出題範囲 ------------------------------------------------------- */
const syllabus = JSON.parse(readFileSync(join(root, 'src/data/syllabus.json'), 'utf8'));
const itemIds = syllabus.exams.flatMap((e) =>
  e.areas.flatMap((a) => a.groups.flatMap((g) => g.items.map((i) => i.id))),
);
const knownItems = new Set(itemIds);

/* --- 記法見本 ------------------------------------------------------- */
const notation = readJson(join(root, 'src/data/notation'));
const notationSeen = new Set();
for (const s of notation) {
  if (notationSeen.has(s.id)) ng.push(`記法見本 ${s.id}: id が重複している`);
  notationSeen.add(s.id);
  for (const id of s.items ?? [])
    if (!knownItems.has(id)) ng.push(`記法見本 ${s.id}: 知らない項目「${id}」`);
  for (const m of await drawable(s.model)) ng.push(`記法見本 ${s.id}: ${m}`);
  for (const i of findIssues(s.model)) ng.push(`記法見本 ${s.id}: 見本の図に誤りがある ${key(i)}`);
}
const notationIds = new Set(notation.map((s) => s.id));

/* --- 問題 ----------------------------------------------------------- */
const TYPES = new Set([
  'read_diagram',
  'spot_error',
  'choose_construct',
  'build_fragment',
  'written',
]);
const problems = readJson(join(root, 'src/data/problems'));
const seen = new Set();
for (const p of problems) {
  const at = p.id ?? '(id なし)';
  if (!p.id) ng.push('id が無い問題がある');
  else if (seen.has(p.id)) ng.push(`${at}: id が重複している`);
  else seen.add(p.id);
  if (!TYPES.has(p.type)) ng.push(`${at}: 知らない type「${p.type}」`);
  if (!Array.isArray(p.items) || p.items.length === 0)
    ng.push(`${at}: items（出題範囲の項目）が無い`);
  for (const id of p.items ?? []) if (!knownItems.has(id)) ng.push(`${at}: 知らない項目「${id}」`);
  if (![1, 2, 3].includes(p.level)) ng.push(`${at}: level は 1〜3`);
  if (!p.title) ng.push(`${at}: title が無い`);
  if (!p.prompt_md) ng.push(`${at}: prompt_md が無い`);
  if (!p.explanation_md) ng.push(`${at}: explanation_md が無い`);

  if (p.type === 'read_diagram' || p.type === 'choose_construct') {
    const ids = new Set((p.choices ?? []).map((c) => c.id));
    if (ids.size < 2) ng.push(`${at}: 選択肢が 2 つ未満`);
    if (!(p.answer?.length > 0)) ng.push(`${at}: answer が無い`);
    for (const a of p.answer ?? []) if (!ids.has(a)) ng.push(`${at}: answer「${a}」が選択肢に無い`);
    for (const c of p.choices ?? []) {
      if (!c.model) continue;
      for (const m of await drawable(c.model)) ng.push(`${at} 選択肢 ${c.id}: ${m}`);
      // 正解の図に誤りがあってはならない（誤りの図を正解として覚えさせることになる）
      if (p.answer?.includes(c.id))
        for (const i of findIssues(c.model)) ng.push(`${at}: 正解の図 ${c.id} に誤り ${key(i)}`);
    }
  }
  if (p.type === 'read_diagram' && !p.model) ng.push(`${at}: read_diagram に図（model）が無い`);
  if (p.type === 'written' && !p.model_answer_md) ng.push(`${at}: written に模範解答が無い`);

  /*
    組み立て問題。正解の図が「土台 + パレットで置けるもの」だけで作れることを確かめる。
    作れない正解を出すと、利用者はどう組んでも正解にならない
  */
  if (p.type === 'build_fragment') {
    const base = p.model;
    const ans = p.answer_model;
    if (!base || !ans) ng.push(`${at}: build_fragment に model（土台）か answer_model が無い`);
    else {
      for (const m of await drawable(ans)) ng.push(`${at} 正解の図: ${m}`);
      for (const i of findIssues(ans)) ng.push(`${at}: 正解の図に誤り ${key(i)}`);
      if (ans.type !== base.type) ng.push(`${at}: 土台と正解の図種が違う`);
      // 土台を正解と照合して「余分」が出たら、土台が正解に含まれていない
      const r0 = judgeBuild(ans, base);
      if (r0.extra.length > 0) ng.push(`${at}: 土台にあって正解に無いもの ${r0.extra.join(' / ')}`);
      if (r0.missing.length === 0) ng.push(`${at}: 土台がすでに正解（足すものが無い）`);
      const pal = PALETTES[ans.type];
      const baseIds = new Set([
        ...base.elements.map((e) => e.id),
        ...base.relations.map((r) => r.id),
        ...flattenSteps(base.steps).map((s) => s.id),
      ]);
      const kindOf = (id) => {
        const el = ans.elements.find((e) => e.id === id);
        if (el) return el.kind;
        const pt = allPorts(ans).find((x) => x.port.id === id);
        if (!pt) return undefined;
        if (pt.owner === null) return pt.port.kind === 'param' ? 'frameParam' : 'port';
        return pt.port.kind === 'flow' || pt.port.kind === 'standard' ? 'port' : pt.port.kind;
      };
      for (const el of ans.elements) {
        if (baseIds.has(el.id)) continue;
        const tool = pal.elements.find((t) => t.kind === el.kind);
        if (!tool) ng.push(`${at}: パレットに無い要素「${el.kind}」を置かせている`);
        else if (el.parent && !tool.fields.includes('parent'))
          ng.push(`${at}: ${el.id} の置き場所（parent）をパレットで選べない`);
        if ((el.ports ?? []).length > 0)
          ng.push(`${at}: ${el.id} はポートを持つ（ポートはパレットで置けない。土台に入れる）`);
        // 名前は問題文に書いておく（綴りを当てさせる問題にしない）
        if (el.name && !p.prompt_md.includes(el.name))
          ng.push(`${at}: 置かせる要素の名前「${el.name}」が問題文に無い`);
      }
      for (const r of ans.relations) {
        if (baseIds.has(r.id)) continue;
        const tool = pal.relations.find(
          (t) => t.kind === r.kind && (t.stereotype ?? '') === (r.stereotype ?? ''),
        );
        if (!tool) {
          ng.push(
            `${at}: パレットに無い関係「${r.kind}${r.stereotype ? `:${r.stereotype}` : ''}」を引かせている`,
          );
          continue;
        }
        if (!tool.from.includes(kindOf(r.source)) || !tool.to.includes(kindOf(r.target)))
          ng.push(
            `${at}: ${r.id} の元・先（${kindOf(r.source)} → ${kindOf(r.target)}）をパレットで選べない`,
          );
      }
      for (const s of flattenSteps(ans.steps)) {
        if (baseIds.has(s.id)) continue;
        if (s.kind !== 'message') ng.push(`${at}: ${s.id}（${s.kind}）はパレットで置けない`);
      }
    }
  }
  if (p.type === 'spot_error' && !(p.errors?.length > 0))
    ng.push(`${at}: spot_error に errors が無い`);

  if (p.model && p.type !== 'build_fragment') {
    for (const m of await drawable(p.model)) ng.push(`${at}: ${m}`);
    const found = findIssues(p.model).map(key).sort();
    if (p.type === 'spot_error') {
      const refs = new Set(pickableRefs(p.model));
      for (const e of p.errors ?? []) {
        if (!refs.has(e.at)) ng.push(`${at}: errors の at「${e.at}」がモデルの中に無い`);
        if (!RULES[e.kind]) ng.push(`${at}: 知らない誤りの種類「${e.kind}」`);
        if (!e.why) ng.push(`${at}: errors の why が無い`);
      }
      const declared = (p.errors ?? []).map(key).sort();
      const missing = declared.filter((d) => !found.includes(d));
      const extra = found.filter((f) => !declared.includes(f));
      if (missing.length > 0) ng.push(`${at}: 規則で検出できない誤り ${missing.join(', ')}`);
      if (extra.length > 0) ng.push(`${at}: 書いていない誤りが図に残っている ${extra.join(', ')}`);
    } else if (found.length > 0) {
      ng.push(`${at}: 正しい図として見せる図に誤りがある ${found.join(', ')}`);
    }
  }
}

/* --- 教材 ----------------------------------------------------------- */
const lessonDir = join(root, 'src/data/lessons');
const lessons = readdirSync(lessonDir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .flatMap((f) => {
    try {
      return [parseLesson(readFileSync(join(lessonDir, f), 'utf8'), f)];
    } catch (e) {
      ng.push(String(e.message ?? e));
      return [];
    }
  })
  .sort((a, b) => a.no - b.no);

const sectionOf = new Map();
const sectionIds = new Set();
for (const l of lessons)
  for (const s of l.sections) {
    if (sectionIds.has(s.id)) ng.push(`教材: 節 id「${s.id}」が重複している`);
    sectionIds.add(s.id);
    for (const id of s.items) {
      if (!knownItems.has(id)) ng.push(`教材 ${s.id}: 知らない項目「${id}」`);
      if (sectionOf.has(id))
        ng.push(`教材: 項目「${id}」が 2 つの節（${sectionOf.get(id)} と ${s.id}）にある`);
      sectionOf.set(id, s.id);
    }
    for (const f of s.figures ?? [])
      if (!notationIds.has(f)) ng.push(`教材 ${s.id}: 記法見本「${f}」が無い`);
  }
for (const id of itemIds) if (!sectionOf.has(id)) ng.push(`教材: 項目「${id}」を扱う節が無い`);

/*
  用語の先出し（DESIGN.md §7.2）。語が定義される節より**前の節の本文**に出ていたら落とす。
  章 0（地図）は除く。地図は「何も覚えさせずに全体を見せる」章で、
  後の章で定義する語の名前を先に並べるのが役目だから。
  1〜2 文字の語（「図」「状態」）は一般の語と見分けられないので見ない。
*/
const terms = new Map();
for (const l of lessons)
  for (const s of l.sections)
    for (const t of s.terms ?? []) {
      if (terms.has(t.term)) ng.push(`教材: 用語「${t.term}」が 2 か所で定義されている`);
      terms.set(t.term, { lesson: l.no, section: s.id });
      if (!t.def) ng.push(`教材 ${s.id}: 用語「${t.term}」に説明が無い`);
    }
const order = lessons.flatMap((l) => l.sections.map((s) => ({ l, s })));
for (const [term, where] of terms) {
  if (term.length < 3) continue;
  for (const { l, s } of order) {
    if (s.id === where.section) break;
    if (l.no === 0) continue;
    if (s.body_md.includes(term)) {
      ng.push(`教材 ${s.id}: 「${term}」が定義（${where.section}）より先に出ている`);
      break;
    }
  }
}

console.log(
  `問題 ${problems.length} 問 / 教材 ${lessons.length} 章 ${sectionIds.size} 節 / 用語 ${terms.size} 語 / 記法見本 ${notation.length} 枚`,
);
for (const m of ng) console.log(`  NG  ${m}`);
console.log(ng.length === 0 ? '検証 OK' : `\n${ng.length} 件`);
process.exit(ng.length === 0 ? 0 : 1);
