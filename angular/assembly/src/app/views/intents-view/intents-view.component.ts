import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService, IntentRecord } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';

@Component({
  selector: 'app-intents-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, RaiseQuestionComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './intents-view.component.html',
})
export class IntentsViewComponent implements OnInit {
  private dataService = inject(DataService);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<IntentRecord[]>([]);
  total = signal(0);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getIntents().subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load intents');
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