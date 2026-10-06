/**
 * 図にするモデル（DESIGN.md §8.3）。**この JSON が図の入力であり、採点の照合対象でもある。**
 *
 * SysML v1.2 の要素と関係を素直に持つ。テキスト記法は定義しない（DESIGN.md §1.2）。
 *
 * 9 図種を 1 つの形で持つ（要素・関係・入れ子の親）。図種ごとに別の型にしなかったのは、
 * 割り当て（«allocate»）やコメントのように**図をまたいで同じ形で出るもの**があり、
 * 規則・読み上げ・組み立て問題の照合を 1 本で書けるようにするため。
 * どの図種にどの要素を置けるかは ALLOWED が決め、checkModel が落とす。
 *
 * このファイルは Node からも読む（scripts/validate-problems.mjs が型を剥がして import する）。
 * そのため消せる構文（型注釈・interface・type）しか使わず、import には拡張子を付ける。
 */

/** 図の種類。レンダラの選択に使う。図枠に印字する略号とは別に持つ（下の Frame.kind） */
export type DiagramType = 'bdd' | 'ibd' | 'par' | 'pkg' | 'req' | 'uc' | 'act' | 'stm' | 'sd';

export const DIAGRAM_TYPES: DiagramType[] = [
  'bdd',
  'ibd',
  'par',
  'pkg',
  'req',
  'uc',
  'act',
  'stm',
  'sd',
];

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
 * 箱になる要素。図種ごとに置けるものが違う（ALLOWED）。
 *
 * v1.2 に合わせている。interfaceBlock・フル／プロキシポートは v1.3 からなので**入れない**
 * （v1.2 のポートはフローポートと標準ポート。syllabus の mu-ports もその 2 つ）。
 */
export type ElementKind =
  // bdd（定義）
  | 'block'
  | 'valueType'
  | 'constraintBlock'
  | 'flowSpecification'
  | 'enumeration'
  // ibd / par（使用）
  | 'part'
  | 'reference'
  | 'value'
  | 'constraintProperty'
  // pkg
  | 'package'
  | 'model'
  | 'modelLibrary'
  | 'view'
  | 'viewpoint'
  // req
  | 'requirement'
  | 'testCase'
  // uc
  | 'actor'
  | 'useCase'
  | 'subject'
  // act
  | 'action'
  | 'callBehavior'
  | 'sendSignal'
  | 'acceptEvent'
  | 'acceptTime'
  | 'objectNode'
  | 'initial'
  | 'final'
  | 'flowFinal'
  | 'decision'
  | 'merge'
  | 'fork'
  | 'join'
  | 'partition'
  // stm（initial と final は act と同じ形なので共有する）
  | 'state'
  | 'region'
  | 'choice'
  // sd
  | 'lifeline'
  // どの図にも
  | 'comment';

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

/**
 * 箱の縁に載る小さな四角。
 *
 * | kind     | どこに          | 意味                                    |
 * | -------- | --------------- | --------------------------------------- |
 * | flow     | ブロック・パート | フローポート（v1.2）。中に向きの矢印     |
 * | standard | ブロック・パート | 標準ポート（v1.2）。空の四角             |
 * | param    | 制約プロパティ   | 制約パラメータ。名前は箱の内側に書く     |
 * | pin      | アクション       | ピン。名前と型は外側に書く               |
 */
export interface Port {
  id: string;
  name: string;
  type?: string;
  kind: 'flow' | 'standard' | 'param' | 'pin';
  /** フローポート・ピンの向き。フローポートは四角の中の矢印になる */
  direction?: FlowDirection;
  /** 共役（型名の前に ~ が付く） */
  conjugated?: boolean;
  /** 置く辺。省略すると in は左、それ以外は右（ピンは入りが上、出が下） */
  side?: PortSide;
}

export interface Element {
  id: string;
  kind: ElementKind;
  name: string;
  /** 使用の型（パート・値・制約プロパティ・ライフライン・呼び出し・オブジェクトノード） */
  type?: string;
  /** 使用の多重度（ibd のパート） */
  mult?: string;
  /**
   * 入れ子の親。パッケージの中身・主題の中のユースケース・パーティションの中のアクション・
   * 複合状態の中の状態・領域・パートの中のパート。親は同じモデルの要素でなければならない
   */
  parent?: string;
  /** 抽象なら名前を斜体にする */
  abstract?: boolean;
  /** 種別から決まるもの（«block» 等）に**足す**ステレオタイプ */
  stereotypes?: string[];
  /** ステレオタイプのプロパティ。名前の下に `{unit = kg}` の形で出す */
  tags?: Record<string, string>;
  props?: Prop[];
  ports?: Port[];
  /** 要求の id（`id = "R1.1"`） */
  reqId?: string;
  /** 要求の text・コメントの本文 */
  text?: string;
  /** 制約プロパティの式（`F = m * a`。描くときに { } で囲む） */
  expr?: string;
  /** 状態の振る舞い（`entry / openValve`） */
  entry?: string;
  doActivity?: string;
  exit?: string;
  /** 割り当ての区画（mu-alloc-repr）。`«activity» Drive` のように相手を書く */
  allocatedFrom?: string[];
  allocatedTo?: string[];
}

/**
 * 関係。source / target の意味は種別ごとに決めてある（取り違えると図が逆を向く）。
 *
 * | kind           | source                 | target           | 記号                        |
 * | -------------- | ---------------------- | ---------------- | --------------------------- |
 * | composition    | 全体（黒ひし形側）       | 部分             | 黒ひし形 at source          |
 * | aggregation    | 全体（白ひし形側）       | 部分             | 白ひし形 at source          |
 * | association    | どちらでも               | どちらでも        | 端に矢じり（任意）          |
 * | generalization | 特化した側               | 一般の側          | 白三角 at target            |
 * | dependency     | 依存する側（client）     | 依存される側      | 点線 + 開いた矢じり         |
 * | containment    | 入れ物（⊕ の側）         | 中身             | 丸に十字 at source          |
 * | connector      | どちらでも（ポートも可） | どちらでも        | 実線のみ                    |
 * | binding        | どちらでも（パラメータ） | どちらでも        | 実線のみ                    |
 * | controlFlow    | 前                       | 後               | 点線 + 開いた矢じり         |
 * | objectFlow     | 出す側（ピン）           | 受ける側（ピン）  | 実線 + 開いた矢じり         |
 * | transition     | 遷移元                   | 遷移先           | 実線 + 開いた矢じり         |
 * | include        | 基底のユースケース       | 含まれる側        | 点線 + 矢じり + «include»   |
 * | extend         | 拡張する側               | 基底のユースケース | 点線 + 矢じり + «extend»    |
 * | anchor         | コメント                 | 説明する要素      | 点線のみ                    |
 *
 * dependency のステレオタイプ（satisfy / verify / deriveReqt / refine / trace / copy /
 * allocate / import / access / conform）は stereotype に «» を付けずに書く。
 */
export type RelationKind =
  | 'association'
  | 'composition'
  | 'aggregation'
  | 'generalization'
  | 'dependency'
  | 'containment'
  | 'connector'
  | 'binding'
  | 'controlFlow'
  | 'objectFlow'
  | 'transition'
  | 'include'
  | 'extend'
  | 'anchor';

/** コネクタに載る項目フロー（mu-connector-itemflow）。線の途中の黒三角と `fuel : Fuel` */
export interface ItemFlow {
  /** 流れるもの（`fuel : Fuel` の形のまま） */
  item: string;
  /** true なら target → source の向きに流れる */
  reverse?: boolean;
}

export interface Relation {
  /** spot_error の `at` がこれを指す */
  id: string;
  kind: RelationKind;
  /** 要素の id。connector・binding・flow はポート（ピン・パラメータ）の id も指せる */
  source: string;
  target: string;
  /** 関連名・依存の名前・コネクタ名 */
  name?: string;
  /** 依存のステレオタイプ（satisfy / allocate …）。«» は付けずに書く */
  stereotype?: string;
  sourceMult?: string;
  targetMult?: string;
  sourceRole?: string;
  targetRole?: string;
  /** target 側へ辿れる（target 端に開いた矢じりを付ける） */
  targetNavigable?: boolean;
  itemFlows?: ItemFlow[];
  /** 遷移のトリガ（`after(5 s)` `when(t > 90)` `stop` など、書く形のまま） */
  trigger?: string;
  /** ガード（[ ] は付けずに書く）。遷移・制御フロー・オブジェクトフロー */
  guard?: string;
  /** 遷移の効果（/ の後ろ） */
  effect?: string;
}

/* --- シーケンス図の中身 -------------------------------------------- */

/**
 * シーケンス図は**順序**が中身なので、関係ではなく上から下への手順の列で持つ。
 * ライフラインは要素（kind: lifeline）として elements に置く。
 */
export type MessageSort = 'sync' | 'async' | 'reply';

export interface MessageStep {
  kind: 'message';
  id: string;
  sort: MessageSort;
  /** ライフラインの id */
  from: string;
  to: string;
  /** `start()` `ack` など、書く形のまま */
  label: string;
}

/** 相互作用参照（ref の箱）。別のシーケンス図を差し込む */
export interface RefStep {
  kind: 'ref';
  id: string;
  /** 参照する相互作用の名前 */
  name: string;
  /** 箱が覆うライフライン */
  covers: string[];
}

export type FragmentOperator =
  'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical' | 'seq' | 'strict' | 'neg';

/** 複合フラグメント（alt / opt / loop / par …）。点線で区切った区画ごとにガードを持つ */
export interface FragmentStep {
  kind: 'fragment';
  id: string;
  operator: FragmentOperator;
  /** loop の回数など、演算子の後ろに書くもの（`loop(1,3)` の `(1,3)`） */
  arg?: string;
  operands: { guard?: string; steps: Step[] }[];
}

export type Step = MessageStep | RefStep | FragmentStep;

export interface Model {
  type: DiagramType;
  frame: Frame;
  /**
   * 図枠の縁に載るもの（mu-frame）。ibd の囲みブロックのポート、
   * par の制約ブロックのパラメータ、act のアクティビティパラメータノード
   */
  framePorts?: Port[];
  elements: Element[];
  relations: Relation[];
  /** シーケンス図だけ */
  steps?: Step[];
}

/* ------------------------------------------------------------------ */

/**
 * 種別から自動で付くステレオタイプ（名前の上の «»）。無い種別は付けない。
 * constraintBlock の表示は «constraint»（v1.2 の図の通り）。
 */
export const KIND_STEREOTYPE: Partial<Record<ElementKind, string>> = {
  block: 'block',
  valueType: 'valueType',
  constraintBlock: 'constraint',
  flowSpecification: 'flowSpecification',
  enumeration: 'enumeration',
  model: 'model',
  modelLibrary: 'modelLibrary',
  view: 'view',
  viewpoint: 'viewpoint',
  requirement: 'requirement',
  testCase: 'testCase',
};

/** 要素の種類の日本語名（読み上げ・指摘の一覧・パレット） */
export const KIND_LABEL: Record<ElementKind, string> = {
  block: 'ブロック',
  valueType: '値型',
  constraintBlock: '制約ブロック',
  flowSpecification: 'フロー仕様',
  enumeration: '列挙',
  part: 'パート',
  reference: '参照プロパティ',
  value: '値属性',
  constraintProperty: '制約プロパティ',
  package: 'パッケージ',
  model: 'モデル',
  modelLibrary: 'モデルライブラリ',
  view: 'ビュー',
  viewpoint: 'ビューポイント',
  requirement: '要求',
  testCase: 'テストケース',
  actor: 'アクター',
  useCase: 'ユースケース',
  subject: '主題',
  action: 'アクション',
  callBehavior: '振る舞い呼び出しアクション',
  sendSignal: 'シグナル送信アクション',
  acceptEvent: 'イベント受理アクション',
  acceptTime: '時間イベント受理アクション',
  objectNode: 'オブジェクトノード',
  initial: '開始ノード',
  final: '終了ノード',
  flowFinal: 'フロー終了ノード',
  decision: '判断ノード',
  merge: 'マージノード',
  fork: 'フォークノード',
  join: 'ジョインノード',
  partition: 'パーティション',
  state: '状態',
  region: '領域',
  choice: '選択擬似状態',
  lifeline: 'ライフライン',
  comment: 'コメント',
};

/** 関係の日本語名 */
export const RELATION_LABEL: Record<RelationKind, string> = {
  association: '関連',
  composition: 'コンポジション（黒ひし形）',
  aggregation: '共有集約（白ひし形）',
  generalization: '汎化（白三角）',
  dependency: '依存（点線の矢印）',
  containment: '包含（丸に十字）',
  connector: 'コネクタ',
  binding: '束縛コネクタ',
  controlFlow: '制御フロー',
  objectFlow: 'オブジェクトフロー',
  transition: '遷移',
  include: '«include»',
  extend: '«extend»',
  anchor: 'アンカー',
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

/** 図種ごとに置ける要素と関係。図にできるかの検査（checkModel）と組み立てのパレットが使う */
export const ALLOWED: Record<DiagramType, { elements: ElementKind[]; relations: RelationKind[] }> =
  {
    bdd: {
      elements: [
        'block',
        'valueType',
        'constraintBlock',
        'flowSpecification',
        'enumeration',
        'actor',
        'requirement',
        'comment',
      ],
      relations: [
        'association',
        'composition',
        'aggregation',
        'generalization',
        'dependency',
        'anchor',
      ],
    },
    // block と constraintBlock は「定義を使用の図に描いた」誤りを spot_error で描くために置ける
    ibd: {
      elements: ['part', 'reference', 'value', 'actor', 'block', 'comment'],
      relations: ['connector', 'dependency', 'anchor'],
    },
    par: {
      elements: ['constraintProperty', 'value', 'part', 'constraintBlock', 'comment'],
      relations: ['binding', 'anchor'],
    },
    pkg: {
      elements: [
        'package',
        'model',
        'modelLibrary',
        'view',
        'viewpoint',
        'block',
        'valueType',
        'requirement',
        'comment',
      ],
      relations: ['containment', 'dependency', 'generalization', 'anchor'],
    },
    req: {
      elements: ['requirement', 'block', 'testCase', 'useCase', 'comment'],
      relations: ['containment', 'dependency', 'anchor'],
    },
    uc: {
      elements: ['actor', 'useCase', 'subject', 'comment'],
      relations: ['association', 'include', 'extend', 'generalization', 'anchor'],
    },
    act: {
      elements: [
        'action',
        'callBehavior',
        'sendSignal',
        'acceptEvent',
        'acceptTime',
        'objectNode',
        'initial',
        'final',
        'flowFinal',
        'decision',
        'merge',
        'fork',
        'join',
        'partition',
      ],
      relations: ['controlFlow', 'objectFlow'],
    },
    stm: {
      elements: ['state', 'region', 'initial', 'final', 'choice', 'comment'],
      relations: ['transition', 'anchor'],
    },
    sd: { elements: ['lifeline'], relations: [] },
  };

/** 今描ける図種。全 9 種（bdd 以外は DESIGN.md §13 の手順 10・11 で足した） */
export const RENDERABLE: ReadonlySet<DiagramType> = new Set(DIAGRAM_TYPES);

/** 端（ポート）を指せる関係。それ以外は要素どうしを結ぶ */
const PORT_ENDS = new Set<RelationKind>(['connector', 'binding', 'controlFlow', 'objectFlow']);

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

/** シーケンス図の手順を、入れ子も含めて平らに並べる */
export function flattenSteps(steps: Step[] = []): Step[] {
  return steps.flatMap((s) =>
    s.kind === 'fragment' ? [s, ...s.operands.flatMap((o) => flattenSteps(o.steps))] : [s],
  );
}

/** モデルの中のポート（要素のポートと図枠のポート）をすべて */
export function allPorts(model: Model): { port: Port; owner: Element | null }[] {
  return [
    ...(model.framePorts ?? []).map((port) => ({ port, owner: null })),
    ...model.elements.flatMap((el) => (el.ports ?? []).map((port) => ({ port, owner: el }))),
  ];
}

/**
 * **図にできるか**だけを見る。モデルとして正しいか（ひし形の向き等）は見ない。
 * spot_error は「描けるが誤っている」図を出すので、意味の誤りはここで落としてはいけない。
 *
 * 空配列なら描ける。
 */
export function checkModel(model: Model): string[] {
  const ng: string[] = [];
  if (!RENDERABLE.has(model.type)) {
    ng.push(`図の種類「${model.type}」は描けない`);
    return ng;
  }
  if (!model.frame?.kind || !model.frame.ownerType || !model.frame.owner)
    ng.push('図枠のヘッダ（kind / ownerType / owner）が欠けている');
  const allowed = ALLOWED[model.type];

  const ids = new Set<string>();
  const claim = (id: string, what: string) => {
    if (!id) ng.push(`${what} に id が無い`);
    else if (id === 'frame') ng.push(`id「frame」は図枠のヘッダの予約語`);
    else if (ids.has(id)) ng.push(`id「${id}」が重複している`);
    else ids.add(id);
  };

  const elementIds = new Set<string>();
  const portIds = new Set<string>();
  for (const el of model.elements ?? []) {
    claim(el.id, `要素「${el.name}」`);
    elementIds.add(el.id);
    if (!allowed.elements.includes(el.kind))
      ng.push(`${el.id}: ${model.type} に「${el.kind}」は置けない`);
    // 名前の無い形がある（開始・終了・判断・フォーク・領域・コメント）
    const nameless = [
      'initial',
      'final',
      'flowFinal',
      'decision',
      'merge',
      'fork',
      'join',
      'choice',
      'region',
      'comment',
    ];
    // `: Driver` のように型だけの使用（名前を省いた形）は描ける
    if (!el.name && !nameless.includes(el.kind) && !el.type) ng.push(`${el.id}: 名前が無い`);
    if (el.mult !== undefined && !isMultiplicity(el.mult))
      ng.push(`${el.id}: 多重度「${el.mult}」が読めない`);
    for (const p of el.props ?? []) {
      if (!COMPARTMENTS.some((c) => c.kind === p.kind))
        ng.push(`${el.id}.${p.name}: 知らない行の種類「${p.kind}」`);
      if (p.mult !== undefined && !isMultiplicity(p.mult))
        ng.push(`${el.id}.${p.name}: 多重度「${p.mult}」が読めない`);
    }
  }
  for (const { port } of allPorts(model)) {
    claim(port.id, `ポート「${port.name}」`);
    portIds.add(port.id);
    if (port.kind === 'standard' && port.direction)
      ng.push(`${port.id}: 標準ポートに向きは無い（向きを持つのはフローポート）`);
  }
  for (const el of model.elements ?? []) {
    if (el.parent === undefined) continue;
    if (!elementIds.has(el.parent)) ng.push(`${el.id}: 親「${el.parent}」が無い`);
    // 親を辿って自分に戻ったら描けない
    const seen = new Set([el.id]);
    let p: string | undefined = el.parent;
    while (p !== undefined) {
      if (seen.has(p)) {
        ng.push(`${el.id}: 入れ子が輪になっている`);
        break;
      }
      seen.add(p);
      p = model.elements.find((e) => e.id === p)?.parent;
    }
  }

  for (const r of model.relations ?? []) {
    claim(r.id, `関係 ${r.source} → ${r.target}`);
    if (!allowed.relations.includes(r.kind))
      ng.push(`${r.id}: ${model.type} に「${r.kind}」の関係は引けない`);
    const ok = (id: string) => elementIds.has(id) || (PORT_ENDS.has(r.kind) && portIds.has(id));
    if (!ok(r.source)) ng.push(`${r.id}: source「${r.source}」が無い`);
    if (!ok(r.target)) ng.push(`${r.id}: target「${r.target}」が無い`);
    for (const m of [r.sourceMult, r.targetMult])
      if (m !== undefined && !isMultiplicity(m)) ng.push(`${r.id}: 多重度「${m}」が読めない`);
  }

  if (model.type === 'sd') {
    const lifelines = new Set(model.elements.filter((e) => e.kind === 'lifeline').map((e) => e.id));
    if (lifelines.size === 0) ng.push('ライフラインが無い');
    for (const s of flattenSteps(model.steps)) {
      claim(s.id, `手順 ${s.kind}`);
      if (s.kind === 'message') {
        if (!lifelines.has(s.from)) ng.push(`${s.id}: from「${s.from}」がライフラインに無い`);
        if (!lifelines.has(s.to)) ng.push(`${s.id}: to「${s.to}」がライフラインに無い`);
      } else if (s.kind === 'ref') {
        if (s.covers.length === 0) ng.push(`${s.id}: ref が覆うライフラインが無い`);
        for (const c of s.covers)
          if (!lifelines.has(c)) ng.push(`${s.id}: covers「${c}」がライフラインに無い`);
      } else if (s.operands.length === 0) ng.push(`${s.id}: 区画が無い`);
    }
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

/** 使用（パート・値・ライフライン…）の名札。`engine : Engine [1]`、名前が無ければ `: Engine` */
export function usageText(el: Pick<Element, 'name' | 'type' | 'mult'>): string {
  const type = el.type ? ` : ${el.type}` : '';
  const mult = el.mult ? ` [${el.mult}]` : '';
  return `${el.name}${type}${mult}`.trim();
}

/** 遷移の札。`trigger [guard] / effect`（3 つの欄は省略できる） */
export function transitionText(r: Pick<Relation, 'trigger' | 'guard' | 'effect'>): string {
  return [r.trigger ?? '', r.guard ? `[${r.guard}]` : '', r.effect ? `/ ${r.effect}` : '']
    .filter(Boolean)
    .join(' ');
}

/** 依存のステレオタイプの札 */
export function stereotypeText(r: Relation): string {
  if (r.kind === 'include') return '«include»';
  if (r.kind === 'extend') return '«extend»';
  return r.stereotype ? `«${r.stereotype}»` : '';
}
