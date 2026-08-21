import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HostProfileService } from './host-profile.service.js';
import { SERVICE_REGISTRY_ENV, SERVICE_REGISTRY_LEGACY, readEnv } from './endpoint-resolver.js';

export interface SeedResult {
  seeded: boolean;
  created: Record<string, boolean>;
  skipped: Record<string, boolean>;
  createdCount: number;
  skippedCount: number;
  message: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private http = inject(HttpClient);
  private hostProfileService = inject(HostProfileService);

  private getBaseUrl(): string {
    const profile = this.hostProfileService.activeProfile();
    if (!profile) {
      // T25 3.2 (R-A-2026-08-15-008): runtime lookup > env > legacy localhost.
      return readEnv(SERVICE_REGISTRY_ENV) || SERVICE_REGISTRY_LEGACY;
    }

    let url = profile.registryServerUrl;
    if (!url.startsWith('http')) {
      url = `http://${url}`;
    }
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  async seedData(): Promise<SeedResult> {
    const baseUrl = this.getBaseUrl();
    try {
      const result = await firstValueFrom(
        this.http.post<SeedResult>(`${baseUrl}/api/v1/seed`, {})
      );
      return result;
    } catch (error) {
      console.error('[DataService] Seed failed:', error);
      return {
        seeded: false,
        created: {},
        skipped: {},
        createdCount: 0,
        skippedCount: 0,
        message: 'Seed request failed — backend may be unavailable',
        error: (error as Error).message,
      };
    }
  }
}
