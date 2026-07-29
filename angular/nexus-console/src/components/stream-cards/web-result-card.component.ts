import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleSearchResult } from '../../models/google-search-result.model.js';

@Component({
  selector: 'app-web-result-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './web-result-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebResultCardComponent {
  result = input.required<GoogleSearchResult>();
  isBookmarked = input(false);
  bookmarkToggled = output<GoogleSearchResult>();

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  openLink(event: MouseEvent): void {
    if (!this.result().link) {
      event.preventDefault();
      console.warn('WebResultCard: no link to open for', this.result().title);
    }
    // else: browser handles native navigation via target="_blank"
  }
}
