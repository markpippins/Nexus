import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit, effect, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { ServiceMeshService } from '../../services/service-mesh.service.js';
import { UiPreferencesService } from '../../services/ui-preferences.service.js';
import { ServiceGraphComponent } from '../service-graph/service-graph.component.js';
import { ServiceDetailsComponent } from '../service-details/service-details.component.js';
import { ComponentCreatorComponent } from '../component-creator/component-creator.component.js';

import {
  ServiceInstance,
  ServiceDependency,
  Deployment,
  ServiceMeshSummary
} from '../../models/service-mesh.model.js';

@Component({
  selector: 'app-service-mesh',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    ServiceGraphComponent,
    ServiceDetailsComponent,
    ComponentCreatorComponent
  ],
  templateUrl: './service-mesh.component.html',
  styleUrls: ['./service-mesh.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceMeshComponent implements OnInit {
  private serviceMeshService = inject(ServiceMeshService);
  private uiPreferencesService = inject(UiPreferencesService);

  // Input from parent (controlled mode)
  meshViewMode = input<'console' | 'graph'>('console');
  graphSubView = input<'canvas' | 'creator'>('canvas');

  // State
  services = signal<ServiceInstance[]>([]);
  dependencies = signal<ServiceDependency[]>([]);
  deployments = signal<Deployment[]>([]);
  selectedService = this.serviceMeshService.selectedService;
  viewMode = signal<'console' | 'graph'>('console'); // Internal state, synced with input
  isRefreshing = signal(false);

  // Output for parent synchronization
  viewModeChange = output<'console' | 'graph'>();
  graphSubViewChange = output<'canvas' | 'creator'>();

  // Computed properties
  summary = computed(() => this.serviceMeshService.summary());
  frameworkGroups = computed(() => this.serviceMeshService.frameworkGroups());
  selectedServiceConfigurations = computed(() => this.serviceMeshService.selectedServiceConfigurations());

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

    // Debug: Log summary values
    effect(() => {
      const summaryValue = this.summary();
      console.log('[ServiceMeshComponent] Summary in component:', summaryValue);
      console.log('[ServiceMeshComponent] Healthy deployments:', summaryValue.healthyDeployments);
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
    if (!this.uiPreferencesService.isDetailPaneOpen()) {
      this.uiPreferencesService.toggleDetailPane();
    }
  }

  async onServiceRestart(service: ServiceInstance): Promise<void> {
    // Find the first host profile to use for the operation
    const profiles = this.serviceMeshService.connections();
    const profileArray = Array.from(profiles.values());

    if (profileArray.length > 0 && profileArray[0].connected) {
      const connection = profileArray[0];
      const result = await this.serviceMeshService.executeServiceOperation(
        service.id,
        'restart',
        connection.profile
      );
      console.log('Restart operation result:', result);

      if (!result.success) {
        console.error('Failed to restart service:', result.message);
      }
    } else {
      console.error('No connected host profiles available for service operation');
    }
  }

  async onServiceLogs(service: ServiceInstance): Promise<void> {
    // Find the first host profile to use for the operation
    const profiles = this.serviceMeshService.connections();
    const profileArray = Array.from(profiles.values());

    if (profileArray.length > 0 && profileArray[0].connected) {
      const connection = profileArray[0];
      const result = await this.serviceMeshService.executeServiceOperation(
        service.id,
        'view-logs',
        connection.profile
      );
      console.log('View logs operation result:', result);

      // In a real implementation, we would open logs in a new window/tab
      if (result.success && result.data && typeof result.data === 'object' && 'logsUrl' in result.data) {
        const logsUrl = (result.data as any).logsUrl;
        window.open(logsUrl, '_blank');
      }
    } else {
      console.error('No connected host profiles available for service operation');
    }
  }

  switchToGraphView(): void {
    this.viewMode.set('graph');
    this.viewModeChange.emit('graph');
  }

  switchToConsoleView(): void {
    this.viewMode.set('console');
    this.viewModeChange.emit('console');
  }
}