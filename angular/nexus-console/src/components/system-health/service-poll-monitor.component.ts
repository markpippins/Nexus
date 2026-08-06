import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

interface ServiceConfig {
  key: string;
  name: string;
  port?: number | null;
  healthPath?: string;
  protocol?: string;
  category?: string;
  note?: string;
}

interface HealthServicesConfig {
  services: ServiceConfig[];
  pollIntervalSeconds: number;
  tcpTimeoutMs: number;
}

interface ServiceHealthEntry {
  status: 'healthy' | 'down' | 'checking' | 'unreachable' | 'unknown';
  detail?: string;
  lastChecked?: number;
}

type CategoryFilter = 'all' | 'infrastructure' | 'core' | 'api' | 'tts' | 'mcp';

@Component({
  selector: 'app-service-poll-monitor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mb-8">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))]">
            HTTP Service Health Monitor
            <span class="ml-2 text-[10px] font-normal lowercase tracking-normal">(polls every {{ pollIntervalSeconds() }}s)</span>
          </h3>
          <!-- Category filter chips -->
          <div class="flex items-center gap-1">
            @for (cat of categories; track cat.key) {
              <button
                (click)="activeCategory.set(cat.key)"
                class="px-2 py-0.5 text-[10px] rounded-full transition-colors"
                [class.bg-[rgb(var(--color-accent-solid-bg))]]="activeCategory() === cat.key"
                [class.text-white]="activeCategory() === cat.key"
                [class.bg-[rgb(var(--color-surface-hover))]]="activeCategory() !== cat.key"
                [class.text-[rgb(var(--color-text-muted))]]="activeCategory() !== cat.key"
              >{{ cat.label }}</button>
            }
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          @if (allHealthy()) {
            <span class="text-green-500 font-medium">All healthy</span>
          } @else {
            <span class="text-red-500 font-medium">{{ downCount() }} down</span>
          }
          <button
            (click)="checkHealth()"
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10.899 12.101A7.002 7.002 0 012.399 8.567a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101z" clip-rule="evenodd" />
            </svg>
            Check now
          </button>
        </div>
      </div>

      <div class="overflow-x-auto rounded-lg border border-[rgb(var(--color-border-muted))]">
        <table class="w-full text-left border-collapse">
          <thead class="bg-[rgb(var(--color-surface-muted))] text-sm text-[rgb(var(--color-text-muted))] uppercase">
            <tr>
              <th class="p-3 font-semibold">Service</th>
              <th class="p-3 font-semibold">Category</th>
              <th class="p-3 font-semibold">Endpoint</th>
              <th class="p-3 font-semibold">Status</th>
              <th class="p-3 font-semibold">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            @for (svc of filteredServices(); track svc.key) {
              @let health = serviceHealth()[svc.key];
              <tr class="border-t border-[rgb(var(--color-border-muted))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors">
                <td class="p-3 text-sm font-medium text-[rgb(var(--color-text-base))]">
                  {{ svc.name }}
                  @if (svc.note) {
                    <span class="ml-1.5 text-[10px] text-[rgb(var(--color-text-muted))] italic">({{ svc.note }})</span>
                  }
                </td>
                <td class="p-3 text-sm text-[rgb(var(--color-text-muted))]">
                  <span class="px-1.5 py-0.5 rounded-full bg-[rgb(var(--color-surface-hover))]">{{ svc.category }}</span>
                </td>
                <td class="p-3 text-sm font-mono text-sm text-[rgb(var(--color-text-muted))]">
                  {{ getEndpoint(svc) }}
                </td>
                <td class="p-3">
                  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm font-medium"
                    [class.bg-green-500/10]="health?.status === 'healthy'"
                    [class.text-green-600]="health?.status === 'healthy'"
                    [class.bg-red-500/10]="health?.status === 'down'"
                    [class.text-red-500]="health?.status === 'down'"
                    [class.bg-yellow-500/10]="health?.status === 'checking'"
                    [class.text-yellow-600]="health?.status === 'checking'"
                    [class.bg-gray-500/10]="health?.status === 'unreachable' || health?.status === 'unknown'"
                    [class.text-gray-500]="health?.status === 'unreachable' || health?.status === 'unknown'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full"
                      [class.bg-green-500]="health?.status === 'healthy'"
                      [class.bg-red-500]="health?.status === 'down'"
                      [class.bg-yellow-500]="health?.status === 'checking'"
                      [class.bg-gray-400]="health?.status === 'unreachable' || health?.status === 'unknown'"
                      [class.animate-pulse]="health?.status === 'checking'"
                    ></span>
                    {{ health?.status || 'checking' }}
                  </span>
                  @if (health?.detail && health?.status !== 'healthy') {
                    <span class="ml-1.5 text-[10px] text-[rgb(var(--color-text-muted))]">{{ health?.detail }}</span>
                  }
                </td>
                <td class="p-3 text-sm text-[rgb(var(--color-text-muted))]">
                  @if (health?.lastChecked) {
                    {{ health.lastChecked | date:'HH:mm:ss' }}
                  } @else {
                    —
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (!configLoaded()) {
          <div class="p-6 text-center text-sm text-red-500">
            Failed to load health service configuration. Check that <code class="px-1 py-0.5 bg-[rgb(var(--color-surface-muted))] rounded text-sm">assets/config/health-services.json</code> exists and is valid.
          </div>
        } @else if (filteredServices().length === 0) {
          <div class="p-6 text-center text-sm text-[rgb(var(--color-text-muted))]">
            No services match the selected category filter.
          </div>
        }
      </div>

      <!-- Legend -->
      <div class="mt-3 flex items-center gap-4 text-[10px] text-[rgb(var(--color-text-muted))]">
        <span class="inline-flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-green-500"></span> healthy
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-red-500"></span> down
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-gray-400"></span> unreachable/unknown
        </span>
        <span class="italic ml-auto">Services without HTTP endpoints show as "unreachable"</span>
      </div>
    </div>
  `,
})
export class ServicePollMonitorComponent implements OnDestroy {
  private http = inject(HttpClient);

  // ── Config (loaded from assets/config/health-services.json) ──

  readonly serviceConfigs = signal<ServiceConfig[]>([]);
  readonly pollIntervalSeconds = signal(30);
  readonly tcpTimeoutMs = signal(2000);
  readonly configLoaded = signal(false);

  // ── Category filter ──

  readonly activeCategory = signal<CategoryFilter>('all');
  readonly categories: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'infrastructure', label: 'Infra' },
    { key: 'core', label: 'Core' },
    { key: 'api', label: 'API' },
    { key: 'tts', label: 'TTS' },
    { key: 'mcp', label: 'MCP' },
  ];

  // ── Health state ──

  readonly serviceHealth = signal<Record<string, ServiceHealthEntry>>({});
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  // ── Computed ──

  readonly filteredServices = computed(() => {
    const cat = this.activeCategory();
    const configs = this.serviceConfigs();
    if (cat === 'all') return configs;
    return configs.filter(s => s.category === cat);
  });

  readonly allHealthy = computed(() => {
    const health = this.serviceHealth();
    const configs = this.filteredServices();
    if (configs.length === 0) return true;
    return configs.every(s => {
      const h = health[s.key];
      return h?.status === 'healthy' || h?.status === 'unreachable' || h?.status === 'unknown';
    });
  });

  readonly downCount = computed(() => {
    const health = this.serviceHealth();
    const configs = this.filteredServices();
    return configs.filter(s => health[s.key]?.status === 'down').length;
  });

  // ── Lifecycle ──

  constructor() {
    this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<HealthServicesConfig>('assets/config/health-services.json').pipe(
          catchError(() => of(null))
        )
      );
      if (config) {
        this.serviceConfigs.set(config.services);
        this.pollIntervalSeconds.set(config.pollIntervalSeconds || 30);
        this.tcpTimeoutMs.set(config.tcpTimeoutMs || 2000);

        // Initialize health state for all configured services
        const initial: Record<string, ServiceHealthEntry> = {};
        for (const svc of config.services) {
          initial[svc.key] = { status: 'checking' };
        }
        this.serviceHealth.set(initial);

        this.configLoaded.set(true);

        // Start polling
        this.checkHealth();
        this.healthInterval = setInterval(() => this.checkHealth(), this.pollIntervalSeconds() * 1000);
      }
    } catch {
      console.warn('[ServicePollMonitor] Failed to load health-services.json, monitor disabled');
    }
  }

  getEndpoint(svc: ServiceConfig): string {
    if (!svc.port || !svc.healthPath) {
      return svc.note || '—';
    }
    return `http://localhost:${svc.port}${svc.healthPath}`;
  }

  async checkHealth(): Promise<void> {
    const configs = this.serviceConfigs();
    if (configs.length === 0) return;

    const timeoutMs = this.tcpTimeoutMs();

    // Reset all to checking
    const current = this.serviceHealth();
    const resetting: Record<string, ServiceHealthEntry> = {};
    for (const key of Object.keys(current)) {
      resetting[key] = { status: 'checking' as const };
    }
    this.serviceHealth.set(resetting);

    const checks = configs.map(async (svc) => {
      // Services without ports or health paths are marked as unreachable
      if (!svc.port || !svc.healthPath) {
        this.serviceHealth.update(h => ({
          ...h,
          [svc.key]: {
            status: 'unreachable' as const,
            detail: svc.note || 'no HTTP endpoint',
            lastChecked: Date.now(),
          },
        }));
        return;
      }

      const url = `http://localhost:${svc.port}${svc.healthPath}`;
      try {
        const res = await firstValueFrom(
          this.http.get<any>(url).pipe(
            timeout(timeoutMs),
            catchError(() => of(null))
          )
        );

        if (res === null) {
          this.setDown(svc.key, 'connection refused / timeout');
          return;
        }

        // Determine health from response
        const isOk = res?.status === 'ok' || res?.status === 'UP';
        let detail = isOk ? 'ok' : 'error';
        if (res?.db !== undefined) {
          detail = `db:${res.db}`;
        } else if (res?.service) {
          detail = `svc:${res.service}`;
        }

        this.serviceHealth.update(h => ({
          ...h,
          [svc.key]: {
            status: isOk ? 'healthy' as const : 'down' as const,
            detail,
            lastChecked: Date.now(),
          },
        }));
      } catch {
        this.setDown(svc.key, 'unreachable');
      }
    });

    await Promise.all(checks);

    // Reset postgres to checking so it re-derives each poll cycle
    this.serviceHealth.update(h => ({ ...h, postgres: { status: 'checking' as const } }));

    // Derive postgres status from nebula-srv if present
    this.derivePostgresStatus();
  }

  private setDown(key: string, detail: string): void {
    this.serviceHealth.update(h => ({
      ...h,
      [key]: { status: 'down' as const, detail, lastChecked: Date.now() },
    }));
  }

  /** PostgreSQL is checked via nebula-srv's DB health field when available */
  private derivePostgresStatus(): void {
    const health = this.serviceHealth();
    const nebulaHealth = health['nebula-srv'];
    const pgHealth = health['postgres'];

    if (!nebulaHealth || !pgHealth || pgHealth.status !== 'checking') return;

    if (nebulaHealth.detail?.startsWith('db:')) {
      const dbOk = nebulaHealth.detail === 'db:true';
      this.serviceHealth.update(h => ({
        ...h,
        postgres: {
          status: dbOk ? 'healthy' as const : 'down' as const,
          detail: dbOk ? 'via nebula-srv' : 'database connection failed',
          lastChecked: Date.now(),
        },
      }));
    } else if (nebulaHealth.status === 'healthy') {
      this.serviceHealth.update(h => ({
        ...h,
        postgres: {
          status: 'healthy' as const,
          detail: 'via nebula-srv',
          lastChecked: Date.now(),
        },
      }));
    }
  }

  ngOnDestroy(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
    }
  }
}
