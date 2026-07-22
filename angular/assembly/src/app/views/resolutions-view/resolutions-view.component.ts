import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, OpenQuestion, DEFAULT_PAGE_SIZE } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
import { entityRouteForType, formatEntityType } from '../../utils/entity-route';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { PaginationComponent } from '../../components/pagination/pagination.component';

@Component({
  selector: 'app-resolutions-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent],
  templateUrl: './resolutions-view.component.html',
})
export class ResolutionsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<OpenQuestion[]>([]);
  total = signal(0);
  currentPage = signal(1);
  readonly pageSize = DEFAULT_PAGE_SIZE;
  sortField = signal<string>('createdAt');
  sortDir = signal<SortDir>('desc');
  sortedItems = computed(() => sortItems<OpenQuestion>(this.items(), this.sortField(), this.sortDir()));

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'createdAt', 'desc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getResolvedQuestions(this.currentPage(), this.pageSize).subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load resolutions');
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
}
