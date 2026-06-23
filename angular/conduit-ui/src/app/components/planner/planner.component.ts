import { Component, signal, computed, Inject, OnInit, OnDestroy } from '@angular/core';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SILENT_REQUEST } from '../../interceptors/request-context';
import { ConduitService } from '../../services/conduit.service';
import { PlanCard, ReceiptEntry } from '../../services/types';
import { API_BASE_URL } from '../../services/api-config';
import { KeyboardShortcutService } from '../../services/keyboard.service';

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, DatePipe],
  template: `
    <div class="planner">
      <!-- Left panel: plan list -->
      <div class="plan-list">
        <div class="list-header">
          <div class="view-toggle">
            <button
              class="toggle-btn"
              [class.active]="viewMode() === 'plans'"
              (click)="viewMode.set('plans')"
            >Plans</button>
            <button
              class="toggle-btn"
              [class.active]="viewMode() === 'proposals'"
              (click)="viewMode.set('proposals')"
            >Proposals <span class="count-badge">{{ stateProposalCount() }}</span></button>
          </div>
          <div class="header-buttons">
            <button class="btn-new" *ngIf="viewMode() === 'plans'" (click)="startCreate()">+ New</button>
            <button class="btn-propose" *ngIf="viewMode() === 'proposals'" (click)="startPropose()">💡 New</button>
          </div>
        </div>

        <div class="plan-groups">
          <ng-container *ngFor="let group of planGroups(); trackBy: trackByGroup">
            <div class="group-label">{{ group.label }} ({{ group.plans.length }})</div>
            <div
              class="plan-item"
              *ngFor="let plan of group.plans; trackBy: trackByPlan"
              [class.selected]="selectedPlan()?.planNumber === plan.planNumber"
              [class.readonly]="!isEditable(plan, group.label)"
              (click)="selectPlan(plan)"
            >
              <span class="plan-num">#{{ plan.planNumber }}</span>
              <span class="plan-title">{{ plan.title || plan.fileName }}</span>
              <div class="plan-tickets" *ngIf="plan.ticketStatuses">
                <span class="ticket-badge"
                  *ngFor="let role of roleOrder"
                  [class]="'ticket-' + ((plan.ticketStatuses[role].status) || 'none')"
                  [title]="role + ': ' + ((plan.ticketStatuses[role].status) || 'no ticket')"
                  (click)="openTicketPopover($event, plan, role)">
                  {{ roleLabel(role) }}
                </span>
              </div>
              <span class="plan-project">{{ plan.project }}</span>
            </div>
          </ng-container>
        </div>

        <div class="list-empty" *ngIf="!pipeline.state()">
          <div class="loading-spinner"></div>
          Connecting to conduit server...
        </div>
        <div class="list-empty" *ngIf="pipeline.state() && totalPlans() === 0">
          No plans loaded yet. Create a new plan to get started.
        </div>
      </div>

      <!-- Right panel: editor or create form -->
      <div class="editor-panel" [class.overlay]="mode() !== 'empty'">
        <!-- Mobile back button -->
        <button class="back-btn" (click)="cancelEdit()" *ngIf="mode() !== 'empty'">← Back</button>
        <!-- Create mode -->
        <ng-container *ngIf="mode() === 'create'">
          <h3>New Plan</h3>
          <div class="form-group">
            <label>Title *</label>
            <input [(ngModel)]="form.title" placeholder="e.g. Dark/light theme toggle" />
          </div>
          <div class="form-group">
            <label>Project</label>
            <input [(ngModel)]="form.project" placeholder="conduit-ui" />
          </div>
          <div class="form-group">
            <label>Goal</label>
            <textarea [(ngModel)]="form.goal" rows="4" placeholder="What this plan aims to accomplish..."></textarea>
          </div>
          <div class="form-group">
            <label>Files Affected (one per line)</label>
            <textarea [(ngModel)]="form.filesAffectedText" rows="3" placeholder="conduit-ui/src/app/styles.scss"></textarea>
          </div>
          <div class="form-group">
            <label>Acceptance Criteria (one per line)</label>
            <textarea [(ngModel)]="form.acceptanceText" rows="3" placeholder="- [ ] Theme toggle works in nav\n- [ ] Preference persists across reloads"></textarea>
          </div>
          <div class="form-group">
            <label>Dependencies (plan numbers, comma-separated)</label>
            <input [(ngModel)]="form.depsText" placeholder="0040, 0044" />
          </div>
          <div class="form-actions">
            <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
            <button class="btn-submit" (click)="submitCreate()" [disabled]="submitting()">
              {{ submitting() ? 'Creating...' : 'Create Plan' }}
            </button>
          </div>
          <div class="form-feedback success" *ngIf="feedback() === 'created'">Plan created successfully!</div>
          <div class="form-feedback error" *ngIf="feedback() === 'error'">Creation failed. Check the server connection.</div>
        </ng-container>

        <!-- Propose mode -->
        <ng-container *ngIf="mode() === 'propose'">
          <h3>Propose Idea</h3>
          <p class="propose-hint">Capture a suggested followup or idea. Files affected and acceptance criteria will be added during planning.</p>
          <div class="form-group">
            <label>Title *</label>
            <input [(ngModel)]="form.title" placeholder="e.g. Add dark mode toggle" />
          </div>
          <div class="form-group">
            <label>Project</label>
            <input [(ngModel)]="form.project" placeholder="conduit-ui" />
          </div>
          <div class="form-group">
            <label>Goal</label>
            <textarea [(ngModel)]="form.goal" rows="4" placeholder="What should this accomplish? (optional)"></textarea>
          </div>
          <div class="form-actions">
            <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
            <button class="btn-propose-submit" (click)="submitPropose()" [disabled]="submitting()">
              {{ submitting() ? 'Proposing...' : 'Propose Idea' }}
            </button>
          </div>
          <div class="form-feedback success" *ngIf="feedback() === 'proposed'">Idea proposed! See it in the Proposed group.</div>
          <div class="form-feedback error" *ngIf="feedback() === 'error'">Proposal failed. Check the server connection.</div>
        </ng-container>

        <!-- Edit mode -->
        <ng-container *ngIf="mode() === 'edit'">
          <h3>
            {{ editable() ? 'Edit' : 'View' }} Plan #{{ selectedPlan()?.planNumber }}
            <span class="readonly-badge" *ngIf="!editable()">Read-only</span>
            <button class="btn-close" (click)="cancelEdit()">✕</button>
          </h3>

          <div class="readonly-banner" *ngIf="!editable()">
            <ng-container *ngIf="currentGroup() !== 'REVIEW_PASS'">
              ⓘ This plan is {{ groupLabel(currentGroup()) }} — save is disabled. Use <strong>Revise</strong> to create an editable copy, or <strong>Promote</strong> to move a PROPOSED plan to PLANNING.
            </ng-container>
            <ng-container *ngIf="currentGroup() === 'REVIEW_PASS'">
              ⓘ This plan is REVIEW_PASS — no further actions available.
            </ng-container>
          </div>

          <div class="form-group">
            <label>Title</label>
            <input [(ngModel)]="form.title" [disabled]="!fieldsEnabled()" />
          </div>
          <div class="form-group">
            <label>Project</label>
            <input [(ngModel)]="form.project" [disabled]="!fieldsEnabled()" />
          </div>
          <div class="form-group">
            <label>Goal</label>
            <textarea [(ngModel)]="form.goal" rows="4" [disabled]="!fieldsEnabled()"></textarea>
          </div>
          <div class="form-group">
            <label>Files Affected (one per line)</label>
            <textarea [(ngModel)]="form.filesAffectedText" rows="3" [disabled]="!editable()" [placeholder]="canRevise() ? 'Files affected will be determined during planning.' : ''"></textarea>
          </div>
          <div class="form-group">
            <label>Acceptance Criteria (one per line)</label>
            <textarea [(ngModel)]="form.acceptanceText" rows="3" [disabled]="!fieldsEnabled()"></textarea>
          </div>
          <div class="form-group">
            <label>Dependencies (plan numbers, comma-separated)</label>
            <input [(ngModel)]="form.depsText" [disabled]="!fieldsEnabled()" />
          </div>

          <div class="form-actions">            <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
            <button
              *ngIf="editable()"
              class="btn-submit" (click)="submitUpdate()" [disabled]="submitting()">
              {{ submitting() ? 'Saving...' : 'Save Changes' }}
            </button>
            <button
              *ngIf="canRevise()"
              class="btn-revise" (click)="submitRevise()" [disabled]="submitting()">
              {{ submitting() ? 'Revising...' : '↻ Revise' }}
            </button>
            <button
              *ngIf="canUnblock()"
              class="btn-unblock" (click)="submitUnblock()" [disabled]="submitting()">
              {{ submitting() ? 'Unblocking...' : '→ Move to Pending' }}
            </button>
            <button
              *ngIf="canMoveToPending()"
              class="btn-move-pending" (click)="submitMoveToPending()" [disabled]="submitting()">
              {{ submitting() ? 'Moving...' : '→ Move to Pending' }}
            </button>
            <button
              *ngIf="canPromote()"
              class="btn-promote" (click)="submitPromote()" [disabled]="submitting()">
              {{ submitting() ? 'Promoting...' : '↑ Promote' }}
            </button>
            <button
              *ngIf="currentGroup() !== 'REVIEW_PASS'"
              class="btn-delete" (click)="confirmDelete()" [disabled]="submitting()">
              🗑 Delete
            </button>
          </div>

          <!-- Delete confirmation -->
          <div class="delete-confirm" *ngIf="showDeleteConfirm()">
            <p>Delete plan #{{ selectedPlan()?.planNumber }}? This is a soft-delete — the audit trail is preserved but the plan will disappear from all views.</p>
            <div class="delete-confirm-actions">
              <button class="btn-cancel" (click)="showDeleteConfirm.set(false)">Cancel</button>
              <button class="btn-delete-confirm" (click)="submitDelete()" [disabled]="submitting()">
                {{ submitting() ? 'Deleting...' : 'Yes, Delete' }}
              </button>
            </div>
          </div>

          <div class="form-feedback success" *ngIf="feedback() === 'updated'">Plan updated!</div>
          <div class="form-feedback success" *ngIf="feedback() === 'revised'">Revision created in Planning!</div>
          <div class="form-feedback success" *ngIf="feedback() === 'unblocked'">Plan moved back to Pending!</div>
          <div class="form-feedback success" *ngIf="feedback() === 'pending'">Plan moved to Pending!</div>
          <div class="form-feedback success" *ngIf="feedback() === 'promoted'">Plan promoted to Planning!</div>
          <div class="form-feedback success" *ngIf="feedback() === 'deleted'">Plan deleted.</div>
          <div class="form-feedback error" *ngIf="feedback() === 'error'">Operation failed. Check the server connection.</div>

          <!-- Source Prompt (expandable) -->
          <div class="prompt-section" *ngIf="selectedPlan()?.promptRef">
            <button class="prompt-toggle" (click)="promptExpanded.set(!promptExpanded())">
              💬 Source: Prompt #{{ selectedPlan()?.promptRef }}
              <span class="toggle-arrow">{{ promptExpanded() ? '▾' : '▸' }}</span>
            </button>
            <div class="prompt-body" *ngIf="promptExpanded()">
              <div class="loading-hint" *ngIf="!sourcePrompt()">Loading prompt...</div>
              <div class="prompt-content" *ngIf="sourcePrompt() && !sourcePrompt()._notFound && !sourcePrompt()._error">
                <div class="prompt-title">{{ sourcePrompt().title }}</div>
                <div class="prompt-summary">{{ sourcePrompt().summary }}</div>
              </div>
              <div class="prompt-not-found" *ngIf="sourcePrompt()?._notFound">
                Prompt #{{ sourcePrompt().promptNumber }} not found.
              </div>
              <div class="prompt-error" *ngIf="sourcePrompt()?._error">
                Failed to load prompt. The audit trail may be incomplete.
              </div>
            </div>
          </div>

          <!-- Receipt Timeline -->
          <div class="receipt-section">
            <h4>Receipts</h4>
            <div class="receipt-list" *ngIf="receipts().length > 0; else noReceipts">
              <div class="receipt-item" *ngFor="let r of receipts()">
                <span class="receipt-type {{r.type}}">{{ receiptLabel(r.type) }}</span>
                <span class="receipt-agent">{{ r.agent_role }}</span>
                <span class="receipt-summary">{{ r.summary || '—' }}</span>
                <span class="receipt-time">{{ r.created_at | date:'short' }}</span>
              </div>
            </div>
            <ng-template #noReceipts>
              <div class="receipt-empty">No receipts issued yet.</div>
            </ng-template>
          </div>
        </ng-container>

        <!-- Empty state -->
        <div class="editor-empty" *ngIf="mode() === 'empty'">
          <div class="empty-icon">📋</div>
          <p>Select a plan from the list to edit,</p>
          <p>or click <strong>+ New Plan</strong> to create one.</p>
        </div>
      </div>

      <!-- Ticket detail popover -->
      <div class="ticket-popover" *ngIf="ticketPopover() as tp" [style.left.px]="tp.x" [style.top.px]="tp.y" (click)="closeTicketPopover()">
        <div class="tp-role">{{ tp.role }}</div>
        <div class="tp-row"><span class="tp-label">Status</span><span class="tp-value">{{ selectedTicketDetail(tp)?.status || '—' }}</span></div>
        <div class="tp-row"><span class="tp-label">Ticket ID</span><span class="tp-value">{{ selectedTicketDetail(tp)?.id || '—' }}</span></div>
        <div class="tp-row"><span class="tp-label">Created</span><span class="tp-value">{{ (selectedTicketDetail(tp)?.created_at | date:'short') || '—' }}</span></div>
        <div class="tp-row"><span class="tp-label">Expires</span><span class="tp-value">{{ (selectedTicketDetail(tp)?.expires_at | date:'short') || '—' }}</span></div>
        <div class="tp-row"><span class="tp-label">Objective</span><span class="tp-value">{{ selectedTicketDetail(tp)?.objective || '—' }}</span></div>
      </div>
    </div>
  `,
  styles: [
    `:host{display:block;flex:1;min-height:0;overflow:hidden}`,
    `.planner{display:flex;height:100%;overflow:hidden}`,
    `.plan-list{width:310px;flex-shrink:0;border-right:1px solid var(--border-default);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary)}`,
    `.list-header{display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border-subtle);gap:8px}`,
    `.view-toggle{display:flex;gap:0;border-radius:6px;overflow:hidden;border:1px solid var(--border-default);flex-shrink:0}`,
    `.toggle-btn{background:var(--bg-secondary);color:var(--text-muted);border:none;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}`,
    `.toggle-btn.active{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.toggle-btn:hover:not(.active){background:var(--bg-tertiary);color:var(--text-primary)}`,
    `.count-badge{display:inline-block;background:var(--tag-purple-bg, #f5f3ff);color:var(--tag-purple-text, #6d28d9);border-radius:10px;padding:0 6px;font-size:10px;margin-left:4px;vertical-align:middle}`,
    `.list-header h3{margin:0;font-size:14px;color:var(--text-primary)}`,
    `.header-buttons{display:flex;gap:6px;flex-wrap:wrap}`,
    `.btn-new{background:var(--accent-blue-bg);color:var(--accent-blue-text);border:none;padding:5px 10px;border-radius:5px;font-size:12px;cursor:pointer;transition:opacity .15s;white-space:nowrap}`,
    `.btn-new:hover{opacity:.8}`,
    `.btn-propose{background:var(--tag-purple-bg, #f5f3ff);color:var(--tag-purple-text, #6d28d9);border:1px solid var(--tag-purple-border, #ddd6fe);padding:5px 10px;border-radius:5px;font-size:12px;cursor:pointer;transition:opacity .15s;white-space:nowrap}`,
    `.btn-propose:hover{opacity:.8}`,
    `.btn-propose-submit{background:var(--tag-purple-bg, #f5f3ff);color:var(--tag-purple-text, #6d28d9);border:1px solid var(--tag-purple-border, #ddd6fe);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-propose-submit:hover{opacity:.8}`,
    `.btn-propose-submit:disabled{opacity:.5;cursor:not-allowed}`,
    `.propose-hint{font-size:12px;color:var(--text-muted);margin-bottom:16px;line-height:1.5;font-style:italic}`,
    `.plan-groups{flex:1;min-height:0;overflow-y:auto;padding:8px 0}`,
    `.group-label{font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted);padding:8px 12px 4px;letter-spacing:.5px}`,
    `.plan-item{display:flex;flex-direction:column;padding:8px 12px;cursor:pointer;transition:background .1s;border-left:3px solid transparent}`,
    `.plan-item:hover{background:var(--bg-secondary)}`,
    `.plan-item.selected{background:var(--accent-blue-bg);border-left-color:var(--accent-blue-text)}`,
    `.plan-item.readonly{border-left-color:var(--text-muted)}`,
    `.ticket-popover{position:fixed;z-index:1000;background:var(--bg-primary);border:1px solid var(--border-default);border-radius:8px;padding:10px 14px;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:280px}`,
    `.ticket-popover .tp-role{font-weight:700;font-size:11px;text-transform:uppercase;margin-bottom:6px;color:var(--text-muted)}`,
    `.ticket-popover .tp-row{display:flex;gap:8px;margin-bottom:3px}`,
    `.ticket-popover .tp-label{color:var(--text-muted);min-width:65px;font-size:11px}`,
    `.ticket-popover .tp-value{color:var(--text-primary);font-family:monospace;font-size:11px;word-break:break-all}`,
    `.plan-num{font-size:11px;color:var(--text-muted);font-family:monospace}`,
    `.plan-title{font-size:13px;color:var(--text-primary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.plan-project{font-size:11px;color:var(--text-muted);margin-top:1px}`,
    `.plan-tickets{display:flex;gap:3px;margin-top:3px;flex-wrap:wrap}`,
    `.ticket-badge{display:inline-block;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:700;font-family:monospace;letter-spacing:.5px;text-transform:uppercase;line-height:1.4}`,
    `.ticket-open{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.ticket-claimed{background:var(--tag-amber-bg,#fef3c7);color:var(--tag-amber-text,#b45309)}`,
    `.ticket-completed{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.ticket-failed{background:var(--tag-red-bg);color:var(--tag-red-text)}`,
    `.ticket-expired{background:var(--bg-tertiary);color:var(--text-muted);text-decoration:line-through}`,
    `.ticket-stale{background:var(--bg-secondary);color:var(--text-muted)}`,
    `.ticket-cancelled{background:var(--bg-secondary);color:var(--text-muted);text-decoration:line-through}`,
    `.ticket-abandoned{background:var(--tag-red-bg);color:var(--tag-red-text);opacity:.5}`,
    `.ticket-none{background:transparent;color:var(--text-muted);opacity:.4}`,
    `.list-empty{padding:24px 12px;font-size:13px;color:var(--text-muted);text-align:center}`,
    `.loading-spinner{width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue-text);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}`,
    `@keyframes spin{to{transform:rotate(360deg)}}`,
    `.editor-panel{flex:1;overflow-y:scroll;padding:16px 24px;background:var(--bg-primary)}`,
    `.editor-panel h3{margin:0 0 16px;font-size:16px;color:var(--text-primary)}`,
    `.readonly-badge{display:inline-block;background:var(--bg-secondary);color:var(--text-muted);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;margin-left:8px;vertical-align:middle;text-transform:uppercase;letter-spacing:.5px}`,
    `.readonly-banner{background:var(--tag-amber-bg);color:var(--tag-amber-text);padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px;line-height:1.5}`,
    `.form-group{margin-bottom:14px}`,
    `.form-group label{display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}`,
    `.form-group input,.form-group textarea{width:100%;padding:8px 10px;border:1px solid var(--border-default);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);font-family:inherit;resize:vertical;box-sizing:border-box}`,
    `.form-group input:focus,.form-group textarea:focus{outline:none;border-color:var(--accent-blue-text);box-shadow:0 0 0 2px var(--accent-blue-bg)}`,
    `.form-group input:disabled,.form-group textarea:disabled{background:var(--bg-secondary);color:var(--text-muted);cursor:not-allowed;opacity:.7}`,
    `.form-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}`,
    `.btn-cancel{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer}`,
    `.btn-cancel:hover{background:var(--bg-primary)}`,
    `.btn-submit{background:var(--accent-blue-bg);color:var(--accent-blue-text);border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-submit:hover{opacity:.8}`,
    `.btn-submit:disabled{opacity:.5;cursor:not-allowed}`,
    `.btn-revise{background:var(--tag-purple-bg, #f5f3ff);color:var(--tag-purple-text, #6d28d9);border:1px solid var(--tag-purple-border, #ddd6fe);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-revise:hover{opacity:.8}`,
    `.btn-revise:disabled{opacity:.5;cursor:not-allowed}`,
    `.btn-unblock{background:var(--accent-green-bg);color:var(--accent-green-text);border:1px solid var(--accent-green, #16a34a);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-unblock:hover{opacity:.8}`,
    `.btn-unblock:disabled{opacity:.5;cursor:not-allowed}`,
    `.btn-promote{background:var(--tag-green-bg);color:var(--tag-green-text);border:1px solid var(--accent-green, #16a34a);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-promote:hover{opacity:.8}`,
    `.btn-promote:disabled{opacity:.5;cursor:not-allowed}`,
    `.btn-move-pending{background:var(--accent-blue-bg);color:var(--accent-blue-text);border:1px solid var(--accent-blue-text);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-move-pending:hover{opacity:.8}`,
    `.btn-move-pending:disabled{opacity:.5;cursor:not-allowed}`,
    `.btn-delete{background:var(--tag-red-bg);color:var(--tag-red-text);border:1px solid var(--accent-red, #dc2626);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-delete:hover{background:var(--accent-red, #dc2626);color:#fff}`,
    `.btn-delete:disabled{opacity:.5;cursor:not-allowed}`,
    `.delete-confirm{background:var(--tag-red-bg);border:1px solid var(--accent-red, #dc2626);border-radius:8px;padding:12px 16px;margin-top:12px}`,
    `.delete-confirm p{font-size:12px;color:var(--tag-red-text);margin:0 0 10px;line-height:1.5}`,
    `.delete-confirm-actions{display:flex;gap:8px}`,
    `.btn-delete-confirm{background:var(--accent-red, #dc2626);color:#fff;border:none;padding:6px 14px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-delete-confirm:hover{opacity:.85}`,
    `.btn-delete-confirm:disabled{opacity:.5;cursor:not-allowed}`,
    `.form-feedback{padding:8px 12px;border-radius:6px;font-size:13px;margin-top:12px}`,
    `.form-feedback.success{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.form-feedback.error{background:var(--tag-red-bg);color:var(--tag-red-text)}`,
    `.editor-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted)}`,
    `.empty-icon{font-size:48px;margin-bottom:12px;opacity:.5}`,
    `.editor-empty p{margin:2px 0;font-size:14px}`,
    `.back-btn{display:none;background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-primary);padding:6px 12px;border-radius:6px;font-size:13px;cursor:pointer;margin-bottom:12px}`,
    `.back-btn:hover{background:var(--bg-tertiary)}`,
    `.receipt-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)}`,
    `.receipt-section h4{margin:0 0 10px;font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px}`,
    `.receipt-list{display:flex;flex-direction:column;gap:6px}`,
    `.receipt-item{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;border-bottom:1px solid var(--border-subtle)}`,
    `.receipt-item:last-child{border-bottom:none}`,
    `.receipt-type{font-weight:600;min-width:72px;font-size:11px;text-transform:uppercase}`,
    `.receipt-type.PLAN_CREATE{color:var(--accent-blue-text)}`,
    `.receipt-type.IMPLEMENTATION{color:var(--tag-green-text)}`,
    `.receipt-type.REVIEW_PASS{color:var(--tag-green-text)}`,
    `.receipt-type.REVIEW_REJECT{color:var(--tag-red-text)}`,
    `.receipt-type.BLOCK{color:var(--tag-red-text)}`,
    `.receipt-type.PLAN_BLOCK{color:var(--tag-red-text)}`,
    `.receipt-type.API_LIMIT{color:var(--tag-amber-text, #b45309)}`,
    `.receipt-type.CANCELLED{color:var(--text-muted);text-decoration:line-through}`,
    `.receipt-type.ABANDONED{color:var(--tag-red-text);opacity:.6}`,
    `.receipt-type.CRITIQUE_PASS{color:var(--tag-green-text)}`,
    `.receipt-type.CRITIQUE_REJECT{color:var(--tag-red-text)}`,
    `.receipt-type.REVIEW{color:var(--accent-blue-text)}`,
    `.receipt-type.PROPOSED{color:var(--tag-purple-text, #6d28d9)}`,
    `.receipt-type.PLANNING{color:var(--tag-amber-text, #b45309)}`,
    `.receipt-agent{color:var(--text-muted);min-width:60px}`,
    `.receipt-summary{flex:1;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.receipt-time{color:var(--text-muted);white-space:nowrap;font-family:monospace;font-size:11px}`,
    `.receipt-empty{font-size:12px;color:var(--text-muted);font-style:italic}`,
    `.receipt-empty{font-size:12px;color:var(--text-muted);font-style:italic}`,
    `.prompt-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)}`,
    `.prompt-toggle{background:none;border:none;color:var(--tag-purple-text, #6d28d9);font-size:13px;font-weight:600;cursor:pointer;padding:0;display:flex;align-items:center;gap:6px;width:100%;text-align:left}`,
    `.prompt-toggle:hover{opacity:.8}`,
    `.toggle-arrow{font-size:10px;margin-left:auto}`,
    `.prompt-body{margin-top:10px}`,
    `.loading-hint{font-size:12px;color:var(--text-muted);font-style:italic}`,
    `.prompt-content{background:var(--tag-purple-bg, #f5f3ff);border:1px solid var(--tag-purple-border, #ddd6fe);border-radius:6px;padding:10px 14px}`,
    `.prompt-title{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px}`,
    `.prompt-summary{font-size:12px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap}`,
    `.prompt-not-found{font-size:12px;color:var(--text-muted);font-style:italic}`,
    `.prompt-error{font-size:12px;color:var(--tag-red-text)}`,
    `@media(max-width:1024px){.plan-list{width:260px}}`,
    `@media(max-width:768px){.planner{flex-direction:column}.plan-list{width:100%;flex:1}.editor-panel{display:none}.editor-panel.overlay{display:block;position:fixed;top:0;left:0;right:0;bottom:0;z-index:500;overflow-y:auto;padding:16px;background:var(--bg-primary);border:none}.back-btn{display:inline-block}.plan-list:has(+.editor-panel.overlay){display:none}}`,
  ],
})
export class PlannerComponent implements OnInit, OnDestroy {
  mode = signal<'empty' | 'edit' | 'create' | 'propose'>('empty');
  viewMode = signal<'plans' | 'proposals'>('plans');
  selectedPlan = signal<PlanCard | null>(null);
  submitting = signal(false);
  feedback = signal<string | null>(null);

  /** Human-readable label for a derived status. Collapses blocked variants into "Blocked". */
  groupLabel(status: string): string {
    if (this.BLOCKED_STATUSES.includes(status)) return 'Blocked';
    return status;
  }

  /** Index into the flat plan list for j/k navigation */
  /** Statuses that should be grouped under "Blocked" in the plan list. */
  private readonly BLOCKED_STATUSES: readonly string[] = ['BLOCK', 'PLAN_BLOCK', 'API_LIMIT', 'CANCELLED', 'ABANDONED'];

  readonly focusedIndex = signal(0);

  readonly receipts = signal<ReceiptEntry[]>([]);

  /** Source prompt fetched when a plan has a promptRef */
  readonly sourcePrompt = signal<any>(null);
  readonly promptExpanded = signal(false);

  /** Ticket popover state */
  readonly ticketPopover = signal<{ planNumber: string; role: string; x: number; y: number } | null>(null);

  openTicketPopover(event: MouseEvent, plan: PlanCard, role: string) {
    event.stopPropagation();
    const t = plan.ticketStatuses?.[role];
    if (!t) return;
    this.ticketPopover.set({ planNumber: plan.planNumber, role, x: event.clientX + 10, y: event.clientY - 10 });
    // Dismiss on next outside click
    setTimeout(() => {
      const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.ticket-popover') && !target.closest('.ticket-badge')) {
          this.closeTicketPopover();
          document.removeEventListener('click', handler);
        }
      };
      document.addEventListener('click', handler);
    });
  }

  closeTicketPopover() {
    this.ticketPopover.set(null);
  }

  /** Unblock result feedback */
  readonly unblockFeedback = signal<string | null>(null);

  form = {
    title: '',
    project: '',
    goal: '',
    filesAffectedText: '',
    acceptanceText: '',
    depsText: '',
  };

  /** Track which group the selected plan belongs to */
  currentGroup = signal<string>('');

  constructor(
    private http: HttpClient,
    public pipeline: ConduitService,
    private kb: KeyboardShortcutService,
    @Inject(API_BASE_URL) private api: string,
  ) {}

  /** Role display order for ticket badges */
  readonly roleOrder = ['planner', 'builder', 'critic', 'reviewer'];

  /** Single-letter role abbreviations */
  roleLabel(role: string): string {
    const map: Record<string, string> = { planner: 'P', builder: 'B', critic: 'C', reviewer: 'R' };
    return map[role] || role[0].toUpperCase();
  }

  /** Get the ticket detail for the currently open popover */
  selectedTicketDetail(tp: { planNumber: string; role: string }) {
    const plan = this.allPlanCards().find(p => p.planNumber === tp.planNumber);
    return plan?.ticketStatuses?.[tp.role];
  }

  /** Flat list of all plans across groups for keyboard navigation */
  allPlanCards(): PlanCard[] {
    const groups = this.planGroups();
    const cards: PlanCard[] = [];
    for (const g of groups) {
      for (const p of g.plans) {
        cards.push(p);
      }
    }
    return cards;
  }

  ngOnInit(): void {
    this.kb.registerView('planner', [
      {
        key: 'j',
        description: 'Move down through plan list',
        handler: () => this.navigateByOffset(1),
        preventDefault: true,
      },
      {
        key: 'k',
        description: 'Move up through plan list',
        handler: () => this.navigateByOffset(-1),
        preventDefault: true,
      },
      {
        key: 'Enter',
        description: 'Edit selected plan',
        handler: () => this.selectFocused(),
        preventDefault: true,
      },
      {
        key: '/',
        description: 'Focus plan list search',
        handler: () => this.focusSearch(),
        preventDefault: true,
      },
    ]);
  }

  ngOnDestroy(): void {
    this.kb.unregisterView('planner');
  }

  private navigateByOffset(offset: number): void {
    const plans = this.allPlanCards();
    if (plans.length === 0) return;
    let idx = this.focusedIndex() + offset;
    if (idx < 0) idx = plans.length - 1;
    if (idx >= plans.length) idx = 0;
    this.focusedIndex.set(idx);
    this.scrollToPlan(plans[idx]);
  }

  private selectFocused(): void {
    const plans = this.allPlanCards();
    const idx = this.focusedIndex();
    if (plans.length > 0 && idx >= 0 && idx < plans.length) {
      this.selectPlan(plans[idx]);
    }
  }

  private focusSearch(): void {
    const el = document.querySelector<HTMLElement>('.plan-groups');
    el?.focus();
  }

  private scrollToPlan(plan: PlanCard): void {
    // Defer past Angular change detection so .plan-item elements exist in DOM
    setTimeout(() => {
      const items = document.querySelectorAll<HTMLElement>('.plan-item');
      for (const item of items) {
        if (item.textContent?.includes(`#${plan.planNumber}`)) {
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          break;
        }
      }
    }, 50);
  }

  readonly stateProposalCount = computed(() => {
    const s = this.pipeline.state();
    return s ? (s.plans.proposed || []).length : 0;
  });

  planGroups(): { label: string; plans: PlanCard[] }[] {
    const state = this.pipeline.state();
    if (!state) return [];
    if (this.viewMode() === 'proposals') {
      return [{ label: 'Proposed', plans: state.plans.proposed || [] }];
    }
    // Collect all plans and group by derivedStatus
    // Proposed and planning are included so they appear in the main list alongside pending/active/completed
    const allPlans: PlanCard[] = [
      ...(state.plans.proposed || []),
      ...(state.plans.planning || []),
      ...state.plans.pending,
      ...state.plans.active,
      ...state.plans.blocked,
      ...state.plans.completed,
    ];
    // Statuses that should be grouped as "Blocked"
    const BLOCKED_SET = new Set(this.BLOCKED_STATUSES);
    const groups = new Map<string, PlanCard[]>();
    for (const plan of allPlans) {
      const rawStatus = plan.derivedStatus || 'Unknown';
      const status = BLOCKED_SET.has(rawStatus) ? 'Blocked' : rawStatus;
      if (!groups.has(status)) groups.set(status, []);
      groups.get(status)!.push(plan);
    }
    return Array.from(groups.entries())
      .map(([label, plans]) => ({ label, plans }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  totalPlans(): number {
    return this.planGroups().reduce((sum, g) => sum + g.plans.length, 0);
  }

  trackByGroup(_index: number, group: { label: string; plans: PlanCard[] }): string {
    return group.label;
  }

  trackByPlan(_index: number, plan: PlanCard): string {
    return plan.planNumber;
  }

  /** Plans in PLAN_CREATE, PLANNING, or PROPOSED are editable in-place */
  isEditable(_plan: PlanCard, groupLabel: string): boolean {
    return groupLabel === 'PLAN_CREATE' || groupLabel === 'PLANNING' || groupLabel === 'PROPOSED';
  }

  /** True when the selected plan is in-plan editable */
  editable(): boolean {
    const g = this.currentGroup();
    return g === 'PLAN_CREATE' || g === 'PLANNING' || g === 'PROPOSED';
  }

  /** True when fields should be enabled (editable OR promotable) */
  fieldsEnabled(): boolean {
    return this.editable() || this.canPromote();
  }
  /** Blocked plans can be revised */
  canRevise(): boolean {
    return this.BLOCKED_STATUSES.includes(this.currentGroup());
  }

  /** Blocked plans can be unblocked */
  canUnblock(): boolean {
    return this.canRevise();
  }

  /** Planning plans can be moved to pending */
  canMoveToPending(): boolean {
    return this.currentGroup() === 'PLANNING';
  }

  /** Proposed plans can be promoted */
  canPromote(): boolean {
    return this.currentGroup() === 'PROPOSED';
  }

  selectPlan(plan: PlanCard) {
    this.selectedPlan.set(plan);
    this.mode.set('edit');
    this.feedback.set(null);
    this.form.title = plan.title || '';
    this.form.project = plan.project || '';
    this.form.goal = plan.goal || '';
    this.form.filesAffectedText = (plan.filesAffected || []).join('\n');
    this.form.acceptanceText = (plan.acceptanceCriteria || []).join('\n');
    this.form.depsText = (plan.dependencies || []).join(', ');
    // Store the plan's derived status as its current group
    this.currentGroup.set(plan.derivedStatus || 'Unknown');
    // Clear filesAffected for revise mode — revisions strip this field
    if (this.canRevise()) {
      this.form.filesAffectedText = '';
    }
    this.fetchReceipts(plan.planNumber);
    // Fetch source prompt if the plan has one
    this.sourcePrompt.set(null);
    this.promptExpanded.set(false);
    if (plan.promptRef) {
      this.fetchPrompt(plan.promptRef);
    }
  }



  receiptLabel(type: string): string {
    switch (type) {
      case 'PLAN_CREATE': return 'Created';
      case 'IMPLEMENTATION': return 'Implemented';
      case 'REVIEW_PASS': return 'Approved';
      case 'REVIEW_REJECT': return 'Rejected';
      case 'BLOCK': return 'Blocked';
      case 'PROPOSED': return 'Proposed';
      case 'PLANNING': return 'Planning';
      case 'CANCELLED': return 'Cancelled';
      case 'ABANDONED': return 'Abandoned';
      case 'API_LIMIT': return 'Rate Limited';
      default: return type;
    }
  }

  private fetchReceipts(planNumber: string) {
    this.receipts.set([]);
    this.http.post(`${this.api}/tools/call`, {
      name: 'get_plan_receipts',
      arguments: { plan_id: planNumber },
    }, {
      context: new HttpContext().set(SILENT_REQUEST, true),
    }).subscribe({
      next: (res: any) => {
        if (res?.result?.receipts) {
          this.receipts.set(res.result.receipts);
        }
      },
      error: () => {
        // Receipts are best-effort display
      },
    });
  }

  private fetchPrompt(promptNumber: string) {
    this.sourcePrompt.set(null);
    this.http.post(`${this.api}/tools/call`, {
      name: 'query_prompts',
      arguments: { search: promptNumber },
    }, {
      context: new HttpContext().set(SILENT_REQUEST, true),
    }).subscribe({
      next: (res: any) => {
        const results = res?.result?.results || [];
        const match = results.find((p: any) => p.promptNumber === promptNumber);
        if (match) {
          this.sourcePrompt.set(match);
        } else {
          this.sourcePrompt.set({ _notFound: true, promptNumber });
        }
      },
      error: () => {
        this.sourcePrompt.set({ _error: true, promptNumber });
      },
    });
  }

  startCreate() {
    this.mode.set('create');
    this.clearForm('conduit-ui');
  }

  startPropose() {
    this.mode.set('propose');
    this.clearForm('conduit-ui');
  }

  private clearForm(defaultProject: string) {
    this.selectedPlan.set(null);
    this.feedback.set(null);
    this.currentGroup.set('');
    this.form.title = '';
    this.form.project = defaultProject;
    this.form.goal = '';
    this.form.filesAffectedText = '';
    this.form.acceptanceText = '';
    this.form.depsText = '';
  }

  cancelEdit() {
    this.mode.set('empty');
    this.selectedPlan.set(null);
    this.feedback.set(null);
    this.currentGroup.set('');
  }

  submitCreate() {
    if (!this.form.title.trim()) return;
    this.submitting.set(true);
    this.feedback.set(null);

    const body: any = {
      title: this.form.title.trim(),
      project: this.form.project.trim() || 'conduit-ui',
      goal: this.form.goal.trim(),
      filesAffected: this.form.filesAffectedText.split('\n').map(s => s.trim()).filter(Boolean),
      acceptanceCriteria: this.form.acceptanceText.split('\n').map(s => s.trim()).filter(Boolean),
      dependencies: this.form.depsText.split(',').map(s => s.trim()).filter(Boolean),
    };

    this.http.post(`${this.api}/tools/call`, { name: 'create_plan', arguments: body }).subscribe({
      next: () => {
        this.feedback.set('created');
        this.submitting.set(false);
        this.form.title = '';
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
        }, 2000);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }

  submitUpdate() {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.submitting.set(true);
    this.feedback.set(null);

    const body: any = {
      planNumber: plan.planNumber,
      title: this.form.title.trim(),
      project: this.form.project.trim(),
      goal: this.form.goal.trim(),
      filesAffected: this.form.filesAffectedText.split('\n').map(s => s.trim()).filter(Boolean),
      acceptanceCriteria: this.form.acceptanceText.split('\n').map(s => s.trim()).filter(Boolean),
      dependencies: this.form.depsText.split(',').map(s => s.trim()).filter(Boolean),
    };

    this.http.post(`${this.api}/tools/call`, { name: 'update_plan', arguments: body }).subscribe({
      next: () => {
        this.feedback.set('updated');
        this.submitting.set(false);
        setTimeout(() => this.feedback.set(null), 3000);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }

  /** Revise: create a copy in planning state, stripping filesAffected */
  submitRevise() {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.submitting.set(true);
    this.feedback.set(null);

    const body: any = {
      planNumber: plan.planNumber,
      title: this.form.title.trim() || plan.title,
      goal: this.form.goal.trim(),
      acceptanceCriteria: this.form.acceptanceText.split('\n').map(s => s.trim()).filter(Boolean),
      dependencies: this.form.depsText.split(',').map(s => s.trim()).filter(Boolean),
    };

    this.http.post(`${this.api}/tools/call`, { name: 'revise_plan', arguments: body }).subscribe({
      next: (res: any) => {
        const newNum = res?.result?.planNumber;
        this.feedback.set('revised');
        this.submitting.set(false);
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
          this.selectedPlan.set(null);
        }, 2500);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }

  /** Move a planning plan to pending by issuing a PLAN_CREATE receipt */
  submitMoveToPending() {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.submitting.set(true);
    this.feedback.set(null);

    this.http.post(`${this.api}/tools/call`, {
      name: 'issue_receipt',
      arguments: {
        plan_id: plan.planNumber,
        type: 'PLAN_CREATE',
        agent_role: 'planner',
        summary: 'Promoted from Planning to Pending via Planner UI',
      },
    }).subscribe({
      next: () => {
        this.feedback.set('pending');
        this.submitting.set(false);
        this.pipeline.refresh();
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
          this.selectedPlan.set(null);
        }, 2500);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }

  /** Promote: save edits and move a proposed plan to planning state */
  submitPromote() {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.submitting.set(true);
    this.feedback.set(null);

    const body: any = {
      planNumber: plan.planNumber,
      title: this.form.title.trim(),
      goal: this.form.goal.trim(),
    };

    this.http.post(`${this.api}/tools/call`, {
      name: 'promote_plan',
      arguments: body,
    }).subscribe({
      next: () => {
        this.feedback.set('promoted');
        this.submitting.set(false);
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
          this.selectedPlan.set(null);
        }, 2500);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }

  /** Delete confirmation dialog state */
  readonly showDeleteConfirm = signal(false);

  confirmDelete() {
    this.showDeleteConfirm.set(true);
  }

  /** Soft-delete the selected plan */
  submitDelete() {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.submitting.set(true);
    this.feedback.set(null);

    this.http.post(`${this.api}/tools/call`, {
      name: 'delete_plan',
      arguments: { planNumber: plan.planNumber },
    }).subscribe({
      next: () => {
        this.feedback.set('deleted');
        this.submitting.set(false);
        this.showDeleteConfirm.set(false);
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
          this.selectedPlan.set(null);
        }, 2000);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
        this.showDeleteConfirm.set(false);
      },
    });
  }

  /** Unblock: move a blocked plan back to pending */
  submitUnblock() {
    const plan = this.selectedPlan();
    if (!plan) return;
    this.submitting.set(true);
    this.feedback.set(null);

    this.http.post(`${this.api}/tools/call`, {
      name: 'unblock_plan',
      arguments: { planNumber: plan.planNumber },
    }).subscribe({
      next: () => {
        this.feedback.set('unblocked');
        this.submitting.set(false);
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
          this.selectedPlan.set(null);
        }, 2500);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }

  /** Propose: create a plan in proposed/ with a PROPOSED receipt */
  submitPropose() {
    if (!this.form.title.trim()) return;
    this.submitting.set(true);
    this.feedback.set(null);

    const body: any = {
      title: this.form.title.trim(),
      project: this.form.project.trim() || 'conduit-ui',
      goal: this.form.goal.trim(),
    };

    this.http.post(`${this.api}/tools/call`, { name: 'create_proposed_plan', arguments: body }).subscribe({
      next: () => {
        this.feedback.set('proposed');
        this.submitting.set(false);
        this.form.title = '';
        setTimeout(() => {
          this.mode.set('empty');
          this.feedback.set(null);
        }, 2000);
      },
      error: () => {
        this.feedback.set('error');
        this.submitting.set(false);
      },
    });
  }
}
