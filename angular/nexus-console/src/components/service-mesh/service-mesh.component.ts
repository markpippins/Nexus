import { ChangeDetectionStrategy, Component, computed, inject, signal, model, OnInit, effect, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { ServiceMeshService } from '../../services/service-mesh.service.js';

import { ServiceGraphComponent } from '../service-graph/service-graph.component.js';
import { ServiceDetailsComponent } from '../service-details/service-details.component.js';

import {
  ServiceInstance,
  ServiceDependency,
  Deployment,
  ServiceMeshSummary
} from '../../models/service-mesh.model.js';

// --- Mock observability interfaces ---

interface MockMetricPoint {
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'flat';
  trendValue: number;
}

interface MockPipelineStage {
  name: string;
  status: 'success' | 'running' | 'failed' | 'pending' | 'skipped';
  duration: string;
}

interface MockContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'exited' | 'paused' | 'restarting';
  cpu: number;
  memory: string;
  uptime: string;
}

interface MockEventLogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
}

@Component({
  selector: 'app-service-mesh',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    ServiceGraphComponent,
    ServiceDetailsComponent
  ],
  templateUrl: './service-mesh.component.html',
  styleUrls: ['./service-mesh.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceMeshComponent implements OnInit {
  private serviceMeshService = inject(ServiceMeshService);

  // Input from parent (controlled mode)
  meshViewMode = input<'console' | 'graph'>('console');
  graphSubView = input<'canvas' | 'creator'>('canvas');
  showRunningOnly = model(false);
  paletteCollapsed = input(false);
  toolbarAction = input<{ name: string; payload?: any; id: number } | null>(null);

  // State
  services = signal<ServiceInstance[]>([]);
  dependencies = signal<ServiceDependency[]>([]);
  deployments = signal<Deployment[]>([]);
  selectedService = this.serviceMeshService.selectedService;
  viewMode = signal<'console' | 'graph'>('console'); // Internal state, synced with input
  isRefreshing = signal(false);

  // Active observability sub-tab
  activeObsTab = signal<'overview' | 'metrics' | 'pipeline' | 'containers' | 'events'>('overview');

  // Output for parent synchronization
  viewModeChange = output<'console' | 'graph'>();
  graphSubViewChange = output<'canvas' | 'creator'>();
  refreshServices = output<void>();

  // Computed properties
  summary = computed(() => this.serviceMeshService.summary());
  frameworkGroups = computed(() => this.serviceMeshService.frameworkGroups());
  selectedServiceConfigurations = computed(() => this.serviceMeshService.selectedServiceConfigurations());

  // --- Mock observability data ---

  /** Live-style metrics panel (mock — will be wired to real telemetry later). */
  mockMetrics = signal<MockMetricPoint[]>([
    { label: 'Requests/sec', value: 1247, unit: 'rps', trend: 'up', trendValue: 12.3 },
    { label: 'Avg Latency', value: 42, unit: 'ms', trend: 'down', trendValue: 8.1 },
    { label: 'Error Rate', value: 0.3, unit: '%', trend: 'flat', trendValue: 0.0 },
    { label: 'CPU Usage', value: 38, unit: '%', trend: 'up', trendValue: 5.2 },
    { label: 'Memory', value: 512, unit: 'MB', trend: 'up', trendValue: 3.4 },
    { label: 'Active Conn.', value: 89, unit: '', trend: 'down', trendValue: 2.1 },
  ]);

  /** CI/CD pipeline stages (mock — will drive Ballerina→GitHub→Jenkins later). */
  mockPipeline = signal<MockPipelineStage[]>([
    { name: 'Source (GitHub)', status: 'success', duration: '3s' },
    { name: 'Build (Ballerina)', status: 'success', duration: '1m 12s' },
    { name: 'Test', status: 'success', duration: '45s' },
    { name: 'Scan (SAST)', status: 'running', duration: 'running...' },
    { name: 'Package', status: 'pending', duration: '—' },
    { name: 'Deploy (Jenkins)', status: 'pending', duration: '—' },
  ]);

  /** Container fleet view (mock — will invoke docker/swarm/k8s later). */
  mockContainers = signal<MockContainer[]>([
    { id: 'a3f2c1', name: 'atlas-srv-prod', image: 'nexus/atlas-srv:2.1.0', status: 'running', cpu: 23, memory: '412MB', uptime: '3d 2h' },
    { id: 'b8e4d2', name: 'conduit-mcp-1', image: 'nexus/conduit-mcp:1.4.2', status: 'running', cpu: 12, memory: '128MB', uptime: '6h 15m' },
    { id: 'c1d5a9', name: 'nebula-srv-staging', image: 'nexus/nebula-srv:0.9.1', status: 'restarting', cpu: 0, memory: '64MB', uptime: '2m' },
    { id: 'd9f2b7', name: 'terrain-srv-prod', image: 'nexus/terrain-srv:3.0.0', status: 'running', cpu: 8, memory: '256MB', uptime: '12d 4h' },
    { id: 'e4a7c3', name: 'wind-srv-dev', image: 'nexus/wind-srv:0.5.0', status: 'exited', cpu: 0, memory: '0MB', uptime: '—' },
  ]);

  /** Event log / activity stream (mock — will stream real events later). */
  mockEvents = signal<MockEventLogEntry[]>([
    { id: 1, timestamp: '14:32:18', level: 'success', source: 'Jenkins', message: 'Pipeline #847 build completed successfully' },
    { id: 2, timestamp: '14:31:05', level: 'info', source: 'Docker', message: 'Container atlas-srv-prod health check passed' },
    { id: 3, timestamp: '14:30:42', level: 'warning', source: 'K8s', message: 'Pod nebula-srv-staging restart count: 3' },
    { id: 4, timestamp: '14:28:11', level: 'info', source: 'GitHub', message: 'Push to main: feat(atlas): add connection persistence' },
    { id: 5, timestamp: '14:25:33', level: 'error', source: 'Docker', message: 'Container wind-srv-dev exited with code 137' },
    { id: 6, timestamp: '14:22:07', level: 'success', source: 'Swarm', message: 'Service terrain-srv scaled to 3 replicas' },
    { id: 7, timestamp: '14:18:44', level: 'info', source: 'Ballerina', message: 'Generated interface stubs for jenkins-client' },
  ]);

  // --- Health percentage for the ring gauge ---
  healthPercentage = computed(() => {
    const s = this.summary();
    const total = s.healthyDeployments + s.unhealthyDeployments;
    if (total === 0) return 0;
    return Math.round((s.healthyDeployments / total) * 100);
  });

  // --- Derived counts for template (Angular templates can't use arrow functions) ---
  runningContainerCount = computed(() => this.mockContainers().filter(c => c.status === 'running').length);

  constructor() {
    // Set up reactive effects to update component state from service
    effect(() => {
      this.services.set(this.serviceMeshService.services());
    });

    effect(() => {
      this.dependencies.set(this.serviceMeshService.dependencies());
    });

    effect(() => {
      this.deployments.set(this.serviceMeshService.deployments());
    });

    // Sync view mode from parent input
    effect(() => {
      const mode = this.meshViewMode();
      this.viewMode.set(mode);
    });

    // React to toolbar actions forwarded from the app component
    effect(() => {
      const action = this.toolbarAction();
      if (action) {
        this.handleToolbarAction(action.name);
      }
    });

    // Start polling when the component is created
    this.serviceMeshService.startPolling();
  }

  ngOnInit(): void {
    // Initial data fetch
    this.refreshData();
  }

  ngOnDestroy(): void {
    this.serviceMeshService.stopPolling();
    this.serviceMeshService.selectService(null);
  }

  refreshData(): void {
    this.isRefreshing.set(true);
    this.serviceMeshService.fetchAllData().finally(() => {
      this.isRefreshing.set(false);
    });
  }

  onServiceSelected(service: ServiceInstance): void {
    this.serviceMeshService.selectService(service);
    // The object inspector now lives in the left sidebar (canvas mode), so
    // selecting a graph node no longer auto-opens the right details pane.
  }

  // --- Toolbar action handler ---

  handleToolbarAction(action: string): void {
    const service = this.selectedService();
    switch (action) {
      case 'deploy':
        this.addMockEvent('info', 'Deploy', service ? `Deploying ${service.name}...` : 'No service selected for deploy');
        break;
      case 'start':
        this.executeServiceOp('start');
        break;
      case 'stop':
        this.executeServiceOp('stop');
        break;
      case 'restart':
        this.executeServiceOp('restart');
        break;
      case 'logs':
        this.executeServiceOp('view-logs');
        break;
      case 'github':
        this.addMockEvent('info', 'GitHub', service ? `Opening GitHub repo for ${service.name}...` : 'No service selected');
        if (service?.repositoryUrl) {
          window.open(service.repositoryUrl, '_blank');
        }
        break;
      case 'jenkins':
        this.addMockEvent('info', 'Jenkins', service ? `Triggering Jenkins pipeline for ${service.name}...` : 'No service selected');
        // Mock: advance pipeline to running
        this.mockPipeline.update(stages => stages.map(s =>
          s.name.includes('Deploy') ? { ...s, status: 'running', duration: 'running...' } : s
        ));
        break;
      case 'docker':
        this.addMockEvent('info', 'Docker', service ? `docker build & run for ${service.name}...` : 'Docker context');
        this.activeObsTab.set('containers');
        break;
      case 'swarm':
        this.addMockEvent('info', 'Swarm', service ? `docker swarm deploy ${service.name}...` : 'Swarm context');
        this.activeObsTab.set('containers');
        break;
      case 'k8s':
        this.addMockEvent('info', 'K8s', service ? `kubectl apply -f ${service.name}.yaml...` : 'Kubernetes context');
        this.activeObsTab.set('containers');
        break;
    }
  }

  private async executeServiceOp(operation: string): Promise<void> {
    const service = this.selectedService();
    if (!service) {
      this.addMockEvent('warning', 'Console', `No service selected for ${operation}`);
      return;
    }
    const profiles = this.serviceMeshService.connections();
    const profileArray = Array.from(profiles.values());
    if (profileArray.length > 0 && profileArray[0].connected) {
      const connection = profileArray[0];
      const result = await this.serviceMeshService.executeServiceOperation(
        service.id, operation as any, connection.profile
      );
      if (result.success) {
        this.addMockEvent('success', operation, `${service.name}: ${operation} completed`);
      } else {
        this.addMockEvent('error', operation, `${service.name}: ${result.message || 'operation failed'}`);
      }
    } else {
      this.addMockEvent('error', operation, 'No connected host profiles available');
    }
  }

  private addMockEvent(level: MockEventLogEntry['level'], source: string, message: string): void {
    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 8);
    this.mockEvents.update(events => [
      { id: Date.now(), timestamp, level, source, message },
      ...events.slice(0, 19) // keep last 20
    ]);
  }

  switchToGraphView(): void {
    this.viewMode.set('graph');
    this.viewModeChange.emit('graph');
  }

  switchToConsoleView(): void {
    this.viewMode.set('console');
    this.viewModeChange.emit('console');
  }

  // --- Mock data helpers for template ---

  getPipelineStatusIcon(status: MockPipelineStage['status']): string {
    switch (status) {
      case 'success': return 'check_circle';
      case 'running': return 'autorenew';
      case 'failed': return 'cancel';
      case 'pending': return 'schedule';
      case 'skipped': return 'skip_next';
    }
  }

  getContainerStatusColor(status: MockContainer['status']): string {
    switch (status) {
      case 'running': return 'var(--color-success, #22c55e)';
      case 'exited': return 'var(--color-muted, #6b7280)';
      case 'paused': return 'var(--color-warning, #f59e0b)';
      case 'restarting': return 'var(--color-warning, #f59e0b)';
    }
  }

  getEventLevelColor(level: MockEventLogEntry['level']): string {
    switch (level) {
      case 'info': return 'var(--color-accent-text, #3b82f6)';
      case 'warning': return 'var(--color-warning, #f59e0b)';
      case 'error': return 'var(--color-error, #ef4444)';
      case 'success': return 'var(--color-success, #22c55e)';
    }
  }

  getTrendIcon(trend: MockMetricPoint['trend']): string {
    switch (trend) {
      case 'up': return 'trending_up';
      case 'down': return 'trending_down';
      case 'flat': return 'trending_flat';
    }
  }

  getTrendColor(trend: MockMetricPoint['trend']): string {
    switch (trend) {
      case 'up': return 'var(--color-success, #22c55e)';
      case 'down': return 'var(--color-accent-text, #3b82f6)';
      case 'flat': return 'var(--color-text-subtle, #6b7280)';
    }
  }

  /** Clamp a value to 0–100 for the metric bar fill width. */
  clampPercent(value: number): number {
    return Math.min(Math.max(value, 0), 100);
  }
}
