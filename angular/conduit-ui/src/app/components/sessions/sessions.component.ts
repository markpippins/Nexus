import { Component, signal, OnInit, OnDestroy, Inject, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { NgFor, NgIf, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ConduitService } from '../../services/conduit.service';
import { SessionLogEvent } from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';

interface SessionRow {
  id: string;
  agent_role: string;
  start_iso: string;
  end_iso: string | null;
  exit_code: number | null;
  retries_used: number;
  plans_processed: string;
  plan_count: number;
  pid: number | null;
  is_running: number;
  last_activity: string | null;
  model: string | null;
  fallback_used: number;
  cost_usd: number | null;
  created_at: string;
}

const SPLIT_STORAGE_KEY = 'sessions-log-split';
const DEFAULT_SPLIT = 0.333;
const MIN_SPLIT = 0.12;
const MAX_SPLIT = 0.65;

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, CurrencyPipe, FormsModule],
  template: `
    <div class="sessions-view" #container>
      <!-- Session history table -->
      <div class="sessions-table-area">
        <div class="table-header">
          <h3>Sessions</h3>
          <span class="session-count">{{ sessions().length }} total</span>
          <span class="session-cost-total" *ngIf="recentCost() !== null" [class.high]="(recentCost() ?? 0) > 10">
            💰 {{ recentCost() | currency:'USD' }} / 24h
          </span>
          <button class="btn-refresh" (click)="fetchSessions()" [disabled]="loading()">
            {{ loading() ? 'Loading...' : '↻ Refresh' }}
          </button>
        </div>

        <div class="table-wrap">
          <table *ngIf="sessions().length > 0; else emptyState">
            <thead>
              <tr>
                <th>Session</th>
                <th>Role</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Plans</th>
                <th>Exit</th>
                <th>Cost</th>
                <th>Retries</th>
                <th>Model</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let s of sessions()"
                [class.running]="s.is_running === 1"
                [class.fallback]="s.fallback_used === 1"
                [class.logged]="pipeline.sessionLogSessionId() === s.id"
                (click)="viewLog(s.id)"
                style="cursor:pointer"
              >
                <td class="cell-id" [title]="s.id">{{ shortId(s.id) }}</td>
                <td class="cell-role">{{ s.agent_role }}</td>
                <td class="cell-time">{{ s.start_iso | date:'MMM d, HH:mm' }}</td>
                <td class="cell-duration">{{ duration(s) }}</td>
                <td class="cell-plans">
                  <span class="plan-count-badge" *ngIf="s.plan_count > 0">
                    {{ s.plan_count }}
                  </span>
                  <span class="plan-ids" *ngIf="s.plan_count > 0" [title]="parsedPlans(s).join(', ')">
                    {{ parsedPlans(s).join(' ') }}
                  </span>
                  <span class="no-plans" *ngIf="s.plan_count === 0">—</span>
                </td>
                <td class="cell-exit">
                  <span class="exit-badge" [class.ok]="s.exit_code === 0" [class.fail]="s.exit_code !== 0 && s.exit_code !== null" [class.none]="s.exit_code === null">
                    {{ s.exit_code !== null ? s.exit_code : '—' }}
                  </span>
                </td>
                <td class="cell-cost">
                  <span class="cost-value" *ngIf="s.cost_usd !== null && s.cost_usd !== undefined" [class.high]="s.cost_usd > 1">
                    {{ s.cost_usd | currency:'USD':'symbol':'1.2-4' }}
                  </span>
                  <span class="no-cost" *ngIf="s.cost_usd === null || s.cost_usd === undefined">—</span>
                </td>
                <td class="cell-retries">{{ s.retries_used }}</td>
                <td class="cell-model" [title]="s.model || ''">
                  {{ shortModel(s.model) }}
                  <span class="fallback-tag" *ngIf="s.fallback_used === 1">FALLBACK</span>
                </td>
                <td class="cell-status">
                  <span class="status-badge" [class.running]="s.is_running === 1" [class.paused]="s.is_running === 2" [class.ended]="s.is_running === 0">
                    {{ statusLabel(s.is_running) }}
                  </span>
                </td>
                <td class="cell-actions" (click)="$event.stopPropagation()">
                  <button
                    class="btn-restart"
                    *ngIf="s.agent_role === 'builder' && s.is_running === 0 && s.plan_count > 0"
                    (click)="restartBuilderForSession(s)"
                    [disabled]="restartingPlans().has(parsedPlans(s)[0])"
                    title="Restart builder for this plan"
                  >
                    {{ restartingPlans().has(parsedPlans(s)[0]) ? '...' : '🔄' }}
                  </button>
                  <button
                    class="btn-kill"
                    *ngIf="s.is_running === 1"
                    (click)="killSession(s.id)"
                    [disabled]="killedSessions().has(s.id)"
                    title="Kill session (SIGKILL)"
                  >
                    {{ killedSessions().has(s.id) ? '...' : '⏻' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <ng-template #emptyState>
            <div class="empty-state">
              <span class="empty-icon">📊</span>
              <p>No sessions recorded yet.</p>
              <p class="empty-hint">Sessions are created when the builder processes plans.</p>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Resize drag handle -->
      <div
        class="resize-handle"
        [class.dragging]="isDragging()"
        (mousedown)="startResize($event)"
        title="Drag to resize log panel"
      >
        <span class="resize-grip">⋮</span>
      </div>

      <!-- Session log viewer -->
      <div class="session-log-area" [style.flex]="'0 0 ' + (splitRatio() * 100) + '%'">
        <!-- Breaker confirmation dialog (v074) -->
        <div class="breaker-confirm-overlay" *ngIf="showBreakerConfirm()" (click)="cancelBreakerRestart()">
          <div class="breaker-confirm-dialog" (click)="$event.stopPropagation()">
            <div class="breaker-confirm-icon">⚠️</div>
            <h4>Circuit Breaker Is Open</h4>
            <p>The circuit breaker is currently tripped, which means the system has detected API failures. Restarting the builder may fail or incur costs.</p>
            <p class="breaker-confirm-plan">Plan: <code>{{ pendingBreakerPlanId() }}</code></p>
            <div class="breaker-confirm-actions">
              <button class="btn-breaker-cancel" (click)="cancelBreakerRestart()">Cancel</button>
              <button class="btn-breaker-force" (click)="forceRestartBuilder()">🔄 Restart Anyway</button>
            </div>
          </div>
        </div>

        <!-- Log viewer header -->
        <div class="log-header">
          <div class="log-header-left">
            <span class="log-icon">📜</span>
            <select class="session-selector" [(ngModel)]="selectedSessionId" (ngModelChange)="viewLog($event)">
              <option value="">— Select a session —</option>
              <option *ngFor="let s of sessions()" [value]="s.id">
                {{ shortId(s.id) }} — {{ s.agent_role }} ({{ s.start_iso | date:'MMM d, HH:mm' }})
              </option>
            </select>
          </div>
          <div class="log-header-right">
            <span class="log-status" *ngIf="pipeline.sessionLogActive() && pipeline.sessionLogFileExists() !== false" [class.live]="true">● LIVE</span>
            <span class="log-status no-file" *ngIf="pipeline.sessionLogActive() && pipeline.sessionLogFileExists() === false">● no log file</span>
            <span class="log-status" *ngIf="!pipeline.sessionLogActive()">● disconnected</span>
            <span class="log-line-count">{{ pipeline.sessionLog().length }} lines</span>
            <button class="btn-log-clear" (click)="clearLog()" title="Clear log">✕</button>
          </div>
        </div>

        <!-- Terminal-like log output -->
        <div class="log-terminal" #logTerminal (scroll)="onLogScroll()"
          [class.empty]="pipeline.sessionLog().length === 0 && !pipeline.sessionLogActive()">
          <ng-container *ngIf="pipeline.sessionLogFileExists() === false && pipeline.sessionLog().length === 0; else logContent">
            <div class="log-placeholder-content">
              <span class="placeholder-icon">📭</span>
              <h4>No Log Available</h4>
              <p>This session was created before log streaming was deployed.</p>
              <p class="placeholder-hint">Future sessions will stream live output here.</p>
            </div>
          </ng-container>
          <ng-template #logContent>
            <ng-container *ngIf="pipeline.sessionLog().length > 0 || pipeline.sessionLogActive(); else logPlaceholder">
              <div
                class="log-line"
                *ngFor="let entry of pipeline.sessionLog(); trackBy: trackByTimestamp"
              >
                <span class="log-timestamp">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
                <span class="log-text" [innerHTML]="renderAnsi(entry.line)"></span>
              </div>
              <div class="log-spacer" *ngIf="pipeline.sessionLogActive()">
                <span class="cursor-blink">▊</span>
              </div>
            </ng-container>
            <ng-template #logPlaceholder>
              <div class="log-placeholder-content">
                <span class="placeholder-icon">📜</span>
                <h4>Session Log</h4>
                <p>Click a session row above to view its live output.</p>
                <p class="placeholder-hint">Real-time builder terminal output with ANSI color support.</p>
              </div>
            </ng-template>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [
    // Make the host element fill available space in the app shell's flex layout.
    // display:block (not flex) so .sessions-view naturally takes 100% width.
    `:host{display:block;flex:1;min-height:0}`,

    `.sessions-view{display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary)}`,

    // Top area: session table fills remaining space
    `.sessions-table-area{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}`,
    `.table-header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}`,
    `.table-header h3{margin:0;font-size:15px;color:var(--text-primary)}`,
    `.session-count{font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:2px 8px;border-radius:10px}`,
    `.session-cost-total{font-size:12px;font-weight:600;color:var(--tag-green-text);background:var(--tag-green-bg);padding:2px 8px;border-radius:10px}`,
    `.session-cost-total.high{color:var(--tag-red-text);background:var(--tag-red-bg)}`,
    `.btn-refresh{margin-left:auto;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:background .15s}`,
    `.btn-refresh:hover{background:var(--bg-tertiary)}`,
    `.btn-refresh:disabled{opacity:.5;cursor:not-allowed}`,

    `.table-wrap{flex:1;overflow:auto}`,
    `table{width:100%;border-collapse:collapse;font-size:12px}`,
    `thead{position:sticky;top:0;z-index:1;background:var(--bg-secondary)}`,
    `th{padding:8px 10px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:2px solid var(--border-default);white-space:nowrap}`,
    `td{padding:7px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-primary);white-space:nowrap}`,
    `tr:hover td{background:var(--bg-secondary)}`,
    `tr.running td{background:var(--tag-green-bg, #f0fdf4)}`,
    `tr.fallback td{background:var(--tag-amber-bg, #fffbeb)}`,
    `tr.logged td{background:var(--accent-blue-bg);border-left:3px solid var(--accent-blue-text)}`,

    `.cell-id{font-family:monospace;font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis}`,
    `.cell-role{text-transform:capitalize;font-size:11px}`,
    `.cell-time{font-size:11px;color:var(--text-muted)}`,
    `.cell-duration{font-size:11px;color:var(--text-muted);font-family:monospace}`,
    `.cell-plans{font-size:11px}`,
    `.plan-count-badge{background:var(--accent-blue-bg);color:var(--accent-blue-text);padding:1px 6px;border-radius:8px;font-size:11px;font-weight:600;margin-right:4px}`,
    `.plan-ids{font-family:monospace;font-size:10px;color:var(--text-muted)}`,
    `.no-plans{color:var(--text-muted)}`,
    `.cell-exit{text-align:center}`,
    `.cell-cost{font-family:monospace;font-size:11px;text-align:right}`,
    `.cost-value{color:var(--tag-green-text)}`,
    `.cost-value.high{color:var(--tag-red-text);font-weight:600}`,
    `.no-cost{color:var(--text-muted)}`,
    `.exit-badge{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;font-family:monospace}`,
    `.exit-badge.ok{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.exit-badge.fail{background:var(--tag-red-bg);color:var(--tag-red-text)}`,
    `.exit-badge.none{background:var(--bg-secondary);color:var(--text-muted)}`,
    `.cell-retries{text-align:center;font-family:monospace}`,
    `.cell-model{max-width:140px;overflow:hidden;text-overflow:ellipsis;font-size:10px}`,
    `.fallback-tag{display:inline-block;background:var(--tag-amber-bg);color:var(--tag-amber-text);padding:1px 4px;border-radius:3px;font-size:9px;margin-left:4px;vertical-align:middle;text-transform:uppercase;letter-spacing:.5px}`,

    `.status-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}`,
    `.status-badge.running{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.status-badge.paused{background:var(--tag-amber-bg);color:var(--tag-amber-text)}`,
    `.status-badge.ended{background:var(--bg-secondary);color:var(--text-muted)}`,

    // Kill / restart buttons in session actions column
    `.cell-actions{text-align:center;width:72px;padding:4px;display:flex;gap:4px;justify-content:center}`,
    `.btn-kill{background:none;border:1px solid var(--tag-red-text);color:var(--tag-red-text);border-radius:4px;font-size:14px;cursor:pointer;padding:2px 6px;line-height:1;opacity:.6;transition:all .15s}`,
    `.btn-kill:hover{opacity:1;background:var(--tag-red-bg);transform:scale(1.1)}`,
    `.btn-kill:disabled{opacity:.3;cursor:not-allowed;transform:none}`,

    // Restart button (v074 — restart builder for a plan)
    `.btn-restart{background:none;border:1px solid var(--accent-blue-text);color:var(--accent-blue-text);border-radius:4px;font-size:12px;cursor:pointer;padding:2px 6px;line-height:1;opacity:.6;transition:all .15s}`,
    `.btn-restart:hover{opacity:1;background:var(--accent-blue-bg);transform:scale(1.1)}`,
    `.btn-restart:disabled{opacity:.3;cursor:not-allowed;transform:none}`,

    `.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;color:var(--text-muted)}`,
    `.empty-icon{font-size:36px;margin-bottom:8px;opacity:.5}`,
    `.empty-state p{margin:2px 0;font-size:13px}`,
    `.empty-hint{font-size:11px;opacity:.7}`,

    // Breaker confirmation dialog (v074)
    `.breaker-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;animation:fadeIn .15s}`,
    `@keyframes fadeIn{from{opacity:0}to{opacity:1}}`,
    `.breaker-confirm-dialog{background:var(--bg-primary);border:1px solid var(--border-default);border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);animation:slideUp .2s}`,
    `@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`,
    `.breaker-confirm-icon{font-size:32px;text-align:center;margin-bottom:8px}`,
    `.breaker-confirm-dialog h4{margin:0 0 8px;font-size:16px;color:var(--text-primary);text-align:center}`,
    `.breaker-confirm-dialog p{margin:0 0 12px;font-size:13px;color:var(--text-muted);text-align:center;line-height:1.5}`,
    `.breaker-confirm-plan{font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:16px}`,
    `.breaker-confirm-plan code{background:var(--bg-secondary);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:11px}`,
    `.breaker-confirm-actions{display:flex;gap:8px;justify-content:center}`,
    `.btn-breaker-cancel{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s}`,
    `.btn-breaker-cancel:hover{background:var(--bg-tertiary)}`,
    `.btn-breaker-force{background:var(--tag-amber-bg);color:var(--tag-amber-text);border:1px solid var(--tag-amber-text);padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;transition:all .15s}`,
    `.btn-breaker-force:hover{background:var(--tag-amber-text);color:var(--bg-primary)}`,

    // Resize drag handle
    `.resize-handle{flex-shrink:0;height:8px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;background:var(--border-subtle);border-top:1px solid var(--border-default);border-bottom:1px solid var(--border-default);transition:background .15s;user-select:none}`,
    `.resize-handle:hover{background:var(--accent-blue-bg)}`,
    `.resize-handle.dragging{background:var(--accent-blue-bg);cursor:ns-resize}`,
    `.resize-grip{font-size:10px;color:var(--text-muted);line-height:1;pointer-events:none;opacity:.5}`,
    `.resize-handle:hover .resize-grip{opacity:1;color:var(--accent-blue-text)}`,

    // Session log viewer (dynamic size via [style.flex])
    `.session-log-area{display:flex;flex-direction:column;min-height:0;background:var(--bg-tertiary, #1a1a2e)}`,

    // Log header
    `.log-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-subtle);flex-shrink:0;gap:8px}`,
    `.log-header-left{display:flex;align-items:center;gap:8px;min-width:0}`,
    `.log-icon{font-size:14px}`,
    `.session-selector{background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;max-width:280px;cursor:pointer}`,
    `.session-selector:focus{outline:none;border-color:var(--accent-blue-text)}`,
    `.log-header-right{display:flex;align-items:center;gap:10px;flex-shrink:0}`,
    `.log-status{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}`,
    `.log-status.live{color:var(--tag-green-text);animation:pulse 2s infinite}`,
    `.log-status.no-file{color:var(--tag-amber-text)}`,
    `@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`,
    `.log-line-count{font-size:10px;color:var(--text-muted);font-family:monospace}`,
    `.btn-log-clear{background:none;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;padding:0 4px;line-height:1;opacity:.6;transition:opacity .15s}`,
    `.btn-log-clear:hover{opacity:1;color:var(--tag-red-text)}`,

    // Terminal output
    `.log-terminal{flex:1;overflow-y:auto;padding:8px 0;font-family:'Fira Code','Cascadia Code','JetBrains Mono','Consolas',monospace;font-size:12px;line-height:1.55;color:#c9d1d9;background:#0d1117;min-height:0}`,
    `.log-terminal.empty{display:flex;align-items:center;justify-content:center}`,
    `.log-line{display:flex;padding:0 12px;min-height:1.55em;transition:background .1s}`,
    `.log-line:hover{background:rgba(255,255,255,.03)}`,
    `.log-timestamp{flex-shrink:0;color:#484f58;margin-right:10px;font-size:11px;user-select:none}`,
    `.log-text{white-space:pre-wrap;word-break:break-all;flex:1}`,

    // ANSI color classes
    `.log-text ::ng-deep .ansi-30{color:#484f58}`,
    `.log-text ::ng-deep .ansi-31{color:#f85149}`,
    `.log-text ::ng-deep .ansi-32{color:#3fb950}`,
    `.log-text ::ng-deep .ansi-33{color:#d29922}`,
    `.log-text ::ng-deep .ansi-34{color:#58a6ff}`,
    `.log-text ::ng-deep .ansi-35{color:#bc8cff}`,
    `.log-text ::ng-deep .ansi-36{color:#39c5cf}`,
    `.log-text ::ng-deep .ansi-37{color:#c9d1d9}`,
    `.log-text ::ng-deep .ansi-90{color:#6e7681}`,
    `.log-text ::ng-deep .ansi-91{color:#ff7b72}`,
    `.log-text ::ng-deep .ansi-92{color:#56d364}`,
    `.log-text ::ng-deep .ansi-93{color:#e3b341}`,
    `.log-text ::ng-deep .ansi-94{color:#79c0ff}`,
    `.log-text ::ng-deep .ansi-95{color:#d2a8ff}`,
    `.log-text ::ng-deep .ansi-96{color:#56d4dd}`,
    `.log-text ::ng-deep .ansi-97{color:#f0f6fc}`,
    `.log-text ::ng-deep .ansi-1{font-weight:700}`,
    `.log-text ::ng-deep .ansi-3{font-style:italic}`,
    `.log-text ::ng-deep .ansi-4{text-decoration:underline}`,

    // Spacer with blinking cursor
    `.log-spacer{display:flex;align-items:center;padding:0 12px;height:1.55em}`,
    `.cursor-blink{color:var(--accent-blue-text);animation:blink 1s step-end infinite}`,
    `@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`,

    // Placeholder
    `.log-placeholder-content{text-align:center;padding:24px;color:var(--text-muted)}`,
    `.placeholder-icon{font-size:32px;display:block;margin-bottom:8px;opacity:.4}`,
    `.log-placeholder-content h4{margin:0 0 4px;font-size:13px;color:#8b949e}`,
    `.log-placeholder-content p{margin:2px 0;font-size:11px;color:#484f58}`,
    `.placeholder-hint{font-style:italic}`,

    `@media(max-width:768px){.cell-cost{display:none}th:nth-child(7){display:none}.cell-model{display:none}th:nth-child(9){display:none}.cell-duration{display:none}th:nth-child(4){display:none}}`,
    `@media(max-width:480px){.cell-retries{display:none}th:nth-child(8){display:none}.cell-role{display:none}th:nth-child(2){display:none}}`,
  ],
})
export class SessionsComponent implements OnInit, OnDestroy {
  sessions = signal<SessionRow[]>([]);
  loading = signal(false);
  selectedSessionId = signal<string>('');

  @ViewChild('logTerminal') logTerminal!: ElementRef;
  @ViewChild('container') container!: ElementRef<HTMLElement>;
  private autoScroll = true;
  private autoScrollThreshold = 50;

  killedSessions = signal<Set<string>>(new Set());

  // Restart builder state (v074)
  readonly restartingPlans = signal<Set<string>>(new Set());
  readonly showBreakerConfirm = signal(false);
  readonly pendingBreakerPlanId = signal<string>('');

  // Resize state
  readonly splitRatio = signal(this.loadSplitRatio());
  readonly isDragging = signal(false);

  constructor(
    private http: HttpClient,
    public pipeline: ConduitService,
    @Inject(API_BASE_URL) private api: string,
  ) {}

  ngOnInit(): void {
    this.fetchSessions();
  }

  ngOnDestroy(): void {
    this.pipeline.unsubscribeSessionLog();
  }

  // ── Resize drag handle ────────────────────────────────────────────

  private loadSplitRatio(): number {
    try {
      const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= MIN_SPLIT && parsed <= MAX_SPLIT) return parsed;
      }
    } catch { /* localStorage unavailable */ }
    return DEFAULT_SPLIT;
  }

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  @HostListener('window:mousemove', ['$event'])
  onDragMove(event: MouseEvent): void {
    if (!this.isDragging() || !this.container) return;

    const rect = this.container.nativeElement.getBoundingClientRect();
    const mouseY = event.clientY;
    const tableFraction = (mouseY - rect.top) / rect.height;
    const logFraction = 1 - tableFraction;

    const clamped = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, logFraction));
    this.splitRatio.set(clamped);
  }

  @HostListener('window:mouseup')
  onDragEnd(): void {
    if (!this.isDragging()) return;
    this.isDragging.set(false);
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, this.splitRatio().toFixed(4));
    } catch { /* localStorage unavailable */ }
  }

  // ── Scroll behavior ───────────────────────────────────────────────

  ngAfterViewChecked(): void {
    if (this.autoScroll && this.logTerminal) {
      const el = this.logTerminal.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  onLogScroll(): void {
    if (!this.logTerminal) return;
    const el = this.logTerminal.nativeElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.autoScroll = distanceFromBottom < this.autoScrollThreshold;
  }

  // ── Data ──────────────────────────────────────────────────────────

  fetchSessions(): void {
    this.loading.set(true);
    this.http.get<SessionRow[]>(`${this.api}/sessions`).subscribe({
      next: (data) => {
        this.sessions.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.sessions.set([]);
      },
    });
  }

  viewLog(sessionId: string): void {
    if (!sessionId) return;
    this.selectedSessionId.set(sessionId);
    this.pipeline.subscribeToSessionLog(sessionId);
    this.autoScroll = true;
  }

  killSession(sessionId: string): void {
    this.killedSessions.update(s => { const ns = new Set(s); ns.add(sessionId); return ns; });
    this.pipeline.killSession(sessionId).subscribe({
      next: (result) => {
        console.log(`Session ${sessionId} killed:`, result);
        this.fetchSessions();
        this.killedSessions.update(s => { const ns = new Set(s); ns.delete(sessionId); return ns; });
      },
      error: (err) => {
        console.error(`Failed to kill session ${sessionId}:`, err);
        this.killedSessions.update(s => { const ns = new Set(s); ns.delete(sessionId); return ns; });
      },
    });
  }

  clearLog(): void {
    this.pipeline.unsubscribeSessionLog();
    this.pipeline.sessionLog.set([]);
    this.selectedSessionId.set('');
  }

  // ── Restart builder (v074) ────────────────────────────────────────

  /** Get the first plan ID from a session. Returns empty string if none. */
  private firstPlanId(s: SessionRow): string {
    try {
      const plans: string[] = JSON.parse(s.plans_processed);
      return plans[0] || '';
    } catch {
      return '';
    }
  }

  restartBuilderForSession(s: SessionRow): void {
    const planId = this.firstPlanId(s);
    if (!planId) return;

    this.restartingPlans.update(set => { const ns = new Set(set); ns.add(planId); return ns; });

    this.pipeline.restartBuilder(planId, false).subscribe({
      next: (result) => {
        this.restartingPlans.update(set => { const ns = new Set(set); ns.delete(planId); return ns; });

        if (result.blocked) {
          this.pendingBreakerPlanId.set(planId);
          this.showBreakerConfirm.set(true);
        } else if (result.restarted) {
          console.log(`Builder restarted for plan ${planId}`);
          this.fetchSessions();
        }
      },
      error: (err) => {
        console.error(`Failed to restart builder for plan ${planId}:`, err);
        this.restartingPlans.update(set => { const ns = new Set(set); ns.delete(planId); return ns; });
      },
    });
  }

  forceRestartBuilder(): void {
    const planId = this.pendingBreakerPlanId();
    if (!planId) return;

    this.showBreakerConfirm.set(false);
    this.restartingPlans.update(set => { const ns = new Set(set); ns.add(planId); return ns; });

    this.pipeline.restartBuilder(planId, true).subscribe({
      next: (result) => {
        this.restartingPlans.update(set => { const ns = new Set(set); ns.delete(planId); return ns; });
        if (result.restarted) {
          console.log(`Builder force-restarted for plan ${planId}`);
          this.fetchSessions();
        }
      },
      error: (err) => {
        console.error(`Failed to force-restart builder for plan ${planId}:`, err);
        this.restartingPlans.update(set => { const ns = new Set(set); ns.delete(planId); return ns; });
      },
    });
  }

  cancelBreakerRestart(): void {
    this.showBreakerConfirm.set(false);
    this.pendingBreakerPlanId.set('');
  }

  /** Render ANSI escape codes as styled HTML spans */
  renderAnsi(line: string): string {
    if (!line) return '';

    let escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const ansiRegex = /\x1b\[([0-9;]*)m/g;

    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ansiRegex.exec(escaped)) !== null) {
      result += escaped.slice(lastIndex, match.index);
      lastIndex = match.index + match[0].length;

      const codes = match[1] ? match[1].split(';').map(Number) : [0];
      const classes: string[] = [];
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
          result += '</span>'.repeat(classes.length);
          classes.length = 0;
          continue;
        }
        if (code >= 30 && code <= 37) {
          classes.push(`ansi-${code}`);
        } else if (code >= 90 && code <= 97) {
          classes.push(`ansi-${code}`);
        } else if (code === 1) {
          classes.push('ansi-1');
        } else if (code === 3) {
          classes.push('ansi-3');
        } else if (code === 4) {
          classes.push('ansi-4');
        }
      }

      if (classes.length > 0) {
        result += `<span class="${classes.join(' ')}">`;
      }
    }

    result += escaped.slice(lastIndex);

    const spanCloses = (result.match(/<span class="/g) || []).length - (result.match(/<\/span>/g) || []).length;
    if (spanCloses > 0) {
      result += '</span>'.repeat(spanCloses);
    }

    return result;
  }

  trackByTimestamp(index: number, _entry: SessionLogEvent): number {
    return index;
  }

  // ── Display helpers ───────────────────────────────────────────────

  shortId(id: string): string {
    const parts = id.split('-');
    if (parts.length >= 3) return parts[parts.length - 1];
    return id.length > 16 ? '...' + id.slice(-12) : id;
  }

  shortModel(model: string | null): string {
    if (!model) return '—';
    const parts = model.split('/');
    return parts[parts.length - 1] || model;
  }

  duration(s: SessionRow): string {
    if (!s.end_iso || !s.start_iso) return '—';
    try {
      const start = new Date(s.start_iso).getTime();
      const end = new Date(s.end_iso).getTime();
      const diff = Math.max(0, Math.round((end - start) / 1000));
      if (diff < 60) return `${diff}s`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      return `${h}h ${m}m`;
    } catch {
      return '—';
    }
  }

  parsedPlans(s: SessionRow): string[] {
    try {
      return JSON.parse(s.plans_processed);
    } catch {
      return [];
    }
  }

  statusLabel(isRunning: number): string {
    switch (isRunning) {
      case 1: return 'Running';
      case 2: return 'Paused';
      default: return 'Ended';
    }
  }

  recentCost(): number | null {
    const sessions = this.sessions();
    for (const s of sessions) {
      if (s.cost_usd !== null && s.cost_usd !== undefined) {
        return s.cost_usd;
      }
    }
    return null;
  }
}
