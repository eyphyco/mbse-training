import { createContext, useContext } from 'react';
import type { Toast } from './toast';

export interface ToastContextValue {
  toasts: Toast[];
  /** 1 枚積む。id と時刻はこちらで付ける */
  notify: (toast: Omit<Toast, 'id' | 'at'>) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast は ToastProvider の内側で使ってください');
  return ctx;
}
