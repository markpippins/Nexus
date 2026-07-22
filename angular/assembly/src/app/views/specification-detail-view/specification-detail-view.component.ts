import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Specification, OpenQuestion } from '../../services/data.service';

import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';

@Component({
  selector: 'app-specification-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink, RaiseQuestionComponent, SkeletonComponent, ErrorStateComponent, StatusBadgeComponent],
  templateUrl: './specification-detail-view.component.html',
})
export class SpecificationDetailViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  specification = signal<Specification | null>(null);
  openQuestions = signal<OpenQuestion[]>([]);
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
    this.dataService.getSpecification(id).subscribe({
      next: spec => {
        this.specification.set(spec);
        this.dataService.getOpenQuestionsForEntity('specification', id).subscribe({
          next: res => {
            this.openQuestions.set(res.items);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          }
        });
      },
      error: err => {
        this.error.set(err.message || 'Failed to load specification');
        this.loading.set(false);
      }
    });
  }

  retry() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.load(id);
  }

  formatJson(value: Record<string, unknown> | null): string {
    return JSON.stringify(value, null, 2);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleString();
  }
}
