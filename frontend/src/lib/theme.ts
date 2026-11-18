import { useSyncExternalStore } from 'react';

/* Light / dark theme. The `dark` class on <html> switches every colour token
   (see index.css). index.html applies the saved choice before first paint. */
export type Theme = 'light' | 'dark';
const KEY = 'derm.theme';
const subs = new Set<() => void>();

const current = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

export function setTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.add('theme-switching'); // short colour cross-fade, see index.css
  root.classList.toggle('dark', t === 'dark');
  root.style.colorScheme = t;
  try { window.localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
  subs.forEach((f) => f());
  window.setTimeout(() => root.classList.remove('theme-switching'), 320);
}

export function useTheme(): Theme {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, current, () => 'light');
}
