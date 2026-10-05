import { createContext, useContext } from 'react';
import type { ProgressData, Settings, Transition } from './progress';

export interface ProgressContextValue {
  data: ProgressData;
  /** 今日（JST の暦日）。日付をまたいだら変わる */
  today: string;
  /** 答えを記録し、動いた項目を通知に出す */
  answer: (problemId: string, items: string[], correct: boolean) => Transition[];
  markRead: (items: string[]) => void;
  addMemo: (itemId: string, text: string) => void;
  removeMemo: (itemId: string, at: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  /** 模擬試験の結果。落とした項目は level 0 に落とす */
  recordExam: (record: ProgressData['exams'][number], dropped: string[]) => void;
  replace: (data: ProgressData) => void;
  reset: () => void;
  /** 保存に失敗しているか（プライベートモード等） */
  saveFailed: boolean;
}

export const ProgressContext = createContext<ProgressContextValue | null>(null);

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress は ProgressProvider の内側で使ってください');
  return ctx;
}
