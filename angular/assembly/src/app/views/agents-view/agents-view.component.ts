import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, AgentRecord } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';

@Component({
  selector: 'app-agents-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, RaiseQuestionComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <app-page-header title="Agents" description="Agent records across the Assembly." [count]="total()"></app-page-header>

      <app-table-skeleton *ngIf="loading()" [cols]="4" [rows]="6"></app-table-skeleton>

      <app-error-state *ngIf="error() && !loading()" title="Failed to load agents" [description]="error()!" (retry)="retry()"></app-error-state>

      <ng-container *ngIf="!loading() && !error()">
        <app-empty-state *ngIf="items().length === 0" title="No agents" description="Agent records will appear here once they are created."></app-empty-state>

        <div *ngIf="items().length > 0" class="app-panel">
          <div *ngIf="sortField()" class="px-4 pt-2 pb-0">
            <button (click)="toggleSort('')" class="text-[11px] text-steel-400 hover:text-steel-600 dark:hover:text-steel-300 transition-colors">Clear sort</button>
          </div>
          <table class="app-table">
            <thead>
              <tr>
                <th (click)="toggleSort('title')" class="cursor-pointer hover:text-primary-600 select-none">Title <span *ngIf="sortField() === 'title'" class="text-[10px]">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span></th>
                <th (click)="toggleSort('role')" class="w-28 cursor-pointer hover:text-primary-600 select-none">Role <span *ngIf="sortField() === 'role'" class="text-[10px]">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span></th>
                <th (click)="toggleSort('createdAt')" class="w-32 cursor-pointer hover:text-primary-600 select-none">Created <span *ngIf="sortField() === 'createdAt'" class="text-[10px]">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span></th>
                <th class="w-28 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of sortedItems()">
                <td>
                  <a [routerLink]="['/agents', item.id]" class="app-link">{{ item.title || 'Untitled' }}</a>
                  <div class="text-xs text-gray-500 line-clamp-1 mt-0.5">{{ item.recordType || 'Record' }}</div>
                </td>
                <td><app-status-badge [status]="item.role || 'unknown'"></app-status-badge></td>
                <td class="text-xs text-gray-500">{{ formatDate(item.createdAt) }}</td>
                <td class="text-right"><app-raise-question objectType="agent" [objectId]="item.id" [objectTitle]="item.title || 'Untitled'"></app-raise-question></td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
    </div>
  `,
})
export class AgentsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  items = signal<AgentRecord[]>([]);
  total = signal(0);
  loading = signal(true);
  sortField = signal<string>('createdAt');
  sortDir = signal<SortDir>('desc');
  sortedItems = computed(() => sortItems<AgentRecord>(this.items(), this.sortField(), this.sortDir()));
  error = signal<string | null>(null);

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'createdAt', 'desc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getAgentRecords().subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load agents');
        this.loading.set(false);
      }
    });
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
}
