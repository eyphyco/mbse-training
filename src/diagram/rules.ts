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
 * 組み立て問題（build_fragment）の「検査」ボタンも同じ規則を使う（DESIGN.md §6.5）。
 */
import { KIND_LABEL, RELATION_LABEL, allPorts, flattenSteps, usageText } from './model.ts';
import type { DiagramType, Element, Model, Port, Relation, Step } from './model.ts';

export interface Issue {
  /** 指す場所。要素・関係・ポート・手順の id、図枠のヘッダは 'frame' */
  at: string;
  kind: IssueKind;
}

export type IssueKind =
  // どの図にも
  | 'header-kind'
  | 'header-owner-type'
  | 'generalization-across-kinds'
  // bdd
  | 'composite-end-mult'
  | 'part-typed-by-valuetype'
  | 'value-typed-by-block'
  | 'parts-vs-aggregation'
  | 'reference-vs-composition'
  | 'composition-reversed'
  | 'part-mult-mismatch'
  | 'role-wrong-end'
  | 'valuetype-with-parts'
  | 'ports-on-valuetype'
  | 'flowspec-non-flow'
  // ibd・par
  | 'definition-in-usage-diagram'
  | 'flow-direction-mismatch'
  | 'connector-type-mismatch'
  | 'itemflow-reversed'
  | 'param-not-in-expr'
  | 'expr-var-missing-param'
  | 'binding-type-mismatch'
  // pkg
  | 'conform-reversed'
  | 'owned-twice'
  // req
  | 'satisfy-reversed'
  | 'satisfy-between-requirements'
  | 'verify-reversed'
  | 'derive-non-requirement'
  | 'req-containment-non-req'
  | 'requirement-missing-text'
  // uc
  | 'actor-inside-subject'
  | 'association-between-usecases'
  | 'association-between-actors'
  | 'include-with-actor'
  // act・stm
  | 'initial-has-incoming'
  | 'final-has-outgoing'
  | 'decision-without-guard'
  | 'objectflow-without-pin'
  | 'controlflow-on-pin'
  | 'pin-type-mismatch'
  | 'initial-has-trigger'
  | 'two-initials-in-region'
  // 割り当て
  | 'allocate-to-requirement'
  | 'allocate-compartment-mismatch'
  // sd
  | 'reply-without-call'
  | 'alt-operand-without-guard';

export interface RuleInfo {
  /** 取り違えの名前（解説の見出し） */
  title: string;
  /** 採点エンジンが出す解説。問題ごとの why の前に置く */
  explain: string;
}

/** 図種ごとに、ヘッダの最初の [ ] に書ける型（SysML v1.2 付録 A） */
export const OWNER_TYPES: Record<DiagramType, string[]> = {
  bdd: ['package', 'model', 'modelLibrary', 'block', 'constraintBlock'],
  ibd: ['block'],
  par: ['block', 'constraintBlock'],
  pkg: ['package', 'model', 'modelLibrary', 'profile', 'view'],
  req: ['package', 'model', 'modelLibrary', 'requirement'],
  uc: ['package', 'model', 'modelLibrary'],
  act: ['activity'],
  stm: ['stateMachine'],
  sd: ['interaction'],
};

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
      'ヘッダの最初の [ ] は、図が表すモデル要素の型です。図の種類ごとに決まっています: bdd は package / model / modelLibrary / block / constraintBlock、ibd は block、par は block / constraintBlock、pkg は package / model / modelLibrary / profile / view、req は package / model / modelLibrary / requirement、uc は package / model / modelLibrary、act は activity、stm は stateMachine、sd は interaction。',
  },
  'generalization-across-kinds': {
    title: '種類の違うものの間の汎化',
    explain:
      '汎化（白三角）は同じ種類どうし（ブロックとブロック、値型と値型、アクターとアクター、ユースケースとユースケース）の間に引きます。',
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
  'definition-in-usage-diagram': {
    title: '使用の図に定義を描いている',
    explain:
      'ibd と par に描くのは**使用**（パート・値属性・制約プロパティ。`名前 : 型` の形）です。«block» や «constraint» の札が付いた箱は定義で、bdd に描きます。',
  },
  'flow-direction-mismatch': {
    title: 'フローポートの向きが合わない',
    explain:
      '隣り合うパートのフローポートをつなぐなら、出る（out）と入る（in）の組でなければなりません（inout はどちらとも組める）。図枠（囲みブロック）のポートと中のパートのポートをつなぐときは、外から中へ受け渡すので**同じ向き**どうしになります。',
  },
  'connector-type-mismatch': {
    title: 'つないだポートの型が違う',
    explain:
      'コネクタでつないだフローポートどうしは、流すものの型が一致していなければなりません（燃料のポートをトルクのポートにはつなげない）。',
  },
  'itemflow-reversed': {
    title: '項目フローの向きがポートと逆',
    explain:
      '項目フローの黒三角は、出るポート（out）から入るポート（in）の向きを指します。ポートの向きと逆を指していたら食い違っています。',
  },
  'param-not-in-expr': {
    title: '式に無いパラメータ',
    explain:
      '制約プロパティのパラメータ（縁の小さな四角）は、制約の式に出てくる変数です。式に出てこない名前のパラメータは、その制約では使われません。',
  },
  'expr-var-missing-param': {
    title: '式の変数がパラメータに無い',
    explain:
      '制約ブロックの constraints 区画の式に出る変数は、すべて parameters 区画に `名前 : 型` で並べます。並べていない変数は、par で値属性に束縛できません。',
  },
  'binding-type-mismatch': {
    title: '束縛した両端の型が違う',
    explain:
      '束縛コネクタは「両端の値が常に等しい」を表します。等しくなれるのは同じ型（同じ単位）どうしだけです。質量を力のパラメータに束縛することはできません。',
  },
  'conform-reversed': {
    title: '«conform» の向きが逆',
    explain:
      '«conform» は**ビューから**ビューポイントへ引きます（ビューがビューポイントに適合する）。矢印の先がビューポイントです。',
  },
  'owned-twice': {
    title: '1 つの要素を 2 つのパッケージが所有している',
    explain:
      'モデル要素の所有者は 1 つだけです（名前空間が 1 つに決まる）。別のパッケージからも使いたいなら、所有ではなく «import» で取り込みます。',
  },
  'satisfy-reversed': {
    title: '«satisfy» の向きが逆',
    explain: '«satisfy» は**設計要素（ブロックなど）から要求へ**引きます。矢印の先が要求です。',
  },
  'satisfy-between-requirements': {
    title: '要求どうしに «satisfy»',
    explain:
      '要求どうしなら «deriveReqt»（導出）です。«satisfy» は設計 → 要求の向きにだけ使います。',
  },
  'verify-reversed': {
    title: '«verify» の向きが逆',
    explain: '«verify» は**テストケース側から要求へ**引きます。矢印の先が要求です。',
  },
  'derive-non-requirement': {
    title: '«deriveReqt» の端が要求でない',
    explain:
      '«deriveReqt» は要求から要求への関係です（導出した要求 → 元の要求）。ブロックやテストケースとの間には引きません。',
  },
  'req-containment-non-req': {
    title: '要求の中に要求でないものを入れている',
    explain:
      '要求の包含（丸に十字）で子にできるのは要求だけです。要求を満たす設計要素は «satisfy» で結びます。',
  },
  'requirement-missing-text': {
    title: '要求に id か text が無い',
    explain:
      '«requirement» は id と text の 2 つの性質を持つモデル要素です。text の無い要求は「何を求めるか」が書かれていません。',
  },
  'actor-inside-subject': {
    title: 'アクターが主題の中にいる',
    explain:
      'アクターはシステム（主題）の**外**にいる人や外部システムです。主題の枠の中に描くと、システムの一部という意味になります。',
  },
  'association-between-usecases': {
    title: 'ユースケースどうしを関連で結んでいる',
    explain:
      'ユースケースどうしは «include»・«extend»・汎化のいずれかで結びます。実線の関連はアクターとユースケースの間に引くものです。',
  },
  'association-between-actors': {
    title: 'アクターどうしを関連で結んでいる',
    explain:
      'アクターどうしの実線の関連はユースケース図に描きません（アクターどうしの関係は汎化だけ）。アクターはユースケースと結びます。',
  },
  'include-with-actor': {
    title: 'アクターに «include» / «extend»',
    explain:
      '«include» と «extend» はユースケースどうしの関係です。アクターとユースケースは実線の関連で結びます。',
  },
  'initial-has-incoming': {
    title: '開始に入ってくる線がある',
    explain:
      '開始ノード（開始擬似状態）は流れの出発点で、出ていく線しか持ちません。戻ってくる流れはマージノード（状態機械なら状態）に入れます。',
  },
  'final-has-outgoing': {
    title: '終了から出ていく線がある',
    explain: '終了ノード・フロー終了・終了状態は流れの行き止まりで、出ていく線を持ちません。',
  },
  'decision-without-guard': {
    title: '判断の出口にガードが無い',
    explain:
      '判断ノード（ひし形）から出る線には、どれが選ばれるかを決める [ガード] を付けます。ガードの無い出口があると、どちらへ進むかが決まりません。',
  },
  'objectflow-without-pin': {
    title: 'オブジェクトフローがピンを通っていない',
    explain:
      '物・データはピン（アクションの縁の小さな四角）を通して受け渡します。オブジェクトフローをアクションの本体に直接つなぐと、何がどこに入るのかが書けません。',
  },
  'controlflow-on-pin': {
    title: '制御フローがピンにつながっている',
    explain:
      'ピンとパラメータノードは物・データの出入口で、オブジェクトフローがつながります。「次をやってよい」を伝える制御フローはアクションの本体につなぎます。',
  },
  'pin-type-mismatch': {
    title: 'ピンの型が合わない',
    explain:
      'オブジェクトフローでつないだピンどうしは、流れるものの型が一致していなければなりません。熱を受けるピンに燃料を流すことはできません。',
  },
  'initial-has-trigger': {
    title: '開始擬似状態からの遷移にトリガ・ガードがある',
    explain:
      '開始擬似状態から出る遷移は、状態機械が始まるとすぐに通ります。トリガ（イベント）もガード（条件）も付けません（付けられるのは効果だけ）。',
  },
  'two-initials-in-region': {
    title: '1 つの領域に開始が 2 つ',
    explain:
      '開始擬似状態は 1 つの領域に 1 つだけです。2 つあると、どちらから始まるかが決まりません。同時に動かしたいなら、点線で区切った別の領域に置きます。',
  },
  'allocate-to-requirement': {
    title: '要求に «allocate»',
    explain:
      '«allocate» は機能や論理を、それを担当する部品などに割り当てる関係です。要求に応えることを表すなら «satisfy»（設計 → 要求）を使います。',
  },
  'allocate-compartment-mismatch': {
    title: 'allocatedFrom と allocatedTo の取り違え',
    explain:
      '«allocate» の矢印の元の要素には allocatedTo（どこへ割り当てたか）、先の要素には allocatedFrom（どこから割り当てられたか）を書きます。区画と矢印の向きが食い違っています。',
  },
  'reply-without-call': {
    title: '同期呼び出しの無い返信',
    explain:
      '返信（点線の矢印）は、先に送った**同期**メッセージ（塗った矢じり）への返事です。非同期メッセージ（開いた矢じり）は返事を待たないので、返信は付きません。',
  },
  'alt-operand-without-guard': {
    title: 'alt の区画にガードが無い',
    explain:
      'alt は条件分岐で、点線で区切った区画ごとに [ガード] を書きます（最後の区画は [else] にできる）。ガードの無い区画は、いつ選ばれるかが決まりません。',
  },
};

/** 値属性の型として使える基本型 */
const PRIMITIVES = new Set(['Real', 'Integer', 'Boolean', 'String', 'Number', 'Complex']);
const isComposite = (m?: string) => m === undefined || m === '1' || m === '0..1';
/** 式の中で変数ではない名前（関数） */
const MATH = new Set(['sqrt', 'sin', 'cos', 'tan', 'exp', 'log', 'abs', 'min', 'max', 'pi']);
const ACTIONS = new Set(['action', 'callBehavior', 'sendSignal', 'acceptEvent', 'acceptTime']);

/** 誤りを見つける。結果は at → kind の順で並べる（比較しやすいように） */
export function findIssues(model: Model): Issue[] {
  const out: Issue[] = [];
  const add = (at: string, kind: IssueKind) => {
    if (!out.some((i) => i.at === at && i.kind === kind)) out.push({ at, kind });
  };
  const byName = new Map<string, Element>(model.elements.map((e) => [e.name, e]));
  const byId = new Map<string, Element>(model.elements.map((e) => [e.id, e]));
  const kindOfType = (t?: string) => (t ? byName.get(t)?.kind : undefined);
  const ports = allPorts(model);
  const portById = new Map<string, { port: Port; owner: Element | null }>(
    ports.map((p) => [p.port.id, p]),
  );

  if (model.frame.kind !== model.type) add('frame', 'header-kind');
  if (!OWNER_TYPES[model.type].includes(model.frame.ownerType)) add('frame', 'header-owner-type');

  /* --- 要素 --- */
  for (const el of model.elements) {
    const props = el.props ?? [];
    if (props.some((p) => p.kind === 'part' && kindOfType(p.type) === 'valueType'))
      add(el.id, 'part-typed-by-valuetype');
    if (
      props.some(
        (p) =>
          p.kind === 'value' && !PRIMITIVES.has(p.type ?? '') && kindOfType(p.type) === 'block',
      )
    )
      add(el.id, 'value-typed-by-block');
    if (el.kind === 'valueType' && props.some((p) => p.kind === 'part'))
      add(el.id, 'valuetype-with-parts');
    if (el.kind === 'valueType' && (el.ports ?? []).length > 0) add(el.id, 'ports-on-valuetype');
    if (el.kind === 'flowSpecification' && props.some((p) => p.kind !== 'flowProperty'))
      add(el.id, 'flowspec-non-flow');
    if (
      (model.type === 'ibd' && el.kind === 'block') ||
      (model.type === 'par' && el.kind === 'constraintBlock')
    )
      add(el.id, 'definition-in-usage-diagram');
    if (el.kind === 'constraintBlock') {
      // bdd の制約ブロック: 式の変数と parameters 区画が揃っているか
      const exprs = props.filter((p) => p.kind === 'constraint').map((p) => p.name);
      const params = props.filter((p) => p.kind === 'parameter').map((p) => p.name);
      if (exprs.length > 0) {
        const vars = new Set(exprs.flatMap((e) => e.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
        if (params.some((n) => !vars.has(n))) add(el.id, 'param-not-in-expr');
        if ([...vars].some((v) => !params.includes(v) && !MATH.has(v)))
          add(el.id, 'expr-var-missing-param');
      }
    }
    if (el.kind === 'constraintProperty' && el.expr) {
      const vars = new Set(el.expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
      for (const p of el.ports ?? []) if (!vars.has(p.name)) add(p.id, 'param-not-in-expr');
    }
    if (el.kind === 'requirement' && (!el.text || !el.reqId))
      add(el.id, 'requirement-missing-text');
    if (el.kind === 'actor' && el.parent && byId.get(el.parent)?.kind === 'subject')
      add(el.id, 'actor-inside-subject');
  }

  /* --- 所有（pkg） --- */
  if (model.type === 'pkg') {
    const owners = new Map<string, number>();
    for (const el of model.elements) if (el.parent) owners.set(el.id, 1);
    for (const r of model.relations)
      if (r.kind === 'containment') owners.set(r.target, (owners.get(r.target) ?? 0) + 1);
    for (const [id, n] of owners) if (n > 1) add(id, 'owned-twice');
  }

  /* --- 関係 --- */
  /** owner の区画に、型が target の行があるか */
  const propTo = (owner: Element | undefined, kind: string, target: Element | undefined) =>
    owner && target
      ? (owner.props ?? []).find((p) => p.kind === kind && p.type === target.name)
      : undefined;
  const isReq = (e?: Element) => e?.kind === 'requirement';
  const endKind = (id: string) => byId.get(id)?.kind ?? (portById.has(id) ? 'port' : undefined);

  for (const r of model.relations) {
    const s = byId.get(r.source);
    const t = byId.get(r.target);
    switch (r.kind) {
      case 'composition': {
        if (!isComposite(r.sourceMult)) add(r.id, 'composite-end-mult');
        if (propTo(s, 'reference', t)) add(r.id, 'reference-vs-composition');
        if (propTo(t, 'part', s) && !propTo(s, 'part', t)) add(r.id, 'composition-reversed');
        const part = propTo(s, 'part', t);
        if (part && r.targetMult !== undefined && r.targetMult !== (part.mult ?? '1'))
          add(r.id, 'part-mult-mismatch');
        if (part && r.sourceRole === part.name && r.targetRole !== part.name)
          add(r.id, 'role-wrong-end');
        break;
      }
      case 'aggregation':
        if (propTo(s, 'part', t)) add(r.id, 'parts-vs-aggregation');
        break;
      case 'generalization':
        if (s && t && s.kind !== t.kind) add(r.id, 'generalization-across-kinds');
        break;
      case 'association':
        if (model.type === 'uc') {
          if (s?.kind === 'useCase' && t?.kind === 'useCase')
            add(r.id, 'association-between-usecases');
          if (s?.kind === 'actor' && t?.kind === 'actor') add(r.id, 'association-between-actors');
        }
        break;
      case 'include':
      case 'extend':
        if (s?.kind === 'actor' || t?.kind === 'actor') add(r.id, 'include-with-actor');
        break;
      case 'dependency':
        switch (r.stereotype) {
          case 'satisfy':
            if (isReq(s) && isReq(t)) add(r.id, 'satisfy-between-requirements');
            else if (isReq(s) && !isReq(t)) add(r.id, 'satisfy-reversed');
            break;
          case 'verify':
            if (isReq(s) && !isReq(t)) add(r.id, 'verify-reversed');
            break;
          case 'deriveReqt':
            if (!isReq(s) || !isReq(t)) add(r.id, 'derive-non-requirement');
            break;
          case 'allocate':
            if (isReq(t)) add(r.id, 'allocate-to-requirement');
            // 区画は名前で照合する（区画の行は `«activity» Drive` のように相手の名前で終わる）
            if (
              (s && t && (s.allocatedFrom ?? []).some((x) => x.endsWith(t.name))) ||
              (s && t && (t.allocatedTo ?? []).some((x) => x.endsWith(s.name)))
            )
              add(r.id, 'allocate-compartment-mismatch');
            break;
          case 'conform':
            if (s?.kind === 'viewpoint' && t?.kind === 'view') add(r.id, 'conform-reversed');
            break;
        }
        break;
      case 'containment':
        if (isReq(s) && t && !isReq(t)) add(r.id, 'req-containment-non-req');
        break;
      case 'connector': {
        const a = portById.get(r.source);
        const b = portById.get(r.target);
        if (a && b && a.port.kind === 'flow' && b.port.kind === 'flow') {
          const da = a.port.direction ?? 'inout';
          const db = b.port.direction ?? 'inout';
          // 図枠のポートと中のポート（受け渡し）は同じ向き、隣どうしは逆向き
          const delegation = a.owner === null || b.owner === null;
          if (da !== 'inout' && db !== 'inout' && (delegation ? da !== db : da === db))
            add(r.id, 'flow-direction-mismatch');
          if (a.port.type && b.port.type && a.port.type !== b.port.type)
            add(r.id, 'connector-type-mismatch');
          if (!delegation && da !== db && da !== 'inout' && db !== 'inout')
            for (const f of r.itemFlows ?? []) {
              // 流れの出どころ（reverse なら target 側）のポートが in なら逆を指している
              const from = f.reverse ? db : da;
              if (from === 'in') add(r.id, 'itemflow-reversed');
            }
        }
        break;
      }
      case 'binding': {
        const typeOf = (id: string) => byId.get(id)?.type ?? portById.get(id)?.port.type;
        const ta = typeOf(r.source);
        const tb = typeOf(r.target);
        if (ta && tb && ta !== tb) add(r.id, 'binding-type-mismatch');
        break;
      }
      case 'controlFlow':
        if (endKind(r.source) === 'port' || endKind(r.target) === 'port')
          add(r.id, 'controlflow-on-pin');
        break;
      case 'objectFlow': {
        if (ACTIONS.has(endKind(r.source) ?? '') || ACTIONS.has(endKind(r.target) ?? ''))
          add(r.id, 'objectflow-without-pin');
        const pa = portById.get(r.source)?.port;
        const pb = portById.get(r.target)?.port;
        if (pa?.type && pb?.type && pa.type !== pb.type) add(r.id, 'pin-type-mismatch');
        break;
      }
      case 'transition':
        if (s?.kind === 'initial' && (r.trigger || r.guard)) add(r.id, 'initial-has-trigger');
        break;
    }
    if (t?.kind === 'initial') add(r.id, 'initial-has-incoming');
    if (s && (s.kind === 'final' || s.kind === 'flowFinal')) add(r.id, 'final-has-outgoing');
  }

  /* 判断ノードの出口のガード */
  for (const el of model.elements)
    if (el.kind === 'decision' || el.kind === 'choice') {
      const outs = model.relations.filter(
        (r) =>
          r.source === el.id &&
          (r.kind === 'controlFlow' || r.kind === 'objectFlow' || r.kind === 'transition'),
      );
      if (outs.length > 1) for (const r of outs) if (!r.guard) add(r.id, 'decision-without-guard');
    }

  /* 1 つの領域に開始が 2 つ（stm） */
  if (model.type === 'stm') {
    const inits = new Map<string, Element[]>();
    for (const el of model.elements)
      if (el.kind === 'initial')
        inits.set(el.parent ?? '', [...(inits.get(el.parent ?? '') ?? []), el]);
    // 2 つ目以降（余分な方）を指す。書いた順で最初のものを正とみなす
    for (const list of inits.values())
      for (const el of list.slice(1)) add(el.id, 'two-initials-in-region');
  }

  /* --- シーケンス図 --- */
  if (model.type === 'sd') {
    // 同期呼び出しで、まだ返事の来ていないもの（from → to）
    const open: string[] = [];
    const walk = (steps: Step[]) => {
      for (const s of steps) {
        if (s.kind === 'message') {
          if (s.sort === 'sync' && s.from !== s.to) open.push(`${s.from}>${s.to}`);
          if (s.sort === 'reply') {
            const k = open.lastIndexOf(`${s.to}>${s.from}`);
            if (k < 0) add(s.id, 'reply-without-call');
            else open.splice(k, 1);
          }
        } else if (s.kind === 'fragment') {
          if (s.operator === 'alt' && s.operands.length > 1 && s.operands.some((o) => !o.guard))
            add(s.id, 'alt-operand-without-guard');
          for (const o of s.operands) walk(o.steps);
        }
      }
    };
    walk(model.steps ?? []);
  }

  return out.sort((a, b) => (a.at + a.kind < b.at + b.kind ? -1 : 1));
}

/** 要素の呼び名 */
function elementName(el: Element): string {
  if (el.name) return el.name;
  if (el.type) return usageText(el);
  return KIND_LABEL[el.kind];
}

/** 指す場所の呼び名（指摘の一覧と読み上げに使う） */
export function refLabel(model: Model, ref: string): string {
  if (ref === 'frame') return '図枠のヘッダ';
  const el = model.elements.find((e) => e.id === ref);
  if (el) {
    const n = elementName(el);
    return n === KIND_LABEL[el.kind] ? n : `${n}（${KIND_LABEL[el.kind]}）`;
  }
  const nameOf = (id: string) => {
    const e = model.elements.find((x) => x.id === id);
    if (e) return elementName(e);
    const p = allPorts(model).find((x) => x.port.id === id);
    return p ? `${p.owner ? `${elementName(p.owner)}.` : ''}${p.port.name}` : id;
  };
  const r: Relation | undefined = model.relations.find((x) => x.id === ref);
  if (r) {
    const what =
      r.kind === 'dependency' && r.stereotype ? `«${r.stereotype}»` : RELATION_LABEL[r.kind];
    const label = r.kind === 'transition' && r.trigger ? `「${r.trigger}」の` : '';
    return `${nameOf(r.source)} → ${nameOf(r.target)} の${label}${what}`;
  }
  const p = allPorts(model).find((x) => x.port.id === ref);
  if (p) {
    const what = { flow: 'ポート', standard: 'ポート', param: 'パラメータ', pin: 'ピン' }[
      p.port.kind
    ];
    return p.owner
      ? `${elementName(p.owner)} の${what} ${p.port.name}`
      : `図枠の${what} ${p.port.name}`;
  }
  const step = flattenSteps(model.steps).find((s) => s.id === ref);
  if (step) {
    if (step.kind === 'message') {
      const sort = { sync: '同期', async: '非同期', reply: '返信' }[step.sort];
      return `${nameOf(step.from)} → ${nameOf(step.to)} の${sort}メッセージ ${step.label}`;
    }
    if (step.kind === 'ref') return `ref ${step.name} の箱`;
    return `${step.operator} の枠`;
  }
  return ref;
}

/** 指せる場所の一覧（図をクリックできない人のための一覧にも使う） */
export function pickableRefs(model: Model): string[] {
  return [
    'frame',
    ...(model.framePorts ?? []).map((p) => p.id),
    ...model.elements
      .filter((e) => e.kind !== 'region')
      .flatMap((e) => [e.id, ...(e.ports ?? []).map((p) => p.id)]),
    ...model.relations.map((r) => r.id),
    ...flattenSteps(model.steps).map((s) => s.id),
  ];
}
