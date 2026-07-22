import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CpfFunnelService,
  CpfCandidate,
  CpfCounts,
} from '../../services/cpf-funnel.service.js';

type FunnelTab = 'ready' | 'promoted';

@Component({
  selector: 'app-cpf-funnel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full flex flex-col bg-[rgb(var(--color-surface))] overflow-auto">
      <!-- Tab Bar -->
      <div class="flex-shrink-0 flex items-center border-b border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]" style="height:48px;min-height:48px">
        <div class="flex items-center h-full px-4 gap-1">
          <button
            (click)="activeTab.set('ready')"
            class="h-full px-4 text-xs font-medium transition-colors border-b-2"
            [class.border-[rgb(var(--color-accent-ring))]]="activeTab() === 'ready'"
            [class.text-[rgb(var(--color-text-base))]]="activeTab() === 'ready'"
            [class.border-transparent]="activeTab() !== 'ready'"
            [class.text-[rgb(var(--color-text-muted))]]="activeTab() !== 'ready'"
            [class.hover:text-[rgb(var(--color-text-base))]]="activeTab() !== 'ready'"
          >
            CPF Funnel
            @if (counts(); as c) {
              <span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500">{{ c.ready }}</span>
            }
          </button>
          <button
            (click)="activeTab.set('promoted')"
            class="h-full px-4 text-xs font-medium transition-colors border-b-2"
            [class.border-[rgb(var(--color-accent-ring))]]="activeTab() === 'promoted'"
            [class.text-[rgb(var(--color-text-base))]]="activeTab() === 'promoted'"
            [class.border-transparent]="activeTab() !== 'promoted'"
            [class.text-[rgb(var(--color-text-muted))]]="activeTab() !== 'promoted'"
            [class.hover:text-[rgb(var(--color-text-base))]]="activeTab() !== 'promoted'"
          >
            Promoted
            @if (counts(); as c) {
              <span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">{{ c.promoted }}</span>
            }
          </button>
        </div>

        <div class="flex-1"></div>

        <!-- Refresh -->
        <button
          (click)="refresh()"
          title="Refresh"
          class="mr-2 p-1.5 rounded hover:bg-[rgb(var(--color-surface-hover))] transition-colors flex-shrink-0"
          [disabled]="loading()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-[rgb(var(--color-text-muted))]" [class.animate-spin]="loading()" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10.899 12.101A7.002 7.002 0 012.399 8.567a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6 overflow-auto">
        <!-- Loading State -->
        @if (loading() && candidates().length === 0) {
          <div class="flex flex-col items-center justify-center h-64 gap-4">
            <div class="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent border-[rgb(var(--color-accent-ring))]"></div>
            <p class="text-[rgb(var(--color-text-muted))] text-sm">Loading CPF data...</p>
          </div>
        }

        <!-- Error State -->
        @if (error(); as err) {
          <div class="max-w-lg mx-auto mt-8">
            <div class="p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div class="flex items-center gap-3 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                <h3 class="text-lg font-semibold text-red-500">Connection Failed</h3>
              </div>
              <p class="text-[rgb(var(--color-text-muted))] text-sm">{{ err }}</p>
              <button
                (click)="refresh()"
                class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[rgb(var(--color-accent-solid-bg))] text-white rounded-md hover:opacity-90 transition-opacity text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        }

        <!-- READY Tab: Funnel View -->
        @if (activeTab() === 'ready' && !error() && !(loading() && candidates().length === 0)) {
          <!-- Funnel Visualization -->
          <div class="max-w-3xl mx-auto mb-8">
            <div class="mb-6">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-semibold text-[rgb(var(--color-text-base))]">Compilation Readiness Funnel</h3>
                <span class="text-[10px] text-[rgb(var(--color-text-muted))]">
                  {{ filteredCandidates().length }} candidate{{ filteredCandidates().length !== 1 ? 's' : '' }}
                </span>
              </div>
              <div class="space-y-2">
                @for (band of readinessBands(); track band.label) {
                  <div class="group cursor-pointer transition-opacity"
                    (click)="toggleBandFilter(band.min)"
                    [class.opacity-50]="activeBandMin() !== null && activeBandMin() !== band.min"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs font-medium text-[rgb(var(--color-text-muted))]">
                        {{ band.label }}
                      </span>
                      <span class="text-xs text-[rgb(var(--color-text-base))] font-mono">{{ band.count }}</span>
                    </div>
                    <div class="h-7 bg-[rgb(var(--color-surface-muted))] rounded-md overflow-hidden">
                      <div
                        class="h-full rounded-md transition-all duration-500 ease-out flex items-center justify-end px-2"
                        [style.width.%]="band.percent"
                        [class.bg-green-500]="band.min >= 0.9"
                        [class.bg-green-600]="band.min >= 0.8 && band.min < 0.9"
                        [class.bg-emerald-600]="band.min >= 0.7 && band.min < 0.8"
                        [class.bg-yellow-600]="band.min >= 0.6 && band.min < 0.7"
                        [class.bg-yellow-700]="band.min >= 0.5 && band.min < 0.6"
                        [class.bg-red-700]="band.min < 0.5"
                      >
                        <span class="text-[10px] text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          {{ band.count }}
                        </span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Controls Row -->
            <div class="flex flex-wrap items-center gap-3 mb-6 p-4 bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-muted))]">
              <!-- Threshold Slider -->
              <div class="flex items-center gap-3 flex-1 min-w-[200px]">
                <label class="text-xs text-[rgb(var(--color-text-muted))] whitespace-nowrap">Threshold:</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  [value]="threshold() * 100"
                  (input)="onThresholdChange($event)"
                  class="flex-1 h-1.5 accent-green-500"
                />
                <span class="text-xs font-mono font-medium text-[rgb(var(--color-text-base))] w-10 text-right">{{ threshold() | percent:'1.0-0' }}</span>
              </div>

              <!-- System Filter -->
              <select
                (change)="onSystemFilterChange($event)"
                class="text-xs bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-muted))] rounded px-2 py-1.5 text-[rgb(var(--color-text-base))]"
              >
                <option value="">All Systems</option>
                @for (sys of systemNames(); track sys) {
                  <option [value]="sys">{{ sys }}</option>
                }
              </select>

              <!-- Status Filter -->
              <select
                (change)="onStatusFilterChange($event)"
                class="text-xs bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border-muted))] rounded px-2 py-1.5 text-[rgb(var(--color-text-base))]"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="promoted">Promoted</option>
                <option value="linked">Linked</option>
                <option value="useful">Useful</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <!-- Candidate Cards -->
            <div class="space-y-2">
              @for (candidate of displayCandidates(); track candidate.id) {
                <div
                  class="p-4 rounded-xl border transition-all duration-200 hover:shadow-md group"
                  [class.border-green-500/30]="candidate.promotable"
                  [class.bg-green-500/[0.02]]="candidate.promotable"
                  [class.border-gray-500/30]="!candidate.promotable"
                  [class.bg-gray-500/[0.02]]="!candidate.promotable"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium text-sm text-[rgb(var(--color-text-base))] truncate">{{ candidate.title }}</span>
                        @if (candidate.promotable) {
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-500 flex-shrink-0">Ready</span>
                        }
                      </div>
                      <div class="flex items-center gap-2 text-[10px] text-[rgb(var(--color-text-muted))]">
                        @if (candidate.system_name && candidate.system_name !== '(none)') {
                          <span class="truncate">{{ candidate.system_name }}</span>
                          @if (candidate.subsystem_name && candidate.subsystem_name !== '(none)') {
                            <span>›</span>
                            <span class="truncate">{{ candidate.subsystem_name }}</span>
                          }
                        }
                        @if (candidate.tags.length > 0) {
                          <span class="mx-1">·</span>
                          @for (tag of candidate.tags.slice(0, 3); track tag) {
                            <span class="px-1 py-0.5 bg-[rgb(var(--color-surface-muted))] rounded">{{ tag }}</span>
                          }
                        }
                      </div>
                    </div>

                    <!-- Readiness Score -->
                    <div class="flex flex-col items-center flex-shrink-0">
                      <div class="text-lg font-bold font-mono"
                        [class.text-green-500]="candidate.compilation_readiness >= 0.9"
                        [class.text-green-400]="candidate.compilation_readiness >= 0.7 && candidate.compilation_readiness < 0.9"
                        [class.text-yellow-500]="candidate.compilation_readiness >= 0.5 && candidate.compilation_readiness < 0.7"
                        [class.text-red-500]="candidate.compilation_readiness < 0.5"
                      >
                        {{ candidate.compilation_readiness | percent:'1.0-0' }}
                      </div>
                      <span class="text-[9px] text-[rgb(var(--color-text-subtle))]">CPF</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-3 mt-2 text-[10px] text-[rgb(var(--color-text-muted))]">
                    <span class="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
                      </svg>
                      {{ candidate.dep_count }} dep{{ candidate.dep_count !== 1 ? 's' : '' }}
                    </span>
                    <span class="text-[rgb(var(--color-text-subtle))]">·</span>
                    <span class="capitalize">{{ candidate.status }}</span>
                    @if (candidate.intent_description) {
                      <span class="text-[rgb(var(--color-text-subtle))]">·</span>
                      <span class="truncate text-[rgb(var(--color-text-subtle))]">{{ candidate.intent_description }}</span>
                    }

                    <!-- Promote Button -->
                    @if (candidate.promotable && candidate.status !== 'promoted') {
                      <span class="ml-auto">
                        <button
                          (click)="promote(candidate.id); $event.stopPropagation()"
                          class="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                          </svg>
                          Promote
                        </button>
                      </span>
                    }
                  </div>
                </div>
              } @empty {
                <div class="col-span-full p-8 text-center text-[rgb(var(--color-text-muted))]">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p class="text-sm">No candidates match the current filters</p>
                </div>
              }
            </div>
          </div>
        }

        <!-- PROMOTED Tab -->
        @if (activeTab() === 'promoted' && !error() && !(loading() && candidates().length === 0)) {
          <div class="max-w-3xl mx-auto">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-sm font-semibold text-[rgb(var(--color-text-base))]">
                Promoted Candidates
                <span class="ml-1.5 text-[10px] font-normal text-[rgb(var(--color-text-muted))]">({{ promotedCandidates().length }})</span>
              </h3>
            </div>
            @if (promotedCandidates().length > 0) {
              <div class="space-y-2">
                @for (candidate of promotedCandidates(); track candidate.id) {
                  <div class="p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.02] hover:shadow-sm transition-all">
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-sm text-[rgb(var(--color-text-base))] truncate mb-1">{{ candidate.title }}</div>
                        <div class="flex items-center gap-2 text-[10px] text-[rgb(var(--color-text-muted))]">
                          @if (candidate.system_name && candidate.system_name !== '(none)') {
                            <span>{{ candidate.system_name }}</span>
                          }
                          <span>·</span>
                          <span class="text-green-500">CPF {{ candidate.compilation_readiness | percent:'1.0-0' }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="p-8 text-center text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-muted))]">
                <p class="text-sm">No promoted candidates yet</p>
              </div>
            }
          </div>
        }
      </div>

      <!-- Footer Stats -->
      @if (counts(); as c) {
        <div class="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
          <div class="flex items-center gap-4 text-[11px] text-[rgb(var(--color-text-muted))]">
            <span>Total: <span class="font-medium text-[rgb(var(--color-text-base))]">{{ c.total }}</span></span>
            <span>Ready: <span class="font-medium text-green-500">{{ c.ready }}</span></span>
            <span>Promoted: <span class="font-medium text-blue-500">{{ c.promoted }}</span></span>
            <span>Near-miss: <span class="font-medium text-yellow-500">{{ c.near_miss }}</span></span>
            <span>Low: <span class="font-medium text-red-500">{{ c.low }}</span></span>
          </div>
          @if (error()) {
            <span class="text-[11px] text-red-500">Disconnected</span>
          } @else if (connected()) {
            <span class="text-[11px] text-green-500">Connected</span>
          }
        </div>
      }
    </div>
  `,
})
export class CpfFunnelComponent implements OnInit, OnDestroy {
  private cpfService = inject(CpfFunnelService);

  /** CPF candidates from service */
  candidates = this.cpfService.candidates;
  /** Pre-computed counts */
  counts = this.cpfService.counts;
  /** Loading state */
  loading = this.cpfService.loading;
  /** Error state */
  error = this.cpfService.error;
  /** Connection state */
  connected = this.cpfService.connected;

  /** Active tab */
  activeTab = signal<FunnelTab>('ready');
  /** Threshold cutoff (0.0-1.0) */
  threshold = signal(0.7);
  /** System name filter */
  systemFilter = signal('');
  /** Status filter */
  statusFilter = signal('');
  /** Band filter — clicking a band sets this */
  activeBandMin = signal<number | null>(null);

  /** Unique system names for filter dropdown */
  systemNames = computed(() => this.cpfService.getSystemNames());

  /** Readiness bands for the funnel visualization */
  readinessBands = computed(() => {
    const candidates = this.candidates();
    const bands = [
      { label: '0.90 – 1.00', min: 0.9 },
      { label: '0.80 – 0.89', min: 0.8 },
      { label: '0.70 – 0.79', min: 0.7 },
      { label: '0.60 – 0.69', min: 0.6 },
      { label: '0.50 – 0.59', min: 0.5 },
      { label: '0.00 – 0.49', min: 0.0 },
    ];
    const maxCount = candidates.length || 1;
    return bands.map(band => {
      const count = candidates.filter(
        c => c.compilation_readiness >= band.min &&
             (band.min === 0.0 ? c.compilation_readiness < 0.5 : c.compilation_readiness < band.min + 0.1)
      ).length;
      return { ...band, count, percent: (count / maxCount) * 100 };
    });
  });

  /** Candidates filtered by threshold and system/status */
  filteredCandidates = computed(() => {
    let list = this.candidates();
    const thr = this.threshold();
    const sys = this.systemFilter();
    const st = this.statusFilter();

    return list.filter(c => {
      if (c.compilation_readiness < thr) return false;
      if (sys && c.system_name !== sys) return false;
      if (st && c.status !== st) return false;
      return true;
    });
  });

  /** Candidates for display (respects band filter) */
  displayCandidates = computed(() => {
    let list = this.filteredCandidates();
    const bandMin = this.activeBandMin();
    if (bandMin !== null) {
      list = list.filter(c => {
        const upper = bandMin >= 0.9 ? 1.01 : bandMin + 0.1;
        return c.compilation_readiness >= bandMin && c.compilation_readiness < upper;
      });
    }
    // Sort by CPF descending
    return [...list].sort((a, b) => b.compilation_readiness - a.compilation_readiness);
  });

  /** Candidates with status === 'promoted' */
  promotedCandidates = computed(() => {
    return this.candidates().filter(c => c.status === 'promoted');
  });

  /** Handle threshold slider change */
  onThresholdChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.threshold.set(input.valueAsNumber / 100);
  }

  /** Handle system filter dropdown change */
  onSystemFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.systemFilter.set(select.value);
  }

  /** Handle status filter dropdown change */
  onStatusFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.statusFilter.set(select.value);
  }

  /** Toggle band filter on click */
  toggleBandFilter(min: number): void {
    this.activeBandMin.update(current => current === min ? null : min);
  }

  /** Promote a candidate */
  async promote(candidateId: string): Promise<void> {
    await this.cpfService.promoteCandidate(candidateId);
  }

  /** Refresh data */
  refresh(): void {
    this.cpfService.loadAll();
  }

  ngOnInit(): void {
    this.cpfService.startPolling(60_000);
  }

  ngOnDestroy(): void {
    this.cpfService.stopPolling();
  }
}
