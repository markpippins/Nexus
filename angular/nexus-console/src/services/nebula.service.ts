import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NEBULA_SRV_UNIT, NEBULA_SRV_ENV, NEBULA_SRV_LEGACY, resolveEndpoint } from './endpoint-resolver.js';

export interface NebulaSystem {
  id: string;
  name: string;
  description?: string;
  subsystems: NebulaSubsystem[];
  folders?: { id: string; name: string; category: string }[];
  createdAt?: number;
}

export interface NebulaSubsystem {
  id: string;
  name: string;
  description?: string;
  systemId: string;
  features: NebulaFeature[];
  color?: string;
  createdAt?: number;
}

export interface NebulaFeature {
  id: string;
  name: string;
  description?: string;
  subsystemId: string;
  createdAt?: number;
}

export type RequirementStatus =
  | 'Backlog'
  | 'ToDo'
  | 'InProgress'
  | 'Active'
  | 'Blocked'
  | 'Done'
  | 'Cancelled'
  | 'Accepted';

export interface NebulaRequirement {
  id: string;
  title: string;
  description?: string;
  status: RequirementStatus;
  priority: string;
  reqType: string;
  systemId: string;
  subsystemId: string | null;
  featureId: string | null;
  parentId: string | null;
  acceptanceCriteria?: string[] | null;
  candidateId?: string | null;
  createdAt?: number;
  startDate?: string | null;
  completionDate?: string | null;
}

export interface RequirementGroup {
  systemName: string;
  subsystemName: string;
  featureName: string;
  requirements: NebulaRequirement[];
}

// T25 3.2 (R-A-2026-08-15-008): runtime lookup > env > legacy localhost.
// The initial value is synchronous; the terrain lookup refines it once it
// returns (silent on failure), unless the user set an explicit override.
const { initial: BASE_URL, refine: refineBaseUrl } = resolveEndpoint(
  NEBULA_SRV_UNIT, NEBULA_SRV_ENV, NEBULA_SRV_LEGACY
);
const KANBAN_COLUMNS: RequirementStatus[] = ['Backlog', 'ToDo', 'InProgress', 'Active', 'Blocked', 'Done', 'Cancelled', 'Accepted'];

@Injectable({ providedIn: 'root' })
export class NebulaService {
  private http = inject(HttpClient);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Resolved base URL — starts at env/legacy, refined by terrain lookup. */
  private resolvedBaseUrl: string = BASE_URL;

  systems = signal<NebulaSystem[]>([]);
  requirements = signal<NebulaRequirement[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  connected = signal(false);

  readonly columns = KANBAN_COLUMNS;

  private nameCache: Map<string, string> = new Map();

  constructor() {
    // Non-blocking runtime lookup — refines the URL unless the user set an
    // explicit override in localStorage (refine() no-ops in that case).
    void refineBaseUrl().then((url) => {
      if (url) {
        this.resolvedBaseUrl = url;
      }
    });
  }

  private get baseUrl(): string {
    return this.resolvedBaseUrl;
  }

  startPolling(intervalMs = 30_000): void {
    if (this.pollTimer) return;
    this.loadAll();
    this.pollTimer = setInterval(() => this.loadAll(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [systems, reqs] = await Promise.all([
        this.fetchSystems(),
        this.fetchRequirements(),
      ]);
      this.systems.set(systems);
      this.requirements.set(reqs);
      this.buildNameCache(systems);
      this.connected.set(true);
    } catch (e) {
      this.error.set(`Nebula API unreachable: ${(e as Error).message}`);
      this.connected.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  private buildNameCache(systems: NebulaSystem[]): void {
    const cache = new Map<string, string>();
    for (const sys of systems) {
      cache.set(sys.id, sys.name);
      for (const sub of sys.subsystems) {
        cache.set(sub.id, sub.name);
        for (const feat of sub.features) {
          cache.set(feat.id, feat.name);
        }
      }
    }
    this.nameCache = cache;
  }

  async updateStatus(requirementId: string, newStatus: RequirementStatus): Promise<void> {
    const url = `${this.baseUrl}/api/requirements/${requirementId}`;
    try {
      await firstValueFrom(this.http.patch(url, { status: newStatus }));
      this.requirements.update((reqs) =>
        reqs.map((r) => (r.id === requirementId ? { ...r, status: newStatus } : r)),
      );
    } catch (e) {
      console.error('[NebulaService] Status update failed:', e);
      throw e;
    }
  }

  getRequirementsByStatus(status: RequirementStatus): NebulaRequirement[] {
    return this.requirements().filter((r) => r.status === status);
  }

  getName(id: string): string {
    return this.nameCache.get(id) ?? id.slice(0, 8);
  }

  getRequirementContext(req: NebulaRequirement): string {
    const parts: string[] = [];
    if (req.systemId) parts.push(this.getName(req.systemId));
    if (req.subsystemId) parts.push(this.getName(req.subsystemId));
    if (req.featureId) parts.push(this.getName(req.featureId));
    return parts.join(' › ');
  }

  private async fetchSystems(): Promise<NebulaSystem[]> {
    const data = await firstValueFrom(this.http.get<any>(`${this.baseUrl}/api/systems`));
    const list: any[] = Array.isArray(data) ? data : data?.systems ?? data?.data ?? [];
    return list.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      createdAt: s.createdAt ?? s.created_at,
      folders: s.folders,
      subsystems: (s.subsystems ?? []).map((sub: any) => ({
        id: sub.id,
        name: sub.name,
        description: sub.description,
        systemId: sub.systemId ?? sub.system_id,
        color: sub.color,
        createdAt: sub.createdAt ?? sub.created_at,
        features: (sub.features ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          subsystemId: f.subsystemId ?? f.subsystem_id,
          createdAt: f.createdAt ?? f.created_at,
        })),
      })),
    }));
  }

  private async fetchRequirements(): Promise<NebulaRequirement[]> {
    const data = await firstValueFrom(this.http.get<any>(`${this.baseUrl}/api/requirements?limit=500`));
    const list: any[] = Array.isArray(data) ? data : data?.requirements ?? data?.data ?? [];
    return list.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status as RequirementStatus,
      priority: r.priority,
      reqType: r.reqType ?? r.req_type,
      systemId: r.systemId ?? r.system_id,
      subsystemId: r.subsystemId ?? r.subsystem_id ?? null,
      featureId: r.featureId ?? r.feature_id ?? null,
      parentId: r.parentId ?? r.parent_id ?? null,
      acceptanceCriteria: r.acceptanceCriteria ?? r.acceptance_criteria ?? null,
      candidateId: r.candidateId ?? r.candidate_id ?? null,
      createdAt: r.createdAt ?? r.created_at,
      startDate: r.startDate ?? r.start_date ?? null,
      completionDate: r.completionDate ?? r.completion_date ?? null,
    }));
  }
}
