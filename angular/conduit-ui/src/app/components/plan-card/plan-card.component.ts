import { Component, Input, computed, signal } from '@angular/core';
import { NgClass, NgIf, NgFor } from '@angular/common';
import { PlanCard } from '../../services/types';

@Component({
  selector: 'app-plan-card',
  standalone: true,
  imports: [NgClass, NgIf, NgFor],
  templateUrl: './plan-card.component.html',
  styleUrls: ['./plan-card.component.scss'],
})
export class PlanCardComponent {
  @Input({ required: true }) plan!: PlanCard;
  @Input({ required: true }) status!: string;

  readonly expanded = signal(false);

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
}
