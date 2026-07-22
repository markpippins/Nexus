import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RegistryServerProfileService } from './registry-server-profile.service.js';

// ---- Data Models ----

export type HealthState = 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';

export interface RegistryServiceStatus {
  serviceId: number | null;
  serviceName: string;
  healthState: HealthState;
  lastHealthCheck?: string;
  lastHeartbeat?: string;
  responseTimeMs?: number;
  errorMessage?: string;
  version?: string;
  build?: string;
  metrics?: Record<string, any>;
  activeFlag?: boolean;
}

export interface RegistryStatusEvent {
  serviceName: string;
  oldState: string;
  newState: string;
  reason?: string;
  errorMessage?: string;
  changedAt: string;
}

export interface RegistrySseClient {
  connectedAt: string;
  eventsSent: number;
  eventsFiltered: number;
  serviceFilter: string[];
  eventFilter: string[];
}

export interface RegistrySseSnapshot {
  services: RegistryServiceStatus[];
  count: number;
  timestamp: string;
}

export type RegistrySseEventType = 'snapshot' | 'status-update' | 'heartbeat' | 'status-change' | 'keepalive';

export interface RegistrySseMessage {
  type: RegistrySseEventType;
  data: any;
  id?: string;
}

// ---- Service ----

@Injectable({
  providedIn: 'root',
})
export class RegistryStatusService {
  private http = inject(HttpClient);
  private profileService = inject(RegistryServerProfileService);

  /** Current service statuses keyed by service name */
  readonly serviceStatuses = signal<Map<string, RegistryServiceStatus>>(new Map());

  /** Recent status transitions (status-change events) */
  readonly transitions = signal<RegistryStatusEvent[]>([]);

  /** Recent heartbeat events */
  readonly recentHeartbeats = signal<{ serviceName: string; timestamp: string; version?: string }[]>([]);

  /** Connected SSE client info */
  readonly sseClients = signal<RegistrySseClient[]>([]);

  /** Whether the SSE connection is active */
  readonly connected = signal(false);

  /** Error message if connection fails */
  readonly error = signal<string | null>(null);

  /** Timestamp of the last snapshot */
  readonly lastSnapshotAt = signal<string | null>(null);

  private eventSource: EventSource | null = null;
  private heartbeatBuffer: { serviceName: string; timestamp: string; version?: string }[] = [];
  private readonly MAX_HEARTBEATS = 50;
  private readonly MAX_TRANSITIONS = 100;
  private clientInfoInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Connect to the SSE stream. Returns a promise that resolves once the
   * initial snapshot is received, or rejects on timeout/error.
   */
  connect(baseUrl: string, serviceFilter?: string[], eventFilter?: string[]): Promise<void> {
    this.disconnect();
    this.error.set(null);

    return new Promise((resolve, reject) => {
      let params = new URLSearchParams();
      if (serviceFilter && serviceFilter.length > 0) {
        params.set('services', serviceFilter.join(','));
      }
      if (eventFilter && eventFilter.length > 0) {
        params.set('events', eventFilter.join(','));
      }
      const queryString = params.toString();
      const url = `${baseUrl}/api/v1/status/stream${queryString ? '?' + queryString : ''}`;

      const source = new EventSource(url, { withCredentials: true });
      let snapshotReceived = false;
      const timeoutId = setTimeout(() => {
        if (!snapshotReceived) {
          source.close();
          this.connected.set(false);
          this.error.set('SSE connection timed out — no snapshot received within 15s');
          reject(new Error('SSE connection timeout'));
        }
      }, 15_000);

      source.addEventListener('snapshot', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as RegistrySseSnapshot;
          const map = new Map<string, RegistryServiceStatus>();
          for (const svc of data.services) {
            map.set(svc.serviceName, svc);
          }
          this.serviceStatuses.set(map);
          this.lastSnapshotAt.set(data.timestamp);
          this.connected.set(true);
          this.error.set(null);
          snapshotReceived = true;
          clearTimeout(timeoutId);
          this.fetchTransitions(baseUrl);
          this.startClientInfoPolling(baseUrl);
          resolve();
        } catch (e) {
          console.error('[RegistryStatusService] Failed to parse snapshot', e);
        }
      });

      source.addEventListener('status-update', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as RegistryServiceStatus;
          this.serviceStatuses.update(map => {
            const updated = new Map(map);
            updated.set(data.serviceName, data);
            return updated;
          });
        } catch (e) {
          console.error('[RegistryStatusService] Failed to parse status-update', e);
        }
      });

      source.addEventListener('heartbeat', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          const entry = {
            serviceName: data.serviceName || 'unknown',
            timestamp: data.timestamp || new Date().toISOString(),
            version: data.version || undefined,
          };
          this.heartbeatBuffer.unshift(entry);
          if (this.heartbeatBuffer.length > this.MAX_HEARTBEATS) {
            this.heartbeatBuffer = this.heartbeatBuffer.slice(0, this.MAX_HEARTBEATS);
          }
          this.recentHeartbeats.set([...this.heartbeatBuffer]);
        } catch (e) {
          console.error('[RegistryStatusService] Failed to parse heartbeat', e);
        }
      });

      source.addEventListener('status-change', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as RegistryStatusEvent;
          this.transitions.update(current => {
            const updated = [data, ...current];
            return updated.slice(0, this.MAX_TRANSITIONS);
          });
        } catch (e) {
          console.error('[RegistryStatusService] Failed to parse status-change', e);
        }
      });

      source.addEventListener('keepalive', () => {
        // No-op — prevents proxy timeouts
      });

      source.onerror = () => {
        // EventSource will auto-reconnect; just update state
        this.connected.set(false);
        if (!snapshotReceived) {
          clearTimeout(timeoutId);
          this.error.set('Failed to connect to SSE stream');
          reject(new Error('SSE connection failed'));
        }
      };

      this.eventSource = source;
    });
  }

  /**
   * Disconnect from the SSE stream.
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.clientInfoInterval) {
      clearInterval(this.clientInfoInterval);
      this.clientInfoInterval = null;
    }
    this.connected.set(false);
  }

  /**
   * Fetch transition history via REST (complements SSE stream).
   */
  private async fetchTransitions(baseUrl: string): Promise<void> {
    try {
      const url = `${baseUrl}/api/v1/status/transitions?limit=50`;
      const events = await firstValueFrom(
        this.http.get<RegistryStatusEvent[]>(url)
      );
      if (events && events.length > 0) {
        this.transitions.set(events.slice(0, this.MAX_TRANSITIONS));
      }
    } catch (e) {
      console.warn('[RegistryStatusService] Failed to fetch transition history', e);
    }
  }

  /**
   * Periodically poll for connected SSE client info.
   */
  private startClientInfoPolling(baseUrl: string): void {
    this.fetchClientInfo(baseUrl);
    this.clientInfoInterval = setInterval(() => {
      this.fetchClientInfo(baseUrl);
    }, 30_000);
  }

  private async fetchClientInfo(baseUrl: string): Promise<void> {
    try {
      const url = `${baseUrl}/api/v1/status/stream/clients`;
      const response = await firstValueFrom(
        this.http.get<{ count: number; clients: RegistrySseClient[] }>(url)
      );
      this.sseClients.set(response.clients || []);
    } catch (e) {
      // Silently fail — client info is non-critical
    }
  }

  /**
   * Get status history for a specific service.
   */
  async fetchServiceHistory(baseUrl: string, serviceName: string, limit = 20): Promise<RegistryStatusEvent[]> {
    try {
      const url = `${baseUrl}/api/v1/status/${encodeURIComponent(serviceName)}/history?limit=${limit}`;
      return await firstValueFrom(this.http.get<RegistryStatusEvent[]>(url));
    } catch (e) {
      console.warn(`[RegistryStatusService] Failed to fetch history for ${serviceName}`, e);
      return [];
    }
  }

  /**
   * Get the current count of connected SSE clients.
   */
  get connectedClientCount(): number {
    return this.sseClients().length;
  }
}
