/**
 * 組み立て問題（build_fragment）のパレット（DESIGN.md §6.3）。
 *
 * SysML v1.x に標準テキストが無いので、文法を覚えさせずに「選んで置く」形にする。
 *   - 要素の種類を選ぶ → 名前などの欄を埋める → 置く
 *   - 関係の種類を選ぶ → 元と先を選ぶ → 置く
 * **置ける所にしか置けない**: 関係の元・先の候補は、その関係が結べる種類だけを出す。
 * 範囲外の構文（v1.3 のフルポートなど）は灰色で、なぜ使えないかを添えて出す
 * （隠すと「無い」と誤解する。DESIGN.md §6.3）。
 *
 * 向き（satisfy は設計 → 要求）までパレットで縛っている。向きの取り違えは spot_error で問い、
 * 組み立てでは「どの関係を選ぶか」と「何と何を結ぶか」を問う、と役割を分けた。
 */
import type { DiagramType, ElementKind, MessageSort, RelationKind } from './model.ts';

export type Field =
  | 'name'
  | 'type'
  | 'mult'
  | 'reqId'
  | 'text'
  | 'parent'
  | 'entry'
  | 'doActivity'
  | 'exit'
  | 'targetRole'
  | 'targetMult'
  | 'guard'
  | 'trigger'
  | 'effect'
  | 'item'
  | 'label';

/**
 * 欄の見出しと例示。例示は**答えと重ならない説明**にする（初版は `start` `fuel > 0` を例に出しており、
 * 状態機械の組み立て問題の答えそのものだった。2026-10-06 の画面確認で見つけた）。
 */
export const FIELD_LABEL: Record<Field, { label: string; placeholder: string }> = {
  name: { label: '名前', placeholder: '名前' },
  type: { label: '型', placeholder: '型の名前' },
  mult: { label: '多重度', placeholder: '空なら 1' },
  reqId: { label: 'id', placeholder: '要求番号' },
  text: { label: 'text', placeholder: '何を求めるか' },
  parent: { label: '置く場所', placeholder: '' },
  entry: { label: 'entry /', placeholder: '入るとき 1 回' },
  doActivity: { label: 'do /', placeholder: '居る間' },
  exit: { label: 'exit /', placeholder: '出るとき 1 回' },
  targetRole: { label: '先の端のロール名', placeholder: '部分の側の名前' },
  targetMult: { label: '先の端の多重度', placeholder: '部分の側の数' },
  guard: { label: 'ガード [ ]', placeholder: '条件' },
  trigger: { label: 'トリガ', placeholder: 'イベント' },
  effect: { label: '効果 /', placeholder: '遷移のときに行うこと' },
  item: { label: '項目フロー', placeholder: '名前 : 型' },
  label: { label: 'メッセージ', placeholder: '操作やシグナルの名前' },
};

/** 関係の端にできるもの。要素の種類か、ポートの種類 */
export type EndKind = ElementKind | 'port' | 'pin' | 'param' | 'frameParam';

export interface ElementTool {
  id: string;
  kind: ElementKind;
  label: string;
  /** 形の説明（パレットのボタンの副題） */
  hint: string;
  fields: Field[];
  /** 入れ子にできる親の種類（parent の候補） */
  parents?: ElementKind[];
}

export interface RelationTool {
  id: string;
  kind: RelationKind | 'message';
  stereotype?: string;
  sort?: MessageSort;
  label: string;
  hint: string;
  from: EndKind[];
  to: EndKind[];
  fields: Field[];
}

export interface Palette {
  elements: ElementTool[];
  relations: RelationTool[];
  /** 範囲外（灰色で出す） */
  outOfScope: { label: string; reason: string }[];
}

const V13 = 'v1.3 から入った記法で、試験（SysML v1.2）の範囲外';

const ACTION_KINDS: ElementKind[] = [
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
];

export const PALETTES: Record<DiagramType, Palette> = {
  bdd: {
    elements: [
      { id: 'block', kind: 'block', label: 'ブロック', hint: '«block» の箱', fields: ['name'] },
      {
        id: 'valueType',
        kind: 'valueType',
        label: '値型',
        hint: '«valueType» の箱',
        fields: ['name'],
      },
      {
        id: 'constraintBlock',
        kind: 'constraintBlock',
        label: '制約ブロック',
        hint: '«constraint» の箱',
        fields: ['name'],
      },
    ],
    relations: [
      {
        id: 'composition',
        kind: 'composition',
        label: 'コンポジション',
        hint: '黒ひし形。全体 → 部分',
        from: ['block'],
        to: ['block', 'constraintBlock'],
        fields: ['targetRole', 'targetMult'],
      },
      {
        id: 'aggregation',
        kind: 'aggregation',
        label: '共有集約',
        hint: '白ひし形。全体 → 部分',
        from: ['block'],
        to: ['block'],
        fields: ['targetRole', 'targetMult'],
      },
      {
        id: 'association',
        kind: 'association',
        label: '関連（参照）',
        hint: '実線',
        from: ['block'],
        to: ['block'],
        fields: ['targetRole', 'targetMult'],
      },
      {
        id: 'generalization',
        kind: 'generalization',
        label: '汎化',
        hint: '白三角。特化 → 一般',
        from: ['block', 'valueType'],
        to: ['block', 'valueType'],
        fields: [],
      },
      {
        id: 'allocate',
        kind: 'dependency',
        stereotype: 'allocate',
        label: '«allocate»',
        hint: '担当させるもの → 担当するもの',
        from: ['activity', 'block'],
        to: ['block'],
        fields: [],
      },
      {
        id: 'satisfy',
        kind: 'dependency',
        stereotype: 'satisfy',
        label: '«satisfy»',
        hint: '設計 → 要求',
        from: ['block'],
        to: ['requirement'],
        fields: [],
      },
    ],
    outOfScope: [
      { label: '«interfaceBlock»', reason: V13 },
      {
        label: '共有集約の多用',
        reason: '試験範囲は関連とコンポジット集約（共有集約は読めれば足りる）',
      },
    ],
  },
  ibd: {
    elements: [
      {
        id: 'part',
        kind: 'part',
        label: 'パート',
        hint: '実線の箱 name : Type',
        fields: ['name', 'type', 'mult', 'parent'],
        parents: ['part'],
      },
      {
        id: 'reference',
        kind: 'reference',
        label: '参照プロパティ',
        hint: '点線の箱',
        fields: ['name', 'type'],
      },
    ],
    relations: [
      {
        id: 'connector',
        kind: 'connector',
        label: 'コネクタ',
        hint: '実線。ポートかパートを結ぶ',
        from: ['part', 'reference', 'port'],
        to: ['part', 'reference', 'port'],
        fields: ['item'],
      },
    ],
    outOfScope: [
      { label: 'フルポート / プロキシポート', reason: V13 },
      { label: '«block» の箱', reason: 'ibd に描くのは使用（パート）。定義は bdd に描く' },
    ],
  },
  par: {
    elements: [
      {
        id: 'value',
        kind: 'value',
        label: '値属性',
        hint: '箱 name : Type',
        fields: ['name', 'type'],
      },
    ],
    relations: [
      {
        id: 'binding',
        kind: 'binding',
        label: '束縛コネクタ',
        hint: '実線。値とパラメータを結ぶ',
        from: ['value', 'param', 'frameParam'],
        to: ['value', 'param', 'frameParam'],
        fields: [],
      },
    ],
    outOfScope: [{ label: '向きのある矢印', reason: '束縛は等式で、向きを持たない' }],
  },
  pkg: {
    elements: [
      {
        id: 'package',
        kind: 'package',
        label: 'パッケージ',
        hint: 'フォルダの形',
        fields: ['name', 'parent'],
        parents: ['package', 'model'],
      },
      {
        id: 'block',
        kind: 'block',
        label: 'ブロック',
        hint: '«block» の箱',
        fields: ['name', 'parent'],
        parents: ['package', 'model'],
      },
      { id: 'view', kind: 'view', label: 'ビュー', hint: '«view» のフォルダ', fields: ['name'] },
      {
        id: 'viewpoint',
        kind: 'viewpoint',
        label: 'ビューポイント',
        hint: '«viewpoint» の箱',
        fields: ['name'],
      },
    ],
    relations: [
      {
        id: 'import',
        kind: 'dependency',
        stereotype: 'import',
        label: '«import»',
        hint: '取り込む側 → 取り込まれる側',
        from: ['package', 'model', 'view'],
        to: ['package', 'model', 'modelLibrary', 'block'],
        fields: [],
      },
      {
        id: 'containment',
        kind: 'containment',
        label: '包含',
        hint: '丸に十字。入れ物 → 中身',
        from: ['package', 'model'],
        to: ['package', 'block', 'requirement'],
        fields: [],
      },
      {
        id: 'conform',
        kind: 'dependency',
        stereotype: 'conform',
        label: '«conform»',
        hint: 'ビュー → ビューポイント',
        from: ['view'],
        to: ['viewpoint'],
        fields: [],
      },
      {
        id: 'dependency',
        kind: 'dependency',
        label: '依存',
        hint: '点線の矢印',
        from: ['package', 'block'],
        to: ['package', 'block'],
        fields: [],
      },
    ],
    outOfScope: [
      { label: 'プロファイルの作成', reason: 'ステレオタイプの適用は範囲内、作成は範囲外' },
    ],
  },
  req: {
    elements: [
      {
        id: 'requirement',
        kind: 'requirement',
        label: '要求',
        hint: '«requirement» id と text',
        fields: ['name', 'reqId', 'text'],
      },
      { id: 'block', kind: 'block', label: 'ブロック', hint: '設計要素', fields: ['name'] },
      {
        id: 'testCase',
        kind: 'testCase',
        label: 'テストケース',
        hint: '«testCase»',
        fields: ['name'],
      },
    ],
    relations: [
      {
        id: 'containment',
        kind: 'containment',
        label: '包含',
        hint: '丸に十字。親 → 子',
        from: ['requirement'],
        to: ['requirement'],
        fields: [],
      },
      {
        id: 'deriveReqt',
        kind: 'dependency',
        stereotype: 'deriveReqt',
        label: '«deriveReqt»',
        hint: '導出した要求 → 元の要求',
        from: ['requirement'],
        to: ['requirement'],
        fields: [],
      },
      {
        id: 'satisfy',
        kind: 'dependency',
        stereotype: 'satisfy',
        label: '«satisfy»',
        hint: '設計 → 要求',
        from: ['block'],
        to: ['requirement'],
        fields: [],
      },
      {
        id: 'verify',
        kind: 'dependency',
        stereotype: 'verify',
        label: '«verify»',
        hint: 'テスト → 要求',
        from: ['testCase'],
        to: ['requirement'],
        fields: [],
      },
      {
        id: 'refine',
        kind: 'dependency',
        stereotype: 'refine',
        label: '«refine»',
        hint: '詳しくする側 → 要求',
        from: ['useCase', 'block', 'requirement'],
        to: ['requirement'],
        fields: [],
      },
      {
        id: 'trace',
        kind: 'dependency',
        stereotype: 'trace',
        label: '«trace»',
        hint: '弱い関係',
        from: ['requirement', 'block', 'testCase'],
        to: ['requirement'],
        fields: [],
      },
      {
        id: 'copy',
        kind: 'dependency',
        stereotype: 'copy',
        label: '«copy»',
        hint: '写し → 元',
        from: ['requirement'],
        to: ['requirement'],
        fields: [],
      },
    ],
    outOfScope: [],
  },
  uc: {
    elements: [
      {
        id: 'actor',
        kind: 'actor',
        label: 'アクター',
        hint: '棒人間（主題の外）',
        fields: ['name'],
      },
      {
        id: 'useCase',
        kind: 'useCase',
        label: 'ユースケース',
        hint: '楕円',
        fields: ['name', 'parent'],
        parents: ['subject'],
      },
      {
        id: 'subject',
        kind: 'subject',
        label: '主題',
        hint: 'システムの境界の四角',
        fields: ['name'],
      },
    ],
    relations: [
      {
        id: 'association',
        kind: 'association',
        label: '関連',
        hint: '実線。アクター — ユースケース',
        from: ['actor'],
        to: ['useCase'],
        fields: [],
      },
      {
        id: 'include',
        kind: 'include',
        label: '«include»',
        hint: '基底 → 必ず含む側',
        from: ['useCase'],
        to: ['useCase'],
        fields: [],
      },
      {
        id: 'extend',
        kind: 'extend',
        label: '«extend»',
        hint: '拡張する側 → 基底',
        from: ['useCase'],
        to: ['useCase'],
        fields: ['guard'],
      },
      {
        id: 'generalization',
        kind: 'generalization',
        label: '汎化',
        hint: '白三角。特化 → 一般',
        from: ['actor', 'useCase'],
        to: ['actor', 'useCase'],
        fields: [],
      },
    ],
    outOfScope: [],
  },
  act: {
    elements: [
      {
        id: 'action',
        kind: 'action',
        label: 'アクション',
        hint: '角丸の箱',
        fields: ['name', 'parent'],
        parents: ['partition'],
      },
      {
        id: 'callBehavior',
        kind: 'callBehavior',
        label: '呼び出し',
        hint: '熊手の印',
        fields: ['name', 'type', 'parent'],
        parents: ['partition'],
      },
      {
        id: 'sendSignal',
        kind: 'sendSignal',
        label: 'シグナル送信',
        hint: '尖った五角形',
        fields: ['name', 'parent'],
        parents: ['partition'],
      },
      {
        id: 'acceptEvent',
        kind: 'acceptEvent',
        label: 'イベント受理',
        hint: '凹んだ五角形',
        fields: ['name', 'parent'],
        parents: ['partition'],
      },
      {
        id: 'acceptTime',
        kind: 'acceptTime',
        label: '時間イベント',
        hint: '砂時計',
        fields: ['name', 'parent'],
        parents: ['partition'],
      },
      {
        id: 'initial',
        kind: 'initial',
        label: '開始',
        hint: '黒丸',
        fields: ['parent'],
        parents: ['partition'],
      },
      {
        id: 'final',
        kind: 'final',
        label: 'アクティビティ終了',
        hint: '二重丸',
        fields: ['parent'],
        parents: ['partition'],
      },
      {
        id: 'flowFinal',
        kind: 'flowFinal',
        label: 'フロー終了',
        hint: '丸に ×',
        fields: ['parent'],
        parents: ['partition'],
      },
      {
        id: 'decision',
        kind: 'decision',
        label: '判断',
        hint: 'ひし形（出口が複数）',
        fields: ['parent'],
        parents: ['partition'],
      },
      {
        id: 'merge',
        kind: 'merge',
        label: 'マージ',
        hint: 'ひし形（入口が複数）',
        fields: ['parent'],
        parents: ['partition'],
      },
      {
        id: 'fork',
        kind: 'fork',
        label: 'フォーク',
        hint: '棒（出口が複数）',
        fields: ['parent'],
        parents: ['partition'],
      },
      {
        id: 'join',
        kind: 'join',
        label: 'ジョイン',
        hint: '棒（入口が複数）',
        fields: ['parent'],
        parents: ['partition'],
      },
    ],
    relations: [
      {
        id: 'controlFlow',
        kind: 'controlFlow',
        label: '制御フロー',
        hint: '「次をやってよい」',
        from: ACTION_KINDS,
        to: ACTION_KINDS,
        fields: ['guard'],
      },
      {
        id: 'objectFlow',
        kind: 'objectFlow',
        label: 'オブジェクトフロー',
        hint: 'ピンからピンへ物を運ぶ',
        from: ['pin', 'frameParam', 'objectNode', 'decision', 'merge', 'fork', 'join'],
        to: ['pin', 'frameParam', 'objectNode', 'decision', 'merge', 'fork', 'join'],
        fields: ['guard'],
      },
    ],
    outOfScope: [],
  },
  stm: {
    elements: [
      {
        id: 'state',
        kind: 'state',
        label: '状態',
        hint: '角丸の箱',
        fields: ['name', 'entry', 'doActivity', 'exit', 'parent'],
        parents: ['state', 'region'],
      },
      {
        id: 'initial',
        kind: 'initial',
        label: '開始擬似状態',
        hint: '黒丸',
        fields: ['parent'],
        parents: ['state', 'region'],
      },
      {
        id: 'final',
        kind: 'final',
        label: '終了状態',
        hint: '二重丸',
        fields: ['parent'],
        parents: ['state', 'region'],
      },
      {
        id: 'choice',
        kind: 'choice',
        label: '選択',
        hint: 'ひし形',
        fields: ['parent'],
        parents: ['state', 'region'],
      },
    ],
    relations: [
      {
        id: 'transition',
        kind: 'transition',
        label: '遷移',
        hint: 'トリガ [ガード] / 効果',
        from: ['state', 'initial', 'choice'],
        to: ['state', 'final', 'choice'],
        fields: ['trigger', 'guard', 'effect'],
      },
    ],
    outOfScope: [{ label: 'プロトコル状態機械', reason: '試験範囲は振る舞い状態機械' }],
  },
  sd: {
    elements: [
      {
        id: 'lifeline',
        kind: 'lifeline',
        label: 'ライフライン',
        hint: '頭の箱 + 点線',
        fields: ['name', 'type'],
      },
    ],
    relations: [
      {
        id: 'sync',
        kind: 'message',
        sort: 'sync',
        label: '同期メッセージ',
        hint: '塗った矢じり（返事を待つ）',
        from: ['lifeline'],
        to: ['lifeline'],
        fields: ['label'],
      },
      {
        id: 'async',
        kind: 'message',
        sort: 'async',
        label: '非同期メッセージ',
        hint: '開いた矢じり（待たない）',
        from: ['lifeline'],
        to: ['lifeline'],
        fields: ['label'],
      },
      {
        id: 'reply',
        kind: 'message',
        sort: 'reply',
        label: '返信',
        hint: '点線',
        from: ['lifeline'],
        to: ['lifeline'],
        fields: ['label'],
      },
    ],
    outOfScope: [{ label: 'タイミング図', reason: 'SysML に無い（UML だけの図）' }],
  },
};
