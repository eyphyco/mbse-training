import { useEffect, useState } from 'react';

/**
 * 相対時刻（「3 分前」）のための現在時刻。描画の中で Date.now() を呼ぶと
 * 描くたびに値が変わって純粋でなくなるので、間隔を決めて state で配る。
 * 秒は出さないので既定は 30 秒ごと。
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
