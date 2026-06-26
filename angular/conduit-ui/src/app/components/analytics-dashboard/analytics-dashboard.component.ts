import { Component, signal, OnInit, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgFor, NgClass } from '@angular/common';
import { ConduitMetrics } from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [NgFor, NgClass, LoadingSpinnerComponent, ErrorBannerComponent, EmptyStateComponent],
  template: `<div class="dashboard">
    <h2>📊 Analytics</h2>
    @if (loading()) {<app-loading-spinner />}
    @if (error(); as e) {<app-error-banner [message]="e" retryLabel="Retry" (retry)="load()" />}
    @if (!loading() && !error()) {
      @if (metrics()) {

        <div class="chips"><button class="chip" *ngFor="let r of [{k:'all',l:'All'},{k:'7d',l:'7d'},{k:'24h',l:'24h'}]" [ngClass]="{active:range()===r.k}" (click)="setRange(r.k)">{{r.l}}</button></div>
        <div class="stat-cards">
          <div class="stat" *ngFor="let s of statCards()"><div class="stat-num">{{s.value}}</div><div class="stat-label">{{s.label}}</div></div>
        </div>
        <div class="section"><h3>Throughput (7 days)</h3>
          <div class="sparkline">
            <span *ngFor="let v of metrics()?.throughputSparkline || []; let i=index" class="bar" [style.height.px]="v*10+2" [title]="'Day '+(i+1)+': '+v+' plans'">▌</span>
          </div>
          <div class="avg">{{metrics()?.throughputAvg?.toFixed(1) || '0'}} plans/day avg</div>
        </div>
        <div class="section"><h3>Plan Distribution</h3>
          <div class="age-bar" *ngFor="let a of metrics()?.planAgeDistribution || []"><span class="age-label">{{a.bucket}}</span><span class="age-bg"><span class="age-fill" [style.width.%]="a.count*5>100?100:a.count*5"></span></span><span class="age-count">{{a.count}}</span></div>
        </div>
      } @else {
        <app-empty-state icon="📊" title="No analytics data" description="Run some plans to see analytics." />
      }
    }
  </div>`,
  styles: [`.dashboard{padding:16px;height:calc(100vh - 60px);overflow-y:auto}h2{color:var(--text-primary);margin-bottom:12px}h3{color:var(--text-muted);font-size:13px;margin-bottom:8px}.chips{display:flex;gap:6px;margin-bottom:12px}.chip{background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-muted);padding:4px 12px;border-radius:14px;font-size:12px;cursor:pointer}.chip.active{background:var(--accent-blue-bg);color:var(--accent-blue-text)}.stat-cards{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}.stat{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:16px;min-width:120px;flex:1}.stat-num{font-size:28px;font-weight:700;color:var(--text-primary)}.stat-label{font-size:11px;color:var(--text-dim);margin-top:4px}.section{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;margin-bottom:12px}.sparkline{display:flex;align-items:flex-end;gap:4px;height:60px;color:var(--accent-blue-text);font-size:18px}.bar{cursor:pointer}.avg{font-size:12px;color:var(--text-dim);margin-top:8px}.age-bar{display:flex;align-items:center;gap:8px;margin-bottom:4px}.age-label{font-size:11px;color:var(--text-muted);width:50px}.age-bg{flex:1;height:10px;background:var(--bg-primary);border-radius:5px;overflow:hidden}.age-fill{height:100%;background:var(--accent-blue);border-radius:5px}.age-count{font-size:11px;color:var(--text-dim);width:30px;text-align:right}`]
})
export class AnalyticsDashboardComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  range = signal('all');  metrics = signal<ConduitMetrics | null>(null);
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private api: string,
  ) {}
  ngOnInit() { this.load(); }
  setRange(r: string) { this.range.set(r); this.load(); }
  load() {
    this.loading.set(true);
    this.error.set(null);
    this.http.post<{ result: ConduitMetrics }>(`${this.api}/tools/call`, { name: 'query_analytics', arguments: { range: this.range() } }).subscribe({
      next: (d) => { this.metrics.set(d?.result ?? null); this.loading.set(false); },
      error: (err) => { this.error.set(err.message || 'Failed to load analytics'); this.loading.set(false); },
    });
  }
  statCards(): {value:string;label:string}[] {
    const m = this.metrics(); if (!m) return [];
    return [
      {value:String(m.totalPlansCompleted),label:'Plans done'},
      {value:String(m.totalPlansPending),label:'Pending'},
      {value:String(m.totalPlansBlocked),label:'Blocked'},
      {value:(m.builderStalenessRate*100).toFixed(0)+'%',label:'Builder stale %'},
    ];
  }
}
