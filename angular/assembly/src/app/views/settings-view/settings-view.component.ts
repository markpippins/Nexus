import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';

@Component({
  selector: 'app-settings-view',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, SkeletonComponent, ErrorStateComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <app-page-header title="Settings" description="Configure your Assembly experience and manage system operations."></app-page-header>

      <div *ngIf="loading()" class="space-y-3">
        <div class="app-panel p-4 space-y-2">
          <app-skeleton width="40%" height="0.875rem"></app-skeleton>
          <app-skeleton width="60%" height="0.75rem"></app-skeleton>
        </div>
      </div>

      <app-error-state *ngIf="error() && !loading()" title="Failed to load settings" [description]="error()!" (retry)="retry()"></app-error-state>

      <ng-container *ngIf="!loading() && !error()">
        <div class="app-panel p-4 mb-4 border-l-4 border-amber-400">
          <h2 class="text-sm font-semibold text-gray-900 mb-1">Admin</h2>
          <p class="text-xs text-gray-500 mb-3">System operations and health checks.</p>

          <div class="rounded border border-gray-200 bg-gray-50 p-3 mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-700">Materialized View Health</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full" [class]="health()?.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">{{ health()?.status === 'healthy' ? 'Healthy' : 'Degraded' }}</span>
            </div>
            <div *ngIf="health()?.materializedView" class="space-y-1 text-xs text-gray-600">
              <div class="flex justify-between"><span>View</span><span class="font-mono">{{ health()?.materializedView?.schema }}.{{ health()?.materializedView?.name }}</span></div>
              <div class="flex justify-between"><span>Populated</span><span>{{ health()?.materializedView?.populated ? 'Yes' : 'No' }}</span></div>                  <div class="flex justify-between"><span>Rows</span><span>{{ (health()?.materializedView?.rowCount || 0).toLocaleString() }}</span></div>
            </div>
          </div>

          <button (click)="refreshStats()" [disabled]="refreshing()" class="app-btn-primary">
            {{ refreshing() ? 'Refreshing...' : 'Refresh Stats' }}
          </button>
        </div>

        <div class="app-panel p-8 text-center">
          <p class="text-sm text-gray-500">More settings coming soon.</p>
        </div>
      </ng-container>
    </div>
  `,
})
export class SettingsViewComponent implements OnInit {
  private http = inject(HttpClient);

  health = signal<any>(null);
  refreshing = signal(false);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.http.get('/api/health').subscribe({
      next: health => {
        this.health.set(health);
        this.loading.set(false);
      },
      error: () => {
        this.health.set({ status: 'unknown', materializedView: null, source: { lastBlockCreatedAt: '' } });
        this.loading.set(false);
      }
    });
  }

  refreshStats() {
    this.refreshing.set(true);
    this.http.post('/api/refresh-stats', {}).subscribe({
      next: () => {
        this.refreshing.set(false);
        this.load();
      },
      error: () => {
        this.refreshing.set(false);
        // TODO: surface a toast once a toast service is available.
      }
    });
  }

  retry() {
    this.load();
  }
}
