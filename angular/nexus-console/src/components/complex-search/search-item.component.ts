import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchItem } from '../../models/google-custom-search.model.js';

@Component({
  selector: 'app-search-item',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if(item(); as it) {
      <div class="bg-[rgb(var(--color-surface))]/50 p-4 rounded-lg border border-[rgb(var(--color-border-base))] hover:border-[rgb(var(--color-accent-ring))] transition-all duration-300 transform hover:-translate-y-1">
        <div class="flex items-start gap-4">
          @if (it.pagemap?.cse_thumbnail?.[0]?.src; as thumb) {
            <div class="w-20 h-20 flex-shrink-0 bg-[rgb(var(--color-surface-muted))] rounded-md overflow-hidden">
              <img [src]="thumb" [alt]="it.title" class="w-full h-full object-cover">
            </div>
          }
          <div class="flex-grow min-w-0">
            <a [href]="it.link" target="_blank" rel="noopener noreferrer" class="text-[rgb(var(--color-accent-text))] text-xs truncate block">{{ it.displayLink }}</a>
            <a [href]="it.link" target="_blank" rel="noopener noreferrer">
              <h3 class="text-xl font-semibold text-[rgb(var(--color-text-base))] hover:text-[rgb(var(--color-accent-text))] transition-colors mt-1" [innerHTML]="it.htmlTitle"></h3>
            </a>
            <p class="text-[rgb(var(--color-text-subtle))] mt-2 text-sm" [innerHTML]="it.htmlSnippet"></p>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchItemComponent {
  item = input.required<SearchItem>();
}
