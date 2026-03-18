import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { BrokerProfile } from '../models/broker-profile.model.js';
import { LocalConfigService } from './local-config.service.js';

export type ServiceStatus = 'UP' | 'DOWN' | 'UNKNOWN' | 'CHECKING';

interface HealthCheckResponse {
  status: 'UP' | 'DOWN';
}

@Injectable({
  providedIn: 'root',
})
export class HealthCheckService {
  private http = inject(HttpClient);
  private localConfigService = inject(LocalConfigService);

  private serviceStatuses = signal<Map<string, ServiceStatus>>(new Map());
  public readonly statusMap = this.serviceStatuses.asReadonly();
  private serviceTimers = new Map<string, any>();

  getServiceStatus(baseUrl: string): ServiceStatus {
    return this.serviceStatuses().get(baseUrl) ?? 'UNKNOWN';
  }

  syncMonitoredProfiles(profiles: Pick<BrokerProfile, 'imageUrl' | 'healthCheckDelayMinutes'>[]): void {
    const activeUrls = new Set(profiles.map(p => p.imageUrl).filter(url => !!url));

    // 1. Remove monitors for URLs that are no longer present
    const currentMonitoredUrls = Array.from(this.serviceStatuses().keys());
    for (const url of currentMonitoredUrls) {
      if (!activeUrls.has(url)) {
        // Stop monitoring
        if (this.serviceTimers.has(url)) {
          clearTimeout(this.serviceTimers.get(url));
          this.serviceTimers.delete(url);
        }
        // Remove from statuses map
        this.serviceStatuses.update(map => {
          const newMap = new Map(map);
          newMap.delete(url);
          return newMap;
        });
      }
    }

    // 2. Add monitors for new URLs
    for (const profile of profiles) {
      this.monitorService(profile);
    }
  }

  monitorService(profile: Pick<BrokerProfile, 'imageUrl' | 'healthCheckDelayMinutes'>): void {
    const baseUrl = profile.imageUrl;
    if (!baseUrl || this.serviceStatuses().has(baseUrl)) {
      return; // Already monitoring or no URL to monitor
    }

    this.serviceStatuses.update(map => new Map(map).set(baseUrl, 'CHECKING'));

    const delayMinutes = profile.healthCheckDelayMinutes ?? this.localConfigService.currentConfig().healthCheckDelayMinutes;
    const delayMs = delayMinutes * 60 * 1000;

    this._checkHealth(baseUrl, delayMs);
  }

  private async _checkHealth(baseUrl: string, delayMs: number): Promise<void> {
    const healthUrl = `${baseUrl}/health`;

    try {
      const response$ = this.http.get<HealthCheckResponse>(healthUrl).pipe(
        catchError(() => of({ status: 'DOWN' } as HealthCheckResponse))
      );
      const response = await firstValueFrom(response$);

      if (response.status === 'UP') {
        this.serviceStatuses.update(map => new Map(map).set(baseUrl, 'UP'));
        // If it was down, clear the timer. We don't need to poll a healthy service.
        if (this.serviceTimers.has(baseUrl)) {
          clearTimeout(this.serviceTimers.get(baseUrl));
          this.serviceTimers.delete(baseUrl);
        }
      } else {
        throw new Error('Health check returned DOWN');
      }
    } catch (error) {
      // Any error (network, or status DOWN) leads to this block
      this.serviceStatuses.update(map => new Map(map).set(baseUrl, 'DOWN'));
      console.warn(`Health check for ${baseUrl} failed. Retrying in ${delayMs / 1000 / 60} minutes.`);

      // Clear any existing timer for this URL before setting a new one
      if (this.serviceTimers.has(baseUrl)) {
        clearTimeout(this.serviceTimers.get(baseUrl));
      }

      const timerId = setTimeout(() => {
        this.serviceTimers.delete(baseUrl); // Clean up before next check
        this.serviceStatuses.update(map => new Map(map).set(baseUrl, 'CHECKING'));
        this._checkHealth(baseUrl, delayMs);
      }, delayMs);
      this.serviceTimers.set(baseUrl, timerId);
    }
  }
}
