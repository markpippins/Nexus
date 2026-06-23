import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'conduit-theme';
type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');

  constructor() {
    this.loadInitial();
  }

  private loadInitial() {
    // 1. localStorage preference
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      this.theme.set(stored);
      this.apply(stored);
      return;
    }
    // 2. System preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this.theme.set('light');
      this.apply('light');
      return;
    }
    // 3. Default dark
    this.apply('dark');
  }

  toggle() {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem(STORAGE_KEY, next);
    this.apply(next);
    this.animateTransition();
  }

  private apply(t: Theme) {
    document.documentElement.setAttribute('data-theme', t);
  }

  private animateTransition() {
    const html = document.documentElement;
    html.classList.add('theme-transitioning');
    setTimeout(() => html.classList.remove('theme-transitioning'), 300);
  }
}
