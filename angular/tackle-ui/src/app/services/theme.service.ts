import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'tackle-theme';
export type Theme = 'steel' | 'light' | 'dark';

const THEME_CYCLE: Theme[] = ['steel', 'light', 'dark'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('steel');

  constructor() {
    this.loadInitial();
  }

  private loadInitial() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'steel') {
      this.theme.set(stored as Theme);
      this.apply(stored as Theme);
      return;
    }
    this.apply('steel');
  }

  toggle() {
    const idx = THEME_CYCLE.indexOf(this.theme());
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    this.theme.set(next);
    localStorage.setItem(STORAGE_KEY, next);
    this.apply(next);
  }

  setTheme(t: Theme) {
    this.theme.set(t);
    localStorage.setItem(STORAGE_KEY, t);
    this.apply(t);
  }

  private apply(t: Theme) {
    document.documentElement.setAttribute('data-theme', t);
  }
}
