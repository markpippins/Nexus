import { Injectable, signal } from '@angular/core';

export interface ToastEntry {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string;
  timestamp: string;
  priority: string;
}

/**
 * Minimal toast service for tackle-ui.
 * Pushes toast entries that the AI config dialog uses for feedback.
 * In standalone mode, toasts are displayed via a simple built-in container.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastEntry[]>([]);

  push(entry: ToastEntry): void {
    this.toasts.update(t => [...t, entry]);
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      this.toasts.update(t => t.filter(x => x.id !== entry.id));
    }, 4000);
  }

  dismiss(id: string): void {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }
}
