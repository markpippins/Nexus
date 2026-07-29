import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageSearchResult } from '../../models/image-search-result.model.js';
import { WebviewService } from '../../services/webview.service.js';

@Component({
  selector: 'app-image-result-list-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-result-list-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageResultListItemComponent {
  result = input.required<ImageSearchResult & { sourceMagnetPath?: string[] }>();
  isBookmarked = input(false);
  sourceMagnetPath = input<string[]>();
  bookmarkToggled = output<ImageSearchResult>();
  navigateToMagnet = output<string[]>();

  private webviewService = inject(WebviewService);

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  onMagnetClick(event: MouseEvent, path: string[]): void {
    event.stopPropagation();
    event.preventDefault();
    this.navigateToMagnet.emit(path);
  }

  openLink(event: MouseEvent): void {
    event.preventDefault();
    this.webviewService.open(this.result().url, this.result().description);
  }
}
