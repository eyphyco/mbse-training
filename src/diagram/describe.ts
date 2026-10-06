/**
 * 図の読み上げ用の控え。図に**描いてあること**を文にする（正しいかどうかは言わない）。
 *
 * spot_error の図は誤りを含むので、ここで「正しくは〜」と補ってはいけない。
 * 見えている人と同じ情報だけを渡す。記号は形の名前（黒ひし形・白三角）と
 * 意味の名前（コンポジション・汎化）の両方で言う。形で問われる試験なので。
 */
import {
  COMPARTMENTS,
  KIND_LABEL,
  headerText,
  portText,
  propText,
  transitionText,
  usageText,
} from './model.ts';
import type { Element, Model, Relation, Step } from './model.ts';
import { stereotypesOf } from './shapes.ts';

const DIRECTION = { in: '入る向き', out: '出る向き', inout: '入出両方向' } as const;

function nameOf(el: Element): string {
  if (el.name || el.type) return usageText(el);
  return '';
}

function describeElement(el: Element, model: Model): string {
  const stereos = stereotypesOf(el)
    .map((s) => `«${s}»`)
    .join(' ');
  const parent = el.parent ? model.elements.find((e) => e.id === el.parent) : undefined;
  const where = parent ? `（${nameOf(parent) || KIND_LABEL[parent.kind]} の中）` : '';
  const head = [stereos, KIND_LABEL[el.kind], nameOf(el)].filter(Boolean).join(' ');
  const parts = [`${head}${el.abstract ? '（抽象・名前が斜体）' : ''}${where}`];
  for (const [k, v] of Object.entries(el.tags ?? {})) parts.push(`${k} = ${v}`);
  if (el.reqId !== undefined) parts.push(`id = "${el.reqId}"`);
  if (el.text !== undefined)
    parts.push(el.kind === 'comment' ? `本文「${el.text}」` : `text = "${el.text}"`);
  if (el.expr) parts.push(`式 {${el.expr}}`);
  if (el.entry) parts.push(`entry / ${el.entry}`);
  if (el.doActivity) parts.push(`do / ${el.doActivity}`);
  if (el.exit) parts.push(`exit / ${el.exit}`);
  for (const c of COMPARTMENTS) {
    const rows = (el.props ?? []).filter((p) => p.kind === c.kind).map(propText);
    if (rows.length > 0) parts.push(`${c.title} 区画: ${rows.join('、')}`);
  }
  if (el.allocatedFrom?.length) parts.push(`allocatedFrom 区画: ${el.allocatedFrom.join('、')}`);
  if (el.allocatedTo?.length) parts.push(`allocatedTo 区画: ${el.allocatedTo.join('、')}`);
  for (const p of el.ports ?? []) {
    const what =
      p.kind === 'flow'
        ? `${DIRECTION[p.direction ?? 'inout']}のフローポート`
        : p.kind === 'standard'
          ? '標準ポート'
          : p.kind === 'param'
            ? 'パラメータ'
            : `${p.direction === 'out' ? '出力' : '入力'}ピン`;
    parts.push(`${what} ${portText(p)}`);
  }
  return parts.join('。');
}

/** 端の多重度とロール名。`Wheel 側に wheels・4` */
function endText(name: string, role?: string, mult?: string): string {
  const bits = [role, mult].filter(Boolean);
  return bits.length > 0 ? `${name} 側に ${bits.join('・')}` : '';
}

function describeRelation(r: Relation, name: (id: string) => string): string {
  const s = name(r.source);
  const t = name(r.target);
  const ends = [endText(s, r.sourceRole, r.sourceMult), endText(t, r.targetRole, r.targetMult)]
    .filter(Boolean)
    .join('、');
  const tail = ends ? `（${ends}）` : '';
  const arrow = r.targetNavigable ? `、${t} 側に矢じり` : '';
  const label = r.name ? `名前 ${r.name}。` : '';
  switch (r.kind) {
    case 'composition':
      return `${s} 側に黒ひし形の線で ${t} とつながる（コンポジション${arrow}）${tail}`;
    case 'aggregation':
      return `${s} 側に白ひし形の線で ${t} とつながる（共有集約${arrow}）${tail}`;
    case 'association':
      return `${s} と ${t} が実線でつながる（関連${arrow}）${tail}`;
    case 'generalization':
      return `${s} から ${t} へ白三角の矢印（汎化。${t} が一般の側）`;
    case 'dependency': {
      const st = r.stereotype ? `«${r.stereotype}» の` : '';
      return `${s} から ${t} へ${st}点線の矢印（依存）${tail}`;
    }
    case 'containment':
      return `${s} 側に丸に十字の線で ${t} とつながる（包含。${s} が入れ物）`;
    case 'connector': {
      const flows = (r.itemFlows ?? [])
        .map(
          (f) => `${f.item} が ${f.reverse ? `${t} から ${s}` : `${s} から ${t}`} へ流れる黒三角`,
        )
        .join('、');
      return `${label}${s} と ${t} がコネクタ（実線）でつながる${flows ? `。項目フロー: ${flows}` : ''}`;
    }
    case 'binding':
      return `${s} と ${t} が束縛コネクタ（実線）でつながる`;
    case 'controlFlow':
      return `${s} から ${t} へ制御フロー（破線の矢印）${r.guard ? `、ガード [${r.guard}]` : ''}`;
    case 'objectFlow':
      return `${s} から ${t} へオブジェクトフロー（実線の矢印）${r.guard ? `、ガード [${r.guard}]` : ''}`;
    case 'transition': {
      const l = transitionText(r);
      return `${s} から ${t} へ遷移${l ? `、札「${l}」` : '（札なし）'}`;
    }
    case 'include':
      return `${s} から ${t} へ «include» の点線の矢印`;
    case 'extend':
      return `${s} から ${t} へ «extend» の点線の矢印${r.guard ? `、条件 [${r.guard}]` : ''}`;
    case 'anchor':
      return `${s} と ${t} が点線（アンカー）で結ばれる`;
  }
}

function describeSteps(steps: Step[], name: (id: string) => string, depth = 0): string[] {
  const pad = depth > 0 ? '　'.repeat(depth) : '';
  return steps.flatMap((s) => {
    if (s.kind === 'message') {
      const sort = {
        sync: '同期メッセージ（実線・塗った矢じり）',
        async: '非同期メッセージ（実線・開いた矢じり）',
        reply: '返信（点線・開いた矢じり）',
      }[s.sort];
      return [`${pad}${name(s.from)} から ${name(s.to)} へ${sort} ${s.label}`];
    }
    if (s.kind === 'ref')
      return [`${pad}ref の箱 ${s.name}（${s.covers.map(name).join('・')} にまたがる）`];
    return [
      `${pad}${s.operator}${s.arg ?? ''} の枠の始まり`,
      ...s.operands.flatMap((o, i) => [
        `${pad}区画 ${i + 1}${o.guard ? ` [${o.guard}]` : '（ガードなし）'}`,
        ...describeSteps(o.steps, name, depth + 1),
      ]),
      `${pad}${s.operator} の枠の終わり`,
    ];
  });
}

/** 図全体を、読み上げる順の文の列にする。先頭は図枠のヘッダ */
export function describeModel(model: Model): string[] {
  const names = new Map(model.elements.map((e) => [e.id, nameOf(e) || KIND_LABEL[e.kind]]));
  for (const e of model.elements)
    for (const p of e.ports ?? []) names.set(p.id, `${names.get(e.id)} の ${p.name}`);
  for (const p of model.framePorts ?? []) names.set(p.id, `図枠の縁の ${p.name}`);
  const name = (id: string) => names.get(id) ?? id;
  const frameParts = (model.framePorts ?? []).map(
    (p) => `図枠の縁に ${p.kind === 'param' ? 'パラメータ' : 'ポート'} ${portText(p)}`,
  );
  return [
    `図枠のヘッダ: ${headerText(model.frame)}`,
    ...frameParts,
    ...model.elements.filter((e) => e.kind !== 'region').map((e) => describeElement(e, model)),
    ...model.relations.map((r) => describeRelation(r, name)),
    ...describeSteps(model.steps ?? [], name),
  ];
}
