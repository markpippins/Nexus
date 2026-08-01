import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, Forum } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-forums-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, AvatarComponent],
  templateUrl: './forums-view.component.html',
})
export class ForumsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  forums = signal<Forum[]>([]);
  sortField = signal<string>('name');
  sortDir = signal<SortDir>('asc');
  sortedForums = computed(() => sortItems<Forum>(this.forums(), this.sortField(), this.sortDir()));
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'name', 'asc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getForums().subscribe({
      next: forums => {
        this.forums.set(forums);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load forums');
        this.loading.set(false);
      }
    });
  }

  toggleSort(field: string) {
    const next = toggleSort(this.sortField(), this.sortDir(), field);
    this.sortField.set(next.field);
    this.sortDir.set(next.dir);
    writeSortToQueryParams(this.router, this.route, next.field, next.dir);
  }

  retry() {
    this.load();
  }
}
