import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center space-y-2">
      <svg class="animate-spin h-10 w-10 text-[rgb(var(--color-accent-text))]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="text-[rgb(var(--color-text-subtle))]">Loading results...</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSpinnerComponent {}
