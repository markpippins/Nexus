import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService, ConversationSnapshot } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';

@Component({
  selector: 'app-conversations-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, RaiseQuestionComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './conversations-view.component.html',
})
export class ConversationsViewComponent implements OnInit {
  private dataService = inject(DataService);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<ConversationSnapshot[]>([]);
  total = signal(0);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getConversations().subscribe({
      next: res => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load conversations');
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