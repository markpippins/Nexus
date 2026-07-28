import { Component, signal, OnInit, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { ChangeReportEntry } from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

@Component({
  selector: 'app-changes-view',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, LoadingSpinnerComponent, ErrorBannerComponent, EmptyStateComponent],
  templateUrl: './changes-view.component.html',
  styleUrls: ['./changes-view.component.scss'],
})
export class ChangesViewComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  activeCat = signal('all');
  results = signal<ChangeReportEntry[]>([]);
  expanded = signal<string | null>(null);

  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private api: string,
  ) {}
  ngOnInit() { this.load(); }
  setCat(c: string) { this.activeCat.set(c); this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(null);
    const p: Record<string, any> = {};
    if (this.activeCat() !== 'all') p['category'] = this.activeCat();
    this.http.post<{ result: any }>(`${this.api}/tools/call`, { name: 'query_changes', arguments: p }).subscribe({
      next: (d) => { if (d?.result) this.results.set(d.result.results || []); this.loading.set(false); },
      error: (err) => { this.error.set(err.message || 'Failed to load changes'); this.results.set([]); this.loading.set(false); },
    });
  }

  planRefsStr(r: ChangeReportEntry): string {
    return (r.planRefs || []).map((p) => p.planNumber).join(', ');
  }

  getAge(m: string): string {
    const min = Math.floor((Date.now() - new Date(m).getTime()) / 60000);
    return min < 60 ? `${min}m ago` : min < 1440 ? `${Math.floor(min / 60)}h ago` : `${Math.floor(min / 1440)}d ago`;
  }
}
