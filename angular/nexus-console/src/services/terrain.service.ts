import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// ---- Terrain Data Models ----

export type TerrainServiceStatus = 'ON' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN';
export type TerrainServerStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'UNKNOWN';

export interface McpServer {
  id: number;
  name: string;
  port: number;
  workspacePath: string;
  serviceTypeId: number;
  healthCheckUrl: string;
  status: TerrainServiceStatus;
  liveStatus?: TerrainServiceStatus;
  transportType: string;
  version: string;
  description: string;
  repositoryUrl: string;
  activeFlag: boolean;
}

export interface RunnableService {
  id: number;
  name: string;
  port: number;
  workspacePath: string;
  serviceTypeId: number;
  healthCheckUrl: string;
  status: TerrainServiceStatus;
  liveStatus?: TerrainServiceStatus;
  version: string;
  description: string;
  repositoryUrl: string;
  activeFlag: boolean;
}

export interface TerrainServer {
  id: number;
  hostname: string;
  ipAddress: string;
  os: string;
  status: string;
  activeFlag: boolean;
}

export interface TerrainHealthSummary {
  terrainUp: boolean;
  terrainError?: string;
  mcpServers: McpServer[];
  runnableServices: RunnableService[];
  servers: TerrainServer[];
  loadedAt: Date;
}

// ---- Expected response shape from /api/v1/platform/health ----

interface PlatformHealthResponse {
  terrainUp: boolean;
  timestamp: string;
  mcpServers: {
    total: number;
    online: number;
    offline: number;
    degraded: number;
    items: McpServer[];
  };
  runnableServices: {
    total: number;
    online: number;
    offline: number;
    degraded: number;
    items: RunnableService[];
  };
  hostServers: {
    total: number;
    online: number;
    offline: number;
    items: TerrainServer[];
  };
}

// ---- Service ----

@Injectable({
  providedIn: 'root',
})
export class TerrainService {
  private http = inject(HttpClient);

  /**
   * Fetch the full health summary from the terrain server via the
   * aggregated /api/v1/platform/health endpoint (single call).
   *
   * If the endpoint is unreachable (network error / 5xx), terrain is
   * considered down and an empty summary with `terrainUp: false` is returned.
   */
  async getHealthSummary(baseUrl: string): Promise<TerrainHealthSummary> {
    const url = `${baseUrl}/api/v1/platform/health`;

    const response = await firstValueFrom(
      this.http.get<PlatformHealthResponse>(url).pipe(
        catchError(() => of(null))
      )
    );

    // Network / HTTP error → terrain is down
    if (!response) {
      return {
        terrainUp: false,
        terrainError: `Unable to reach terrain server at ${baseUrl}`,
        mcpServers: [],
        runnableServices: [],
        servers: [],
        loadedAt: new Date(),
      };
    }

    // terrainUp reflects downstream service health, not terrain server reachability.
    // We always return full service lists so the UI can show individual statuses.
    return {
      terrainUp: response.terrainUp,
      mcpServers: response.mcpServers?.items ?? [],
      runnableServices: response.runnableServices?.items ?? [],
      servers: response.hostServers?.items ?? [],
      loadedAt: new Date(),
    };
  }
}
