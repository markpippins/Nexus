import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DataService, OpenQuestion } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';

@Component({
  selector: 'app-open-questions-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, RaiseQuestionComponent],
  templateUrl: './open-questions-view.component.html',
})
export class OpenQuestionsViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  loading = signal(true);
  error = signal<string | null>(null);

  items = signal<OpenQuestion[]>([]);
  total = signal(0);
  requirementId = signal<string | null>(null);

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.requirementId.set(params.get('requirementId'));
      this.load();
    });
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getOpenQuestions(1, 100, this.requirementId()).subscribe({
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

  retry() {
    this.load();
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString();
  }
}