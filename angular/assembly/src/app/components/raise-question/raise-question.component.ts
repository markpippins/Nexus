import { Component, Input, inject, signal, HostListener, ViewChild, ElementRef, AfterViewChecked, OnDestroy, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { entityRouteForType } from '../../utils/entity-route';
import { DEFAULT_USER_ID } from '../../config/user.config';
import { IconComponent } from '../icon/icon.component';

const FORUM_SLUG = 'issues-and-open-questions';

/** Entity types whose IDs are UUIDs that the backend can link to OpenQuestion records. */
const SUPPORTS_OPEN_QUESTIONS = new Set([
  'requirement', 'candidate', 'work_request', 'harvest', 'conversation',
  'intent_record', 'assessment', 'observation', 'report', 'agent_record',
  'agent', 'specification', 'agenda', 'thread', 'open_question',
]);

@Component({
  selector: 'app-raise-question',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <button
      (click)="open()"
      class="inline-flex items-center gap-1.5 px-2 h-6 text-[11px] font-medium rounded border transition-all duration-150 focus-visible:ring-2"
      [class.text-amber-700]="canOpenQuestion"
      [class.bg-amber-50]="canOpenQuestion"
      [class.hover:bg-amber-100]="canOpenQuestion"
      [class.border-amber-200]="canOpenQuestion"
      [class.hover:border-amber-300]="canOpenQuestion"
      [class.focus-visible:ring-amber-500]="canOpenQuestion"
      [class.text-red-700]="!canOpenQuestion"
      [class.bg-red-50]="!canOpenQuestion"
      [class.hover:bg-red-100]="!canOpenQuestion"
      [class.border-red-200]="!canOpenQuestion"
      [class.hover:border-red-300]="!canOpenQuestion"
      [class.focus-visible:ring-red-500]="!canOpenQuestion"
    >
      <app-icon [name]="canOpenQuestion ? 'help-circle' : 'flag'" class="w-3.5 h-3.5"></app-icon>
      {{ canOpenQuestion ? buttonLabel : 'Report Issue' }}
    </button>

    <div
      *ngIf="isOpen()"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="modalTitleId"
    >
      <div class="absolute inset-0 bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm" (click)="close()"></div>
      <div class="relative w-full sm:w-auto sm:max-w-lg sm:rounded-lg app-panel p-4 shadow-xl max-h-[90vh] sm:max-h-none overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 [id]="modalTitleId" class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {{ canOpenQuestion ? 'Raise Open Question' : 'Report Issue' }}
          </h3>
          <button (click)="close()" class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" aria-label="Close">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          <ng-container *ngIf="canOpenQuestion; else reportDesc">
            Create a new post in <span class="font-medium text-gray-700 dark:text-gray-300">Issues</span> linked to
            <span class="font-medium text-gray-700 dark:text-gray-300">{{ objectTitle || 'Untitled' }}</span>.
          </ng-container>
          <ng-template #reportDesc>
            Report an issue in the <span class="font-medium text-gray-700 dark:text-gray-300">Issues</span> forum about
            <span class="font-medium text-gray-700 dark:text-gray-300">{{ objectTitle || 'Untitled' }}</span>.
          </ng-template>
        </p>

        <form id="raise-question-form" (ngSubmit)="submit()" class="space-y-3">
          <div>
            <label [attr.for]="titleId" class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input
              #titleInput
              [id]="titleId"
              name="rq-title"
              type="text"
              [(ngModel)]="title"
              class="w-full rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              [placeholder]="canOpenQuestion ? 'Short summary of the question' : 'Short summary of the issue'"
              required
            />
          </div>
          <div>
            <label [attr.for]="bodyId" class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
            <textarea
              [id]="bodyId"
              name="rq-body"
              [(ngModel)]="body"
              rows="4"
              class="w-full resize-none rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              [placeholder]="canOpenQuestion ? 'Describe the question or concern...' : 'Describe the issue...'"
              required
            ></textarea>
          </div>
        </form>

        <div class="flex items-center justify-end gap-2 mt-4">
          <button type="button" (click)="close()" class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors">Cancel</button>
          <button
            type="submit"
            form="raise-question-form"
            [disabled]="submitting() || !title().trim() || !body().trim()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            [class.bg-primary-600]="canOpenQuestion"
            [class.hover:bg-primary-700]="canOpenQuestion"
            [class.bg-red-600]="!canOpenQuestion"
            [class.hover:bg-red-700]="!canOpenQuestion"
          >
            <svg *ngIf="submitting()" class="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ submitting() ? 'Posting...' : (canOpenQuestion ? 'Post Question' : 'Report Issue') }}
          </button>
        </div>

        <div *ngIf="error()" class="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded px-3 py-2">{{ error() }}</div>
      </div>
    </div>
  `,
})
export class RaiseQuestionComponent implements AfterViewChecked, OnDestroy {
  private static idCounter = 0;
  @Input() objectType = '';
  @Input() objectId = '';
  @Input() objectTitle = '';
  @Input() objectRoute = '';
  @Input() buttonLabel = 'Question';

  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) {
      this.close();
    }
  }

  private dataService = inject(DataService);
  private router = inject(Router);
  private renderer = inject(Renderer2);

  isOpen = signal(false);
  title = signal('');
  body = signal('');
  submitting = signal(false);
  error = signal<string | null>(null);
  titleId = `rq-title-${++RaiseQuestionComponent.idCounter}`;
  bodyId = `rq-body-${RaiseQuestionComponent.idCounter}`;
  modalTitleId = `raise-question-title-${RaiseQuestionComponent.idCounter}`;
  private shouldFocus = false;

  /** Whether this entity type can have Open Questions linked to it. */
  get canOpenQuestion(): boolean {
    return SUPPORTS_OPEN_QUESTIONS.has(this.objectType);
  }

  ngAfterViewChecked() {
    if (this.shouldFocus && this.titleInput?.nativeElement) {
      this.titleInput.nativeElement.focus();
      this.shouldFocus = false;
    }
  }

  open() {
    if (this.canOpenQuestion) {
      const t = `Question about ${this.humanType()}: ${this.objectTitle || 'Untitled'}`;
      const link = this.objectLink();
      const b = link
        ? `This question was raised about [${this.objectTitle || 'Untitled'}](${link}).\n\n`
        : `This question was raised about ${this.humanType()} \`${this.objectId}\`.\n\n`;
      this.title.set(t);
      this.body.set(b);
    } else {
      const t = `Issue with ${this.humanType()}: ${this.objectTitle || 'Untitled'}`;
      const link = this.objectLink();
      const b = link
        ? `This issue was reported about [${this.objectTitle || 'Untitled'}](${link}).\n\n`
        : `This issue was reported about ${this.humanType()} \`${this.objectId}\`.\n\n`;
      this.title.set(t);
      this.body.set(b);
    }
    this.error.set(null);
    this.isOpen.set(true);
    this.shouldFocus = true;
    this.renderer.addClass(document.body, 'overflow-hidden');
  }

  close() {
    this.isOpen.set(false);
    this.renderer.removeClass(document.body, 'overflow-hidden');
  }

  ngOnDestroy() {
    this.renderer.removeClass(document.body, 'overflow-hidden');
  }

  submit() {
    const titleValue = this.title().trim();
    const bodyValue = this.body().trim();
    if (!titleValue || !bodyValue) return;
    this.submitting.set(true);
    this.error.set(null);

    this.dataService.createForumThread(FORUM_SLUG, {
      title: titleValue,
      body: bodyValue,
      postedById: DEFAULT_USER_ID,
    }).subscribe({
      next: ({ id: threadId }) => {
        if (this.canOpenQuestion) {
          this.saveOpenQuestionRecord(titleValue, bodyValue, threadId);
        } else {
          // Report Issue mode: forum thread is sufficient
          this.submitting.set(false);
          this.close();
          this.router.navigate(['/forums', FORUM_SLUG, threadId]);
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.message || 'Failed to create forum post');
      }
    });
  }

  private saveOpenQuestionRecord(titleValue: string, bodyValue: string, threadId: string) {
    const entityType = this.objectType || null;
    const entityId = this.objectId || null;
    const description = `${bodyValue}\n\n[Discuss in forum](/forums/${FORUM_SLUG}/${threadId})`;

    this.dataService.createOpenQuestion({
      title: titleValue,
      description,
      category: 'MISSING_INFO',
      blocking: false,
      createdBy: DEFAULT_USER_ID,
      entityType,
      entityId,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.close();
        this.router.navigate(['/forums', FORUM_SLUG, threadId]);
      },
      error: (err) => {
        console.error('Failed to create open question record:', err);
        this.submitting.set(false);
        this.close();
        this.router.navigate(['/forums', FORUM_SLUG, threadId]);
      }
    });
  }

  private humanType(): string {
    return this.objectType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private objectLink(): string {
    const route = this.objectRoute || this.routeForType(this.objectType);
    if (!route) return '';
    return `/${route}/${this.objectId}`;
  }

  private routeForType(type: string): string {
    return entityRouteForType(type) || type.replace(/_/g, '-');
  }
}
