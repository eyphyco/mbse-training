/**
 * 図にするモデル（DESIGN.md §8.3）。**この JSON が図の入力であり、採点の照合対象でもある。**
 *
 * SysML v1.2 の要素と関係を素直に持つ。テキスト記法は定義しない（DESIGN.md §1.2）。
 *
 * このファイルは Node からも読む（scripts/validate-problems.mjs が型を剥がして import する）。
 * そのため消せる構文（型注釈・interface・type）しか使わず、import には拡張子を付ける。
 */

/** 図の種類。レンダラの選択に使う。図枠に印字する略号とは別に持つ（下の Frame.kind） */
export type DiagramType = 'bdd' | 'ibd' | 'par' | 'pkg' | 'req' | 'uc' | 'act' | 'stm' | 'sd';

/**
 * 図枠のヘッダ `bdd [package] Vehicle [Structure]`。本番の図には必ず付く。
 *
 * kind は**印字する文字列そのまま**で、DiagramType に縛らない。
 * 「略号が違う」を spot_error の誤りとして描く必要があるため（EXAM.md §6.2）。
 */
export interface Frame {
  /** 図の種類の略号（bdd / ibd / par …） */
  kind: string;
  /** 図が表すモデル要素の型（package / block / constraintBlock …） */
  ownerType: string;
  /** 図が表すモデル要素の名前 */
  owner: string;
  /** 図の名前（省略できる） */
  name?: string;
}

/**
 * 箱になる要素。
 *
 * v1.2 に合わせている。interfaceBlock・フル／プロキシポートは v1.3 からなので**入れない**
 * （v1.2 のポートはフローポートと標準ポート。syllabus の mu-ports もその 2 つ）。
 */
export type ElementKind =
  'block' | 'valueType' | 'constraintBlock' | 'flowSpecification' | 'enumeration';

/**
 * コンパートメントに並ぶ 1 行。
 * constraint だけは name に式を入れる（`F = m * a`）。描くときに `{ }` で囲む。
 */
export type PropKind =
  | 'value'
  | 'part'
  | 'reference'
  | 'operation'
  | 'constraint'
  | 'parameter'
  | 'flowProperty'
  | 'literal';

export type FlowDirection = 'in' | 'out' | 'inout';

export interface Prop {
  kind: PropKind;
  name: string;
  type?: string;
  mult?: string;
  /** 既定値（`= 1500`） */
  default?: string;
  /** operation の引数（括弧の中身をそのまま） */
  params?: string;
  /** flowProperty の向き */
  direction?: FlowDirection;
}

export type PortSide = 'north' | 'south' | 'east' | 'west';

export interface Port {
  id: string;
  name: string;
  type?: string;
  /** v1.2 のポートは 2 種類だけ */
  kind: 'flow' | 'standard';
  /** フローポートの向き。四角の中の矢印になる */
  direction?: FlowDirection;
  /** 共役（型名の前に ~ が付く） */
  conjugated?: boolean;
  /** 置く辺。省略すると in は左、それ以外は右 */
  side?: PortSide;
}

export interface Element {
  id: string;
  kind: ElementKind;
  name: string;
  /** 抽象なら名前を斜体にする */
  abstract?: boolean;
  /** 種別から決まるもの（«block» 等）に**足す**ステレオタイプ */
  stereotypes?: string[];
  /** ステレオタイプのプロパティ。名前の下に `{unit = kg}` の形で出す */
  tags?: Record<string, string>;
  props?: Prop[];
  ports?: Port[];
}

/**
 * 関係。source / target の意味は種別ごとに決めてある（取り違えると図が逆を向く）。
 *
 * | kind           | source           | target         | 記号                   |
 * | -------------- | ---------------- | -------------- | ---------------------- |
 * | composition    | 全体（黒ひし形側） | 部分           | 黒ひし形 at source     |
 * | aggregation    | 全体（白ひし形側） | 部分           | 白ひし形 at source     |
 * | association    | どちらでも         | どちらでも       | 端に矢じり（任意）     |
 * | generalization | 特化した側         | 一般の側        | 白三角 at target       |
 * | dependency     | 依存する側         | 依存される側    | 点線 + 開いた矢じり    |
 */
export type RelationKind =
  'association' | 'composition' | 'aggregation' | 'generalization' | 'dependency';

export interface Relation {
  /** spot_error の `at` がこれを指す */
  id: string;
  kind: RelationKind;
  source: string;
  target: string;
  /** 関連名・依存の名前 */
  name?: string;
  /** 依存のステレオタイプ（satisfy / allocate …）。«» は付けずに書く */
  stereotype?: string;
  sourceMult?: string;
  targetMult?: string;
  sourceRole?: string;
  targetRole?: string;
  /** target 側へ辿れる（target 端に開いた矢じりを付ける） */
  targetNavigable?: boolean;
}

export interface Model {
  type: DiagramType;
  frame: Frame;
  elements: Element[];
  relations: Relation[];
}

/* ------------------------------------------------------------------ */

/** 種別から自動で付くステレオタイプ。constraintBlock の表示は «constraint»（v1.2 の図の通り） */
export const KIND_STEREOTYPE: Record<ElementKind, string> = {
  block: 'block',
  valueType: 'valueType',
  constraintBlock: 'constraint',
  flowSpecification: 'flowSpecification',
  enumeration: 'enumeration',
};

/**
 * コンパートメントの見出しと並び順。見出しは v1.2 の図に出る英語のまま
 * （本番の図はこの綴りで出る。訳すと本番で読めない）。
 */
export const COMPARTMENTS: { kind: PropKind; title: string }[] = [
  { kind: 'part', title: 'parts' },
  { kind: 'reference', title: 'references' },
  { kind: 'value', title: 'values' },
  { kind: 'flowProperty', title: 'flowProperties' },
  { kind: 'constraint', title: 'constraints' },
  { kind: 'parameter', title: 'parameters' },
  { kind: 'operation', title: 'operations' },
  { kind: 'literal', title: 'literals' },
];

const ELEMENT_KINDS = new Set<string>(Object.keys(KIND_STEREOTYPE));
const PROP_KINDS = new Set<string>(COMPARTMENTS.map((c) => c.kind));
const RELATION_KINDS = new Set<string>([
  'association',
  'composition',
  'aggregation',
  'generalization',
  'dependency',
]);

/** 今描けるのは bdd だけ。ほかの図は DESIGN.md §13 の手順 10 以降 */
export const RENDERABLE: ReadonlySet<DiagramType> = new Set(['bdd']);

/**
 * 多重度の綴り。`1` `0..1` `*` `1..*` `2..4` を通す。
 * `[ ]` は書かない（描くときに付ける）。
 */
export function isMultiplicity(s: string): boolean {
  const m = /^(\d+|\*)(?:\.\.(\d+|\*))?$/.exec(s);
  if (!m) return false;
  const [, lo, hi] = m;
  if (hi === undefined) return true;
  if (lo === '*') return false; // `*..3` は無い
  return hi === '*' || Number(lo) <= Number(hi);
}

/**
 * **図にできるか**だけを見る。モデルとして正しいか（ひし形の向き等）は見ない。
 * spot_error は「描けるが誤っている」図を出すので、意味の誤りはここで落としてはいけない。
 *
 * 空配列なら描ける。
 */
export function checkModel(model: Model): string[] {
  const ng: string[] = [];
  if (!RENDERABLE.has(model.type)) ng.push(`図の種類「${model.type}」はまだ描けない`);
  if (!model.frame?.kind || !model.frame.ownerType || !model.frame.owner)
    ng.push('図枠のヘッダ（kind / ownerType / owner）が欠けている');

  const ids = new Set<string>();
  const claim = (id: string, what: string) => {
    if (!id) ng.push(`${what} に id が無い`);
    else if (ids.has(id)) ng.push(`id「${id}」が重複している`);
    else ids.add(id);
  };

  const elementIds = new Set<string>();
  for (const el of model.elements ?? []) {
    claim(el.id, `要素「${el.name}」`);
    elementIds.add(el.id);
    if (!ELEMENT_KINDS.has(el.kind)) ng.push(`${el.id}: 知らない要素の種類「${el.kind}」`);
    if (!el.name) ng.push(`${el.id}: 名前が無い`);
    for (const p of el.props ?? []) {
      if (!PROP_KINDS.has(p.kind)) ng.push(`${el.id}.${p.name}: 知らない行の種類「${p.kind}」`);
      if (p.mult !== undefined && !isMultiplicity(p.mult))
        ng.push(`${el.id}.${p.name}: 多重度「${p.mult}」が読めない`);
    }
    for (const port of el.ports ?? []) {
      claim(port.id, `ポート「${port.name}」`);
      if (port.kind === 'standard' && port.direction)
        ng.push(`${port.id}: 標準ポートに向きは無い（向きを持つのはフローポート）`);
    }
  }

  for (const r of model.relations ?? []) {
    claim(r.id, `関係 ${r.source} → ${r.target}`);
    if (!RELATION_KINDS.has(r.kind)) ng.push(`${r.id}: 知らない関係の種類「${r.kind}」`);
    if (!elementIds.has(r.source)) ng.push(`${r.id}: source「${r.source}」が無い`);
    if (!elementIds.has(r.target)) ng.push(`${r.id}: target「${r.target}」が無い`);
    for (const m of [r.sourceMult, r.targetMult])
      if (m !== undefined && !isMultiplicity(m)) ng.push(`${r.id}: 多重度「${m}」が読めない`);
  }
  return ng;
}

/** 図枠のヘッダの文字列。`bdd [package] Vehicle [Structure]` */
export function headerText(f: Frame): string {
  return `${f.kind} ${headerRest(f)}`;
}

/** ヘッダの略号より後ろ。`[package] Vehicle [Structure]`（略号だけ太字にするので分けて持つ） */
export function headerRest(f: Frame): string {
  return `[${f.ownerType}] ${f.owner}${f.name ? ` [${f.name}]` : ''}`;
}

/** コンパートメントの 1 行を、図に出る綴りにする */
export function propText(p: Prop): string {
  switch (p.kind) {
    case 'constraint':
      return `{${p.name}}`;
    case 'operation':
      return `${p.name}(${p.params ?? ''})${p.type ? ` : ${p.type}` : ''}`;
    case 'literal':
      return p.name;
    default: {
      const dir = p.kind === 'flowProperty' && p.direction ? `${p.direction} ` : '';
      const type = p.type ? ` : ${p.type}` : '';
      const mult = p.mult ? ` [${p.mult}]` : '';
      const def = p.default ? ` = ${p.default}` : '';
      return `${dir}${p.name}${type}${mult}${def}`;
    }
  }
}

/** ポートの横に出す名前。`fuelIn : ~FuelFlow` */
export function portText(p: Port): string {
  return p.type ? `${p.name} : ${p.conjugated ? '~' : ''}${p.type}` : p.name;
}
