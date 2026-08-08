import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleSearchResult } from '../../models/google-search-result.model.js';

@Component({
  selector: 'app-web-result-list-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './web-result-list-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebResultListItemComponent {
  result = input.required<GoogleSearchResult & { sourceMagnetPath?: string[] }>();
  isBookmarked = input(false);
  sourceMagnetPath = input<string[]>();
  bookmarkToggled = output<GoogleSearchResult>();
  navigateToMagnet = output<string[]>();

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  onMagnetClick(event: MouseEvent, path: string[]): void {
    event.stopPropagation();
    event.preventDefault();
    this.navigateToMagnet.emit(path);
  }

  openLink(event: MouseEvent): void {
    if (!this.result().link) {
      event.preventDefault();
      console.warn('WebResultListItem: no link to open for', this.result().title);
    }
    // else: browser handles native navigation via target="_blank"
  }
}
