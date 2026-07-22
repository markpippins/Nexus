import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span [class]="classes">{{ label }}</span>`,
})
export class StatusBadgeComponent {
  @Input() status = '';

  get label(): string {
    return (this.status || '').replace(/_/g, ' ');
  }

  get classes(): string {
    const base = 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize border ';
    const map: Record<string, string> = {
      open: 'bg-amber-50 text-amber-700 border-amber-200',
      resolved: 'bg-green-50 text-green-700 border-green-200',
      closed: 'bg-gray-100 text-gray-600 border-gray-200',
      pending: 'bg-gray-100 text-gray-600 border-gray-200',
      in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
      completed: 'bg-green-50 text-green-700 border-green-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
      promoted: 'bg-green-50 text-green-700 border-green-200',
      draft: 'bg-gray-100 text-gray-600 border-gray-200',
      specified: 'bg-green-50 text-green-700 border-green-200',
      high: 'bg-red-50 text-red-700 border-red-200',
      medium: 'bg-amber-50 text-amber-700 border-amber-200',
      low: 'bg-blue-50 text-blue-700 border-blue-200',
      approved: 'bg-green-50 text-green-700 border-green-200',
      active: 'bg-blue-50 text-blue-700 border-blue-200',
      review: 'bg-amber-50 text-amber-700 border-amber-200',
      accepted: 'bg-green-50 text-green-700 border-green-200',
      escalate: 'bg-red-50 text-red-700 border-red-200',
      triage: 'bg-amber-50 text-amber-700 border-amber-200',
      plan_create: 'bg-gray-100 text-gray-600 border-gray-200',
      proposed: 'bg-amber-50 text-amber-700 border-amber-200',
      planning: 'bg-blue-50 text-blue-700 border-blue-200',
      review_pass: 'bg-green-50 text-green-700 border-green-200',
      review_reject: 'bg-red-50 text-red-700 border-red-200',
      critique: 'bg-amber-50 text-amber-700 border-amber-200',
      critique_pass: 'bg-green-50 text-green-700 border-green-200',
      critique_reject: 'bg-red-50 text-red-700 border-red-200',
      implementation: 'bg-blue-50 text-blue-700 border-blue-200',
      block: 'bg-red-50 text-red-700 border-red-200',
      plan_block: 'bg-red-50 text-red-700 border-red-200',
      api_limit: 'bg-gray-100 text-gray-600 border-gray-200',
    };
    return base + (map[this.status?.toLowerCase()] || 'bg-gray-100 text-gray-600 border-gray-200');
  }
}
