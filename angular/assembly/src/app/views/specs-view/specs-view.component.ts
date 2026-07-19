import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService, SpecItem } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';

@Component({
  selector: 'app-specs-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, RaiseQuestionComponent],
  template: `
    <div class="max-w-6xl mx-auto">
      <app-page-header title="Specs" description="Agenda items and derived specifications." [count]="total()"></app-page-header>

      <app-table-skeleton *ngIf="loading()" [cols]="5" [rows]="6"></app-table-skeleton>

      <app-error-state *ngIf="error() && !loading()" title="Failed to load specs" [description]="error()!" (retry)="retry()"></app-error-state>

      <ng-container *ngIf="!loading() && !error()">
        <app-empty-state *ngIf="items().length === 0" title="No specs" description="Specs will appear here once they are created."></app-empty-state>

        <div *ngIf="items().length > 0" class="app-panel">
          <div class="overflow-x-auto">
            <table class="app-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th class="w-28">Source</th>
                  <th class="w-28">Agenda</th>
                  <th class="w-32">Created</th>
                  <th class="w-28 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of items()">
                  <td>
                    <span class="font-medium text-gray-900 dark:text-gray-100">{{ item.title || 'Untitled' }}</span>
                    <div class="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{{ item.sourceType || 'No source type' }}</div>
                  </td>
                  <td class="text-sm text-gray-600 dark:text-gray-400">{{ item.sourceType || '—' }}</td>
                  <td class="text-sm text-gray-600 dark:text-gray-400">{{ item.agendaStatus || '—' }}</td>
                  <td class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(item.createdAt) }}</td>
                  <td class="text-right"><app-raise-question objectType="specification" [objectId]="item.id" [objectTitle]="item.title || 'Untitled'"></app-raise-question></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class SpecsViewComponent implements OnInit {
  private dataService = inject(DataService);
  items = signal<SpecItem[]>([]);
  total = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getSpecs().subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load specs');
        this.loading.set(false);
      }
    });
  }

  retry() {
    this.load();
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString();
  }
}
