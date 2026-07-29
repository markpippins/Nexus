import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageSearchResult } from '../../models/image-search-result.model.js';

@Component({
  selector: 'app-image-result-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-result-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageResultCardComponent {
  result = input.required<ImageSearchResult>();
  isBookmarked = input(false);
  bookmarkToggled = output<ImageSearchResult>();

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  openLink(event: MouseEvent): void {
    if (!this.result().url) {
      event.preventDefault();
      console.warn('ImageResultCard: no url to open for', this.result().description);
    }
    // else: browser handles native navigation via target="_blank"
  }
}
