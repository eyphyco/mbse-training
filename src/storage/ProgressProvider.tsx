import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ProgressContext } from './progressContext';
import {
  dropItems,
  emptyProgress,
  loadProgress,
  markRead as markReadPure,
  unmarkRead as unmarkReadPure,
  recordAnswer,
  saveProgress,
} from './progress';
import type { ProgressData, Settings, Transition } from './progress';
import { dayOf, dueLabel } from './srs';
import { useToast } from '../components/toastContext';
import { itemName } from '../data/content';
import { LANE_INFO } from '../components/lanes';

/**
 * 進捗を持ち、変わるたびに保存する。
 *
 * 採点の直後に「どの項目がどこからどこへ動き、次はいつ出るか」を通知で出す（DESIGN.md §4.8・§9）。
 * これを出さないと、間隔反復が見えない仕組みになって信用されない。
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProgressData>(loadProgress);
  const [saveFailed, setSaveFailed] = useState(false);
  const [today, setToday] = useState(() => dayOf(Date.now()));
  const { notify } = useToast();
  // 答えた瞬間の値を使う（同じ描画の中で 2 回答えても取りこぼさない）
  const ref = useRef(data);
  useLayoutEffect(() => {
    ref.current = data;
  }, [data]);

  // localStorage（外の仕組み）へ書き写す。書けなかったことは画面のバッジで知らせる
  useEffect(() => {
    const ok = saveProgress(data);
    // eslint-disable-next-line react/set-state-in-effect -- 保存の成否は書いてみるまで分からない
    setSaveFailed(!ok);
  }, [data]);

  // 開いたまま日付をまたいだら「今日」を進める
  useEffect(() => {
    const t = setInterval(() => setToday(dayOf(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);

  const answer = useCallback(
    (problemId: string, items: string[], correct: boolean): Transition[] => {
      const now = new Date();
      const day = dayOf(now);
      const r = recordAnswer(ref.current, problemId, items, correct, now, day);
      ref.current = r.data;
      setData(r.data);
      for (const t of r.transitions) {
        const from = t.fromLevel === null ? '未着手' : `定着 ${t.fromLevel}`;
        const lane =
          t.fromLane !== t.toLane
            ? `${LANE_INFO[t.fromLane].name} → ${LANE_INFO[t.toLane].name}`
            : '';
        notify({
          tone: correct ? 'success' : 'danger',
          text: `${from} → 定着 ${t.toLevel}`,
          detail: `${itemName(t.itemId)} ・ 次は${dueLabel(t.dueOn, day)}`,
          note: t.early
            ? '出題日より前に解いたので定着度は上げていません（間隔を飛ばさないため）'
            : lane || undefined,
        });
      }
      return r.transitions;
    },
    [notify],
  );

  const value = useMemo(
    () => ({
      data,
      today,
      answer,
      markRead: (items: string[], sectionId?: string) =>
        setData((d) => markReadPure(d, items, dayOf(Date.now()), sectionId)),
      unmarkRead: (items: string[], sectionId: string) =>
        setData((d) => unmarkReadPure(d, items, sectionId)),
      addMemo: (itemId: string, text: string) =>
        setData((d) => ({
          ...d,
          memos: {
            ...d.memos,
            [itemId]: [{ at: new Date().toISOString(), text }, ...(d.memos[itemId] ?? [])],
          },
        })),
      removeMemo: (itemId: string, at: string) =>
        setData((d) => ({
          ...d,
          memos: { ...d.memos, [itemId]: (d.memos[itemId] ?? []).filter((m) => m.at !== at) },
        })),
      setSettings: (s: Partial<Settings>) =>
        setData((d) => ({ ...d, settings: { ...d.settings, ...s } })),
      recordExam: (record: ProgressData['exams'][number], dropped: string[]) =>
        setData((d) => {
          const next = dropItems(d, dropped, dayOf(Date.now()));
          return { ...next, exams: [record, ...d.exams] };
        }),
      replace: (next: ProgressData) => setData(next),
      reset: () => setData(emptyProgress()),
      saveFailed,
    }),
    [data, today, answer, saveFailed],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}
