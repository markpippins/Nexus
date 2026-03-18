import { Component, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ServiceMeshService } from '../../services/service-mesh.service.js';
import { HostProfileService } from '../../services/host-profile.service.js';
import {
  ServiceInstance,
  Deployment,
  ServiceConfiguration,
  getHealthStatusColor
} from '../../models/service-mesh.model.js';

@Component({
  selector: 'app-service-details',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './service-details.component.html',
  styleUrls: ['./service-details.component.css']
})
export class ServiceDetailsComponent {
  private serviceMeshService = inject(ServiceMeshService);
  private hostProfileService = inject(HostProfileService);

  service = input<ServiceInstance | null>(null);
  deployments = input<Deployment[]>([]);
  configurations = input<ServiceConfiguration[]>([]);

  // Computed properties
  serviceDeployments = computed(() => {
    const service = this.service();
    if (!service) return [];

    return this.deployments().filter(d => d.service.id === service.id);
  });

  healthStatus = computed(() => {
    const serviceDeployments = this.serviceDeployments();
    if (serviceDeployments.length === 0) {
      return 'UNKNOWN';
    }

    // Check all deployments for overall health
    const statuses = serviceDeployments.map(d => d.healthStatus);

    if (statuses.some(s => s === 'UNHEALTHY')) {
      return 'UNHEALTHY';
    } else if (statuses.some(s => s === 'DEGRADED')) {
      return 'DEGRADED';
    } else if (statuses.every(s => s === 'HEALTHY')) {
      return 'HEALTHY';
    } else {
      return 'UNKNOWN';
    }
  });

  healthStatusColor = computed(() => {
    return getHealthStatusColor(this.healthStatus());
  });

  getHealthStatusColor(status: string): string {
    return getHealthStatusColor(status as any);
  }

  isAllDeploymentsRunning(): boolean {
    return this.serviceDeployments().every(d => d.status === 'RUNNING');
  }

  isAllDeploymentsStopped(): boolean {
    return this.serviceDeployments().every(d => d.status === 'STOPPED');
  }

  async onRestartService(): Promise<void> {
    const service = this.service();
    if (service) {
      // Find the first host profile to use for the operation
      const profiles = this.hostProfileService.profiles();
      if (profiles.length > 0) {
        const profile = profiles[0]; // In a more sophisticated version, we could select based on service metadata
        const result = await this.serviceMeshService.executeServiceOperation(service.id, 'restart', profile);
        console.log('Restart operation result:', result);

        if (!result.success) {
          console.error('Failed to restart service:', result.message);
        }
      }
    }
  }

  async onViewLogs(): Promise<void> {
    const service = this.service();
    if (service) {
      // Find the first host profile to use for the operation
      const profiles = this.hostProfileService.profiles();
      if (profiles.length > 0) {
        const profile = profiles[0];
        const result = await this.serviceMeshService.executeServiceOperation(service.id, 'view-logs', profile);
        console.log('View logs operation result:', result);

        // In a real implementation, we would open logs in a new window/tab
        if (result.success && result.data && typeof result.data === 'object' && 'logsUrl' in result.data) {
          const logsUrl = (result.data as any).logsUrl;
          window.open(logsUrl, '_blank');
        }
      }
    }
  }

  async onStartService(): Promise<void> {
    const service = this.service();
    if (service) {
      // Find the first host profile to use for the operation
      const profiles = this.hostProfileService.profiles();
      if (profiles.length > 0) {
        const profile = profiles[0];
        const result = await this.serviceMeshService.executeServiceOperation(service.id, 'start', profile);
        console.log('Start operation result:', result);

        if (!result.success) {
          console.error('Failed to start service:', result.message);
        }
      }
    }
  }

  async onStopService(): Promise<void> {
    const service = this.service();
    if (service) {
      // Find the first host profile to use for the operation
      const profiles = this.hostProfileService.profiles();
      if (profiles.length > 0) {
        const profile = profiles[0];
        const result = await this.serviceMeshService.executeServiceOperation(service.id, 'stop', profile);
        console.log('Stop operation result:', result);

        if (!result.success) {
          console.error('Failed to stop service:', result.message);
        }
      }
    }
  }
}