import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyTheme, readStoredTheme, resolveTheme } from './theme';
import type { ResolvedTheme, ThemeChoice } from './theme';
import { ThemeContext } from './themeContext';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    setResolved(applyTheme(next));
  }, []);

  // system を選んでいる間は OS 側の切り替えに追従する
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
