import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ScanResult {
  kind: string;
  count: number;
  samples: any[];
}

@Component({
  selector: 'app-integrity-scan',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (scan(); as data) {
      <div class="space-y-4">
        <!-- Summary -->
        <div class="flex items-center gap-3">
          <div class="stat-card flex items-center gap-4">
            <div>
              <div class="text-2xl font-bold" [style.color]="data.totals.anomalies > 0 ? '#ef4444' : '#22c55e'">
                {{ data.totals.anomalies }}
              </div>
              <div class="stat-label">Total Anomalies</div>
            </div>
            <div class="w-px h-10" [style.background-color]="'var(--color-border-base)'"></div>
            <div>
              <div class="text-2xl font-bold" style="color: var(--color-accent-ring)">{{ data.totals.kinds_fired }}</div>
              <div class="stat-label">Kinds Fired</div>
            </div>
          </div>
        </div>

        <!-- Scan results per kind -->
        <div class="space-y-3">
          @for (scan of data.scans; track scan.kind) {
            <div class="stat-card">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono font-semibold">{{ scan.kind }}</span>
                  @if (scan.count > 0) {
                    <span class="badge-stale">{{ scan.count }}</span>
                  } @else {
                    <span class="badge-completed">0</span>
                  }
                </div>
                @if (scan.count > 0) {
                  <button
                    (click)="toggleSample(scan.kind)"
                    class="text-[10px] px-2 py-0.5 rounded transition-colors"
                    [style.color]="'var(--color-text-muted)'"
                    [style.background-color]="'var(--color-surface-hover)'">
                    {{ expandedSamples().has(scan.kind) ? 'Hide' : 'Show' }} samples
                  </button>
                }
              </div>
              @if (scan.count > 0 && expandedSamples().has(scan.kind)) {
                <div class="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  @for (sample of scan.samples; track $index) {
                    <div class="p-2 rounded text-[11px] font-mono truncate"
                         [style.background-color]="'var(--color-surface)'"
                         [style.border]="'1px solid var(--color-border-muted)'">
                      {{ JSON.stringify(sample) }}
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    } @else {
      <div class="stat-card text-center py-8">
        <p class="text-sm" style="color: var(--color-text-muted)">Running integrity scan...</p>
      </div>
    }
  `,
})
export class IntegrityScanComponent {
  scan = input<{ scanned_at: string; totals: { anomalies: number; kinds_fired: number }; scans: ScanResult[] } | null>(null);
  protected readonly JSON = JSON;
  protected readonly expandedSamples = signal<Set<string>>(new Set());

  protected toggleSample(kind: string): void {
    this.expandedSamples.update(s => {
      const next = new Set(s);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }
}
