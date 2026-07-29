import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface GeminiResult {
  query: string;
  text: string;
}

@Component({
  selector: 'app-gemini-result-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gemini-result-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeminiResultCardComponent {
  result = input.required<GeminiResult & { sourceMagnetPath?: string[] }>();
  isBookmarked = input(false);
  sourceMagnetPath = input<string[]>();
  bookmarkToggled = output<GeminiResult>();
  navigateToMagnet = output<string[]>();

  truncatedText = computed(() => {
    const text = this.result().text;
    if (text.length > 140) {
        return text.slice(0, 140) + '...';
    }
    return text;
  });

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  onMagnetClick(event: MouseEvent, path: string[]): void {
    event.stopPropagation();
    event.preventDefault();
    this.navigateToMagnet.emit(path);
  }
}
