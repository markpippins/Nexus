import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DataService, Forum } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { IconComponent } from '../../components/icon/icon.component';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-settings-view',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, SkeletonComponent, ErrorStateComponent, IconComponent],
  template: `
    <div class="max-w-5xl mx-auto">
      <app-page-header title="Settings" description="Configure your Assembly experience and manage forums."></app-page-header>

      <!-- Forums Management -->
      <div class="app-panel p-4 mb-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Forums</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create, rename, and manage discussion forums. Drag the grip handles to reorder.</p>
          </div>
          <button (click)="showCreateForm.set(true)" class="app-btn-primary text-xs flex items-center gap-1.5">
            <app-icon name="plus" class="w-3.5 h-3.5"></app-icon>
            New Forum
          </button>
        </div>

        <!-- Create Forum Form -->
        <div *ngIf="showCreateForm()" class="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30">
          <h3 class="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-3">Create New Forum</h3>
          <div class="space-y-2.5">
            <div>
              <label class="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <input
                [(ngModel)]="newForum.name"
                placeholder="e.g. Architecture Decisions"
                class="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-steel-800 px-2.5 py-1.5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label class="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Slug</label>
              <input
                [(ngModel)]="newForum.slug"
                placeholder="e.g. architecture-decisions"
                class="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-steel-800 px-2.5 py-1.5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              />
            </div>
            <div>
              <label class="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
              <textarea
                [(ngModel)]="newForum.description"
                placeholder="Brief description of this forum's purpose"
                rows="2"
                class="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-steel-800 px-2.5 py-1.5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              ></textarea>
            </div>
          </div>
          <div class="flex items-center gap-2 mt-3">
            <button (click)="createForum()" [disabled]="creating() || !newForum.name || !newForum.slug" class="app-btn-primary text-xs">
              {{ creating() ? 'Creating...' : 'Create Forum' }}
            </button>
            <button (click)="cancelCreate()" class="text-xs px-2.5 py-1.5 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-steel-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div *ngIf="loading()" class="space-y-2">
          <app-skeleton *ngFor="let _ of [1,2,3]" width="100%" height="3rem"></app-skeleton>
        </div>

        <!-- Error -->
        <app-error-state *ngIf="error() && !loading()" title="Failed to load forums" [description]="error()!" (retry)="loadForums()"></app-error-state>

        <!-- Forum List (draggable) -->
        <div *ngIf="!loading() && !error()" class="space-y-2" (dragover)="onDragOverAny($event)">
          <div
            *ngFor="let forum of forums(); trackBy: trackById; let i = index"
            [attr.data-index]="i"
            class="group rounded-lg border transition-all duration-150"
            [class]="getDragClasses(i, forum.id)"
            draggable="true"
            (dragstart)="onDragStart($event, i, forum.id)"
            (dragend)="onDragEnd()"
            (dragover)="onDragOver($event, i)"
            (drop)="onDrop($event, i)"
          >
            <!-- View Mode -->
            <div *ngIf="editingId() !== forum.id" class="flex items-stretch">
              <!-- Drag Handle -->
              <div
                class="flex items-center justify-center w-8 min-h-full cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors shrink-0"
                [class.opacity-30]="!!editingId()"
                (mousedown)="$event.stopPropagation()"
              >
                <app-icon name="grip-vertical" class="w-3.5 h-3.5"></app-icon>
              </div>
              <!-- Content -->
              <div class="flex-1 p-3 pl-2 min-w-0">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-semibold text-gray-900 dark:text-gray-100">{{ forum.name }}</span>
                      <span class="text-[10px] font-mono text-gray-400 dark:text-gray-500">/{{ forum.slug }}</span>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{{ forum.description || 'No description' }}</p>
                    <div class="flex items-center gap-3 mt-1.5">
                      <span class="text-[10px] text-gray-400 dark:text-gray-500">{{ forum.threadCount || 0 }} threads</span>
                      <span class="text-[10px] text-gray-400 dark:text-gray-500">{{ forum.postCount || 0 }} posts</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button (click)="startEdit(forum)" class="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition-colors" title="Edit">
                      <app-icon name="pencil" class="w-3.5 h-3.5"></app-icon>
                    </button>
                    <button (click)="confirmDelete(forum)" class="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors" title="Delete">
                      <app-icon name="trash-2" class="w-3.5 h-3.5"></app-icon>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Edit Mode -->
            <div *ngIf="editingId() === forum.id" class="p-3 border-l-2 border-blue-400 ml-2">
              <div class="space-y-2">
                <div>
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Name</label>
                  <input
                    [(ngModel)]="editForum.name"
                    class="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-steel-800 px-2 py-1 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Slug</label>
                  <input
                    [(ngModel)]="editForum.slug"
                    class="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-steel-800 px-2 py-1 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Description</label>
                  <textarea
                    [(ngModel)]="editForum.description"
                    rows="2"
                    class="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-steel-800 px-2 py-1 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  ></textarea>
                </div>
              </div>
              <div class="flex items-center gap-2 mt-2.5">
                <button (click)="saveEdit(forum)" [disabled]="saving()" class="app-btn-primary text-xs">
                  {{ saving() ? 'Saving...' : 'Save' }}
                </button>
                <button (click)="cancelEdit()" class="text-xs px-2 py-1 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-steel-700 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div *ngIf="forums().length === 0" class="p-8 text-center">
            <app-icon name="message-square" class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2"></app-icon>
            <p class="text-sm text-gray-500 dark:text-gray-400">No forums yet</p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Create your first forum to get started.</p>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div *ngIf="deleteTarget()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" (click)="deleteTarget.set(null)">
        <div class="bg-white dark:bg-steel-800 rounded-xl shadow-xl p-5 max-w-sm w-full mx-3" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <app-icon name="alert-triangle" class="w-4 h-4 text-red-600 dark:text-red-400"></app-icon>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Forum</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
            </div>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-300 mb-2">
            Are you sure you want to delete <strong>{{ deleteTarget()?.name }}</strong>?
          </p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 mb-4">
            All threads and comments in this forum will also be deleted.
          </p>
          <div class="flex items-center justify-end gap-2">
            <button (click)="deleteTarget.set(null)" class="text-xs px-3 py-1.5 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-steel-700 transition-colors">
              Cancel
            </button>
            <button (click)="deleteForum()" [disabled]="deleting()" class="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
              {{ deleting() ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Existing health panel -->
      <div class="app-panel p-4 mb-4 border-l-4 border-amber-400">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">System Health</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Materialized view status and stats refresh.</p>

        <div class="rounded border border-gray-200 dark:border-steel-700 bg-gray-50 dark:bg-steel-800/50 p-3 mb-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Materialized View Health</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full"
              [class]="health()?.status === 'healthy' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'">
              {{ health()?.status === 'healthy' ? 'Healthy' : 'Degraded' }}
            </span>
          </div>
          <div *ngIf="health()?.materializedView" class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div class="flex justify-between"><span>View</span><span class="font-mono">{{ health()?.materializedView?.schema }}.{{ health()?.materializedView?.name }}</span></div>
            <div class="flex justify-between"><span>Populated</span><span>{{ health()?.materializedView?.populated ? 'Yes' : 'No' }}</span></div>
            <div class="flex justify-between"><span>Rows</span><span>{{ (health()?.materializedView?.rowCount || 0).toLocaleString() }}</span></div>
          </div>
        </div>

        <button (click)="refreshStats()" [disabled]="refreshing()" class="app-btn-primary text-xs">
          {{ refreshing() ? 'Refreshing...' : 'Refresh Stats' }}
        </button>
      </div>
    </div>
  `,
})
export class SettingsViewComponent implements OnInit {
  private http = inject(HttpClient);
  private dataService = inject(DataService);
  private toast = inject(ToastService);

  // Forum list
  forums = signal<Forum[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // Create form
  showCreateForm = signal(false);
  creating = signal(false);
  newForum = { name: '', slug: '', description: '' };

  // Edit state
  editingId = signal<string | null>(null);
  saving = signal(false);
  editForum = { name: '', slug: '', description: '' };

  // Delete
  deleteTarget = signal<Forum | null>(null);
  deleting = signal(false);

  // Drag state
  dragIndex = signal<number | null>(null);
  dragOverIndex = signal<number | null>(null);
  dragging = signal(false);

  // Health
  health = signal<any>(null);
  refreshing = signal(false);

  ngOnInit() {
    this.loadForums();
    this.loadHealth();
  }

  trackById(_index: number, forum: Forum) {
    return forum.id;
  }

  // ── Forums ────────────────────────────────────────────────

  loadForums() {
    this.loading.set(true);
    this.error.set(null);
    this.dataService.getForums().subscribe({
      next: forums => {
        this.forums.set(forums);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load forums. Ensure the API server is running.');
        this.loading.set(false);
      },
    });
  }

  createForum() {
    if (!this.newForum.name || !this.newForum.slug) return;
    this.creating.set(true);
    this.dataService.createForum({
      name: this.newForum.name,
      slug: this.newForum.slug.replace(/[^a-z0-9-]/g, '').toLowerCase(),
      description: this.newForum.description,
    }).subscribe({
      next: () => {
        this.creating.set(false);
        this.showCreateForm.set(false);
        this.newForum = { name: '', slug: '', description: '' };
        this.toast.show('Forum created successfully', 'success');
        this.loadForums();
      },
      error: () => {
        this.creating.set(false);
        this.toast.show('Failed to create forum', 'error');
      },
    });
  }

  cancelCreate() {
    this.showCreateForm.set(false);
    this.newForum = { name: '', slug: '', description: '' };
  }

  startEdit(forum: Forum) {
    this.editingId.set(forum.id);
    this.editForum = {
      name: forum.name,
      slug: forum.slug,
      description: forum.description || '',
    };
  }

  saveEdit(forum: Forum) {
    this.saving.set(true);
    const payload: { name?: string; slug?: string; description?: string } = {};
    if (this.editForum.name !== forum.name) payload.name = this.editForum.name;
    if (this.editForum.slug !== forum.slug) payload.slug = this.editForum.slug.replace(/[^a-z0-9-]/g, '').toLowerCase();
    if (this.editForum.description !== (forum.description || '')) payload.description = this.editForum.description;

    if (Object.keys(payload).length === 0) {
      this.saving.set(false);
      this.editingId.set(null);
      return;
    }

    this.dataService.updateForum(forum.id, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingId.set(null);
        this.toast.show('Forum updated', 'success');
        this.loadForums();
      },
      error: () => {
        this.saving.set(false);
        this.toast.show('Failed to update forum', 'error');
      },
    });
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  confirmDelete(forum: Forum) {
    this.deleteTarget.set(forum);
  }

  deleteForum() {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.dataService.deleteForum(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.toast.show('Forum deleted', 'success');
        this.loadForums();
      },
      error: () => {
        this.deleting.set(false);
        this.toast.show('Failed to delete forum', 'error');
      },
    });
  }

  // ── Drag & Drop ───────────────────────────────────────────

  onDragStart(event: DragEvent, index: number, id: string) {
    if (this.editingId()) {
      event.preventDefault();
      return;
    }
    this.dragIndex.set(index);
    this.dragging.set(true);
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', id);
    // Opacity is handled reactively via getDragClasses() signal binding
  }

  onDragOver(event: DragEvent, index: number) {
    if (this.dragIndex() === null) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverIndex.set(index);
  }

  onDragOverAny(event: DragEvent) {
    // Clear highlight when hovering over the container itself (not a draggable item)
    if (!(event.target as HTMLElement).closest('[draggable]')) {
      this.dragOverIndex.set(null);
    }
  }

  onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    const fromIndex = this.dragIndex();
    if (fromIndex === null || fromIndex === dropIndex) {
      this.cleanupDrag();
      return;
    }

    const current = [...this.forums()];
    const item = current.splice(fromIndex, 1)[0];
    const adjustedTarget = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
    current.splice(adjustedTarget, 0, item);

    // Update local state immediately for snappy UI
    this.forums.set(current);

    // Persist new order to backend
    const orderedIds = current.map(f => f.id);
    this.dataService.reorderForums(orderedIds).subscribe({
      next: () => this.toast.show('Forum order updated', 'success'),
      error: () => {
        this.toast.show('Failed to save order', 'error');
        this.loadForums(); // revert on failure
      },
    });

    this.cleanupDrag();
  }

  onDragEnd() {
    this.cleanupDrag();
  }

  private cleanupDrag() {
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
    this.dragging.set(false);
  }

  getDragClasses(index: number, id: string): string {
    const base = 'border-gray-200 dark:border-steel-700 bg-white dark:bg-steel-800 hover:border-gray-300 dark:hover:border-steel-600';
    if (this.dragIndex() === index) {
      return `opacity-40 ${base}`;
    }
    if (this.dragOverIndex() === index && this.dragging()) {
      return `${base} border-t-2 border-blue-400 dark:border-blue-500 -mt-px`;
    }
    return base;
  }

  // ── Health ────────────────────────────────────────────────

  private loadHealth() {
    this.http.get('/api/health').subscribe({
      next: health => this.health.set(health),
      error: () => this.health.set({ status: 'unknown', materializedView: null }),
    });
  }

  refreshStats() {
    this.refreshing.set(true);
    this.http.post('/api/refresh-stats', {}).subscribe({
      next: () => {
        this.refreshing.set(false);
        this.toast.show('Stats refreshed successfully', 'success');
        this.loadHealth();
      },
      error: () => {
        this.refreshing.set(false);
        this.toast.show('Failed to refresh stats', 'error');
      },
    });
  }

  retry() {
    this.loadForums();
  }
}
