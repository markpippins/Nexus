import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  duration: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  toasts = signal<Toast[]>([]);

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success', duration: number = 4000): void {
    const newToast: Toast = {
      id: Date.now() + Math.random(),
      message,
      type: type === 'warning' ? 'info' : type, // Map warning to info for now or update Toast interface
      duration,
    };

    this.toasts.update(currentToasts => [...currentToasts, newToast]);

    setTimeout(() => {
      this.remove(newToast.id);
    }, duration);
  }

  showSuccess(message: string): void {
    this.show(message, 'success');
  }

  showError(message: string): void {
    this.show(message, 'error');
  }

  showInfo(message: string): void {
    this.show(message, 'info');
  }

  showWarning(message: string): void {
    this.show(message, 'warning');
  }

  remove(id: number): void {
    this.toasts.update(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }
}
