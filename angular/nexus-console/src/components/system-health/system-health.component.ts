import { Component, ChangeDetectionStrategy, inject, input, signal, effect, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TerrainService, TerrainHealthSummary, TerrainServiceStatus, McpServer, RunnableService } from '../../services/terrain.service.js';
import { ServicePollMonitorComponent } from './service-poll-monitor.component.js';

@Component({
  selector: 'app-system-health',
  standalone: true,
  imports: [CommonModule, ServicePollMonitorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full flex flex-col bg-[rgb(var(--color-surface))] overflow-auto">
      <!-- Header -->
      <div class="flex-shrink-0 px-6 py-4 border-b border-[rgb(var(--color-border-base))]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6"
              [class.text-green-500]="summary()?.terrainUp"
              [class.text-red-500]="!summary()?.terrainUp && !loading()"
              [class.text-yellow-500]="loading()"
              viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" />
            </svg>
            <h2 class="text-xl font-semibold text-[rgb(var(--color-text-base))]">System Health</h2>
          </div>
          @if (summary()?.loadedAt) {
            <span class="text-xs text-[rgb(var(--color-text-muted))]">
              Last updated: {{ summary()!.loadedAt | date:'mediumTime' }}
            </span>
          }
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6">
        @if (loading()) {
          <!-- Loading state -->
          <div class="flex flex-col items-center justify-center h-64 gap-4">
            <div class="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent border-[rgb(var(--color-accent-ring))]"></div>
            <p class="text-[rgb(var(--color-text-muted))]">Checking terrain server status...</p>
          </div>
        } @else if (error()) {
          <!-- Error state -->
          <div class="max-w-lg mx-auto mt-8">
            <div class="p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div class="flex items-center gap-3 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                <h3 class="text-lg font-semibold text-red-500">Terrain Server is Down</h3>
              </div>
              <p class="text-[rgb(var(--color-text-muted))] text-sm">
                Unable to reach the terrain server at <code class="px-1.5 py-0.5 bg-[rgb(var(--color-surface-muted))] rounded text-xs">{{ baseUrl() }}</code>.
              </p>
              @if (summary()?.terrainError) {
                <p class="mt-2 text-xs text-red-400">{{ summary()?.terrainError }}</p>
              }
              <button
                (click)="refresh()"
                class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[rgb(var(--color-accent-solid-bg))] text-white rounded-md hover:opacity-90 transition-opacity text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10.899 12.101A7.002 7.002 0 012.399 8.567a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101z" clip-rule="evenodd" />
                </svg>
                Retry
              </button>
            </div>
          </div>
        } @else if (summary(); as s) {
          <!--
            Service taxonomy for this view:
              • Third-Party Dependencies  ← MCP Servers (typically external integrations we connect to)
              • Internal Services         ← Runnable Services (services we deploy and operate)
              • Host Servers              ← infrastructure / machines (shown separately, no taxonomy applied)
            Override per-item by adding an &quot;isThirdParty&quot; boolean to McpServer, or by
            deriving it from &quot;repositoryUrl&quot;; this is the current default.
          -->
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <!-- Third-Party Dependencies Card (MCP Servers are typically external integrations) -->
            <div class="p-5 bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-muted))]">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-[rgb(var(--color-text-muted))]">Third-Party Dependencies</span>
                <span class="text-2xl font-bold text-[rgb(var(--color-text-base))]">{{ s.mcpServers.length }}</span>
              </div>
              <div class="flex gap-2 text-xs">
                <span class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">{{ countEffective(s.mcpServers, 'ON') }} Online</span>
                <span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{{ countEffective(s.mcpServers, 'OFFLINE') }} Offline</span>
                @if (countEffective(s.mcpServers, 'DEGRADED') > 0) {
                  <span class="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600">{{ countEffective(s.mcpServers, 'DEGRADED') }} Degraded</span>
                }
              </div>
            </div>

            <!-- Internal Services Card (Runnable Services are services we deploy and operate) -->
            <div class="p-5 bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-muted))]">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-[rgb(var(--color-text-muted))]">Internal Services</span>
                <span class="text-2xl font-bold text-[rgb(var(--color-text-base))]">{{ s.runnableServices.length }}</span>
              </div>
              <div class="flex gap-2 text-xs">
                <span class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">{{ countEffective(s.runnableServices, 'ON') }} Online</span>
                <span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{{ countEffective(s.runnableServices, 'OFFLINE') }} Offline</span>
                @if (countEffective(s.runnableServices, 'DEGRADED') > 0) {
                  <span class="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600">{{ countEffective(s.runnableServices, 'DEGRADED') }} Degraded</span>
                }
              </div>
            </div>

            <!-- Servers Card -->
            <div class="p-5 bg-[rgb(var(--color-surface-muted))] rounded-xl border border-[rgb(var(--color-border-muted))]">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-[rgb(var(--color-text-muted))]">Host Servers</span>
                <span class="text-2xl font-bold text-[rgb(var(--color-text-base))]">{{ s.servers.length }}</span>
              </div>
              <div class="flex gap-2 text-xs">
                <span class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">{{ countServerByStatus(s.servers, 'ONLINE') }} Online</span>
                <span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{{ countServerByStatus(s.servers, 'OFFLINE') }} Offline</span>
              </div>
            </div>
          </div>

          <!-- Terrain Status Banner -->
          <div class="mb-6 p-4 rounded-lg border"
            [class.bg-green-500/5]="s.terrainUp && !hasIssues()"
            [class.border-green-500/20]="s.terrainUp && !hasIssues()"
            [class.bg-yellow-500/5]="hasIssues()"
            [class.border-yellow-500/20]="hasIssues()"
            [class.bg-red-500/5]="!s.terrainUp"
            [class.border-red-500/20]="!s.terrainUp"
          >
            <div class="flex items-center gap-2">
              <span class="relative flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  [class.bg-green-400]="s.terrainUp && !hasIssues()"
                  [class.bg-yellow-400]="hasIssues()"
                  [class.bg-red-400]="!s.terrainUp"
                ></span>
                <span class="relative inline-flex rounded-full h-3 w-3"
                  [class.bg-green-500]="s.terrainUp && !hasIssues()"
                  [class.bg-yellow-500]="hasIssues()"
                  [class.bg-red-500]="!s.terrainUp"
                ></span>
              </span>
              <span class="text-sm font-medium text-[rgb(var(--color-text-base))]">
                @if (hasIssues()) {
                  Terrain Server: <span class="text-yellow-500">Degraded</span>
                  <span class="ml-2 text-xs text-[rgb(var(--color-text-muted))]">
                    {{ countOffline() }} service(s) offline, {{ countDegraded() }} degraded
                  </span>
                } @else if (s.terrainUp) {
                  Terrain Server: <span class="text-green-500">Online</span>
                } @else {
                  Terrain Server: <span class="text-red-500">Offline</span>
                }
              </span>
              <span class="text-xs text-[rgb(var(--color-text-muted))] ml-auto">{{ baseUrl() }}</span>
            </div>
          </div>

          <!-- Third-Party Dependencies Table (MCP Servers we connect to) -->
          @if (s.mcpServers.length > 0) {
            <div class="mb-8">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))] mb-3">Third-Party Dependencies</h3>
              <div class="overflow-x-auto rounded-lg border border-[rgb(var(--color-border-muted))]">
                <table class="w-full text-left border-collapse">
                  <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase">
                    <tr>
                      <th class="p-3 font-semibold">Name</th>
                      <th class="p-3 font-semibold">Port</th>
                      <th class="p-3 font-semibold">Transport</th>
                      <th class="p-3 font-semibold">Status</th>
                      <th class="p-3 font-semibold">Health Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (mcp of s.mcpServers; track mcp.id) {
                      @let eff = getEffectiveStatus(mcp);
                      @let probed = isLiveProbed(mcp);
                      <tr class="border-t border-[rgb(var(--color-border-muted))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                        [class.opacity-50]="!mcp.activeFlag">
                        <td class="p-3 text-sm">
                          <span class="font-medium text-[rgb(var(--color-text-base))]">{{ mcp.name }}</span>
                          @if (mcp.version) {
                            <span class="ml-2 text-xs text-[rgb(var(--color-text-muted))]">v{{ mcp.version }}</span>
                          }
                        </td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))] font-mono">{{ mcp.port || '—' }}</td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))]">{{ mcp.transportType || '—' }}</td>
                        <td class="p-3">
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            [class.bg-green-500/10]="eff === 'ON'"
                            [class.text-green-600]="eff === 'ON'"
                            [class.bg-red-500/10]="eff === 'OFFLINE'"
                            [class.text-red-500]="eff === 'OFFLINE'"
                            [class.bg-yellow-500/10]="eff === 'DEGRADED'"
                            [class.text-yellow-600]="eff === 'DEGRADED'"
                            [class.bg-gray-500/10]="eff !== 'ON' && eff !== 'OFFLINE' && eff !== 'DEGRADED'"
                            [class.text-gray-500]="eff !== 'ON' && eff !== 'OFFLINE' && eff !== 'DEGRADED'"
                          >
                            <span class="w-1.5 h-1.5 rounded-full"
                              [class.bg-green-500]="eff === 'ON'"
                              [class.bg-red-500]="eff === 'OFFLINE'"
                              [class.bg-yellow-500]="eff === 'DEGRADED'"
                              [class.bg-gray-400]="eff !== 'ON' && eff !== 'OFFLINE' && eff !== 'DEGRADED'"
                              [class.animate-pulse]="probed"
                            ></span>
                            {{ eff }}
                          </span>
                          @if (probed && eff !== mcp.status) {
                            <span class="ml-1.5 text-[10px] text-[rgb(var(--color-text-muted))] line-through">{{ mcp.status }}</span>
                          }
                        </td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))] font-mono text-xs">{{ mcp.healthCheckUrl || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="mb-8 p-6 text-center text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-muted))] rounded-lg border border-[rgb(var(--color-border-muted))]">
              <p class="text-sm">No third-party dependencies registered in terrain (no MCP servers).</p>
            </div>
          }

          <!-- Internal Services Table (services we deploy and run) -->
          @if (s.runnableServices.length > 0) {
            <div class="mb-8">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))] mb-3">Internal Services</h3>
              <div class="overflow-x-auto rounded-lg border border-[rgb(var(--color-border-muted))]">
                <table class="w-full text-left border-collapse">
                  <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase">
                    <tr>
                      <th class="p-3 font-semibold">Name</th>
                      <th class="p-3 font-semibold">Port</th>
                      <th class="p-3 font-semibold">Workspace</th>
                      <th class="p-3 font-semibold">Status</th>
                      <th class="p-3 font-semibold">Health Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (svc of s.runnableServices; track svc.id) {
                      @let eff = getEffectiveStatus(svc);
                      @let probed = isLiveProbed(svc);
                      <tr class="border-t border-[rgb(var(--color-border-muted))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                        [class.opacity-50]="!svc.activeFlag">
                        <td class="p-3 text-sm">
                          <span class="font-medium text-[rgb(var(--color-text-base))]">{{ svc.name }}</span>
                          @if (svc.version) {
                            <span class="ml-2 text-xs text-[rgb(var(--color-text-muted))]">v{{ svc.version }}</span>
                          }
                        </td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))] font-mono">{{ svc.port || '—' }}</td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))] font-mono text-xs">{{ svc.workspacePath || '—' }}</td>
                        <td class="p-3">
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            [class.bg-green-500/10]="eff === 'ON'"
                            [class.text-green-600]="eff === 'ON'"
                            [class.bg-red-500/10]="eff === 'OFFLINE'"
                            [class.text-red-500]="eff === 'OFFLINE'"
                            [class.bg-yellow-500/10]="eff === 'DEGRADED'"
                            [class.text-yellow-600]="eff === 'DEGRADED'"
                            [class.bg-gray-500/10]="eff !== 'ON' && eff !== 'OFFLINE' && eff !== 'DEGRADED'"
                            [class.text-gray-500]="eff !== 'ON' && eff !== 'OFFLINE' && eff !== 'DEGRADED'"
                          >
                            <span class="w-1.5 h-1.5 rounded-full"
                              [class.bg-green-500]="eff === 'ON'"
                              [class.bg-red-500]="eff === 'OFFLINE'"
                              [class.bg-yellow-500]="eff === 'DEGRADED'"
                              [class.bg-gray-400]="eff !== 'ON' && eff !== 'OFFLINE' && eff !== 'DEGRADED'"
                              [class.animate-pulse]="probed"
                            ></span>
                            {{ eff }}
                          </span>
                          @if (probed && eff !== svc.status) {
                            <span class="ml-1.5 text-[10px] text-[rgb(var(--color-text-muted))] line-through">{{ svc.status }}</span>
                          }
                        </td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))] font-mono text-xs">{{ svc.healthCheckUrl || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="mb-8 p-6 text-center text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-muted))] rounded-lg border border-[rgb(var(--color-border-muted))]">
              <p class="text-sm">No internal services deployed yet (no runnable services).</p>
            </div>
          }

          <!-- Servers Table -->
          @if (s.servers.length > 0) {
            <div class="mb-8">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--color-text-muted))] mb-3">Host Servers</h3>
              <div class="overflow-x-auto rounded-lg border border-[rgb(var(--color-border-muted))]">
                <table class="w-full text-left border-collapse">
                  <thead class="bg-[rgb(var(--color-surface-muted))] text-xs text-[rgb(var(--color-text-muted))] uppercase">
                    <tr>
                      <th class="p-3 font-semibold">Hostname</th>
                      <th class="p-3 font-semibold">IP Address</th>
                      <th class="p-3 font-semibold">OS</th>
                      <th class="p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (server of s.servers; track server.id) {
                      <tr class="border-t border-[rgb(var(--color-border-muted))] hover:bg-[rgb(var(--color-surface-hover))] transition-colors"
                        [class.opacity-50]="!server.activeFlag">
                        <td class="p-3 text-sm font-medium text-[rgb(var(--color-text-base))]">{{ server.hostname }}</td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))] font-mono">{{ server.ipAddress || '—' }}</td>
                        <td class="p-3 text-sm text-[rgb(var(--color-text-muted))]">{{ server.os || '—' }}</td>
                        <td class="p-3">
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            [class.bg-green-500/10]="server.status === 'ONLINE'"
                            [class.text-green-600]="server.status === 'ONLINE'"
                            [class.bg-red-500/10]="server.status === 'OFFLINE'"
                            [class.text-red-500]="server.status === 'OFFLINE'"
                            [class.bg-yellow-500/10]="server.status === 'MAINTENANCE'"
                            [class.text-yellow-600]="server.status === 'MAINTENANCE'"
                            [class.bg-gray-500/10]="server.status !== 'ONLINE' && server.status !== 'OFFLINE' && server.status !== 'MAINTENANCE'"
                            [class.text-gray-500]="server.status !== 'ONLINE' && server.status !== 'OFFLINE' && server.status !== 'MAINTENANCE'"
                          >
                            <span class="w-1.5 h-1.5 rounded-full"
                              [class.bg-green-500]="server.status === 'ONLINE'"
                              [class.bg-red-500]="server.status === 'OFFLINE'"
                              [class.bg-yellow-500]="server.status === 'MAINTENANCE'"
                              [class.bg-gray-400]="server.status !== 'ONLINE' && server.status !== 'OFFLINE' && server.status !== 'MAINTENANCE'"
                            ></span>
                            {{ server.status }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="p-6 text-center text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-muted))] rounded-lg border border-[rgb(var(--color-border-muted))]">
              <p class="text-sm">No host servers registered in terrain.</p>
            </div>
          }

          <!-- Empty state when no data at all -->
          @if (s.mcpServers.length === 0 && s.runnableServices.length === 0 && s.servers.length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-[rgb(var(--color-text-muted))] opacity-30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
              </svg>
              <h3 class="text-lg font-medium text-[rgb(var(--color-text-muted))] mb-1">No Services Registered</h3>
              <p class="text-sm text-[rgb(var(--color-text-muted))] max-w-md">
                The terrain server is online but has no internal services, third-party dependencies, or host servers registered yet.
              </p>
            </div>
          }

          <!-- ── HTTP Service Health Monitor (transplanted from nebula-ui) ── -->
          <app-service-poll-monitor />
        }
      </div>

      <!-- Footer with refresh button and auto-refresh controls -->
      @if (!loading() && !error()) {
        <div class="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-[rgb(var(--color-border-base))] bg-[rgb(var(--color-surface-muted))]">
          <!-- Auto-refresh toggle -->
          <div class="flex items-center gap-2">
            <button
              (click)="toggleAutoRefresh()"
              class="inline-flex items-center gap-1.5 text-[11px] rounded-md transition-colors px-2 py-1"
              [class.text-green-500]="autoRefresh()"
              [class.bg-green-500/10]="autoRefresh()"
              [class.text-[rgb(var(--color-text-muted))]]="!autoRefresh()"
              [class.bg-[rgb(var(--color-surface-hover))]]="!autoRefresh()"
              title="Toggle auto-refresh"
            >
              <span class="relative flex h-2 w-2" [class.animate-pulse]="autoRefresh()">
                <span class="absolute inline-flex h-full w-full rounded-full opacity-75"
                  [class.bg-green-500]="autoRefresh()"
                  [class.bg-gray-400]="!autoRefresh()"
                ></span>
                <span class="relative inline-flex rounded-full h-2 w-2"
                  [class.bg-green-500]="autoRefresh()"
                  [class.bg-gray-400]="!autoRefresh()"
                ></span>
              </span>
              @if (autoRefresh()) {
                <span>Auto {{ nextRefreshIn() }}s</span>
              } @else {
                <span>Auto off</span>
              }
            </button>
          </div>
          <button
            (click)="refresh()"
            class="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-base))] hover:bg-[rgb(var(--color-surface-hover))] rounded-md transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10.899 12.101A7.002 7.002 0 012.399 8.567a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101z" clip-rule="evenodd" />
            </svg>
            Refresh now
          </button>
        </div>
      }
    </div>
  `,
})
export class SystemHealthComponent implements OnDestroy {
  private terrainService = inject(TerrainService);

  /** Base URL of the terrain server (e.g. http://localhost:8084) */
  baseUrl = input.required<string>();

  loading = signal(true);
  error = signal(false);
  summary = signal<TerrainHealthSummary | null>(null);

  /** Number of probed services that are effectively OFFLINE */
  countOffline = signal(0);
  /** Number of probed services that are effectively DEGRADED */
  countDegraded = signal(0);
  /** True when the terrain endpoint is reachable but some services have issues */
  hasIssues = computed(() => this.countOffline() > 0 || this.countDegraded() > 0);

  /** Auto-refresh enabled state (default: on at 12s interval) */
  autoRefresh = signal(true);
  private readonly AUTO_REFRESH_MS = 12_000;
  private autoRefreshTimerId: ReturnType<typeof setInterval> | null = null;
  /** Seconds remaining until the next auto-refresh */
  nextRefreshIn = signal(0);
  private countdownTimerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Reactively fetch data when baseUrl changes (initial load only)
    effect(() => {
      const url = this.baseUrl();
      if (url) {
        this.loadData(url, true);
      }
    });
  }

  private async loadData(baseUrl: string, showLoading = false): Promise<void> {
    if (showLoading) {
      this.loading.set(true);
    }
    this.error.set(false);

    try {
      const summary = await this.terrainService.getHealthSummary(baseUrl);
      this.summary.set(summary);

      // Count issues from probed services
      let offline = 0;
      let degraded = 0;
      for (const mcp of summary.mcpServers) {
        const eff = this.getEffectiveStatus(mcp);
        if (eff === 'OFFLINE') offline++;
        if (eff === 'DEGRADED') degraded++;
      }
      for (const svc of summary.runnableServices) {
        const eff = this.getEffectiveStatus(svc);
        if (eff === 'OFFLINE') offline++;
        if (eff === 'DEGRADED') degraded++;
      }
      this.countOffline.set(offline);
      this.countDegraded.set(degraded);

      // terrainUp=false + no terrainError → terrain responded, downstream
      // services are just offline. The banner handles this as "Degraded".
      // terrainUp=false + terrainError → terrain is genuinely unreachable.
      // Show the error screen so the user sees the connection problem.
      if (!summary.terrainUp && summary.terrainError) {
        this.error.set(true);
      }
    } catch (err: any) {
      this.error.set(true);
      this.summary.set({
        terrainUp: false,
        terrainError: err?.message || 'Unknown error',
        mcpServers: [],
        runnableServices: [],
        servers: [],
        loadedAt: new Date(),
      });
      this.countOffline.set(0);
      this.countDegraded.set(0);
    } finally {
      this.loading.set(false);
      // Always reschedule auto-refresh so it keeps retrying even when terrain is down
      this.scheduleAutoRefresh();
    }
  }

  refresh(): void {
    this.loadData(this.baseUrl(), true);
  }

  /** Toggle auto-refresh on/off */
  toggleAutoRefresh(): void {
    this.autoRefresh.update(v => !v);
    if (this.autoRefresh()) {
      this.scheduleAutoRefresh();
    } else {
      this.clearAutoRefresh();
    }
  }

  /** Schedule the next auto-refresh cycle */
  private scheduleAutoRefresh(): void {
    this.clearAutoRefresh();
    if (!this.autoRefresh()) return;

    // Reset countdown
    this.nextRefreshIn.set(Math.round(this.AUTO_REFRESH_MS / 1000));

    // Countdown every second
    this.countdownTimerId = setInterval(() => {
      this.nextRefreshIn.update(v => Math.max(0, v - 1));
    }, 1000);

    // Auto-refresh after interval — no loading spinner to avoid blink
    this.autoRefreshTimerId = setTimeout(() => {
      this.loadData(this.baseUrl(), false);
    }, this.AUTO_REFRESH_MS);
  }

  /** Clear all auto-refresh timers */
  private clearAutoRefresh(): void {
    if (this.autoRefreshTimerId !== null) {
      clearTimeout(this.autoRefreshTimerId);
      this.autoRefreshTimerId = null;
    }
    if (this.countdownTimerId !== null) {
      clearInterval(this.countdownTimerId);
      this.countdownTimerId = null;
    }
  }

  ngOnDestroy(): void {
    this.clearAutoRefresh();
  }

  /**
   * Get the effective status for a service item.
   *
   * Priority:
   * 1. liveStatus from the live probe (ON, OFFLINE, DEGRADED) — the ground truth
   * 2. Stored status, normalized to probe-style values (ONLINE→ON, OFFLINE→OFFLINE)
   *
   * This ensures probed-offline services properly show as OFFLINE (red)
   * rather than falling through to a stale stored ONLINE status.
   */
  getEffectiveStatus(item: { status: string; liveStatus?: string }): string {
    // If the probe returned a meaningful result, use it directly
    if (item.liveStatus && item.liveStatus !== 'UNKNOWN') {
      return item.liveStatus;
    }
    // Normalize stored status to probe-style values
    if (item.status === 'ONLINE') return 'ON';
    if (item.status === 'OFFLINE') return 'OFFLINE';
    // Keep STARTING, ERROR, etc. as-is (they'll render gray in the template)
    return item.status;
  }

  /** Whether the live probe ran (any meaningful result, not just ON). */
  isLiveProbed(item: { liveStatus?: string }): boolean {
    return !!item.liveStatus && item.liveStatus !== 'UNKNOWN';
  }

  /** Count items by effective status (liveStatus preferred). */
  countEffective(items: { status: string; liveStatus?: string }[], status: string): number {
    return items.filter(i => this.getEffectiveStatus(i) === status).length;
  }

  countServerByStatus(items: { status: string }[], status: string): number {
    return items.filter(i => i.status === status).length;
  }
}
