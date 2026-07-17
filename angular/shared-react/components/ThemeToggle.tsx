import React, { useEffect, useState } from 'react';

const THEME_CYCLE = ['steel', 'light', 'dark'] as const;
type Theme = (typeof THEME_CYCLE)[number];

const THEME_ICONS: Record<Theme, string> = {
  steel: '⚙',
  light: '☀',
  dark: '🌙',
};

function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'steel';
  const html = document.documentElement;
  if (html.classList.contains('theme-steel')) return 'steel';
  if (html.classList.contains('theme-light')) return 'light';
  if (html.classList.contains('theme-dark')) return 'dark';
  return 'steel';
}

function applyTheme(theme: Theme, storageKey: string) {
  const html = document.documentElement;
  html.classList.remove('theme-steel', 'theme-light', 'theme-dark', 'dark');
  html.classList.add(`theme-${theme}`);
  html.setAttribute('data-theme', `theme-${theme}`);
  if (theme === 'steel' || theme === 'dark') {
    html.classList.add('dark');
  }
  localStorage.setItem(storageKey, theme);
}

interface ThemeToggleProps {
  /** localStorage key for persisting the theme preference */
  storageKey: string;
}

export function ThemeToggle({ storageKey }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('steel');

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null;
    if (stored && THEME_CYCLE.includes(stored)) {
      setTheme(stored);
      applyTheme(stored, storageKey);
    } else {
      applyTheme('steel', storageKey);
    }
  }, [storageKey]);

  const cycle = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    applyTheme(next, storageKey);
  };

  return (
    <button
      onClick={cycle}
      className="fixed top-2 right-2 z-50 w-7 h-7 rounded-md flex items-center justify-center bg-gray-800/60 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all text-xs"
      title={`Theme: ${theme} (click to cycle)`}
    >
      {THEME_ICONS[theme]}
    </button>
  );
}
