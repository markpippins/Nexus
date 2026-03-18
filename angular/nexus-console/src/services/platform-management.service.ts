import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ServiceInstance, Framework, Deployment, Library, ServiceLibrary } from '../models/service-mesh.model.js';
import { ComponentConfig } from '../models/component-config.js';

export interface Host {
    id: number;
    hostname: string;
    ipAddress: string;
    serverTypeId: number;
    environmentTypeId: number;
    operatingSystemId: number;
    cpuCores?: number;
    memory?: string;
    disk?: string;
    status?: string;
    region?: string;
    cloudProvider?: string;
    description?: string;
    activeFlag?: boolean;
}

export interface ServicePayload {
    name: string;
    description?: string;
    frameworkId: number;
    serviceTypeId: number;
    defaultPort?: number;
    apiBasePath?: string;
    repositoryUrl?: string;
    version?: string;
    status?: string;
    componentOverrideId?: number;
    parentServiceId?: number;
}

export interface FrameworkPayload {
    name: string;
    description?: string;
    vendorId?: number;
    categoryId: number;
    languageId: number;
    currentVersion?: string;
    ltsVersion?: string;
    url?: string;
}

export interface DeploymentPayload {
    serviceId: number;
    environmentId: number;
    serverId: number;
    version?: string;
    status?: string;
    port?: number;
    contextPath?: string;
    healthCheckUrl?: string;
}

export interface LibraryPayload {
    name: string;
    description?: string;
    categoryId?: number;
    languageId?: number;
    currentVersion?: string;
    packageName?: string;
    packageManager?: string;
    url?: string;
    repositoryUrl?: string;
    license?: string;
}

export interface ServiceLibraryPayload {
    serviceId: number;
    libraryId: number;
    version: string;
    versionConstraint?: string;
    scope?: string;
    isDirect?: boolean;
    isDevDependency?: boolean;
    notes?: string;
}

@Injectable({
    providedIn: 'root'
})
export class PlatformManagementService {
    private http = inject(HttpClient);

    // Loading states
    loading = signal(false);
    error = signal<string | null>(null);

    // Services CRUD
    async getServices(baseUrl: string): Promise<ServiceInstance[]> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/services`;
            return await firstValueFrom(this.http.get<ServiceInstance[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch services');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async createService(baseUrl: string, service: ServicePayload): Promise<ServiceInstance> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/services`;
            return await firstValueFrom(this.http.post<ServiceInstance>(url, service));
        } catch (e) {
            this.error.set('Failed to create service');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateService(baseUrl: string, id: number, service: ServicePayload): Promise<ServiceInstance> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/services/${id}`;
            return await firstValueFrom(this.http.put<ServiceInstance>(url, service));
        } catch (e) {
            this.error.set('Failed to update service');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async deleteService(baseUrl: string, id: number): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/services/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set('Failed to delete service');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async getStandaloneServices(baseUrl: string): Promise<ServiceInstance[]> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/services/standalone`;
            return await firstValueFrom(this.http.get<ServiceInstance[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch standalone services');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    // Frameworks CRUD
    async getFrameworks(baseUrl: string): Promise<Framework[]> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/frameworks`;
            return await firstValueFrom(this.http.get<Framework[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch frameworks');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async createFramework(baseUrl: string, framework: FrameworkPayload): Promise<Framework> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/frameworks`;
            return await firstValueFrom(this.http.post<Framework>(url, framework));
        } catch (e) {
            this.error.set('Failed to create framework');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateFramework(baseUrl: string, id: number, framework: FrameworkPayload): Promise<Framework> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/frameworks/${id}`;
            return await firstValueFrom(this.http.put<Framework>(url, framework));
        } catch (e) {
            this.error.set('Failed to update framework');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async deleteFramework(baseUrl: string, id: number): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/frameworks/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set('Failed to delete framework');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    // Deployments CRUD
    async getDeployments(baseUrl: string): Promise<Deployment[]> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/deployments`;
            return await firstValueFrom(this.http.get<Deployment[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch deployments');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async createDeployment(baseUrl: string, deployment: DeploymentPayload): Promise<Deployment> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/deployments`;
            return await firstValueFrom(this.http.post<Deployment>(url, deployment));
        } catch (e) {
            this.error.set('Failed to create deployment');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateDeployment(baseUrl: string, id: number, deployment: DeploymentPayload): Promise<Deployment> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/deployments/${id}`;
            return await firstValueFrom(this.http.put<Deployment>(url, deployment));
        } catch (e) {
            this.error.set('Failed to update deployment');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async deleteDeployment(baseUrl: string, id: number): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/deployments/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set('Failed to delete deployment');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    // Servers/Hosts CRUD
    async getServers(baseUrl: string): Promise<Host[]> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/servers`;
            return await firstValueFrom(this.http.get<Host[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch servers');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async createServer(baseUrl: string, server: Partial<Host>): Promise<Host> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/servers`;
            return await firstValueFrom(this.http.post<Host>(url, server));
        } catch (e) {
            this.error.set('Failed to create server');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateServer(baseUrl: string, id: number, server: Partial<Host>): Promise<Host> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/servers/${id}`;
            return await firstValueFrom(this.http.put<Host>(url, server));
        } catch (e) {
            this.error.set('Failed to update server');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async deleteServer(baseUrl: string, id: number): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/servers/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set('Failed to delete server');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    // Lookup
    async getLookup(baseUrl: string, type: string): Promise<LookupItem[]> {
        // Endpoint mapping
        let endpoint = type;
        if (type === 'service-types') endpoint = 'service-types';
        else if (type === 'server-types') endpoint = 'server-types';
        else if (type === 'framework-categories') endpoint = 'framework-categories';
        else if (type === 'framework-languages') endpoint = 'framework-languages';
        else if (type === 'library-categories') endpoint = 'library-categories';
        else if (type === 'operating-systems') endpoint = 'operating-systems';
        else if (type === 'environments') endpoint = 'environments';

        try {
            const url = `${baseUrl}/api/${endpoint}`;
            return await firstValueFrom(this.http.get<LookupItem[]>(url));
        } catch (e) {
            console.error(`Failed to fetch lookup ${type}`, e);
            throw e;
        }
    }

    // Generic Lookup CRUD
    async createLookup(baseUrl: string, type: string, item: Partial<LookupItem>): Promise<LookupItem> {
        const endpoint = this.getLookupEndpoint(type);
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/${endpoint}`;
            return await firstValueFrom(this.http.post<LookupItem>(url, item));
        } catch (e) {
            this.error.set(`Failed to create ${type}`);
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateLookup(baseUrl: string, type: string, id: number, item: Partial<LookupItem>): Promise<LookupItem> {
        const endpoint = this.getLookupEndpoint(type);
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/${endpoint}/${id}`;
            return await firstValueFrom(this.http.put<LookupItem>(url, item));
        } catch (e) {
            this.error.set(`Failed to update ${type}`);
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async deleteLookup(baseUrl: string, type: string, id: number): Promise<void> {
        const endpoint = this.getLookupEndpoint(type);
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/${endpoint}/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set(`Failed to delete ${type}`);
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    private getLookupEndpoint(type: string): string {
        switch (type) {
            case 'service-types': return 'service-types';
            case 'server-types': return 'server-types';
            case 'framework-categories': return 'framework-categories';
            case 'framework-languages': return 'framework-languages';
            case 'library-categories': return 'library-categories';
            case 'operating-systems': return 'operating-systems';
            case 'environments': return 'environments';
            default: return type;
        }
    }

    // Libraries CRUD
    async getLibraries(baseUrl: string): Promise<Library[]> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/libraries`;
            return await firstValueFrom(this.http.get<Library[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch libraries');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async getLibraryById(baseUrl: string, id: number): Promise<Library> {
        try {
            const url = `${baseUrl}/api/libraries/${id}`;
            return await firstValueFrom(this.http.get<Library>(url));
        } catch (e) {
            this.error.set('Failed to fetch library');
            throw e;
        }
    }

    async createLibrary(baseUrl: string, library: LibraryPayload): Promise<Library> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/libraries`;
            return await firstValueFrom(this.http.post<Library>(url, library));
        } catch (e) {
            this.error.set('Failed to create library');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateLibrary(baseUrl: string, id: number, library: LibraryPayload): Promise<Library> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/libraries/${id}`;
            return await firstValueFrom(this.http.put<Library>(url, library));
        } catch (e) {
            this.error.set('Failed to update library');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async deleteLibrary(baseUrl: string, id: number): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/libraries/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set('Failed to delete library');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    // Service Libraries (Dependencies) CRUD
    async getServiceLibraries(baseUrl: string, serviceId: number): Promise<ServiceLibrary[]> {
        try {
            const url = `${baseUrl}/api/service-libraries/service/${serviceId}`;
            return await firstValueFrom(this.http.get<ServiceLibrary[]>(url));
        } catch (e) {
            this.error.set('Failed to fetch service libraries');
            throw e;
        }
    }

    async addServiceLibrary(baseUrl: string, payload: ServiceLibraryPayload): Promise<ServiceLibrary> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/service-libraries`;
            return await firstValueFrom(this.http.post<ServiceLibrary>(url, payload));
        } catch (e) {
            this.error.set('Failed to add library to service');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async updateServiceLibrary(baseUrl: string, id: number, payload: ServiceLibraryPayload): Promise<ServiceLibrary> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/service-libraries/${id}`;
            return await firstValueFrom(this.http.put<ServiceLibrary>(url, payload));
        } catch (e) {
            this.error.set('Failed to update service library');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }

    async removeServiceLibrary(baseUrl: string, id: number): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const url = `${baseUrl}/api/service-libraries/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } catch (e) {
            this.error.set('Failed to remove library from service');
            throw e;
        } finally {
            this.loading.set(false);
        }
    }
    // Visual Components CRUD
    async getVisualComponents(baseUrl: string): Promise<ComponentConfig[]> {
        try {
            const url = `${baseUrl}/api/visual-components`;
            return await firstValueFrom(this.http.get<ComponentConfig[]>(url));
        } catch (e) {
            console.error('Failed to fetch visual components', e);
            return [];
        }
    }

    async createVisualComponent(baseUrl: string, component: Partial<ComponentConfig>): Promise<ComponentConfig> {
        this.loading.set(true);
        try {
            const url = `${baseUrl}/api/visual-components`;
            return await firstValueFrom(this.http.post<ComponentConfig>(url, component));
        } finally {
            this.loading.set(false);
        }
    }

    async updateVisualComponent(baseUrl: string, id: string, component: Partial<ComponentConfig>): Promise<ComponentConfig> {
        this.loading.set(true);
        try {
            const url = `${baseUrl}/api/visual-components/${id}`;
            return await firstValueFrom(this.http.put<ComponentConfig>(url, component));
        } finally {
            this.loading.set(false);
        }
    }

    async deleteVisualComponent(baseUrl: string, id: string): Promise<void> {
        this.loading.set(true);
        try {
            const url = `${baseUrl}/api/visual-components/${id}`;
            await firstValueFrom(this.http.delete<void>(url));
        } finally {
            this.loading.set(false);
        }
    }
}

export interface LookupItem {
    id: number;
    name: string;
    description?: string;
    version?: string;
    ltsFlag?: boolean;
    activeFlag?: boolean;
    defaultComponentId?: number;
    defaultComponent?: ComponentConfig;
}

