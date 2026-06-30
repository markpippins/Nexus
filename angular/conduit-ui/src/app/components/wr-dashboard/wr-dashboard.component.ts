import { Component, computed } from '@angular/core';
import { NgFor, NgClass } from '@angular/common';
import { ConduitService } from '../../services/conduit.service';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';

interface PipelineColumn {
  status: string;
  label: string;
  color: string;
  icon: string;
}

@Component({
  selector: 'app-wr-dashboard',
  standalone: true,
  imports: [NgFor, NgClass, ErrorBannerComponent],
  template: `
    <div class="wr-dashboard">
      <div class="wr-header">
        <div class="wr-title">
          <span class="wr-icon">⚡</span>
          <h2>WorkRequest Pipeline</h2>
        </div>
        <div class="wr-stats-row">
          <span class="wr-stat">Total: <strong>{{ totalWrs() }}</strong></span>
          <span class="wr-divider">|</span>
          <span class="wr-stat">Active: <strong>{{ activeCount() }}</strong></span>
          <span class="wr-divider">|</span>
          <span class="wr-stat">Terminal: <strong>{{ terminalCount() }}</strong></span>
          <span class="wr-divider">|</span>
          <span class="wr-stat">Events: <strong>{{ eventLog().length }}</strong></span>
          @if (circuitBreaker()) {
            <span class="wr-divider">|</span>
            <span class="wr-stat cb-indicator" [class.cb-tripped]="forcedPause()">
              {{ forcedPause() ? '⛔ PAUSED' : '● RUNNING' }}
            </span>
          }
        </div>
      </div>

      @if (offline()) {
        <app-error-banner message="Cannot connect to conduit server" retryLabel="Retry" (retry)="retry()" />
      }

      @if (!offline()) {
        <!-- Pipeline columns -->
        <div class="pipeline">
          <div class="pipeline-lanes">
            <div class="lane" *ngFor="let col of columns">
              <div class="lane-header" [style.border-top-color]="col.color">
                <span class="lane-icon">{{ col.icon }}</span>
                <span class="lane-label">{{ col.label }}</span>
                <span class="lane-count" [style.background]="col.color">{{ wrByStatus(col.status).length }}</span>
              </div>
              <div class="lane-body">
                @if (wrByStatus(col.status).length === 0) {
                  <div class="lane-empty">— empty —</div>
                }
                <div class="wr-card" *ngFor="let wr of wrByStatus(col.status).slice(0, 20)"
                     [title]="wr.wrId + ' (v' + wr.version + ', last: ' + wr.lastEvent + ')'">
                  <div class="wr-card-id">{{ wr.wrId }}</div>
                  <div class="wr-card-meta">
                    <span class="wr-card-ver">v{{ wr.version }}</span>
                    <span class="wr-card-time">{{ getAge(wr.lastTimestamp || wr.createdAt) }}</span>
                  </div>
                  @if (wr.reason) {
                    <div class="wr-card-reason">{{ wr.reason }}</div>
                  }
                  @if (wr.error) {
                    <div class="wr-card-error">{{ wr.error }}</div>
                  }
                </div>
                @if (wrByStatus(col.status).length > 20) {
                  <div class="lane-more">+{{ wrByStatus(col.status).length - 20 }} more</div>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Live event log -->
        <div class="event-log">
          <div class="el-header">
            <span>📋 Live Event Log</span>
            <span class="el-count">{{ eventLog().length }} events</span>
          </div>
          <div class="el-body">
            @if (eventLog().length === 0) {
              <div class="el-empty">Waiting for events…</div>
            }
            <div class="el-entry" *ngFor="let ev of eventLog().slice(0, 50)">
              <span class="el-time">{{ formatTime(ev.timestamp) }}</span>
              <span class="el-wrid">{{ ev.wrId }}</span>
              <span class="el-transition">
                <span class="el-from">{{ ev.previousStatus || '–' }}</span>
                <span class="el-arrow">→</span>
                <span class="el-to" [ngClass]="'el-to-' + ev.currentStatus.toLowerCase()">{{ ev.currentStatus }}</span>
              </span>
              <span class="el-via">via {{ ev.event }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .wr-dashboard {
      padding: 16px;
      height: calc(100vh - 60px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* ── Header ── */
    .wr-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .wr-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .wr-title h2 {
      margin: 0;
      font-size: 18px;
      color: var(--text-primary);
    }
    .wr-icon {
      font-size: 20px;
    }
    .wr-stats-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .wr-stat strong {
      color: var(--text-primary);
    }
    .wr-divider {
      color: var(--border-subtle);
    }
    .cb-indicator {
      font-weight: 600;
    }
    .cb-tripped {
      color: var(--accent-red-text);
    }

    /* ── Pipeline lanes ── */
    .pipeline {
      flex: 1;
      min-height: 0;
    }
    .pipeline-lanes {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      height: 100%;
    }
    .lane {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .lane-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px;
      border-top: 3px solid var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      background: var(--bg-tertiary, rgba(255,255,255,0.03));
    }
    .lane-icon {
      font-size: 14px;
    }
    .lane-label {
      flex: 1;
    }
    .lane-count {
      font-size: 11px;
      color: #fff;
      padding: 1px 7px;
      border-radius: 10px;
      font-weight: 700;
    }
    .lane-body {
      flex: 1;
      padding: 8px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .lane-empty {
      font-size: 11px;
      color: var(--text-dim);
      text-align: center;
      padding: 20px 0;
      font-style: italic;
    }
    .lane-more {
      font-size: 10px;
      color: var(--text-dim);
      text-align: center;
      padding: 4px;
    }

    /* ── WR cards ── */
    .wr-card {
      background: var(--bg-primary, rgba(0,0,0,0.15));
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 8px 10px;
      cursor: default;
      transition: transform 150ms, box-shadow 150ms;
    }
    .wr-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px var(--card-shadow);
    }
    .wr-card-id {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wr-card-meta {
      display: flex;
      gap: 8px;
      margin-top: 2px;
    }
    .wr-card-ver {
      font-size: 10px;
      color: var(--text-dim);
    }
    .wr-card-time {
      font-size: 10px;
      color: var(--text-dim);
    }
    .wr-card-reason,
    .wr-card-error {
      font-size: 10px;
      padding: 2px 4px;
      border-radius: 3px;
      margin-top: 4px;
    }
    .wr-card-reason {
      background: var(--accent-yellow-bg, #fef3c7);
      color: var(--accent-yellow-text, #92400e);
    }
    .wr-card-error {
      background: var(--accent-red-bg, #fef2f2);
      color: var(--accent-red-text, #991b1b);
    }

    /* ── Event log ── */
    .event-log {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      max-height: 280px;
      display: flex;
      flex-direction: column;
    }
    .el-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-subtle);
    }
    .el-count {
      font-size: 10px;
      color: var(--text-dim);
      font-weight: 400;
    }
    .el-body {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .el-empty {
      text-align: center;
      padding: 20px;
      font-size: 12px;
      color: var(--text-dim);
      font-style: italic;
    }
    .el-entry {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 14px;
      font-size: 11px;
      font-family: monospace;
      color: var(--text-secondary);
    }
    .el-entry:hover {
      background: var(--bg-tertiary, rgba(255,255,255,0.03));
    }
    .el-time {
      color: var(--text-dim);
      width: 70px;
      flex-shrink: 0;
    }
    .el-wrid {
      color: var(--accent-blue-text, #93c5fd);
      width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .el-transition {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }
    .el-from {
      color: var(--text-dim);
    }
    .el-arrow {
      color: var(--text-muted);
    }
    .el-to {
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .el-to-validated { color: var(--accent-blue-text, #93c5fd); background: var(--tag-blue-bg, rgba(59,130,246,0.1)); }
    .el-to-queued    { color: var(--accent-yellow-text, #d97706); background: var(--tag-amber-bg, rgba(251,191,36,0.1)); }
    .el-to-claimed   { color: var(--accent-purple-text, #a78bfa); background: rgba(167,139,250,0.1); }
    .el-to-acked     { color: var(--accent-cyan-text, #22d3ee); background: rgba(34,211,238,0.1); }
    .el-to-settled   { color: var(--accent-green-text, #22c55e); background: var(--tag-green-bg, rgba(34,197,94,0.1)); }
    .el-to-rejected  { color: var(--accent-red-text, #ef4444); background: var(--tag-red-bg, rgba(239,68,68,0.1)); }
    .el-to-failed    { color: var(--accent-red-text, #ef4444); background: var(--tag-red-bg, rgba(239,68,68,0.1)); }
    .el-to-noop      { color: var(--text-dim); background: var(--bg-tertiary); }
    .el-to-deferred  { color: var(--accent-yellow-text); background: var(--tag-amber-bg); }
    .el-via {
      color: var(--text-dim);
      font-size: 10px;
      margin-left: auto;
      flex-shrink: 0;
    }

    /* ── Responsive ── */
    @media (max-width: 1200px) {
      .pipeline-lanes {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    @media (max-width: 768px) {
      .pipeline-lanes {
        grid-template-columns: 1fr 1fr;
      }
      .el-time { width: 55px; }
      .el-wrid { width: 70px; }
    }
    @media (max-width: 480px) {
      .pipeline-lanes {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class WrDashboardComponent {
  readonly columns: PipelineColumn[] = [
    { status: 'VALIDATED', label: 'Validated', color: '#3b82f6', icon: '📥' },
    { status: 'QUEUED',    label: 'Queued',    color: '#f59e0b', icon: '⏳' },
    { status: 'CLAIMED',   label: 'Claimed',   color: '#a78bfa', icon: '🔧' },
    { status: 'ACKED',     label: 'Acked',     color: '#22d3ee', icon: '✅' },
    { status: 'SETTLED',   label: 'Settled',   color: '#22c55e', icon: '🏁' },
  ];

  readonly offline = computed(() => this.pipe.offline());
  readonly circuitBreaker = computed(() => this.pipe.circuitBreaker());
  readonly forcedPause = computed(() => this.pipe.conduitPaused());
  readonly totalWrs = computed(() => this.pipe.workRequests().length);
  readonly activeCount = computed(() =>
    this.pipe.workRequests().filter(wr =>
      !['SETTLED', 'REJECTED', 'FAILED', 'NOOP', 'DEFERRED'].includes(wr.status)
    ).length
  );
  readonly terminalCount = computed(() =>
    this.pipe.workRequests().filter(wr =>
      ['SETTLED', 'REJECTED', 'FAILED', 'NOOP', 'DEFERRED'].includes(wr.status)
    ).length
  );

  constructor(private pipe: ConduitService) {}

  wrByStatus(status: string) {
    return this.pipe.wrByStatus(status);
  }

  eventLog() {
    return this.pipe.wrEventLog();
  }

  retry() {
    this.pipe.refresh();
  }

  getAge(ts: string): string {
    if (!ts) return '';
    const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  formatTime(ts: string): string {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return ts.slice(11, 19);
    }
  }
}
