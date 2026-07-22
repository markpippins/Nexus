import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DataService, FeedPost } from '../../services/data.service';
import { sortItems, SortDir, toggleSort } from '../../utils/sort';
import { readSortFromSnapshot, writeSortToQueryParams } from '../../utils/query-sort';
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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  posts = signal<FeedPost[]>([]);
  sortField = signal<string>('createdAt');
  sortDir = signal<SortDir>('desc');
  sortedPosts = computed(() => sortItems<FeedPost>(this.posts(), this.sortField(), this.sortDir()));
  loading = signal(true);
  deleting = signal<string | null>(null);
  error = signal<string | null>(null);

  ngOnInit() {
    const saved = readSortFromSnapshot(this.route, 'createdAt', 'desc');
    this.sortField.set(saved.field);
    this.sortDir.set(saved.dir);
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

  toggleSort(field: string) {
    const next = toggleSort(this.sortField(), this.sortDir(), field);
    this.sortField.set(next.field);
    this.sortDir.set(next.dir);
    writeSortToQueryParams(this.router, this.route, next.field, next.dir);
  }

  retry() {
    this.load();
  }

  deletePost(id: string) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    this.deleting.set(id);
    this.dataService.deletePost(id).subscribe({
      next: () => {
        this.posts.update(posts => posts.filter(p => p.id !== id));
        this.deleting.set(null);
      },
      error: () => {
        this.deleting.set(null);
        this.error.set('Failed to delete post');
      }
    });
  }

  likePost(id: string) {
    // Placeholder: backend does not yet expose a like endpoint.
    console.log('Like post', id);
  }

  sharePost(post: FeedPost) {
    if (navigator.share) {
      navigator.share({
        title: post.title || 'Assembly post',
        text: post.content.slice(0, 200),
        url: window.location.origin + (post.forum ? `/forums/${post.forum.slug}/${post.id}` : `/feed`),
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.origin + (post.forum ? `/forums/${post.forum.slug}/${post.id}` : `/feed`));
    }
  }

  formatDate(date: string) {
    return new Date(date).toLocaleString();
  }
}
