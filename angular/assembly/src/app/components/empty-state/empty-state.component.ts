import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div class="relative w-24 h-24 sm:w-28 sm:h-28 mb-4 app-empty-illustration">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
          <circle cx="60" cy="60" r="52" class="text-steel-100 dark:text-steel-800" fill="currentColor" />
          <path d="M38 48h44v34H38z" class="text-white dark:text-steel-700" fill="currentColor" />
          <path d="M38 48h44v34H38z" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
          <path d="M47 57h22M47 66h22M47 75h14" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          <circle cx="82" cy="38" r="14" class="text-primary-100 dark:text-primary-900/40" fill="currentColor" />
          <path d="M76 38l4 4 8-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h3 class="text-sm sm:text-base font-semibold text-steel-900 dark:text-steel-100">{{ title() }}</h3>
      <p class="text-xs sm:text-sm text-steel-500 dark:text-steel-400 mt-1 max-w-xs">{{ description() }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  title = input('Nothing here');
  description = input('There are no items to display yet.');
}
