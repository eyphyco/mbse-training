import type { Lane } from '../storage/progress';

/**
 * レーンの名前・副題・色（DESIGN.md §4.2・§4.4）。
 *
 * 並び順は WHITEBOARD に倣い「今日のボール」を一番上に置く。
 * DESIGN.md の表は 未着手 → 定着 の順だが、ボードを開いて最初に目に入るべきは
 * 「落とした（今日出る）」なので、そこから始めて、遠い先のものほど下へ置く。
 *
 * 色は飾りではなく区別の補助。必ず名前と一緒に出す（二重符号化）。
 */
export const LANE_ORDER: Lane[] = ['dropped', 'solved', 'read', 'untouched', 'mature', 'outside'];

export const LANE_INFO: Record<
  Lane,
  { name: string; sub: string; next: string; color: string; tile: string; empty: string }
> = {
  dropped: {
    name: '落とした',
    sub: 'もう一度出す',
    next: '今日出る',
    color: 'var(--c-lane-orange)',
    tile: 'orange',
    empty: 'ここが空なのが正常。間違えた項目がここに来て、翌日また出ます',
  },
  solved: {
    name: '解いた',
    sub: '日が来たら出る',
    next: '出題日を待つ',
    color: 'var(--c-lane-blue)',
    tile: 'blue',
    empty: '問題を解いた項目がここに並びます',
  },
  read: {
    name: '読んだ',
    sub: '教材だけ',
    next: 'Lv1 を解く',
    color: 'var(--c-lane-purple)',
    tile: 'purple',
    empty: '教材を読んで、まだ問題を解いていない項目がここに来ます',
  },
  untouched: {
    name: '未着手',
    sub: 'まだ触れていない',
    next: '教材を読む',
    color: 'var(--c-lane-gray)',
    tile: 'gray',
    empty: '全項目に着手済み',
  },
  mature: {
    name: '定着',
    sub: '置いておける',
    next: '何もしない',
    color: 'var(--c-lane-green)',
    tile: 'green',
    empty: '連続で通った項目（定着度 5）がここに来ます',
  },
  outside: {
    name: '範囲外',
    sub: 'この級では出ない',
    next: '何もしない',
    color: 'var(--c-lane-gray)',
    tile: 'gray',
    empty: '上位級（Intermediate / Advanced）の項目はまだ取り込んでいません',
  },
};
