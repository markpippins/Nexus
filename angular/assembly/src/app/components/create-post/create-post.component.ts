import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { DEFAULT_USER_ID } from '../../config/user.config';

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="app-panel p-3 mb-4">
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {{ currentUserInitial }}
        </div>
        <div class="flex-1 min-w-0">
          <label for="create-post-body" class="sr-only">Post body</label>
          <textarea
            id="create-post-body"
            name="body"
            [(ngModel)]="content"
            placeholder="What's on your mind?"
            rows="2"
            class="w-full resize-none rounded border border-gray-200 p-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
          ></textarea>
          <div class="flex items-center justify-between mt-2">
            <span class="text-[10px] text-gray-400">{{ content.length }} characters</span>
            <button
              (click)="submit()"
              [disabled]="!content.trim() || submitting"
              class="app-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ submitting ? 'Posting...' : 'Post' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CreatePostComponent {
  @Output() posted = new EventEmitter<void>();

  private dataService = inject(DataService);

  content = '';
  submitting = false;
  currentUserInitial = 'Y';

  submit() {
    const text = this.content.trim();
    if (!text) return;
    this.submitting = true;
    this.dataService.createFeedPost({ text, postedById: DEFAULT_USER_ID }).subscribe({
      next: () => {
        this.content = '';
        this.submitting = false;
        this.posted.emit();
      },
      error: () => {
        this.submitting = false;
      }
    });
  }
}
