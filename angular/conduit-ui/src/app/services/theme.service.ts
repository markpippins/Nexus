import { Injectable, signal, inject } from '@angular/core';
import { UiEventBusService } from './ui-event-bus.service';

const STORAGE_KEY = 'conduit-theme';
export type Theme = 'steel' | 'light' | 'dark';

const THEME_CYCLE: Theme[] = ['steel', 'light', 'dark'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('steel');
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
      // Map nexus-console theme names to conduit-ui's themes
      const mapped = this.mapExternalTheme(theme);
      this.theme.set(mapped);
      localStorage.setItem(STORAGE_KEY, mapped);
      this.apply(mapped);
      this.animateTransition();
    });
  }

  private mapExternalTheme(external: string): Theme {
    switch (external) {
      case 'theme-light': return 'light';
      case 'theme-dark': return 'dark';
      case 'theme-steel': return 'steel';
      default: return 'steel';
    }
  }

  private loadInitial() {
    // 1. localStorage preference
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'steel') {
      this.theme.set(stored as Theme);
      this.apply(stored as Theme);
      return;
    }
    // 2. Default steel
    this.apply('steel');
  }

  toggle() {
    const idx = THEME_CYCLE.indexOf(this.theme());
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    this.theme.set(next);
    localStorage.setItem(STORAGE_KEY, next);
    this.apply(next);
    this.animateTransition();
  }

  setTheme(t: Theme) {
    this.theme.set(t);
    localStorage.setItem(STORAGE_KEY, t);
    this.apply(t);
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
