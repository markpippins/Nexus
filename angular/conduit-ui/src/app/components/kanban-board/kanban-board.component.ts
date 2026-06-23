import { Component, computed, signal, effect, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ConduitService } from '../../services/conduit.service';
import { PlanCard } from '../../services/types';
import { PlanCardComponent } from '../plan-card/plan-card.component';
import { PlanDetailComponent } from '../plan-detail/plan-detail.component';
import { KeyboardShortcutService } from '../../services/keyboard.service';

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, PlanCardComponent, PlanDetailComponent],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.scss'],
})
export class KanbanBoardComponent implements OnInit, OnDestroy {
  readonly archivedExpanded = signal(false);
  readonly archivedPageSize = signal(20);
  readonly archivedPage = signal(0);

  /** Index into the flat plan list for j/k navigation */
  readonly focusedIndex = signal(0);
  readonly selectedPlan = signal<PlanCard | null>(null);

  /** Plan number from URL query param, set on navigation */
  private readonly planParam = signal<string | null>(null);

  readonly columns = signal([
    { key: 'pending' as const, label: 'Pending', color: 'blue' as const },
    { key: 'active' as const, label: 'Active', color: 'green' as const },
    { key: 'completed' as const, label: 'Completed', color: 'gray' as const },
    { key: 'blocked' as const, label: 'Blocked', color: 'red' as const },
    { key: 'archived' as const, label: 'Archived', color: 'neutral' as const },
  ]);

  readonly state = computed(() => this.pipeline.state());
  readonly pending = computed(() => this.state()?.plans.pending ?? []);
  readonly active = computed(() => this.state()?.plans.active ?? []);
  readonly completed = computed(() => this.state()?.plans.completed ?? []);
  readonly blocked = computed(() => this.state()?.plans.blocked ?? []);
  readonly archived = computed(() => this.state()?.plans.archived ?? []);

  /** Flat list of all visible plan cards for keyboard navigation */
  readonly allPlans = computed(() => {
    const plans: PlanCard[] = [];
    for (const col of this.columns()) {
      plans.push(...this.getColumnPlans(col.key));
    }
    return plans;
  });

  private querySub: Subscription | null = null;

  constructor(
    private pipeline: ConduitService,
    private kb: KeyboardShortcutService,
    private route: ActivatedRoute,
  ) {
    // Reactively select plan when both query param and pipeline data are available
    effect(() => {
      const num = this.planParam();
      if (!num) return;
      const plan = this.allPlans().find(p => p.planNumber === num);
      if (plan) this.selectedPlan.set(plan);
    });
  }

  ngOnInit(): void {
    // Read ?plan= from URL and store in signal (pipeline may not be loaded yet)
    this.querySub = this.route.queryParamMap.subscribe(params => {
      this.planParam.set(params.get('plan'));
    });

    this.kb.registerView('kanban-board', [
      {
        key: 'j',
        description: 'Move down through plans',
        handler: () => this.navigateByOffset(1),
        preventDefault: true,
      },
      {
        key: 'k',
        description: 'Move up through plans',
        handler: () => this.navigateByOffset(-1),
        preventDefault: true,
      },
      {
        key: 'Enter',
        description: 'Select highlighted plan',
        handler: () => this.openHighlighted(),
        preventDefault: true,
      },
    ]);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.kb.unregisterView('kanban-board');
  }

  private navigateByOffset(offset: number): void {
    const plans = this.allPlans();
    if (plans.length === 0) return;
    let idx = this.focusedIndex() + offset;
    if (idx < 0) idx = plans.length - 1;
    if (idx >= plans.length) idx = 0;
    this.focusedIndex.set(idx);
    // Scroll the focused plan into view
    this.scrollToPlan(plans[idx]);
  }

  private openHighlighted(): void {
    const plans = this.allPlans();
    const idx = this.focusedIndex();
    if (plans.length > 0 && idx >= 0 && idx < plans.length) {
      this.selectedPlan.set(plans[idx]);
    }
  }

  private scrollToPlan(plan: PlanCard): void {
    // The plan cards are rendered in the DOM — we scroll by locating
    // the card element whose title matches (approximate).
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `app-plan-card[ng-reflect-plan="${plan.planNumber}"]`,
      );
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  getColumnPlans(key: string): PlanCard[] {
    switch (key) {
      case 'pending': return this.pending();
      case 'active': return this.active();
      case 'completed': return this.completed();
      case 'blocked': return this.blocked();
      case 'archived': return this.archivedExpanded()
        ? this.archived().slice(0, (this.archivedPage() + 1) * this.archivedPageSize())
        : [];
      default: return [];
    }
  }

  toggleArchived() {
    this.archivedExpanded.update((v) => !v);
    if (!this.archivedExpanded()) {
      this.archivedPage.set(0);
    }
  }

  loadMoreArchived() {
    this.archivedPage.update((p) => p + 1);
  }

  archivedRemaining(): number {
    return Math.max(0, this.archived().length - (this.archivedPage() + 1) * this.archivedPageSize());
  }
}
