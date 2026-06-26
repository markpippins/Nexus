import { Component, Input, Output, EventEmitter, computed, signal, inject } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlanCard } from '../../services/types';
import { ConduitService } from '../../services/conduit.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-plan-card',
  standalone: true,
  imports: [NgClass, NgFor, FormsModule],
  templateUrl: './plan-card.component.html',
  styleUrls: ['./plan-card.component.scss'],
})
export class PlanCardComponent {
  @Input({ required: true }) plan!: PlanCard;
  @Input({ required: true }) status!: string;
  @Output() select = new EventEmitter<void>();

  private pipeline = inject(ConduitService);
  private toast = inject(ToastService);

  readonly expanded = signal(false);
  readonly showHardDeleteConfirm = signal(false);
  readonly hardDeleteTitleInput = signal('');
  readonly hardDeleting = signal(false);
  readonly hardDeleteError = signal('');

  readonly age = computed(() => {
    const created = new Date(this.plan.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  });

  getStatusColor(): string {
    switch (this.status) {
      case 'pending': return 'blue';
      case 'active': return 'green';
      case 'completed': return 'gray';
      case 'blocked': return 'red';
      default: return 'neutral';
    }
  }

  getBlockReasonLabel(reason?: string): string {
    if (!reason) return '';
    if (reason.includes('Stale Log')) return 'Builder stale';
    if (reason.includes('Hard Timeout')) return 'Builder timeout';
    return reason;
  }

  toggleExpanded() {
    this.expanded.update((v) => !v);
  }

  hasDetails(): boolean {
    return !!(
      this.plan.goal ||
      (this.plan.filesAffected && this.plan.filesAffected.length > 0) ||
      (this.plan.acceptanceCriteria && this.plan.acceptanceCriteria.length > 0) ||
      (this.plan.dependencies && this.plan.dependencies.length > 0)
    );
  }

  openHardDeleteConfirm(event: Event) {
    event.stopPropagation();
    this.hardDeleteTitleInput.set('');
    this.hardDeleteError.set('');
    this.showHardDeleteConfirm.set(true);
  }

  cancelHardDelete() {
    this.showHardDeleteConfirm.set(false);
    this.hardDeleteTitleInput.set('');
    this.hardDeleteError.set('');
  }

  confirmHardDelete() {
    if (this.hardDeleteTitleInput().trim() !== this.plan.title) {
      this.hardDeleteError.set(`Title must match exactly: "${this.plan.title}"`);
      return;
    }
    this.hardDeleting.set(true);
    this.hardDeleteError.set('');
    this.pipeline.hardDeletePlan(this.plan.planNumber, this.plan.title).subscribe({
      next: (result) => {
        this.hardDeleting.set(false);
        this.showHardDeleteConfirm.set(false);
        this.toast.push({
          id: `hard-delete-${this.plan.planNumber}`,
          type: 'hard_deleted',
          title: 'Plan Deleted',
          message: `#${this.plan.planNumber} permanently deleted — ${result.result.ticketsDeleted} ticket(s), ${result.result.receiptsDeleted} receipt(s) removed`,
          icon: '🗑',
          timestamp: new Date().toISOString(),
          priority: 'high',
        });
        this.pipeline.refresh();
      },
      error: (err) => {
        this.hardDeleting.set(false);
        const detail = err?.error?.error?.message || err?.message || 'Unknown error';
        this.hardDeleteError.set(`Failed: ${detail}`);
      },
    });
  }
}
