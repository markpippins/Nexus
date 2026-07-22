import { Component, ChangeDetectionStrategy, input, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, startWith, of, catchError, map } from 'rxjs';

// ── Types ────────────────────────────────────────────────────────────

interface RequestState {
  request: any;
  current_lease: any | null;
  latest_attempt: any | null;
  receipts: any[];
  receipt_count: number;
}

interface LoadState<T> {
  status: 'loading' | 'loaded' | 'error';
  data?: T;
  error?: string;
}

// ── Component ─────────────────────────────────────────────────────────

@Component({
  selector: 'app-request-detail',
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
        Back
      </button>
    </div>

    @switch (state().status) {
      @case ('loading') {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: var(--color-text-muted)">Loading request detail...</p>
        </div>
      }
      @case ('error') {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: #ef4444">Failed to load request: {{ state().error }}</p>
        </div>
      }
      @case ('loaded') {
        @let data = state().data!;
        @let req = data.request;
        <div class="space-y-4">
          <!-- Request header -->
          <div class="stat-card">
            <div class="flex items-center justify-between mb-3">
              <div>
                <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--color-text-muted)">Request</span>
                <div class="font-mono text-sm mt-0.5">{{ req.id }}</div>
              </div>
              <span class="badge-{{ (req.status || '').toLowerCase() }}">{{ req.status }}</span>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div class="stat-label">Title</div>
                <div class="font-medium mt-0.5">{{ req.title || '—' }}</div>
              </div>
              <div>
                <div class="stat-label">Business Key</div>
                <div class="font-mono mt-0.5">{{ req.business_key || '—' }}</div>
              </div>
              @if (req.priority != null) {
                <div>
                  <div class="stat-label">Priority</div>
                  <div class="font-mono mt-0.5">{{ req.priority }}</div>
                </div>
              }
              <div>
                <div class="stat-label">Receipts</div>
                <div class="font-mono font-bold mt-0.5" style="color: var(--color-accent-ring)">{{ data.receipt_count }}</div>
              </div>
            </div>

            @if (req.created_at || req.updated_at) {
              <div class="mt-3 pt-3 flex gap-6 text-xs"
                   [style.border-top]="'1px solid var(--color-border-muted)'">
                @if (req.created_at) {
                  <div>
                    <span class="stat-label">Created</span>
                    <div class="font-mono mt-0.5">{{ req.created_at | date:'MMM d, yyyy HH:mm:ss' }}</div>
                  </div>
                }
                @if (req.updated_at) {
                  <div>
                    <span class="stat-label">Updated</span>
                    <div class="font-mono mt-0.5">{{ req.updated_at | date:'MMM d, yyyy HH:mm:ss' }}</div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Current Lease -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Current Lease</h3>
            @if (data.current_lease; as lease) {
              <div class="space-y-2 text-xs">
                <div class="flex items-center gap-2">
                  <span class="stat-label min-w-[80px]">Lease ID</span>
                  <span class="font-mono">{{ lease.id }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="stat-label min-w-[80px]">Executor</span>
                  <span class="font-mono">{{ lease.executor_id }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="stat-label min-w-[80px]">Status</span>
                  <span class="badge-{{ (lease.status || '').toLowerCase() }}">{{ lease.status }}</span>
                </div>
                <div class="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <div class="stat-label">Acquired</div>
                    <div class="font-mono mt-0.5">{{ lease.acquired_at | date:'MMM d, HH:mm' }}</div>
                  </div>
                  <div>
                    <div class="stat-label">Expires</div>
                    <div class="font-mono mt-0.5" [style.color]="lease.expires_at < now ? '#f97316' : 'inherit'">{{ lease.expires_at | date:'MMM d, HH:mm' }}</div>
                  </div>
                  <div>
                    <div class="stat-label">TTL</div>
                    <div class="font-mono mt-0.5">{{ lease.ttl_seconds || '—' }}s</div>
                  </div>
                </div>
              </div>
            } @else {
              <p class="text-xs" style="color: var(--color-text-muted)">No active lease</p>
            }
          </div>

          <!-- Latest Attempt -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Latest Attempt</h3>
            @if (data.latest_attempt; as att) {
              <div class="space-y-2 text-xs">
                <div class="flex items-center gap-2">
                  <span class="stat-label min-w-[80px]">Attempt ID</span>
                  <span class="font-mono">{{ att.id }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="stat-label min-w-[80px]">Status</span>
                  <span class="badge-{{ (att.status || '').toLowerCase() }}">{{ att.status }}</span>
                </div>
                <div class="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <div class="stat-label">Created</div>
                    <div class="font-mono mt-0.5">{{ att.created_at | date:'MMM d, HH:mm' }}</div>
                  </div>
                  @if (att.started_at) {
                    <div>
                      <div class="stat-label">Started</div>
                      <div class="font-mono mt-0.5">{{ att.started_at | date:'MMM d, HH:mm' }}</div>
                    </div>
                  }
                </div>
              </div>
            } @else {
              <p class="text-xs" style="color: var(--color-text-muted)">No attempts yet</p>
            }
          </div>

          <!-- Receipts -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">
              Receipts ({{ data.receipt_count }})
            </h3>
            @if (data.receipts.length > 0) {
              <div class="overflow-x-auto">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Receipt ID</th>
                      <th>Type</th>
                      <th>Attempt</th>
                      <th>Issued</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of data.receipts; track r.id) {
                      <tr>
                        <td class="font-mono text-[11px]" style="color: var(--color-text-muted)">{{ r.id | slice:0:8 }}…</td>
                        <td><span class="text-xs font-mono">{{ r.type }}</span></td>
                        <td class="font-mono text-[11px]" style="color: var(--color-text-subtle)">{{ (r.attempt_id || '') | slice:0:8 }}…</td>
                        <td class="text-xs whitespace-nowrap">{{ r.issued_at | date:'MMM d, HH:mm' }}</td>
                        <td>
                          @if (r.lineage_source) {
                            <span class="text-[10px] px-1.5 py-0.5 rounded" style="background-color: rgba(59, 130, 246, 0.1); color: #3b82f6">{{ r.lineage_source }}</span>
                          } @else {
                            <span class="text-[10px]" style="color: var(--color-text-subtle)">native</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-xs" style="color: var(--color-text-muted)">No receipts recorded</p>
            }
          </div>
        </div>
      }
    }
  `,
})
export class RequestDetailComponent {
  private http = inject(HttpClient);

  back = output();

  requestId = input.required<string>();

  protected readonly state = toSignal(
    toObservable(this.requestId).pipe(
      switchMap(id =>
        this.http.get<RequestState>(`/api/execution/requests/${id}/state`).pipe(
          map(data => ({ status: 'loaded' as const, data } as LoadState<RequestState>)),
          catchError(err => of({ status: 'error' as const, error: err.message || String(err) } as LoadState<RequestState>)),
          startWith<LoadState<RequestState>>({ status: 'loading' }),
        )
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState<RequestState> },
  );

  protected readonly now = new Date().toISOString();
}
