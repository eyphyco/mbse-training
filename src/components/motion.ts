import type { Transition, Variants } from 'motion/react';

/**
 * 動きの語彙。配色を index.css の変数 1 か所に集めたのと同じ理由で、
 * 時間・イージング・移動量もここだけで決める。
 *
 * 方針:
 *   - 移動は 4〜8px。大きく動かすと安っぽく見える
 *   - 入りは速く（〜220ms）、出はさらに速く。操作の邪魔をしない
 *   - 位置が入れ替わるもの（つまみ・下線）だけバネ。跳ね返らない値にする
 */

/** 入場・退場に使うイージング（ease-out 寄り） */
export const EASE_OUT = [0.22, 0.61, 0.36, 1] as const;

/** つまみや下線が滑る動き。overshoot しない設定 */
export const SLIDE: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 44,
  mass: 0.7,
};

/** 開閉（高さのアニメーション） */
export const COLLAPSE: Transition = { duration: 0.26, ease: EASE_OUT };

/** 結果やヒントが現れるとき。少し下から浮かせる */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } },
  gone: { opacity: 0, y: -4, transition: { duration: 0.14, ease: EASE_OUT } },
};

/**
 * 続けて出る塊。親に付けると、RISE を持つ子が少しずつ遅れて出る。
 * 一度に 3〜4 枚出るところ（模範解答・解説・自己採点）で、
 * 上から順に読ませたいときに使う。
 */
export const STAGGER: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.05 } },
};

/** 画面遷移。位置は動かさず、切り替わりの断絶だけ和らげる */
export const PAGE: Transition = { duration: 0.15, ease: EASE_OUT };
