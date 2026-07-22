import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeaseDetailComponent } from './lease-detail.component';
import { RequestDetailComponent } from './request-detail.component';

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

@Component({
  selector: 'app-stale-leases',
  standalone: true,
  imports: [CommonModule, LeaseDetailComponent, RequestDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selectedRequestId(); as reqId) {
      <app-request-detail [requestId]="reqId" (back)="selectedRequestId.set(null)" />
    } @else if (selectedLeaseId(); as leaseId) {
      <app-lease-detail [leaseId]="leaseId" (back)="selectedLeaseId.set(null)"
                        (requestSelected)="selectedRequestId.set($event)" />
    } @else {
      @if (leases(); as data) {
        @if (data.stale_leases.length === 0) {
          <div class="stat-card text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24"
                 stroke="var(--color-text-subtle)" stroke-width="1.5" style="opacity: 0.4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-sm" style="color: var(--color-text-muted)">No stale leases — all clear</p>
          </div>
        } @else {
          <div class="mb-3 flex items-center gap-2">
            <span class="badge-stale px-2.5 py-1 text-xs">{{ data.count }} stale lease{{ data.count !== 1 ? 's' : '' }}</span>
            <span class="text-xs" style="color: var(--color-text-muted)">Click a row to inspect lease lifecycle</span>
          </div>
          <div class="stat-card overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Lease</th>
                  <th>Request</th>
                  <th>Executor</th>
                  <th>Acquired</th>
                  <th>Expires</th>
                  <th>Overdue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (lease of data.stale_leases; track lease.lease_id) {
                  <tr (click)="selectLease(lease.lease_id)"
                      class="cursor-pointer"
                      [style.transition]="'background-color 0.1s'"
                      [style]="{'--row-hover': 'var(--color-surface-hover)'}">
                    <td class="font-mono text-[11px]" style="color: var(--color-text-muted)">{{ lease.lease_id | slice:0:8 }}…</td>
                    <td>
                      <div class="font-medium text-xs truncate max-w-[200px] link-accent"
                           (click)="$event.stopPropagation(); selectRequest(lease.request_id)"
                           [title]="'View request ' + lease.request_id">
                        {{ lease.title || lease.business_key || '—' }}
                      </div>
                    </td>
                    <td class="font-mono text-xs">{{ lease.executor_id | slice:0:12 }}</td>
                    <td class="text-xs whitespace-nowrap">{{ lease.acquired_at | date:'MMM d, HH:mm' }}</td>
                    <td class="text-xs whitespace-nowrap" style="color: #f97316">{{ lease.expires_at | date:'MMM d, HH:mm' }}</td>
                    <td class="text-xs font-mono whitespace-nowrap" style="color: #ef4444">{{ lease.overdue_seconds }}s</td>
                    <td><span class="badge-stale">STALE</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: var(--color-text-muted)">Loading stale leases...</p>
        </div>
      }
    }
  `,
  styles: [`
    tr { transition: background-color 0.1s; }
    tr:hover { background-color: var(--color-surface-hover); }
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
})
export class StaleLeasesComponent {
  leases = input<{ count: number; stale_leases: StaleLease[] } | null>(null);
  protected readonly selectedLeaseId = signal<string | null>(null);
  protected readonly selectedRequestId = signal<string | null>(null);

  protected selectLease(id: string): void {
    this.selectedLeaseId.set(id);
    this.selectedRequestId.set(null);
  }

  protected selectRequest(id: string): void {
    this.selectedRequestId.set(id);
    this.selectedLeaseId.set(null);
  }
}
