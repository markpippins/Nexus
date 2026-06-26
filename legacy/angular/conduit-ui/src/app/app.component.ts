import { Component, signal, effect, OnInit, OnDestroy, Inject, ViewChild } from '@angular/core';

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
      @if (globalError(); as err) {
        <div class="global-error">
          ⚠ {{ err.message }}
          <button class="dismiss-btn" (click)="dismissError()">✕</button>
        </div>
      }

      <!-- Builder status bar -->
      <app-builder-status></app-builder-status>

      <!-- Agent status bar -->
      <app-agent-status-bar></app-agent-status-bar>

      <!-- Navigation tabs (icon toolbar) -->
      <div class="nav-toolbar">
        <a class="nav-toolbar-btn" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" title="Overview">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/planner" routerLinkActive="active" title="Planner">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/kanban" routerLinkActive="active" title="Kanban">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/archive" routerLinkActive="active" title="Archive">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/inspections" routerLinkActive="active" title="Inspections">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/prompts" routerLinkActive="active" title="Prompts">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/analytics" routerLinkActive="active" title="Analytics">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/changes" routerLinkActive="active" title="Changes">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/graph" routerLinkActive="active" title="Graph">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
        </a>
        <a class="nav-toolbar-btn" routerLink="/sessions" routerLinkActive="active" title="Sessions">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </a>
        <div class="nav-spacer"></div>
        <a class="nav-tool-btn" href="http://localhost:8233" target="_blank" rel="noopener noreferrer"
          title="Temporal Web UI — workflow history, stack traces, event timelines">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
        <button class="nav-tool-btn" (click)="openChat()" title="New chat">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </button>
        <button class="nav-tool-btn" (click)="openConfig()" title="AI configuration">
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button class="nav-tool-btn" (click)="toggleTheme()"
          [title]="theme.theme()==='dark'?'Switch to light theme':'Switch to dark theme'">
          @if (theme.theme() === 'dark') {
            <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" class="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          }
        </button>
      </div>

      <!-- Offline banner -->
      @if (offline()) {
        <div class="offline-banner">
          ⚠ Pipeline server offline — showing cached state if available
        </div>
      }

      <!-- Routed view -->
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [
    `.app-shell{display:flex;flex-direction:column;height:100vh;overflow:hidden}`,
    `.global-error{background:var(--accent-red-bg,#fef2f2);color:var(--accent-red-text,#991b1b);padding:8px 16px;font-size:13px;display:flex;align-items:center;gap:12px;flex-shrink:0;border-bottom:1px solid var(--accent-red,#dc2626)}`,
    `.dismiss-btn{margin-left:auto;background:none;border:none;color:var(--accent-red-text);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px}.dismiss-btn:hover{background:rgba(0,0,0,0.1)}`,
    `.nav-toolbar{display:flex;align-items:center;gap:2px;padding:4px 8px;background:var(--bg-primary);border-bottom:1px solid var(--border-default);overflow-x:auto;flex-shrink:0;scrollbar-width:thin}`,
    `.nav-toolbar-btn{background:none;border:none;color:var(--text-muted);width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;text-decoration:none;flex-shrink:0;transition:background .15s,color .15s}`,
    `.nav-toolbar-btn:hover{background:var(--bg-secondary);color:var(--text-secondary)}`,
    `.nav-toolbar-btn.active{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.nav-tool-btn{background:none;border:1px solid var(--border-subtle);color:var(--text-muted);width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;flex-shrink:0;transition:background .15s;text-decoration:none}`,
    `.nav-tool-btn:hover{background:var(--bg-secondary);color:var(--text-secondary)}`,
    `.nav-icon{width:20px;height:20px}`,
    `.nav-spacer{margin-left:auto}`,
    `.offline-banner{background:var(--tag-amber-bg);color:var(--tag-amber-text);text-align:center;padding:6px;font-size:12px;flex-shrink:0}`,
    `@media(max-width:640px){.nav-toolbar{gap:1px;padding:4px}.nav-toolbar-btn{width:32px;height:32px}.nav-tool-btn{width:28px;height:28px}.nav-icon{width:18px;height:18px}}`,
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
