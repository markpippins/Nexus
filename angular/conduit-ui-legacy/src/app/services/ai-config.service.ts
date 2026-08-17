import { Injectable, signal, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, concat, EMPTY } from 'rxjs';
import { last, map } from 'rxjs/operators';
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

/** A single role→model assignment with priority (v093).
 *  v098: Added provider_id and harness_id so each fallback model
 *  can use a different provider/harness than the role's primary. */
export interface AIRoleModel {
  id: string;
  role: string;
  model_id: string;
  priority: number;
  provider_id: string | null;
  harness_id: string | null;
}

export interface ConfigValidationWarning {
  role: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export type LogLevel = 'NONE' | 'ERROR' | 'INFO' | 'DEBUG';

export interface LogSettings {
  messageBoxLogLevel: LogLevel;
  promptLogLevel: LogLevel;
}

export interface TestInvokeResponse {
  started: boolean;
  sessionId: string;
  model_id: string;
  model_name: string;
  model_identifier: string;
  harness: string;
  logPath: string;
  timestamp: string;
}

export interface FailureRecoveryConfig {
  max_retries_per_model: number;
  retry_delay_seconds: number;
  max_fallbacks: number;
  push_back_to_pending: boolean;
  circuit_breaker_retry_after: number;
}

export interface AIConfigSnapshot {
  providers: AIProvider[];
  harnesses: AIHarness[];
  models: AIModel[];
  roles: AIRoleConfig[];
  role_models: AIRoleModel[];
}

@Injectable({ providedIn: 'root' })
export class AIConfigService {
  readonly config = signal<AIConfigSnapshot>({ providers: [], harnesses: [], models: [], roles: [], role_models: [] });
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

  /** Fetch all known role names (tackle-srv GET /roles) — drives the
   *  AI-config dialog's dynamic role list (Gap 5: was hardcoded to
   *  planner/builder/reviewer/critic, so new roles never appeared). */
  fetchRoles(): Observable<string[]> {
    return this.http.get<{ roles: { name: string }[] }>(`${this.api}/roles`).pipe(
      map(r => (r.roles ?? []).map(x => x.name)),
    );
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

  /** Save multiple role configs sequentially.  Returns an Observable that
   *  completes when the last save finishes so callers can chain toast/fetch.
   *  Does NOT re-fetch the config after save — the re-render caused by
   *  `config.set(data)` destroys `<option>` elements in the select dropdowns,
   *  causing ngModel to lose track of selected values and resetting all controls.
   *  The caller must call fetch() manually after subscribe. */
  saveRolesBatch(roles: Omit<AIRoleConfig, 'created_at' | 'updated_at'>[]): Observable<unknown> {
    if (roles.length === 0) return EMPTY;

    for (const rc of roles) {
      this._setSaving(rc.id, true);
    }

    const requests$ = roles.map(rc =>
      this.http.post<{ saved: boolean }>(`${this.api}/config/ai/role`, rc)
    );

    return concat(...requests$).pipe(
      last(),
      tap({
        next: () => {
          for (const rc of roles) {
            this._setSaving(rc.id, false);
          }
        },
        error: () => {
          for (const rc of roles) {
            this._setSaving(rc.id, false);
          }
        },
      }),
    );
  }

  /** Invoke a model with a test prompt and return the session ID for realtime log streaming. */
  testInvoke(modelId: string, testPrompt: string): Observable<TestInvokeResponse> {
    return this.http.post<TestInvokeResponse>(`${this.api}/config/ai/test`, { model_id: modelId, test_prompt: testPrompt });
  }

  /** Cancel a running test-invoke session by killing the process. */
  cancelTestInvoke(sessionId: string): Observable<any> {
    return this.http.post(`${this.api}/sessions/${sessionId}/kill`, {});
  }

  /** Fetch failure recovery configuration. */
  getFailureRecoveryConfig(): Observable<FailureRecoveryConfig> {
    return this.http.get<FailureRecoveryConfig>(`${this.api}/config/failure-recovery`);
  }

  /** Validate AI config: checks harness binaries, model references, etc. */
  validateConfig(): Observable<{ valid: boolean; warnings: ConfigValidationWarning[] }> {
    return this.http.get<{ valid: boolean; warnings: ConfigValidationWarning[] }>(
      `${this.api}/config/ai/validate`
    );
  }

  /** Save failure recovery configuration. */
  saveFailureRecoveryConfig(cfg: FailureRecoveryConfig): Observable<{ saved: boolean }> {
    return this.http.post<{ saved: boolean }>(`${this.api}/config/failure-recovery`, cfg);
  }

  /** Import a full AI config snapshot — replaces all existing data. */
  importConfig(data: AIConfigSnapshot): Observable<{ imported: boolean; providers: number; harnesses: number; models: number; roles: number; role_models: number }> {
    return this.http.post<{ imported: boolean; providers: number; harnesses: number; models: number; roles: number; role_models: number }>(`${this.api}/config/ai/import`, data);
  }

  /** Export the current config as a downloadable JSON file. */
  exportConfig(): void {
    const data = this.config();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conduit-ai-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
