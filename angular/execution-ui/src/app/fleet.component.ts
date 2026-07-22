import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutorDetailComponent } from './executor-detail.component';

interface ExecutorSummary {
  executor_id: string;
  active_leases: number;
  released_leases: number;
  expired_leases: number;
  total_leases: number;
}

@Component({
  selector: 'app-fleet',
  standalone: true,
  imports: [CommonModule, ExecutorDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selectedExecutorId(); as exId) {
      <app-executor-detail [executorId]="exId" (back)="selectedExecutorId.set(null)" />
    } @else {
      @if (executors(); as data) {
        @if (data.executors.length === 0) {
          <div class="stat-card text-center py-12">
            <p class="text-sm" style="color: var(--color-text-muted)">No executors registered</p>
          </div>
        } @else {
          <div class="mb-3">
            <span class="text-xs font-medium" style="color: var(--color-text-muted)">
              {{ data.executor_count }} executor{{ data.executor_count !== 1 ? 's' : '' }} — click a card for detail
            </span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (ex of data.executors; track ex.executor_id) {
              <div class="stat-card cursor-pointer" (click)="selectExecutor(ex.executor_id)">
                <div class="flex items-center justify-between mb-3">
                  <span class="font-mono text-xs font-semibold truncate max-w-[180px]" [title]="ex.executor_id">
                    {{ ex.executor_id | slice:0:16 }}…
                  </span>
                  <span class="badge-{{ ex.active_leases > 0 ? 'active' : 'expired' }}">
                    {{ ex.active_leases }} active
                  </span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div class="text-lg font-bold" style="color: #22c55e">{{ ex.active_leases }}</div>
                    <div class="text-[10px] uppercase tracking-wide" style="color: var(--color-text-subtle)">Active</div>
                  </div>
                  <div>
                    <div class="text-lg font-bold" style="color: var(--color-text-muted)">{{ ex.released_leases }}</div>
                    <div class="text-[10px] uppercase tracking-wide" style="color: var(--color-text-subtle)">Released</div>
                  </div>
                  <div>
                    <div class="text-lg font-bold" style="color: #6b7280">{{ ex.expired_leases }}</div>
                    <div class="text-[10px] uppercase tracking-wide" style="color: var(--color-text-subtle)">Expired</div>
                  </div>
                </div>
                <div class="mt-2 pt-2 border-t text-[11px] text-right"
                     [style.border-color]="'var(--color-border-muted)'"
                     [style.color]="'var(--color-text-subtle)'">
                  {{ ex.total_leases }} total leases
                </div>
              </div>
            }
          </div>
        }
      } @else {
        <div class="stat-card text-center py-8">
          <p class="text-sm" style="color: var(--color-text-muted)">Loading fleet data...</p>
        </div>
      }
    }
  `,
})
export class FleetComponent {
  executors = input<{ executor_count: number; executors: ExecutorSummary[] } | null>(null);
  protected readonly selectedExecutorId = signal<string | null>(null);

  protected selectExecutor(id: string): void {
    this.selectedExecutorId.set(id);
  }
}
