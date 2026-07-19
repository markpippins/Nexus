import { Component, Input, inject, signal, HostListener, ViewChild, ElementRef, AfterViewChecked, OnDestroy, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../services/data.service';

const FORUM_SLUG = 'issues-and-open-questions';

@Component({
  selector: 'app-raise-question',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <button
      (click)="open()"
      class="inline-flex items-center gap-1.5 px-2 h-6 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-all duration-150 hover:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.021-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-.98 2.5-2.5 2.95M12 17h.01"/>
      </svg>
      Question
    </button>

    <div
      *ngIf="isOpen()"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="raise-question-title"
    >
      <div class="absolute inset-0 bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm" (click)="close()"></div>
      <div class="relative w-full sm:w-auto sm:max-w-lg sm:rounded-lg app-panel p-4 shadow-xl max-h-[90vh] sm:max-h-none overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 id="raise-question-title" class="text-sm font-semibold text-gray-900 dark:text-gray-100">Raise Open Question</h3>
          <button (click)="close()" class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" aria-label="Close">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Create a new post in <span class="font-medium text-gray-700 dark:text-gray-300">Issues and Open Questions</span> linked to
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ objectTitle || 'Untitled' }}</span>.
        </p>

        <form id="raise-question-form" (ngSubmit)="submit()" class="space-y-3">
          <div>
            <label for="rq-title" class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input
              #titleInput
              id="rq-title"
              name="rq-title"
              type="text"
              [(ngModel)]="title"
              class="w-full rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder="Short summary of the question"
              required
            />
          </div>
          <div>
            <label for="rq-body" class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Body</label>
            <textarea
              id="rq-body"
              name="rq-body"
              [(ngModel)]="body"
              rows="4"
              class="w-full resize-none rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder="Describe the question or concern..."
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
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
          >
            <svg *ngIf="submitting()" class="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ submitting() ? 'Posting...' : 'Post Question' }}
          </button>
        </div>

        <div *ngIf="error()" class="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded px-3 py-2">{{ error() }}</div>
      </div>
    </div>
  `,
})
export class RaiseQuestionComponent implements AfterViewChecked, OnDestroy {
  @Input() objectType = '';
  @Input() objectId = '';
  @Input() objectTitle = '';
  @Input() objectRoute = '';

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
  private shouldFocus = false;

  ngAfterViewChecked() {
    if (this.shouldFocus && this.titleInput?.nativeElement) {
      this.titleInput.nativeElement.focus();
      this.shouldFocus = false;
    }
  }

  open() {
    const t = `Question about ${this.humanType()}: ${this.objectTitle || 'Untitled'}`;
    const link = this.objectLink();
    const b = link
      ? `This question was raised about [${this.objectTitle || 'Untitled'}](${link}).\n\n`
      : `This question was raised about ${this.humanType()} \`${this.objectId}\`.\n\n`;
    this.title.set(t);
    this.body.set(b);
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
    }).subscribe({
      next: ({ id }) => {
        this.submitting.set(false);
        this.close();
        this.router.navigate(['/forums', FORUM_SLUG, id]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.message || 'Failed to create forum post');
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
    const map: Record<string, string> = {
      work_request: 'work-requests',
      requirement: 'requirements',
      agenda: 'agendas',
      candidate: 'candidates',
      harvest: 'harvests',
      conversation: 'conversations',
      intent_record: 'intents',
      assessment: 'assessments',
      observation: 'observations',
      report: 'reports',
      agent_record: 'agent-records',
      agent: 'agents',
      specification: 'specifications',
      open_question: 'open-questions',
      open_questions: 'open-questions',
      forum: 'forums',
    };
    return map[type] || type.replace(/_/g, '-');
  }
}
