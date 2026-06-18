import { Component, signal, effect, OnInit, OnDestroy, Inject, ViewChild } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { BuilderStatusComponent } from './components/builder-status/builder-status.component';
import { AgentStatusBarComponent } from './components/agent-status-bar/agent-status-bar.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { KeyboardHelpComponent } from './components/keyboard-help/keyboard-help.component';
import { MessageBoxContainerComponent } from './components/message-box-container/message-box-container.component';
import { AIConfigDialogComponent } from './components/ai-config-dialog/ai-config-dialog.component';
import { ConduitService } from './services/conduit.service';
import { ThemeService } from './services/theme.service';
import { GlobalErrorService } from './services/global-error.service';
import { KeyboardShortcutService } from './services/keyboard.service';
import { MessageBoxService } from './services/message-box.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NgIf,
    RouterModule,
    BuilderStatusComponent,
    AgentStatusBarComponent,
    ToastContainerComponent,
    KeyboardHelpComponent,
    MessageBoxContainerComponent,
    AIConfigDialogComponent,
  ],
  template: `
    <div class="app-shell">
      <!-- Keyboard shortcut help overlay -->
      <app-keyboard-help></app-keyboard-help>

      <!-- Toast notifications -->
      <app-toast-container></app-toast-container>

      <!-- AI config dialog -->
      <app-ai-config-dialog #aiConfigDialog></app-ai-config-dialog>

      <!-- Gmail-style LLM message boxes -->
      <app-message-box-container></app-message-box-container>

      <!-- Global error banner -->
      <div class="global-error" *ngIf="globalError() as err">
        ⚠ {{ err.message }}
        <button class="dismiss-btn" (click)="dismissError()">✕</button>
      </div>

      <!-- Builder status bar -->
      <app-builder-status></app-builder-status>

      <!-- Agent status bar -->
      <app-agent-status-bar></app-agent-status-bar>

      <!-- Navigation tabs -->
      <div class="nav-tabs">
        <a class="nav-tab" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">🏠 Overview</a>
        <a class="nav-tab" routerLink="/planner" routerLinkActive="active">📋 Planner</a>
        <a class="nav-tab" routerLink="/kanban" routerLinkActive="active">🏗 Kanban</a>
        <a class="nav-tab" routerLink="/archive" routerLinkActive="active">🔍 Archive</a>
        <a class="nav-tab" routerLink="/inspections" routerLinkActive="active">🔎 Inspect</a>
        <a class="nav-tab" routerLink="/prompts" routerLinkActive="active">📝 Prompts</a>
        <a class="nav-tab" routerLink="/analytics" routerLinkActive="active">📊 Analytics</a>
        <a class="nav-tab" routerLink="/changes" routerLinkActive="active">📋 Changes</a>
        <a class="nav-tab" routerLink="/graph" routerLinkActive="active">🔗 Graph</a>
        <a class="nav-tab" routerLink="/sessions" routerLinkActive="active">📊 Sessions</a>
        <div class="nav-actions">
          <a class="nav-tool-btn" href="http://localhost:8233" target="_blank" rel="noopener noreferrer"
            title="Temporal Web UI — workflow history, stack traces, event timelines">🔄</a>
          <button class="nav-tool-btn" (click)="openChat()" title="New chat">💬</button>
          <button class="nav-tool-btn" (click)="openConfig()" title="AI configuration">⚙</button>
          <button class="nav-tool-btn" (click)="toggleTheme()"
            [title]="theme.theme()==='dark'?'Switch to light theme':'Switch to dark theme'">
            {{ themeIcon() }}
          </button>
        </div>
      </div>

      <!-- Offline banner -->
      <div class="offline-banner" *ngIf="offline()">
        ⚠ Pipeline server offline — showing cached state if available
      </div>

      <!-- Routed view -->
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [
    `.app-shell{display:flex;flex-direction:column;height:100vh;overflow:hidden}`,
    `.global-error{background:var(--accent-red-bg,#fef2f2);color:var(--accent-red-text,#991b1b);padding:8px 16px;font-size:13px;display:flex;align-items:center;gap:12px;flex-shrink:0;border-bottom:1px solid var(--accent-red,#dc2626)}`,
    `.dismiss-btn{margin-left:auto;background:none;border:none;color:var(--accent-red-text);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px}.dismiss-btn:hover{background:rgba(0,0,0,0.1)}`,
    `.nav-tabs{display:flex;gap:4px;padding:6px 12px;background:var(--bg-primary);border-bottom:1px solid var(--border-default);overflow-x:auto;flex-shrink:0}`,
    `.nav-tab{background:none;border:none;color:var(--text-muted);padding:6px 12px;font-size:13px;cursor:pointer;border-radius:6px;text-decoration:none;white-space:nowrap;transition:background .15s}`,
    `.nav-tab:hover{background:var(--bg-secondary)}.nav-tab.active{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.nav-actions{margin-left:auto;display:flex;gap:6px;flex-shrink:0}`,
    `.nav-tool-btn{background:none;border:1px solid var(--border-subtle);color:var(--text-muted);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:14px;transition:background .15s;text-decoration:none}`,
    `.nav-tool-btn:hover{background:var(--bg-secondary)}`,
    `.offline-banner{background:var(--tag-amber-bg);color:var(--tag-amber-text);text-align:center;padding:6px;font-size:12px;flex-shrink:0}`,
    `@media(max-width:1024px){.nav-tabs{flex-wrap:wrap;gap:3px;padding:4px 8px}}`,
    `@media(max-width:768px){.nav-tab,.nav-tool-btn{min-height:44px;padding:8px 14px;font-size:14px}.offline-banner{font-size:11px;padding:4px}}`,
    `@media(max-width:480px){.app-shell{padding-bottom:env(safe-area-inset-bottom)}.nav-tabs{justify-content:center}.global-error{padding:6px 10px;font-size:12px}.dismiss-btn{padding:6px 10px}}`,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly offline = signal(false);
  readonly globalError = signal<{ message: string; timestamp: string } | null>(null);

  private readonly viewRoutes: Record<string, string> = {
    '1': '/',
    '2': '/planner',
    '3': '/kanban',
    '4': '/archive',
    '5': '/inspections',
    '6': '/prompts',
    '7': '/analytics',
    '8': '/changes',
    '9': '/graph',
    '0': '/sessions',
  };

  @ViewChild('aiConfigDialog') aiConfigDialog!: AIConfigDialogComponent;

  constructor(
    private pipeline: ConduitService,
    public theme: ThemeService,
    private errorService: GlobalErrorService,
    private router: Router,
    private kb: KeyboardShortcutService,
    private messageBox: MessageBoxService,
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
    this.kb.unregisterGlobal('t');
    this.kb.unregisterGlobal('?');
    this.kb.unregisterGlobal('Escape');
  }

  dismissError() { this.errorService.clear(); }

  toggleTheme() { this.theme.toggle(); }

  openChat(): void {
    const n = this.messageBox.instances().length + 1;
    this.messageBox.open(n === 1 ? 'Assistant' : `Assistant ${n}`);
  }

  openConfig(): void {
    this.aiConfigDialog?.open();
  }

  themeIcon(): string {
    return this.theme.theme() === 'dark' ? '🌙' : '☀';
  }

  private labelForRoute(route: string): string {
    const labels: Record<string, string> = {
      '/': 'Go to Overview',
      '/planner': 'Go to Planner',
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
