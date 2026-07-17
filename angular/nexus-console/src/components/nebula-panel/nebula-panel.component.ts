import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NebulaService,
  NebulaRequirement,
  RequirementStatus,
} from '../../services/nebula.service.js';
import { CpfFunnelComponent } from '../cpf-funnel/cpf-funnel.component.js';
import { ToastService } from '../../services/toast.service.js';

@Component({
  selector: 'app-nebula-panel',
  standalone: true,
  imports: [CommonModule, CpfFunnelComponent],
  templateUrl: './nebula-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full'
  }
})
export class NebulaPanelComponent implements OnInit, OnDestroy {
  /** Active tab — 'requirements' shows the kanban, 'funnel' shows the CPF funnel */
  activeTab = signal<'requirements' | 'funnel'>('requirements');

  nebula = inject(NebulaService);
  private toast = inject(ToastService);

  draggingReqId = signal<string | null>(null);

  readonly groupedByStatus = computed(() => {
    const groups: Record<string, NebulaRequirement[]> = {};
    for (const col of this.columns) {
      groups[col] = [];
    }
    for (const req of this.requirements()) {
      if (groups[req.status]) {
        groups[req.status].push(req);
      }
    }
    return groups;
  });

  readonly columns = this.nebula.columns;
  readonly requirements = this.nebula.requirements;
  readonly connected = this.nebula.connected;
  readonly loading = this.nebula.loading;
  readonly error = this.nebula.error;

  ngOnInit(): void {
    this.nebula.startPolling(30_000);
  }

  ngOnDestroy(): void {
    // Service polling is shared across component instances — only stop if
    // the service tracks reference counts (future enhancement). For now,
    // polling continues while any component references the singleton.
  }

  getRequirementsForColumn(status: RequirementStatus): NebulaRequirement[] {
    return this.groupedByStatus()[status] ?? [];
  }

  columnLabel(status: RequirementStatus): string {
    const labels: Record<string, string> = {
      Backlog: 'Backlog',
      ToDo: 'To Do',
      InProgress: 'In Progress',
      Active: 'Active',
      Blocked: 'Blocked',
      Done: 'Done',
      Cancelled: 'Cancelled',
      Accepted: 'Accepted',
    };
    return labels[status] ?? status;
  }

  columnColor(status: RequirementStatus): string {
    const colors: Record<string, string> = {
      Backlog: 'var(--color-text-muted)',
      ToDo: 'var(--color-accent-text)',
      InProgress: 'var(--color-warning-text, #f59e0b)',
      Done: 'var(--color-success-text, #10b981)',
      Blocked: 'var(--color-danger-text, #ef4444)',
      Cancelled: 'var(--color-danger-text, #ef4444)',
    };
    return colors[status] ?? 'var(--color-text-muted)';
  }

  priorityBadge(priority: string): string {
    const classes: Record<string, string> = {
      High: 'bg-red-500/10 text-red-400',
      Medium: 'bg-yellow-500/10 text-yellow-400',
      Low: 'bg-green-500/10 text-green-400',
    };
    return classes[priority] ?? '';
  }

  typeBadge(reqType: string): string {
    const classes: Record<string, string> = {
      Epic: 'bg-purple-500/10 text-purple-400',
      Story: 'bg-blue-500/10 text-blue-400',
      Task: 'bg-gray-500/10 text-gray-400',
      Bug: 'bg-red-500/10 text-red-400',
    };
    return classes[reqType] ?? '';
  }

  onDragStart(reqId: string, event: DragEvent): void {
    this.draggingReqId.set(reqId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', reqId);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(targetStatus: RequirementStatus, event: DragEvent): void {
    event.preventDefault();
    const reqId = this.draggingReqId();
    if (reqId) {
      const req = this.requirements().find((r) => r.id === reqId);
      if (req && req.status !== targetStatus) {
        this.nebula.updateStatus(reqId, targetStatus).catch((err) => {
          this.toast.show(`Failed to move: ${(err as Error).message}`, 'error');
        });
      }
    }
    this.draggingReqId.set(null);
  }

  onDragEnd(): void {
    this.draggingReqId.set(null);
  }

  refresh(): void {
    this.nebula.loadAll();
  }

  totalCount = computed(() => this.requirements().length);
}
