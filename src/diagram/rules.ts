/**
 * 図の妥当性規則。spot_error の「誤り」はここで検出できるものに限る（DESIGN.md §11）。
 *
 * 狙い: 問題に書いた誤りが**本当に誤りか**を、作者の思い込みではなく規則で確かめる。
 * validate は「規則が見つけた誤り」と「問題に書いた誤り」が**ぴったり一致する**ことを見る。
 * 書き漏れ（図に意図しない誤りが残っている）も、書き過ぎ（誤りでない所を誤りとした）も落ちる。
 *
 * 意味の誤り（「車輪は車両が消えても残るから白ひし形」）は世界の知識が要るので、規則にできない。
 * そこで**図の中の食い違い**として作る。例: parts 区画に wheels : Wheel があるのに線が白ひし形
 * （parts 区画はコンポジションの別の書き方なので、両者は一致しなければならない）。
 * 本番の誤り指摘問題も、多くはこの「同じ図の中での食い違い」で作られている。
 *
 * 解説の言葉も規則が持つ（全問で同じ言い方になる。DESIGN.md §6.6）。
 */
import type { Element, Model, Relation } from './model.ts';

export interface Issue {
  /** 指す場所。要素・関係・ポートの id、図枠のヘッダは 'frame' */
  at: string;
  kind: IssueKind;
}

export type IssueKind =
  | 'header-kind'
  | 'header-owner-type'
  | 'composite-end-mult'
  | 'part-typed-by-valuetype'
  | 'value-typed-by-block'
  | 'parts-vs-aggregation'
  | 'reference-vs-composition'
  | 'composition-reversed'
  | 'part-mult-mismatch'
  | 'role-wrong-end'
  | 'generalization-across-kinds'
  | 'valuetype-with-parts'
  | 'ports-on-valuetype'
  | 'flowspec-non-flow';

export interface RuleInfo {
  /** 取り違えの名前（解説の見出し） */
  title: string;
  /** 採点エンジンが出す解説。問題ごとの why の前に置く */
  explain: string;
}

/** 名前の付いた取り違えと、その解説（DESIGN.md §6.6） */
export const RULES: Record<IssueKind, RuleInfo> = {
  'header-kind': {
    title: '図の種類の略号が違う',
    explain:
      '図枠のヘッダの先頭は図の種類の略号です（bdd / ibd / par / pkg / req / uc / act / stm / sd）。描かれている図と略号が一致していなければなりません。',
  },
  'header-owner-type': {
    title: 'ヘッダの [ ] の型が図に合わない',
    explain:
      'bdd が表せるのは package / model / modelLibrary / block / constraintBlock のいずれかです。ヘッダの最初の [ ] にはその型を書きます。',
  },
  'composite-end-mult': {
    title: '多重度を全体の側に書いている',
    explain:
      '黒ひし形（コンポジション）の全体の側の多重度は 1 か 0..1 にしかなりません（部分を同時に 2 つ以上の全体が持つことはできない）。「何個持つか」の多重度は部分の側の端に書きます。',
  },
  'part-typed-by-valuetype': {
    title: 'パートの型が値型になっている',
    explain:
      'parts 区画に並ぶのはブロックで型付けしたもの（部品）です。«valueType» で型付けするものは values 区画に書きます。',
  },
  'value-typed-by-block': {
    title: '値属性の型がブロックになっている',
    explain:
      'values 区画の値属性は «valueType»（または Real などの基本型）で型付けします。ブロックで型付けしたいならそれはパートか参照です。',
  },
  'parts-vs-aggregation': {
    title: '白ひし形と黒ひし形の取り違え',
    explain:
      'parts 区画はコンポジション（黒ひし形）を箱の中で書いたものです。parts 区画にあるのに線が白ひし形なら食い違っています。黒は持ち物（全体が消えると部分も消える）、白は共有してよい関係です。',
  },
  'reference-vs-composition': {
    title: '参照をコンポジションで描いている',
    explain:
      'references 区画は「持たずに指すだけ」の関係で、線は矢じりだけか白ひし形で描きます。黒ひし形にすると持ち物（パート）の意味になり、区画と食い違います。',
  },
  'composition-reversed': {
    title: 'ひし形の向きが逆',
    explain:
      'ひし形は全体（持つ側）の端に付きます。parts 区画を見ると、どちらがどちらを持っているかが分かります。',
  },
  'part-mult-mismatch': {
    title: '多重度が区画と線で食い違う',
    explain:
      '同じパートを区画と線の両方で書いたなら、多重度も一致しなければなりません。区画で [ ] が無ければ多重度は 1 です。',
  },
  'role-wrong-end': {
    title: 'ロール名を全体の側に書いている',
    explain:
      'パートの名前（ロール名）は部分の側の端に書きます。全体の側に書くと「部分から見た全体の呼び名」の意味になります。',
  },
  'generalization-across-kinds': {
    title: '種類の違うものの間の汎化',
    explain:
      '汎化（白三角）は同じ種類どうし（ブロックとブロック、値型と値型）の間に引きます。ブロックが値型を特化することはできません。',
  },
  'valuetype-with-parts': {
    title: '値型が部品を持っている',
    explain:
      '«valueType» は値の型で、部品の構造を持ちません。parts 区画を持たせたいならそれはブロックです。',
  },
  'ports-on-valuetype': {
    title: '値型にポートがある',
    explain: 'ポートを持てるのはブロックです。«valueType» は値の型なので、出入口を持ちません。',
  },
  'flowspec-non-flow': {
    title: 'フロー仕様にフロー属性以外がある',
    explain:
      '«flowSpecification» が持てるのは向き（in / out / inout）の付いたフロー属性だけです（v1.2）。',
  },
};

/** v1.2 の bdd が表せる要素の型（ヘッダの最初の [ ]） */
const BDD_OWNER_TYPES = new Set(['package', 'model', 'modelLibrary', 'block', 'constraintBlock']);
/** 値属性の型として使える基本型 */
const PRIMITIVES = new Set(['Real', 'Integer', 'Boolean', 'String', 'Number', 'Complex']);

const isComposite = (m?: string) => m === undefined || m === '1' || m === '0..1';

/** 誤りを見つける。結果は at → kind の順で並べる（比較しやすいように） */
export function findIssues(model: Model): Issue[] {
  const out: Issue[] = [];
  const byName = new Map<string, Element>(model.elements.map((e) => [e.name, e]));
  const byId = new Map<string, Element>(model.elements.map((e) => [e.id, e]));
  const kindOfType = (t?: string) => (t ? byName.get(t)?.kind : undefined);

  if (model.frame.kind !== model.type) out.push({ at: 'frame', kind: 'header-kind' });
  if (model.type === 'bdd' && !BDD_OWNER_TYPES.has(model.frame.ownerType))
    out.push({ at: 'frame', kind: 'header-owner-type' });

  for (const el of model.elements) {
    const props = el.props ?? [];
    if (props.some((p) => p.kind === 'part' && kindOfType(p.type) === 'valueType'))
      out.push({ at: el.id, kind: 'part-typed-by-valuetype' });
    if (
      props.some(
        (p) =>
          p.kind === 'value' && !PRIMITIVES.has(p.type ?? '') && kindOfType(p.type) === 'block',
      )
    )
      out.push({ at: el.id, kind: 'value-typed-by-block' });
    if (el.kind === 'valueType' && props.some((p) => p.kind === 'part'))
      out.push({ at: el.id, kind: 'valuetype-with-parts' });
    if (el.kind === 'valueType' && (el.ports ?? []).length > 0)
      out.push({ at: el.id, kind: 'ports-on-valuetype' });
    if (el.kind === 'flowSpecification' && props.some((p) => p.kind !== 'flowProperty'))
      out.push({ at: el.id, kind: 'flowspec-non-flow' });
  }

  /** owner の区画に、型が target の行があるか */
  const propTo = (owner: Element | undefined, kind: string, target: Element | undefined) =>
    owner && target
      ? (owner.props ?? []).find((p) => p.kind === kind && p.type === target.name)
      : undefined;

  for (const r of model.relations) {
    const s = byId.get(r.source);
    const t = byId.get(r.target);
    if (r.kind === 'composition' && !isComposite(r.sourceMult))
      out.push({ at: r.id, kind: 'composite-end-mult' });
    if (r.kind === 'aggregation' && propTo(s, 'part', t))
      out.push({ at: r.id, kind: 'parts-vs-aggregation' });
    if (r.kind === 'composition' && propTo(s, 'reference', t))
      out.push({ at: r.id, kind: 'reference-vs-composition' });
    if (r.kind === 'composition' && propTo(t, 'part', s) && !propTo(s, 'part', t))
      out.push({ at: r.id, kind: 'composition-reversed' });
    if (r.kind === 'composition') {
      const part = propTo(s, 'part', t);
      if (part && r.targetMult !== undefined && r.targetMult !== (part.mult ?? '1'))
        out.push({ at: r.id, kind: 'part-mult-mismatch' });
      if (part && r.sourceRole === part.name && r.targetRole !== part.name)
        out.push({ at: r.id, kind: 'role-wrong-end' });
    }
    if (r.kind === 'generalization' && s && t && s.kind !== t.kind)
      out.push({ at: r.id, kind: 'generalization-across-kinds' });
  }
  return out.sort((a, b) => (a.at + a.kind < b.at + b.kind ? -1 : 1));
}

/** 指す場所の呼び名（指摘の一覧と読み上げに使う） */
export function refLabel(model: Model, ref: string): string {
  if (ref === 'frame') return '図枠のヘッダ';
  const el = model.elements.find((e) => e.id === ref);
  if (el) return `${el.name}（箱）`;
  const r: Relation | undefined = model.relations.find((x) => x.id === ref);
  if (r) {
    const n = (id: string) => model.elements.find((e) => e.id === id)?.name ?? id;
    const what: Record<Relation['kind'], string> = {
      composition: '黒ひし形の線',
      aggregation: '白ひし形の線',
      association: '関連の線',
      generalization: '汎化の線',
      dependency: '依存の線',
    };
    return `${n(r.source)} — ${n(r.target)} の${what[r.kind]}`;
  }
  for (const e of model.elements) {
    const p = (e.ports ?? []).find((x) => x.id === ref);
    if (p) return `${e.name} のポート ${p.name}`;
  }
  return ref;
}

/** 指せる場所の一覧（図をクリックできない人のための一覧にも使う） */
export function pickableRefs(model: Model): string[] {
  return [
    'frame',
    ...model.elements.flatMap((e) => [e.id, ...(e.ports ?? []).map((p) => p.id)]),
    ...model.relations.map((r) => r.id),
  ];
}
