import { Component, ViewChild, computed, AfterViewInit, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgClass } from '@angular/common';
import { AIConfigDialogComponent } from './components/ai-config-dialog/ai-config-dialog.component';
import { ToastService } from './services/toast.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, AIConfigDialogComponent, NgClass],
  template: `
    <header>
      <div class="flex items-center gap-2 mr-3 select-none">
        <div class="w-7 h-7 rounded-md bg-gray-200 dark:bg-gray-600/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Tackle</span>
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 ml-2"></div>
      </div>
      <nav>
        <a routerLink="/roles">Roles</a>
        <a class="nav-btn" (click)="openConfig()">AI Config</a>
        <button class="nav-btn theme-btn" (click)="theme.toggle()" [title]="'Theme: ' + theme.theme()">
          @if (theme.theme() === 'steel') { ⚙ }
          @if (theme.theme() === 'light') { ☀ }
          @if (theme.theme() === 'dark') { 🌙 }
        </button>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
    <app-ai-config-dialog #aiConfigDialog></app-ai-config-dialog>
    <div class="toast-stack">
      @for (t of toasts(); track t.id) {
        <div class="toast-card" [ngClass]="'toast-' + t.priority + ' toast-type-' + t.type" (click)="dismiss(t.id)">
          <div class="toast-header">
            <span class="toast-icon">{{t.icon}}</span>
            <span class="toast-title">{{t.title}}</span>
            <button class="toast-close" (click)="$event.stopPropagation();dismiss(t.id)">×</button>
          </div>
          <div class="toast-message">{{t.message}}</div>
          <div class="toast-progress"><div class="toast-bar"></div></div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: system-ui, sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      gap: 2rem;
      padding: 1rem 2rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
    }
    header h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #38bdf8;
    }
    nav {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    nav a, nav .nav-btn {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.875rem;
      padding: 0.25rem 0.75rem;
      border-radius: 0.375rem;
      transition: background 0.15s, color 0.15s;
      cursor: pointer;
      border: none;
      background: transparent;
    }
    nav a:hover, nav a.active, nav .nav-btn:hover {
      color: var(--text-primary);
      background: var(--bg-tertiary);
    }
    .theme-btn { font-size: 1rem; padding: 0.25rem 0.5rem; }
    main {
      max-width: 960px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    .toast-stack{position:fixed;top:16px;right:16px;z-index:10001;display:flex;flex-direction:column;gap:8px;max-width:340px;width:100%}
    .toast-card{background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:8px;padding:12px 14px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:slideIn 300ms ease-out}
    .toast-high{border-left:4px solid #ef4444}.toast-normal{border-left:4px solid #eab308}
    .toast-type-run_started{border-left:4px solid #4ade80}.toast-type-role_saved{border-left:4px solid #4ade80}
    .toast-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}
    .toast-icon{font-size:14px}.toast-title{font-weight:600;font-size:13px;color:var(--text-primary);flex:1}
    .toast-close{background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:0 4px;line-height:1}
    .toast-close:hover{color:var(--text-primary)}
    .toast-message{font-size:12px;color:var(--text-muted);margin-bottom:6px}
    .toast-progress{height:2px;background:var(--border-default);border-radius:1px;overflow:hidden}
    .toast-bar{height:100%;background:#60a5fa;animation:shrink 8s linear forwards}
    .toast-normal .toast-bar{animation-duration:5s}
    @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes shrink{from{width:100%}to{width:0%}}
  `],
})
export class AppComponent implements AfterViewInit {
  @ViewChild('aiConfigDialog') aiConfigDialog!: AIConfigDialogComponent;
  readonly toasts = computed(() => this.toastService.toasts());
  readonly theme = inject(ThemeService);

  constructor(private toastService: ToastService) {}

  ngAfterViewInit(): void {
    this.aiConfigDialog?.open();
  }

  openConfig(): void {
    this.aiConfigDialog?.open();
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}
