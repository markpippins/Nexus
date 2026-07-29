import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AcademicSearchResult } from '../../models/academic-search-result.model.js';

@Component({
  selector: 'app-academic-result-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './academic-result-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcademicResultCardComponent {
  result = input.required<AcademicSearchResult>();
  isBookmarked = input(false);
  bookmarkToggled = output<AcademicSearchResult>();

  onToggleBookmark(): void {
    this.bookmarkToggled.emit(this.result());
  }

  openLink(event: MouseEvent): void {
    if (!this.result().link) {
      event.preventDefault();
      console.warn('AcademicResultCard: no link to open for', this.result().title);
    }
    // else: browser handles native navigation via target="_blank"
  }
}
