import { Injectable, signal, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api-config';

export interface AIProvider {
  id: string;
  name: string;
  type: string;
  endpoint_url: string | null;
  api_key: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface AIHarness {
  id: string;
  name: string;
  invocation_semantics: string;
  created_at: string;
  updated_at: string;
}

export interface AIModel {
  id: string;
  name: string;
  harness_id: string;
  provider_id: string | null;
  model_identifier: string;
  created_at: string;
  updated_at: string;
}

export interface AIRoleConfig {
  id: string;
  role: string;
  provider_id: string;
  harness_id: string;
  model_id: string;
  extra_params: string;
  created_at: string;
  updated_at: string;
}

export type LogLevel = 'NONE' | 'ERROR' | 'INFO' | 'DEBUG';

export interface LogSettings {
  messageBoxLogLevel: LogLevel;
  promptLogLevel: LogLevel;
}

export interface AIConfigSnapshot {
  providers: AIProvider[];
  harnesses: AIHarness[];
  models: AIModel[];
  roles: AIRoleConfig[];
}

@Injectable({ providedIn: 'root' })
export class AIConfigService {
  readonly config = signal<AIConfigSnapshot>({ providers: [], harnesses: [], models: [], roles: [] });
  readonly loading = signal(false);
  readonly saving = signal<Record<string, boolean>>({});

  readonly logSettings = signal<LogSettings>({ messageBoxLogLevel: 'NONE', promptLogLevel: 'INFO' });
  private readonly LS_LOG_KEY = 'opencode-conduit-log-settings';

  constructor(private http: HttpClient, @Inject(API_BASE_URL) private api: string) {
    this._loadLogSettings();
  }

  saveLogSettings(s: LogSettings): void {
    this.logSettings.set(s);
    try {
      localStorage.setItem(this.LS_LOG_KEY, JSON.stringify(s));
    } catch { /* storage unavailable */ }
  }

  private _loadLogSettings(): void {
    try {
      const raw = localStorage.getItem(this.LS_LOG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LogSettings;
        if (parsed.messageBoxLogLevel && parsed.promptLogLevel) {
          this.logSettings.set(parsed);
        }
      }
    } catch { /* ignore */ }
  }

  /** Fetch the full AI config snapshot. */
  fetch(): Observable<AIConfigSnapshot> {
    this.loading.set(true);
    return this.http.get<AIConfigSnapshot>(`${this.api}/config/ai`).pipe(
      tap({
        next: (data) => {
          this.config.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      }),
    );
  }

  /** Save (upsert) a provider. */
  saveProvider(p: Omit<AIProvider, 'created_at' | 'updated_at'>): void {
    this._setSaving(p.id, true);
    this.http.post<{ saved: boolean; id: string }>(`${this.api}/config/ai/provider`, p).subscribe({
      next: () => { this._setSaving(p.id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(p.id, false),
    });
  }

  /** Delete a provider. */
  deleteProvider(id: string): void {
    this._setSaving(id, true);
    this.http.delete<{ deleted: boolean }>(`${this.api}/config/ai/provider/${id}`).subscribe({
      next: () => { this._setSaving(id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(id, false),
    });
  }

  /** Save (upsert) a harness. */
  saveHarness(h: Omit<AIHarness, 'created_at' | 'updated_at'>): void {
    this._setSaving(h.id, true);
    this.http.post<{ saved: boolean }>(`${this.api}/config/ai/harness`, h).subscribe({
      next: () => { this._setSaving(h.id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(h.id, false),
    });
  }

  /** Delete a harness. */
  deleteHarness(id: string): void {
    this._setSaving(id, true);
    this.http.delete<{ deleted: boolean }>(`${this.api}/config/ai/harness/${id}`).subscribe({
      next: () => { this._setSaving(id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(id, false),
    });
  }

  /** Save (upsert) a model. */
  saveModel(m: Omit<AIModel, 'created_at' | 'updated_at'>): void {
    this._setSaving(m.id, true);
    this.http.post<{ saved: boolean }>(`${this.api}/config/ai/model`, m).subscribe({
      next: () => { this._setSaving(m.id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(m.id, false),
    });
  }

  /** Delete a model. */
  deleteModel(id: string): void {
    this._setSaving(id, true);
    this.http.delete<{ deleted: boolean }>(`${this.api}/config/ai/model/${id}`).subscribe({
      next: () => { this._setSaving(id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(id, false),
    });
  }

  /** Save (upsert) a role config. */
  saveRoleConfig(rc: Omit<AIRoleConfig, 'created_at' | 'updated_at'>): void {
    this._setSaving(rc.id, true);
    this.http.post<{ saved: boolean }>(`${this.api}/config/ai/role`, rc).subscribe({
      next: () => { this._setSaving(rc.id, false); this.fetch().subscribe(); },
      error: () => this._setSaving(rc.id, false),
    });
  }

  /** Seed default provider/harness/model/config if table is empty. Pass force=true to re-seed even when tables are populated. */
  readonly seeding = signal(false);
  seedDefaults(force = false): void {
    this.seeding.set(true);
    this.http.post<{ seeded: boolean; message: string }>(`${this.api}/config/ai/seed-defaults`, { force }).subscribe({
      next: (result) => {
        this.seeding.set(false);
        this.fetch().subscribe();
        console.log('[ai-config] Seed defaults:', result.message);
      },
      error: () => { this.seeding.set(false); },
    });
  }

  private _setSaving(key: string, v: boolean): void {
    this.saving.update(s => {
      const ns = { ...s };
      if (v) ns[key] = true; else delete ns[key];
      return ns;
    });
  }
}
