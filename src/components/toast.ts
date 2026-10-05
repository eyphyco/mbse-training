/**
 * 積み上がる通知。
 *
 * 数秒で流れて消える形にしていない。1 問ごとの結果が消えてしまうと
 * 「さっきの数問で何が変わったか」を振り返れないため、押して消すまで残す。
 *
 * ただし記録の持ち主はここではない。長く残るのはホームの「学習の記録」
 * （進捗の history）で、これはその直近ぶんを画面の隅に出しておくだけ。
 * だから枚数を決め打ちし、古いものは黙って落とす。
 */

export type ToastTone = 'success' | 'danger' | 'warning' | 'neutral';

export interface Toast {
  id: number;
  /** 何がどう動いたか。「未正解 → 正解済み」のように遷移で言い切る */
  text: string;
  /** 何についての話か（問題の題名） */
  detail?: string;
  /** 言い添えること（上限に当たった・記録は下がらない 等） */
  note?: string;
  tone: ToastTone;
  /** 積んだ時刻（epoch ms）。表示は相対時刻にする */
  at: number;
}

/** 画面に出しておく枚数 */
export const VISIBLE_LIMIT = 3;

export function pushToast(
  list: readonly Toast[],
  toast: Toast,
  limit: number = VISIBLE_LIMIT,
): Toast[] {
  return [toast, ...list].slice(0, limit);
}

export function dismissToast(list: readonly Toast[], id: number): Toast[] {
  return list.filter((t) => t.id !== id);
}

/**
 * 相対時刻。秒は出さない。
 * 1 秒ごとに書き換わるものが画面の隅にあると、そのたびに目が行く。
 */
export function relativeLabel(at: number, now: number): string {
  const sec = Math.floor((now - at) / 1000);
  if (sec < 60) return 'たった今';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 時間前`;
  return `${Math.floor(hour / 24)} 日前`;
}
