import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <div
        *ngFor="let toast of toastService.toasts()"
        class="pointer-events-auto flex items-start gap-2 px-4 py-3 rounded shadow-lg text-sm max-w-sm transform transition-all duration-200"
        [ngClass]="{
          'bg-green-600 text-white': toast.type === 'success',
          'bg-red-600 text-white': toast.type === 'error',
          'bg-steel-800 text-white': toast.type === 'info'
        }"
      >
        <span class="flex-1">{{ toast.message }}</span>
        <button
          (click)="toastService.dismiss(toast.id)"
          class="ml-2 text-white/80 hover:text-white"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  `,
})
export class ToastComponent {
  toastService = inject(ToastService);
}
