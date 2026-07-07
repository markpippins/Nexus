import { Injectable, signal, inject } from '@angular/core';
import { UiEventBusService } from './ui-event-bus.service';

const STORAGE_KEY = 'conduit-theme';
export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');
  private eventBus = inject(UiEventBusService);

  constructor() {
    this.loadInitial();
    this.connectToEventBus();
  }

  private connectToEventBus(): void {
    this.eventBus.connect('conduit-ui');

    // Subscribe to theme changes from nexus-console (or other apps)
    this.eventBus.onThemeChange((theme) => {
      console.log(`[ThemeService] received theme change from event bus:`, theme);
      // Map nexus-console theme names to conduit-ui's dark/light
      // Only theme-light maps to 'light'; theme-steel and theme-dark both map to 'dark'
      const mapped: Theme = theme === 'theme-light' ? 'light' : 'dark';
      this.theme.set(mapped);
      localStorage.setItem(STORAGE_KEY, mapped);
      this.apply(mapped);
      this.animateTransition();
    });
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
