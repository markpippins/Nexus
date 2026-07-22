import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, WorkRequest, OpenQuestion } from '../../services/data.service';

import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';

@Component({
  selector: 'app-work-request-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusBadgeComponent, RaiseQuestionComponent, SkeletonComponent, ErrorStateComponent, MarkdownRendererComponent],
  template: `
    <div class="max-w-4xl mx-auto">
      <div *ngIf="loading()" class="space-y-4">
        <div class="app-panel p-4 space-y-2">
          <app-skeleton width="40%" height="1rem"></app-skeleton>
          <app-skeleton width="20%" height="0.75rem"></app-skeleton>
        </div>
        <div class="app-panel p-4 space-y-3">
          <app-skeleton width="30%" height="0.75rem"></app-skeleton>
          <app-skeleton width="100%" height="0.875rem"></app-skeleton>
        </div>
      </div>

      <app-error-state *ngIf="error() && !loading()" title="Failed to load work request" [description]="error()!" (retry)="retry()"></app-error-state>

      <ng-container *ngIf="!loading() && !error() && wr()">
        <div class="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <a [routerLink]="['/work-requests']" class="hover:text-primary-700 transition-colors">Work Requests</a>
          <span>/</span>
          <span class="text-gray-700 font-medium truncate">{{ wr()!.title || 'Untitled' }}</span>
        </div>

        <div class="app-panel p-4 mb-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h1 class="text-lg font-bold text-gray-900">{{ wr()!.title || 'Untitled' }}</h1>
              <div class="flex items-center gap-2 mt-2 flex-wrap">
                <span class="font-mono text-xs text-gray-500">{{ wr()!.id.slice(0, 8) }}…</span>
                <app-status-badge [status]="wr()!.status"></app-status-badge>
              </div>
            </div>
            <app-raise-question objectType="work_request" [objectId]="wr()!.id" [objectTitle]="wr()!.title || 'Untitled'"></app-raise-question>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="lg:col-span-2 space-y-4">
            <div class="app-panel p-4">
              <h2 class="text-sm font-semibold text-gray-900 mb-2">Intent</h2>
              <div *ngIf="wr()!.intent || wr()!.description" class="space-y-3">
                <div *ngIf="wr()!.intent">
                  <p class="text-xs font-medium text-gray-500 uppercase">Intent</p>
                  <app-markdown-renderer [content]="wr()!.intent || ''"></app-markdown-renderer>
                </div>
                <div *ngIf="wr()!.description">
                  <p class="text-xs font-medium text-gray-500 uppercase">Description</p>
                  <app-markdown-renderer [content]="wr()!.description || ''"></app-markdown-renderer>
                </div>
              </div>
              <p *ngIf="!wr()!.intent && !wr()!.description" class="text-sm text-gray-500">No intent or description recorded.</p>
            </div>

            <div *ngIf="wr()!.context" class="app-panel p-4">
              <h2 class="text-sm font-semibold text-gray-900 mb-2">Context</h2>
              <pre class="bg-gray-50 p-3 rounded text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">{{ formatJson(wr()!.context) }}</pre>
            </div>

            <div *ngIf="wr()!.constraints" class="app-panel p-4">
              <h2 class="text-sm font-semibold text-gray-900 mb-2">Constraints</h2>
              <pre class="bg-gray-50 p-3 rounded text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">{{ formatJson(wr()!.constraints) }}</pre>
            </div>
          </div>

          <div class="space-y-4">
            <div class="app-panel p-4">
              <h2 class="text-sm font-semibold text-gray-900 mb-2">Source Links</h2>
              <div *ngIf="wr()!.sourceSpecificationId" class="text-sm">
                <span class="text-gray-500">Specification:</span>
                <a [routerLink]="['/specifications', wr()!.sourceSpecificationId]" class="app-link font-mono text-xs">{{ wr()!.sourceSpecificationId!.slice(0, 8) }}…</a>
              </div>
              <div *ngIf="wr()!.sourceRequirementId" class="text-sm mt-1">
                <span class="text-gray-500">Requirement:</span>
                <a [routerLink]="['/requirements', wr()!.sourceRequirementId]" class="app-link font-mono text-xs">{{ wr()!.sourceRequirementId!.slice(0, 8) }}…</a>
              </div>
              <p *ngIf="!wr()!.sourceSpecificationId && !wr()!.sourceRequirementId" class="text-sm text-gray-500">No upstream sources linked.</p>
            </div>

            <div class="app-panel p-4">
              <h2 class="text-sm font-semibold text-gray-900 mb-2">Related Open Questions</h2>
              <div *ngIf="openQuestions().length === 0" class="text-sm text-gray-500">No open questions linked.</div>
              <div *ngIf="openQuestions().length > 0" class="divide-y divide-gray-100">
                <a *ngFor="let oq of openQuestions()" [routerLink]="['/open-questions', oq.id]" class="block py-2 hover:bg-gray-50 transition-colors">
                  <div class="text-sm font-medium text-gray-900">{{ oq.title }}</div>
                  <app-status-badge [status]="oq.status"></app-status-badge>
                </a>
              </div>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class WorkRequestDetailViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  wr = signal<WorkRequest | null>(null);
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
    this.dataService.getWorkRequest(id).subscribe({
      next: wr => {
        this.wr.set(wr);
        this.dataService.getOpenQuestionsForEntity('work_request', id).subscribe({
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
        this.error.set(err.message || 'Failed to load work request');
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
}
