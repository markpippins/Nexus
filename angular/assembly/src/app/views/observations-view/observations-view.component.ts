import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, Observation, DEFAULT_PAGE_SIZE } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { PaginationComponent } from '../../components/pagination/pagination.component';

@Component({
  selector: 'app-observations-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, RaiseQuestionComponent, StatusBadgeComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent],
  templateUrl: './observations-view.component.html',
})
export class ObservationsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<Observation[]>([]);
  total = signal(0);
  currentPage = signal(1);
  readonly pageSize = DEFAULT_PAGE_SIZE;
  sortField = signal<string>('assessed');
  sortDir = signal<SortDir>('asc');
  sortedItems = computed(() => sortItems<Observation>(this.items(), this.sortField(), this.sortDir()));

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'assessed', 'asc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getObservations(this.currentPage(), this.pageSize).subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load observations');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.load();
  }

  retry() {
    this.load();
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString();
  }

  toggleSort(field: string) {
    const next = toggleSort(this.sortField(), this.sortDir(), field);
    this.sortField.set(next.field);
    this.sortDir.set(next.dir);
    writeSortToQueryParams(this.router, this.route, next.field, next.dir);
  }

  payloadSummary(payload: Record<string, unknown> | null): string {
    if (!payload) return '—';
    try {
      const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (str.length > 120) return str.slice(0, 120) + '...';
      return str;
    } catch {
      return '—';
    }
  }
}
