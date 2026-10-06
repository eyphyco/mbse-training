/**
 * モデル → 座標の入口。図種で並べ方を選ぶ。
 *
 * | 図種                          | 並べ方                     | 向き                         |
 * | ----------------------------- | -------------------------- | ---------------------------- |
 * | bdd・pkg・req                 | ELK（graph.ts）            | 下へ（全体・一般・出所が上） |
 * | ibd・par                      | ELK（graph.ts）            | 右へ（流れ・入力が左）       |
 * | uc                            | ELK（graph.ts）            | 右へ（アクターが左）         |
 * | stm                           | ELK（graph.ts）            | 下へ（開始が上）             |
 * | act                           | 自前（act.ts）             | 下へ。パーティションは縦の列 |
 * | sd                            | 自前（sd.ts）              | 下へ（時間が上から下）       |
 */
import { estimateWidth } from './metrics.ts';
import type { Measure } from './metrics.ts';
import { checkModel, headerRest, stereotypeText, transitionText } from './model.ts';
import type { DiagramType, Element, Model, Port, Relation } from './model.ts';
import type { DiagramLayout } from './layout.ts';
import { layoutGraph } from './graph.ts';
import type { GEdge, GLabel, GNode, GPort, GraphSpec } from './graph.ts';
import {
  actorBox,
  blockBox,
  commentBox,
  constraintPropertyBox,
  diamondBox,
  finalBox,
  initialBox,
  packageBox,
  regionBox,
  sideOf,
  stateBox,
  subjectBox,
  usageBox,
  ellipseUseCaseBox,
} from './shapes.ts';
import type { Box } from './shapes.ts';
import { layoutAct } from './act.ts';
import { layoutSd } from './sd.ts';

const DIRECTION: Record<DiagramType, 'DOWN' | 'RIGHT'> = {
  bdd: 'DOWN',
  pkg: 'DOWN',
  req: 'DOWN',
  stm: 'DOWN',
  act: 'DOWN',
  sd: 'DOWN',
  ibd: 'RIGHT',
  par: 'RIGHT',
  uc: 'RIGHT',
};

/** 要素の形 */
function boxOf(el: Element, measure: Measure, hasKids: boolean): Box {
  switch (el.kind) {
    case 'part':
    case 'reference':
    case 'value':
      return usageBox(el, measure, hasKids);
    case 'constraintProperty':
      return constraintPropertyBox(el, measure);
    case 'package':
    case 'model':
    case 'modelLibrary':
    case 'view':
      return packageBox(el, measure, hasKids);
    case 'actor':
      return actorBox(el, measure);
    case 'useCase':
      return ellipseUseCaseBox(el, measure);
    case 'subject':
      return subjectBox(el, measure);
    case 'comment':
      return commentBox(el, measure);
    case 'state':
      return stateBox(el, measure, hasKids);
    case 'region':
      return regionBox();
    case 'initial':
      return initialBox();
    case 'final':
      return finalBox();
    case 'choice':
      return diamondBox();
    default:
      return blockBox(el, measure);
  }
}

function portOf(p: Port, fixed?: Box['fixedPorts']): GPort {
  const f = fixed?.find((x) => x.id === p.id);
  return {
    id: p.id,
    side: f?.side ?? sideOf(p),
    kind: p.kind,
    direction: p.direction,
    label:
      p.kind === 'param'
        ? p.name
        : p.type
          ? `${p.name} : ${p.conjugated ? '~' : ''}${p.type}`
          : p.name,
    fixed: f ? { x: f.x, y: f.y, label: f.label } : undefined,
  };
}

/** 関係 → 線。端の記号・点線・ELK に渡す向き・札 */
export function edgeOf(r: Relation, type: DiagramType): GEdge {
  const labels: GLabel[] = [];
  const end = (at: 'source' | 'target', role?: string, mult?: string) => {
    if (role) labels.push({ text: role, at });
    if (mult) labels.push({ text: mult, at });
  };
  end('source', r.sourceRole, r.sourceMult);
  end('target', r.targetRole, r.targetMult);
  const mid = (...xs: (string | undefined)[]) => {
    const text = xs.filter(Boolean).join(' ');
    if (text) labels.push({ text, at: 'center' });
  };
  const base = { id: r.id, kind: r.kind, source: r.source, target: r.target, labels };
  const nav = r.targetNavigable ? ('arrow' as const) : undefined;
  switch (r.kind) {
    case 'composition':
      mid(r.name);
      return { ...base, ends: { source: 'diamondFilled', target: nav } };
    case 'aggregation':
      mid(r.name);
      return { ...base, ends: { source: 'diamondHollow', target: nav } };
    case 'association':
      mid(r.name);
      return { ...base, ends: { target: nav } };
    case 'generalization':
      // 一般の側を上にまとめる（木の形）。右向きの図では束ねない（左右に木を作ると読みにくい）
      return {
        ...base,
        ends: { target: 'triangle' },
        reverse: true,
        merge: DIRECTION[type] === 'DOWN',
      };
    case 'dependency':
      mid(stereotypeText(r), r.name);
      return { ...base, ends: { target: 'arrow' }, dashed: true, reverse: true };
    case 'containment':
      return { ...base, ends: { source: 'crosshair' } };
    case 'connector':
      mid(r.name);
      return {
        ...base,
        ends: {},
        flows: (r.itemFlows ?? []).map((f) => ({ text: f.item, reverse: f.reverse })),
      };
    case 'binding':
      mid(r.name);
      return { ...base, ends: {} };
    case 'transition':
      mid(transitionText(r));
      return { ...base, ends: { target: 'arrow' } };
    case 'include':
      mid('«include»');
      return { ...base, ends: { target: 'arrow' }, dashed: true };
    case 'extend':
      mid('«extend»', r.guard ? `[${r.guard}]` : undefined);
      return { ...base, ends: { target: 'arrow' }, dashed: true, reverse: true };
    case 'anchor':
      return { ...base, ends: {}, dashed: true };
    case 'controlFlow':
    case 'objectFlow':
      // act は act.ts が引く。ここに来るのは図種の取り違え（checkModel が先に落とす）
      return { ...base, ends: { target: 'arrow' }, dashed: r.kind === 'controlFlow' };
  }
}

/** ELK に渡す形（入れ子は parent から木にする） */
export function graphSpec(model: Model, measure: Measure): GraphSpec {
  const kids = new Map<string, Element[]>();
  for (const el of model.elements) {
    const k = el.parent ?? '';
    kids.set(k, [...(kids.get(k) ?? []), el]);
  }
  const node = (el: Element): GNode => {
    const children = kids.get(el.id) ?? [];
    const box = boxOf(el, measure, children.length > 0);
    return {
      id: el.id,
      box,
      ports: (el.ports ?? []).map((p) => portOf(p, box.fixedPorts)),
      children: children.map(node),
      inert: el.kind === 'region',
    };
  };
  return {
    kind: model.frame.kind,
    rest: headerRest(model.frame),
    direction: DIRECTION[model.type],
    framePorts: (model.framePorts ?? []).map((p) => portOf(p)),
    nodes: (kids.get('') ?? []).map(node),
    edges: model.relations.map((r) => edgeOf(r, model.type)),
  };
}

/**
 * 図を並べる。measure を省くと推定幅を使う（Node 用）。
 * 描けないモデル（checkModel が NG を返す）は例外にする。
 */
export async function layoutDiagram(
  model: Model,
  measure: Measure = estimateWidth,
): Promise<DiagramLayout> {
  const ng = checkModel(model);
  if (ng.length > 0) throw new Error(`図にできない: ${ng.join(' / ')}`);
  if (model.type === 'act') return layoutAct(model, measure);
  if (model.type === 'sd') return layoutSd(model, measure);
  return layoutGraph(graphSpec(model, measure), measure);
}
