import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, interval, BehaviorSubject, of, firstValueFrom } from 'rxjs';
import { switchMap, map, catchError, tap, shareReplay, takeUntil } from 'rxjs/operators';
import { HostProfileService } from './host-profile.service.js';
import { HostProfile } from '../models/host-profile.model.js';
import {
  Framework,
  ServiceInstance,
  Server,
  Deployment,
  ServiceConfiguration,
  ServiceDependency,
  ServiceMeshSummary,
  FrameworkGroup,
  ServiceUpdate,
  OperationRequest,
  OperationResult,
  HealthStatus,
  DeploymentStatus,
  ServerEnvironment,
  ServiceOperation,
  ServiceWithHosted,
  HostedService
} from '../models/service-mesh.model.js';

export interface ServiceMeshConnection {
  profileId: string;
  profile: HostProfile;
  baseUrl: string;
  connected: boolean;
  lastError?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ServiceMeshService {
  private http = inject(HttpClient);
  private hostProfileService = inject(HostProfileService);

  private destroy$ = new Subject<void>();
  private pollInterval = 10000; // 10 seconds

  // Reactive state
  private _frameworks = signal<Framework[]>([]);
  private _services = signal<ServiceInstance[]>([]);
  private _servers = signal<Server[]>([]);
  private _deployments = signal<Deployment[]>([]);
  private _dependencies = signal<ServiceDependency[]>([]);
  private _connections = signal<Map<string, ServiceMeshConnection>>(new Map());
  private _isPolling = signal(false);
  private _lastUpdated = signal<Date | null>(null);

  // NEW: Track service statuses from /api/status independently
  private _serviceStatuses = signal<Map<string, { healthStatus: HealthStatus; lastHealthCheck?: string }>>(new Map());

  // NEW: Track services with their hosted/embedded services
  private _servicesWithHosted = signal<ServiceWithHosted[]>([]);

  // Selection State
  private _selectedService = signal<ServiceInstance | null>(null);
  private _selectedPlatformNode = signal<{ type: string, baseUrl: string } | null>(null);
  private _selectedServiceConfigurations = signal<ServiceConfiguration[]>([]);

  // Public readonly signals
  readonly frameworks = this._frameworks.asReadonly();
  readonly services = this._services.asReadonly();
  readonly servers = this._servers.asReadonly();
  readonly selectedPlatformNode = this._selectedPlatformNode.asReadonly();
  readonly deployments = this._deployments.asReadonly();
  readonly dependencies = this._dependencies.asReadonly();
  readonly connections = this._connections.asReadonly();
  readonly isPolling = this._isPolling.asReadonly();
  readonly lastUpdated = this._lastUpdated.asReadonly();

  readonly selectedService = this._selectedService.asReadonly();
  readonly selectedServiceConfigurations = this._selectedServiceConfigurations.asReadonly();
  readonly serviceStatuses = this._serviceStatuses.asReadonly();
  readonly servicesWithHosted = this._servicesWithHosted.asReadonly();

  constructor() {
    // Connect only to the active host profile on startup/change
    effect(() => {
      const activeProfile = this.hostProfileService.activeProfile();

      if (activeProfile) {
        // Clear all existing connections
        this._connections.set(new Map());

        // Connect only to the active profile
        this.connectToProfile(activeProfile);
        console.log('[ServiceMeshService] Connected to active profile:', activeProfile.name);
      }
    }, { allowSignalWrites: true });

    this.startPolling();
  }

  // Computed summary
  readonly summary = computed<ServiceMeshSummary>(() => {
    const services = this._services();
    const deployments = this._deployments();
    const servers = this._servers();
    const frameworks = this._frameworks();
    const serviceStatuses = this._serviceStatuses();

    console.log('[ServiceMeshService] Computing summary. Deployments:', deployments.length);
    console.log('[ServiceMeshService] Computing summary. Service Statuses:', serviceStatuses.size);

    const activeServices = services.filter(s => s.status === 'ACTIVE').length;
    let healthyDeployments = 0;
    let unhealthyDeployments = 0;

    // If we have deployments, use them
    if (deployments.length > 0) {
      console.log('[ServiceMeshService] Deployment health statuses:',
        deployments.map(d => ({ name: d.service?.name, health: d.healthStatus })));

      healthyDeployments = deployments.filter(d => d.healthStatus === 'HEALTHY').length;
      unhealthyDeployments = deployments.filter(d => d.healthStatus === 'UNHEALTHY').length;
    }
    // Otherwise, use service statuses from /api/status
    else if (serviceStatuses.size > 0) {
      console.log('[ServiceMeshService] Using service statuses instead of deployments');
      const statusArray = Array.from(serviceStatuses.values());
      console.log('[ServiceMeshService] Status array:', statusArray);
      console.log('[ServiceMeshService] First status object:', statusArray[0]);
      console.log('[ServiceMeshService] First status keys:', Object.keys(statusArray[0] || {}));

      console.log('[ServiceMeshService] Testing filter on first item:');
      if (statusArray[0]) {
        console.log('  - healthStatus value:', statusArray[0].healthStatus);
        console.log('  - Comparison result:', statusArray[0].healthStatus === 'HEALTHY');
        console.log('  - Type:', typeof statusArray[0].healthStatus);
      }

      healthyDeployments = statusArray.filter(s => {
        const result = s.healthStatus === 'HEALTHY';
        if (!result) {
          console.log('[ServiceMeshService] NOT HEALTHY:', s);
        }
        return result;
      }).length;

      unhealthyDeployments = statusArray.filter(s => s.healthStatus === 'UNHEALTHY').length;

      console.log('[ServiceMeshService] healthyDeployments count:', healthyDeployments);
      console.log('[ServiceMeshService] unhealthyDeployments count:', unhealthyDeployments);
    }

    const activeServers = servers.filter(s => s.status === 'ACTIVE').length;

    console.log('[ServiceMeshService] Healthy count:', healthyDeployments, 'Unhealthy count:', unhealthyDeployments);

    const frameworkBreakdown = frameworks.map(f => ({
      framework: f.name,
      count: services.filter(s => s.framework?.id === f.id).length
    })).filter(fb => fb.count > 0);

    const environments: ServerEnvironment[] = ['DEVELOPMENT', 'STAGING', 'PRODUCTION', 'TEST'];
    const environmentBreakdown = environments.map(env => ({
      environment: env,
      count: deployments.filter(d => d.environment === env).length
    })).filter(eb => eb.count > 0);

    console.log('[ServiceMeshService] FINAL SUMMARY VALUES:', {
      totalServices: services.length,
      activeServices,
      healthyDeployments,
      unhealthyDeployments,
      totalServers: servers.length,
      activeServers
    });

    return {
      totalServices: services.length,
      activeServices,
      healthyDeployments,
      unhealthyDeployments,
      totalServers: servers.length,
      activeServers,
      frameworkBreakdown,
      environmentBreakdown
    };
  });

  // Computed grouped services by framework
  readonly frameworkGroups = computed<FrameworkGroup[]>(() => {
    const frameworks = this._frameworks();
    const services = this._services();
    const deployments = this._deployments();

    return frameworks.map(framework => {
      const frameworkServices = services.filter(s => s.framework?.id === framework.id);
      const frameworkDeployments = deployments.filter(d =>
        frameworkServices.some(s => s.id === d.service?.id)
      );

      const healthy = frameworkDeployments.filter(d => d.healthStatus === 'HEALTHY').length;
      const unhealthy = frameworkDeployments.filter(d => d.healthStatus === 'UNHEALTHY').length;
      const unknown = frameworkDeployments.filter(d =>
        d.healthStatus === 'UNKNOWN' || d.healthStatus === 'DEGRADED'
      ).length;

      return {
        framework,
        services: frameworkServices,
        deployments: frameworkDeployments,
        healthySummary: { healthy, unhealthy, unknown }
      };
    }); // Removed filter to show ALL frameworks, not just those with services
  });

  // Service updates subject for real-time notifications
  private serviceUpdates$ = new Subject<ServiceUpdate>();

  // =========================================================================
  // Connection Management
  // =========================================================================

  private getBaseUrl(profile: HostProfile): string {
    let baseUrl = profile.hostServerUrl;
    if (!baseUrl.startsWith('http')) {
      baseUrl = `http://${baseUrl}`;
    }
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    return baseUrl;
  }

  async connectToProfile(profile: HostProfile): Promise<boolean> {
    const baseUrl = this.getBaseUrl(profile);

    try {
      await firstValueFrom(this.http.get(`${baseUrl}/api/frameworks`));

      const connection: ServiceMeshConnection = {
        profileId: profile.id,
        profile,
        baseUrl,
        connected: true
      };

      this._connections.update(map => {
        const newMap = new Map(map);
        newMap.set(profile.id, connection);
        return newMap;
      });

      // Trigger initial data fetch for this profile
      void this.fetchAllData();

      return true;
    } catch (error) {
      const connection: ServiceMeshConnection = {
        profileId: profile.id,
        profile,
        baseUrl,
        connected: false,
        lastError: (error as Error).message
      };

      this._connections.update(map => {
        const newMap = new Map(map);
        newMap.set(profile.id, connection);
        return newMap;
      });

      return false;
    }
  }

  disconnectFromProfile(profileId: string): void {
    this._connections.update(map => {
      const newMap = new Map(map);
      newMap.delete(profileId);
      return newMap;
    });
  }

  // =========================================================================
  // Selection Management
  // =========================================================================

  async selectService(service: ServiceInstance | null): Promise<void> {
    if (service) {
      this._selectedPlatformNode.set(null);
    }

    this._selectedService.set(service);

    if (service) {
      // Find a connected profile to fetch detailed configurations
      // Ideally we would know which profile the service belongs to, but for now we look for any connected profile
      // or iterate through them.
      // Since ServiceInstance does not explicitly store 'originProfileId' in its basic interface currently,
      // we might just try the first connected profile or all.

      const connections = Array.from(this._connections().values()).filter(c => c.connected);
      if (connections.length > 0) {
        // Try to fetch configurations from the first available connection
        // Refinement: We should probably store which profile a service came from.
        const connection = connections[0];
        const configs = await this.getServiceConfigurations(service.id, connection.baseUrl);
        this._selectedServiceConfigurations.set(configs);
      } else {
        this._selectedServiceConfigurations.set([]);
      }
    } else {
      this._selectedServiceConfigurations.set([]);
    }
  }

  async selectPlatformNode(type: string, baseUrl: string): Promise<void> {
    this._selectedService.set(null);
    this._selectedPlatformNode.set({ type, baseUrl });
  }

  // =========================================================================
  // Data Fetching
  // =========================================================================

  async fetchAllData(): Promise<void> {
    const connections = Array.from(this._connections().values())
      .filter(c => c.connected);

    if (connections.length === 0) {
      return;
    }

    const allFrameworks: Framework[] = [];
    const allServices: ServiceInstance[] = [];
    const allServers: Server[] = [];
    const allDeployments: Deployment[] = [];
    const allDependencies: ServiceDependency[] = [];
    const allServiceStatuses = new Map<string, { healthStatus: HealthStatus; lastHealthCheck?: string }>();
    const allServicesWithHosted: ServiceWithHosted[] = [];

    for (const connection of connections) {
      try {
        const [frameworks, services, servers, deployments, dependencies, serviceStatuses, servicesWithHosted] = await Promise.all([
          this.fetchFrameworks(connection.baseUrl),
          this.fetchServices(connection.baseUrl),
          this.fetchServers(connection.baseUrl),
          this.fetchDeployments(connection.baseUrl),
          this.fetchDependencies(connection.baseUrl),
          this.fetchServiceStatuses(connection.baseUrl),
          this.fetchServicesWithHosted(connection.baseUrl)
        ]);

        allFrameworks.push(...frameworks);
        allServices.push(...services);
        allServers.push(...servers);
        allDeployments.push(...deployments);
        allDependencies.push(...dependencies);
        allServicesWithHosted.push(...servicesWithHosted);

        // Merge service statuses into the map
        serviceStatuses.forEach((value, key) => {
          allServiceStatuses.set(key, value);
        });
      } catch (error) {
        console.error(`Failed to fetch data from ${connection.profile.name}:`, error);
      }
    }

    // Deduplicate by ID to prevent showing duplicates when multiple profiles return same data
    const dedupById = <T extends { id: string }>(arr: T[]): T[] => {
      const seen = new Set<string>();
      return arr.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };

    // Deduplicate services with hosted by name
    const dedupByName = (arr: ServiceWithHosted[]): ServiceWithHosted[] => {
      const seen = new Set<string>();
      return arr.filter(item => {
        if (seen.has(item.name)) return false;
        seen.add(item.name);
        return true;
      });
    };

    // Deduplicate dependencies by composite key (sourceServiceId + targetServiceId)
    const dedupDependencies = (deps: ServiceDependency[]): ServiceDependency[] => {
      const seen = new Set<string>();
      return deps.filter(dep => {
        const key = `${dep.sourceServiceId}->${dep.targetServiceId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    this._frameworks.set(dedupById(allFrameworks));
    this._services.set(dedupById(allServices));
    this._servers.set(dedupById(allServers));
    this._deployments.set(dedupById(allDeployments));
    this._dependencies.set(dedupDependencies(allDependencies));
    this._serviceStatuses.set(allServiceStatuses);
    this._servicesWithHosted.set(dedupByName(allServicesWithHosted));
    this._lastUpdated.set(new Date());
  }

  private async fetchFrameworks(baseUrl: string): Promise<Framework[]> {
    try {
      return await firstValueFrom(
        this.http.get<Framework[]>(`${baseUrl}/api/frameworks`)
      );
    } catch {
      return [];
    }
  }

  private async fetchServices(baseUrl: string): Promise<ServiceInstance[]> {
    try {
      const services = await firstValueFrom(
        this.http.get<ServiceInstance[]>(`${baseUrl}/api/services`)
      );
      console.log('[ServiceMeshService] Fetched services from /api/services:', services.length);
      console.log('[ServiceMeshService] Service names from /api/services:', services.map(s => s.name));
      return services;
    } catch (error) {
      console.error('[ServiceMeshService] Error fetching services:', error);
      return [];
    }
  }

  /**
   * Fetch services with their hosted/embedded services from the registry API.
   * This endpoint returns services as gateways/facades with their internal services.
   */
  private async fetchServicesWithHosted(baseUrl: string): Promise<ServiceWithHosted[]> {
    try {
      const services = await firstValueFrom(
        this.http.get<ServiceWithHosted[]>(`${baseUrl}/api/registry/services/with-hosted`)
      );
      console.log('[ServiceMeshService] Fetched services with hosted:', services.length);
      services.forEach(s => {
        if (s.hostedServices && s.hostedServices.length > 0) {
          console.log(`[ServiceMeshService] Gateway ${s.name} hosts ${s.hostedServices.length} services:`,
            s.hostedServices.map(h => h.serviceName));
        }
      });
      return services;
    } catch (error) {
      console.error('[ServiceMeshService] Error fetching services with hosted:', error);
      return [];
    }
  }

  private async fetchServers(baseUrl: string): Promise<Server[]> {
    try {
      return await firstValueFrom(
        this.http.get<Server[]>(`${baseUrl}/api/servers`)
      );
    } catch {
      return [];
    }
  }

  private async fetchDeployments(baseUrl: string): Promise<Deployment[]> {
    try {
      const deployments = await firstValueFrom(
        this.http.get<Deployment[]>(`${baseUrl}/api/deployments`)
      );

      console.log('[ServiceMeshService] Fetched deployments:', deployments.length);
      console.log('[ServiceMeshService] Sample deployment:', deployments[0]);

      // Fetch live status and merge with deployments
      const liveStatuses = await this.fetchServiceStatuses(baseUrl);
      console.log('[ServiceMeshService] Fetched live statuses:', liveStatuses.size);

      // Merge live health status into deployments
      const mergedDeployments = deployments.map(deployment => {
        const serviceName = deployment.service?.name;
        if (serviceName && liveStatuses.has(serviceName)) {
          const liveStatus = liveStatuses.get(serviceName)!;
          console.log(`[ServiceMeshService] Merging live status for ${serviceName}:`, liveStatus.healthStatus);
          return {
            ...deployment,
            healthStatus: liveStatus.healthStatus,
            lastHealthCheck: liveStatus.lastHealthCheck
          };
        }
        console.log(`[ServiceMeshService] No live status for ${serviceName}, using original:`, deployment.healthStatus);
        return deployment;
      });

      console.log('[ServiceMeshService] Final deployments with health:',
        mergedDeployments.map(d => ({ name: d.service?.name, healthStatus: d.healthStatus })));

      return mergedDeployments;
    } catch (error) {
      console.error('[ServiceMeshService] Error fetching deployments:', error);
      return [];
    }
  }

  /**
   * Fetch real-time service statuses from the /api/status endpoint.
   * Returns a map of service name to status info.
   */
  private async fetchServiceStatuses(baseUrl: string): Promise<Map<string, { healthStatus: HealthStatus; lastHealthCheck?: string }>> {
    try {
      interface ServiceStatusResponse {
        serviceId: number;
        serviceName: string;
        healthState: 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'UNKNOWN' | 'OFFLINE' | 'STARTING' | 'STOPPING';
        lastHealthCheck?: string;
        lastHeartbeat?: string;
      }

      const statuses = await firstValueFrom(
        this.http.get<ServiceStatusResponse[]>(`${baseUrl}/api/status`)
      );

      console.log('[ServiceMeshService] Raw /api/status response:', statuses);
      console.log('[ServiceMeshService] Service names from /api/status:', statuses.map(s => s.serviceName));

      const statusMap = new Map<string, { healthStatus: HealthStatus; lastHealthCheck?: string }>();

      for (const status of statuses) {
        // Map backend HealthState to frontend HealthStatus
        let healthStatus: HealthStatus;
        switch (status.healthState) {
          case 'HEALTHY':
            healthStatus = 'HEALTHY';
            break;
          case 'UNHEALTHY':
          case 'OFFLINE':
          case 'STOPPING':
            healthStatus = 'UNHEALTHY';
            break;
          case 'DEGRADED':
            healthStatus = 'DEGRADED';
            break;
          default:
            healthStatus = 'UNKNOWN';
        }

        console.log(`[ServiceMeshService] Adding status for service: "${status.serviceName}" -> ${healthStatus}`);

        statusMap.set(status.serviceName, {
          healthStatus,
          lastHealthCheck: status.lastHealthCheck || status.lastHeartbeat
        });
      }

      console.log('[ServiceMeshService] Final status map keys:', Array.from(statusMap.keys()));
      return statusMap;
    } catch (error) {
      console.error('[ServiceMeshService] Error fetching service statuses:', error);
      // If status endpoint fails, return empty map (deployments keep their original status)
      return new Map();
    }
  }

  private async fetchDependencies(baseUrl: string): Promise<ServiceDependency[]> {
    try {
      return await firstValueFrom(
        this.http.get<ServiceDependency[]>(`${baseUrl}/api/dependencies`)
      );
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Polling
  // =========================================================================

  startPolling(): void {
    if (this._isPolling()) {
      return;
    }

    this._isPolling.set(true);

    interval(this.pollInterval)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchAllData())
      )
      .subscribe();

    this.fetchAllData();
  }

  stopPolling(): void {
    this._isPolling.set(false);
    this.destroy$.next();
  }

  // =========================================================================
  // Service Details
  // =========================================================================

  async getServiceById(serviceId: string, baseUrl: string): Promise<ServiceInstance | null> {
    try {
      return await firstValueFrom(
        this.http.get<ServiceInstance>(`${baseUrl}/api/services/${serviceId}`)
      );
    } catch {
      return null;
    }
  }

  async getServiceDependencies(serviceId: string, baseUrl: string): Promise<ServiceInstance[]> {
    try {
      return await firstValueFrom(
        this.http.get<ServiceInstance[]>(`${baseUrl}/api/services/${serviceId}/dependencies`)
      );
    } catch {
      return [];
    }
  }

  async getServiceDependents(serviceId: string, baseUrl: string): Promise<ServiceInstance[]> {
    try {
      return await firstValueFrom(
        this.http.get<ServiceInstance[]>(`${baseUrl}/api/services/${serviceId}/dependents`)
      );
    } catch {
      return [];
    }
  }

  async getServiceConfigurations(serviceId: string, baseUrl: string): Promise<ServiceConfiguration[]> {
    try {
      return await firstValueFrom(
        this.http.get<ServiceConfiguration[]>(`${baseUrl}/api/configurations/service/${serviceId}`)
      );
    } catch {
      return [];
    }
  }

  async getDeploymentsForService(serviceId: string, baseUrl: string): Promise<Deployment[]> {
    try {
      return await firstValueFrom(
        this.http.get<Deployment[]>(`${baseUrl}/api/deployments/service/${serviceId}`)
      );
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Service Operations
  // =========================================================================

  async executeOperation(request: OperationRequest, baseUrl: string): Promise<OperationResult> {
    const { deploymentId, operation, params } = request;

    try {
      let response: unknown;

      switch (operation) {
        case 'start':
          response = await firstValueFrom(
            this.http.post(`${baseUrl}/api/deployments/${deploymentId}/start`, params ?? {})
          );
          break;
        case 'stop':
          response = await firstValueFrom(
            this.http.post(`${baseUrl}/api/deployments/${deploymentId}/stop`, params ?? {})
          );
          break;
        case 'restart':
          await firstValueFrom(
            this.http.post(`${baseUrl}/api/deployments/${deploymentId}/stop`, {})
          );
          response = await firstValueFrom(
            this.http.post(`${baseUrl}/api/deployments/${deploymentId}/start`, {})
          );
          break;
        case 'health-check':
          response = await firstValueFrom(
            this.http.get(`${baseUrl}/api/deployments/${deploymentId}`)
          );
          break;
        case 'view-logs':
          // For view-logs, we'll return a placeholder URL or info
          // In a real implementation, this would fetch actual logs
          response = { logsUrl: `${baseUrl}/api/deployments/${deploymentId}/logs` };
          break;
        case 'view-config':
          // For view-config, fetch configuration
          response = await firstValueFrom(
            this.http.get(`${baseUrl}/api/configurations/deployment/${deploymentId}`)
          );
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      await this.fetchAllData();

      // Find the profileId for this baseUrl to include in the update notification
      const connection = Array.from(this._connections().values()).find(c => c.baseUrl === baseUrl);

      this.notifyUpdate({
        type: 'STATUS_CHANGE',
        hostProfileId: connection?.profileId || 'unknown',
        serviceId: '-1', // We'll need a better way to get serviceId if needed
        deploymentId,
        newValue: operation,
      });

      return {
        success: true,
        operation,
        deploymentId,
        message: `Operation ${operation} completed successfully`,
        data: response,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        operation,
        deploymentId,
        message: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  private notifyUpdate(update: Omit<ServiceUpdate, 'timestamp'>): void {
    this.serviceUpdates$.next({
      ...update,
      timestamp: new Date()
    });
  }

  async executeServiceOperation(serviceId: string, operation: ServiceOperation, profile: HostProfile): Promise<OperationResult> {
    let baseUrl = profile.hostServerUrl;
    if (!baseUrl.startsWith('http')) {
      baseUrl = `http://${baseUrl}`;
    }
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    // Get all deployments for this service
    const deployments = await this.getDeploymentsForService(serviceId, baseUrl);

    if (deployments.length === 0) {
      return {
        success: false,
        operation,
        deploymentId: '-1',
        message: 'No deployments found for this service',
        timestamp: new Date()
      };
    }

    // Execute the operation on all deployments of the service
    const results: OperationResult[] = [];
    for (const deployment of deployments) {
      const result = await this.executeOperation({
        deploymentId: deployment.id,
        operation,
        params: { serviceId }
      }, baseUrl);
      results.push(result);
    }

    // Check if all operations were successful
    const allSuccessful = results.every(r => r.success);

    return {
      success: allSuccessful,
      operation,
      deploymentId: '-1', // Not applicable for service-wide operations
      message: allSuccessful
        ? `Operation ${operation} completed on all deployments of service ${serviceId}`
        : `Operation ${operation} failed on one or more deployments`,
      data: results,
      timestamp: new Date()
    };
  }

  async updateDeploymentHealth(
    deploymentId: string,
    healthStatus: HealthStatus,
    baseUrl: string
  ): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/api/deployments/${deploymentId}/health`,
          null,
          { params: { healthStatus } }
        )
      );
      await this.fetchAllData();
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Real-time Updates Stream
  // =========================================================================

  watchServiceUpdates(): Observable<ServiceUpdate> {
    return this.serviceUpdates$.asObservable();
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.complete();
    this.serviceUpdates$.complete();
  }
}
