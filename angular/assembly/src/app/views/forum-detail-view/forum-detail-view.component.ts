import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Forum, Thread } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { TableSkeletonComponent } from '../../components/skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { TimeAgoComponent } from '../../components/time-ago/time-ago.component';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-forum-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, TableSkeletonComponent, EmptyStateComponent, ErrorStateComponent, TimeAgoComponent, AvatarComponent],
  templateUrl: './forum-detail-view.component.html',
})
export class ForumDetailViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  forum = signal<Forum | null>(null);
  threads = signal<Thread[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    this.dataService.getForums().subscribe({
      next: forums => {
        this.forum.set(forums.find(f => f.slug === slug) || null);
        this.dataService.getThreads(slug).subscribe({
          next: threads => {
            this.threads.set(threads);
            this.loading.set(false);
          },
          error: err => {
            this.error.set(err.message || 'Failed to load threads');
            this.loading.set(false);
          }
        });
      },
      error: err => {
        this.error.set(err.message || 'Failed to load forum');
        this.loading.set(false);
      }
    });
  }

  retry() {
    this.load();
  }

  formatDate(date: string) {
    return new Date(date).toLocaleString();
  }
}
