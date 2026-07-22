import { Injectable, signal, computed } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastsSignal = signal<Toast[]>([]);
  toasts = computed(() => this.toastsSignal());

  show(message: string, type: Toast['type'] = 'info') {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type };
    this.toastsSignal.update(current => [...current, toast]);
    setTimeout(() => this.dismiss(id), 4000);
  }

  dismiss(id: string) {
    this.toastsSignal.update(current => current.filter(t => t.id !== id));
  }
}
