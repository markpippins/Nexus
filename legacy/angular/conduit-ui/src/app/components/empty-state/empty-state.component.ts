import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [NgIf],
  template: `<div class="empty-state">
    <div class="empty-icon">{{ icon }}</div>
    <div class="empty-title">{{ title }}</div>
    <div *ngIf="description" class="empty-desc">{{ description }}</div>
  </div>`,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 16px;
      gap: 8px;
    }
    .empty-icon {
      font-size: 36px;
      opacity: 0.5;
    }
    .empty-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-dim);
    }
    .empty-desc {
      font-size: 12px;
      color: var(--text-dim);
      opacity: 0.7;
      text-align: center;
      max-width: 280px;
    }
  `],
})
export class EmptyStateComponent {
  @Input() icon = '📭';
  @Input() title = 'No results';
  @Input() description?: string;
}
