import { Injectable, signal } from '@angular/core';

export interface GlobalError {
  message: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorService {
  readonly lastError = signal<GlobalError | null>(null);
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  show(message: string) {
    this.lastError.set({ message, timestamp: new Date().toISOString() });

    // Auto-clear after 8 seconds
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.lastError.set(null);
    }, 8000);
  }

  clear() {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.lastError.set(null);
  }
}
