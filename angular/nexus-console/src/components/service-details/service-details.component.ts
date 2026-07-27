import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

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
    CommonModule
  ],
  templateUrl: './service-details.component.html',
  styleUrls: ['./service-details.component.css']
})
export class ServiceDetailsComponent {

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

}