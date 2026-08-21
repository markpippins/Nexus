import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RegistryServerProfile } from '../models/registry-server-profile.model.js';
import { PagedResponse } from '../models/paged-response.model.js';
import { TERRAIN_UNIT, TERRAIN_ENV, TERRAIN_LEGACY, SERVICE_REGISTRY_UNIT, SERVICE_REGISTRY_ENV, SERVICE_REGISTRY_LEGACY, resolveEndpoint } from './endpoint-resolver.js';

// T25 3.2 (R-A-2026-08-15-008): runtime lookup > env > legacy localhost.
const topology = resolveEndpoint(TERRAIN_UNIT, TERRAIN_ENV, TERRAIN_LEGACY);
const registry = resolveEndpoint(SERVICE_REGISTRY_UNIT, SERVICE_REGISTRY_ENV, SERVICE_REGISTRY_LEGACY);

export type HostProfile = RegistryServerProfile;

@Injectable({
  providedIn: 'root',
})
export class HostProfileService {
  private http = inject(HttpClient);

  /** Maps frontend profile id (string) → backend numeric id (Long) */
  private backendIdMap = new Map<string, number>();

  /** Terrain/topology base URL — env/legacy initially, refined by lookup. */
  private topologyBaseUrl: string = topology.initial;

  private get PROFILES_API(): string {
    return `${this.topologyBaseUrl}/api/v1/registry-server-profiles`;
  }

  readonly profiles = signal<HostProfile[]>([
    {
      id: 'default-local-host',
      name: 'Local Host',
      registryServerUrl: registry.initial,
      imageUrl: '',
      description: 'Default local registry server',
      isActive: true,
    }
  ]);

  /** Registry base URL used for the default profile — refined by lookup. */
  private registryDefaultUrl: string = registry.initial;

  activeProfile(): HostProfile | undefined {
    return this.profiles().find(p => p.isActive) || this.profiles()[0];
  }

  constructor() {
    // Load immediately with env/legacy defaults; runtime lookup refines the
    // terrain + registry URLs when it returns (silent on failure).
    void this.loadProfiles();
    void Promise.all([topology.refine(), registry.refine()]).then(([t, r]) => {
      if (t) this.topologyBaseUrl = t;
      if (r) this.registryDefaultUrl = r;
      void this.loadProfiles();
    }).catch(() => { /* keep env/legacy defaults */ });
  }

  async loadProfiles(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<PagedResponse<any>>(this.PROFILES_API)
      );
      const apiProfiles = response.data || [];
      if (apiProfiles.length > 0) {
        // Map API response to frontend model (same format as RegistryServerProfileService)
        const mapped = apiProfiles.map((item: any) => {
          this.backendIdMap.set(item.profileId, item.id);
          return {
            id: item.profileId,
            name: item.name,
            registryServerUrl: item.registryServerUrl || '',
            imageUrl: item.imageUrl || '',
            isActive: item.isActive === true,
            description: item.description || '',
            environment: item.environment,
            hostname: item.hostname,
            ipAddress: item.ipAddress,
            operatingSystem: item.operatingSystem,
            cpuCores: item.cpuCores,
            memoryMb: item.memoryMb,
            diskGb: item.diskGb,
            region: item.region,
            cloudProvider: item.cloudProvider,
            status: item.status,
          } as HostProfile;
        });

        // Ensure at least one profile is active
        const hasActive = mapped.some(p => p.isActive === true);
        if (!hasActive && mapped.length > 0) {
          mapped[0].isActive = true;
        }
        this.profiles.set(mapped);
        console.log('[HostProfileService] Loaded profiles from API', mapped.map(p => p.name));
      } else {
        console.log('[HostProfileService] API returned no profiles, using defaults');
      }
    } catch (err) {
      console.warn('[HostProfileService] Could not load profiles from topology server, using defaults');
    }
  }

  async saveProfile(profile: Partial<HostProfile> & { name: string }): Promise<HostProfile> {
    const existing = this.profiles().find(p => p.name === profile.name || (profile.id && p.id === profile.id));
    const backendId = profile.id ? this.backendIdMap.get(profile.id) : undefined;

    if (existing && backendId) {
      // Update existing profile via backend id
      const result = await firstValueFrom(
        this.http.put<HostProfile>(`${this.PROFILES_API}/${backendId}`, {
          profileId: profile.id,
          name: profile.name,
          registryServerUrl: profile.registryServerUrl,
          imageUrl: profile.imageUrl,
          isActive: profile.isActive ?? false,
          description: profile.description || '',
          hostname: profile.hostname,
          ipAddress: profile.ipAddress,
          environment: profile.environment,
          operatingSystem: profile.operatingSystem,
          cpuCores: profile.cpuCores,
          memoryMb: profile.memoryMb,
          diskGb: profile.diskGb,
          region: profile.region,
          cloudProvider: profile.cloudProvider,
          status: profile.status,
        })
      );
      await this.loadProfiles();
      return result;
    } else {
      // Create new profile
      const profileId = profile.id || Date.now().toString();
      const created = await firstValueFrom(
        this.http.post<any>(this.PROFILES_API, {
          profileId,
          name: profile.name,
          registryServerUrl: profile.registryServerUrl || '',
          imageUrl: profile.imageUrl || '',
          isActive: profile.isActive ?? false,
          description: profile.description || '',
          hostname: profile.hostname,
          ipAddress: profile.ipAddress,
          environment: profile.environment,
          operatingSystem: profile.operatingSystem,
          cpuCores: profile.cpuCores,
          memoryMb: profile.memoryMb,
          diskGb: profile.diskGb,
          region: profile.region,
          cloudProvider: profile.cloudProvider,
          status: profile.status,
        })
      );
      this.backendIdMap.set(created.profileId, created.id);
      await this.loadProfiles();
      return created;
    }
  }

  async deleteProfile(id: string): Promise<void> {
    const backendId = this.backendIdMap.get(id);
    if (backendId) {
      try {
        await firstValueFrom(        this.http.delete(`${this.PROFILES_API}/${backendId}`));
      } catch (e) {
        console.error(`[HostProfileService] Failed to delete profile ${id}`, e);
        // fallback: remove from local state
        this.profiles.update(p => p.filter(pr => pr.id !== id));
      }
    } else {
      // No backend id mapping, just remove locally
      this.profiles.update(p => p.filter(pr => pr.id !== id));
    }
    this.backendIdMap.delete(id);
    await this.loadProfiles();
  }

  async updateProfile(id: string, profile: Partial<HostProfile>): Promise<HostProfile> {
    const backendId = this.backendIdMap.get(id);
    const url = backendId ? `${this.PROFILES_API}/${backendId}` : `${this.PROFILES_API}/${id}`;
    const result = await firstValueFrom(
      this.http.put<HostProfile>(url, profile)
    );
    await this.loadProfiles();
    return result;
  }

  setActiveProfile(id: string): void {
    this.profiles.update(p => p.map(pr => ({ ...pr, isActive: pr.id === id })));
  }
}
