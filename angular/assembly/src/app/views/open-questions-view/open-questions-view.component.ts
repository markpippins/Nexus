import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, OpenQuestion, DEFAULT_PAGE_SIZE } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
import { entityRouteForType, formatEntityType } from '../../utils/entity-route';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { PaginationComponent } from '../../components/pagination/pagination.component';

@Component({
  selector: 'app-open-questions-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent],
  templateUrl: './open-questions-view.component.html',
})
export class OpenQuestionsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<OpenQuestion[]>([]);
  total = signal(0);
  currentPage = signal(1);
  readonly pageSize = DEFAULT_PAGE_SIZE;
  sortField = signal<string>('status');
  sortDir = signal<SortDir>('asc');
  sortedItems = computed(() => sortItems<OpenQuestion>(this.items(), this.sortField(), this.sortDir()));
  requirementId = signal<string | null>(null);

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'status', 'asc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
    this.route.queryParamMap.subscribe(params => {
      this.requirementId.set(params.get('requirementId'));
      this.currentPage.set(1);
      this.load();
    });
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getOpenQuestions(this.currentPage(), this.pageSize, this.requirementId()).subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load open questions');
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

  toggleSort(field: string) {
    const next = toggleSort(this.sortField(), this.sortDir(), field);
    this.sortField.set(next.field);
    this.sortDir.set(next.dir);
    writeSortToQueryParams(this.router, this.route, next.field, next.dir);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString();
  }

  entityRoute(item: OpenQuestion): string[] | null {
    if (!item.entityType || !item.entityId) return null;
    const route = entityRouteForType(item.entityType);
    if (!route) return null;
    return ['/', route, item.entityId];
  }

  entityTypeLabel(type: string | null): string {
    return formatEntityType(type);
  }

  entityTitle(item: OpenQuestion): string {
    if (item.entityTitle) return item.entityTitle;
    return this.entityTypeLabel(item.entityType || null);
  }

  navigateToDiscussion(item: OpenQuestion) {
    if (item.entityType && item.entityId) {
      const route = entityRouteForType(item.entityType);
      if (route) {
        this.router.navigate(['/', route, item.entityId]);
        return;
      }
    }
    this.router.navigate(['/open-questions', item.id]);
  }
}
