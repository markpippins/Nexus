import { Component, Input, Output, signal, computed, OnChanges, EventEmitter, inject, Inject } from '@angular/core';
import { NgFor, NgClass, DatePipe, SlicePipe } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SILENT_REQUEST } from '../../interceptors/request-context';
import { PlanCard, ReceiptEntry } from '../../services/types';
import { ConduitService } from '../../services/conduit.service';
import { API_BASE_URL } from '../../services/api-config';

@Component({
  selector: 'app-plan-detail',
  standalone: true,
  imports: [NgFor, NgClass, DatePipe, SlicePipe],
  template: `
    <div class="detail-overlay" (click)="close.emit()">
      <div class="detail-panel" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="panel-header">
          <div class="header-left">
            <span class="plan-badge" [ngClass]="'badge-' + statusColor()">#{{ plan?.planNumber }}</span>
            <h3>{{ plan?.title }}</h3>
          </div>
          <button class="close-btn" (click)="close.emit()">✕</button>
        </div>

        <div class="panel-body">
          <!-- Meta section -->
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Project</span>
              <span class="meta-value">{{ plan?.project || '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Status</span>
              <span class="meta-value" [ngClass]="'status-' + (plan?.derivedStatus || 'unknown')">{{ plan?.derivedStatus || 'Unknown' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Created</span>
              <span class="meta-value">{{ plan?.createdAt | date:'medium' }}</span>
            </div>
            @if (plan?.blockReason) {
              <div class="meta-item">
                <span class="meta-label">Block Reason</span>
                <span class="meta-value block-reason">{{ plan?.blockReason }}</span>
              </div>
            }
          </div>

          <!-- Goal -->
          @if (plan?.goal) {
            <div class="section">
              <div class="section-title">Goal</div>
              <p class="section-text">{{ plan?.goal }}</p>
            </div>
          }

          <!-- Files Affected -->
          @if (plan?.filesAffected && plan!.filesAffected!.length > 0) {
            <div class="section">
              <div class="section-title">Files Affected</div>
              <ul class="file-list">
                <li *ngFor="let f of plan?.filesAffected"><code>{{ f }}</code></li>
              </ul>
            </div>
          }

          <!-- Acceptance Criteria -->
          @if (plan?.acceptanceCriteria && plan!.acceptanceCriteria!.length > 0) {
            <div class="section">
              <div class="section-title">Acceptance Criteria</div>
              <ol class="criterion-list">
                <li *ngFor="let c of plan?.acceptanceCriteria">{{ c }}</li>
              </ol>
            </div>
          }

          <!-- Dependencies -->
          @if (plan?.dependencies && plan!.dependencies!.length > 0) {
            <div class="section">
              <div class="section-title">Dependencies</div>
              <div class="dep-list">
                <span class="dep-chip" *ngFor="let d of plan?.dependencies">{{ d }}</span>
              </div>
            </div>
          }

          <!-- Source Prompt -->
          @if (plan?.promptRef) {
            <div class="section">
              <div class="section-title">Source Prompt</div>
              <button class="prompt-link" (click)="promptExpanded.set(!promptExpanded())">
                💬 Prompt #{{ plan?.promptRef }} <span class="arrow">{{ promptExpanded() ? '▾' : '▸' }}</span>
              </button>
              @if (promptExpanded()) {
                <div class="prompt-body">
                  @if (!sourcePrompt()) {
                    <div class="loading-hint">Loading...</div>
                  }
                  @if (sourcePrompt() && !sourcePrompt()._notFound) {
                    <div class="prompt-content">
                      <strong>{{ sourcePrompt().title }}</strong>
                      <p>{{ sourcePrompt().summary }}</p>
                    </div>
                  }
                  @if (sourcePrompt()?._notFound) {
                    <div class="prompt-missing">Prompt not found.</div>
                  }
                </div>
              }
            </div>
          }

          <!-- Ticket Statuses -->
          @if (plan?.ticketStatuses && hasTickets()) {
            <div class="section">
              <div class="section-title">Tickets</div>
              <div class="tickets-grid">
                <div class="ticket-row" *ngFor="let entry of tickets()">
                  <span class="ticket-role">{{ entry.role }}</span>
                  <span class="ticket-status" [ngClass]="'tkt-' + entry.status">{{ entry.status }}</span>
                  @if (entry.id) {
                    <span class="ticket-id">{{ entry.id | slice:0:8 }}…</span>
                  }
                </div>
              </div>
            </div>
          }

          <!-- Receipt Timeline -->
          <div class="section">
            <div class="section-title">Receipt Timeline</div>
            @if (receipts().length > 0) {
              <div class="receipt-list">
                <div class="receipt-item" *ngFor="let r of receipts()">
                  <div class="receipt-dot" [ngClass]="'dot-' + r.type"></div>
                  <div class="receipt-body">
                    <div class="receipt-top">
                      <span class="receipt-type" [ngClass]="'type-' + r.type">{{ receiptLabel(r.type) }}</span>
                      <span class="receipt-agent">{{ r.agent_role }}</span>
                    </div>
                    @if (r.summary) {
                      <div class="receipt-summary">{{ r.summary }}</div>
                    }
                    <div class="receipt-time">{{ r.created_at | date:'short' }}</div>
                  </div>
                </div>
              </div>
            } @else {
              <div class="empty-hint">No receipts yet.</div>
            }
          </div>

          <!-- Actions -->
          <div class="section actions">
            <div class="section-title">Actions</div>
            <div class="action-buttons">
              <button class="btn-action btn-delete" (click)="deletePlan()" [disabled]="deleting()">
                {{ deleting() ? 'Deleting...' : '🗑 Soft Delete' }}
              </button>
              @if (canUnblock()) {
                <button
                  class="btn-action btn-unblock"
                  (click)="unblockPlan()"
                  [disabled]="unblocking()"
                >
                  {{ unblocking() ? 'Unblocking...' : '→ Unblock & Move to Pending' }}
                </button>
              }
            </div>
            @if (actionFeedback()) {
              <div class="action-feedback">{{ actionFeedback() }}</div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `.detail-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;justify-content:flex-end;z-index:100;animation:fadeIn .15s}`,
    `@keyframes fadeIn{from{opacity:0}to{opacity:1}}`,
    `.detail-panel{width:480px;max-width:90vw;height:100%;background:var(--bg-primary,#0f172a);border-left:1px solid var(--border-default,#475569);display:flex;flex-direction:column;animation:slideIn .2s}`,
    `@keyframes slideIn{from{transform:translateX(32px);opacity:0}to{transform:translateX(0);opacity:1}}`,
    `.panel-header{display:flex;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-subtle,#334155);gap:12px;flex-shrink:0}`,
    `.header-left{display:flex;flex-direction:column;gap:6px;min-width:0}`,
    `.header-left h3{margin:0;font-size:15px;color:var(--text-primary,#f1f5f9);line-height:1.3;word-break:break-word}`,
    `.plan-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;letter-spacing:.5px;width:fit-content}`,
    `.badge-blue{background:var(--tag-blue-bg,#1e3a5f);color:var(--accent-blue-text,#93c5fd)}`,
    `.badge-green{background:var(--tag-green-bg,#064e3b);color:var(--tag-green-text,#6ee7b7)}`,
    `.badge-gray{background:var(--tag-gray-bg,#334155);color:var(--text-secondary,#94a3b8)}`,
    `.badge-red{background:var(--tag-red-bg,#7f1d1d);color:var(--accent-red-text,#fca5a5)}`,
    `.badge-neutral{background:var(--tag-neutral-bg,#1e293b);color:var(--accent-neutral-text,#94a3b8)}`,
    `.close-btn{background:none;border:none;color:var(--text-muted,#64748b);font-size:18px;cursor:pointer;padding:4px;border-radius:6px;flex-shrink:0;line-height:1}`,
    `.close-btn:hover{background:var(--bg-secondary,#1e293b);color:var(--text-primary,#f1f5f9)}`,
    `.panel-body{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}`,
    `.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}`,
    `.meta-item{display:flex;flex-direction:column;gap:2px}`,
    `.meta-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#64748b)}`,
    `.meta-value{font-size:13px;color:var(--text-primary,#f1f5f9)}`,
    `.block-reason{color:var(--accent-red-text,#fca5a5);background:var(--tag-red-bg,#7f1d1d);padding:2px 8px;border-radius:4px;font-size:12px;width:fit-content}`,
    `.status-PLAN_CREATE{color:var(--accent-blue-text,#93c5fd)}`,
    `.status-IMPLEMENTATION{color:var(--tag-green-text,#6ee7b7)}`,
    `.status-REVIEW_PASS{color:var(--tag-green-text,#6ee7b7)}`,
    `.status-BLOCK{color:var(--accent-red-text,#fca5a5)}`,
    `.status-PROPOSED{color:var(--tag-purple-text,#a78bfa)}`,
    `.status-PLANNING{color:var(--tag-amber-text,#fbbf24)}`,
    `.section{display:flex;flex-direction:column;gap:6px}`,
    `.section-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#64748b)}`,
    `.section-text{font-size:13px;color:var(--text-secondary,#94a3b8);line-height:1.5;margin:0}`,
    `.file-list{margin:0;padding-left:16px;font-size:12px;color:var(--text-muted,#94a3b8);line-height:1.8}`,
    `.file-list code{font-size:11px;background:var(--code-bg,#1e293b);padding:1px 5px;border-radius:3px;color:var(--accent-blue-text,#93c5fd)}`,
    `.criterion-list{margin:0;padding-left:16px;font-size:12px;color:var(--text-secondary,#94a3b8);line-height:1.8}`,
    `.dep-list{display:flex;flex-wrap:wrap;gap:4px}`,
    `.dep-chip{background:var(--bg-secondary,#1e293b);color:var(--text-secondary,#94a3b8);padding:2px 8px;border-radius:8px;font-size:11px;border:1px solid var(--border-subtle,#334155)}`,
    `.prompt-link{background:none;border:none;color:var(--tag-purple-text,#a78bfa);font-size:13px;cursor:pointer;padding:4px 0;text-align:left;display:flex;align-items:center;gap:4px}`,
    `.prompt-link:hover{opacity:.8}`,
    `.arrow{font-size:10px}`,
    `.prompt-body{margin-top:4px}`,
    `.loading-hint{font-size:12px;color:var(--text-muted,#64748b);font-style:italic}`,
    `.prompt-content{background:var(--tag-purple-bg,#2e1065);border:1px solid var(--tag-purple-border,#581c87);border-radius:6px;padding:8px 12px;font-size:12px}`,
    `.prompt-content strong{display:block;color:var(--text-primary,#f1f5f9);margin-bottom:4px}`,
    `.prompt-content p{margin:0;color:var(--text-secondary,#94a3b8)}`,
    `.prompt-missing{font-size:12px;color:var(--text-muted,#64748b);font-style:italic}`,
    `.tickets-grid{display:flex;flex-direction:column;gap:4px}`,
    `.ticket-row{display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--bg-secondary,#1e293b);border-radius:6px;font-size:12px}`,
    `.ticket-role{font-weight:600;color:var(--text-muted,#64748b);text-transform:capitalize;min-width:60px}`,
    `.ticket-status{padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase}`,
    `.tkt-open{background:var(--tag-blue-bg,#1e3a5f);color:var(--accent-blue-text,#93c5fd)}`,
    `.tkt-claimed{background:var(--tag-amber-bg,#78350f);color:var(--tag-amber-text,#fbbf24)}`,
    `.tkt-completed{background:var(--tag-green-bg,#064e3b);color:var(--tag-green-text,#6ee7b7)}`,
    `.tkt-failed{background:var(--tag-red-bg,#7f1d1d);color:var(--accent-red-text,#fca5a5)}`,
    `.ticket-id{font-family:monospace;font-size:10px;color:var(--text-muted,#64748b);margin-left:auto}`,
    `.receipt-list{display:flex;flex-direction:column;gap:8px}`,
    `.receipt-item{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-subtle,#334155)}`,
    `.receipt-item:last-child{border-bottom:none}`,
    `.receipt-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0}`,
    `.dot-PLAN_CREATE{background:var(--accent-blue,#3b82f6)}`,
    `.dot-IMPLEMENTATION{background:var(--accent-green,#16a34a)}`,
    `.dot-REVIEW_PASS{background:var(--accent-green,#16a34a)}`,
    `.dot-REVIEW_REJECT{background:var(--accent-red,#dc2626)}`,
    `.dot-BLOCK{background:var(--accent-red,#dc2626)}`,
    `.dot-PROPOSED{background:var(--tag-purple,#8b5cf6)}`,
    `.dot-PLANNING{background:var(--tag-amber,#f59e0b)}`,
    `.receipt-body{flex:1;min-width:0}`,
    `.receipt-top{display:flex;align-items:center;gap:8px}`,
    `.receipt-type{font-size:11px;font-weight:700;text-transform:uppercase}`,
    `.type-PLAN_CREATE{color:var(--accent-blue-text,#93c5fd)}`,
    `.type-IMPLEMENTATION{color:var(--tag-green-text,#6ee7b7)}`,
    `.type-REVIEW_PASS{color:var(--tag-green-text,#6ee7b7)}`,
    `.type-REVIEW_REJECT{color:var(--accent-red-text,#fca5a5)}`,
    `.type-BLOCK{color:var(--accent-red-text,#fca5a5)}`,
    `.type-PROPOSED{color:var(--tag-purple-text,#a78bfa)}`,
    `.type-PLANNING{color:var(--tag-amber-text,#fbbf24)}`,
    `.receipt-agent{font-size:11px;color:var(--text-muted,#64748b)}`,
    `.receipt-summary{font-size:11px;color:var(--text-secondary,#94a3b8);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.receipt-time{font-size:10px;color:var(--text-dim,#475569);font-family:monospace;margin-top:1px}`,
    `.empty-hint{font-size:12px;color:var(--text-muted,#64748b);font-style:italic}`,
    `.actions{gap:8px}`,
    `.action-buttons{display:flex;gap:6px;flex-wrap:wrap}`,
    `.btn-action{padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:opacity .15s}`,
    `.btn-action:hover{opacity:.85}`,
    `.btn-action:disabled{opacity:.4;cursor:not-allowed}`,
    `.btn-delete{background:var(--tag-red-bg,#7f1d1d);color:var(--accent-red-text,#fca5a5);border:1px solid var(--accent-red,#dc2626)}`,
    `.btn-unblock{background:var(--tag-green-bg,#064e3b);color:var(--tag-green-text,#6ee7b7);border:1px solid var(--accent-green,#16a34a)}`,
    `.action-feedback{font-size:11px;color:var(--text-muted,#64748b);padding:4px 8px;background:var(--bg-secondary,#1e293b);border-radius:4px}`,
  ],
})
export class PlanDetailComponent implements OnChanges {
  @Input({ required: true }) plan!: PlanCard | null;
  @Output() close = new EventEmitter<void>();

  readonly receipts = signal<ReceiptEntry[]>([]);
  readonly sourcePrompt = signal<any>(null);
  readonly promptExpanded = signal(false);
  readonly deleting = signal(false);
  readonly unblocking = signal(false);
  readonly actionFeedback = signal('');

  private http = inject(HttpClient);
  private pipeline = inject(ConduitService);

  constructor(@Inject(API_BASE_URL) private api: string) {}

  statusColor(): string {
    if (!this.plan) return 'neutral';
    switch (this.plan.derivedStatus) {
      case 'PLAN_CREATE': return 'blue';
      case 'IMPLEMENTATION': case 'REVIEW_PASS': return 'green';
      case 'BLOCK': case 'PLAN_BLOCK': return 'red';
      case 'PROPOSED': case 'PLANNING': return 'neutral';
      default: return 'neutral';
    }
  }

  hasTickets(): boolean {
    return this.plan?.ticketStatuses ? Object.keys(this.plan.ticketStatuses).length > 0 : false;
  }

  readonly tickets = computed(() => {
    if (!this.plan?.ticketStatuses) return [];
    return Object.entries(this.plan.ticketStatuses).map(([role, data]) => ({
      role,
      status: data.status,
      id: data.id,
    }));
  });

  canUnblock(): boolean {
    const s = this.plan?.derivedStatus;
    return s === 'BLOCK' || s === 'PLAN_BLOCK';
  }

  ngOnChanges(): void {
    if (this.plan) {
      this.fetchReceipts(this.plan.planNumber);
      if (this.plan.promptRef) this.fetchPrompt(this.plan.promptRef);
    }
  }

  receiptLabel(type: string): string {
    const labels: Record<string, string> = {
      PLAN_CREATE: 'Created', IMPLEMENTATION: 'Implemented',
      REVIEW_PASS: 'Approved', REVIEW_REJECT: 'Rejected',
      BLOCK: 'Blocked', PROPOSED: 'Proposed',
      PLANNING: 'Planning', CANCELLED: 'Cancelled',
    };
    return labels[type] || type;
  }

  private fetchReceipts(planNumber: string) {
    this.receipts.set([]);
    this.http.post(`${this.api}/tools/call`, {
      name: 'get_plan_receipts',
      arguments: { plan_id: planNumber },
    }, { context: new HttpContext().set(SILENT_REQUEST, true) }).subscribe({
      next: (res: any) => {
        if (res?.result?.receipts) this.receipts.set(res.result.receipts);
      },
    });
  }

  private fetchPrompt(promptNumber: string) {
    this.sourcePrompt.set(null);
    this.http.post(`${this.api}/tools/call`, {
      name: 'query_prompts',
      arguments: { search: promptNumber },
    }, { context: new HttpContext().set(SILENT_REQUEST, true) }).subscribe({
      next: (res: any) => {
        const match = (res?.result?.results || []).find((p: any) => p.promptNumber === promptNumber);
        this.sourcePrompt.set(match || { _notFound: true, promptNumber });
      },
    });
  }

  deletePlan() {
    if (!this.plan) return;
    this.deleting.set(true);
    this.http.post(`${this.api}/tools/call`, {
      name: 'delete_plan',
      arguments: { planNumber: this.plan.planNumber },
    }).subscribe({
      next: () => {
        this.actionFeedback.set('Plan deleted.');
        this.deleting.set(false);
        this.pipeline.refresh();
        setTimeout(() => this.close.emit(), 1500);
      },
      error: () => {
        this.actionFeedback.set('Delete failed.');
        this.deleting.set(false);
      },
    });
  }

  unblockPlan() {
    if (!this.plan) return;
    this.unblocking.set(true);
    this.http.post(`${this.api}/tools/call`, {
      name: 'unblock_plan',
      arguments: { planNumber: this.plan.planNumber },
    }).subscribe({
      next: () => {
        this.actionFeedback.set('Plan unblocked and moved to pending.');
        this.unblocking.set(false);
        this.pipeline.refresh();
        setTimeout(() => this.close.emit(), 1500);
      },
      error: () => {
        this.actionFeedback.set('Unblock failed.');
        this.unblocking.set(false);
      },
    });
  }
}
