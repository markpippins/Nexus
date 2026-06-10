import { Component, signal } from '@angular/core';
import { NgFor, NgIf, NgSwitch, NgSwitchCase, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AIConfigService, AIProvider, AIHarness, AIModel, AIRoleConfig, LogLevel } from '../../services/ai-config.service';

type TabId = 'providers' | 'harnesses' | 'models' | 'roles' | 'logging';

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'opencode', label: 'Opencode' },
  { value: 'codex', label: 'Codex' },
  { value: 'spring_ai', label: 'Spring AI' },
  { value: 'lm_server', label: 'LM Server' },
  { value: 'custom', label: 'Custom' },
];

const ROLES = ['planner', 'builder', 'reviewer', 'critic'];

interface HarnessSemanticsForm {
  binary: string;
  executionMode: string;
  executionSubcommand: string;
  roleMappingStrategy: string;
  capabilities: Record<string, boolean> & {
    model: boolean;
    agent: boolean;
    working_directory: boolean;
    system_prompt: boolean;
  };
  /** Original JSON string — preserved for semantics mappings round-trip. */
  originalJson: string;
  /** Raw JSON textarea content (advanced editing). */
  rawJson: string;
}

const CAPABILITY_KEYS = ['model','agent','working_directory','system_prompt'] as const;

const DEFAULT_MODEL_IDENTIFIER = 'opencode/big-pickle';

@Component({
  selector: 'app-ai-config-dialog',
  standalone: true,
  imports: [NgFor, NgIf, NgSwitch, NgSwitchCase, TitleCasePipe, FormsModule],
  template: `
    <div class="overlay" *ngIf="visible()" (click)="close()">
      <div class="dialog" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="header">
          <h2>⚙ AI Configuration</h2>
          <button class="close-btn" (click)="close()">✕</button>
        </div>

        <!-- Tab bar -->
        <div class="tabs">
          <button
            *ngFor="let t of tabs"
            class="tab"
            [class.active]="activeTab() === t.id"
            (click)="activeTab.set(t.id)"
          >
            {{ t.label }}
            <span class="tab-count">{{ countForTab(t.id) }}</span>
          </button>
        </div>

        <!-- Tab content -->
        <div class="tab-body">
          <ng-container [ngSwitch]="activeTab()">
            <!-- ─── Providers Tab ─── -->
            <div *ngSwitchCase="'providers'" class="tab-panel">
              <div class="panel-sidebar">
                <div class="sidebar-header">
                  <span>Providers</span>
                  <button class="btn-add" (click)="startNewProvider()">+ New</button>
                </div>
                <div class="item-list">
                  <button
                    *ngFor="let p of config().providers"
                    class="item-row"
                    [class.selected]="selectedProviderId() === p.id"
                    (click)="editProvider(p)"
                  >
                    <span class="item-name">{{ p.name }}</span>
                    <span class="item-meta">{{ p.type }}</span>
                  </button>
                  <div class="empty-list" *ngIf="config().providers.length === 0">
                    No providers configured
                  </div>
                </div>
              </div>
              <div class="panel-form" *ngIf="editProviderForm(); else noProviderSelected">
                <h4>{{ editProviderForm()!.id ? 'Edit' : 'New' }} Provider</h4>
                <label>Name</label>
                <input [(ngModel)]="editProviderForm()!.name" placeholder="e.g. OpenAI" />
                <label>Type</label>
                <select [(ngModel)]="editProviderForm()!.type">
                  <option *ngFor="let pt of PROVIDER_TYPES" [value]="pt.value">{{ pt.label }}</option>
                </select>
                <label>Endpoint URL</label>
                <input [(ngModel)]="editProviderForm()!.endpoint_url" placeholder="e.g. https://api.openai.com/v1" />
                <label>API Key</label>
                <input type="password" [(ngModel)]="editProviderForm()!.api_key" placeholder="sk-..." />
                <label>Config JSON</label>
                <textarea [(ngModel)]="editProviderForm()!.config_json" rows="4" placeholder="{}"></textarea>
                <div class="form-actions">
                  <button class="btn-save" (click)="saveProvider()" [disabled]="!!saving()['prov-' + editProviderForm()!.id]">💾 Save</button>
                  <button class="btn-delete" *ngIf="editProviderForm()!.id" (click)="deleteProvider(editProviderForm()!.id)" [disabled]="!!saving()['prov-' + editProviderForm()!.id]">🗑 Delete</button>
                  <button class="btn-cancel" (click)="cancelEditProvider()">Cancel</button>
                </div>
              </div>
              <ng-template #noProviderSelected>
                <div class="panel-form empty-form">
                  <span class="empty-icon">📦</span>
                  <p>Select a provider or create a new one.</p>
                </div>
              </ng-template>
            </div>

            <!-- ─── Harnesses Tab ─── -->
            <div *ngSwitchCase="'harnesses'" class="tab-panel">
              <div class="panel-sidebar">
                <div class="sidebar-header">
                  <span>Harnesses</span>
                  <button class="btn-add" (click)="startNewHarness()">+ New</button>
                </div>
                <input class="filter-input" [ngModel]="harnessFilter()" (ngModelChange)="harnessFilter.set($event)" placeholder="🔍 Filter by name, mode, capability…" />
                <div class="item-list">
                  <button
                    *ngFor="let h of filteredHarnesses()"
                    class="item-row"
                    [class.selected]="selectedHarnessId() === h.id"
                    (click)="editHarness(h)"
                  >
                    <span class="item-name">{{ h.name }}</span>
                    <span class="item-tags">
                      <span class="tag" [class.tag-empty]="!harnessField(h, 'execution.mode')">{{ harnessField(h, 'execution.mode') || '—' }}</span>
                      <span class="tag" [class.tag-empty]="!harnessField(h, 'role_mapping.strategy')">{{ harnessField(h, 'role_mapping.strategy') || '—' }}</span>
                    </span>
                    <span class="item-tags item-tags-caps">
                      <span class="tag tag-cap" *ngFor="let cap of harnessCapabilities(h)">{{ cap.replace('_', ' ') }}</span>
                      <span class="tag tag-cap tag-empty" *ngIf="harnessCapabilities(h).length === 0">no caps</span>
                    </span>
                  </button>
                  <div class="empty-list" *ngIf="config().harnesses.length === 0">
                    No harnesses configured
                  </div>
                </div>
              </div>
              <div class="panel-form" *ngIf="editHarnessForm(); else noHarnessSelected">
                <h4>{{ editHarnessForm()!.id ? 'Edit' : 'New' }} Harness</h4>
                <label>Name</label>
                <input [(ngModel)]="editHarnessForm()!.name" placeholder="e.g. Opencode CLI" />
                <!-- Structured semantics fields -->
                <ng-container *ngIf="harnessParsed() as s">
                  <label>Binary</label>
                  <input [ngModel]="s.binary" (ngModelChange)="s.binary=$event; onHarnessFieldChange()" placeholder="e.g. opencode, codex, ollama" />

                  <label>Execution Mode</label>
                  <select [ngModel]="s.executionMode" (ngModelChange)="s.executionMode=$event; onHarnessFieldChange()">
                    <option value="">— Select —</option>
                    <option *ngFor="let m of EXECUTION_MODES" [value]="m.value">{{ m.label }}</option>
                  </select>

                  <label>Subcommand <span class="label-hint">(optional)</span></label>
                  <input [ngModel]="s.executionSubcommand" (ngModelChange)="s.executionSubcommand=$event; onHarnessFieldChange()" placeholder="e.g. run, exec" />

                  <label>Role Mapping Strategy</label>
                  <select [ngModel]="s.roleMappingStrategy" (ngModelChange)="s.roleMappingStrategy=$event; onHarnessFieldChange()">
                    <option value="">— Select —</option>
                    <option *ngFor="let st of ROLE_MAPPING_STRATEGIES" [value]="st.value">{{ st.label }}</option>
                  </select>

                  <label>Capabilities</label>
                  <div class="caps-row">
                    <label class="cap-toggle" *ngFor="let cap of CAPABILITY_KEYS">
                      <input type="checkbox" [checked]="harnessParsed()!.capabilities[cap]" (change)="toggleCapability(cap, $event)" />
                      <span>{{ cap.replace('_', ' ') }}</span>
                    </label>
                  </div>

                  <details class="advanced-json">
                    <summary>Raw JSON <span class="label-hint">(advanced)</span></summary>
                    <textarea [ngModel]="s.rawJson" (ngModelChange)="s.rawJson=$event; onHarnessFieldChange()" rows="5" placeholder="{}"></textarea>
                  </details>
                </ng-container>
                <div class="form-actions">
                  <button class="btn-save" (click)="saveHarness()" [disabled]="!!saving()['harn-' + editHarnessForm()!.id]">💾 Save</button>
                  <button class="btn-delete" *ngIf="editHarnessForm()!.id" (click)="deleteHarness(editHarnessForm()!.id)" [disabled]="!!saving()['harn-' + editHarnessForm()!.id]">🗑 Delete</button>
                  <button class="btn-cancel" (click)="cancelEditHarness()">Cancel</button>
                </div>
              </div>
              <ng-template #noHarnessSelected>
                <div class="panel-form empty-form">
                  <span class="empty-icon">🔧</span>
                  <p>Select a harness or create a new one.</p>
                </div>
              </ng-template>
            </div>

            <!-- ─── Models Tab ─── -->
            <div *ngSwitchCase="'models'" class="tab-panel">
              <div class="panel-sidebar">
                <div class="sidebar-header">
                  <span>Models</span>
                  <button class="btn-add" (click)="startNewModel()">+ New</button>
                </div>
                <div class="item-list">
                  <ng-container *ngFor="let group of modelsByProvider()">
                    <div class="group-header">
                      <span class="group-label">{{ group.providerName }}</span>
                      <span class="group-count">{{ group.models.length }}</span>
                    </div>
                    <button
                      *ngFor="let m of group.models"
                      class="item-row"
                      [class.selected]="selectedModelId() === m.id"
                      (click)="editModel(m)"
                    >
                      <span class="item-name">{{ m.name }}</span>
                      <span class="item-meta">{{ m.model_identifier }}</span>
                      <span class="tag tag-default" *ngIf="isDefaultModel(m)">default</span>
                      <span class="item-tags item-tags-roles">
                        <span class="tag tag-role" *ngFor="let role of rolesForModel(m)">{{ role }}</span>
                        <span class="tag tag-role tag-empty" *ngIf="rolesForModel(m).length === 0">unassigned</span>
                      </span>
                    </button>
                  </ng-container>
                  <div class="empty-list" *ngIf="config().models.length === 0">
                    No models configured
                  </div>
                </div>
              </div>
              <div class="panel-form" *ngIf="editModelForm(); else noModelSelected">
                <h4>{{ editModelForm()!.id ? 'Edit' : 'New' }} Model</h4>
                <label>Name</label>
                <input [(ngModel)]="editModelForm()!.name" placeholder="e.g. GPT-4o" />
                <label>Provider</label>
                <select [(ngModel)]="editModelForm()!.provider_id">
                  <option value="">— Select —</option>
                  <option *ngFor="let p of config().providers" [value]="p.id">{{ p.name }} ({{ p.type }})</option>
                </select>
                <label>Harness</label>
                <select [(ngModel)]="editModelForm()!.harness_id">
                  <option value="">— Select —</option>
                  <option *ngFor="let h of config().harnesses" [value]="h.id">{{ h.name }}</option>
                </select>
                <label>Model Identifier</label>
                <input [(ngModel)]="editModelForm()!.model_identifier" placeholder="e.g. gpt-4o or claude-sonnet-4-20250514" />
                <div class="form-actions">
                  <button class="btn-save" (click)="saveModel()" [disabled]="!!saving()['mod-' + editModelForm()!.id]">💾 Save</button>
                  <button class="btn-delete" *ngIf="editModelForm()!.id" (click)="deleteModel(editModelForm()!.id)" [disabled]="!!saving()['mod-' + editModelForm()!.id]">🗑 Delete</button>
                  <button class="btn-cancel" (click)="cancelEditModel()">Cancel</button>
                </div>
              </div>
              <ng-template #noModelSelected>
                <div class="panel-form empty-form">
                  <span class="empty-icon">🧠</span>
                  <p>Select a model or create a new one.</p>
                </div>
              </ng-template>
            </div>

            <!-- ─── Roles Tab ─── -->
            <div *ngSwitchCase="'roles'" class="tab-panel tab-roles">
              <!-- Empty-state / seed button -->
              <div class="roles-empty" *ngIf="config().providers.length === 0; else rolesTable">
                <span class="empty-icon">🚀</span>
                <h4>No AI configuration yet</h4>
                <p>Seed the default config to get started with OpenAI + Opencode CLI + GPT-4o.</p>
                <button class="btn-seed" (click)="seedDefaults()" [disabled]="aiConfig.seeding()">
                  {{ aiConfig.seeding() ? 'Seeding...' : '🌱 Seed Defaults' }}
                </button>
                <button class="btn-seed-force" (click)="seedDefaults(true)" [disabled]="aiConfig.seeding()">
                  {{ aiConfig.seeding() ? 'Seeding...' : '⚡ Force Re-seed' }}
                </button>
              </div>
              <ng-template #rolesTable>
                <!-- Seed buttons in header bar -->
                <div class="roles-toolbar">
                  <span class="roles-hint">Assign a provider → harness → model combo to each role</span>
                  <div class="roles-toolbar-btns">
                    <button class="btn-seed-sm" (click)="seedDefaults()" [disabled]="aiConfig.seeding()">
                      {{ aiConfig.seeding() ? '...' : '🌱 Reset defaults' }}
                    </button>
                    <button class="btn-seed-force-sm" (click)="seedDefaults(true)" [disabled]="aiConfig.seeding()">
                      {{ aiConfig.seeding() ? '...' : '⚡ Force' }}
                    </button>
                  </div>
                </div>
                <div class="roles-table-wrap">
                  <table class="roles-table">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Provider</th>
                        <th>Harness</th>
                        <th>Model</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let r of ROLES">
                        <td class="role-label">{{ r | titlecase }}</td>
                        <td>
                          <select [(ngModel)]="roleEdits[r].provider_id" (change)="onRoleProviderChange(r)" class="role-select">
                            <option value="">—</option>
                            <option *ngFor="let p of config().providers" [value]="p.id">{{ p.name }}</option>
                          </select>
                        </td>
                        <td>
                          <select [(ngModel)]="roleEdits[r].harness_id" (change)="onRoleHarnessChange(r)" class="role-select">
                            <option value="">—</option>
                            <option *ngFor="let h of config().harnesses" [value]="h.id">{{ h.name }}</option>
                          </select>
                        </td>
                        <td>
                          <select [(ngModel)]="roleEdits[r].model_id" class="role-select">
                            <option value="">—</option>
                            <option *ngFor="let m of filteredModelsForRole(r)" [value]="m.id">{{ m.name }}</option>
                          </select>
                        </td>
                        <td>
                          <button class="btn-save-role" (click)="saveRole(r)" [disabled]="!!saving()['role-' + r]">💾</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </ng-template>
            </div>
            <!-- ─── Logging Tab ─── -->
            <div *ngSwitchCase="'logging'" class="tab-panel tab-logging">
              <div class="panel-form">
                <h4>Logging</h4>
                <label>Message Box Log Level</label>
                <select [ngModel]="aiConfig.logSettings().messageBoxLogLevel" (ngModelChange)="onLogLevelChange('messageBoxLogLevel', $event)">
                  <option value="NONE">NONE—hide log lines</option>
                  <option value="ERROR">ERROR—show errors only</option>
                  <option value="INFO">INFO—show info and above</option>
                  <option value="DEBUG">DEBUG—show all logs</option>
                </select>
                <span class="field-hint">Filters log lines in message box chat output. Non-log output is always shown.</span>
                <label>Prompt Log Level</label>
                <select [ngModel]="aiConfig.logSettings().promptLogLevel" (ngModelChange)="onLogLevelChange('promptLogLevel', $event)">
                  <option value="NONE">NONE—no agent logs</option>
                  <option value="ERROR">ERROR—errors only</option>
                  <option value="INFO">INFO—info and above</option>
                  <option value="DEBUG">DEBUG—verbose (all logs)</option>
                </select>
                <span class="field-hint">Controls the --log-level flag passed to the agent subprocess. NONE omits --print-logs entirely.</span>
              </div>
            </div>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styles: [
    // ── Overlay ────────────────────────────────────────────────
    `.overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .15s}`,
    `@keyframes fadeIn{from{opacity:0}to{opacity:1}}`,

    // ── Dialog ─────────────────────────────────────────────────
    `.dialog{background:var(--bg-primary);border:1px solid var(--border-default);border-radius:14px;width:100%;max-width:900px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.35);animation:slideUp .2s}`,
    `@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`,

    // ── Header ─────────────────────────────────────────────────
    `.header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}`,
    `.header h2{margin:0;font-size:17px;color:var(--text-primary)}`,
    `.close-btn{background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:all .15s}`,
    `.close-btn:hover{background:var(--bg-secondary);color:var(--text-primary)}`,

    // ── Tabs ───────────────────────────────────────────────────
    `.tabs{display:flex;gap:2px;padding:8px 16px 0;border-bottom:1px solid var(--border-subtle);flex-shrink:0;overflow-x:auto}`,
    `.tab{background:none;border:none;color:var(--text-muted);padding:10px 16px;font-size:13px;cursor:pointer;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:6px;transition:all .15s;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}`,
    `.tab:hover{color:var(--text-primary);background:var(--bg-secondary)}`,
    `.tab.active{color:var(--accent-blue-text);background:var(--accent-blue-bg);border-bottom-color:var(--accent-blue-text)}`,
    `.tab-count{font-size:10px;background:var(--bg-tertiary);color:var(--text-muted);padding:1px 7px;border-radius:10px;font-weight:600}`,
    `.tab.active .tab-count{background:var(--accent-blue-text);color:#fff}`,

    // ── Tab body ───────────────────────────────────────────────
    `.tab-body{flex:1;overflow:hidden;min-height:0;display:flex}`,
    `.tab-panel{display:flex;flex:1;overflow:hidden;min-height:0}`,

    // ── Sidebar (item list) ────────────────────────────────────
    `.panel-sidebar{width:260px;flex-shrink:0;border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;overflow:hidden}`,
    `.sidebar-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border-subtle);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}`,
    `.btn-add{background:var(--accent-blue-bg);color:var(--accent-blue-text);border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s}`,
    `.btn-add:hover{background:var(--accent-blue-text);color:#fff}`,
    `.item-list{flex:1;overflow-y:auto;padding:4px}`,
    `.item-row{display:flex;flex-direction:column;width:100%;text-align:left;background:none;border:none;padding:8px 12px;cursor:pointer;border-radius:6px;transition:background .1s;gap:2px}`,
    `.item-row:hover{background:var(--bg-secondary)}`,
    `.item-row.selected{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.item-name{font-size:13px;font-weight:500}`,
    `.item-meta{font-size:11px;color:var(--text-muted)}`,
    `.item-row.selected .item-meta{color:var(--accent-blue-text);opacity:.7}`,
    `.item-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:1px}`,
    `.tag{font-size:10px;background:var(--bg-tertiary);color:var(--text-muted);padding:1px 6px;border-radius:4px;font-weight:500;white-space:nowrap}`,
    `.tag.tag-empty{background:transparent;opacity:.4}`,
    `.item-row.selected .tag{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.item-row.selected .tag.tag-empty{opacity:.3}`,
    `.item-tags-caps{margin-top:3px}`,
    `.tag.tag-cap{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.tag.tag-cap.tag-empty{background:transparent;color:var(--text-muted);font-style:italic;opacity:.5}`,
    `.item-row.selected .tag.tag-cap{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.item-row.selected .tag.tag-cap.tag-empty{opacity:.3}`,
    `.tag.tag-default{background:var(--accent-blue-text);color:#fff;font-size:9px;padding:1px 6px;border-radius:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;display:inline-block;width:fit-content}`,
    `.item-row.selected .tag.tag-default{background:#fff;color:var(--accent-blue-text)}`,
    `.item-tags-roles{margin-top:3px}`,
    `.tag.tag-role{background:var(--tag-yellow-bg);color:var(--tag-yellow-text);text-transform:capitalize}`,
    `.tag.tag-role.tag-empty{background:transparent;color:var(--text-muted);font-style:italic;opacity:.5;text-transform:none}`,
    `.item-row.selected .tag.tag-role{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.item-row.selected .tag.tag-role.tag-empty{opacity:.3}`,
    `.filter-input{width:100%;box-sizing:border-box;padding:7px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);border:none;border-bottom:1px solid var(--border-subtle);outline:none;transition:background .15s}`,
    `.filter-input:focus{background:var(--bg-tertiary)}`,
    `.filter-input::placeholder{color:var(--text-muted);opacity:.6}`,
    `.empty-list{text-align:center;padding:24px 12px;font-size:12px;color:var(--text-muted)}`,

    // ── Form panel ─────────────────────────────────────────────
    `.panel-form{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:8px}`,
    `.panel-form h4{margin:0 0 4px;font-size:14px;color:var(--text-primary)}`,
    `.panel-form label{font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;margin-top:4px}`,
    `.label-hint{font-weight:400;text-transform:none;opacity:.7}`,
    `.panel-form input,.panel-form select,.panel-form textarea{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s}`,
    `.panel-form input:focus,.panel-form select:focus,.panel-form textarea:focus{border-color:var(--accent-blue-text)}`,
    `.panel-form textarea{font-family:'Fira Code','Consolas',monospace;font-size:12px;resize:vertical;min-height:80px}`,
    `.empty-form{display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted)}`,
    `.empty-icon{font-size:36px;margin-bottom:8px;opacity:.5}`,
    `.empty-form p{font-size:13px;margin:0}`,

    // ── Form actions ───────────────────────────────────────────
    `.form-actions{display:flex;gap:8px;margin-top:8px}`,
    `.btn-save{background:var(--accent-blue-text);color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s}`,
    `.btn-save:hover{opacity:.85}`,
    `.btn-save:disabled{opacity:.4;cursor:not-allowed}`,
    `.btn-delete{background:none;color:var(--tag-red-text);border:1px solid var(--tag-red-text);padding:7px 16px;border-radius:6px;font-size:12px;cursor:pointer;transition:all .15s}`,
    `.btn-delete:hover{background:var(--tag-red-bg)}`,
    `.btn-delete:disabled{opacity:.4;cursor:not-allowed}`,
    `.btn-cancel{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);padding:7px 16px;border-radius:6px;font-size:12px;cursor:pointer;transition:background .15s}`,
    `.btn-cancel:hover{background:var(--bg-tertiary)}`,

    // ── Capabilities row ────────────────────────────────────────
    `.caps-row{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0}`,
    `.cap-toggle{display:flex;align-items:center;gap:5px;background:var(--bg-secondary);border:1px solid var(--border-default);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:all .15s;user-select:none}`,
    `.cap-toggle:hover{background:var(--bg-tertiary)}`,
    `.cap-toggle input[type=checkbox]{accent-color:var(--accent-blue-text);cursor:pointer}`,
    `.cap-toggle span{text-transform:capitalize}`,

    // ── Advanced JSON section ────────────────────────────────────
    `.advanced-json{margin-top:8px}`,
    `.advanced-json summary{font-size:12px;font-weight:600;color:var(--text-muted);cursor:pointer;text-transform:uppercase;letter-spacing:.3px}`,
    `.advanced-json textarea{margin-top:6px}`,

    // ── Roles table ────────────────────────────────────────────
    `.tab-roles{flex-direction:column}`,
    `.roles-table-wrap{flex:1;overflow:auto;padding:16px 20px}`,
    `.roles-table{width:100%;border-collapse:collapse;font-size:13px}`,
    `.roles-table th{padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);border-bottom:2px solid var(--border-default)}`,
    `.roles-table td{padding:10px 12px;border-bottom:1px solid var(--border-subtle)}`,
    `.role-label{font-weight:600;color:var(--text-primary);text-transform:capitalize;font-size:14px}`,
    `.role-select{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;outline:none;width:100%;cursor:pointer}`,
    `.role-select:focus{border-color:var(--accent-blue-text)}`,
    `.btn-save-role{background:var(--accent-blue-bg);color:var(--accent-blue-text);border:none;padding:5px 10px;border-radius:6px;font-size:13px;cursor:pointer;transition:all .15s}`,
    `.btn-save-role:hover{background:var(--accent-blue-text);color:#fff}`,
    `.btn-save-role:disabled{opacity:.4;cursor:not-allowed}`,

    // ── Seed defaults ─────────────────────────────────────────
    `.roles-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;color:var(--text-muted);text-align:center}`,
    `.roles-empty h4{margin:8px 0 4px;font-size:15px;color:var(--text-primary)}`,
    `.roles-empty p{margin:0 0 16px;font-size:13px;max-width:360px;line-height:1.5}`,
    `.btn-seed{background:var(--accent-blue-text);color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}`,
    `.btn-seed:hover{opacity:.85;transform:translateY(-1px)}`,
    `.btn-seed:disabled{opacity:.5;cursor:not-allowed;transform:none}`,
    `.btn-seed-force{background:var(--tag-orange-bg, #fff3e0);color:var(--tag-orange-text, #e65100);border:1px solid var(--tag-orange-text, #e65100);padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;margin-top:10px}`,
    `.btn-seed-force:hover{background:var(--tag-orange-text, #e65100);color:#fff;transform:translateY(-1px)}`,
    `.btn-seed-force:disabled{opacity:.5;cursor:not-allowed;transform:none}`,
    `.roles-toolbar-btns{display:flex;gap:8px}`,
    `.btn-seed-force-sm{background:var(--tag-orange-bg, #fff3e0);color:var(--tag-orange-text, #e65100);border:1px solid var(--tag-orange-text, #e65100);padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s}`,
    `.btn-seed-force-sm:hover{background:var(--tag-orange-text, #e65100);color:#fff}`,
    `.btn-seed-force-sm:disabled{opacity:.4;cursor:not-allowed}`,
    // ── Group header (models tab) ────────────────────────────
    `.group-header{display:flex;justify-content:space-between;align-items:center;padding:6px 12px 3px;margin-top:4px;border-top:1px solid var(--border-subtle)}`,
    `.group-header:first-child{border-top:none;margin-top:0}`,
    `.group-label{font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px}`,
    `.group-count{font-size:10px;background:var(--bg-tertiary);color:var(--text-muted);padding:1px 7px;border-radius:10px;font-weight:600}`,
    `.roles-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}`,
    `.roles-hint{font-size:12px;color:var(--text-muted)}`,
    `.field-hint{font-size:11px;color:var(--text-muted);opacity:.75;margin:-4px 0 8px;line-height:1.4}`,
    `.tab-logging .panel-form{gap:4px}`,
    `.tab-logging select{margin-bottom:2px}`,
    `.btn-seed-sm{background:none;color:var(--accent-blue-text);border:1px solid var(--accent-blue-text);padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s}`,
    `.btn-seed-sm:hover{background:var(--accent-blue-bg)}`,
    `.btn-seed-sm:disabled{opacity:.4;cursor:not-allowed}`,

    // ── Responsive ─────────────────────────────────────────────
    `@media(max-width:700px){.dialog{max-width:100%;max-height:95vh;border-radius:0}.tab-panel{flex-direction:column}.panel-sidebar{width:100%;max-height:140px;border-right:none;border-bottom:1px solid var(--border-subtle)}.panel-form{max-height:50vh}}`,
  ],
})
export class AIConfigDialogComponent {
  readonly visible = signal(false);
  readonly activeTab = signal<TabId>('providers');

  readonly tabs: { id: TabId; label: string }[] = [
    { id: 'providers', label: 'Providers' },
    { id: 'harnesses', label: 'Harnesses' },
    { id: 'models', label: 'Models' },
    { id: 'roles', label: 'Role Assignment' },
    { id: 'logging', label: 'Logging' },
  ];

  readonly PROVIDER_TYPES = PROVIDER_TYPES;
  readonly ROLES = ROLES;
  readonly CAPABILITY_KEYS = CAPABILITY_KEYS;

  // ── Edit state (per-tab form) ───────────────────────────────
  readonly selectedProviderId = signal<string | null>(null);
  readonly editProviderForm = signal<Partial<AIProvider> & { id: string; name: string; type: string } | null>(null);

  readonly selectedHarnessId = signal<string | null>(null);
  readonly editHarnessForm = signal<Partial<AIHarness> & { id: string; name: string } | null>(null);

  /** Free-text filter for the harness list — searches name, execution mode, and capabilities. */
  readonly harnessFilter = signal('');

  /** Parsed invocation_semantics for structured editing. */
  readonly harnessParsed = signal<HarnessSemanticsForm | null>(null);

  readonly ROLE_MAPPING_STRATEGIES = [
    { value: 'agent', label: 'Agent CLI flag (--agent)' },
    { value: 'prompt_file', label: 'Prompt file (write + pass path)' },
    { value: 'system_flag', label: 'System prompt flag (--system)' },
    { value: 'none', label: 'None (caller handles role)' },
  ];

  readonly EXECUTION_MODES = [
    { value: 'oneshot', label: 'Oneshot' },
    { value: 'interactive', label: 'Interactive' },
    { value: 'daemon', label: 'Daemon' },
  ];

  readonly selectedModelId = signal<string | null>(null);
  readonly editModelForm = signal<Partial<AIModel> & { id: string; name: string; harness_id: string; provider_id: string | null } | null>(null);

  // Per-role editor state (bound to select dropdowns)
  readonly roleEdits: Record<string, { provider_id: string; harness_id: string; model_id: string }> = {};

  readonly config: AIConfigService['config'];
  readonly saving: AIConfigService['saving'];

  constructor(public aiConfig: AIConfigService) {
    this.config = this.aiConfig.config;
    this.saving = this.aiConfig.saving;
    for (const r of ROLES) {
      this.roleEdits[r] = { provider_id: '', harness_id: '', model_id: '' };
    }
  }

  // ── Visibility ──────────────────────────────────────────────
  open(): void {
    this.aiConfig.fetch().subscribe({
      next: () => this._syncRoleEdits(),
      error: () => {}, // silently ignore — roleEdits stay at empty state
    });
    this.visible.set(true);
    this.activeTab.set('providers');
    this._resetAllForms();
  }

  close(): void {
    this.visible.set(false);
  }

  // ── Tab counts ──────────────────────────────────────────────
  countForTab(id: TabId): number {
    const c = this.config();
    switch (id) {
      case 'providers': return c.providers.length;
      case 'harnesses': return c.harnesses.length;
      case 'models': return c.models.length;
      case 'roles': return c.roles.length;
      case 'logging': return 0;
      default: return 0;
    }
  }

  // ── Seed defaults ──────────────────────────────────────────
  seedDefaults(force = false): void {
    this.aiConfig.seedDefaults(force);
    // Refetch will happen automatically via seedDefaults() calling fetch()
  }

  // ── Harness display helpers ────────────────────────────────

  /** Extract a dot-separated field from a harness's invocation_semantics JSON. */
  harnessField(h: AIHarness, path: string): string {
    try {
      const sem = JSON.parse(h.invocation_semantics || '{}');
      const val = path.split('.').reduce((o: any, k: string) => o?.[k], sem);
      return typeof val === 'string' ? val : '';
    } catch { return ''; }
  }

  /** Return an array of enabled capability keys for a harness. */
  harnessCapabilities(h: AIHarness): string[] {
    try {
      const sem = JSON.parse(h.invocation_semantics || '{}');
      const caps = sem.capabilities ?? {};
      return Object.keys(caps).filter((k: string) => caps[k] === true);
    } catch { return []; }
  }

  /** Whether the given model is the default model from registry.json. */
  isDefaultModel(m: AIModel): boolean {
    return m.model_identifier === DEFAULT_MODEL_IDENTIFIER;
  }

  /** Return the roles assigned to this model. */
  rolesForModel(m: AIModel): string[] {
    return this.config().roles
      .filter(r => r.model_id === m.id)
      .map(r => r.role);
  }

  /** Group models by provider for the models tab sidebar, sorted by provider name then model name. */
  modelsByProvider(): { providerName: string; models: AIModel[] }[] {
    const map = new Map<string, AIModel[]>();
    for (const m of this.config().models) {
      const pid = m.provider_id || '__unassigned__';
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(m);
    }
    // Sort models within each group by name
    for (const models of map.values()) {
      models.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(map.entries())
      .map(([pid, models]) => ({
        providerName: pid === '__unassigned__' ? 'No provider' : this.providerName(pid),
        models,
      }))
      .sort((a, b) => a.providerName.localeCompare(b.providerName));
  }

  /** Filtered harnesses based on search query. */
  filteredHarnesses(): AIHarness[] {
    const q = this.harnessFilter().toLowerCase().trim();
    if (!q) return this.config().harnesses;

    return this.config().harnesses.filter(h => {
      // Search by name
      if (h.name.toLowerCase().includes(q)) return true;
      // Search by execution mode
      const mode = this.harnessField(h, 'execution.mode').toLowerCase();
      if (mode.includes(q)) return true;
      // Search by role mapping strategy
      const strat = this.harnessField(h, 'role_mapping.strategy').toLowerCase();
      if (strat.includes(q)) return true;
      // Search by capabilities
      const caps = this.harnessCapabilities(h);
      if (caps.some(c => c.includes(q))) return true;

      return false;
    });
  }

  // ── Provider helpers ────────────────────────────────────────
  providerName(id: string): string {
    const p = this.config().providers.find(pr => pr.id === id);
    return p ? p.name : id;
  }

  // ── Providers ───────────────────────────────────────────────
  startNewProvider(): void {
    this.editProviderForm.set({ id: '', name: '', type: 'openai', endpoint_url: null, api_key: null, config_json: '{}' });
    this.selectedProviderId.set(null);
  }

  editProvider(p: AIProvider): void {
    this.editProviderForm.set({ ...p });
    this.selectedProviderId.set(p.id);
  }

  cancelEditProvider(): void {
    this.editProviderForm.set(null);
    this.selectedProviderId.set(null);
  }

  saveProvider(): void {
    const f = this.editProviderForm();
    if (!f || !f.name || !f.type) return;
    const id = f.id || `prov-${Date.now()}`;
    this.aiConfig.saveProvider({
      id,
      name: f.name,
      type: f.type as AIProvider['type'],
      endpoint_url: f.endpoint_url ?? null,
      api_key: f.api_key ?? null,
      config_json: f.config_json ?? '{}',
    });
    this.cancelEditProvider();
  }

  deleteProvider(id: string): void {
    this.aiConfig.deleteProvider(id);
    this.cancelEditProvider();
  }

  // ── Harness semantics helpers ───────────────────────────────

  /** Parse invocation_semantics JSON into structured form fields. */
  private parseHarnessSemantics(jsonStr: string): HarnessSemanticsForm {
    try {
      const obj = JSON.parse(jsonStr || '{}');
      const caps = obj.capabilities || {};
      const exec = obj.execution || {};
      const role = obj.role_mapping || {};
      return {
        binary: obj.binary || '',
        executionMode: exec.mode || '',
        executionSubcommand: exec.subcommand || '',
        roleMappingStrategy: role.strategy || '',
        capabilities: {
          model: caps.model ?? false,
          agent: caps.agent ?? false,
          working_directory: caps.working_directory ?? false,
          system_prompt: caps.system_prompt ?? false,
        },
        originalJson: jsonStr || '',
        rawJson: '',
      };
    } catch {
      return {
        binary: '', executionMode: '', executionSubcommand: '',
        roleMappingStrategy: '',
        capabilities: { model: false, agent: false, working_directory: false, system_prompt: false },
        originalJson: '',
        rawJson: '',
      };
    }
  }

  /** Serialize structured form fields back to invocation_semantics JSON. */
  private serializeHarnessSemantics(form: HarnessSemanticsForm): string {
    // Build the semantics object preserving only non-default keys
    const caps: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(form.capabilities)) {
      if (v) caps[k] = true;
    }

    const exec: Record<string, string> = {};
    if (form.executionMode) exec['mode'] = form.executionMode;
    if (form.executionSubcommand) exec['subcommand'] = form.executionSubcommand;

    const role: Record<string, string> = {};
    if (form.roleMappingStrategy) role['strategy'] = form.roleMappingStrategy;

    const obj: Record<string, any> = {};
    if (form.binary) obj['binary'] = form.binary;
    if (Object.keys(caps).length > 0) obj['capabilities'] = caps;
    if (Object.keys(exec).length > 0) obj['execution'] = exec;
    if (Object.keys(role).length > 0) obj['role_mapping'] = role;

    // Preserve semantics field mappings from the original JSON
    const semanticsSource = form.rawJson || form.originalJson;
    if (semanticsSource) {
      try {
        const src = JSON.parse(semanticsSource) as Record<string, any>;
        if (src['semantics']) obj['semantics'] = src['semantics'];
        if (src['binary'] && !obj['binary']) obj['binary'] = src['binary'];
      } catch { /* ignore */ }
    }

    return JSON.stringify(obj, null, 2);
  }

  /** Update a single harness semantics field and re-serialize to invocation_semantics. */
  onHarnessFieldChange(): void {
    const f = this.editHarnessForm();
    const p = this.harnessParsed();
    if (!f || !p) return;
    f.invocation_semantics = this.serializeHarnessSemantics(p);
  }

  /** Toggle a capability checkbox and re-serialize. */
  toggleCapability(key: string, event: Event): void {
    const p = this.harnessParsed();
    if (!p) return;
    p.capabilities[key] = (event.target as HTMLInputElement).checked;
    this.onHarnessFieldChange();
  }

  // ── Harnesses ───────────────────────────────────────────────
  startNewHarness(): void {
    this.editHarnessForm.set({ id: '', name: '', invocation_semantics: '{}' });
    this.harnessParsed.set(this.parseHarnessSemantics('{}'));
    this.selectedHarnessId.set(null);
  }

  editHarness(h: AIHarness): void {
    this.editHarnessForm.set({ ...h });
    this.harnessParsed.set(this.parseHarnessSemantics(h.invocation_semantics));
    this.selectedHarnessId.set(h.id);
  }

  cancelEditHarness(): void {
    this.editHarnessForm.set(null);
    this.harnessParsed.set(null);
    this.selectedHarnessId.set(null);
  }

  saveHarness(): void {
    const f = this.editHarnessForm();
    if (!f || !f.name) return;
    const id = f.id || `harn-${Date.now()}`;

    // Serialize structured form fields to JSON before saving
    const p = this.harnessParsed();
    if (p) {
      f.invocation_semantics = this.serializeHarnessSemantics(p);
    }

    this.aiConfig.saveHarness({
      id,
      name: f.name,
      invocation_semantics: f.invocation_semantics ?? '{}',
    });
    this.cancelEditHarness();
  }

  deleteHarness(id: string): void {
    this.aiConfig.deleteHarness(id);
    this.cancelEditHarness();
  }

  // ── Models ──────────────────────────────────────────────────
  startNewModel(): void {
    this.editModelForm.set({ id: '', name: '', provider_id: '', harness_id: '', model_identifier: '' });
    this.selectedModelId.set(null);
  }

  editModel(m: AIModel): void {
    this.editModelForm.set({ ...m });
    this.selectedModelId.set(m.id);
  }

  cancelEditModel(): void {
    this.editModelForm.set(null);
    this.selectedModelId.set(null);
  }

  saveModel(): void {
    const f = this.editModelForm();
    if (!f || !f.name || !f.harness_id || !f.model_identifier) return;
    const id = f.id || `mod-${Date.now()}`;
    this.aiConfig.saveModel({
      id,
      name: f.name,
      harness_id: f.harness_id,
      provider_id: f.provider_id || null,
      model_identifier: f.model_identifier,
    });
    this.cancelEditModel();
  }

  deleteModel(id: string): void {
    this.aiConfig.deleteModel(id);
    this.cancelEditModel();
  }

  // ── Roles ───────────────────────────────────────────────────
  
  /** Called when the user changes the provider for a role — reset harness and model. */
  onRoleProviderChange(role: string): void {
    this.roleEdits[role].harness_id = '';
    this.roleEdits[role].model_id = '';
  }

  /** Called when the user changes the harness for a role — reset model. */
  onRoleHarnessChange(role: string): void {
    this.roleEdits[role].model_id = '';
  }

  /** Filter models by the role's selected provider AND harness.
   *  When a provider is selected, models without an assigned provider
   *  (null/empty) are also shown so they remain selectable even if the
   *  model's provider_id doesn't match the current provider's ID. */
  filteredModelsForRole(role: string): AIModel[] {
    let models = this.config().models;
    const pid = this.roleEdits[role]?.provider_id;
    const hid = this.roleEdits[role]?.harness_id;
    if (pid) models = models.filter(m => !m.provider_id || m.provider_id === pid);
    if (hid) models = models.filter(m => m.harness_id === hid);
    return models;
  }

  saveRole(role: string): void {
    const edits = this.roleEdits[role];
    if (!edits || !edits.provider_id || !edits.harness_id || !edits.model_id) return;

    // Check for existing config to reuse ID
    const existing = this.config().roles.find(r => r.role === role);
    const id = existing?.id ?? `rc-${role}-${Date.now()}`;

    this.aiConfig.saveRoleConfig({
      id,
      role: role as AIRoleConfig['role'],
      provider_id: edits.provider_id,
      harness_id: edits.harness_id,
      model_id: edits.model_id,
      extra_params: existing?.extra_params ?? '{}',
    });
  }

  // ── Logging ────────────────────────────────────────────────
  onLogLevelChange(field: keyof import('../../services/ai-config.service').LogSettings, value: string): void {
    const current = this.aiConfig.logSettings();
    this.aiConfig.saveLogSettings({
      ...current,
      [field]: value as LogLevel,
    });
  }

  // ── Internal ────────────────────────────────────────────────
  private _resetAllForms(): void {
    this.editProviderForm.set(null);
    this.editHarnessForm.set(null);
    this.editModelForm.set(null);
    this.selectedProviderId.set(null);
    this.selectedHarnessId.set(null);
    this.selectedModelId.set(null);
  }

  /** Populate roleEdits from the latest config snapshot. */
  private _syncRoleEdits(): void {
    const c = this.config();
    for (const r of ROLES) {
      const existing = c.roles.find(rc => rc.role === r);
      this.roleEdits[r] = {
        provider_id: existing?.provider_id ?? '',
        harness_id: existing?.harness_id ?? '',
        model_id: existing?.model_id ?? '',
      };
    }
  }
}
