import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom, Subject } from 'rxjs';
import { TreeProvider } from './tree-provider.interface.js';
import { TreeNode, NodeType, TreeChange, NodeStatus } from '../models/tree-node.model.js';
import { TreeManagerService } from './tree-manager.service.js';
import { RegistryServerProfileService } from './registry-server-profile.service.js';
import { RegistryServerProfile } from '../models/registry-server-profile.model.js';
import { ServiceInstance, Deployment, Framework } from '../models/service-mesh.model.js';
import { ServiceMeshService } from './service-mesh.service.js';
import { LocalConfigService } from './local-config.service.js';
import { TYPE_LABELS, TYPE_ORDER, CATEGORY_ICONS } from './platform-management.service.js';

@Injectable({
    providedIn: 'root'
})
export class RegistryServerProvider implements TreeProvider {
    readonly providerType = 'registry-server';
    private treeManager = inject(TreeManagerService);
    private http = inject(HttpClient);
    private profileService = inject(RegistryServerProfileService);
    private serviceMeshService = inject(ServiceMeshService);
    private localConfigService = inject(LocalConfigService);
    private updateSubject = new Subject<TreeChange[]>();

    constructor() {
        this.treeManager.registerProvider(this);

        // Listen for service updates from the mesh service and notify the tree
        this.serviceMeshService.watchServiceUpdates().subscribe(update => {
            this.updateSubject.next([{
                type: 'modified',
                nodeId: `service-${update.hostProfileId}-${update.serviceId}`
            }]);
        });
    }

    canHandle(nodeId: string): boolean {
        return nodeId === 'root' ||
            nodeId === 'service-registries' ||
            nodeId.startsWith('registry-') ||
            nodeId.startsWith('service-') ||
            nodeId.startsWith('users') ||
            nodeId.startsWith('search') ||
            nodeId.startsWith('filesystems') ||
            nodeId.startsWith('platform') ||
            nodeId.startsWith('platform-dictionary-') ||
            // System Health is now a top-level sibling (no longer nested under Platform Management).
            nodeId === 'system-health-terrain';
    }

    async getChildren(nodeId: string): Promise<TreeNode[]> {
        if (nodeId === 'root') {
            const terrainUrl = this.localConfigService.terrainServerUrl();
            return [
                {
                    id: 'filesystems',
                    name: 'File Systems',
                    type: NodeType.FOLDER,
                    icon: 'storage',
                    hasChildren: true,
                    operations: [],
                    metadata: {},
                    lastUpdated: new Date()
                },
                // System Health lives at root (promoted up from Platform Management) because
                // it connects directly to the terrain server, never to a profile.
                {
                    id: 'system-health-terrain',
                    name: 'System Health',
                    type: NodeType.HEALTH_CHECK,
                    icon: 'monitor_heart',
                    hasChildren: false,
                    operations: ['check-health'],
                    metadata: {
                        url: `${terrainUrl}/api/v1/platform/health`,
                        managementType: 'system-health',
                        baseUrl: terrainUrl
                    },
                    lastUpdated: new Date()
                },
                {
                    id: 'platform',
                    name: 'Platform Management',
                    type: NodeType.FOLDER,
                    icon: 'settings',
                    hasChildren: true,
                    operations: [],
                    metadata: {},
                    lastUpdated: new Date()
                }
            ];
        }



        // If we have a service node, return its sub-modules AND deployments
        if (nodeId.startsWith('service-')) {
            // Extract profileId and serviceId from the nodeId
            // nodeId format: service-{profileId}-{serviceId}
            const parts = nodeId.split('-');
            if (parts.length >= 3) {
                const profileId = parts[1];
                const serviceId = parts.slice(2).join('-'); // Handle cases where serviceId might contain '-'

                const profile = this.profileService.profiles().find(p => p.id === profileId);
                if (profile) {
                    // Fetch both sub-modules AND deployments
                    const [subModules, deployments] = await Promise.all([
                        this.fetchSubModulesForService(profile, serviceId),
                        this.fetchDeploymentsForService(profile, serviceId)
                    ]);
                    return [...subModules, ...deployments];
                }
            }
            return [];
        }

        if (nodeId === 'service-registries') {
            const profiles = this.profileService.profiles();
            return profiles.map(profile => ({
                id: `registry-${profile.id}`,
                name: profile.name,
                type: NodeType.FOLDER, // Represents the profile root
                icon: 'dns',
                hasChildren: true,
                operations: ['edit-registry', 'delete-registry'],
                metadata: { profile },
                lastUpdated: new Date()
            }));
        }

        if (nodeId.startsWith('registry-')) {
            const profileId = nodeId.replace('registry-', '');
            const profile = this.profileService.profiles().find(p => p.id === profileId);
            if (profile) return this.fetchPlatformInfo(profile);
            return [];
        }

        if (nodeId === 'users') {
            const profiles = this.profileService.profiles();
            return profiles.map(profile => ({
                id: `host-users-${profile.id}`,
                name: profile.name,
                type: NodeType.FOLDER,
                icon: 'group',
                hasChildren: true,
                operations: [],
                metadata: { profile },
                lastUpdated: new Date()
            }));
        }

        if (nodeId.startsWith('host-users-')) {
            const profileId = nodeId.replace('host-users-', '');
            const profile = this.profileService.profiles().find(p => p.id === profileId);
            if (profile) return this.fetchUsers(profile);
            return [];
        }

        if (nodeId === 'platform') {
            const profiles = this.profileService.profiles();

            // System Health used to live here; it has been promoted to root (see getChildren('root')).
            // We keep the platform node set strictly to profile-dependent management nodes below.
            const nodes: TreeNode[] = [];

            // If profiles exist, also show profile-dependent management nodes
            if (profiles.length > 0) {
                // Use the first profile as the default context
                const profile = profiles[0];
                const baseUrl = this.getBaseUrl(profile);

                nodes.unshift(
                    {
                        id: 'users',
                        name: 'Users',
                        type: NodeType.FOLDER,
                        icon: 'group',
                        hasChildren: true,
                        operations: [],
                        metadata: {},
                        lastUpdated: new Date()
                    },
                    {
                        id: `platform-deployments-${profile.id}`,
                        name: 'Deployments',
                        type: NodeType.FOLDER,
                        icon: 'cloud_upload',
                        hasChildren: false,
                        operations: ['manage-deployments'],
                        metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/deployments`, managementType: 'deployments' },
                        lastUpdated: new Date()
                    },
                    {
                        id: `platform-servers-${profile.id}`,
                        name: 'Servers',
                        type: NodeType.FOLDER,
                        icon: 'storage',
                        hasChildren: false,
                        operations: ['manage-servers'],
                        metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/servers`, managementType: 'servers' },
                        lastUpdated: new Date()
                    },
                    {
                        id: `platform-services-${profile.id}`,
                        name: 'Services',
                        type: NodeType.FOLDER,
                        icon: 'dns',
                        hasChildren: false,
                        operations: ['manage-services'],
                        metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/services`, managementType: 'services' },
                        lastUpdated: new Date()
                    },
                    {
                        id: `platform-systems-${profile.id}`,
                        name: 'Systems',
                        type: NodeType.FOLDER,
                        icon: 'dns',
                        hasChildren: false,
                        operations: ['manage-systems'],
                        metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/registry/systems`, managementType: 'systems' },
                        lastUpdated: new Date()
                    },
                    {
                        id: `platform-dictionary-${profile.id}`,
                        name: 'Data Dictionary',
                        type: NodeType.FOLDER,
                        icon: 'library_books',
                        hasChildren: true,
                        operations: [],
                        metadata: { hostProfileId: profile.id },
                        lastUpdated: new Date()
                    },
                    {
                        id: `platform-topology-${profile.id}`,
                        name: 'Topology',
                        type: NodeType.FOLDER,
                        icon: 'account_tree',
                        hasChildren: false,
                        operations: ['view-topology'],
                        metadata: { hostProfileId: profile.id, url: `${this.localConfigService.terrainServerUrl()}/api/v1/platform/health`, managementType: 'topology', baseUrl: this.localConfigService.terrainServerUrl() },
                        lastUpdated: new Date()
                    }
                );
            }

            // Nested virtual folders under Platform Management.
            // Order: System Health leads, profile-dependent nodes unshifted to front,
            // then Gateways + Service Registries appended at the end. Together with the
            // downstream homeProvider path handlers in app.component.ts, the user
            // navigates: Platform Management → Gateways → <broker profile> OR
            //                          Platform Management → Service Registries → <host profile>.
            nodes.push(
                {
                    id: `platform-gateways`,
                    name: 'Gateways',
                    type: NodeType.FOLDER,
                    icon: 'cloud',
                    hasChildren: true,
                    operations: [],
                    metadata: { virtualContainer: 'gateways' },
                    lastUpdated: new Date()
                },
                {
                    id: `platform-service-registries`,
                    name: 'Service Registries',
                    type: NodeType.FOLDER,
                    icon: 'storage',
                    hasChildren: true,
                    operations: [],
                    metadata: { virtualContainer: 'service-registries' },
                    lastUpdated: new Date()
                }
            );

            return nodes;
        }

        if (nodeId.startsWith('host-platform-')) {
            const profileId = nodeId.replace('host-platform-', '');
            const profile = this.profileService.profiles().find(p => p.id === profileId);
            if (profile) return this.fetchPlatformInfo(profile);
            return [];
        }

        if (nodeId.startsWith('platform-dictionary-')) {
            const profileId = nodeId.replace('platform-dictionary-', '');
            const profile = this.profileService.profiles().find(p => p.id === profileId);
            if (profile) return this.getDataDictionaryNodes(profile);
            return [];
        }

        // Categories type children — dynamically generated from the categories API
        if (nodeId.startsWith('platform-dict-categories-')) {
            // Format: platform-dict-categories-{profileId}  (parent)
            //         platform-dict-categories-{type}-{profileId}  (child — no further children)
            // If it already has a type segment, it's a leaf node.
            const parts = nodeId.split('-');
            // platform-dict-categories has 4 parts: platform, dict, categories, profileId
            // With type: platform, dict, categories, {type}, profileId -> 5 parts
            if (parts.length > 4) {
                return []; // Leaf node — type-specific child has no further children
            }

            // Parent Categories node — fetch categories and extract unique types
            const profileId = nodeId.replace('platform-dict-categories-', '');
            const profile = this.profileService.profiles().find(p => p.id === profileId);
            if (!profile) return [];

            const baseUrl = this.getBaseUrl(profile);
            try {
                const url = `${baseUrl}/api/v1/categories?size=1000`;
                const response = await firstValueFrom(this.http.get<any>(url));
                const items: any[] = Array.isArray(response) ? response : (response.data || []);

                // Collect unique types, preserving first-seen order
                const seen = new Set<string>();
                const uniqueTypes: { discriminator: string; label: string }[] = [];
                for (const item of items) {
                    const type = item.type;
                    if (type && !seen.has(type)) {
                        seen.add(type);
                        uniqueTypes.push({
                            discriminator: type,
                            label: TYPE_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                        });
                    }
                }

                // Sort by predefined order, then alphabetically
                uniqueTypes.sort((a, b) => {
                    const ai = TYPE_ORDER.indexOf(a.discriminator);
                    const bi = TYPE_ORDER.indexOf(b.discriminator);
                    if (ai !== -1 && bi !== -1) return ai - bi;
                    if (ai !== -1) return -1;
                    if (bi !== -1) return 1;
                    return a.label.localeCompare(b.label);
                });

                return uniqueTypes.map(t => ({
                    id: `platform-dict-categories-${t.discriminator}-${profile.id}`,
                    name: t.label,
                    type: NodeType.FOLDER,
                    icon: CATEGORY_ICONS[t.discriminator] || 'label',
                    hasChildren: false,
                    operations: ['manage-categories'],
                    metadata: {
                        hostProfileId: profile.id,
                        url: `${baseUrl}/api/v1/categories`,
                        managementType: 'categories',
                        categoryFilterType: t.discriminator,
                    },
                    lastUpdated: new Date(),
                }));
            } catch (e) {
                console.warn('Failed to fetch categories for tree children', e);
                return [];
            }
        }



        if (nodeId === 'filesystems') {
            // Future implementation: fetch connected file systems
            return [];
        }

        // Placeholder for other nodes
        return [];
    }

    private async fetchUsers(profile: RegistryServerProfile): Promise<TreeNode[]> {
        try {
            // For now, let's assume an endpoint exists or returns empty
            const baseUrl = this.getBaseUrl(profile);
            const usersUrl = `${baseUrl}/api/v1/users`;
            // Attempt to fetch, fallback to placeholder if it fails (as it might not exist yet)
            try {
                const response = await firstValueFrom(this.http.get<any>(usersUrl));
                const users: any[] = Array.isArray(response) ? response : (response.data || []);
                return users.map(user => ({
                    id: `user-${profile.id}-${user.id || user.alias}`,
                    name: user.alias || user.name,
                    type: NodeType.USER,
                    icon: 'person',
                    hasChildren: false,
                    operations: ['view-details', 'manage-quota'],
                    metadata: { ...user, hostProfileId: profile.id },
                    lastUpdated: new Date()
                }));
            } catch (e) {
                console.warn(`Users endpoint not found for ${profile.name}, showing placeholder.`);
                return [{
                    id: `user-placeholder-${profile.id}`,
                    name: 'No users found (API pending)',
                    type: NodeType.USER,
                    icon: 'person_off',
                    hasChildren: false,
                    operations: [],
                    metadata: {},
                    lastUpdated: new Date()
                }];
            }
        } catch (e) {
            return [];
        }
    }



    private async fetchPlatformInfo(profile: RegistryServerProfile): Promise<TreeNode[]> {
        const baseUrl = this.getBaseUrl(profile);

        // Fetch running services for the 'Service Mesh' view
        let serviceNodes: TreeNode[] = [];
        try {
            serviceNodes = await this.fetchServices(profile);
        } catch (e) {
            console.warn('Failed to fetch service mesh for platform view', e);
        }

        return [
            ...serviceNodes, // Running Services
            {
                id: `platform-mesh-${profile.id}`,
                name: 'Service Mesh',
                type: NodeType.FOLDER, // Use FOLDER to allow navigation selection
                icon: 'hub',
                hasChildren: false,
                operations: ['view-mesh'],
                metadata: { hostProfileId: profile.id, viewMode: 'service-mesh' },
                lastUpdated: new Date()
            },
            {
                id: `platform-deployments-${profile.id}`,
                name: 'Deployments',
                type: NodeType.FOLDER,
                icon: 'cloud_upload',
                hasChildren: false,
                operations: ['manage-deployments'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/deployments`, managementType: 'deployments' },
                lastUpdated: new Date()
            },
            {
                id: `platform-servers-${profile.id}`,
                name: 'Hosts',
                type: NodeType.FOLDER,
                icon: 'storage',
                hasChildren: false,
                operations: ['manage-hosts'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/servers`, managementType: 'servers' },
                lastUpdated: new Date()
            },
            {
                id: `platform-services-${profile.id}`,
                name: 'Services',
                type: NodeType.FOLDER,
                icon: 'dns',
                hasChildren: false,
                operations: ['manage-services'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/services`, managementType: 'services' },
                lastUpdated: new Date()
            },
            {
                id: `platform-systems-${profile.id}`,
                name: 'Systems',
                type: NodeType.FOLDER,
                icon: 'dns',
                hasChildren: false,
                operations: ['manage-systems'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/registry/systems`, managementType: 'systems' },
                lastUpdated: new Date()
            },
            {
                id: `platform-health-${profile.id}`,
                name: 'System Health',
                type: NodeType.HEALTH_CHECK,
                icon: 'monitor_heart',
                hasChildren: false,
                operations: ['check-health'],
                metadata: { hostProfileId: profile.id, url: `${this.localConfigService.terrainServerUrl()}/api/v1/platform/health`, managementType: 'system-health', baseUrl: this.localConfigService.terrainServerUrl() },
                lastUpdated: new Date()
            },
            {
                id: `platform-dictionary-${profile.id}`,
                name: 'Data Dictionary',
                type: NodeType.FOLDER,
                icon: 'library_books',
                hasChildren: true,
                operations: [],
                metadata: { hostProfileId: profile.id },
                lastUpdated: new Date()
            },
            {
                id: `platform-topology-${profile.id}`,
                name: 'Topology',
                type: NodeType.FOLDER,
                icon: 'account_tree',
                hasChildren: false,
                operations: ['view-topology'],
                metadata: { hostProfileId: profile.id, url: `${this.localConfigService.terrainServerUrl()}/api/v1/platform/health`, managementType: 'topology', baseUrl: this.localConfigService.terrainServerUrl() },
                lastUpdated: new Date()
            }
        ];
    }

    private getDataDictionaryNodes(profile: RegistryServerProfile): TreeNode[] {
        const baseUrl = this.getBaseUrl(profile);
        return [
            {
                id: `platform-dict-frameworks-${profile.id}`,
                name: 'Frameworks',
                type: NodeType.FOLDER,
                icon: 'category',
                hasChildren: false,
                operations: ['manage-frameworks'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/frameworks`, managementType: 'frameworks' },
                lastUpdated: new Date()
            },
            {
                id: `platform-dict-libraries-${profile.id}`,
                name: 'Libraries',
                type: NodeType.FOLDER,
                icon: 'local_library',
                hasChildren: false,
                operations: ['manage-libraries'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/libraries`, managementType: 'libraries' },
                lastUpdated: new Date()
            },
            {
                id: `platform-dict-languages-${profile.id}`,
                name: 'Languages',
                type: NodeType.FOLDER,
                icon: 'code',
                hasChildren: false,
                operations: ['manage-languages'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/framework-languages`, managementType: 'framework-languages' },
                lastUpdated: new Date()
            },
            {
                id: `platform-dict-categories-${profile.id}`,
                name: 'Categories',
                type: NodeType.FOLDER,
                icon: 'class',
                hasChildren: true,
                operations: ['manage-categories'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/categories`, managementType: 'categories' },
                lastUpdated: new Date()
            },
            {
                id: `platform-dict-operatingsystems-${profile.id}`,
                name: 'Operating Systems',
                type: NodeType.FOLDER,
                icon: 'computer',
                hasChildren: false,
                operations: ['manage-operatingsystems'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/operating-systems`, managementType: 'operating-systems' },
                lastUpdated: new Date()
            },
            {
                id: `platform-dict-environments-${profile.id}`,
                name: 'Environments',
                type: NodeType.FOLDER,
                icon: 'cloud',
                hasChildren: false,
                operations: ['manage-environments'],
                metadata: { hostProfileId: profile.id, url: `${baseUrl}/api/v1/environments`, managementType: 'environments' },
                lastUpdated: new Date()
            }
        ];
    }



    private getBaseUrl(profile: RegistryServerProfile): string {
        let baseUrl = profile.registryServerUrl;
        if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        return baseUrl;
    }

    private async fetchServices(profile: RegistryServerProfile): Promise<TreeNode[]> {
        try {
            let baseUrl = profile.registryServerUrl;

            if (!baseUrl.startsWith('http')) {
                baseUrl = `http://${baseUrl}`;
            }

            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1);
            }

            const servicesUrl = `${baseUrl}/api/v1/services?size=1000`;
            const servicesResponseRaw = await firstValueFrom(this.http.get<any>(servicesUrl));
            const servicesResponse: ServiceInstance[] = Array.isArray(servicesResponseRaw) ? servicesResponseRaw : (servicesResponseRaw.data || []);

            // Fetch deployments to get the health status
            const deploymentsUrl = `${baseUrl}/api/v1/deployments?size=1000`;
            const deploymentsResponseRaw = await firstValueFrom(this.http.get<any>(deploymentsUrl));
            const deploymentsResponse: Deployment[] = Array.isArray(deploymentsResponseRaw) ? deploymentsResponseRaw : (deploymentsResponseRaw.data || []);

            // Map services to tree nodes with proper metadata
            return servicesResponse.map(service => {
                // Find all deployments for this service to determine health status
                const serviceDeployments = deploymentsResponse.filter(d => d.service.id === service.id);
                const healthStatus = this.getOverallHealthStatus(serviceDeployments);

                return {
                    id: `service-${profile.id}-${service.id}`,
                    name: service.name,
                    type: NodeType.SERVICE,
                    icon: 'dns',
                    hasChildren: true, // Services can have child nodes like deployments
                    operations: ['restart', 'view-logs', 'check-health'],
                    status: this.mapHealthStatusToNodeStatus(healthStatus),
                    metadata: {
                        ...service,
                        hostProfileId: profile.id,
                        deployments: serviceDeployments,
                        framework: service.framework
                    },
                    lastUpdated: new Date()
                };
            });
        } catch (e) {
            console.error(`Failed to fetch services from Host Server ${profile.name}`, e);
            throw e;
        }
    }

    private async fetchDeploymentsForService(profile: RegistryServerProfile, serviceId: string): Promise<TreeNode[]> {
        try {
            let baseUrl = profile.registryServerUrl;

            if (!baseUrl.startsWith('http')) {
                baseUrl = `http://${baseUrl}`;
            }

            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1);
            }

            // Fetch deployments for the specific service
            const deploymentsUrl = `${baseUrl}/api/v1/deployments/service/${serviceId}`;
            const deploymentsResponseRaw = await firstValueFrom(this.http.get<any>(deploymentsUrl));
            const deploymentsResponse: Deployment[] = Array.isArray(deploymentsResponseRaw) ? deploymentsResponseRaw : (deploymentsResponseRaw.data || []);

            return deploymentsResponse.map(deployment => ({
                id: `deployment-${profile.id}-${deployment.id}`,
                name: `${deployment.server.hostname}:${deployment.port}`,
                type: NodeType.REGISTRY_SERVER, // Using HOST_SERVER as a deployment node type
                icon: 'settings',
                hasChildren: false,
                operations: ['start', 'stop', 'restart'],
                status: this.mapDeploymentStatusToNodeStatus(deployment.status),
                metadata: {
                    ...deployment,
                    hostProfileId: profile.id
                },
                lastUpdated: new Date()
            }));
        } catch (e) {
            console.error(`Failed to fetch deployments for service ${serviceId} from Host Server ${profile.name}`, e);
            return []; // Return empty array instead of throwing to allow sub-modules to still display
        }
    }

    private async fetchSubModulesForService(profile: RegistryServerProfile, serviceId: string): Promise<TreeNode[]> {
        try {
            const baseUrl = this.getBaseUrl(profile);
            const subModulesUrl = `${baseUrl}/api/v1/services/${serviceId}/sub-modules`;
            const subModulesResponseRaw = await firstValueFrom(this.http.get<any>(subModulesUrl));
            const subModulesResponse: ServiceInstance[] = Array.isArray(subModulesResponseRaw) ? subModulesResponseRaw : (subModulesResponseRaw.data || []);

            if (subModulesResponse.length === 0) {
                return [];
            }

            // Fetch deployments to determine health status for each sub-module
            const deploymentsUrl = `${baseUrl}/api/v1/deployments?size=1000`;
            let deploymentsResponse: Deployment[] = [];
            try {
                const depsRaw = await firstValueFrom(this.http.get<any>(deploymentsUrl));
                deploymentsResponse = Array.isArray(depsRaw) ? depsRaw : (depsRaw.data || []);
            } catch (e) {
                console.warn('Failed to fetch deployments for sub-module health status', e);
            }

            return subModulesResponse.map(service => {
                const serviceDeployments = deploymentsResponse.filter(d => d.service?.id === service.id);
                const healthStatus = this.getOverallHealthStatus(serviceDeployments);

                return {
                    id: `service-${profile.id}-${service.id}`,
                    name: service.name,
                    type: NodeType.SERVICE,
                    icon: 'extension', // Different icon for sub-modules
                    hasChildren: true, // Sub-modules can also have deployments or nested sub-modules
                    operations: ['restart', 'view-logs', 'check-health'],
                    status: this.mapHealthStatusToNodeStatus(healthStatus),
                    metadata: {
                        ...service,
                        hostProfileId: profile.id,
                        deployments: serviceDeployments,
                        isSubModule: true
                    },
                    lastUpdated: new Date()
                };
            });
        } catch (e) {
            console.error(`Failed to fetch sub-modules for service ${serviceId}`, e);
            return [];
        }
    }

    private getOverallHealthStatus(deployments: Deployment[]): 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'UNKNOWN' {
        if (deployments.length === 0) {
            return 'UNKNOWN';
        }

        // If any deployment is unhealthy, the service is unhealthy
        // If any deployment is degraded but none are unhealthy, the service is degraded
        // If all deployments are healthy, the service is healthy
        const statuses = deployments.map(d => d.healthStatus);

        if (statuses.some(s => s === 'UNHEALTHY')) {
            return 'UNHEALTHY';
        } else if (statuses.some(s => s === 'DEGRADED')) {
            return 'DEGRADED';
        } else if (statuses.every(s => s === 'HEALTHY')) {
            return 'HEALTHY';
        } else {
            return 'UNKNOWN';
        }
    }

    private mapHealthStatusToNodeStatus(healthStatus: 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'UNKNOWN'): NodeStatus {
        switch (healthStatus) {
            case 'HEALTHY': return NodeStatus.HEALTHY;
            case 'UNHEALTHY': return NodeStatus.UNHEALTHY;
            case 'DEGRADED': return NodeStatus.DEGRADED;
            case 'UNKNOWN': return NodeStatus.UNKNOWN;
        }
    }

    private mapDeploymentStatusToNodeStatus(deploymentStatus: string): NodeStatus {
        switch (deploymentStatus) {
            case 'RUNNING': return NodeStatus.HEALTHY;
            case 'STOPPED': return NodeStatus.OFFLINE;
            case 'STARTING':
            case 'STOPPING': return NodeStatus.DEGRADED;
            case 'FAILED': return NodeStatus.UNHEALTHY;
            default: return NodeStatus.UNKNOWN;
        }
    }

    async executeOperation(nodeId: string, operation: string, params: any): Promise<any> {
        console.log(`Executing ${operation} on ${nodeId}`, params);

        // Handle Service Operations
        if (nodeId.startsWith('service-')) {
            const parts = nodeId.split('-');
            const profileId = parts[1];
            const serviceId = parts.slice(2).join('-');
            const profile = this.profileService.profiles().find(p => p.id === profileId);

            if (profile) {
                const serviceMeshService = inject(ServiceMeshService);
                return serviceMeshService.executeServiceOperation(serviceId, operation as any, profile);
            }
        }

        // Handle Deployment Operations
        if (nodeId.startsWith('deployment-')) {
            const parts = nodeId.split('-');
            const profileId = parts[1];
            const deploymentId = parts.slice(2).join('-');
            const profile = this.profileService.profiles().find(p => p.id === profileId);

            if (profile) {
                const serviceMeshService = inject(ServiceMeshService);
                let baseUrl = profile.registryServerUrl;
                if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
                if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

                return serviceMeshService.executeOperation({
                    deploymentId,
                    operation: operation as any,
                    params
                }, baseUrl);
            }
        }

        return null;
    }

    async getAvailableOperations(nodeId: string): Promise<string[]> {
        if (nodeId.startsWith('service-')) {
            return ['restart', 'view-logs', 'check-health'];
        }
        if (nodeId.startsWith('deployment-')) {
            return ['start', 'stop', 'restart'];
        }
        return [];
    }

    watchChanges(nodeId: string, callback: (changes: TreeChange[]) => void): Subscription {
        return this.updateSubject.asObservable().subscribe(callback);
    }
}
