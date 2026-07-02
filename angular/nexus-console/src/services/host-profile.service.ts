import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RegistryServerProfile } from '../models/registry-server-profile.model.js';

const TOPOLOGY_SERVER_URL = 'http://localhost:8084';
const PROFILES_API = `${TOPOLOGY_SERVER_URL}/api/v1/registry-server-profiles`;

export type HostProfile = RegistryServerProfile;

@Injectable({
  providedIn: 'root',
})
export class HostProfileService {
  private http = inject(HttpClient);

  readonly profiles = signal<HostProfile[]>([
    {
      id: 'default-local-host',
      name: 'Local Host',
      registryServerUrl: 'http://localhost:8085',
      imageUrl: '',
      description: 'Default local registry server',
      isActive: true,
    }
  ]);

  activeProfile(): HostProfile | undefined {
    return this.profiles().find(p => p.isActive) || this.profiles()[0];
  }

  async loadProfiles(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<{ data: HostProfile[] }>(`${PROFILES_API}?page=0&size=50&sort=name,asc`)
      );
      if (result.data?.length) {
        this.profiles.set(result.data);
      }
    } catch (err) {
      console.warn('[HostProfileService] Could not load profiles from topology server, using defaults');
    }
  }

  async saveProfile(profile: Partial<HostProfile> & { name: string }): Promise<HostProfile> {
    const result = await firstValueFrom(
      this.http.post<HostProfile>(PROFILES_API, profile)
    );
    await this.loadProfiles();
    return result;
  }

  async deleteProfile(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${PROFILES_API}/${id}`));
    } catch {
      // fallback: remove from local state
      this.profiles.update(p => p.filter(pr => pr.id !== id));
    }
    await this.loadProfiles();
  }

  async updateProfile(id: string, profile: Partial<HostProfile>): Promise<HostProfile> {
    const result = await firstValueFrom(
      this.http.put<HostProfile>(`${PROFILES_API}/${id}`, profile)
    );
    await this.loadProfiles();
    return result;
  }

  setActiveProfile(id: string): void {
    this.profiles.update(p => p.map(pr => ({ ...pr, isActive: pr.id === id })));
  }
}
