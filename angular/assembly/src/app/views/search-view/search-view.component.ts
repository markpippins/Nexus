import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, of } from 'rxjs';
import {
  switchMap,
  debounceTime,
  distinctUntilChanged,
  catchError,
  tap,
  map,
} from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService, SearchResult } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';

interface TypeEntry {
  type: string;
  label: string;
  count: number;
}

@Component({
  selector: 'app-search-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent, ErrorStateComponent, StatusBadgeComponent],
  templateUrl: './search-view.component.html',
})
export class SearchViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  loading = signal(false);
  error = signal<string | null>(null);
  query = signal('');
  results = signal<SearchResult[]>([]);
  total = signal(0);
  selectedTypes = signal<Set<string>>(new Set());

  private searchTrigger$ = new Subject<string>();

  description = computed(() => {
    const q = this.query();
    return q ? `Results for "${q}"` : 'Search across Assembly';
  });

  typeEntries = computed<TypeEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const result of this.results()) {
      counts.set(result.type, (counts.get(result.type) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count, label: this.typeLabel(type) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  filteredResults = computed(() => {
    const selected = this.selectedTypes();
    if (selected.size === 0) return this.results();
    return this.results().filter(r => selected.has(r.type));
  });

  constructor() {
    this.searchTrigger$
      .pipe(
        debounceTime(150),
        map(q => q.trim()),
        distinctUntilChanged(),
        tap(q => {
          this.query.set(q);
          this.error.set(null);
        }),
        switchMap(q => {
          if (q.length < 2) {
            this.results.set([]);
            this.total.set(0);
            this.loading.set(false);
            return of(null);
          }
          this.loading.set(true);
          return this.dataService.search(q).pipe(
            catchError(err => {
              this.error.set(err.message || 'Failed to search');
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(res => {
        if (res) {
          this.results.set(res.results);
          this.total.set(res.total);
        }
        this.loading.set(false);
      });
  }

  ngOnInit() {
    this.route.queryParamMap
      .pipe(
        map(params => params.get('q') || ''),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(q => {
        this.selectedTypes.set(new Set());
        this.searchTrigger$.next(q);
      });
  }

  search(q: string) {
    this.searchTrigger$.next(q);
  }

  toggleType(type: string) {
    this.selectedTypes.update(set => {
      const next = new Set(set);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  isSelected(type: string): boolean {
    return this.selectedTypes().has(type);
  }

  clearFilters() {
    this.selectedTypes.set(new Set());
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      forum: 'Forum',
      thread: 'Thread',
      post: 'Post',
      'work-request': 'Work Request',
      requirement: 'Requirement',
      agenda: 'Agenda',
      candidate: 'Candidate',
      harvest: 'Harvest',
      conversation: 'Conversation',
      'open-question': 'Open Question',
      intent: 'Intent Record',
      assessment: 'Assessment',
      observation: 'Observation',
      'agent-record': 'Agent Record',
      report: 'Report',
      specification: 'Specification',
      spec: 'Spec',
      plan: 'Plan',
      user: 'User',
    };
    return labels[type] || type;
  }
}
