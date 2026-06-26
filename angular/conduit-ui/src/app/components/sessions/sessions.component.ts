import { Component, signal, computed, effect, OnInit, OnDestroy, Inject, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { NgFor, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ConduitService } from '../../services/conduit.service';
import { SessionLogEvent } from '../../services/types';
import { ToastService } from '../../services/toast.service';
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
  workflow_id: string | null;
  run_id: string | null;
  workflow_start_time: string | null;
  workflow_close_time: string | null;
  workflow_run_time_ms: number | null;
  workflow_result: string | null;
  created_at: string;
}

interface RunAnalytics {
  /** Time between consecutive session starts, in minutes. */
  avgGapMinutes: number;
  medianGapMinutes: number;
  minGapMinutes: number;
  maxGapMinutes: number;
  /** Session count used for gap calculations. */
  sessionCount: number;
  /** Hour of day (0-23) → session start count. */
  hourlyDistribution: number[];
  /** Day of week (Mon=0..Sun=6) → session start count. */
  dailyDistribution: number[];
}

const SPLIT_STORAGE_KEY = 'sessions-log-split';
const DEFAULT_SPLIT = 0.333;
const MIN_SPLIT = 0.12;
const MAX_SPLIT = 0.65;

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [NgFor, DatePipe, CurrencyPipe, FormsModule],
  template: `
    <div class="sessions-view" #container>
      <!-- Session history table -->
      <div class="sessions-table-area">
        <div class="table-header">
          <h3>Sessions</h3>
          <span class="session-count">{{ sessions().length }} total</span>
          @if (recentCost() !== null) {
            <span class="session-cost-total" [class.high]="(recentCost() ?? 0) > 10">
            💰 {{ recentCost() | currency:'USD' }} / 24h
          </span>
          }
          @if (schedulerLabel()) {
            <span class="next-run-chip" [class.pulse-green]="pulseGreen()">
            ⏱️ <span class="next-run-value">{{ schedulerLabel() }}</span>
            <span class="next-run-label">Temporal Scheduler</span>
            <a class="temporal-link" href="http://localhost:8233/namespaces/conduit/workflows" target="_blank" rel="noopener noreferrer" title="Open Temporal Web UI — workflow history">↗</a>
          </span>
          }
          @if (pipeline.circuitBreaker().tripped) {
            <span class="next-run-chip next-run-paused">
            ⛔ <span class="next-run-value">Paused</span>
            <span class="next-run-label">circuit breaker tripped</span>
          </span>
          }
          <button class="btn-refresh" (click)="fetchSessions()" [disabled]="loading()">
            {{ loading() ? 'Loading...' : '↻ Refresh' }}
          </button>
        </div>

        <!-- Analytics panel -->
        <div class="analytics-area">
          <button class="analytics-toggle" (click)="toggleAnalytics()">
            <span class="analytics-toggle-icon">{{ showAnalytics() ? '▾' : '▸' }}</span>
            📊 Analytics
            @if (analytics(); as a) {
              <span class="analytics-badge">
                {{ a.sessionCount }} sessions
              </span>
            }
          </button>
          @if (showAnalytics()) {
            <div class="analytics-panel" [class.visible]="showAnalytics()">
            @if (analytics(); as a) {
              
              <!-- Summary stats -->
              <div class="analytics-summary">
                <div class="analytics-stat">
                  <span class="stat-value">{{ formatDuration(a.avgGapMinutes) }}</span>
                  <span class="stat-label">avg gap</span>
                </div>
                <div class="analytics-stat">
                  <span class="stat-value">{{ formatDuration(a.medianGapMinutes) }}</span>
                  <span class="stat-label">median</span>
                </div>
                <div class="analytics-stat">
                  <span class="stat-value">{{ formatDuration(a.minGapMinutes) }}</span>
                  <span class="stat-label">min</span>
                </div>
                <div class="analytics-stat">
                  <span class="stat-value">{{ formatDuration(a.maxGapMinutes) }}</span>
                  <span class="stat-label">max</span>
                </div>
              </div>

              <!-- Hourly distribution bar chart -->
              <div class="analytics-chart-section">
                <div class="chart-title">Sessions by hour of day</div>
                <div class="bar-chart">
                  <div class="bar-row" *ngFor="let count of a.hourlyDistribution; let hour = index">
                    <span class="bar-label">{{ hour.toString().padStart(2, '0') }}</span>
                    <span class="bar-track">
                      <span
                        class="bar-fill"
                        [style.width.%]="barPercent(count, a.hourlyDistribution)"
                        [style.background]="barColor(hour, 23)">
                      </span>
                    </span>
                    <span class="bar-count">{{ count }}</span>
                  </div>
                </div>
              </div>

              <!-- Daily distribution bar chart -->
              <div class="analytics-chart-section">
                <div class="chart-title">Sessions by day of week</div>
                <div class="bar-chart bar-chart-daily">
                  <div class="bar-row" *ngFor="let count of a.dailyDistribution; let day = index">
                    <span class="bar-label">{{ dayLabel(day) }}</span>
                    <span class="bar-track">
                      <span
                        class="bar-fill"
                        [style.width.%]="barPercent(count, a.dailyDistribution)"
                        [style.background]="barColor(day, 6)">
                      </span>
                    </span>
                    <span class="bar-count">{{ count }}</span>
                  </div>
                </div>
              </div>
            } @else {
              <div class="analytics-empty">
                <p>Not enough session data to compute analytics.</p>
                <p class="analytics-empty-hint">At least 2 sessions are needed for gap analysis.</p>
              </div>
            }
          </div>
          }
        </div>

        <div class="table-wrap">
          @if (sessions().length > 0) {
            <table>
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
                <th>Workflow</th>
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
                  @if (s.plan_count > 0) {
                    <span class="plan-count-badge">
                      {{ s.plan_count }}
                    </span>
                    <span class="plan-ids" [title]="parsedPlans(s).join(', ')">
                    {{ parsedPlans(s).join(' ') }}
                  </span>
                  }
                  @if (s.plan_count === 0) {
                    <span class="no-plans">—</span>
                  }
                </td>
                <td class="cell-exit">
                  <span class="exit-badge" [class.ok]="s.exit_code === 0" [class.fail]="s.exit_code !== 0 && s.exit_code !== null" [class.none]="s.exit_code === null">
                    {{ s.exit_code !== null ? s.exit_code : '—' }}
                  </span>
                </td>
                <td class="cell-cost">
                  @if (s.cost_usd !== null && s.cost_usd !== undefined) {
                    <span class="cost-value" [class.high]="s.cost_usd > 1">
                    {{ s.cost_usd | currency:'USD':'symbol':'1.2-4' }}
                  </span>
                  }
                  @if (s.cost_usd === null || s.cost_usd === undefined) {
                    <span class="no-cost">—</span>
                  }
                </td>
                <td class="cell-retries">{{ s.retries_used }}</td>
                <td class="cell-model" [title]="s.model || ''">
                  {{ shortModel(s.model) }}
                  @if (s.fallback_used === 1) {
                    <span class="fallback-tag">FALLBACK</span>
                  }
                </td>
                <td class="cell-status">
                  <span class="status-badge" [class.running]="s.is_running === 1" [class.paused]="s.is_running === 2" [class.ended]="s.is_running === 0" [class.pulse-running]="pulsingSessions().has(s.id)">
                    {{ statusLabel(s.is_running) }}
                  </span>
                </td>
                <td class="cell-workflow">                    @if (s.workflow_id) {
                      <span class="workflow-row">
                        <a class="workflow-link" [href]="'http://localhost:8233/namespaces/conduit/workflows/' + s.workflow_id + '/' + (s.run_id || '')" target="_blank" rel="noopener noreferrer" [title]="s.workflow_id">
                          {{ shortWfId(s.workflow_id) }}
                        </a>
                        @if (s.workflow_result) {
                          <span class="workflow-result" [class.wf-ok]="s.workflow_result === 'completed'" [class.wf-fail]="s.workflow_result === 'failed'" [class.wf-skip]="s.workflow_result === 'skipped'">
                            {{ s.workflow_result }}
                          </span>
                        }
                        @if (s.workflow_run_time_ms !== null) {
                          <span class="workflow-runtime">
                            {{ formatMs(s.workflow_run_time_ms) }}
                          </span>
                        }
                      </span>
                    } @else {
                      <span class="no-workflow">—</span>
                    }
                </td>
                <td class="cell-actions" (click)="$event.stopPropagation()">
                  @if (s.agent_role === 'builder' && s.is_running === 0 && s.plan_count > 0) {
                    <button
                      class="btn-restart"
                      (click)="restartBuilderForSession(s)"
                      [disabled]="restartingPlans().has(parsedPlans(s)[0])"
                      title="Restart builder for this plan"
                    >
                      {{ restartingPlans().has(parsedPlans(s)[0]) ? '...' : '🔄' }}
                    </button>
                  }
                  @if (s.is_running === 1) {
                    <button
                      class="btn-kill"
                      (click)="killSession(s.id)"
                      [disabled]="killedSessions().has(s.id)"
                      title="Kill session (SIGKILL)"
                    >
                      {{ killedSessions().has(s.id) ? '...' : '⏻' }}
                    </button>
                  }
                </td>
              </tr>
            </tbody>
          </table>
          } @else {
            <div class="empty-state">
              <span class="empty-icon">📊</span>
              <p>No sessions recorded yet.</p>
              <p class="empty-hint">Sessions are created when the builder processes plans.</p>
            </div>
          }
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
        @if (showBreakerConfirm()) {
          <div class="breaker-confirm-overlay" (click)="cancelBreakerRestart()">
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
        }

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
            @if (pipeline.sessionLogActive() && pipeline.sessionLogFileExists() !== false) {
              <span class="log-status" [class.live]="true">● LIVE</span>
            }
            @if (pipeline.sessionLogActive() && pipeline.sessionLogFileExists() === false) {
              <span class="log-status no-file">● no log file</span>
            }
            @if (!pipeline.sessionLogActive()) {
              <span class="log-status">● disconnected</span>
            }
            <span class="log-line-count">{{ pipeline.sessionLog().length }} lines</span>
            <button class="btn-log-clear" (click)="clearLog()" title="Clear log">✕</button>
          </div>
        </div>

        <!-- Terminal-like log output -->
        <div class="log-terminal" #logTerminal (scroll)="onLogScroll()"
          [class.empty]="pipeline.sessionLog().length === 0 && !pipeline.sessionLogActive()">
          @if (pipeline.sessionLogFileExists() === false && pipeline.sessionLog().length === 0) {
            <div class="log-placeholder-content">
              <span class="placeholder-icon">📭</span>
              <h4>No Log Available</h4>
              <p>This session was created before log streaming was deployed.</p>
              <p class="placeholder-hint">Future sessions will stream live output here.</p>
            </div>
          } @else if (pipeline.sessionLog().length > 0 || pipeline.sessionLogActive()) {
            <div
              class="log-line"
              [class.log-line-stderr]="entry.logType === 'stderr' || entry.logType === 'error'"
              *ngFor="let entry of pipeline.sessionLog(); trackBy: trackByTimestamp"
            >
              <span class="log-timestamp">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
              @if (entry.logType === 'stderr' || entry.logType === 'error') {
                <span class="log-icon-type">
                  <svg class="log-error-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  </svg>
                </span>
              }
              <span class="log-text" [innerHTML]="renderAnsi(entry.line)"></span>
            </div>
            @if (pipeline.sessionLogActive()) {
              <div class="log-spacer">
                <span class="cursor-blink">▊</span>
              </div>
            }
          } @else {
            <div class="log-placeholder-content">
              <span class="placeholder-icon">📜</span>
              <h4>Session Log</h4>
              <p>Click a session row above to view its live output.</p>
              <p class="placeholder-hint">Real-time builder terminal output with ANSI color support.</p>
            </div>
          }
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
    `.next-run-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--accent-blue-text);background:var(--accent-blue-bg);padding:2px 8px;border-radius:10px;font-variant-numeric:tabular-nums}`,
    `.next-run-chip.overdue{color:var(--tag-amber-text);background:var(--tag-amber-bg)}`,
    `.next-run-chip.pulse-green{animation:pulseGreen .6s ease-in-out 2;color:var(--tag-green-text);background:var(--tag-green-bg)}`,
    `.next-run-chip.next-run-paused{color:var(--tag-red-text);background:var(--tag-red-bg)}`,
    `@keyframes pulseGreen{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(63,185,80,.4)}50%{transform:scale(1.08);box-shadow:0 0 8px 2px rgba(63,185,80,.3)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(63,185,80,0)}}`,
    `.next-run-value{font-family:monospace;font-size:12px}`,
    `.next-run-label{font-weight:400;font-size:10px;opacity:.75}.next-run-chip .temporal-link{color:inherit;text-decoration:none;font-size:13px;margin-left:2px;padding:0 2px;border-radius:3px;line-height:1;opacity:.6;transition:opacity .15s,background .15s}.next-run-chip .temporal-link:hover{opacity:1;background:rgba(255,255,255,.15)}`,
    `.btn-refresh{margin-left:auto;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:background .15s}`,
    `.btn-refresh:hover{background:var(--bg-tertiary)}`,
    `.btn-refresh:disabled{opacity:.5;cursor:not-allowed}`,

    // Analytics toggler and panel
    `.analytics-area{flex-shrink:0;border-bottom:1px solid var(--border-subtle)}`,
    `.analytics-toggle{display:flex;align-items:center;gap:6px;width:100%;padding:6px 16px;background:none;border:none;color:var(--text-primary);font-size:12px;cursor:pointer;text-align:left;transition:background .12s}`,
    `.analytics-toggle:hover{background:var(--bg-secondary)}`,
    `.analytics-toggle-icon{font-size:10px;color:var(--text-muted);width:10px;flex-shrink:0}`,
    `.analytics-badge{margin-left:auto;font-size:10px;color:var(--text-muted);background:var(--bg-secondary);padding:1px 8px;border-radius:8px}`,
    `.analytics-panel{padding:8px 16px 12px;background:var(--bg-secondary);border-top:1px solid var(--border-subtle)}`,
    `.analytics-panel.visible{animation:fadeIn .15s}`,

    // Summary stat cards
    `.analytics-summary{display:flex;gap:6px;margin-bottom:10px}`,
    `.analytics-stat{flex:1;display:flex;flex-direction:column;align-items:center;background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:8px;padding:6px 4px;min-width:0}`,
    `.stat-value{font-size:14px;font-weight:700;color:var(--text-primary);font-family:monospace;font-variant-numeric:tabular-nums}`,
    `.stat-label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px}`,

    // Bar chart sections
    `.analytics-chart-section{margin-top:8px}`,
    `.chart-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px}`,
    `.bar-chart{display:flex;flex-direction:column;gap:2px;max-height:148px;overflow-y:auto;padding-right:4px}`,
    `.bar-chart-daily{max-height:none}`,
    `.bar-row{display:flex;align-items:center;gap:6px;height:14px;font-size:11px}`,
    `.bar-label{width:22px;flex-shrink:0;text-align:right;color:var(--text-muted);font-family:monospace;font-size:10px}`,
    `.bar-track{flex:1;height:8px;background:var(--bg-primary);border-radius:4px;overflow:hidden;min-width:40px}`,
    `.bar-fill{display:block;height:100%;border-radius:4px;transition:width .3s ease;min-width:0}`,
    `.bar-count{width:24px;flex-shrink:0;text-align:right;color:var(--text-primary);font-family:monospace;font-size:10px;font-variant-numeric:tabular-nums}`,

    // Analytics empty state
    `.analytics-empty{padding:16px;text-align:center;color:var(--text-muted)}`,
    `.analytics-empty p{margin:2px 0;font-size:12px}`,
    `.analytics-empty-hint{font-size:10px;opacity:.7}`,

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
    `.status-badge.pulse-running{animation:pulseGreen .6s ease-in-out 2}`,

    // Workflow column
    `.cell-workflow{font-size:10px;max-width:180px}`,
    `.workflow-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}`,
    `.workflow-link{font-family:monospace;font-size:10px;color:var(--accent-blue-text);text-decoration:none;background:var(--accent-blue-bg);padding:1px 6px;border-radius:8px;transition:background .15s}`,
    `.workflow-link:hover{background:var(--accent-blue-text);color:var(--bg-primary)}`,
    `.workflow-result{font-size:9px;font-weight:600;text-transform:uppercase;padding:1px 4px;border-radius:4px}`,
    `.workflow-result.wf-ok{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.workflow-result.wf-fail{background:var(--tag-red-bg);color:var(--tag-red-text)}`,
    `.workflow-result.wf-skip{background:var(--tag-amber-bg);color:var(--tag-amber-text)}`,
    `.workflow-runtime{font-size:9px;color:var(--text-muted);font-family:monospace}`,
    `.no-workflow{color:var(--text-muted)}`,

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

    // Stderr / error lines — red background with left accent and tinted text
    `.log-line-stderr{background:rgba(248,81,73,.08);border-left:3px solid #f85149;padding-left:9px;color:#ffb0a5}`,
    `.log-line-stderr:hover{background:rgba(248,81,73,.14)}`,
    `.log-line-stderr .log-timestamp{color:#f0514b}`,
    `.log-line-stderr .log-text ::ng-deep .ansi-37{color:#ffb0a5}`,
    `.log-line-stderr .log-text ::ng-deep .ansi-97{color:#ffcfc0}`,
    `.log-timestamp{flex-shrink:0;color:#484f58;margin-right:10px;font-size:11px;user-select:none}`,
    `.log-icon-type{flex-shrink:0;display:flex;align-items:center;margin-right:6px}`,
    `.log-error-icon{width:14px;height:14px;color:#f85149;flex-shrink:0}`,
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

  /** Display label for the Temporal Scheduler chip (e.g. &#34;polling every 30s&#34;). */
  readonly schedulerLabel = computed(() => {
    const t = this.pipeline.state()?.temporal;
    if (!t?.connected) return null;
    const ms = t.schedulerIntervalMs || 30000;
    const sec = Math.round(ms / 1000);
    return sec < 60 ? `every ${sec}s` : `every ${Math.round(sec / 60)}m`;
  });

  /** Analytics panel toggle and computed stats. */
  readonly showAnalytics = signal(false);
  readonly analytics = signal<RunAnalytics | null>(null);

  /** Set of session IDs whose status badges are currently pulsing. */
  readonly pulsingSessions = signal<Set<string>>(new Set());
  private _pulsingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Green pulse animation on the next-run chip when a run starts. */
  readonly pulseGreen = signal(false);
  private _lastBuilderStatus = 'idle';
  private _pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;

  private _pulseEffectRef = effect(() => {
    const status = this.pipeline.builder().status;
    if (status === 'running' && this._lastBuilderStatus !== 'running') {
      this.pulseGreen.set(true);
      this._pulseTimer = setTimeout(() => {
        this.pulseGreen.set(false);
        this._pulseTimer = null;
      }, 1400);
    }
    this._lastBuilderStatus = status;
  });

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
    private toastService: ToastService,
    @Inject(API_BASE_URL) private api: string,
  ) {}

  ngOnInit(): void {
    this.fetchSessions();
    this._refreshTimer = setInterval(() => this.fetchSessions(true), 30_000);
  }

  ngOnDestroy(): void {
    this.pipeline.unsubscribeSessionLog();
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    // Clean up effects, pulses, and session-pulse timers
    if (this._pulseTimer) {
      clearTimeout(this._pulseTimer);
      this._pulseTimer = null;
    }
    for (const [, timer] of this._pulsingTimers) clearTimeout(timer);
    this._pulsingTimers.clear();
    this._pulseEffectRef.destroy();
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

  fetchSessions(silent?: boolean): void {
    if (!silent) { this.loading.set(true); }
    this.http.get<SessionRow[]>(`${this.api}/sessions`).subscribe({
      next: (data) => {
        // Detect newly-running sessions before overwriting
        const oldSessions = this.sessions();
        const oldMap = new Map(oldSessions.map(s => [s.id, s.is_running]));
        const newRunningIds: string[] = [];
        for (const s of data) {
          if (s.is_running === 1 && oldMap.get(s.id) !== 1) {
            newRunningIds.push(s.id);
          }
        }

        this.sessions.set(data);
        if (!silent) { this.loading.set(false); }
        this.analytics.set(this._computeAnalytics(data));

        // Pulse status badges and show toasts for newly-running sessions
        // (skip on initial load so already-running sessions don't false-trigger)
        if (newRunningIds.length > 0 && oldSessions.length > 0) {
          this.pulsingSessions.update(set => {
            const ns = new Set(set);
            for (const id of newRunningIds) ns.add(id);
            return ns;
          });
          for (const id of newRunningIds) {
            if (this._pulsingTimers.has(id)) {
              clearTimeout(this._pulsingTimers.get(id)!);
            }
            this._pulsingTimers.set(id, setTimeout(() => {
              this.pulsingSessions.update(set => {
                const ns = new Set(set);
                ns.delete(id);
                return ns;
              });
              this._pulsingTimers.delete(id);
            }, 1400));
          }

          // Push enriched toast with session role and short ID
          const now = new Date().toISOString();
          for (const id of newRunningIds) {
            const s = data.find(x => x.id === id);
            if (!s) continue;
            this.toastService.push({
              id: `run-started-${id}`,
              type: 'run_started',
              title: '▶ Run Started',
              message: `${s.agent_role} session ${this.shortId(s.id)} is now running`,
              icon: '🚀',
              timestamp: now,
              priority: 'normal' as const,
            });
          }
        }
      },
      error: () => {
        if (!silent) { this.loading.set(false); }
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

  // ── Temporal Scheduler display ────────────────────────────────────


  // ── Analytics ─────────────────────────────────────────────────────

  toggleAnalytics(): void {
    this.showAnalytics.update(v => !v);
  }

  /** Compute run frequency analytics from session data. */
  private _computeAnalytics(sessions: SessionRow[]): RunAnalytics | null {
    // Need at least 2 sessions with start_iso for gap analysis
    const sorted = sessions
      .filter(s => !!s.start_iso)
      .map(s => new Date(s.start_iso!).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (sorted.length < 2) return null;

    // Gaps between consecutive session starts (in minutes)
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i] - sorted[i - 1]) / 60000);
    }

    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const mid = Math.floor(sortedGaps.length / 2);
    const median = sortedGaps.length % 2 === 0
      ? (sortedGaps[mid - 1] + sortedGaps[mid]) / 2
      : sortedGaps[mid];

    // Hourly distribution: count sessions per hour of day (0-23)
    const hourly = new Array(24).fill(0);
    for (const row of sessions) {
      if (!row.start_iso) continue;
      const d = new Date(row.start_iso);
      if (isNaN(d.getTime())) continue;
      const h = d.getHours();
      hourly[h]++;
    }

    // Daily distribution: count sessions per day of week (Mon=0..Sun=6)
    const daily = new Array(7).fill(0);
    for (const row of sessions) {
      if (!row.start_iso) continue;
      const d = new Date(row.start_iso);
      if (isNaN(d.getTime())) continue;
      // getDay() returns Sun=0..Sat=6 — shift to Mon=0..Sun=6
      const day = (d.getDay() + 6) % 7;
      daily[day]++;
    }

    return {
      avgGapMinutes: Math.round(avg * 10) / 10,
      medianGapMinutes: Math.round(median * 10) / 10,
      minGapMinutes: Math.round(sortedGaps[0] * 10) / 10,
      maxGapMinutes: Math.round(sortedGaps[sortedGaps.length - 1] * 10) / 10,
      sessionCount: sessions.length,
      hourlyDistribution: hourly,
      dailyDistribution: daily,
    };
  }

  /** Format minutes as a human-friendly duration string. */
  formatDuration(minutes: number): string {
    if (minutes < 1) {
      return `${Math.round(minutes * 60)}s`;
    } else if (minutes < 60) {
      return `${Math.floor(minutes)}m`;
    } else {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
  }

  /** Compute bar width as a percentage of the maximum in the distribution. */
  barPercent(count: number, dist: number[]): number {
    const max = Math.max(...dist, 1);
    return count > 0 ? (count / max) * 100 : 0;
  }

  /** Generate a colour for a bar based on its position in the range. */
  barColor(index: number, maxIndex: number): string {
    // Gradient from cool blue (low) to warm amber (peak)
    const t = maxIndex > 0 ? index / maxIndex : 0;
    const r = Math.round(58 + t * (210 - 58));
    const g = Math.round(166 + t * (153 - 166));
    const b = Math.round(255 + t * (77 - 255));
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** Human-readable day-of-week label (Mon = index 0). */
  dayLabel(day: number): string {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels[day] || '';
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

  shortWfId(wfId: string): string {
    // plan-0115-builder → 0115-builder
    const idx = wfId.indexOf('-');
    return idx >= 0 ? wfId.slice(idx + 1) : wfId;
  }

  formatMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
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

  /** Sum of costs from sessions that started in the last 24 hours. */
  recentCost(): number | null {
    const sessions = this.sessions();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let total = 0;
    let hasCost = false;
    for (const s of sessions) {
      if (s.start_iso) {
        const t = new Date(s.start_iso).getTime();
        if (!isNaN(t) && t >= cutoff) {
          const cost = s.cost_usd ?? 0;
          total += cost;
          if (s.cost_usd != null) hasCost = true;
        }
      }
    }
    return hasCost ? total : null;
  }
}
