import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { YoutubeSearchResult } from '../../models/youtube-search-result.model.js';
import { WebviewService } from '../../services/webview.service.js';

@Component({
  selector: 'app-youtube-result-list-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './youtube-result-list-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YoutubeResultListItemComponent {
  result = input.required<YoutubeSearchResult & { sourceMagnetPath?: string[] }>();
  isBookmarked = input(false);
  sourceMagnetPath = input<string[]>();
  bookmarkToggled = output<YoutubeSearchResult>();
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
    const embedUrl = `https://www.youtube.com/embed/${this.result().videoId}`;
    this.webviewService.open(embedUrl, this.result().title);
  }
}
