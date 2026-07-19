import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService, Forum } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { AvatarComponent } from '../../components/avatar/avatar.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';

@Component({
  selector: 'app-forums-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, AvatarComponent, RaiseQuestionComponent],
  templateUrl: './forums-view.component.html',
})
export class ForumsViewComponent implements OnInit {
  private dataService = inject(DataService);
  forums = signal<Forum[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getForums().subscribe({
      next: forums => {
        this.forums.set(forums);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load forums');
        this.loading.set(false);
      }
    });
  }

  retry() {
    this.load();
  }
}
