import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { dismissToast, pushToast, relativeLabel, type Toast, type ToastTone } from './toast';
import { ToastContext } from './toastContext';
import { IconCheck, IconDash, IconX } from './icons';
import { SLIDE } from './motion';

/** 相対時刻を書き換える間隔。秒は出さないので 30 秒でよい */
const TICK_MS = 30_000;

const TONE: Record<ToastTone, { text: string; mark: string }> = {
  success: { text: 'text-success', mark: 'border-success-line bg-success-soft text-success' },
  danger: { text: 'text-danger', mark: 'border-danger-line bg-danger-soft text-danger' },
  warning: { text: 'text-warning', mark: 'border-warning-line bg-warning-soft text-warning' },
  neutral: { text: 'text-fg', mark: 'border-line bg-raised text-subtle' },
};

function Stack({
  toasts,
  dismiss,
  clear,
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
  clear: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 積んである間だけ時計を回す。空なら止める
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [toasts.length]);

  /*
    出ている高さを --toast-space に書き出す。積み場は画面の右下に固定して
    あるので、何もしないと一番下まで送ったときに前後送りの「次の問題」が
    札の下に隠れる（実際に隠れていた）。この値の分だけ本文の下に余白を
    足す（既にある内容は動かず、下の空きが増えるだけ）。

    決め打ちの余白にしないのは、札の高さが言い添えの行数で変わるため。
  */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const write = () => {
      const h = toasts.length === 0 ? 0 : (boxRef.current?.offsetHeight ?? 0);
      root.style.setProperty('--toast-space', h === 0 ? '0px' : `${h + 12}px`);
    };
    write();
    if (!boxRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(write);
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      root.style.setProperty('--toast-space', '0px');
    };
  }, [toasts]);

  return (
    /*
      読み上げはここでは行わない（aria-live="off"）。採点の結果は
      LiveMessage が既に読み上げているので、二重に喋ることになる。
      消すボタンは操作子なので、領域ごと aria-hidden にはしない。

      枠は pointer-events を通し、札だけが受け取る。下にあるものを
      指せなくなる範囲を、実際に札が載っている所だけに留める。
    */
    <div
      ref={boxRef}
      data-testid="toast-stack"
      role="log"
      aria-live="off"
      className="pointer-events-none fixed right-3 bottom-3 z-30 flex w-[min(21rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            data-testid="toast"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, transition: { duration: 0.14 } }}
            transition={SLIDE}
            className="panel pointer-events-auto flex items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5"
          >
            <span
              className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${TONE[t.tone].mark}`}
            >
              {t.tone === 'success' ? (
                <IconCheck size={9} />
              ) : t.tone === 'danger' ? (
                <IconX size={9} />
              ) : (
                <IconDash size={9} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className={`text-tiny font-medium ${TONE[t.tone].text}`}>{t.text}</p>
                <span className="tnum ml-auto shrink-0 text-micro text-subtle">
                  {relativeLabel(t.at, now)}
                </span>
              </div>
              {t.detail !== undefined && (
                <p className="mt-0.5 truncate text-micro text-muted">{t.detail}</p>
              )}
              {t.note !== undefined && (
                <p className="mt-1 text-micro leading-relaxed text-subtle">{t.note}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="この通知を消す"
              className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1 text-subtle hover:bg-raised hover:text-fg"
            >
              <IconX size={10} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      {toasts.length > 1 && (
        <button
          type="button"
          onClick={clear}
          data-testid="toast-clear"
          className="panel-edge pointer-events-auto self-end rounded-full border border-line bg-surface px-2.5 py-1 text-micro text-muted hover:text-fg"
        >
          まとめて消す
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // 連番。同じミリ秒に 2 枚積まれても key が衝突しないようにする
  const seq = useRef(0);

  const notify = useCallback((toast: Omit<Toast, 'id' | 'at'>) => {
    seq.current += 1;
    setToasts((prev) => pushToast(prev, { ...toast, id: seq.current, at: Date.now() }));
  }, []);

  const dismiss = useCallback((id: number) => setToasts((prev) => dismissToast(prev, id)), []);
  const clear = useCallback(() => setToasts([]), []);

  const value = useMemo(
    () => ({ toasts, notify, dismiss, clear }),
    [toasts, notify, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Stack toasts={toasts} dismiss={dismiss} clear={clear} />
    </ToastContext.Provider>
  );
}
