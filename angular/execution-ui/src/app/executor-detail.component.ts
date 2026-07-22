import { Component, ChangeDetectionStrategy, input, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, startWith, of, catchError, map } from 'rxjs';

// ── Types ────────────────────────────────────────────────────────────

interface ExecutorSummary {
  active_leases: number;
  released_leases: number;
  expired_leases: number;
  requests_held: number;
  total_leases: number;
}

interface ExecutorDetail {
  scope: 'executor';
  executor_id: string;
  summary: ExecutorSummary;
  active_leases: any[];
  in_progress_attempts: any[];
}

/** Non-discriminated state object so Angular templates can access .data and .error without TS narrowing issues. */
interface LoadState<T> {
  status: 'loading' | 'loaded' | 'error';
  data?: T;
  error?: string;
}

// ── Component ─────────────────────────────────────────────────────────

@Component({
  selector: 'app-executor-detail',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4">
      <button (click)="back.emit()"
              class="flex items-center gap-1.5 text-xs font-medium rounded-md px-3 py-1.5 transition-colors"
              [style.color]="'var(--color-text-muted)'"
              [style.background-color]="'var(--color-surface-hover)'"
              style="border: 1px solid var(--color-border-muted)">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
        </svg>
        Back to Fleet
      </button>
    </div>

    @switch (detailState().status) {
      @case ('loading') {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: var(--color-text-muted)">Loading executor detail...</p>
        </div>
      }
      @case ('error') {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: #ef4444">Failed to load executor: {{ detailState().error }}</p>
        </div>
      }
      @case ('loaded') {
        @let ex = detailState().data!;
        <div class="space-y-4">
          <!-- Executor header -->
          <div class="stat-card">
            <div class="flex items-center justify-between mb-3">
              <div>
                <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--color-text-muted)">Executor</span>
                <div class="font-mono text-sm mt-0.5">{{ ex.executor_id }}</div>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div class="stat-label">Active Leases</div>
                <div class="text-lg font-bold mt-0.5" style="color: #22c55e">{{ ex.summary.active_leases }}</div>
              </div>
              <div>
                <div class="stat-label">Released</div>
                <div class="text-lg font-bold mt-0.5" style="color: var(--color-text-muted)">{{ ex.summary.released_leases }}</div>
              </div>
              <div>
                <div class="stat-label">Expired</div>
                <div class="text-lg font-bold mt-0.5" style="color: #6b7280">{{ ex.summary.expired_leases }}</div>
              </div>
              <div>
                <div class="stat-label">Requests Held</div>
                <div class="text-lg font-bold mt-0.5" style="color: var(--color-accent-ring)">{{ ex.summary.requests_held }}</div>
              </div>
            </div>

            <div class="mt-3 pt-3 text-xs flex items-center gap-2"
                 [style.border-top]="'1px solid var(--color-border-muted)'">
              <span class="stat-label">Total Leases:</span>
              <span class="font-semibold">{{ ex.summary.total_leases }}</span>
            </div>
          </div>

          <!-- Active Leases -->
          @if (ex.active_leases.length > 0) {
            <div class="stat-card">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">
                Active Leases ({{ ex.active_leases.length }})
              </h3>
              <div class="overflow-x-auto">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Lease ID</th>
                      <th>Request</th>
                      <th>Acquired</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (lease of ex.active_leases; track lease.id) {
                      <tr>
                        <td class="font-mono text-[11px]" style="color: var(--color-text-muted)">{{ lease.id | slice:0:8 }}…</td>
                        <td>
                          <div class="text-xs truncate max-w-[180px]" [title]="lease.title || lease.business_key">{{ lease.title || lease.business_key || '—' }}</div>
                          <div class="text-[10px] font-mono" style="color: var(--color-text-subtle)">{{ lease.request_id | slice:0:8 }}…</div>
                        </td>
                        <td class="text-xs whitespace-nowrap">{{ lease.acquired_at | date:'MMM d, HH:mm' }}</td>
                        <td class="text-xs whitespace-nowrap" [style.color]="lease.expires_at && lease.expires_at < getNow() ? '#f97316' : 'inherit'">
                          {{ lease.expires_at | date:'MMM d, HH:mm' }}
                        </td>
                        <td><span class="badge-{{ (lease.request_status || '').toLowerCase() }}">{{ lease.request_status || lease.status }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="stat-card text-center py-6">
              <p class="text-xs" style="color: var(--color-text-muted)">No active leases</p>
            </div>
          }

          <!-- In-Progress Attempts -->
          @if (ex.in_progress_attempts.length > 0) {
            <div class="stat-card">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">
                In-Progress Attempts ({{ ex.in_progress_attempts.length }})
              </h3>
              <div class="overflow-x-auto">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Attempt ID</th>
                      <th>Lease ID</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (att of ex.in_progress_attempts; track att.id) {
                      <tr>
                        <td class="font-mono text-[11px]" style="color: var(--color-text-muted)">{{ att.id | slice:0:8 }}…</td>
                        <td class="font-mono text-[11px]" style="color: var(--color-text-muted)">{{ att.lease_id | slice:0:8 }}…</td>
                        <td><span class="badge-{{ (att.status || '').toLowerCase() }}">{{ att.status }}</span></td>
                        <td class="text-xs whitespace-nowrap">{{ att.created_at | date:'MMM d, HH:mm' }}</td>
                        <td class="text-xs whitespace-nowrap">{{ att.started_at ? (att.started_at | date:'MMM d, HH:mm') : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }
    }
  `,
})
export class ExecutorDetailComponent {
  private http = inject(HttpClient);

  /** Emitted when the user clicks "Back to Fleet". */
  back = output();

  /** The executor ID to load. */
  executorId = input.required<string>();

  /** Executor detail driven reactively from executorId input. */
  protected readonly detailState = toSignal(
    toObservable(this.executorId).pipe(
      switchMap(id =>
        this.http.get<ExecutorDetail>(`/api/execution/health/by-executor?executor_id=${encodeURIComponent(id)}`).pipe(
          map(data => ({ status: 'loaded' as const, data } as LoadState<ExecutorDetail>)),
          catchError(err => of({ status: 'error' as const, error: err.message || String(err) } as LoadState<ExecutorDetail>)),
          startWith<LoadState<ExecutorDetail>>({ status: 'loading' }),
        )
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState<ExecutorDetail> },
  );

  protected getNow(): string {
    return new Date().toISOString();
  }
}
