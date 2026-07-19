import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService, FeedPost } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { CreatePostComponent } from '../../components/create-post/create-post.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';
import { TimeAgoComponent } from '../../components/time-ago/time-ago.component';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-feed-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, RaiseQuestionComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, CreatePostComponent, MarkdownRendererComponent, TimeAgoComponent, AvatarComponent],
  templateUrl: './feed-view.component.html',
})
export class FeedViewComponent implements OnInit {
  private dataService = inject(DataService);
  posts = signal<FeedPost[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getFeed().subscribe({
      next: posts => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load feed');
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
