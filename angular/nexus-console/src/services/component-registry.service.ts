
import { Injectable, signal, computed, inject } from '@angular/core';
import { ComponentConfig, INITIAL_REGISTRY, NodeType } from '../models/component-config.js';
import { PlatformManagementService } from './platform-management.service.js';
import { HostProfileService } from './host-profile.service.js';

@Injectable({
    providedIn: 'root'
})
export class ComponentRegistryService {
    private platformService = inject(PlatformManagementService);
    private hostProfileService = inject(HostProfileService);

    // Master list of all components
    private registry = signal<ComponentConfig[]>([]);

    // Derived Accessors
    public allComponents = this.registry.asReadonly();

    public availableTypes = computed(() => this.registry().map(c => c.type));

    constructor() {
        this.loadComponents();
    }

    private getBaseUrl(): string {
        const profiles = this.hostProfileService.profiles();
        if (profiles.length === 0) {
            return 'http://localhost:8085'; // Default fallback
        }
        let url = profiles[0].hostServerUrl;
        if (!url.startsWith('http')) url = `http://${url}`;
        if (url.endsWith('/')) url = url.slice(0, -1);
        return url;
    }

    async loadComponents() {
        const baseUrl = this.getBaseUrl();
        try {
            const components = await this.platformService.getVisualComponents(baseUrl);
            if (components && components.length > 0) {
                this.registry.set(components);
            } else {
                // Fallback to initial registry if backend empty/fails (or seeding hasn't run)
                this.registry.set([...INITIAL_REGISTRY]);
            }
        } catch (e) {
            console.error('Failed to load components', e);
            this.registry.set([...INITIAL_REGISTRY]);
        }
    }

    getConfig(type: NodeType): ComponentConfig {
        const config = this.registry().find(c => c.type === type);
        if (!config) {
            // Fallback
            return this.registry().find(c => c.type === 'internal') || this.registry()[0] || INITIAL_REGISTRY[0];
        }
        return config;
    }

    getConfigById(id: string): ComponentConfig | undefined {
        // ID is string (number from backend converted to string if needed)
        // Backend IDs are numbers, but frontend treats as string. 
        // I should ensure loose comparison or consistent type.
        return this.registry().find(c => String(c.id) === String(id));
    }

    async addComponent(config: ComponentConfig) {
        const baseUrl = this.getBaseUrl();
        // Exclude ID to let backend generate it
        const { id, ...rest } = config;
        const created = await this.platformService.createVisualComponent(baseUrl, rest);
        this.registry.update(current => [...current, created]);
        return created;
    }

    async updateComponent(id: string, updates: Partial<ComponentConfig>) {
        const baseUrl = this.getBaseUrl();
        const updated = await this.platformService.updateVisualComponent(baseUrl, id, updates);
        this.registry.update(current =>
            current.map(c => String(c.id) === String(id) ? updated : c)
        );
        return updated;
    }

    async deleteComponent(id: string) {
        const config = this.getConfigById(id);
        if (config?.isSystem) return;

        const baseUrl = this.getBaseUrl();
        await this.platformService.deleteVisualComponent(baseUrl, id);

        this.registry.update(current => current.filter(c => String(c.id) !== String(id)));
    }

    // Generates a new component config based on a parent (Visual Cloning)
    createDerivedComponent(parentId: string, newName: string): ComponentConfig {
        const parent = this.getConfigById(parentId);
        if (!parent) throw new Error('Parent not found');

        const newSlug = newName.toLowerCase().replace(/[^a-z0-9]/g, '-');

        return {
            ...parent, // Copy visual props
            id: '', // Empty ID (new)
            isSystem: false,
            type: `custom-${newSlug}-${Date.now().toString().slice(-4)}`,
            name: newName,
            description: `Derived from ${parent.name}`,
            createdAt: undefined,
            updatedAt: undefined
        };
    }
}
