import { Component, ChangeDetectionStrategy, input, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, startWith, of, catchError, map } from 'rxjs';

// ── Types ────────────────────────────────────────────────────────────

interface LeaseLifecycle {
  id: string;
  request_id: string;
  executor_id: string;
  ttl_seconds: number;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  promised_ttl_seconds: number;
  actual_held_seconds: number;
  overdue_seconds: number;
  lifecycle_state: string;
}

interface RequestState {
  request: any;
  current_lease: any;
  latest_attempt: any;
  receipts: any[];
  receipt_count: number;
}

/** Non-discriminated state object so Angular templates can access .data and .error without TS narrowing issues. */
interface LoadState<T> {
  status: 'loading' | 'loaded' | 'error';
  data?: T;
  error?: string;
}

// ── Component ─────────────────────────────────────────────────────────

@Component({
  selector: 'app-lease-detail',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    .link-accent {
      color: var(--color-accent-ring);
      text-decoration: underline;
      text-decoration-color: transparent;
      transition: text-decoration-color 0.15s;
      cursor: pointer;
    }
    .link-accent:hover {
      text-decoration-color: currentColor;
    }
  `],
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
        Back to Stale Leases
      </button>
    </div>

    @switch (leaseState().status) {
      @case ('loading') {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: var(--color-text-muted)">Loading lease detail...</p>
        </div>
      }
      @case ('error') {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: #ef4444">Failed to load lease: {{ leaseState().error }}</p>
        </div>
      }
      @case ('loaded') {
        @let lease = leaseState().data!;
        <div class="space-y-4">
          <!-- Lease ID header -->
          <div class="stat-card">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-semibold" style="color: var(--color-text-muted)">Lease</span>
                <span class="text-xs font-mono">{{ lease.id }}</span>
              </div>
              <span class="badge-{{ badgeClass(lease.lifecycle_state) }}">{{ lease.status }}</span>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div class="stat-label">Lifecycle State</div>
                <div class="font-medium mt-0.5">{{ lease.lifecycle_state }}</div>
              </div>
              <div>
                <div class="stat-label">Promised TTL</div>
                <div class="font-mono font-medium mt-0.5">{{ lease.promised_ttl_seconds }}s</div>
              </div>
              <div>
                <div class="stat-label">Actual Held</div>
                <div class="font-mono font-medium mt-0.5"
                     [style.color]="lease.actual_held_seconds > lease.promised_ttl_seconds ? '#f97316' : 'inherit'">
                  {{ lease.actual_held_seconds }}s
                </div>
              </div>
              <div>
                <div class="stat-label">Overdue</div>
                <div class="font-mono font-medium mt-0.5"
                     [style.color]="lease.overdue_seconds > 0 ? '#ef4444' : '#22c55e'">
                  {{ lease.overdue_seconds }}s
                </div>
              </div>
            </div>
          </div>

          <!-- Timeline -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Timeline</h3>
            <div class="space-y-3 text-xs">
              <div class="flex items-center gap-3">
                <span class="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold shrink-0"
                      style="background-color: rgba(59, 130, 246, 0.1); color: #3b82f6">1</span>
                <div>
                  <div class="font-medium">Acquired</div>
                  <div class="font-mono" style="color: var(--color-text-muted)">{{ lease.acquired_at | date:'MMM d, yyyy HH:mm:ss' }}</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold shrink-0"
                      [style.background-color]="lease.expires_at < now ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'"
                      [style.color]="lease.expires_at < now ? '#ef4444' : '#22c55e'">2</span>
                <div>
                  <div class="font-medium">Expires</div>
                  <div class="font-mono" style="color: var(--color-text-muted)">{{ lease.expires_at | date:'MMM d, yyyy HH:mm:ss' }}</div>
                </div>
              </div>
              @if (lease.released_at) {
                <div class="flex items-center gap-3">
                  <span class="inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold shrink-0"
                       style="background-color: rgba(34, 197, 94, 0.1); color: #22c55e">3</span>
                  <div>
                    <div class="font-medium">Released</div>
                    <div class="font-mono" style="color: var(--color-text-muted)">{{ lease.released_at | date:'MMM d, yyyy HH:mm:ss' }}</div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Related entities -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Relations</h3>
            <div class="space-y-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="stat-label min-w-[80px]">Request ID</span>
                <span class="font-mono link-accent"
                      (click)="requestSelected.emit(lease.request_id)">
                  {{ lease.request_id }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="stat-label min-w-[80px]">Executor ID</span>
                <span class="font-mono">{{ lease.executor_id }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="stat-label min-w-[80px]">Created</span>
                <span class="font-mono">{{ lease.created_at | date:'MMM d, yyyy HH:mm:ss' }}</span>
              </div>
              @if (lease.updated_at) {
                <div class="flex items-center gap-2">
                  <span class="stat-label min-w-[80px]">Updated</span>
                  <span class="font-mono">{{ lease.updated_at | date:'MMM d, yyyy HH:mm:ss' }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Request state -->
          @if (requestState().status === 'loaded' && requestState().data) {
            @let req = requestState().data!;
            <div class="stat-card">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Request Detail</h3>
              <div class="space-y-2 text-xs">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <div class="stat-label">Title</div>
                    <div class="font-medium mt-0.5">{{ req.request.title || '—' }}</div>
                  </div>
                  <div>
                    <div class="stat-label">Status</div>
                    <div class="mt-0.5"><span class="badge-{{ (req.request.status || '').toLowerCase() }}">{{ req.request.status }}</span></div>
                  </div>
                  <div>
                    <div class="stat-label">Business Key</div>
                    <div class="font-mono mt-0.5">{{ req.request.business_key || '—' }}</div>
                  </div>
                  <div>
                    <div class="stat-label">Receipts</div>
                    <div class="font-mono font-semibold mt-0.5">{{ req.receipt_count }}</div>
                  </div>
                </div>
                @if (req.latest_attempt) {
                  <div class="mt-3 pt-3" [style.border-top]="'1px solid var(--color-border-muted)'">
                    <div class="stat-label mb-1">Latest Attempt</div>
                    <div class="font-mono text-[11px]">{{ req.latest_attempt.id }}</div>
                    <div class="text-[11px] mt-1">
                      <span class="badge-{{ (req.latest_attempt.status || '').toLowerCase() }}">{{ req.latest_attempt.status }}</span>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    }
  `,
})
export class LeaseDetailComponent {
  private http = inject(HttpClient);

  /** Emitted when the user clicks "Back to Stale Leases". */
  back = output();
  /** Emitted when the user clicks a request ID to view the full request detail. */
  requestSelected = output<string>();

  /** The lease ID to load. */
  leaseId = input.required<string>();

  /** Lease lifecycle state driven reactively from the leaseId input. */
  protected readonly leaseState = toSignal(
    toObservable(this.leaseId).pipe(
      switchMap(id =>
        this.http.get<LeaseLifecycle>(`/api/execution/leases/${id}/lifecycle`).pipe(
          map(data => ({ status: 'loaded' as const, data } as LoadState<LeaseLifecycle>)),
          catchError(err => of({ status: 'error' as const, error: err.message || String(err) } as LoadState<LeaseLifecycle>)),
          startWith<LoadState<LeaseLifecycle>>({ status: 'loading' }),
        )
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState<LeaseLifecycle> },
  );

  /** Request detail state, driven from the lease's request_id once loaded. */
  private readonly requestId = toSignal(
    toObservable(this.leaseState).pipe(
      map(s => (s.status === 'loaded' && s.data ? s.data.request_id : null)),
      startWith(null),
    ),
  );

  protected readonly requestState = toSignal(
    toObservable(this.requestId).pipe(
      switchMap(requestId =>
        requestId
          ? this.http.get<RequestState>(`/api/execution/requests/${requestId}/state`).pipe(
              map(data => ({ status: 'loaded' as const, data } as LoadState<RequestState>)),
              catchError(err => of({ status: 'error' as const, error: err.message || String(err) } as LoadState<RequestState>)),
              startWith<LoadState<RequestState>>({ status: 'loading' }),
            )
          : of<LoadState<RequestState>>({ status: 'loading' }),
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState<RequestState> },
  );

  /** Snapshot of 'now' at render time so expiry comparisons are stable. */
  protected readonly now = new Date().toISOString();

  protected badgeClass(state: string): string {
    switch (state) {
      case 'live': return 'active';
      case 'released': return 'completed';
      case 'stale_active': return 'stale';
      case 'expired_unreleased': return 'expired';
      default: return 'expired';
    }
  }
}
