import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Counts { requests: number; leases: number; attempts: number; receipts: number; }
interface DistItem { status: string; count: number; }
interface Distribution { scanned_at: string; requests: DistItem[]; leases: DistItem[]; attempts: DistItem[]; receipts_by_type: DistItem[]; stale_active_leases: number; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Health summary -->
      @if (health(); as h) {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="stat-card">
            <div class="stat-value" style="color: var(--color-accent-ring)">{{ h.counts.requests }}</div>
            <div class="stat-label">Requests</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #22c55e">{{ h.counts.leases }}</div>
            <div class="stat-label">Leases</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #f97316">{{ h.counts.attempts }}</div>
            <div class="stat-label">Attempts</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #8b5cf6">{{ h.counts.receipts }}</div>
            <div class="stat-label">Receipts</div>
          </div>
        </div>
      } @else {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: var(--color-text-muted)">Connecting to execution-srv...</p>
        </div>
      }

      <!-- Status Distribution -->
      @if (distribution(); as d) {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Requests by status -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Requests by Status</h3>
            <table class="data-table">
              <thead><tr><th>Status</th><th class="text-right">Count</th></tr></thead>
              <tbody>
                @for (item of d.requests; track item.status) {
                  <tr>
                    <td><span class="badge-{{ item.status.toLowerCase() }}">{{ item.status }}</span></td>
                    <td class="text-right font-mono text-sm font-semibold">{{ item.count }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Leases by status -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Leases by Status</h3>
            <table class="data-table">
              <thead><tr><th>Status</th><th class="text-right">Count</th></tr></thead>
              <tbody>
                @for (item of d.leases; track item.status) {
                  <tr>
                    <td><span class="badge-{{ item.status.toLowerCase() }}">{{ item.status }}</span></td>
                    <td class="text-right font-mono text-sm font-semibold">{{ item.count }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (d.stale_active_leases > 0) {
              <div class="mt-3 p-2 rounded-md text-xs flex items-center gap-2"
                   style="background-color: rgba(249, 115, 22, 0.1); color: #f97316">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
                <span>{{ d.stale_active_leases }} stale active lease{{ d.stale_active_leases !== 1 ? 's' : '' }} — enforcement gap</span>
              </div>
            }
          </div>

          <!-- Attempts by status -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Attempts by Status</h3>
            <table class="data-table">
              <thead><tr><th>Status</th><th class="text-right">Count</th></tr></thead>
              <tbody>
                @for (item of d.attempts; track item.status) {
                  <tr>
                    <td><span class="badge-{{ item.status.toLowerCase() }}">{{ item.status }}</span></td>
                    <td class="text-right font-mono text-sm font-semibold">{{ item.count }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Receipts by type -->
          <div class="stat-card">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color: var(--color-text-muted)">Receipts by Type</h3>
            <table class="data-table">
              <thead><tr><th>Type</th><th class="text-right">Count</th></tr></thead>
              <tbody>
                @for (item of d.receipts_by_type; track item.status) {
                  <tr>
                    <td><span class="text-xs font-mono">{{ item.status }}</span></td>
                    <td class="text-right font-mono text-sm font-semibold">{{ item.count }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  health = input<{ status: string; db: boolean; counts: Counts } | null>(null);
  distribution = input<Distribution | null>(null);
}
