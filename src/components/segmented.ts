/**
 * セグメンテッドコントロールの当たり判定。
 * 画面に触らない部分だけを切り出して、単体で確かめられるようにしてある。
 */

/** つまみを離した位置 x から、いちばん近い区画の番号を返す */
export function nearestIndex(x: number, positions: number[]): number {
  let best = 0;
  for (let i = 1; i < positions.length; i += 1) {
    if (Math.abs(positions[i] - x) < Math.abs(positions[best] - x)) best = i;
  }
  return best;
}
