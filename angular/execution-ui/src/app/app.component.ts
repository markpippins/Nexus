import { Component, ChangeDetectionStrategy, signal, inject, effect, Renderer2 } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval, switchMap, startWith } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { StaleLeasesComponent } from './stale-leases.component';
import { FleetComponent } from './fleet.component';
import { IntegrityScanComponent } from './integrity-scan.component';

// ── Theme ─────────────────────────────────────────────────────────────

export type Theme = 'theme-light' | 'theme-steel' | 'theme-dark';

const STORAGE_KEY = 'nexus-theme';
const THEME_CYCLE: Theme[] = ['theme-steel', 'theme-light', 'theme-dark'];

// ── Types ────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  db: boolean;
  counts: {
    requests: number;
    leases: number;
    attempts: number;
    receipts: number;
  };
}

interface StatusDistribution {
  scanned_at: string;
  requests: { status: string; count: number }[];
  leases: { status: string; count: number }[];
  attempts: { status: string; count: number }[];
  receipts_by_type: { status: string; count: number }[];
  stale_active_leases: number;
}

interface StaleLease {
  lease_id: string;
  request_id: string;
  executor_id: string;
  ttl_seconds: number;
  acquired_at: string;
  expires_at: string;
  business_key: string;
  title: string;
  request_status: string;
  overdue_seconds: number;
}

interface StaleLeasesResponse {
  count: number;
  stale_leases: StaleLease[];
}

interface IntegrityScanResult {
  kind: string;
  count: number;
  samples: any[];
}

interface IntegrityScanResponse {
  scanned_at: string;
  totals: { anomalies: number; kinds_fired: number };
  scans: IntegrityScanResult[];
}

interface ExecutorSummary {
  executor_id: string;
  active_leases: number;
  released_leases: number;
  expired_leases: number;
  total_leases: number;
}

interface FleetResponse {
  scope: string;
  executor_count: number;
  executors: ExecutorSummary[];
}

type ViewTab = 'dashboard' | 'stale' | 'fleet' | 'integrity';

// ── Component ─────────────────────────────────────────────────────────

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DashboardComponent, StaleLeasesComponent, FleetComponent, IntegrityScanComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center h-12 border-b shrink-0 px-4 gap-3"
         [style.border-color]="'var(--color-border-base)'"
         [style.background-color]="'var(--color-surface)'">
      <div class="flex items-center gap-2 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
             stroke="var(--color-text-muted)" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"/>
        </svg>
        <span class="text-sm font-semibold tracking-tight"
              [style.color]="'var(--color-text-base)'">Execution</span>
      </div>

      <div class="w-px h-6" [style.background-color]="'var(--color-border-base)'"></div>

      <div class="flex-1 flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded-md truncate"
           [style.background-color]="'var(--color-surface-muted)'"
           [style.color]="'var(--color-text-muted)'"
           [style.border-color]="'var(--color-border-muted)'"
           style="border: 1px solid">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
        </svg>
        <span class="truncate">http://localhost:{{ port }}/api/execution</span>
      </div>

      <button (click)="toggleTheme()"
              class="flex items-center justify-center h-7 w-7 rounded-md transition-colors shrink-0"
              [style.color]="'var(--color-text-muted)'"
              [title]="currentThemeLabel()"
              style="border: 1px solid var(--color-border-muted)">
        @switch (theme()) {
          @case ('theme-light') {
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
            </svg>
          }
          @case ('theme-dark') {
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>
            </svg>
          }
          @default {
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
            </svg>
          }
        }
      </button>

      <div class="flex items-center gap-2 shrink-0">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                [class.bg-green-400]="!!health()"
                [class.bg-red-400]="!health()"></span>
          <span class="relative inline-flex rounded-full h-2 w-2"
                [class.bg-green-500]="!!health()"
                [class.bg-red-500]="!health()"></span>
        </span>
        <span class="text-[11px]"
              [style.color]="'var(--color-text-muted)'">
          @if (health(); as h) {
            {{ h.counts.requests }} req
          } @else {
            disconnected
          }
        </span>
      </div>
    </div>

    <div class="flex items-center gap-1 px-4 py-2 border-b shrink-0"
         [style.border-color]="'var(--color-border-base)'"
         [style.background-color]="'var(--color-surface)'">
      @for (tab of tabs; track tab.key) {
        <button class="tab-btn"
                [class.active]="activeTab() === tab.key"
                (click)="activeTab.set(tab.key)">
          {{ tab.label }}
        </button>
      }
    </div>

    <div class="flex-1 overflow-auto p-4 md:p-6">
      @switch (activeTab()) {
        @case ('dashboard') { <app-dashboard [health]="health() ?? null" [distribution]="distribution() ?? null" /> }
        @case ('stale')     { <app-stale-leases [leases]="staleLeases() ?? null" /> }
        @case ('fleet')     { <app-fleet [executors]="fleet() ?? null" /> }
        @case ('integrity') { <app-integrity-scan [scan]="integrityScan() ?? null" /> }
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background-color: var(--color-surface);
    }
  `],
})
export class AppComponent {
  private http = inject(HttpClient);
  private renderer = inject(Renderer2);
  private doc = inject(DOCUMENT);

  port = 4205;
  activeTab = signal<ViewTab>('dashboard');

  tabs = [
    { key: 'dashboard' as const, label: 'Dashboard' },
    { key: 'stale' as const, label: 'Stale Leases' },
    { key: 'fleet' as const, label: 'Fleet' },
    { key: 'integrity' as const, label: 'Integrity Scan' },
  ];

  // auto-polling data streams
  health = toSignal(
    interval(15_000).pipe(
      startWith(0),
      switchMap(() => this.http.get<HealthResponse>('/health')),
    ),
  );

  distribution = toSignal(
    interval(30_000).pipe(
      startWith(0),
      switchMap(() => this.http.get<StatusDistribution>('/api/execution/health/status-distribution')),
    ),
  );

  staleLeases = toSignal(
    interval(30_000).pipe(
      startWith(0),
      switchMap(() => this.http.get<StaleLeasesResponse>('/api/execution/leases/stale')),
    ),
  );

  fleet = toSignal(
    interval(60_000).pipe(
      startWith(0),
      switchMap(() => this.http.get<FleetResponse>('/api/execution/health/by-executor')),
    ),
  );

  integrityScan = toSignal(
    interval(60_000).pipe(
      startWith(0),
      switchMap(() => this.http.get<IntegrityScanResponse>('/api/execution/health/integrity-scan')),
    ),
  );

  // ── Theme ────────────────────────────────────────────────────────

  protected readonly theme = signal<Theme>('theme-steel');

  constructor() {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved && THEME_CYCLE.includes(saved as Theme)) {
      this.theme.set(saved as Theme);
    }

    effect(() => {
      const t = this.theme();
      for (const cls of THEME_CYCLE) {
        this.renderer.removeClass(this.doc.body, cls);
      }
      this.renderer.addClass(this.doc.body, t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch (_) { }
    });
  }

  protected toggleTheme(): void {
    const current = this.theme();
    const idx = THEME_CYCLE.indexOf(current);
    this.theme.set(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  }

  protected currentThemeLabel(): string {
    const labels: Record<string, string> = {
      'theme-light': 'Light theme',
      'theme-dark': 'Dark theme',
      'theme-steel': 'Steel theme',
    };
    return labels[this.theme()] || 'Switch theme';
  }
}
