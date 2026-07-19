import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DataService, SearchResult } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';

@Component({
  selector: 'app-search-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './search-view.component.html',
})
export class SearchViewComponent implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);

  loading = signal(false);
  error = signal<string | null>(null);
  query = signal('');
  results = signal<SearchResult[]>([]);

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const q = params.get('q') || '';
      this.query.set(q);
      if (q.trim().length >= 2) {
        this.search(q);
      } else {
        this.results.set([]);
        this.error.set(null);
      }
    });
  }

  search(q: string) {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.search(q).subscribe({
      next: res => {
        this.results.set(res.results);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to search');
        this.loading.set(false);
      }
    });
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      forum: 'Forum',
      'work-request': 'Work Request',
      requirement: 'Requirement',
      'agent-record': 'Agent Record',
      'open-question': 'Open Question',
    };
    return labels[type] || type;
  }
}
