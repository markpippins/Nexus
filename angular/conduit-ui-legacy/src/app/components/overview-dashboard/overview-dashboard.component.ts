import { Component, computed } from '@angular/core';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { ConduitService } from '../../services/conduit.service';
import { RouterModule } from '@angular/router';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';

@Component({
  selector: 'app-overview-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, RouterModule, ErrorBannerComponent],
  template: `<div class="overview">
    <h2>🏠 Conduit Overview</h2>
    <app-error-banner *ngIf="offline()" message="Cannot connect to conduit server" retryLabel="Retry" (retry)="retry()" />
    <!-- Widgets grid -->
    <div class="widgets" *ngIf="!offline()">
      <!-- Builder Health -->
      <div class="widget" [ngClass]="'w-'+builder().status">
        <div class="w-header">🔨 Builder</div>
        <div class="w-body">
          <div class="w-status">{{ getBuilderLabel() }}</div>
          <div class="w-sub" *ngIf="builder().status==='running'">{{ getElapsed() }}</div>
        </div>
        <div class="w-link">View Kanban →</div>
      </div>
      <!-- Server Status -->
      <div class="widget">
        <div class="w-header">🌐 Servers</div>
        <div class="w-body">
          <div class="agent-line"><span [class.dot-on]="mcpOnline()" [class.dot-off]="!mcpOnline()">●</span> MCP <span class="agent-st">{{ mcpOnline() ? 'ON' : 'OFF' }}</span></div>
        </div>
      </div>
      <!-- Agent Status -->
      <div class="widget">
        <div class="w-header">🧠 Agents</div>
        <div class="w-body">
          <div class="agent-line" *ngFor="let a of agents()"><span [ngClass]="'dot-'+a.status">●</span> {{ a.role }} <span class="agent-st">{{ a.status }}</span></div>
          <div class="w-sub" *ngIf="agents().length===0">No agents seen</div>
        </div>
        <div class="w-link">View Kanban →</div>
      </div>
      <!-- Plan Stats -->
      <div class="widget">
        <div class="w-header">📊 Plans</div>
        <div class="w-body stats-grid">
          <div class="stat-box sb-blue"><div class="sb-num">{{ planCounts().pending }}</div><div class="sb-label">Pending</div></div>
          <div class="stat-box sb-amber"><div class="sb-num">{{ planCounts().active }}</div><div class="sb-label">Active</div></div>
          <div class="stat-box sb-green"><div class="sb-num">{{ planCounts().completed }}</div><div class="sb-label">Done</div></div>
          <div class="stat-box sb-red"><div class="sb-num">{{ planCounts().blocked }}</div><div class="sb-label">Blocked</div></div>
        </div>
      </div>
      <!-- Activity Feed -->
      <div class="widget wide">
        <div class="w-header">📋 Recent Activity</div>
        <div class="w-body">
          <div class="act-line" *ngFor="let a of activity().slice(0,8)"><span class="act-icon">{{ getActivityIcon(a.type) }}</span> {{ a.detail }} <span class="act-age">{{ getAge(a.timestamp) }}</span></div>
          <div class="w-sub" *ngIf="activity().length===0">No activity yet</div>
        </div>
      </div>
      <!-- Blockers -->
      <div class="widget">
        <div class="w-header">🚫 Active Blockers</div>
        <div class="w-body">
          <div class="blocker-line" *ngFor="let b of activeBlockers()">{{b.severity==='critical'||b.severity==='error'?'🔴':'⚠️'}} {{b.title}}</div>
          <div class="w-sub" *ngIf="activeBlockers().length===0">No active blockers 🎉</div>
        </div>
      </div>
      <!-- Throughput -->
      <div class="widget">
        <div class="w-header">📈 Throughput (7d)</div>
        <div class="w-body">
          <div class="sparkline"><span *ngFor="let v of sparkline()" [style.height.px]="v*6+2" class="spark-bar">▌</span></div>
          <div class="w-sub">{{ sparklineAvg() }} plans/day avg</div>
        </div>
      </div>
    </div>
  </div>`,
  styles: [`.overview{padding:16px;height:calc(100vh - 60px);overflow-y:auto}h2{color:var(--text-primary);margin-bottom:16px}.widgets{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.widget{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;transition:transform 150ms,box-shadow 150ms}.widget:hover{transform:translateY(-2px);box-shadow:0 4px 12px var(--card-shadow)}.widget.wide{grid-column:span 2}.w-header{font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}.w-body{display:flex;flex-direction:column;gap:6px}.w-status{font-size:16px;font-weight:600;color:var(--text-primary)}.w-sub{font-size:11px;color:var(--text-dim)}.w-link{font-size:11px;color:var(--accent-blue);margin-top:8px;cursor:pointer}.w-running{border-left:3px solid var(--accent-green)}.w-stale{border-left:3px solid var(--accent-yellow)}.w-killed{border-left:3px solid var(--accent-red)}.w-idle{border-left:3px solid var(--text-dim)}.agent-line{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary)}.agent-st{font-size:10px;text-transform:uppercase;color:var(--text-dim)}.dot-working{color:var(--accent-green)}.dot-idle{color:var(--text-muted)}.dot-gone,.dot-stale{color:var(--text-dim)}.dot-blocked{color:var(--accent-yellow)}.dot-on{color:var(--accent-green)}.dot-off{color:var(--accent-red)}.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.stat-box{border-radius:6px;padding:10px;text-align:center}.sb-num{font-size:24px;font-weight:700;color:var(--text-primary)}.sb-label{font-size:10px;text-transform:uppercase;margin-top:2px}.sb-blue{background:var(--tag-blue-bg);.sb-label{color:var(--accent-blue-text)}}.sb-amber{background:var(--accent-yellow-bg);.sb-label{color:var(--accent-yellow-text)}}.sb-green{background:var(--tag-green-bg);.sb-label{color:var(--accent-green-text)}}.sb-red{background:var(--tag-red-bg);.sb-label{color:var(--accent-red-text)}}.act-line{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);padding:3px 0}.act-icon{font-size:11px}.act-age{font-size:10px;color:var(--text-dim);margin-left:auto}.blocker-line{font-size:12px;color:var(--accent-red-text);padding:3px 0}.sparkline{display:flex;align-items:flex-end;gap:3px;height:40px;color:var(--accent-blue-text)}.spark-bar{cursor:pointer}@media(max-width:1024px){.widgets{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}}@media(max-width:768px){.widget.wide{grid-column:span 1}.widgets{grid-template-columns:1fr 1fr}}@media(max-width:480px){.widgets{grid-template-columns:1fr}.overview{padding:10px}}`]
})
export class OverviewDashboardComponent {
  readonly offline = computed(() => this.pipe.offline());
  readonly builder = computed(() => this.pipe.builder());
  readonly mcpOnline = computed(() => this.pipe.mcpOnline());
  readonly agents = computed(() => this.pipe.agents().filter(a => a.status !== 'gone'));
  readonly planCounts = computed(() => {
    const s = this.pipe.state();
    return { pending: s?.plans.pending.length || 0, active: s?.plans.active.length || 0, completed: s?.plans.completed.length || 0, blocked: s?.plans.blocked.length || 0 };
  });
  readonly activity = computed(() => this.pipe.activityLog());
  readonly activeBlockers = computed(() => this.pipe.state()?.plans.blocked.map(p => ({ title: p.title, severity: (p.blockReason?.includes('timeout') ? 'critical' : 'error') as 'critical'|'error'|'warning' })) || []);
  readonly sparkline = computed(() => {
    const state = this.pipe.state();
    if (!state) return [0,0,0,0,0,0,0];
    const days: number[] = [];
    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now - (6-i)*86400000).toISOString().slice(0,10);
      days.push(state.plans.completed.filter(p => p.createdAt?.slice(0,10) === d).length);
    }
    return days;
  });
  readonly sparklineAvg = computed(() => {
    const s = this.sparkline();
    return (s.reduce((a,b) => a+b, 0) / 7).toFixed(1);
  });

  constructor(private pipe: ConduitService) {}

  retry() {
    this.pipe.refresh();
  }

  getBuilderLabel(): string {
    const b = this.builder();
    switch (b.status) { case 'running': return '🟢 Running'; case 'stale': return '⚠️ Stale'; case 'killed': return '🔴 Killed'; default: return 'No builder'; }
  }
  getElapsed(): string {
    const b = this.builder();
    if (b.elapsedSeconds) { const m = Math.floor(b.elapsedSeconds/60); return `${m}m elapsed`; }
    return '';
  }
  getActivityIcon(t: string): string {
    switch(t) { case 'plan_created': return '📝'; case 'plan_moved': return '🔄'; case 'plan_completed': case 'plan_archived': return '✅'; case 'builder_update': return '🔨'; case 'circuit_breaker_update': return '⛔'; default: return '•'; }
  }
  getAge(ts: string): string {
    const min = Math.floor((Date.now()-new Date(ts).getTime())/60000);
    return min<60?`${min}m ago`:min<1440?`${Math.floor(min/60)}h ago`:`${Math.floor(min/1440)}d ago`;
  }
}
