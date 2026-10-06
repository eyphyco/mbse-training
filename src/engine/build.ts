/**
 * 組み立て問題（build_fragment）の操作と採点。純粋関数（DESIGN.md §9）。
 *
 * 採点は**モデルの照合**で、図の見た目（座標）は見ない。id も見ない（利用者が置いた要素の id は
 * u1, u2 … で、正解の id とは違う）。要素は「種類 + 名前」、関係は「種類 + 両端の名前 + 欄」で突き合わせる。
 * 名前は前後の空白と大文字小文字を無視する（`Engine` と `engine ` の違いで落とさない。
 * 問うているのは名前の綴りではなく、どの要素をどの関係で結ぶか）。
 *
 * 正解のモデルが持っていない欄は「どちらでもよい」として比べない。
 * 例: 正解の関連に多重度が無ければ、利用者が 1 と書いても誤りにしない。
 */
import { KIND_LABEL, RELATION_LABEL, allPorts, flattenSteps, usageText } from '../diagram/model.ts';
import type { Element, MessageStep, Model, Relation } from '../diagram/model.ts';
import type { ElementTool, EndKind, Field, RelationTool } from '../diagram/palette.ts';

export type Values = Partial<Record<Field, string>>;

const norm = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const blank = (s?: string) => (s && s.trim() ? s.trim() : undefined);

/** 利用者が置いたものの id。土台の id と重ならないよう u の連番 */
function nextId(model: Model): string {
  const used = new Set([
    ...model.elements.map((e) => e.id),
    ...model.relations.map((r) => r.id),
    ...flattenSteps(model.steps).map((s) => s.id),
    ...allPorts(model).map((p) => p.port.id),
  ]);
  let n = 1;
  while (used.has(`u${n}`)) n += 1;
  return `u${n}`;
}

/** 要素を置く。欄が足りなければ理由を返す（置かない） */
export function addElement(
  model: Model,
  tool: ElementTool,
  v: Values,
): { model: Model } | { error: string } {
  const nameless = !tool.fields.includes('name');
  if (!nameless && !blank(v.name) && !(tool.fields.includes('type') && blank(v.type)))
    return { error: '名前を入れてください' };
  if (tool.kind === 'requirement' && (!blank(v.reqId) || !blank(v.text)))
    return { error: '要求には id と text を入れてください' };
  const el: Element = { id: nextId(model), kind: tool.kind, name: blank(v.name) ?? '' };
  if (blank(v.type)) el.type = blank(v.type);
  if (blank(v.mult)) el.mult = blank(v.mult);
  if (blank(v.parent)) el.parent = blank(v.parent);
  if (blank(v.reqId)) el.reqId = blank(v.reqId);
  if (blank(v.text)) el.text = blank(v.text);
  if (blank(v.entry)) el.entry = blank(v.entry);
  if (blank(v.doActivity)) el.doActivity = blank(v.doActivity);
  if (blank(v.exit)) el.exit = blank(v.exit);
  return { model: { ...model, elements: [...model.elements, el] } };
}

/** 関係（sd ならメッセージ）を引く */
export function addRelation(
  model: Model,
  tool: RelationTool,
  source: string,
  target: string,
  v: Values,
): { model: Model } | { error: string } {
  if (!source || !target) return { error: '元と先を選んでください' };
  const id = nextId(model);
  if (tool.kind === 'message') {
    if (!blank(v.label)) return { error: 'メッセージの名前を入れてください' };
    const step: MessageStep = {
      kind: 'message',
      id,
      sort: tool.sort ?? 'sync',
      from: source,
      to: target,
      label: blank(v.label)!,
    };
    return { model: { ...model, steps: [...(model.steps ?? []), step] } };
  }
  const r: Relation = { id, kind: tool.kind, source, target };
  if (tool.stereotype) r.stereotype = tool.stereotype;
  if (blank(v.targetRole)) r.targetRole = blank(v.targetRole);
  if (blank(v.targetMult)) r.targetMult = blank(v.targetMult);
  if (blank(v.guard)) r.guard = blank(v.guard)!.replace(/^\[|\]$/g, '');
  if (blank(v.trigger)) r.trigger = blank(v.trigger);
  if (blank(v.effect)) r.effect = blank(v.effect)!.replace(/^\//, '').trim();
  if (blank(v.item)) r.itemFlows = [{ item: blank(v.item)! }];
  return { model: { ...model, relations: [...model.relations, r] } };
}

/** 置いたものを外す。要素を外すと、つながる関係と中身も外す */
export function removeAdded(model: Model, id: string): Model {
  const drop = new Set([id]);
  // 入れ子の中身も外す
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of model.elements)
      if (e.parent && drop.has(e.parent) && !drop.has(e.id)) {
        drop.add(e.id);
        grew = true;
      }
  }
  const ports = new Set(
    model.elements.filter((e) => drop.has(e.id)).flatMap((e) => (e.ports ?? []).map((p) => p.id)),
  );
  const gone = (x: string) => drop.has(x) || ports.has(x);
  return {
    ...model,
    elements: model.elements.filter((e) => !drop.has(e.id)),
    relations: model.relations.filter((r) => !gone(r.id) && !gone(r.source) && !gone(r.target)),
    steps: model.steps?.filter(
      (s) => s.id !== id && !(s.kind === 'message' && (gone(s.from) || gone(s.to))),
    ),
  };
}

/** 要素の呼び名（照合と一覧の両方に使う） */
export function elementLabel(el: Element): string {
  if (el.name) return el.name;
  if (el.type) return usageText(el);
  return KIND_LABEL[el.kind];
}

/** 関係の端の候補（パレットで「置ける所にしか置けない」を実現する所） */
export function endCandidates(model: Model, kinds: EndKind[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const want = new Set(kinds);
  for (const el of model.elements)
    if (want.has(el.kind))
      out.push({ id: el.id, label: `${elementLabel(el)}（${KIND_LABEL[el.kind]}）` });
  for (const { port, owner } of allPorts(model)) {
    const k: EndKind =
      owner === null
        ? port.kind === 'param'
          ? 'frameParam'
          : 'port'
        : port.kind === 'flow' || port.kind === 'standard'
          ? 'port'
          : port.kind;
    if (want.has(k))
      out.push({
        id: port.id,
        label: owner ? `${elementLabel(owner)} の ${port.name}` : `図枠の ${port.name}`,
      });
  }
  return out;
}

/* --- 採点 ---------------------------------------------------------- */

function endName(model: Model, id: string): string {
  const el = model.elements.find((e) => e.id === id);
  if (el) return elementLabel(el);
  const p = allPorts(model).find((x) => x.port.id === id);
  if (p) return p.owner ? `${elementLabel(p.owner)}.${p.port.name}` : p.port.name;
  return id;
}

function sameElement(a: Element, aModel: Model, b: Element, bModel: Model): boolean {
  if (a.kind !== b.kind) return false;
  if (norm(elementLabel(a)) !== norm(elementLabel(b))) return false;
  if (a.type !== undefined && norm(a.type) !== norm(b.type)) return false;
  if (a.mult !== undefined && norm(a.mult) !== norm(b.mult ?? '1')) return false;
  if (a.reqId !== undefined && norm(a.reqId) !== norm(b.reqId)) return false;
  for (const k of ['entry', 'doActivity', 'exit'] as const)
    if (a[k] !== undefined && norm(a[k]) !== norm(b[k])) return false;
  const parentOf = (m: Model, e: Element) => {
    const p = e.parent ? m.elements.find((x) => x.id === e.parent) : undefined;
    return p ? norm(elementLabel(p)) : '';
  };
  return parentOf(aModel, a) === parentOf(bModel, b);
}

function sameRelation(a: Relation, aModel: Model, b: Relation, bModel: Model): boolean {
  if (a.kind !== b.kind || (a.stereotype ?? '') !== (b.stereotype ?? '')) return false;
  const as = norm(endName(aModel, a.source));
  const at = norm(endName(aModel, a.target));
  const bs = norm(endName(bModel, b.source));
  const bt = norm(endName(bModel, b.target));
  // 向きの無い線（関連・コネクタ・束縛）は両端を入れ替えても同じ
  const undirected = a.kind === 'association' || a.kind === 'connector' || a.kind === 'binding';
  if (!((as === bs && at === bt) || (undirected && as === bt && at === bs))) return false;
  for (const k of ['targetRole', 'targetMult', 'guard', 'trigger', 'effect'] as const)
    if (a[k] !== undefined && norm(a[k]) !== norm(b[k])) return false;
  const ai = a.itemFlows?.[0]?.item;
  if (ai !== undefined && norm(ai) !== norm(b.itemFlows?.[0]?.item)) return false;
  return true;
}

/** 関係を文にする（足りない・余分の一覧） */
export function relationText(model: Model, r: Relation): string {
  const what =
    r.kind === 'dependency' && r.stereotype ? `«${r.stereotype}»` : RELATION_LABEL[r.kind];
  const bits = [
    r.targetRole && `ロール名 ${r.targetRole}`,
    r.targetMult && `多重度 ${r.targetMult}`,
    r.trigger && `トリガ ${r.trigger}`,
    r.guard && `[${r.guard}]`,
    r.effect && `/ ${r.effect}`,
    r.itemFlows?.[0] && `項目フロー ${r.itemFlows[0].item}`,
  ].filter(Boolean);
  return `${endName(model, r.source)} → ${endName(model, r.target)} の${what}${bits.length ? `（${bits.join('・')}）` : ''}`;
}

function messageText(model: Model, s: MessageStep): string {
  const sort = { sync: '同期', async: '非同期', reply: '返信' }[s.sort];
  return `${endName(model, s.from)} → ${endName(model, s.to)} の${sort}メッセージ ${s.label}`;
}

export interface BuildResult {
  correct: boolean;
  /** 正解にあって、組んだものに無い */
  missing: string[];
  /** 組んだものにあって、正解に無い */
  extra: string[];
}

/** 組んだモデルを正解と突き合わせる（DESIGN.md §9: モデルグラフを多重集合で照合） */
export function judgeBuild(answer: Model, built: Model): BuildResult {
  const missing: string[] = [];
  const extra: string[] = [];

  const usedEl = new Set<string>();
  for (const a of answer.elements) {
    const hit = built.elements.find((b) => !usedEl.has(b.id) && sameElement(a, answer, b, built));
    if (hit) usedEl.add(hit.id);
    else missing.push(`${elementLabel(a)}（${KIND_LABEL[a.kind]}）`);
  }
  for (const b of built.elements)
    if (!usedEl.has(b.id)) extra.push(`${elementLabel(b)}（${KIND_LABEL[b.kind]}）`);

  const usedRel = new Set<string>();
  for (const a of answer.relations) {
    const hit = built.relations.find(
      (b) => !usedRel.has(b.id) && sameRelation(a, answer, b, built),
    );
    if (hit) usedRel.add(hit.id);
    else missing.push(relationText(answer, a));
  }
  for (const b of built.relations) if (!usedRel.has(b.id)) extra.push(relationText(built, b));

  // シーケンス図のメッセージは順序ごと比べる（順序が中身なので）
  const am = flattenSteps(answer.steps).filter((s): s is MessageStep => s.kind === 'message');
  const bm = flattenSteps(built.steps).filter((s): s is MessageStep => s.kind === 'message');
  const key = (m: Model, s: MessageStep) =>
    `${s.sort}|${norm(endName(m, s.from))}|${norm(endName(m, s.to))}|${norm(s.label)}`;
  for (let i = 0; i < Math.max(am.length, bm.length); i += 1) {
    const a = am[i];
    const b = bm[i];
    if (a && b && key(answer, a) === key(built, b)) continue;
    if (a) missing.push(`${i + 1} 本目: ${messageText(answer, a)}`);
    if (b) extra.push(`${i + 1} 本目: ${messageText(built, b)}`);
  }

  return { correct: missing.length === 0 && extra.length === 0, missing, extra };
}
