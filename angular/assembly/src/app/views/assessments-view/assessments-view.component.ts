import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, Assessment, DEFAULT_PAGE_SIZE } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { PaginationComponent } from '../../components/pagination/pagination.component';

@Component({
  selector: 'app-assessments-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, RaiseQuestionComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent],
  templateUrl: './assessments-view.component.html',
})
export class AssessmentsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<Assessment[]>([]);
  total = signal(0);
  currentPage = signal(1);
  readonly pageSize = DEFAULT_PAGE_SIZE;
  sortField = signal<string>('confidence');
  sortDir = signal<SortDir>('desc');
  sortedItems = computed(() => sortItems<Assessment>(this.items(), this.sortField(), this.sortDir()));

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'confidence', 'desc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getAssessments(this.currentPage(), this.pageSize).subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load assessments');
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

  confidenceColor(confidence: number | null): string {
    if (confidence == null) return 'bg-gray-200 dark:bg-gray-700';
    if (confidence >= 0.8) return 'bg-emerald-400';
    if (confidence >= 0.5) return 'bg-amber-400';
    return 'bg-red-400';
  }

  toggleSort(field: string) {
    const next = toggleSort(this.sortField(), this.sortDir(), field);
    this.sortField.set(next.field);
    this.sortDir.set(next.dir);
    writeSortToQueryParams(this.router, this.route, next.field, next.dir);
  }

  impactSummary(scope: Record<string, unknown> | null): string {
    if (!scope) return '—';
    try {
      const arr = Array.isArray(scope) ? scope : Object.keys(scope);
      return arr.length > 0 ? `${arr.length} impact(s)` : '—';
    } catch {
      return '—';
    }
  }
}
