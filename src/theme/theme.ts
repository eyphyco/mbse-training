export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'mbse-training:theme';

const isChoice = (v: unknown): v is ThemeChoice => v === 'light' || v === 'dark' || v === 'system';

export function readStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isChoice(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light';
  return choice;
}

/**
 * 色をつなぐ時間（ミリ秒）。index.css の .theme-fading と揃える。
 * 実際に落ち着くまでは、色の距離によってこれより長くかかる
 * （黒→白のような遠い色は倍近く要る）。クラスはそのぶん長く付けておく。
 */
export const FADE_MS = 200;

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 切り替えの間だけ、色の変化に時間をかける。
 *
 * 白と黒が 1 フレームで入れ替わると目に痛いので、短く繋ぐ。
 * 常時 * に transition を掛けると操作のたびに重くなるため、
 * 切り替えの前後だけクラスで有効にして外す。
 */
function fadeColors(): void {
  const root = document.documentElement;
  root.classList.add('theme-fading');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove('theme-fading'), FADE_MS * 2 + 120);
}

/** <html data-theme="..."> を書き換える。index.html の先読みスクリプトと同じ規則 */
export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  if (resolved !== document.documentElement.dataset.theme) fadeColors();
  document.documentElement.setAttribute('data-theme', resolved);
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* 保存できなくても表示は切り替わる */
  }
  return resolved;
}
