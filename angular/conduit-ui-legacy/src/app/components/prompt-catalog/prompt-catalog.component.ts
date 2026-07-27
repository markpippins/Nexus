import { Component, signal, OnInit, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromptEntry } from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

@Component({
  selector: 'app-prompt-catalog',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, FormsModule, LoadingSpinnerComponent, ErrorBannerComponent, EmptyStateComponent],
  template: `<div class="dashboard">
    <h2>📝 Prompts</h2>
    <div class="chips"><button class="chip" *ngFor="let l of [{k:'all',l:'All'},{k:'active',l:'Active'},{k:'archived',l:'Archived'}]" [ngClass]="{active:activeLoc()===l.k}" (click)="setLoc(l.k)">{{l.l}}</button><span class="chip-sep"></span><button class="chip" *ngFor="let f of responseChips()" [ngClass]="{active:responseFilter()===f.k}" (click)="setResponseFilter(f.k)">{{f.l}}</button></div>
    <div class="search-bar"><input class="search" [(ngModel)]="search" (ngModelChange)="onSearch($event)" placeholder="Search prompts..."><button class="btn-clear" *ngIf="search || activeLoc()!=='all' || responseFilter()!=='all'" (click)="clearAll()">✕ Clear</button></div>
    <app-loading-spinner *ngIf="loading()" />
    <app-error-banner *ngIf="error() as e" [message]="e" retryLabel="Retry" (retry)="load()" />
    <ng-container *ngIf="!loading() && !error()">
      <div class="results">
        <div class="row" *ngFor="let p of results()" (click)="expanded()===p.path?expanded.set(null):expanded.set(p.path)">
          <div class="row-main"><span class="num">#{{p.promptNumber}}</span><span class="resp-indicator" [class.responded]="p.response" [title]="p.response ? 'Has response' : 'Awaiting response'">{{p.response ? '✅' : '⏳'}}</span><span class="name">{{p.title}}</span><span class="age">{{getAge(p.mtime)}}</span></div>
          <div class="detail" *ngIf="expanded()===p.path"><div class="d-label">Plan Lineage</div><div class="d-value">{{p.invocationOrder.join(' → ') || 'none'}}</div><div class="d-label">Prompt</div><div class="d-value">{{p.summary}}</div><div class="d-label" *ngIf="p.response">Response</div><div class="d-value response-text" *ngIf="p.response">{{p.response}}</div></div>
        </div>
        <app-empty-state *ngIf="results().length===0" icon="📝" title="No prompts found" description="Try adjusting your search or filter." />
      </div>
    </ng-container>
  </div>`,
  styles: [`.dashboard{padding:16px;height:calc(100vh - 60px);overflow-y:auto}h2{color:var(--text-primary);margin-bottom:12px}.chips{display:flex;gap:6px;margin-bottom:12px}.chip{background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-muted);padding:4px 12px;border-radius:14px;font-size:12px;cursor:pointer}.chip.active{background:var(--accent-blue-bg);color:var(--accent-blue-text)}.chip-sep{width:1px;background:var(--border-divider);margin:2px 2px;align-self:stretch}.search-bar{display:flex;gap:8px;margin-bottom:12px}.search{flex:1;background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-primary);padding:8px 12px;border-radius:6px;font-size:13px}.btn-clear{background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-muted);padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap}.btn-clear:hover{color:var(--text-primary);border-color:var(--accent-blue-border)}.results{display:flex;flex-direction:column;gap:4px}.row{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;padding:10px 14px}.row:hover{background:var(--bg-tertiary)}.row-main{display:flex;align-items:center;gap:10px}.num{color:var(--accent-blue-text);font-size:11px;font-weight:700}.resp-indicator{font-size:11px;width:18px;text-align:center;opacity:0.5}.resp-indicator.responded{opacity:1}.name{flex:1;font-size:13px;color:var(--text-primary)}.age{font-size:11px;color:var(--text-dim)}.detail{margin-top:8px;padding-top:8px;border-top:1px solid var(--border-divider);display:flex;flex-direction:column;gap:4px}.d-label{font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-dim)}.d-value{font-size:12px;color:var(--text-secondary)}.d-value.response-text{white-space:pre-wrap;max-height:300px;overflow-y:auto;background:var(--bg-tertiary);border:1px solid var(--border-subtle);border-radius:4px;padding:8px;margin-top:2px;font-family:monospace;font-size:11px}.empty{padding:40px;text-align:center;color:var(--text-dim)}@media(max-width:768px){.dashboard{padding:10px}.search{width:100%;min-width:0}.row{min-height:44px}.row-main{flex-wrap:wrap}}@media(max-width:480px){.chips{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch}.chip{white-space:nowrap;flex-shrink:0;min-height:44px;display:inline-flex;align-items:center}}`]
})
export class PromptCatalogComponent implements OnInit {
  loading = signal(true); error = signal<string | null>(null);
  activeLoc = signal('all'); responseFilter = signal('all'); search = ''; results = signal<PromptEntry[]>([]); expanded = signal<string | null>(null);
  private allItems = signal<PromptEntry[]>([]);

  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private api: string,
  ) {}
  ngOnInit() { this.load(); }
  setLoc(l: string) { this.activeLoc.set(l); this.load(); }
  setResponseFilter(f: string) { this.responseFilter.set(f); this.load(); }
  onSearch(q: string) { this.search = q; this.load(); }

  /** Chips with live counts — initialized with (0) to avoid flicker */
  responseChips = signal<{k:string,l:string}[]>([
    {k:'all', l:'All (0)'},
    {k:'responded', l:'✅ Responded (0)'},
    {k:'awaiting', l:'⏳ Awaiting (0)'},
  ]);

  /** Reset all filters and search */
  clearAll() {
    this.search = '';
    this.activeLoc.set('all');
    this.responseFilter.set('all');
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    const p: Record<string, any> = {};
    if (this.activeLoc() !== 'all') p['location'] = this.activeLoc();
    if (this.search) p['search'] = this.search;
    this.http.post<{ result: any }>(`${this.api}/tools/call`, { name: 'query_prompts', arguments: p }).subscribe({
      next: (d) => {
        if (d?.result) {
          const items: PromptEntry[] = d.result.results || [];
          this.allItems.set(items);
          let filtered = items;
          if (this.responseFilter() === 'responded') filtered = items.filter((p: PromptEntry) => p.response);
          else if (this.responseFilter() === 'awaiting') filtered = items.filter((p: PromptEntry) => !p.response);
          this.results.set(filtered);
          // Update chip counts
          const responded = items.filter((p: PromptEntry) => p.response).length;
          const awaiting = items.length - responded;
          this.responseChips.set([
            {k:'all', l:`All (${items.length})`},
            {k:'responded', l:`✅ Responded (${responded})`},
            {k:'awaiting', l:`⏳ Awaiting (${awaiting})`},
          ]);
        }
        this.loading.set(false);
      },
      error: (err) => { this.error.set(err.message || 'Failed to load prompts'); this.results.set([]); this.loading.set(false); },
    });
  }
  getAge(m: string): string { const min = Math.floor((Date.now()-new Date(m).getTime())/60000); return min<60?`${min}m ago`:min<1440?`${Math.floor(min/60)}h ago`:`${Math.floor(min/1440)}d ago`; }
}
