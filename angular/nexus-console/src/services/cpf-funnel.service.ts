import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface CpfCandidate {
  id: string;
  title: string;
  intent_description: string;
  status: string;
  compilation_readiness: number;
  completed: boolean;
  tags: string[];
  system_name: string;
  subsystem_name: string;
  dep_count: number;
  promotable: boolean;
}

export interface CpfCounts {
  total: number;
  ready: number;
  promoted: number;
  near_miss: number;
  low: number;
}

export interface CpfResponse {
  data?: CpfCandidate[];
  count?: number;
  error?: string;
}

const DEFAULT_API_URL = 'http://localhost:3108';

@Injectable({ providedIn: 'root' })
export class CpfFunnelService {
  private http = inject(HttpClient);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** All candidates fetched from API */
  candidates = signal<CpfCandidate[]>([]);
  /** Pre-computed counts by readiness band */
  counts = signal<CpfCounts | null>(null);
  /** Loading state */
  loading = signal(false);
  /** Error state */
  error = signal<string | null>(null);
  /** Whether the API is reachable */
  connected = signal(false);

  private apiUrl = DEFAULT_API_URL;

  setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  startPolling(intervalMs = 60_000): void {
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
      const [candidates, counts] = await Promise.all([
        this.fetchCandidates(),
        this.fetchCounts(),
      ]);
      this.candidates.set(candidates);
      this.counts.set(counts);
      this.connected.set(true);
    } catch (e) {
      this.error.set(`CPF API unreachable: ${(e as Error).message}`);
      this.connected.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  async promoteCandidate(candidateId: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{success?: boolean; error?: string; message?: string}>(
          `${this.apiUrl}/api/cpf/promote`,
          { candidate_id: candidateId }
        )
      );
      if (resp.error) {
        console.error('[CpfFunnelService] Promote failed:', resp.error);
        return false;
      }
      await this.loadAll(); // Refresh after promotion
      return true;
    } catch (e) {
      console.error('[CpfFunnelService] Promote failed:', e);
      return false;
    }
  }

  async fetchCandidates(threshold?: number): Promise<CpfCandidate[]> {
    let url = `${this.apiUrl}/api/cpf?all=1`;
    if (threshold != null) {
      url = `${this.apiUrl}/api/cpf?threshold=${threshold}`;
    }
    const resp = await firstValueFrom(this.http.get<CpfResponse>(url));
    if (resp.error) throw new Error(resp.error);
    return resp.data ?? [];
  }

  async fetchCounts(): Promise<CpfCounts> {
    const url = `${this.apiUrl}/api/cpf/count`;
    return firstValueFrom(this.http.get<CpfCounts>(url));
  }

  /** Get unique system names from candidates */
  getSystemNames(): string[] {
    const names = new Set<string>();
    for (const c of this.candidates()) {
      if (c.system_name && c.system_name !== '(none)') {
        names.add(c.system_name);
      }
    }
    return Array.from(names).sort();
  }

  /** Get candidate by ID */
  getCandidate(id: string): CpfCandidate | undefined {
    return this.candidates().find(c => c.id === id);
  }
}
