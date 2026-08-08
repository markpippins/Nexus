import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TtsService } from '../../services/tts.service';

@Component({
  selector: 'app-tts-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      (click)="speak()"
      [disabled]="speaking()"
      [title]="hasError() ? 'TTS server unreachable' : speaking() ? 'Speaking...' : 'Listen to this content'"
      class="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded
             transition-all duration-150
             text-gray-400 hover:text-primary-600 hover:bg-primary-50
             dark:text-gray-500 dark:hover:text-primary-300 dark:hover:bg-primary-900/20
             disabled:opacity-50 disabled:cursor-wait"
      [class.text-red-500]="hasError()"
      [class.hover:text-red-600]="hasError()">
      <!-- Speaker icon -->
      <svg class="w-3.5 h-3.5" [class.animate-pulse]="speaking()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11 5L6 9H2v6h4l5 4V5z" />
        <path *ngIf="!speaking()" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
      </svg>
      <span>{{ speaking() ? 'Speaking...' : label }}</span>
    </button>
  `,
})
export class TtsButtonComponent {
  @Input() text = '';
  @Input() label = 'Listen';

  private tts = inject(TtsService);
  speaking = signal(false);
  hasError = signal(false);

  speak() {
    if (!this.text.trim() || this.speaking()) return;

    this.hasError.set(false);
    this.speaking.set(true);
    this.tts.speak(this.text).subscribe({
      next: () => {
        this.speaking.set(false);
      },
      error: () => {
        this.speaking.set(false);
        this.hasError.set(true);
        setTimeout(() => this.hasError.set(false), 2500);
      },
    });
  }
}
