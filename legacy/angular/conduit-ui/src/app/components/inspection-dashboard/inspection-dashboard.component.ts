import { Component, signal, OnInit, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { InspectionEntry, InspectionSeverity } from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

@Component({
  selector: 'app-inspection-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, LoadingSpinnerComponent, ErrorBannerComponent, EmptyStateComponent],
  templateUrl: './inspection-dashboard.component.html',
  styleUrls: ['./inspection-dashboard.component.scss'],
})
export class InspectionDashboardComponent implements OnInit {

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly activeCategory = signal('all');
  readonly results = signal<InspectionEntry[]>([]);
  readonly total = signal(0);
  readonly expandedEntry = signal<InspectionEntry | null>(null);

  readonly statusFilters = [
    { key: 'all', label: 'All', active: true, count: 0 },
    { key: 'resolved', label: 'Resolved', active: false, count: 0 },
    { key: 'unresolved', label: 'Unresolved', active: false, count: 0 },
    { key: 'pending', label: 'Pending', active: false, count: 0 },
  ];

  readonly categoryTabs = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'report', label: 'Reports', icon: '✅' },
    { key: 'error', label: 'Errors', icon: '🔴' },
    { key: 'warning', label: 'Warnings', icon: '⚠️' },
    { key: 'blocker-report', label: 'Blockers', icon: '🚫' },
    { key: 'todo', label: 'TODO', icon: '📝' },
  ];

  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBase: string,
  ) {}

  ngOnInit() { this.loadInspections(); }

  loadInspections() {
    this.loading.set(true);
    this.error.set(null);
    const params: Record<string, any> = {};
    if (this.activeCategory() !== 'all') params['category'] = this.activeCategory();
    const activeFilter = this.statusFilters.find((f) => f.active && f.key !== 'all');
    if (activeFilter) params['status'] = activeFilter.key;
    this.http.post<{ result: any }>(`${this.apiBase}/tools/call`, { name: 'query_inspections', arguments: params })
      .subscribe({
        next: (d) => {
          if (d?.result) { this.results.set(d.result.results || []); this.total.set(d.result.total || 0); }
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load inspections');
          this.results.set([]); this.total.set(0);
          this.loading.set(false);
        },
      });
  }

  toggleStatus(key: string) {
    for (const f of this.statusFilters) f.active = f.key === key;
    this.loadInspections();
  }

  selectCategory(key: string) { this.activeCategory.set(key); this.loadInspections(); }

  toggleEntry(entry: InspectionEntry) {
    this.expandedEntry.set(this.expandedEntry()?.path === entry.path ? null : entry);
  }

  getSeverityIcon(s: InspectionSeverity): string {
    switch (s) { case 'critical': case 'error': return '🔴'; case 'warning': return '⚠️'; default: return 'ℹ️'; }
  }

  getAge(mtime: string): string {
    const min = Math.floor((Date.now() - new Date(mtime).getTime()) / 60000);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}
