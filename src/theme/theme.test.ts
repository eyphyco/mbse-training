import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, prefersDark, readStoredTheme, resolveTheme, THEME_KEY } from './theme';

const mockPrefersDark = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: dark && q.includes('dark'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('readStoredTheme', () => {
  it('未設定なら system', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it.each(['light', 'dark', 'system'] as const)('保存済みの %s を読める', (choice) => {
    localStorage.setItem(THEME_KEY, choice);
    expect(readStoredTheme()).toBe(choice);
  });

  it('知らない値は system に落とす', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(readStoredTheme()).toBe('system');
  });

  it('localStorage が読めなくても system を返す', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStoredTheme()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('明示的な選択はそのまま返す', () => {
    mockPrefersDark(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('system は OS 設定に従う', () => {
    mockPrefersDark(true);
    expect(resolveTheme('system')).toBe('dark');
    mockPrefersDark(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('matchMedia が無い環境では light 扱い', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersDark()).toBe(false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme', () => {
  it('data-theme を書き換える', () => {
    mockPrefersDark(false);
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('選択を保存する', () => {
    mockPrefersDark(false);
    applyTheme('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('system を選んだら保存を消す（OS 追従に戻す）', () => {
    mockPrefersDark(true);
    applyTheme('dark');
    expect(applyTheme('system')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('保存できなくても表示は切り替わる', () => {
    mockPrefersDark(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  // index.html の先読みスクリプトと同じ結果になること
  it.each([
    ['light', false, 'light'],
    ['dark', false, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('%s / OS ダーク=%s → %s', (choice, osDark, expected) => {
    mockPrefersDark(osDark);
    expect(applyTheme(choice)).toBe(expected);
    expect(document.documentElement.dataset.theme).toBe(expected);
  });
});
