import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Thread, Comment } from '../../services/data.service';
import { DEFAULT_USER_ID } from '../../config/user.config';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';
import { TimeAgoComponent } from '../../components/time-ago/time-ago.component';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-thread-detail-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RaiseQuestionComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, MarkdownRendererComponent, TimeAgoComponent, AvatarComponent],
  templateUrl: './thread-detail-view.component.html',
})
export class ThreadDetailViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  thread = signal<Thread | null>(null);
  comments = signal<Comment[]>([]);
  replyBody = '';
  replyToCommentId = signal<string | null>(null);
  replyToAuthor = signal<string | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    const threadId = this.route.snapshot.paramMap.get('threadId') || '';
    this.dataService.getThread(threadId).subscribe({
      next: ({ thread, comments }) => {
        this.thread.set(thread);
        this.comments.set(comments);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load thread');
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

  replyTo(comment: Comment) {
    this.replyToCommentId.set(comment.id);
    this.replyToAuthor.set(comment.author.name);
    this.replyBody = `@${comment.author.name} `;
  }

  cancelReply() {
    this.replyToCommentId.set(null);
    this.replyToAuthor.set(null);
    this.replyBody = '';
  }

  submitReply() {
    if (!this.replyBody.trim() || !this.thread()) return;
    const threadId = this.route.snapshot.paramMap.get('threadId') || '';
    const postedById = DEFAULT_USER_ID;
    const parentId = this.replyToCommentId() || undefined;
    this.dataService.createComment(threadId, { body: this.replyBody.trim(), postedById, parentId }).subscribe({
      next: () => {
        this.replyBody = '';
        this.replyToCommentId.set(null);
        this.replyToAuthor.set(null);
        this.load();
      },
      error: err => {
        this.error.set(err.message || 'Failed to post reply');
      }
    });
  }

  childComments(parentId: string): Comment[] {
    return this.comments().filter(c => c.parentId === parentId);
  }

  rootComments(): Comment[] {
    return this.comments().filter(c => !c.parentId);
  }
}
