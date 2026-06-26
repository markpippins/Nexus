import { Component, signal, computed, output, model } from '@angular/core';
import { NgFor } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ConduitService } from '../../services/conduit.service';
import { PlanCard } from '../../services/types';

@Component({
  selector: 'app-plans-sidebar',
  standalone: true,
  imports: [NgFor, RouterModule],
  template: `
    <div
      class="sidebar-container"
      [style.width.px]="width()"
      [class.collapsed]="collapsed()"
    >
      <!-- Sidebar content -->
      @if (!collapsed()) {
        <div class="sidebar-inner">
        <div class="sidebar-header">
          <span class="header-title">Plans</span>
          <span class="header-count">{{ totalPlans() }}</span>
        </div>

        <div class="sidebar-groups">
          <ng-container *ngFor="let group of planGroups(); trackBy: trackGroup">
            @if (group.plans.length > 0) {
              <div class="group-header">
              <span class="group-label">{{ group.label }}</span>
              <span class="group-count">{{ group.plans.length }}</span>
            </div>
            }
            <a
              class="plan-item"
              *ngFor="let plan of group.plans; trackBy: trackPlan"
              [routerLink]="['/kanban']"
              [queryParams]="{ plan: plan.planNumber }"
              [class.active]="activePlan() === plan.planNumber"
              [title]="plan.title"
            >
              <span class="plan-badge" [class]="'badge-' + group.key">{{ group.key[0] }}</span>
              <span class="plan-info">
                <span class="plan-num">#{{ plan.planNumber }}</span>
                <span class="plan-title">{{ plan.title || plan.fileName }}</span>
              </span>
            </a>
          </ng-container>

          @if (totalPlans() === 0) {
            <div class="sidebar-empty">
              No plans loaded
            </div>
          }
        </div>
      </div>
      }

      <!-- Collapsed state -->
      @if (collapsed()) {
        <div class="sidebar-collapsed">
        <span class="collapsed-label" title="Show plans sidebar" (click)="collapsed.set(false)">☰</span>
      </div>
      }

      <!-- Resize handle -->
      <div
        class="resize-handle"
        [class.collapsed]="collapsed()"
        (mousedown)="startResize($event)"
        (dblclick)="toggleCollapse()"
        title="Drag to resize · Double-click to collapse"
      ></div>
    </div>
  `,
  styles: [
    `.sidebar-container{position:relative;display:flex;flex-direction:column;background:var(--bg-secondary,#1e293b);border-right:1px solid var(--border-default,#475569);overflow:hidden;flex-shrink:0;height:100%}`,
    `.sidebar-container.collapsed{width:32px!important;min-width:32px}`,
    `.sidebar-inner{display:flex;flex-direction:column;height:100%;overflow:hidden}`,
    `.sidebar-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 8px;border-bottom:1px solid var(--border-subtle,#334155);flex-shrink:0}`,
    `.header-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted,#94a3b8)}`,
    `.header-count{font-size:10px;font-weight:700;background:var(--bg-tertiary,#334155);color:var(--text-secondary,#cbd5e1);padding:1px 7px;border-radius:8px;line-height:1.6}`,
    `.sidebar-groups{flex:1;overflow-y:auto;padding:4px 0}`,
    `.group-header{display:flex;align-items:center;justify-content:space-between;padding:6px 12px 3px;margin-top:4px}`,
    `.group-header:first-child{margin-top:0}`,
    `.group-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim,#64748b)}`,
    `.group-count{font-size:9px;color:var(--text-dim,#64748b);background:var(--bg-primary,#0f172a);padding:0 5px;border-radius:6px;line-height:1.5}`,
    `.plan-item{display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;text-decoration:none;transition:background .12s;border-left:2px solid transparent}`,
    `.plan-item:hover{background:var(--bg-primary,#0f172a)}`,
    `.plan-item.active{background:var(--accent-blue-bg,#1e3a5f);border-left-color:var(--accent-blue,#3b82f6)}`,
    `.plan-badge{width:16px;height:16px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;color:#fff}`,
    `.badge-P{background:#3b82f6}`,
    `.badge-A{background:#22c55e}`,
    `.badge-C{background:#64748b}`,
    `.badge-B{background:#ef4444}`,
    `.plan-info{flex:1;min-width:0;overflow:hidden}`,
    `.plan-num{font-size:10px;font-family:monospace;color:var(--text-muted,#94a3b8);display:block}`,
    `.plan-title{font-size:12px;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;line-height:1.3}`,
    `.sidebar-empty{padding:20px 12px;text-align:center;font-size:12px;color:var(--text-dim,#64748b)}`,
    `.sidebar-collapsed{display:flex;align-items:center;justify-content:center;height:100%;cursor:pointer}`,
    `.collapsed-label{font-size:16px;color:var(--text-muted,#94a3b8);padding:4px}`,
    `.collapsed-label:hover{color:var(--text-primary,#f1f5f9)}`,
    `.resize-handle{position:absolute;top:0;right:-3px;bottom:0;width:6px;cursor:col-resize;z-index:10;background:transparent;transition:background .15s}`,
    `.resize-handle:hover,.resize-handle:active{background:var(--accent-blue,#3b82f6);opacity:.5}`,
    `.resize-handle.collapsed{display:none}`,
  ],
})
export class PlansSidebarComponent {
  readonly width = model(280);
  readonly collapsed = model(false);
  readonly activePlan = signal<string | null>(null);

  constructor(public pipeline: ConduitService) {}

  readonly totalPlans = computed(() => {
    const state = this.pipeline.state();
    if (!state) return 0;
    return state.plans.pending.length + state.plans.active.length +
      state.plans.completed.length + state.plans.blocked.length;
  });

  readonly planGroups = computed(() => {
    const state = this.pipeline.state();
    if (!state) return [];

    const groups: { key: string; label: string; plans: PlanCard[] }[] = [
      { key: 'P', label: 'Pending', plans: state.plans.pending || [] },
      { key: 'A', label: 'Active', plans: state.plans.active || [] },
      { key: 'C', label: 'Completed', plans: state.plans.completed || [] },
      { key: 'B', label: 'Blocked', plans: state.plans.blocked || [] },
    ];

    return groups.filter(g => g.plans.length > 0);
  });

  trackGroup(_i: number, g: { key: string }): string { return g.key; }
  trackPlan(_i: number, p: PlanCard): string { return p.planNumber; }

  startResize(event: MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width();

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(500, startWidth + (e.clientX - startX)));
      this.width.set(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  toggleCollapse(): void {
    this.collapsed.update(v => !v);
  }
}
