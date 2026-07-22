import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Plan } from '../../services/data.service';

import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';

@Component({
  selector: 'app-plan-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusBadgeComponent, RaiseQuestionComponent, SkeletonComponent, ErrorStateComponent, MarkdownRendererComponent],
  templateUrl: './plan-detail-view.component.html',
})
export class PlanDetailViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  plan = signal<Plan | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id') || '';
      this.load(id);
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getPlan(id).subscribe({
      next: plan => {
        this.plan.set(plan);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load plan');
        this.loading.set(false);
      }
    });
  }

  retry() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.load(id);
  }

  parseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
