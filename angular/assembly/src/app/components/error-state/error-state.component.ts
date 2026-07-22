import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div class="relative w-24 h-24 sm:w-28 sm:h-28 mb-4 text-red-400 dark:text-red-500">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
          <circle cx="60" cy="60" r="52" class="text-red-100 dark:text-red-900/30" fill="currentColor" />
          <path d="M60 38v28M60 78h.01" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
          <circle cx="60" cy="60" r="40" stroke="currentColor" stroke-width="3" />
        </svg>
      </div>
      <h3 class="text-sm sm:text-base font-semibold text-steel-900 dark:text-steel-100">{{ title() }}</h3>
      <p class="text-xs sm:text-sm text-steel-500 dark:text-steel-400 mt-1 max-w-xs">{{ description() }}</p>
      <button *ngIf="showRetry()" (click)="retry.emit()" class="app-btn-primary mt-4">Retry</button>
    </div>
  `,
})
export class ErrorStateComponent {
  title = input('Something went wrong');
  description = input('We could not load the data. Please try again.');
  showRetry = input(true);
  retry = output<void>();
}
