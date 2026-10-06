/**
 * ブロック定義図（bdd）。並べ方は他の箱の図と共通（graph.ts）で、ここは入口だけ残す。
 *
 * 上下の向きは SysML の慣習に合わせる。**全体・一般が上、部分・特化が下**。
 * 汎化はモデル上「特化 → 一般」の向きなので、ELK には逆向きに渡して戻す（diagrams.ts）。
 */
import { estimateWidth } from './metrics.ts';
import type { Measure } from './metrics.ts';
import type { Model } from './model.ts';
import { layoutDiagram } from './diagrams.ts';

export { blockContent } from './shapes.ts';

export function layoutBdd(model: Model, measure: Measure = estimateWidth) {
  return layoutDiagram(model, measure);
}
