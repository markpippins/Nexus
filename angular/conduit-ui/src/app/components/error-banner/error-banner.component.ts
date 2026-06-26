import { Component, Input, Output, EventEmitter } from '@angular/core';
@Component({
  selector: 'app-error-banner',
  standalone: true,
  template: `<div class="error-banner">
    <div class="error-icon">⚠️</div>
    <div class="error-message">{{ message }}</div>
    @if (retryLabel) {
      <button class="retry-btn" (click)="retry.emit()">{{ retryLabel }}</button>
    }
  </div>`,
  styles: [`
    .error-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--accent-red-bg, #fef2f2);
      border: 1px solid var(--accent-red, #dc2626);
      border-radius: 8px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .error-icon {
      font-size: 20px;
      flex-shrink: 0;
    }
    .error-message {
      flex: 1;
      font-size: 13px;
      color: var(--accent-red-text, #991b1b);
      line-height: 1.4;
    }
    .retry-btn {
      background: var(--accent-red, #dc2626);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      flex-shrink: 0;
      transition: opacity 0.2s;
    }
    .retry-btn:hover {
      opacity: 0.85;
    }
  `],
})
export class ErrorBannerComponent {
  @Input() message = 'Something went wrong';
  @Input() retryLabel?: string;
  @Output() retry = new EventEmitter<void>();
}
