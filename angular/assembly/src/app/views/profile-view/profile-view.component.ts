import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DataService, FeedPost, User } from '../../services/data.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';
import { TimeAgoComponent } from '../../components/time-ago/time-ago.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';

@Component({
  selector: 'app-profile-view',
  standalone: true,
  imports: [CommonModule, AvatarComponent, MarkdownRendererComponent, TimeAgoComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <div class="max-w-4xl mx-auto">
      <div *ngIf="loading()" class="space-y-3">
        <div class="app-panel p-4 space-y-2">
          <app-skeleton width="40%" height="1rem"></app-skeleton>
          <app-skeleton width="20%" height="0.75rem"></app-skeleton>
        </div>
      </div>

      <app-error-state *ngIf="error() && !loading()" title="Failed to load profile" [description]="error()!" (retry)="retry()"></app-error-state>

      <ng-container *ngIf="!loading() && !error() && user()">
        <div class="app-panel overflow-hidden mb-4">
          <div class="h-24 bg-gradient-to-r from-primary-500 to-accent-500"></div>
          <div class="p-4 -mt-8 flex items-end gap-4">
            <app-avatar [name]="user()!.name" [size]="80"></app-avatar>
            <div class="mb-1">
              <h1 class="text-lg font-bold text-gray-900">{{ user()!.name }}</h1>
              <p class="text-xs text-gray-500">&#64;{{ user()!.name }}</p>
            </div>
          </div>
          <div class="px-4 pb-4">
            <p class="text-sm text-gray-700">{{ user()!.email || 'No bio yet.' }}</p>
          </div>
        </div>

        <h2 class="text-sm font-semibold text-gray-900 mb-2">Posts</h2>
        <app-empty-state *ngIf="posts().length === 0" title="No posts" description="This user hasn't posted yet."></app-empty-state>
        <div class="space-y-3" *ngIf="posts().length > 0">
          <div *ngFor="let post of posts()" class="app-panel p-4">
            <div class="flex items-start gap-3">
              <app-avatar [name]="post.author.name" [size]="32"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold text-gray-900">{{ post.author.name }}</span>
                  <app-time-ago [date]="post.createdAt" class="text-xs text-gray-400"></app-time-ago>
                </div>
                <div class="mt-1 line-clamp-3">
                  <app-markdown-renderer [content]="post.content"></app-markdown-renderer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class ProfileViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  userId = signal<string>('');
  user = signal<User | null>(null);
  posts = signal<FeedPost[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id') || '';
      this.userId.set(id);
      this.load(id);
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getUser(id).subscribe({
      next: user => {
        this.user.set(user);
        this.loadPosts(user.name);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load profile');
        this.loading.set(false);
      }
    });
  }

  private loadPosts(name: string) {
    this.dataService.getFeed().subscribe({
      next: posts => {
        this.posts.set(posts.filter(p => p.author.name.toLowerCase() === name.toLowerCase()));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  retry() {
    this.load(this.userId());
  }
}
