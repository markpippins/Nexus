import { Component, computed } from '@angular/core';
import { NgClass } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [NgClass],
  template: `<div class="toast-stack">
    @for (t of toasts(); track t.id) {
      <div class="toast-card" [ngClass]="'toast-' + t.priority + ' toast-type-' + t.type" (click)="dismiss(t.id)">
        <div class="toast-header">
          <span class="toast-icon">{{t.icon}}</span>
          <span class="toast-title">{{t.title}}</span>
          <button class="toast-close" (click)="$event.stopPropagation();dismiss(t.id)">×</button>
        </div>
        <div class="toast-message">{{t.message}}</div>
        <div class="toast-progress"><div class="toast-bar"></div></div>
      </div>
    }
  </div>`,
  styles: [`.toast-stack{position:fixed;top:60px;right:16px;z-index:1000;display:flex;flex-direction:column;gap:8px;max-width:340px;width:100%}.toast-card{background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:8px;padding:12px 14px;cursor:pointer;box-shadow:0 4px 16px var(--card-shadow);animation:slideIn 300ms ease-out}.toast-high{border-left:4px solid var(--accent-red)}.toast-normal{border-left:4px solid var(--accent-yellow)}.toast-type-run_started{border-left:4px solid var(--tag-green-text)}.toast-type-role_saved{border-left:4px solid var(--tag-green-text)}.toast-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}.toast-icon{font-size:14px}.toast-title{font-weight:600;font-size:13px;color:var(--text-primary);flex:1}.toast-close{background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:0 4px;line-height:1}.toast-close:hover{color:var(--text-primary)}.toast-message{font-size:12px;color:var(--text-secondary);margin-bottom:6px}.toast-progress{height:2px;background:var(--border-default);border-radius:1px;overflow:hidden}.toast-bar{height:100%;background:var(--accent-blue);animation:shrink 8s linear forwards}.toast-normal .toast-bar{animation-duration:5s}@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes shrink{from{width:100%}to{width:0%}}@media(max-width:768px){.toast-stack{right:8px;left:8px;max-width:none;top:auto;bottom:16px}.toast-card{animation:slideUp 300ms ease-out}@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}}`]
})
export class ToastContainerComponent {
  readonly toasts = computed(() => this.toastService.toasts());

  constructor(private toastService: ToastService) {}

  dismiss(id: string) { this.toastService.dismiss(id); }
}
