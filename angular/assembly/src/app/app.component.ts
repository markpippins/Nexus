import { Component, inject, signal, OnInit, OnDestroy, effect, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, Event, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService, Counts } from './services/data.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { HeaderComponent } from './components/header/header.component';
import { ToastComponent } from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent, ToastComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private themeChangeHandler = (e: MediaQueryListEvent) => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('assembly-theme');
    } catch {}
    if (saved) return;
    // System dark preference maps to 'dark' theme
    this.currentTheme.set(e.matches ? 'dark' : 'light');
  };

  counts = signal<Counts | null>(null);
  sidebarCollapsed = signal(false);
  sidebarOpenMobile = signal(false);
  currentTheme = signal<'light' | 'steel' | 'dark'>('light');
  currentRouteLabel = signal('Feed');

  ngOnInit() {
    this.dataService.getCounts().subscribe(counts => this.counts.set(counts));
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event: Event) => {
      if (event instanceof NavigationEnd) {
        const path = this.router.url.split('/')[1] || 'feed';
        this.currentRouteLabel.set(labelForRoute(path));
        this.sidebarOpenMobile.set(false);
      }
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleMobileSidebar() {
    this.sidebarOpenMobile.update(v => !v);
  }

  closeMobileSidebar() {
    this.sidebarOpenMobile.set(false);
  }

  toggleTheme() {
    this.currentTheme.update(t => {
      // cycle: light → steel → dark → light
      const next = t === 'light' ? 'steel' : t === 'steel' ? 'dark' : 'light';
      try {
        localStorage.setItem('assembly-theme', next);
      } catch {}
      return next;
    });
  }

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('assembly-theme');
    } catch {}
    if (saved && ['light', 'steel', 'dark'].includes(saved)) {
      this.currentTheme.set(saved as 'light' | 'steel' | 'dark');
    } else {
      const prefersDark = this.mediaQuery.matches;
      this.currentTheme.set(prefersDark ? 'dark' : 'light');
    }
    this.applyThemeClasses();

    this.mediaQuery.addEventListener('change', this.themeChangeHandler);

    effect(() => {
      this.applyThemeClasses();
    });
  }

  private applyThemeClasses() {
    const el = document.documentElement;
    const theme = this.currentTheme();
    // Remove all theme classes
    el.classList.remove('dark', 'steel');
    if (theme === 'steel') {
      el.classList.add('dark', 'steel');
    } else if (theme === 'dark') {
      el.classList.add('dark');
    }
    // light: no classes
  }

  ngOnDestroy() {
    this.mediaQuery.removeEventListener('change', this.themeChangeHandler);
  }
}

function labelForRoute(path: string): string {
  const labels: Record<string, string> = {
    feed: 'Feed',
    forums: 'Forums',
    'work-requests': 'Work Requests',
    requirements: 'Requirements',
    agendas: 'Agendas',
    candidates: 'Candidates',
    harvests: 'Harvests',
    conversations: 'Conversations',
    'open-questions': 'Open Questions',
    intents: 'Intent Records',
    assessments: 'Assessments',
    observations: 'Observations',
    reports: 'Reports',
    'agent-records': 'Agent Records',
    specifications: 'Specifications',
    specs: 'Specs',
    plans: 'Plans',
    agents: 'Agents',
    profile: 'Profile',
    settings: 'Settings',
  };
  return labels[path] || path;
}
