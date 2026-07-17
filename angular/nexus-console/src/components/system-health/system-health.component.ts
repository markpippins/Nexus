import { Component, ChangeDetectionStrategy, inject, input, signal, computed, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RegistryStatusService,
  RegistryServiceStatus,
  RegistryStatusEvent,
  HealthState,
} from '../../services/registry-status.service.js';

type SortField = 'name' | 'status' | 'heartbeat' | 'responseTime';
type FilterType = 'all' | HealthState;

@Component({
  selector: 'app-system-health',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full flex flex-col bg-[rgb(var(--color-surface))] overflow-auto">
      <!-- Header -->
      <div class="flex-shrink-0 px-6 py-4 border-b border-[rgb(var(--color-border-base))]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <!-- Connection indicator -->
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                [class.bg-green-400]="connected()"
                [class.bg-red-400]="!connected() && !loading()"
                [class.bg-yellow-400]="loading()"
              ></span>
              <span class="relative inline-flex rounded-full h-3 w-3"
                [class.bg-green-500]="connected()"
                [class.bg-red-500]="!connected() && !loading()"
                [class.bg-yellow-500]="loading()"
              ></span>
            </span>
            <div>
              <h2 class="text-xl font-semibold text-[rgb(var(--color-text-base))]">System Health</h2>
              <p class="text-xs text-[rgb(var(--color-text-muted))]">
                @if (connected()) {
                  <span class="text-green-500">●</span> Live
                  @if (lastSnapshotAt(); as t) {
                    · Updated {{ t | date:'mediumTime' }}
                  }
                  · {{ sseClients().length }} connected client{{ sseClients().length !== 1 ? 's' : '' }}
                } @else if (loading()) {
                  Connecting...
                } @else {
                  <span class="text-red-500">●</span> Disconnected
                }
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              (click)="reconnect()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors"
              [class.text-green-500]="!connected()"
              [class.bg-green-500/10]="!connected()"
              [class.text-[rgb(var(--color-text-muted))]]="connected()"
              [class.bg-[rgb(var(--color-surface-hover))]]="connected()"
              title="Reconnect"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10.899 12.101A7.002 7.002 0 012.399 8.567a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101z" clip-rule="evenodd" />
              </svg>
              @if (!connected()) { Reconnect }
            </button>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6 overflow-auto">
        @if (loading()) {
          <!-- Loading state -->
          <div class="flex flex-col items-center justify-center h-64 gap-4">
            <div class="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent border-[rgb(var(--color-accent-ring))]"></div>
            <p class="text-[rgb(var(--color-text-muted))]">Connecting to real-time status stream...</p>
          </div>
        } @else if (error(); as err) {
          <!-- Error state -->
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
                (click)="reconnect()"
                class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[rgb(var(--color-accent-solid-bg))] text-white rounded-md hover:opacity-90 transition-opacity text-sm"
              >
                Retry Connection
              </button>
            </div>
          </div>
        } @else {
          <!-- Status Summary Cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="p-4 bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-muted))] cursor-pointer" (click)="filterType.set('all')" [class.ring-2]="filterType() === 'all'" [class.ring-[rgb(var(--color-accent-ring))]]="filterType() === 'all'">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-[rgb(var(--color-text-muted))]">Total Services</span>
                <span class="text-2xl font-bold text-[rgb(var(--color-text-base))]">{{ totalCount() }}</span>
              </div>
            </div>
            <div class="p-4 bg-green-500/5 rounded-xl border border-green-500/20 cursor-pointer" (click)="filterType.set('HEALTHY')" [class.ring-2]="filterType() === 'HEALTHY'" [class.ring-green-500]="filterType() === 'HEALTHY'">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-green-600">Healthy</span>
                <span class="text-2xl font-bold text-green-500">{{ healthyCount() }}</span>
              </div>
            </div>
            <div class="p-4 bg-yellow-500/5 rounded-xl border border-yellow-500/20 cursor-pointer" (click)="filterType.set('DEGRADED')" [class.ring-2]="filterType() === 'DEGRADED'" [class.ring-yellow-500]="filterType() === 'DEGRADED'">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-yellow-600">Degraded</span>
                <span class="text-2xl font-bold text-yellow-500">{{ degradedCount() }}</span>
              </div>
            </div>
            <div class="p-4 bg-red-500/5 rounded-xl border border-red-500/20 cursor-pointer" (click)="filterType.set('UNHEALTHY')" [class.ring-2]="filterType() === 'UNHEALTHY'" [class.ring-red-500]="filterType() === 'UNHEALTHY'">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-red-500">Unhealthy</span>
                <span class="text-2xl font-bold text-red-500">{{ unhealthyCount() }}</span>
              </div>
            </div>
          </div>

          <!-- Filter & Sort Toolbar -->
          <div class="flex items-center gap-2 mb-4 pb-3 border-b border-[rgb(var(--color-border-base))]">
            <div class="flex gap-1 flex-wrap">
              <button (click)="filterType.set('all')"
                class="px-2.5 py-1 text-xs rounded-md transition-colors"
                [class.bg-[rgb(var(--color-surface-hover))]]="filterType() === 'all'"
                [class.text-[rgb(var(--color-text-base))]]="filterType() === 'all'"
                [class.text-[rgb(var(--color-text-muted))]]="filterType() !== 'all'"
              >All</button>
              <button (click)="filterType.set('OFFLINE')"
                class="px-2.5 py-1 text-xs rounded-md transition-colors"
                [class.bg-red-500/10]="filterType() === 'OFFLINE'"
                [class.text-red-500]="filterType() === 'OFFLINE'"
                [class.text-[rgb(var(--color-text-muted))]]="filterType() !== 'OFFLINE'"
              >Offline</button>
              <button (click)="filterType.set('UNKNOWN')"
                class="px-2.5 py-1 text-xs rounded-md transition-colors"
                [class.bg-gray-500/10]="filterType() === 'UNKNOWN'"
                [class.text-gray-500]="filterType() === 'UNKNOWN'"
                [class.text-[rgb(var(--color-text-muted))]]="filterType() !== 'UNKNOWN'"
              >Unknown</button>
            </div>
            <span class="mx-2 text-[rgb(var(--color-text-subtle))]">|</span>
            <label class="text-xs text-[rgb(var(--color-text-muted))]">Sort:</label>
            <select (change)="onSortChange($event)"
              class="text-xs bg-[rgb(var(--color-surface-muted))] border border-[rgb(var(--color-border-muted))] rounded px-2 py-1 text-[rgb(var(--color-text-base))]">
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="heartbeat">Last Heartbeat</option>
              <option value="responseTime">Response Time</option>
            </select>
          </div>

          <!-- Service Cards Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            @for (svc of filteredServices(); track svc.serviceName) {
              <div class="p-4 rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer group"
                [class.border-green-500/30]="svc.healthState === 'HEALTHY'"
                [class.bg-green-500/[0.03]]="svc.healthState === 'HEALTHY'"
                [class.border-red-500/30]="svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE'"
                [class.bg-red-500/[0.03]]="svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE'"
                [class.border-yellow-500/30]="svc.healthState === 'DEGRADED'"
                [class.bg-yellow-500/[0.03]]="svc.healthState === 'DEGRADED'"
                [class.border-gray-500/30]="svc.healthState === 'UNKNOWN'"
                [class.bg-gray-500/[0.03]]="svc.healthState === 'UNKNOWN'"
                (click)="toggleExpanded(svc.serviceName)"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full flex-shrink-0"
                        [class.bg-green-500]="svc.healthState === 'HEALTHY'"
                        [class.bg-red-500]="svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE'"
                        [class.bg-yellow-500]="svc.healthState === 'DEGRADED'"
                        [class.bg-gray-400]="svc.healthState === 'UNKNOWN'"
                        [class.animate-pulse]="svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE'"
                      ></span>
                      <span class="font-medium text-sm text-[rgb(var(--color-text-base))] truncate">{{ svc.serviceName }}</span>
                    </div>
                    @if (svc.version) {
                      <span class="ml-4 text-[10px] text-[rgb(var(--color-text-muted))] font-mono">v{{ svc.version }}</span>
                    }
                  </div>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0"
                    [class.bg-green-500/10]="svc.healthState === 'HEALTHY'"
                    [class.text-green-600]="svc.healthState === 'HEALTHY'"
                    [class.bg-red-500/10]="svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE'"
                    [class.text-red-500]="svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE'"
                    [class.bg-yellow-500/10]="svc.healthState === 'DEGRADED'"
                    [class.text-yellow-600]="svc.healthState === 'DEGRADED'"
                    [class.bg-gray-500/10]="svc.healthState === 'UNKNOWN'"
                    [class.text-gray-500]="svc.healthState === 'UNKNOWN'"
                  >
                    {{ svc.healthState }}
                  </span>
                </div>
                <div class="mt-2 flex items-center gap-3 text-[10px] text-[rgb(var(--color-text-muted))]">
                  @if (svc.responseTimeMs != null) {
                    <span>{{ svc.responseTimeMs }}ms</span>
                  }
                  @if (svc.lastHeartbeat) {
                    <span>♥ {{ svc.lastHeartbeat | date:'HH:mm:ss' }}</span>
                  }
                  @if (svc.errorMessage) {
                    <span class="text-red-400 truncate" title="{{ svc.errorMessage }}">{{ svc.errorMessage }}</span>
                  }
                </div>

                <!-- Expanded details: history -->
                @if (expandedService() === svc.serviceName) {
                  <div class="mt-3 pt-3 border-t border-[rgb(var(--color-border-base))]">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))] mb-2">Status History</h4>
                    @if (serviceHistories().get(svc.serviceName); as history) {
                      <div class="space-y-1">
                        @for (evt of history; track $index) {
                          <div class="flex items-center gap-2 text-[10px]">
                            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              [class.bg-green-500]="evt.newState === 'HEALTHY'"
                              [class.bg-red-500]="evt.newState === 'UNHEALTHY' || evt.newState === 'OFFLINE'"
                              [class.bg-yellow-500]="evt.newState === 'DEGRADED'"
                              [class.bg-gray-400]="true"
                            ></span>
                            <span class="text-[rgb(var(--color-text-muted))]">
                              {{ evt.oldState || '?' }} → <span class="font-medium text-[rgb(var(--color-text-base))]">{{ evt.newState }}</span>
                            </span>
                            <span class="text-[rgb(var(--color-text-subtle))]">{{ evt.changedAt | date:'HH:mm' }}</span>
                            @if (evt.reason) {
                              <span class="text-[rgb(var(--color-text-subtle))] truncate">· {{ evt.reason }}</span>
                            }
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="text-[10px] text-[rgb(var(--color-text-subtle))]">Loading history...</p>
                    }
                  </div>
                }
              </div>
            } @empty {
              <div class="col-span-full p-8 text-center text-[rgb(var(--color-text-muted))]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p class="text-sm">No services match the current filter</p>
              </div>
            }
          </div>

          <!-- Two-column layout: Transitions + Heartbeats -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Status Transitions Timeline -->
            <div>
              <h3 class="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))] mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clip-rule="evenodd" />
                </svg>
                Recent Transitions
                <span class="text-[10px] font-normal text-[rgb(var(--color-text-subtle))]">({{ transitions().length }})</span>
              </h3>
              @if (transitions().length > 0) {
                <div class="space-y-1 max-h-80 overflow-y-auto pr-1">
                  @for (evt of transitions(); track $index) {
                    <div class="flex items-start gap-3 p-2 rounded-lg hover:bg-[rgb(var(--color-surface-hover))] transition-colors">
                      <div class="flex flex-col items-center mt-0.5">
                        <div class="w-2 h-2 rounded-full"
                          [class.bg-green-500]="evt.newState === 'HEALTHY'"
                          [class.bg-red-500]="evt.newState === 'UNHEALTHY' || evt.newState === 'OFFLINE'"
                          [class.bg-yellow-500]="evt.newState === 'DEGRADED'"
                          [class.bg-gray-400]="true"
                        ></div>
                        <div class="w-px h-full min-h-[1.5rem] bg-[rgb(var(--color-border-muted))]"></div>
                      </div>
                      <div class="flex-1 min-w-0 pb-2">
                        <div class="flex items-center justify-between">
                          <span class="font-medium text-xs text-[rgb(var(--color-text-base))]">{{ evt.serviceName }}</span>
                          <span class="text-[10px] text-[rgb(var(--color-text-subtle))]">{{ evt.changedAt | date:'HH:mm:ss' }}</span>
                        </div>
                        <div class="text-[10px] text-[rgb(var(--color-text-muted))]">
                          {{ evt.oldState || '?' }} → <span class="font-medium">{{ evt.newState }}</span>
                          @if (evt.reason) {
                            <span class="ml-1 text-[rgb(var(--color-text-subtle))]">· {{ evt.reason }}</span>
                          }
                          @if (evt.errorMessage) {
                            <span class="ml-1 text-red-400">· {{ evt.errorMessage }}</span>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="p-6 text-center text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-muted))] rounded-lg border border-[rgb(var(--color-border-muted))]">
                  <p class="text-xs">No status transitions recorded yet</p>
                </div>
              }
            </div>

            <!-- Heartbeat Activity Feed -->
            <div>
              <h3 class="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))] mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
                </svg>
                Heartbeat Activity
                <span class="text-[10px] font-normal text-[rgb(var(--color-text-subtle))]">({{ recentHeartbeats().length }})</span>
              </h3>
              @if (recentHeartbeats().length > 0) {
                <div class="space-y-1 max-h-80 overflow-y-auto pr-1">
                  @for (hb of recentHeartbeats(); track $index) {
                    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-[rgb(var(--color-surface-hover))] transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-green-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
                      </svg>
                      <span class="text-xs font-medium text-[rgb(var(--color-text-base))] flex-1">{{ hb.serviceName }}</span>
                      @if (hb.version) {
                        <span class="text-[10px] text-[rgb(var(--color-text-muted))] font-mono">v{{ hb.version }}</span>
                      }
                      <span class="text-[10px] text-[rgb(var(--color-text-subtle))]">{{ hb.timestamp | date:'HH:mm:ss' }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="p-6 text-center text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-muted))] rounded-lg border border-[rgb(var(--color-border-muted))]">
                  <p class="text-xs">No heartbeat activity yet</p>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Footer -->
      @if (!loading() && !error()) {
        <div class="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
          <div class="flex items-center gap-3 text-[11px] text-[rgb(var(--color-text-muted))]">
            <span>SSE: <span class="font-medium" [class.text-green-500]="connected()" [class.text-red-500]="!connected()">{{ connected() ? 'Connected' : 'Disconnected' }}</span></span>
            <span>·</span>
            <span>Services: <span class="font-medium">{{ totalCount() }}</span></span>
            <span>·</span>
            <span>Clients: <span class="font-medium">{{ sseClients().length }}</span></span>
          </div>
          <div class="flex items-center gap-2">
            <button
              (click)="reconnect()"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] rounded-md transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10.899 12.101A7.002 7.002 0 012.399 8.567a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101z" clip-rule="evenodd" />
              </svg>
              Reconnect
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class SystemHealthComponent implements OnDestroy {
  private statusService = inject(RegistryStatusService);

  /** Base URL of the service-registry (e.g. http://localhost:8085) */
  baseUrl = input.required<string>();

  /** SSE connection state from the service */
  connected = this.statusService.connected;
  /** Error from the service */
  error = this.statusService.error;

  /** All service statuses from the service */
  private serviceStatuses = this.statusService.serviceStatuses;
  /** Transition timeline */
  transitions = this.statusService.transitions;
  /** Heartbeat feed */
  recentHeartbeats = this.statusService.recentHeartbeats;
  /** Connected SSE clients */
  sseClients = this.statusService.sseClients;
  /** Last snapshot timestamp */
  lastSnapshotAt = this.statusService.lastSnapshotAt;

  /** Loading state */
  loading = signal(true);

  /** Filter by health state */
  filterType = signal<FilterType>('all');
  /** Sort field */
  sortField = signal<SortField>('name');

  /** Handle sort dropdown change */
  onSortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.sortField.set(select.value as SortField);
  }

  /** Currently expanded service (shows history) */
  expandedService = signal<string | null>(null);

  /** Service histories — loaded on expand */
  serviceHistories = signal<Map<string, RegistryStatusEvent[]>>(new Map());

  /** Computed counts */
  totalCount = computed(() => this.serviceStatuses().size);
  healthyCount = computed(() => this.countByState('HEALTHY'));
  unhealthyCount = computed(() => {
    const map = this.serviceStatuses();
    let count = 0;
    for (const svc of map.values()) {
      if (svc.healthState === 'UNHEALTHY' || svc.healthState === 'OFFLINE') count++;
    }
    return count;
  });
  degradedCount = computed(() => this.countByState('DEGRADED'));

  /** Filtered and sorted service list */
  filteredServices = computed(() => {
    const map = this.serviceStatuses();
    const filter = this.filterType();
    const sort = this.sortField();

    let services = Array.from(map.values());

    // Filter
    if (filter !== 'all') {
      if (filter === 'UNHEALTHY') {
        services = services.filter(s => s.healthState === 'UNHEALTHY' || s.healthState === 'OFFLINE');
      } else {
        services = services.filter(s => s.healthState === filter);
      }
    }

    // Sort
    services.sort((a, b) => {
      const dir = sort === 'name' ? 1 : -1; // All date-based sorts descending
      switch (sort) {
        case 'name':
          return a.serviceName.localeCompare(b.serviceName) * dir;
        case 'status': {
          const order = ['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'OFFLINE', 'UNKNOWN'];
          const ai = order.indexOf(a.healthState);
          const bi = order.indexOf(b.healthState);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        }
        case 'heartbeat':
          return ((a.lastHeartbeat || '') < (b.lastHeartbeat || '') ? 1 : -1) * dir;
        case 'responseTime':
          return ((a.responseTimeMs ?? Infinity) - (b.responseTimeMs ?? Infinity)) * dir;
        default:
          return 0;
      }
    });

    return services;
  });

  constructor() {
    // Connect on init when baseUrl changes
    effect(() => {
      const url = this.baseUrl();
      if (url) {
        this.connect(url);
      }
    });
  }

  private async connect(baseUrl: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.statusService.connect(baseUrl);
      this.loading.set(false);
    } catch (e) {
      this.loading.set(false);
    }
  }

  /** Reconnect to the SSE stream */
  reconnect(): void {
    const url = this.baseUrl();
    if (url) {
      this.connect(url);
    }
  }

  /** Toggle expanded service details (loads history) */
  toggleExpanded(serviceName: string): void {
    if (this.expandedService() === serviceName) {
      this.expandedService.set(null);
      return;
    }
    this.expandedService.set(serviceName);

    // Load history if not already loaded
    if (!this.serviceHistories().has(serviceName)) {
      const baseUrl = this.baseUrl();
      if (baseUrl) {
        this.statusService.fetchServiceHistory(baseUrl, serviceName).then(events => {
          this.serviceHistories.update(map => {
            const updated = new Map(map);
            updated.set(serviceName, events);
            return updated;
          });
        });
      }
    }
  }

  private countByState(state: HealthState): number {
    const map = this.serviceStatuses();
    let count = 0;
    for (const svc of map.values()) {
      if (svc.healthState === state) count++;
    }
    return count;
  }

  ngOnDestroy(): void {
    this.statusService.disconnect();
  }
}
