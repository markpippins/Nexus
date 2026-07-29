import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

interface GeminiResult {
  query: string;
  text: string;
}

@Component({
  selector: 'app-gemini-result-list-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gemini-result-list-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeminiResultListItemComponent {
  result = input.required<GeminiResult & { sourceMagnetPath?: string[] }>();
  isBookmarked = input(false);
  sourceMagnetPath = input<string[]>();
  bookmarkToggled = output<GeminiResult>();
  navigateToMagnet = output<string[]>();

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  onMagnetClick(event: MouseEvent, path: string[]): void {
    event.stopPropagation();
    event.preventDefault();
    this.navigateToMagnet.emit(path);
  }
}
