/**
 * 図の読み上げ用の控え。図に**描いてあること**を文にする（正しいかどうかは言わない）。
 *
 * spot_error の図は誤りを含むので、ここで「正しくは〜」と補ってはいけない。
 * 見えている人と同じ情報だけを渡す。記号は形の名前（黒ひし形・白三角）と
 * 意味の名前（コンポジション・汎化）の両方で言う。形で問われる試験なので。
 */
import { COMPARTMENTS, KIND_STEREOTYPE, headerText, portText, propText } from './model.ts';
import type { Element, Model, Relation } from './model.ts';

const DIRECTION = { in: '入る向き', out: '出る向き', inout: '入出両方向' } as const;

function describeElement(el: Element): string {
  const stereos = [KIND_STEREOTYPE[el.kind], ...(el.stereotypes ?? [])]
    .map((s) => `«${s}»`)
    .join(' ');
  const parts = [`${stereos} ${el.name}${el.abstract ? '（抽象・名前が斜体）' : ''}`];
  for (const [k, v] of Object.entries(el.tags ?? {})) parts.push(`${k} = ${v}`);
  for (const c of COMPARTMENTS) {
    const rows = (el.props ?? []).filter((p) => p.kind === c.kind).map(propText);
    if (rows.length > 0) parts.push(`${c.title} 区画: ${rows.join('、')}`);
  }
  for (const p of el.ports ?? []) {
    const what =
      p.kind === 'flow' ? `${DIRECTION[p.direction ?? 'inout']}のフローポート` : '標準ポート';
    parts.push(`${what} ${portText(p)}`);
  }
  return parts.join('。');
}

/** 端の多重度とロール名。`Wheel 側に wheels・4` */
function endText(name: string, role?: string, mult?: string): string {
  const bits = [role, mult].filter(Boolean);
  return bits.length > 0 ? `${name} 側に ${bits.join('・')}` : '';
}

function describeRelation(r: Relation, nameOf: (id: string) => string): string {
  const s = nameOf(r.source);
  const t = nameOf(r.target);
  const ends = [endText(s, r.sourceRole, r.sourceMult), endText(t, r.targetRole, r.targetMult)]
    .filter(Boolean)
    .join('、');
  const tail = ends ? `（${ends}）` : '';
  const arrow = r.targetNavigable ? `、${t} 側に矢じり` : '';
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
      const label = r.stereotype ? `«${r.stereotype}» の` : '';
      return `${s} から ${t} へ${label}点線の矢印（依存）${tail}`;
    }
  }
}

/** 図全体を、読み上げる順の文の列にする。先頭は図枠のヘッダ */
export function describeModel(model: Model): string[] {
  const names = new Map(model.elements.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  return [
    `図枠のヘッダ: ${headerText(model.frame)}`,
    ...model.elements.map(describeElement),
    ...model.relations.map((r) => describeRelation(r, nameOf)),
  ];
}
