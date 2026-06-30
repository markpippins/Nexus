import { Component, signal, effect, OnInit, OnDestroy, Inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { BuilderStatusComponent } from './components/builder-status/builder-status.component';
import { AgentStatusBarComponent } from './components/agent-status-bar/agent-status-bar.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { KeyboardHelpComponent } from './components/keyboard-help/keyboard-help.component';

import { PlansSidebarComponent } from './components/plans-sidebar/plans-sidebar.component';
import { ConduitService } from './services/conduit.service';
import { ThemeService } from './services/theme.service';
import { GlobalErrorService } from './services/global-error.service';
import { KeyboardShortcutService } from './services/keyboard.service';

interface NavItem {
  route: string;
  svgPath: string;
  label: string;
  exact?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NgFor,
    RouterModule,
    BuilderStatusComponent,
    AgentStatusBarComponent,
    ToastContainerComponent,
    KeyboardHelpComponent,
    PlansSidebarComponent,
  ],
  template: `
    <div class="app-shell">
      <!-- Keyboard shortcut help overlay -->
      <app-keyboard-help></app-keyboard-help>

      <!-- Toast notifications -->
      <app-toast-container></app-toast-container>

      <!-- Global error banner -->
      @if (globalError(); as err) {
        <div class="global-error">
          ⚠ {{ err.message }}
          <button class="dismiss-btn" (click)="dismissError()">✕</button>
        </div>
      }

      <!-- Top horizontal toolbar -->
      <nav class="top-navbar">
        <div class="top-nav-items">
          <a
            *ngFor="let item of navItems"
            class="nav-icon-btn"
            [routerLink]="item.route"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: !!item.exact }"
            [title]="item.label + ' (' + item.shortcut + ')'"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.svgPath" />
            </svg>
          </a>
        </div>
        <div class="nav-spacer"></div>
        <div class="top-nav-actions">
          <button class="nav-icon-btn" (click)="toggleTheme()" [title]="'Switch theme (Ctrl+T)'">
            @if (theme.theme() === 'dark') {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            }
            @if (theme.theme() === 'light') {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            }
          </button>
          <a class="nav-icon-btn temporal-btn" href="http://localhost:8233" target="_blank" rel="noopener noreferrer" title="Temporal Web UI">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </a>
        </div>
      </nav>

      <div class="layout-body">
        <!-- Plans sidebar (resizable) -->
        <app-plans-sidebar
          [(width)]="sidebarWidth"
          [(collapsed)]="sidebarCollapsed"
        ></app-plans-sidebar>

        <!-- Main content area -->
        <div class="main-content">
          <!-- Builder status bar -->
          <app-builder-status></app-builder-status>

          <!-- Agent status bar -->
          <app-agent-status-bar></app-agent-status-bar>

          <!-- Offline banner -->
          @if (offline()) {
            <div class="offline-banner">
              ⚠ Pipeline server offline — showing cached state if available
            </div>
          }

          <!-- Routed view -->
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
  styles: [
    `.app-shell{display:flex;flex-direction:column;height:100vh;overflow:hidden}`,
    `.global-error{background:var(--accent-red-bg,#fef2f2);color:var(--accent-red-text,#991b1b);padding:8px 16px;font-size:13px;display:flex;align-items:center;gap:12px;flex-shrink:0;border-bottom:1px solid var(--accent-red,#dc2626)}`,
    `.dismiss-btn{margin-left:auto;background:none;border:none;color:var(--accent-red-text);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px}.dismiss-btn:hover{background:rgba(0,0,0,0.1)}`,

    /* ── Top Toolbar ── */
    `.top-navbar{height:48px;min-height:48px;display:flex;align-items:center;background:var(--bg-primary,#0f172a);border-bottom:1px solid var(--border-default,#475569);padding:0 8px;flex-shrink:0;z-index:5;gap:4px}`,
    `.top-nav-items{display:flex;align-items:center;gap:2px;overflow-x:auto;flex-shrink:0}`,
    `.nav-spacer{margin-left:auto}`,
    `.top-nav-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}`,
    `.nav-icon-btn{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:none;background:transparent;color:var(--text-muted,#64748b);cursor:pointer;text-decoration:none;transition:all .2s;flex-shrink:0}`,
    `.nav-icon-btn svg{width:20px;height:20px;flex-shrink:0}`,
    `.nav-icon-btn:hover{background:var(--bg-secondary,#1e293b);color:var(--text-primary,#f1f5f9)}`,
    `.nav-icon-btn.active{background:var(--accent-blue-bg,#1e3a5f);color:var(--accent-blue-text,#93c5fd)}`,
    `.nav-icon-btn:active{transform:scale(.92)}`,
    `.temporal-btn{opacity:.5}.temporal-btn:hover{opacity:1}`,
    `.layout-body{display:flex;flex:1;min-height:0;overflow:hidden}`,
    `.main-content{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}`,
    `.offline-banner{background:#fef3c7;color:#92400e;text-align:center;padding:6px;font-size:12px;flex-shrink:0}`,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly offline = signal(false);
  readonly globalError = signal<{ message: string; timestamp: string } | null>(null);
  readonly sidebarWidth = signal(280);
  readonly sidebarCollapsed = signal(false);

  readonly navItems: (NavItem & { shortcut: string })[] = [
    {
      route: '/', label: 'Pipeline', exact: true, shortcut: '1',
      svgPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    },
    {
      route: '/kanban', label: 'Kanban', shortcut: '2',
      svgPath: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
    },
    {
      route: '/archive', label: 'Archive', shortcut: '3',
      svgPath: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    },
    {
      route: '/inspections', label: 'Inspections', shortcut: '4',
      svgPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    },
    {
      route: '/prompts', label: 'Prompts', shortcut: '5',
      svgPath: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    },
    {
      route: '/analytics', label: 'Analytics', shortcut: '6',
      svgPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    },
    {
      route: '/changes', label: 'Changes', shortcut: '7',
      svgPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    },
    {
      route: '/graph', label: 'Graph', shortcut: '8',
      svgPath: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    },
    {
      route: '/sessions', label: 'Sessions', shortcut: '9',
      svgPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  ];

  private readonly viewRoutes: Record<string, string> = {
    '1': '/',
    '2': '/kanban',
    '3': '/archive',
    '4': '/inspections',
    '5': '/prompts',
    '6': '/analytics',
    '7': '/changes',
    '8': '/graph',
    '9': '/sessions',
  };

  constructor(
    private pipeline: ConduitService,
    public theme: ThemeService,
    private errorService: GlobalErrorService,
    private router: Router,
    private kb: KeyboardShortcutService,
    @Inject(DOCUMENT) private doc: Document,
  ) {
    effect(() => {
      this.offline.set(this.pipeline.offline());
    });
    effect(() => {
      this.globalError.set(this.errorService.lastError());
    });
  }

  ngOnInit(): void {
    // Attach global keydown listener
    this.kb.attach(this.doc);

    // Register global shortcuts for view navigation
    for (const [key, route] of Object.entries(this.viewRoutes)) {
      this.kb.registerGlobal({
        key,
        description: this.labelForRoute(route),
        handler: () => this.router.navigateByUrl(route),
        preventDefault: true,
      });
    }

    // Toggle sidebar
    this.kb.registerGlobal({
      key: 'b',
      description: 'Toggle plans sidebar',
      handler: () => this.sidebarCollapsed.update(v => !v),
      preventDefault: true,
    });

    // Theme toggle
    this.kb.registerGlobal({
      key: 't',
      description: 'Toggle dark/light theme',
      handler: () => this.theme.toggle(),
    });

    // Help overlay
    this.kb.registerGlobal({
      key: '?',
      description: 'Show/hide keyboard shortcuts',
      handler: () => this.kb.toggleHelp(),
    });

    // Escape closes help overlay
    this.kb.registerGlobal({
      key: 'Escape',
      description: 'Close help overlay / dismiss',
      handler: () => {
        if (this.kb.helpVisible) {
          this.kb.toggleHelp();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.kb.detach(this.doc);
    for (const key of Object.keys(this.viewRoutes)) {
      this.kb.unregisterGlobal(key);
    }
    this.kb.unregisterGlobal('b');
    this.kb.unregisterGlobal('t');
    this.kb.unregisterGlobal('?');
    this.kb.unregisterGlobal('Escape');
  }

  dismissError() { this.errorService.clear(); }

  toggleTheme() { this.theme.toggle(); }

  private labelForRoute(route: string): string {
    const labels: Record<string, string> = {
      '/': 'Go to Pipeline',
      '/kanban': 'Go to Kanban',
      '/archive': 'Go to Archive',
      '/inspections': 'Go to Inspections',
      '/prompts': 'Go to Prompts',
      '/analytics': 'Go to Analytics',
      '/changes': 'Go to Changes',
      '/graph': 'Go to Graph',
      '/sessions': 'Go to Sessions',
    };
    return labels[route] || `Navigate to ${route}`;
  }
}
