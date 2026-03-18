import { Component, ChangeDetectionStrategy, output } from '@angular/core';
import { GeminiSearchComponent } from '../gemini-search/gemini-search.component.js';
import { GeminiSearchParams } from '../../services/gemini.service.js';

@Component({
  selector: 'app-gemini-search-dialog',
  standalone: true,
  imports: [GeminiSearchComponent],
  template: `
    <div class="fixed inset-0 bg-slate-900 bg-opacity-90 z-[70] flex p-4 sm:p-6 md:p-8" (click)="close.emit()">
      <div class="w-full h-full bg-transparent flex flex-col" (click)="$event.stopPropagation()">
        <div class="flex-shrink-0 flex justify-end mb-4">
          <button (click)="close.emit()" class="p-2 rounded-full bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto rounded-lg">
          <app-gemini-search (search)="onSearch($event)"></app-gemini-search>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'close.emit()',
  },
})
export class GeminiSearchDialogComponent {
  close = output<void>();
  search = output<GeminiSearchParams>();

  onSearch(params: GeminiSearchParams): void {
    this.search.emit(params);
    this.close.emit();
  }
}