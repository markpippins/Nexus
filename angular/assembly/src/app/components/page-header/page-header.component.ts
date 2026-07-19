import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
      <div class="min-w-0">
        <h1 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{{ title }}</h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ description }}</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{{ count }} total</span>
        <button *ngIf="showAction" (click)="action.emit()" class="app-btn-primary">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          {{ actionLabel }}
        </button>
        <ng-content select="[action]"></ng-content>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() count = 0;
  @Input() showAction = false;
  @Input() actionLabel = 'New';
  @Output() action = new EventEmitter<void>();
}
