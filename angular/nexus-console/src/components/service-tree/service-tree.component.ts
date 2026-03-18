import { Component, input, output, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ServiceMeshService } from '../../services/service-mesh.service.js';
import { HostProfileService } from '../../services/host-profile.service.js';
import { LocalConfigService } from '../../services/local-config.service.js';
import {
  ServiceInstance,
  Framework,
  ServiceDependency,
  Deployment,
  HealthStatus,
  DeploymentStatus,
  ServiceWithHosted,
  HostedService,
  getHealthStatusColor,
  getFrameworkIcon
} from '../../models/service-mesh.model.js';

interface GroupedService {
  framework: Framework;
  services: ServiceInstance[];
  deployments: Deployment[];
  healthySummary: { healthy: number; unhealthy: number; unknown: number };
}

@Component({
  selector: 'app-service-tree',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './service-tree.component.html',
  styleUrls: ['./service-tree.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceTreeComponent {
  private serviceMeshService = inject(ServiceMeshService);
  private hostProfileService = inject(HostProfileService);
  private localConfigService = inject(LocalConfigService);

  services = input<ServiceInstance[]>([]);
  dependencies = input<ServiceDependency[]>([]);
  deployments = input<Deployment[]>([]);
  selectedService = input<ServiceInstance | null>(null);
  showRunningOnly = input<boolean>(false);
  serviceSelected = output<ServiceInstance>();
  restartService = output<ServiceInstance>();
  viewLogs = output<ServiceInstance>();

  // Services with hosted services (gateways/facades)
  servicesWithHosted = computed(() => this.serviceMeshService.servicesWithHosted());

  // Track which gateway services are expanded
  expandedGateways = signal<Set<string>>(new Set());

  // Filter gateways (services with hostedServices)
  gateways = computed(() => {
    const all = this.servicesWithHosted();
    return all.filter(s => s.hostedServices && s.hostedServices.length > 0);
  });

  groupedServices = computed<GroupedService[]>(() => {
    const services = this.services();
    const deployments = this.getAllDeployments();
    const serviceStatuses = this.serviceMeshService.serviceStatuses();
    const showRunningOnly = this.showRunningOnly();

    let filteredServices = services;
    if (showRunningOnly) {
      filteredServices = services.filter(service => {
        const status = serviceStatuses.get(service.name);
        return status && status.healthStatus === 'HEALTHY';
      });
    }

    const frameworkMap = new Map<string, Framework>();
    const serviceMap = new Map<string, ServiceInstance[]>();
    const deploymentMap = new Map<string, Deployment[]>();

    filteredServices.forEach(service => {
      if (!serviceMap.has(service.framework.id)) {
        serviceMap.set(service.framework.id, []);
        frameworkMap.set(service.framework.id, service.framework);
      }
      serviceMap.get(service.framework.id)?.push(service);
    });

    deployments.forEach(deployment => {
      const serviceId = deployment.service.id;
      if (!deploymentMap.has(serviceId)) {
        deploymentMap.set(serviceId, []);
      }
      deploymentMap.get(serviceId)?.push(deployment);
    });

    const result: GroupedService[] = [];
    for (const [frameworkId, framework] of frameworkMap) {
      const frameworkServices = serviceMap.get(frameworkId) || [];
      const frameworkDeployments = frameworkServices.flatMap(service =>
        deploymentMap.get(service.id) || []
      );

      let healthy = 0;
      let unhealthy = 0;
      let unknown = 0;

      if (frameworkDeployments.length > 0) {
        healthy = frameworkDeployments.filter(d => d.healthStatus === 'HEALTHY').length;
        unhealthy = frameworkDeployments.filter(d => d.healthStatus === 'UNHEALTHY').length;
        unknown = frameworkDeployments.filter(d =>
          d.healthStatus === 'UNKNOWN' || d.healthStatus === 'DEGRADED'
        ).length;
      } else if (serviceStatuses.size > 0) {
        frameworkServices.forEach(service => {
          const status = serviceStatuses.get(service.name);
          if (status) {
            if (status.healthStatus === 'HEALTHY') healthy++;
            else if (status.healthStatus === 'UNHEALTHY') unhealthy++;
            else unknown++;
          } else {
            unknown++;
          }
        });
      } else {
        unknown = frameworkServices.length;
      }

      result.push({
        framework,
        services: frameworkServices,
        deployments: frameworkDeployments,
        healthySummary: { healthy, unhealthy, unknown }
      });
    }

    return result.sort((a, b) => a.framework.name.localeCompare(b.framework.name));
  });

  expandedFrameworks = signal<Set<number>>(new Set());

  toggleFramework(frameworkId: number): void {
    this.expandedFrameworks.update(set => {
      const newSet = new Set(set);
      if (newSet.has(frameworkId)) {
        newSet.delete(frameworkId);
      } else {
        newSet.add(frameworkId);
      }
      return newSet;
    });
  }

  isFrameworkExpanded(frameworkId: number): boolean {
    return this.expandedFrameworks().has(frameworkId);
  }

  toggleGateway(gatewayName: string): void {
    this.expandedGateways.update(set => {
      const newSet = new Set(set);
      if (newSet.has(gatewayName)) {
        newSet.delete(gatewayName);
      } else {
        newSet.add(gatewayName);
      }
      return newSet;
    });
  }

  isGatewayExpanded(gatewayName: string): boolean {
    return this.expandedGateways().has(gatewayName);
  }

  selectService(service: ServiceInstance): void {
    this.serviceSelected.emit(service);
  }

  canRestart(service: ServiceInstance): boolean {
    return this.getDeploymentsForService(service.id).some(d =>
      d.status === 'RUNNING' || d.status === 'STOPPED'
    );
  }

  async restart(service: ServiceInstance): Promise<void> {
    const profiles = this.hostProfileService.profiles();
    if (profiles.length > 0) {
      const profile = profiles[0];
      const result = await this.serviceMeshService.executeServiceOperation(service.id, 'restart', profile);
      console.log('Restart operation result:', result);

      if (!result.success) {
        console.error('Failed to restart service:', result.message);
      }
    }
  }

  async viewServiceLogs(service: ServiceInstance): Promise<void> {
    const profiles = this.hostProfileService.profiles();
    if (profiles.length > 0) {
      const profile = profiles[0];
      const result = await this.serviceMeshService.executeServiceOperation(service.id, 'view-logs', profile);
      console.log('View logs operation result:', result);

      if (result.success && result.data && typeof result.data === 'object' && 'logsUrl' in result.data) {
        const logsUrl = (result.data as { logsUrl: string }).logsUrl;
        window.open(logsUrl, '_blank');
      }
    }
  }

  private getAllDeployments(): Deployment[] {
    return this.deployments();
  }

  getDeploymentsForService(serviceId: string): Deployment[] {
    return this.deployments().filter(d => d.service.id === serviceId);
  }

  getFrameworkIcon(category: string): string {
    return getFrameworkIcon(category as Parameters<typeof getFrameworkIcon>[0]);
  }

  getFrameworkImageUrl(frameworkName: string): string {
    const baseUrl = this.localConfigService.defaultImageUrl();
    if (!baseUrl) return '';

    // Substitution rules:
    // 1. " & " -> "-"
    // 2. Spaces -> "-"
    // 3. Lowercase
    const normalized = frameworkName.replace(/ & /g, '-').replace(/ /g, '-').toLowerCase();

    return `${baseUrl}/${encodeURIComponent(normalized)}`;
  }

  getHealthStatusColor(status: HealthStatus): string {
    return getHealthStatusColor(status);
  }

  getHostedServiceStatusColor(status: string | undefined): string {
    if (!status) return 'var(--color-muted, #6b7280)';
    switch (status.toUpperCase()) {
      case 'HEALTHY': return 'var(--color-success, #22c55e)';
      case 'UNHEALTHY': return 'var(--color-error, #ef4444)';
      case 'DEGRADED': return 'var(--color-warning, #f59e0b)';
      default: return 'var(--color-muted, #6b7280)';
    }
  }

  getDeploymentHealthStatus(service: ServiceInstance): HealthStatus {
    const deployments = this.getDeploymentsForService(service.id);
    if (deployments.length === 0) {
      return 'UNKNOWN';
    }

    const healthStatuses = deployments.map(d => d.healthStatus);

    if (healthStatuses.some(s => s === 'UNHEALTHY')) {
      return 'UNHEALTHY';
    } else if (healthStatuses.some(s => s === 'DEGRADED')) {
      return 'DEGRADED';
    } else if (healthStatuses.every(s => s === 'HEALTHY')) {
      return 'HEALTHY';
    } else {
      return 'UNKNOWN';
    }
  }

  getDeploymentStatus(service: ServiceInstance): DeploymentStatus {
    const deployments = this.getDeploymentsForService(service.id);
    if (deployments.length === 0) {
      return 'UNKNOWN';
    }

    const statuses = deployments.map(d => d.status);

    if (statuses.some(s => s === 'RUNNING')) {
      return 'RUNNING';
    } else if (statuses.some(s => s === 'STARTING')) {
      return 'STARTING';
    } else if (statuses.some(s => s === 'STOPPING')) {
      return 'STOPPING';
    } else if (statuses.some(s => s === 'FAILED')) {
      return 'FAILED';
    } else if (statuses.every(s => s === 'STOPPED')) {
      return 'STOPPED';
    } else {
      return 'UNKNOWN';
    }
  }
}