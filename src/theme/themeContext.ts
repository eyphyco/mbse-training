import { createContext, useContext } from 'react';
import type { ResolvedTheme, ThemeChoice } from './theme';

export interface ThemeContextValue {
  /** 利用者の選択（system を含む） */
  choice: ThemeChoice;
  /** 実際に適用されている配色 */
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme は ThemeProvider の内側で使ってください');
  return ctx;
}
