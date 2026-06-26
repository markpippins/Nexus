import { Component, signal, computed, OnInit, OnDestroy, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ArchiveEntry,
  ArchiveCategory,
  ArchiveResult,
} from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { ErrorBannerComponent } from '../error-banner/error-banner.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

type CategoryTab = { key: string; label: string; icon: string };

@Component({
  selector: 'app-archive-browser',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, FormsModule, LoadingSpinnerComponent, ErrorBannerComponent, EmptyStateComponent],
  templateUrl: './archive-browser.component.html',
  styleUrls: ['./archive-browser.component.scss'],
})
export class ArchiveBrowserComponent implements OnInit, OnDestroy {
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tabs: CategoryTab[] = [
    { key: 'all', label: 'All', icon: '📦' },
    { key: 'completed-plans', label: 'Completed Plans', icon: '✅' },
    { key: 'build-logs', label: 'Build Logs', icon: '📜' },
    { key: 'prompts', label: 'Prompts', icon: '💬' },
    { key: 'changes', label: 'Changes', icon: '🔄' },
  ];

  readonly activeTab = signal<string>('all');
  readonly searchQuery = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly datePreset = signal('all');
  readonly page = signal(1);
  readonly pageSize = 50;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly results = signal<ArchiveEntry[]>([]);
  readonly total = signal(0);
  readonly expandedEntry = signal<ArchiveEntry | null>(null);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );

  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private apiBase: string,
  ) {}

  ngOnInit() {
    this.loadArchive();
  }

  ngOnDestroy() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  loadArchive() {
    this.loading.set(true);
    this.error.set(null);
    const params: Record<string, any> = {};
    if (this.activeTab() !== 'all') params['category'] = this.activeTab();
    if (this.searchQuery()) params['search'] = this.searchQuery();
    if (this.dateFrom()) params['dateFrom'] = this.dateFrom();
    if (this.dateTo()) params['dateTo'] = this.dateTo();
    params['page'] = this.page();
    params['pageSize'] = this.pageSize;

    this.http
      .post<{ result: ArchiveResult }>(`${this.apiBase}/tools/call`, {
        name: 'query_archive',
        arguments: params,
      })
      .subscribe({
        next: (data) => {
          if (data?.result) {
            this.results.set(data.result.results || []);
            this.total.set(data.result.total || 0);
          }
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load archive');
          this.results.set([]);
          this.total.set(0);
          this.loading.set(false);
        },
      });
  }

  selectTab(key: string) {
    this.activeTab.set(key);
    this.page.set(1);
    this.loadArchive();
  }

  onSearch(query: string) {
    this.searchQuery.set(query);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.loadArchive();
    }, 300);
  }

  setPreset(preset: string) {
    this.datePreset.set(preset);
    const now = new Date();
    switch (preset) {
      case '24h':
        this.dateFrom.set(new Date(now.getTime() - 86400000).toISOString().slice(0, 10));
        this.dateTo.set('');
        break;
      case '7d':
        this.dateFrom.set(new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10));
        this.dateTo.set('');
        break;
      case '30d':
        this.dateFrom.set(new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10));
        this.dateTo.set('');
        break;
      default:
        this.dateFrom.set('');
        this.dateTo.set('');
    }
    this.page.set(1);
    this.loadArchive();
  }

  goToPage(p: number) {
    this.page.set(p);
    this.loadArchive();
  }

  toggleEntry(entry: ArchiveEntry) {
    this.expandedEntry.set(
      this.expandedEntry()?.path === entry.path ? null : entry,
    );
  }

  getAge(mtime: string): string {
    const diff = Date.now() - new Date(mtime).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  getCategoryIcon(cat: ArchiveCategory): string {
    switch (cat) {
      case 'completed-plans':
        return '📋';
      case 'build-logs':
        return '📜';
      case 'prompts':
        return '💬';
      case 'changes':
        return '🔄';
    }
  }
}
