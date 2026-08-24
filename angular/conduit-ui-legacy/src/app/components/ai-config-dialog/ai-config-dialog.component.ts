import { Component, HostListener, signal, inject, OnDestroy } from '@angular/core';
import { NgFor, NgIf, NgSwitch, NgSwitchCase, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AIConfigService, AIProvider, AIHarness, AIModel, AIRoleConfig, LogLevel, FailureRecoveryConfig } from '../../services/ai-config.service';
import { ToastService } from '../../services/toast.service';
import { API_BASE_URL } from '../../services/api-config';

type TabId = 'providers' | 'harnesses' | 'models' | 'roles' | 'logging' | 'test' | 'failure-recovery';

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

// Gap 5 (architect review): the role list was hardcoded to 4 roles so new
// roles never appeared in the dialog. It is now a signal populated from
// tackle-srv GET /roles at open time; this is the offline fallback.
const ROLES_FALLBACK = ['planner', 'builder', 'reviewer', 'critic'];

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

interface ConfirmDelete {
  type: 'provider' | 'harness' | 'model';
  id: string;
  name: string;
  affectedModels: string[];
  affectedModelIds: string[];
  affectedRoles: string[];
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
          <div class="header-actions">
            <button class="header-btn" (click)="exportConfig()" title="Export config as JSON">📥 Export</button>
            <button class="header-btn" (click)="importConfigClick()" title="Import config from JSON file">📤 Import</button>
            <input data-import-input type="file" accept=".json" (change)="onImportFileSelected($event)" style="display:none" />
          </div>
          <button class="close-btn" (click)="close()">✕</button>
        </div>

        <!-- Tab bar -->
        <div class="tabs">
          <button
            *ngFor="let t of tabs"
            class="tab"
            [class.active]="activeTab() === t.id"
            (click)="switchTab(t.id)"
          >
            {{ t.label }}
            <span class="tab-count">{{ countForTab(t.id) }}</span>
          </button>
        </div>

        <!-- Tab content -->
        <div class="tab-body">
          <ng-container [ngSwitch]="activeTab()">
            <!-- ─── Providers Tab ─── -->
            <div *ngSwitchCase="'providers'" class="tab-panel tab-models">
              <div class="roles-toolbar">
                <span class="filter-wrap">
                  <input class="filter-input" style="width:240px" [ngModel]="providerFilter()" (ngModelChange)="providerFilter.set($event)" placeholder="🔍 Filter by name, type, endpoint…" />
                  <button class="filter-clear" *ngIf="providerFilter()" (click)="providerFilter.set('')">✕</button>
                </span>
                <span class="roles-hint">{{ filteredProviders().length }} / {{ config().providers.length }} provider(s)</span>
                <div class="roles-toolbar-btns">
                  <button class="btn-save-sm" (click)="startNewProvider()">+ Add</button>
                  <button class="btn-save-sm" (click)="editSelectedProvider()" [disabled]="!selectedProviderId()" style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default)">✏ Edit</button>
                  <button class="btn-seed-force-sm" (click)="deleteSelectedProvider()" [disabled]="!selectedProviderId()">🗑 Delete</button>
                </div>
              </div>
              <div class="roles-table-wrap">
                <table class="roles-table">
                  <thead>
                    <tr>
                      <th class="sortable" (click)="toggleSort('providers', 'name')">Name{{ sortIndicator('providers', 'name') }}</th>
                      <th class="sortable" (click)="toggleSort('providers', 'type')">Type{{ sortIndicator('providers', 'type') }}</th>
                      <th class="sortable" (click)="toggleSort('providers', 'endpoint')">Endpoint URL{{ sortIndicator('providers', 'endpoint') }}</th>
                      <th>Used by</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let p of filteredProviders()" class="model-table-row" [class.selected]="selectedProviderId() === p.id" (click)="selectedProviderId.set(p.id)" (dblclick)="editProvider(p)">
                      <td class="model-name-cell">{{ p.name }}</td>
                      <td><span class="tag tag-role">{{ p.type }}</span></td>
                      <td><code class="model-id-code">{{ p.endpoint_url || '—' }}</code></td>
                      <td>
                        <span class="item-tags item-tags-roles">
                          <span class="tag tag-role" *ngFor="let role of rolesForProvider(p.id)">{{ role }}</span>
                          <span class="tag tag-role tag-empty" *ngIf="rolesForProvider(p.id).length === 0">unused</span>
                        </span>
                      </td>
                    </tr>
                    <tr *ngIf="config().providers.length === 0">
                      <td colspan="4" class="empty-table-cell">No providers configured — click + Add to create one</td>
                    </tr>
                    <tr *ngIf="config().providers.length > 0 && filteredProviders().length === 0">
                      <td colspan="4" class="empty-table-cell">No providers match your filter</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <!-- Add/Edit Modal -->
              <div class="mini-overlay" *ngIf="editProviderForm()" (click)="cancelEditProvider()">
                <div class="mini-dialog" (click)="$event.stopPropagation()">
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
                    <button class="btn-delete" *ngIf="editProviderForm()!.id" (click)="deleteProvider(editProviderForm()!.id)">🗑 Delete</button>
                    <button class="btn-cancel" (click)="cancelEditProvider()">Cancel</button>
                    <button class="btn-save" (click)="saveProvider()" [disabled]="!editProviderForm()?.name || !editProviderForm()?.type">💾 Save</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ─── Harnesses Tab ─── -->
            <div *ngSwitchCase="'harnesses'" class="tab-panel tab-models">
              <div class="roles-toolbar">
                <span class="filter-wrap">
                  <input class="filter-input" style="width:240px" [ngModel]="harnessFilter()" (ngModelChange)="harnessFilter.set($event)" placeholder="🔍 Filter by name, mode, capability…" />
                  <button class="filter-clear" *ngIf="harnessFilter()" (click)="harnessFilter.set('')">✕</button>
                </span>
                <span class="roles-hint">{{ filteredHarnesses().length }} / {{ config().harnesses.length }} harness(es)</span>
                <div class="roles-toolbar-btns">
                  <button class="btn-save-sm" (click)="startNewHarness()">+ Add</button>
                  <button class="btn-save-sm" (click)="editSelectedHarness()" [disabled]="!selectedHarnessId()" style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default)">✏ Edit</button>
                  <button class="btn-seed-force-sm" (click)="deleteSelectedHarness()" [disabled]="!selectedHarnessId()">🗑 Delete</button>
                </div>
              </div>
              <div class="roles-table-wrap">
                <table class="roles-table">
                  <thead>
                    <tr>
                      <th class="sortable" (click)="toggleSort('harnesses', 'name')">Name{{ sortIndicator('harnesses', 'name') }}</th>
                      <th class="sortable" (click)="toggleSort('harnesses', 'binary')">Binary{{ sortIndicator('harnesses', 'binary') }}</th>
                      <th class="sortable" (click)="toggleSort('harnesses', 'mode')">Mode{{ sortIndicator('harnesses', 'mode') }}</th>
                      <th class="sortable" (click)="toggleSort('harnesses', 'strategy')">Strategy{{ sortIndicator('harnesses', 'strategy') }}</th>
                      <th>Capabilities</th>
                      <th>Used by</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let h of filteredHarnesses()" class="model-table-row" [class.selected]="selectedHarnessId() === h.id" (click)="selectedHarnessId.set(h.id)" (dblclick)="editHarness(h)">
                      <td class="model-name-cell">{{ h.name }}</td>
                      <td><code class="model-id-code">{{ harnessField(h, 'binary') || '—' }}</code></td>
                      <td>
                        <span class="tag" [class.tag-empty]="!harnessField(h, 'execution.mode')">{{ harnessField(h, 'execution.mode') || '—' }}</span>
                      </td>
                      <td>
                        <span class="tag" [class.tag-empty]="!harnessField(h, 'role_mapping.strategy')">{{ harnessField(h, 'role_mapping.strategy') || '—' }}</span>
                      </td>
                      <td>
                        <span class="item-tags item-tags-caps">
                          <span class="tag tag-cap" *ngFor="let cap of harnessCapabilities(h)">{{ cap.replace('_', ' ') }}</span>
                          <span class="tag tag-cap tag-empty" *ngIf="harnessCapabilities(h).length === 0">none</span>
                        </span>
                      </td>
                      <td>
                        <span class="item-tags item-tags-roles">
                          <span class="tag tag-role" *ngFor="let role of rolesForHarness(h.id)">{{ role }}</span>
                          <span class="tag tag-role tag-empty" *ngIf="rolesForHarness(h.id).length === 0">unused</span>
                        </span>
                      </td>
                    </tr>
                    <tr *ngIf="config().harnesses.length === 0">
                      <td colspan="6" class="empty-table-cell">No harnesses configured — click + Add to create one</td>
                    </tr>
                    <tr *ngIf="config().harnesses.length > 0 && filteredHarnesses().length === 0">
                      <td colspan="6" class="empty-table-cell">No harnesses match your filter</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <!-- Add/Edit Modal -->
              <div class="mini-overlay" *ngIf="editHarnessForm()" (click)="cancelEditHarness()">
                <div class="mini-dialog" (click)="$event.stopPropagation()">
                  <h4>{{ editHarnessForm()!.id ? 'Edit' : 'New' }} Harness</h4>
                  <label>Name</label>
                  <input [(ngModel)]="editHarnessForm()!.name" placeholder="e.g. Opencode CLI" />
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
                    <button class="btn-delete" *ngIf="editHarnessForm()!.id" (click)="deleteHarness(editHarnessForm()!.id)">🗑 Delete</button>
                    <button class="btn-cancel" (click)="cancelEditHarness()">Cancel</button>
                    <button class="btn-save" (click)="saveHarness()" [disabled]="!editHarnessForm()?.name">💾 Save</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ─── Models Tab ─── -->
            <div *ngSwitchCase="'models'" class="tab-panel tab-models">
              <!-- Toolbar -->
              <div class="roles-toolbar">
                <span class="filter-wrap">
                  <input class="filter-input" style="width:240px" [ngModel]="modelFilter()" (ngModelChange)="modelFilter.set($event)" placeholder="🔍 Filter by name, identifier, provider, harness…" />
                  <button class="filter-clear" *ngIf="modelFilter()" (click)="modelFilter.set('')">✕</button>
                </span>
                <span class="roles-hint">{{ filteredModels().length }} / {{ config().models.length }} model(s)</span>
                <div class="roles-toolbar-btns">
                  <button class="btn-save-sm" (click)="startNewModel()">+ Add</button>
                  <button class="btn-save-sm" (click)="editSelectedModel()" [disabled]="!selectedModelId()" style="background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default)">✏ Edit</button>
                  <button class="btn-save-sm" (click)="testSelectedModel()" [disabled]="!selectedModelId()" style="background:var(--tag-green-bg);color:var(--tag-green-text);border:1px solid var(--tag-green-text)">▶ Test</button>
                  <button class="btn-seed-force-sm" (click)="deleteSelectedModel()" [disabled]="!selectedModelId()">🗑 Delete</button>
                </div>
              </div>
              <!-- Model table -->
              <div class="roles-table-wrap">
                <table class="roles-table">
                  <thead>
                    <tr>
                      <th style="width:40px"></th>
                      <th class="sortable" (click)="toggleSort('models', 'name')">Name{{ sortIndicator('models', 'name') }}</th>
                      <th class="sortable" (click)="toggleSort('models', 'identifier')">Identifier{{ sortIndicator('models', 'identifier') }}</th>
                      <th class="sortable" (click)="toggleSort('models', 'provider')">Provider{{ sortIndicator('models', 'provider') }}</th>
                      <th class="sortable" (click)="toggleSort('models', 'harness')">Harness{{ sortIndicator('models', 'harness') }}</th>
                      <th>Assigned Roles</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      *ngFor="let m of filteredModels()"
                      class="model-table-row"
                      [class.selected]="selectedModelId() === m.id"
                      [class.pulse-row]="confirmDelete() && isModelAffected(m.id)"
                      (click)="selectedModelId.set(m.id)"
                      (dblclick)="editModel(m)"
                    >
                      <td>
                        <span class="tag tag-default" *ngIf="isDefaultModel(m)" style="font-size:9px">def</span>
                      </td>
                      <td class="model-name-cell">{{ m.name }}</td>
                      <td><code class="model-id-code">{{ m.model_identifier }}</code></td>
                      <td>{{ providerName(m.provider_id || '') || '—' }}</td>
                      <td>{{ harnessName(m.harness_id) }}</td>
                      <td>
                        <span class="item-tags item-tags-roles">
                          <span class="tag tag-role" *ngFor="let role of rolesForModel(m)">{{ role }}</span>
                          <span class="tag tag-role tag-empty" *ngIf="rolesForModel(m).length === 0">unassigned</span>
                        </span>
                      </td>
                    </tr>
                    <tr *ngIf="config().models.length === 0">
                      <td colspan="6" class="empty-table-cell">No models configured — click + Add to create one</td>
                    </tr>
                    <tr *ngIf="config().models.length > 0 && filteredModels().length === 0">
                      <td colspan="6" class="empty-table-cell">No models match your filter</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <!-- Add/Edit Model Modal -->
              <div class="mini-overlay" *ngIf="editModelForm()" (click)="cancelEditModel()">
                <div class="mini-dialog" (click)="$event.stopPropagation()">
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
                    <button class="btn-delete" *ngIf="editModelForm()!.id" (click)="deleteModel(editModelForm()!.id)">🗑 Delete</button>
                    <button class="btn-cancel" (click)="cancelEditModel()">Cancel</button>
                    <button class="btn-save" (click)="saveModel()" [disabled]="!editModelForm()?.name || !editModelForm()?.harness_id || !editModelForm()?.model_identifier">💾 Save</button>
                  </div>
                </div>
              </div>
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
                <div class="roles-toolbar">
                  <span class="filter-wrap">
                    <input class="filter-input" style="width:240px" [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)" placeholder="🔍 Filter by model, provider, harness…" />
                    <button class="filter-clear" *ngIf="roleFilter()" (click)="roleFilter.set('')">✕</button>
                  </span>
                  <span class="roles-hint">{{ filteredRoles().length }} / {{ roles().length }} roles · Each role can have multiple models (ordered by priority), each with its own provider and harness</span>
                  <div class="roles-toolbar-btns">
                    <button class="btn-save-sm" (click)="saveAllRoles()" [disabled]="!hasDirtyRoles()">💾 Save</button>
                    <span class="roles-dirty-badge" *ngIf="hasDirtyRoles()">● Pending changes</span>
                    <span class="roles-clean-badge" *ngIf="!hasDirtyRoles()">✓</span>
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
                        <th>Models (provider · harness)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let r of filteredRoles()">
                        <td class="role-label">
                          <span class="role-dirty-dot" *ngIf="isRoleDirty(r)">●</span>
                          {{ r | titlecase }}
                        </td>
                        <td>
                          <div class="model-list">
                            <div class="model-item" *ngFor="let entry of roleEdits[r].model_entries; let i = index; let first = first; let last = last">
                              <span class="model-badge" *ngIf="first">primary</span>
                              <span class="model-badge model-badge-fallback" *ngIf="!first">#{{ i + 1 }}</span>
                              <select [ngModel]="entry.model_id" (ngModelChange)="onRoleModelChange(r, i, $event)" class="model-select" [class.model-primary]="first">
                                <option *ngFor="let mod of availableModelsForRole(r, i)" [value]="mod.id">{{ mod.name }}</option>
                              </select>
                              <select [ngModel]="entry.provider_id" (ngModelChange)="entry.provider_id = $event" class="model-provider-select">
                                <option value="">— provider —</option>
                                <option *ngFor="let p of config().providers" [value]="p.id">{{ p.name }}</option>
                              </select>
                              <select [ngModel]="entry.harness_id" (ngModelChange)="entry.harness_id = $event" class="model-harness-select">
                                <option value="">— harness —</option>
                                <option *ngFor="let h of config().harnesses" [value]="h.id">{{ h.name }}</option>
                              </select>
                              <button class="btn-model-move" (click)="moveModelUp(r, i)" [disabled]="first" title="Move up">▲</button>
                              <button class="btn-model-move" (click)="moveModelDown(r, i)" [disabled]="last" title="Move down">▼</button>
                              <button class="btn-model-remove" (click)="removeModelFromRole(r, i)" *ngIf="!first" title="Remove">✕</button>
                            </div>
                            <div class="model-add-row">
                              <select class="model-add-select" (change)="addModelToRole(r, $event)">
                                <option value="">+ Add model</option>
                                <option *ngFor="let mod of filteredModelsForRole(r)" [value]="mod.id">{{ mod.name }}</option>
                              </select>
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr *ngIf="roles().length > 0 && filteredRoles().length === 0">
                        <td colspan="2" class="empty-table-cell">No roles match your filter</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </ng-template>
            </div>
            <!-- ─── Test Tab ─── -->
            <div *ngSwitchCase="'test'" class="tab-panel tab-test">
              <div class="panel-form">
                <h4>Test Model Configuration</h4>
                <span class="field-hint">Select a model and enter a test prompt to verify the configuration works — output streams in real-time.</span>
                
                <label>Model</label>
                <select [ngModel]="testModelId()" (ngModelChange)="onTestModelChange($event)">
                  <option value="">— Select a model —</option>
                  <option *ngFor="let m of config().models" [value]="m.id">{{ m.name }} ({{ m.model_identifier }})</option>
                </select>

                <!-- Command preview -->
                <label *ngIf="testCommandPreview()">Command Preview</label>
                <div class="cmd-preview-wrap" *ngIf="testCommandPreview()">
                  <div class="cmd-preview-header">
                    <span class="cmd-preview-label">Command</span>
                    <button class="cmd-copy-btn" (click)="copyCommandPreview()" [title]="copied() ? 'Copied!' : 'Copy to clipboard'">{{ copied() ? '✓ Copied' : '📋 Copy' }}</button>
                  </div>
                  <textarea
                    class="cmd-preview-textarea"
                    [ngModel]="testCommandPreview()"
                    readonly
                    rows="4"
                    spellcheck="false"
                    aria-label="Command preview for the selected model"
                  ></textarea>
                </div>

                <label>Test Prompt</label>
                <textarea
                  [ngModel]="testPrompt()"
                  (ngModelChange)="testPrompt.set($event)"
                  rows="6"
                  placeholder="Enter a test prompt to send to the model…"
                  class="test-prompt-input"
                ></textarea>
                
                <div class="test-actions">
                  <button class="btn-save" (click)="runTest()" [disabled]="!testModelId() || !testPrompt() || testRunning()">
                    {{ testRunning() ? '⏳ Running…' : '▶ Run Test' }}
                  </button>
                  <button class="btn-delete" (click)="cancelTest()" *ngIf="testRunning()">
                    ⏹ Cancel
                  </button>
                  <span class="test-status" *ngIf="testStatus()">{{ testStatus() }}</span>
                </div>

                <div class="test-output-wrap" *ngIf="testOutputLines().length > 0">
                  <div class="test-output-header">
                    <span>Output</span>
                    <span class="test-output-meta" *ngIf="testSessionId()">
                      session: <code>{{ testSessionId() }}</code>
                    </span>
                    <button class="btn-cancel" (click)="clearTestOutput()" style="margin-left:auto;padding:3px 8px;font-size:10px">Clear</button>
                  </div>
                  <div class="test-output" #testOutputRef>
                    <div *ngFor="let line of testOutputLines(); let i = index; trackBy: trackTestLine" class="test-output-line">
                      <span class="test-line-num">{{ i + 1 }}</span>
                      <span class="test-line-text">{{ line }}</span>
                    </div>
                    <div class="test-output-tail" *ngIf="testRunning()">⏳ waiting for output…</div>
                    <div class="test-output-tail test-output-done" *ngIf="!testRunning() && testOutputLines().length > 0">■ ended</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ─── Failure Recovery Tab ─── -->
            <div *ngSwitchCase="'failure-recovery'" class="tab-panel tab-failure">
              <div class="panel-form">
                <h4>Failure Recovery</h4>
                <span class="field-hint">Configure retry, fallback, and circuit breaker behavior when model invocations fail.</span>

                <label>Max Retries Per Model</label>
                <input type="number" min="0" max="20" [ngModel]="frConfig().max_retries_per_model"
                  (ngModelChange)="updateFrConfig('max_retries_per_model', +$event)" />
                <span class="field-hint">How many times to retry each model before switching to the next fallback. 0 = no retries.</span>

                <label>Retry Delay (seconds)</label>
                <input type="number" min="0" max="3600" step="10" [ngModel]="frConfig().retry_delay_seconds"
                  (ngModelChange)="updateFrConfig('retry_delay_seconds', +$event)" />
                <span class="field-hint">Seconds to wait between retry attempts on the same model.</span>

                <label>Max Fallback Models</label>
                <input type="number" min="0" max="20" [ngModel]="frConfig().max_fallbacks"
                  (ngModelChange)="updateFrConfig('max_fallbacks', +$event)" />
                <span class="field-hint">Maximum number of fallback models to try after the primary model is exhausted. 0 = no fallbacks (just retry primary).</span>

                <label>Circuit Breaker Retry After (seconds)</label>
                <input type="number" min="30" max="86400" step="30" [ngModel]="frConfig().circuit_breaker_retry_after"
                  (ngModelChange)="updateFrConfig('circuit_breaker_retry_after', +$event)" />
                <span class="field-hint">How long the circuit breaker stays tripped before allowing retry. The plan will be re-dispatched after this period.</span>

                <label class="checkbox-row">
                  <input type="checkbox" [checked]="frConfig().push_back_to_pending"
                    (change)="updateFrConfig('push_back_to_pending', $any($event.target).checked)" />
                  <span>Push plan back to pending state after circuit breaker trip</span>
                </label>
                <span class="field-hint">When enabled, the plan gets a REQUEUED receipt and a fresh builder ticket so it's automatically picked up once the breaker resets.</span>

                <div class="form-actions" style="margin-top:16px">
                  <button class="btn-save" (click)="saveFrConfig()" [disabled]="frSaving()">
                    {{ frSaving() ? 'Saving…' : '💾 Save' }}
                  </button>
                  <span class="fr-saved-msg" *ngIf="frSavedMsg()">{{ frSavedMsg() }}</span>
                </div>
              </div>
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
        <!-- Delete Confirmation Dialog -->
        <div class="mini-overlay" *ngIf="confirmDelete() as d" (click)="cancelConfirmDelete()" style="position:absolute">
          <div class="mini-dialog" (click)="$event.stopPropagation()" style="width:440px">
            <h4>⚠ Delete {{ d.type | titlecase }}</h4>
            <p class="confirm-body">
              <strong>{{ d.name }}</strong> is currently used by
              <strong>{{ d.affectedModels.length }} model(s)</strong>
              assigned to
              <strong>{{ d.affectedRoles.length }} role(s)</strong>:
              <span class="confirm-roles">
                <span class="tag tag-role" *ngFor="let r of d.affectedRoles">{{ r }}</span>
              </span>
              <br />Deleting it will remove it from those role assignments.
            </p>
            <div class="form-actions">
              <button class="btn-cancel" (click)="cancelConfirmDelete()">Cancel</button>
              <button class="btn-delete" (click)="confirmDeleteNow()">🗑 Delete Anyway</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    // ── Overlay ────────────────────────────────────────────────
    `.overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .15s}`,
    `@keyframes fadeIn{from{opacity:0}to{opacity:1}}`,

    // ── Dialog ─────────────────────────────────────────────────
    `.dialog{background:var(--bg-primary);border:1px solid var(--border-default);border-radius:14px;width:960px;height:640px;max-height:90vh;max-width:98vw;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.35);animation:slideUp .2s}`,
    `@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`,
    `@media(max-width:1000px){.dialog{width:98vw;height:90vh}}`,

    // ── Header ─────────────────────────────────────────────────
    `.header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}`,
    `.header h2{margin:0;font-size:17px;color:var(--text-primary)}`,
    `.header-actions{display:flex;gap:6px;margin-right:auto;margin-left:16px}`,
    `.header-btn{background:none;color:var(--text-muted);border:1px solid var(--border-default);padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;transition:all .15s}`,
    `.header-btn:hover{background:var(--bg-secondary);color:var(--text-primary);border-color:var(--accent-blue-text)}`,
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

    // ── Shared tags & filter ───────────────────────────────────
    `.item-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:1px}`,
    `.tag{font-size:10px;background:var(--bg-tertiary);color:var(--text-muted);padding:1px 6px;border-radius:4px;font-weight:500;white-space:nowrap}`,
    `.tag.tag-empty{background:transparent;opacity:.4}`,
    `.item-tags-caps{margin-top:3px}`,
    `.tag.tag-cap{background:var(--tag-green-bg);color:var(--tag-green-text)}`,
    `.tag.tag-cap.tag-empty{background:transparent;color:var(--text-muted);font-style:italic;opacity:.5}`,
    `.tag.tag-default{background:var(--accent-blue-text);color:#fff;font-size:9px;padding:1px 6px;border-radius:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;display:inline-block;width:fit-content}`,
    `.item-tags-roles{margin-top:3px}`,
    `.tag.tag-role{background:var(--tag-yellow-bg);color:var(--tag-yellow-text);text-transform:capitalize}`,
    `.tag.tag-role.tag-empty{background:transparent;color:var(--text-muted);font-style:italic;opacity:.5;text-transform:none}`,
    `.filter-input{width:100%;box-sizing:border-box;padding:7px 28px 7px 10px;font-size:12px;background:var(--bg-secondary);color:var(--text-primary);border:none;border-bottom:1px solid var(--border-subtle);outline:none;transition:background .15s}`,
    `.filter-input:focus{background:var(--bg-tertiary)}`,
    `.filter-input::placeholder{color:var(--text-muted);opacity:.6}`,
    `.filter-wrap{position:relative;display:inline-flex;flex:0 0 auto}`,
    `.filter-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:2px 5px;border-radius:3px;line-height:1;transition:all .1s}`,
    `.filter-clear:hover{color:var(--text-primary);background:var(--bg-tertiary)}`,

    // ── Form panels (logging, failure recovery, etc.) ───────────
    `.panel-form{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:8px}`,
    `.panel-form h4{margin:0 0 4px;font-size:14px;color:var(--text-primary)}`,
    `.panel-form label{font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;margin-top:4px}`,
    `.label-hint{font-weight:400;text-transform:none;opacity:.7}`,
    `.panel-form input,.panel-form select,.panel-form textarea{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s}`,
    `.panel-form input:focus,.panel-form select:focus,.panel-form textarea:focus{border-color:var(--accent-blue-text)}`,
    `.panel-form textarea{font-family:'Fira Code','Consolas',monospace;font-size:12px;resize:vertical;min-height:80px}`,
    `.empty-icon{font-size:36px;margin-bottom:8px;opacity:.5}`,

    // ── Failure Recovery tab ─────────────────────────────────────
    `.tab-failure{flex-direction:column}.tab-failure .panel-form{max-width:480px;gap:4px}`,
    `.tab-failure input[type=number]{width:120px}`,
    `.checkbox-row{display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:500;font-size:13px;color:var(--text-primary);margin-top:8px}`,
    `.checkbox-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent-blue-text);cursor:pointer}`,
    `.fr-saved-msg{font-size:12px;color:var(--tag-green-text,#2e7d32);font-weight:600;animation:fadeIn .2s}`,
    `.tab-failure .field-hint{font-size:11px;color:var(--text-muted);opacity:.75;margin:-2px 0 4px;line-height:1.4}`,

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

    // ── Multi-model list ────────────────────────────────────────
    `.model-list{display:flex;flex-direction:column;gap:4px;min-width:200px}`,
    `.model-item{display:flex;align-items:center;gap:3px}`,
    `.model-select{width:120px;min-width:0;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:5px 8px;font-size:11px;font-family:inherit;outline:none;cursor:pointer}`,
    `.model-select:focus{border-color:var(--accent-blue-text)}`,
    `.model-provider-select{width:100px;min-width:0;background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border-default);border-radius:6px;padding:5px 6px;font-size:10px;font-family:inherit;outline:none;cursor:pointer}`,
    `.model-provider-select:focus{border-color:var(--accent-blue-text);color:var(--text-primary)}`,
    `.model-harness-select{width:100px;min-width:0;background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border-default);border-radius:6px;padding:5px 6px;font-size:10px;font-family:inherit;outline:none;cursor:pointer}`,
    `.model-harness-select:focus{border-color:var(--accent-blue-text);color:var(--text-primary)}`,
    `.model-primary{font-weight:600}`,
    `.model-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:1px 5px;border-radius:4px;background:var(--accent-blue-text);color:#fff;white-space:nowrap}`,
    `.model-badge-fallback{background:var(--bg-tertiary);color:var(--text-muted)}`,
    `.btn-model-move{background:none;border:1px solid transparent;color:var(--text-muted);cursor:pointer;padding:1px 4px;border-radius:4px;font-size:10px;line-height:1;transition:all .1s}`,
    `.btn-model-move:hover:not(:disabled){background:var(--bg-secondary);color:var(--text-primary);border-color:var(--border-default)}`,
    `.btn-model-move:disabled{opacity:.25;cursor:default}`,
    `.btn-model-remove{background:none;border:none;color:var(--tag-red-text);cursor:pointer;padding:1px 4px;border-radius:4px;font-size:10px;line-height:1;opacity:.5;transition:opacity .1s}`,
    `.btn-model-remove:hover{opacity:1}`,
    `.model-add-row{margin-top:2px}`,
    `.model-add-select{width:100%;background:var(--bg-secondary);color:var(--text-muted);border:1px dashed var(--border-default);border-radius:6px;padding:4px 8px;font-size:11px;font-family:inherit;outline:none;cursor:pointer}`,
    `.model-add-select:focus{border-color:var(--accent-blue-text);color:var(--text-primary)}`,
    `.model-add-select option{color:var(--text-primary)}`,

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
    `.btn-seed-force-sm:disabled{opacity:.4;cursor:not-allowed}`,    `.roles-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}`,
    `.roles-hint{font-size:12px;color:var(--text-muted)}`,
    `.field-hint{font-size:11px;color:var(--text-muted);opacity:.75;margin:-4px 0 8px;line-height:1.4}`,
    `.tab-logging .panel-form{gap:4px}`,
    `.tab-logging select{margin-bottom:2px}`,
    `.btn-save-sm{background:var(--accent-blue-text);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s}`,
    `.btn-save-sm:hover:not(:disabled){opacity:.85}`,
    `.btn-save-sm:disabled{opacity:.3;cursor:not-allowed}`,

    `.btn-seed-sm{background:none;color:var(--accent-blue-text);border:1px solid var(--accent-blue-text);padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s}`,
    `.btn-seed-sm:hover{background:var(--accent-blue-bg)}`,
    `.btn-seed-sm:disabled{opacity:.4;cursor:not-allowed}`,

    // ── Dirty-state indicators (v094) ─────────────────────────
    `.roles-dirty-badge{font-size:10px;color:var(--tag-orange-text,#e65100);font-weight:600;white-space:nowrap}`,
    `.roles-clean-badge{font-size:12px;color:var(--tag-green-text,#2e7d32);font-weight:700}`,
    `.role-dirty-dot{color:var(--tag-orange-text,#e65100);font-size:10px;margin-right:2px;vertical-align:middle}`,

    // ── Models table (v099) ──────────────────────────────────
    `.tab-models{flex-direction:column}`,
    `.model-table-row{cursor:pointer;transition:background .1s}`,
    `.model-table-row:hover{background:var(--bg-secondary)}`,
    `.model-table-row.selected{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.model-table-row.selected .tag{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.model-table-row.selected .tag.tag-empty{opacity:.4}`,
    `.model-table-row.selected .tag.tag-role{background:var(--accent-blue-bg);color:var(--accent-blue-text)}`,
    `.model-table-row.selected .tag.tag-role.tag-empty{opacity:.3}`,
    `.model-name-cell{font-weight:500}`,
    `.model-id-code{font-size:11px;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-family:'Fira Code','Consolas',monospace}`,
    `.empty-table-cell{text-align:center;padding:32px 12px;font-size:13px;color:var(--text-muted)}`,
    `.sortable{cursor:pointer;user-select:none;transition:color .1s}`,
    `.sortable:hover{color:var(--text-primary)}`,
    `@keyframes pulseHighlight{0%,100%{background:transparent}50%{background:var(--tag-red-bg)}}`,
    `.model-table-row.pulse-row{animation:pulseHighlight .8s ease-in-out 3}`,

    // ── Mini-modal (Add/Edit dialog, v099) ───────────────────
    `.mini-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:10;animation:fadeIn .12s}`,
    `.mini-dialog{background:var(--bg-primary);border:1px solid var(--border-default);border-radius:10px;width:400px;max-width:90%;padding:20px;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 32px rgba(0,0,0,0.3);animation:slideUp .15s}`,
    `.mini-dialog h4{margin:0 0 4px;font-size:15px;color:var(--text-primary)}`,
    `.mini-dialog label{font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;margin-top:4px}`,
    `.mini-dialog input,.mini-dialog select{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:7px 10px;font-size:13px;font-family:inherit;outline:none}`,
    `.mini-dialog input:focus,.mini-dialog select:focus{border-color:var(--accent-blue-text)}`,

    // ── Delete confirmation ───────────────────────────────────
    `.confirm-body{font-size:13px;color:var(--text-primary);line-height:1.6;margin:0}`,
    `.confirm-roles{display:inline-flex;gap:3px;margin-left:4px;vertical-align:middle}`,

    // ── Test tab ──────────────────────────────────────────────
    `.tab-test{flex-direction:column}.tab-test .panel-form{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}`,
    `.test-prompt-input{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:10px;font-size:13px;font-family:'Fira Code','Consolas',monospace;outline:none;resize:vertical;min-height:100px;transition:border-color .15s}`,
    `.test-prompt-input:focus{border-color:var(--accent-blue-text)}`,
    `.test-actions{display:flex;align-items:center;gap:12px}`,
    `.test-status{font-size:12px;color:var(--text-muted);font-style:italic}`,
    `.test-output-wrap{flex:1;display:flex;flex-direction:column;border:1px solid var(--border-default);border-radius:6px;overflow:hidden;min-height:120px}`,
    `.test-output-header{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-tertiary);font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}`,
    `.test-output-meta{font-weight:400;text-transform:none;color:var(--text-muted)}`,
    `.test-output-meta code{font-size:10px;background:var(--bg-secondary);padding:1px 5px;border-radius:3px}`,
    `.test-output{flex:1;overflow-y:auto;padding:4px 0;background:var(--bg-primary);font-family:'Fira Code','Consolas',monospace;font-size:12px;line-height:1.5}`,
    `.test-output-line{display:flex;padding:0 8px;gap:8px;word-break:break-all}`,
    `.test-output-line:hover{background:var(--bg-secondary)}`,
    `.test-line-num{color:var(--text-muted);opacity:.4;min-width:28px;text-align:right;user-select:none;flex-shrink:0}`,
    `.test-line-text{color:var(--text-primary);white-space:pre-wrap}`,
    `.test-output-tail{padding:4px 8px;color:var(--text-muted);font-size:11px;font-style:italic}`,
    `.test-output-done{color:var(--tag-green-text,#2e7d32)}`,
    // ── Command preview ──────────────────────────────────────
    `.cmd-preview-wrap{margin-bottom:4px}`,
    `.cmd-preview-header{display:flex;align-items:center;justify-content:space-between;padding:4px 0}`,
    `.cmd-preview-label{font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px}`,
    `.cmd-copy-btn{background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border-default);padding:3px 10px;border-radius:5px;font-size:10px;cursor:pointer;transition:all .15s}`,
    `.cmd-copy-btn:hover{background:var(--bg-tertiary);color:var(--text-primary);border-color:var(--accent-blue-text)}`,
    `.cmd-preview-textarea{width:100%;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:8px 10px;font-size:12px;font-family:'Fira Code','Consolas',monospace;outline:none;resize:vertical;min-height:56px;line-height:1.5;white-space:pre-wrap;word-break:break-all;cursor:text}`,

    // ── Responsive ─────────────────────────────────────────────
    `@media(max-width:700px){.dialog{max-width:100%;max-height:95vh;border-radius:0}.tab-panel{flex-direction:column}.panel-form{max-height:50vh}}`,
  ],
})
export class AIConfigDialogComponent implements OnDestroy {
  @HostListener('document:keydown', ['$event'])
  handleKeyboard(e: KeyboardEvent): void {
    if (!this.visible()) return;

    // Don't hijack keystrokes when user is typing in a form field
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    // Escape — cascading close: confirm dialog → edit form → dialog itself
    if (key === 'Escape') {
      if (this.confirmDelete()) { this.cancelConfirmDelete(); return; }
      if (this.editProviderForm()) { this.cancelEditProvider(); return; }
      if (this.editHarnessForm()) { this.cancelEditHarness(); return; }
      if (this.editModelForm()) { this.cancelEditModel(); return; }
      this.close();
      return;
    }

    // Ctrl+S / Cmd+S — save roles
    if (ctrl && key.toLowerCase() === 's') {
      e.preventDefault();
      if (this.activeTab() === 'roles') this.saveAllRoles();
      return;
    }

    // Ctrl+N / Cmd+N — add new item in current tab
    if (ctrl && key.toLowerCase() === 'n') {
      e.preventDefault();
      switch (this.activeTab()) {
        case 'providers': this.startNewProvider(); break;
        case 'harnesses': this.startNewHarness(); break;
        case 'models': this.startNewModel(); break;
      }
      return;
    }

    // Ctrl+Enter / Cmd+Enter — save current edit form
    if (ctrl && key === 'Enter') {
      e.preventDefault();
      if (this.editProviderForm()) { this.saveProvider(); }
      else if (this.editHarnessForm()) { this.saveHarness(); }
      else if (this.editModelForm()) { this.saveModel(); }
      return;
    }

    // ArrowDown / ArrowUp — navigate table rows (only when no edit form is open)
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (this.editProviderForm() || this.editHarnessForm() || this.editModelForm()) return;
      e.preventDefault();
      this._navigateTable(key === 'ArrowDown' ? 'down' : 'up');
      return;
    }
  }
  readonly visible = signal(false);
  readonly activeTab = signal<TabId>('providers');

  readonly tabs: { id: TabId; label: string }[] = [
    { id: 'providers', label: 'Providers' },
    { id: 'harnesses', label: 'Harnesses' },
    { id: 'models', label: 'Models' },
    { id: 'roles', label: 'Role Assignment' },
    { id: 'logging', label: 'Logging' },
    { id: 'test', label: 'Test' },
    { id: 'failure-recovery', label: 'Recovery' },
  ];

  readonly PROVIDER_TYPES = PROVIDER_TYPES;
  /** Dynamic role list (Gap 5) — populated from tackle-srv GET /roles on open. */
  readonly roles = signal<string[]>(ROLES_FALLBACK);
  readonly CAPABILITY_KEYS = CAPABILITY_KEYS;

  // ── Edit state (per-tab form) ───────────────────────────────
  readonly selectedProviderId = signal<string | null>(null);
  readonly editProviderForm = signal<Partial<AIProvider> & { id: string; name: string; type: string } | null>(null);

  readonly selectedHarnessId = signal<string | null>(null);
  readonly editHarnessForm = signal<Partial<AIHarness> & { id: string; name: string } | null>(null);

  /** Free-text filter for the provider table — searches name, type, and endpoint URL. */
  readonly providerFilter = signal('');

  /** Free-text filter for the harness list — searches name, execution mode, and capabilities. */
  readonly harnessFilter = signal('');

  /** Free-text filter for the models table — searches name, identifier, provider, and harness. */
  readonly modelFilter = signal('');

  /** Free-text filter for the Roles table — searches roles by assigned model name, provider, or harness. */
  readonly roleFilter = signal('');

  // ── Keyboard shortcuts ──────────────────────────────────────

  // ── Sort state ──────────────────────────────────────────────
  readonly providerSortCol = signal('name');
  readonly providerSortAsc = signal(true);
  readonly harnessSortCol = signal('name');
  readonly harnessSortAsc = signal(true);
  readonly modelSortCol = signal('name');
  readonly modelSortAsc = signal(true);

  /** Pending delete confirmation — set when an item is in use by roles before deletion. */
  readonly confirmDelete = signal<ConfirmDelete | null>(null);

  // ── Failure Recovery state ──────────────────────────────────────
  readonly frConfig = signal<FailureRecoveryConfig>({
    max_retries_per_model: 3,
    retry_delay_seconds: 120,
    max_fallbacks: 3,
    push_back_to_pending: true,
    circuit_breaker_retry_after: 1800,
  });
  readonly frSaving = signal(false);
  readonly frSavedMsg = signal<string | null>(null);

  /** Load failure recovery config from server when tab opens. */
  private loadFrConfig(): void {
    this.aiConfig.getFailureRecoveryConfig().subscribe({
      next: (cfg) => this.frConfig.set(cfg),
      error: () => { /* keep defaults */ },
    });
  }

  /** Update a single field in the failure recovery config. */
  updateFrConfig<K extends keyof FailureRecoveryConfig>(key: K, value: FailureRecoveryConfig[K]): void {
    this.frConfig.update(cfg => ({ ...cfg, [key]: value }));
    this.frSavedMsg.set(null);
  }

  /** Save failure recovery config to server. */
  saveFrConfig(): void {
    const cfg = this.frConfig();
    this.frSaving.set(true);
    this.frSavedMsg.set(null);
    this.aiConfig.saveFailureRecoveryConfig(cfg).subscribe({
      next: () => {
        this.frSaving.set(false);
        this.frSavedMsg.set('✓ Saved');
        setTimeout(() => this.frSavedMsg.set(null), 3000);
      },
      error: () => {
        this.frSaving.set(false);
        this.frSavedMsg.set('✗ Error saving');
        setTimeout(() => this.frSavedMsg.set(null), 3000);
      },
    });
  }

  // ── Test tab state ────────────────────────────────────────────
  readonly testModelId = signal<string>('');
  readonly testPrompt = signal<string>(
    'In ~/dev/nexus/python/util: 1) rename cleaned_transcript.txt if it exists, prepending the file date and time, 2) run cleaner.py, 3) verify success by checking for cleaned_transcript.txt'
  );
  readonly testRunning = signal(false);
  readonly testStatus = signal<string>('');
  readonly testOutputLines = signal<string[]>([]);
  readonly testSessionId = signal<string>('');
  readonly copied = signal(false);
  private testEventSource: EventSource | null = null;
  private testCompleted = false;

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

  // Per-role editor state (bound to select dropdowns).
  // v098: Each model entry has its own provider/harness — no role-level override.
  readonly roleEdits: Record<string, { model_entries: { model_id: string; provider_id: string; harness_id: string }[] }> = {};

  readonly config: AIConfigService['config'];
  readonly saving: AIConfigService['saving'];

  private toast = inject(ToastService);
  /** MCP server base URL — injected or default to localhost:3100 */
  private apiUrl = inject(API_BASE_URL, { optional: true }) || 'http://localhost:3100';

  constructor(public aiConfig: AIConfigService) {
    this.config = this.aiConfig.config;
    this.saving = this.aiConfig.saving;
    for (const r of ROLES_FALLBACK) {
      this.roleEdits[r] = { model_entries: [] };
    }
  }

  /** Ensure per-role editor state exists for every role in the list. */
  private _ensureRoleEdits(roles: string[]): void {
    for (const r of roles) {
      if (!this.roleEdits[r]) this.roleEdits[r] = { model_entries: [] };
    }
  }

  /** Load the dynamic role list from tackle-srv (Gap 5). Falls back to the
   *  hardcoded list on error so the dialog still opens offline. */
  private loadRoles(): void {
    this.aiConfig.fetchRoles().subscribe({
      next: (names) => {
        if (names.length > 0) {
          this.roles.set(names);
          this._ensureRoleEdits(names);
        }
      },
      error: () => { /* keep fallback */ },
    });
  }

  // ── Visibility ──────────────────────────────────────────────
  open(): void {
    this.aiConfig.fetch().subscribe({
      next: () => this._syncRoleEdits(),
      error: () => {}, // silently ignore — roleEdits stay at empty state
    });
    this.loadRoles();
    this.visible.set(true);
    this.activeTab.set('providers');
    this._resetAllForms();
    this._clearAllFilters();
  }

  /** Switch tabs and clear all filter inputs so each tab starts fresh. */
  switchTab(id: TabId): void {
    this.activeTab.set(id);
    this._clearAllFilters();
    // Load failure recovery config when switching to that tab
    if (id === 'failure-recovery') {
      this.loadFrConfig();
    }
  }

  /** Navigate selection in the current tab's table — up or down with wrapping. */
  private _navigateTable(dir: 'up' | 'down'): void {
    const tab = this.activeTab();
    let items: any[];
    let sel: () => string | null;
    let setSel: (id: string | null) => void;

    if (tab === 'providers') {
      items = this.filteredProviders();
      sel = this.selectedProviderId;
      setSel = (id: string | null) => this.selectedProviderId.set(id);
    } else if (tab === 'harnesses') {
      items = this.filteredHarnesses();
      sel = this.selectedHarnessId;
      setSel = (id: string | null) => this.selectedHarnessId.set(id);
    } else if (tab === 'models') {
      items = this.filteredModels();
      sel = this.selectedModelId;
      setSel = (id: string | null) => this.selectedModelId.set(id);
    } else {
      return;
    }

    if (items.length === 0) return;

    const curId = sel();
    let idx = items.findIndex((it: any) => it.id === curId);
    if (idx < 0) idx = -1;

    if (dir === 'down') {
      idx = (idx + 1) % items.length;
    } else {
      idx = (idx - 1 + items.length) % items.length;
    }

    setSel(items[idx].id);
  }

  private _clearAllFilters(): void {
    this.providerFilter.set('');
    this.harnessFilter.set('');
    this.modelFilter.set('');
    this.roleFilter.set('');
  }

  close(): void {
    this.visible.set(false);
  }

  // ── Export / Import ──────────────────────────────────────────

  /** Export the current config as a downloadable JSON file. */
  exportConfig(): void {
    this.aiConfig.exportConfig();
  }

  /** Trigger the hidden file input for importing a config file. */
  importConfigClick(): void {
    const input = document.querySelector<HTMLInputElement>('[data-import-input]');
    if (input) { input.value = ''; input.click(); }
  }

  /** Handle file selection from the import file input. */
  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        // Validate minimal structure
        if (!data.providers && !data.harnesses && !data.models && !data.roles) {
          this.toast.push({
            id: `toast-import-err-${Date.now()}`,
            type: 'role_saved',
            title: 'Import Error',
            message: 'Invalid config file — must contain at least one of: providers, harnesses, models, roles.',
            icon: '❌',
            timestamp: new Date().toISOString(),
            priority: 'high',
          });
          return;
        }

        this.aiConfig.importConfig(data).subscribe({
          next: (result) => {
            this.toast.push({
              id: `toast-import-${Date.now()}`,
              type: 'role_saved',
              title: 'Config Imported',
              message: `Imported ${result.providers} providers, ${result.harnesses} harnesses, ${result.models} models, ${result.roles} roles.`,
              icon: '✅',
              timestamp: new Date().toISOString(),
              priority: 'normal',
            });
            // Re-fetch and re-sync
            this.aiConfig.fetch().subscribe({ next: () => this._syncRoleEdits() });
          },
          error: (err) => {
            this.toast.push({
              id: `toast-import-err-${Date.now()}`,
              type: 'role_saved',
              title: 'Import Failed',
              message: `${err.message || err}`,
              icon: '❌',
              timestamp: new Date().toISOString(),
              priority: 'high',
            });
          },
        });
      } catch (e: any) {
        this.toast.push({
          id: `toast-import-err-${Date.now()}`,
          type: 'role_saved',
          title: 'Import Error',
          message: `Failed to parse JSON: ${e.message}`,
          icon: '❌',
          timestamp: new Date().toISOString(),
          priority: 'high',
        });
      }
    };
    reader.readAsText(file);
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
      case 'failure-recovery': return 0;
      default: return 0;
    }
  }

  // ── Seed defaults ──────────────────────────────────────────
  seedDefaults(force = false): void {
    this.aiConfig.seedDefaults(force);
    // Re-sync role edits after the seed fetch completes so dirty state stays accurate
    this.aiConfig.fetch().subscribe({ next: () => this._syncRoleEdits() });
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

  /** Filtered providers based on search query. Searches name, type, and endpoint URL. */
  filteredProviders(): AIProvider[] {
    const q = this.providerFilter().toLowerCase().trim();
    let items = q ? this.config().providers.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true;
      if ((p.type || '').toLowerCase().includes(q)) return true;
      if ((p.endpoint_url || '').toLowerCase().includes(q)) return true;
      return false;
    }) : [...this.config().providers];
    return this._sortProviders(items);
  }

  private _sortProviders(items: AIProvider[]): AIProvider[] {
    const col = this.providerSortCol();
    const asc = this.providerSortAsc();
    return [...items].sort((a, b) => {
      let va = ''; let vb = '';
      if (col === 'name') { va = a.name; vb = b.name; }
      else if (col === 'type') { va = a.type || ''; vb = b.type || ''; }
      else if (col === 'endpoint') { va = a.endpoint_url || ''; vb = b.endpoint_url || ''; }
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  /** Roles that use models assigned to this provider. */
  rolesForProvider(providerId: string): string[] {
    const mids = this.config().models.filter(m => m.provider_id === providerId).map(m => m.id);
    return [...new Set(mids.flatMap(mid => {
      const model = this.config().models.find(m => m.id === mid);
      return model ? this.rolesForModel(model) : [];
    }))];
  }

  /** Roles that use models assigned to this harness. */
  rolesForHarness(harnessId: string): string[] {
    const mids = this.config().models.filter(m => m.harness_id === harnessId).map(m => m.id);
    return [...new Set(mids.flatMap(mid => {
      const model = this.config().models.find(m => m.id === mid);
      return model ? this.rolesForModel(model) : [];
    }))];
  }

  /** Whether the given model is the default model from registry.json. */
  isDefaultModel(m: AIModel): boolean {
    return m.model_identifier === DEFAULT_MODEL_IDENTIFIER;
  }

  /** Return the roles assigned to this model (v093: checks role_models for multi-model support). */
  rolesForModel(m: AIModel): string[] {
    const rm = this.config().role_models;
    if (rm && rm.length > 0) {
      const roleIds = rm.filter(r => r.model_id === m.id).map(r => r.role);
      return [...new Set(roleIds)];
    }
    // Fallback to legacy single-model mapping
    return this.config().roles
      .filter(r => r.model_id === m.id)
      .map(r => r.role);
  }

  /** Filtered harnesses based on search query. */
  filteredHarnesses(): AIHarness[] {
    const q = this.harnessFilter().toLowerCase().trim();
    let items: AIHarness[];
    if (!q) {
      items = [...this.config().harnesses];
    } else {
      items = this.config().harnesses.filter(h => {
        if (h.name.toLowerCase().includes(q)) return true;
        const mode = this.harnessField(h, 'execution.mode').toLowerCase();
        if (mode.includes(q)) return true;
        const strat = this.harnessField(h, 'role_mapping.strategy').toLowerCase();
        if (strat.includes(q)) return true;
        const caps = this.harnessCapabilities(h);
        if (caps.some(c => c.includes(q))) return true;
        return false;
      });
    }
    return this._sortHarnesses(items);
  }

  private _sortHarnesses(items: AIHarness[]): AIHarness[] {
    const col = this.harnessSortCol();
    const asc = this.harnessSortAsc();
    return [...items].sort((a, b) => {
      let va = ''; let vb = '';
      if (col === 'name') { va = a.name; vb = b.name; }
      else if (col === 'binary') { va = this.harnessField(a, 'binary'); vb = this.harnessField(b, 'binary'); }
      else if (col === 'mode') { va = this.harnessField(a, 'execution.mode'); vb = this.harnessField(b, 'execution.mode'); }
      else if (col === 'strategy') { va = this.harnessField(a, 'role_mapping.strategy'); vb = this.harnessField(b, 'role_mapping.strategy'); }
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
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
    const impact = this._computeDeleteImpact('provider', id);
    if (impact) { this.confirmDelete.set(impact); return; }
    this._doDeleteProvider(id);
  }

  private _doDeleteProvider(id: string): void {
    this.aiConfig.deleteProvider(id);
    this.cancelEditProvider();
  }

  /** Edit the currently selected provider (from table row selection). */
  editSelectedProvider(): void {
    const id = this.selectedProviderId();
    if (!id) return;
    const p = this.config().providers.find(pr => pr.id === id);
    if (p) this.editProvider(p);
  }

  /** Delete the currently selected provider (from table row selection). */
  deleteSelectedProvider(): void {
    const id = this.selectedProviderId();
    if (!id) return;
    this.deleteProvider(id);
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
    const impact = this._computeDeleteImpact('harness', id);
    if (impact) { this.confirmDelete.set(impact); return; }
    this._doDeleteHarness(id);
  }

  private _doDeleteHarness(id: string): void {
    this.aiConfig.deleteHarness(id);
    this.cancelEditHarness();
  }

  /** Edit the currently selected harness (from table row selection). */
  editSelectedHarness(): void {
    const id = this.selectedHarnessId();
    if (!id) return;
    const h = this.config().harnesses.find(hr => hr.id === id);
    if (h) this.editHarness(h);
  }

  /** Delete the currently selected harness (from table row selection). */
  deleteSelectedHarness(): void {
    const id = this.selectedHarnessId();
    if (!id) return;
    this.deleteHarness(id);
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
    const impact = this._computeDeleteImpact('model', id);
    if (impact) { this.confirmDelete.set(impact); return; }
    this._doDeleteModel(id);
  }

  private _doDeleteModel(id: string): void {
    this.aiConfig.deleteModel(id);
    this.cancelEditModel();
  }

  /** Edit the currently selected model (from table row selection). */
  editSelectedModel(): void {
    const id = this.selectedModelId();
    if (!id) return;
    const m = this.config().models.find(mod => mod.id === id);
    if (m) this.editModel(m);
  }

  /** Delete the currently selected model (from table row selection). */
  deleteSelectedModel(): void {
    const id = this.selectedModelId();
    if (!id) return;
    this.deleteModel(id);
  }

  /** Filtered models based on modelFilter search. Searches name, identifier, provider, and harness. */
  filteredModels(): AIModel[] {
    const q = this.modelFilter().toLowerCase().trim();
    let items = q ? this.config().models.filter(m => {
      if (m.name.toLowerCase().includes(q)) return true;
      if (m.model_identifier.toLowerCase().includes(q)) return true;
      if (this.providerName(m.provider_id || '').toLowerCase().includes(q)) return true;
      if (this.harnessName(m.harness_id).toLowerCase().includes(q)) return true;
      return false;
    }) : [...this.config().models];
    return this._sortModels(items);
  }

  private _sortModels(items: AIModel[]): AIModel[] {
    const col = this.modelSortCol();
    const asc = this.modelSortAsc();
    return [...items].sort((a, b) => {
      let va = ''; let vb = '';
      if (col === 'name') { va = a.name; vb = b.name; }
      else if (col === 'identifier') { va = a.model_identifier; vb = b.model_identifier; }
      else if (col === 'provider') { va = this.providerName(a.provider_id || ''); vb = this.providerName(b.provider_id || ''); }
      else if (col === 'harness') { va = this.harnessName(a.harness_id); vb = this.harnessName(b.harness_id); }
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  /** Toggle sort column/direction for a table. */
  toggleSort(table: 'providers' | 'harnesses' | 'models', col: string): void {
    const colSig = table === 'providers' ? this.providerSortCol
      : table === 'harnesses' ? this.harnessSortCol : this.modelSortCol;
    const ascSig = table === 'providers' ? this.providerSortAsc
      : table === 'harnesses' ? this.harnessSortAsc : this.modelSortAsc;
    if (colSig() === col) { ascSig.set(!ascSig()); }
    else { colSig.set(col); ascSig.set(true); }
  }

  /** Return sort indicator arrow for a column header. */
  sortIndicator(table: 'providers' | 'harnesses' | 'models', col: string): string {
    const colSig = table === 'providers' ? this.providerSortCol
      : table === 'harnesses' ? this.harnessSortCol : this.modelSortCol;
    const ascSig = table === 'providers' ? this.providerSortAsc
      : table === 'harnesses' ? this.harnessSortAsc : this.modelSortAsc;
    if (colSig() !== col) return '';
    return ascSig() ? ' ▲' : ' ▼';
  }

  /** Look up harness name by ID for display in the table. */
  harnessName(id: string): string {
    const h = this.config().harnesses.find(hr => hr.id === id);
    return h ? h.name : id || '—';
  }

  // ── Roles ───────────────────────────────────────────────────

  /** Save all role edits at once. Includes per-model provider/harness in model_priorities.
   *  The primary model's provider/harness are written to ai_role_config. */
  saveAllRoles(): void {
    const config = this.config();
    const toSave: {
      id: string;
      role: string;
      provider_id: string;
      harness_id: string;
      model_id: string;
      extra_params: string;
      model_priorities: { model_id: string; priority: number; provider_id?: string | null; harness_id?: string | null }[];
    }[] = [];

    for (const r of this.roles()) {
      const edits = this.roleEdits[r];
      if (edits.model_entries.length === 0) continue;
      const primary = edits.model_entries[0];

      const existing = config.roles.find(rc => rc.role === r);
      toSave.push({
        id: existing?.id ?? `rc-${r}-${Date.now()}`,
        role: r as AIRoleConfig['role'],
        provider_id: primary.provider_id,
        harness_id: primary.harness_id,
        model_id: primary.model_id,
        extra_params: existing?.extra_params ?? '{}',
        model_priorities: edits.model_entries.map((me, i) => ({
          model_id: me.model_id,
          priority: i,
          provider_id: me.provider_id || undefined,
          harness_id: me.harness_id || undefined,
        })),
      });
    }

    if (toSave.length === 0) return;

    this.aiConfig.saveRolesBatch(toSave).subscribe({
      next: () => {
        // v099: Show toast + re-sync to clear dirty state
        this.toast.push({
          id: `toast-role-saved-${Date.now()}`,
          type: 'role_saved',
          title: 'Role Updates Saved',
          message: `Saved ${toSave.length} role configuration(s).`,
          icon: '✅',
          timestamp: new Date().toISOString(),
          priority: 'normal',
        });
        // Re-fetch to sync roleEdits with server state (clears dirty indicator)
        this.aiConfig.fetch().subscribe({ next: () => this._syncRoleEdits() });
        // Validate config and show warnings for missing binaries, etc.
        this.aiConfig.validateConfig().subscribe({
          next: (result) => {
            for (const w of result.warnings) {
              this.toast.push({
                id: `toast-validation-${Date.now()}-${w.role}-${w.field}`,
                type: 'role_saved',
                title: w.severity === 'error' ? `⚠ ${w.role}: ${w.field}` : `ℹ ${w.role}: ${w.field}`,
                message: w.message,
                icon: w.severity === 'error' ? '⚠️' : 'ℹ️',
                timestamp: new Date().toISOString(),
                priority: w.severity === 'error' ? 'high' : 'normal',
              });
            }
          },
          error: () => {},
        });
      },
      error: () => {},
    });
  }

  /** Called when the user picks a different model in a role's model dropdown.
   *  Also auto-sets the provider/harness from the selected model's native config. */
  onRoleModelChange(role: string, index: number, modelId: string): void {
    this.roleEdits[role].model_entries[index].model_id = modelId;
    // Auto-populate provider/harness from the model's native config
    const model = this.config().models.find(m => m.id === modelId);
    if (model) {
      if (model.provider_id) this.roleEdits[role].model_entries[index].provider_id = model.provider_id;
      this.roleEdits[role].model_entries[index].harness_id = model.harness_id;
    }
  }

  /** Filter roles by searching assigned models' names, provider names, and harness names. */
  filteredRoles(): string[] {
    const q = this.roleFilter().toLowerCase().trim();
    if (!q) return this.roles();
    return this.roles().filter(r => {
      const entries = this.roleEdits[r]?.model_entries ?? [];
      return entries.some(e => {
        const model = this.config().models.find(m => m.id === e.model_id);
        if (!model) return false;
        if (model.name.toLowerCase().includes(q)) return true;
        if (model.model_identifier.toLowerCase().includes(q)) return true;
        if (this.providerName(model.provider_id || '').toLowerCase().includes(q)) return true;
        if (this.harnessName(model.harness_id).toLowerCase().includes(q)) return true;
        return false;
      });
    });
  }

  /** All models are available — no provider/harness filter since each model has its own. */
  filteredModelsForRole(_role: string): AIModel[] {
    return this.config().models;
  }

  /** Like filteredModelsForRole but excludes models already selected at other indices. */
  availableModelsForRole(role: string, skipIndex: number): AIModel[] {
    const models = this.filteredModelsForRole(role);
    const entries = this.roleEdits[role]?.model_entries ?? [];
    const selected = entries.map(e => e.model_id);
    return models.filter(m => {
      if (selected[skipIndex] === m.id) return true;
      return !selected.includes(m.id);
    });
  }

  /** Add a model to the role's model list from the +Add dropdown. Auto-sets provider/harness from model. */
  addModelToRole(role: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const mid = select.value;
    if (!mid) return;
    const entries = this.roleEdits[role].model_entries;
    if (!entries.some(e => e.model_id === mid)) {
      // Auto-populate provider/harness from the model's native config
      const model = this.config().models.find(m => m.id === mid);
      entries.push({
        model_id: mid,
        provider_id: model?.provider_id || '',
        harness_id: model?.harness_id || '',
      });
    }
    select.value = '';
  }

  /** Remove a model from the role's model list by index. */
  removeModelFromRole(role: string, index: number): void {
    this.roleEdits[role].model_entries.splice(index, 1);
  }

  /** Move a model up in priority (lower index = higher priority). */
  moveModelUp(role: string, index: number): void {
    if (index <= 0) return;
    const arr = this.roleEdits[role].model_entries;
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
  }

  /** Move a model down in priority (higher index = lower priority). */
  moveModelDown(role: string, index: number): void {
    const arr = this.roleEdits[role].model_entries;
    if (index >= arr.length - 1) return;
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
  }

  // ── Dirty-state detection (v094) ────────────────────────────

  /** True when any role's edits differ from the server config — computed fresh on each call. */
  hasDirtyRoles(): boolean {
    return this.roles().some(r => this.isRoleDirty(r));
  }

  /** Compare a single role's edits against the server config (v098: per-model provider/harness). */
  isRoleDirty(role: string): boolean {
    const c = this.config();
    const edits = this.roleEdits[role];
    if (!edits) return false;

    const server = c.roles.find(rc => rc.role === role);

    // Build expected model_entries from server role_models (sorted by priority), fall back to legacy model_id
    const serverRm = (c.role_models ?? [])
      .filter(rm => rm.role === role)
      .sort((a, b) => a.priority - b.priority);

    let expected: { model_id: string; provider_id: string; harness_id: string }[];
    if (serverRm.length > 0) {
      expected = serverRm.map(m => {
        const model = c.models.find(mod => mod.id === m.model_id);
        return {
          model_id: m.model_id,
          provider_id: m.provider_id || model?.provider_id || '',
          harness_id: m.harness_id || model?.harness_id || '',
        };
      });
    } else if (server?.model_id) {
      expected = [{
        model_id: server.model_id,
        provider_id: server.provider_id || '',
        harness_id: server.harness_id || '',
      }];
    } else {
      // No server config
      return edits.model_entries.length > 0;
    }

    // Compare model_entries
    if (edits.model_entries.length !== expected.length) return true;
    for (let i = 0; i < edits.model_entries.length; i++) {
      const e = edits.model_entries[i];
      const x = expected[i];
      if (e.model_id !== x.model_id || e.provider_id !== x.provider_id || e.harness_id !== x.harness_id) return true;
    }

    return false;
  }

  // ── Logging ────────────────────────────────────────────────
  onLogLevelChange(field: keyof import('../../services/ai-config.service').LogSettings, value: string): void {
    const current = this.aiConfig.logSettings();
    this.aiConfig.saveLogSettings({
      ...current,
      [field]: value as LogLevel,
    });
  }

  // ── Delete confirmation ─────────────────────────────────────

  /** Compute the impact of deleting a provider, harness, or model.
   *  Returns a ConfirmDelete payload if the item (or models using it) is assigned to roles. */
  private _computeDeleteImpact(type: 'provider' | 'harness' | 'model', id: string): ConfirmDelete | null {
    const config = this.config();
    let affectedModels: AIModel[] = [];
    let name = '';

    if (type === 'provider') {
      affectedModels = config.models.filter(m => m.provider_id === id);
      name = this.providerName(id);
    } else if (type === 'harness') {
      affectedModels = config.models.filter(m => m.harness_id === id);
      name = this.harnessName(id);
    } else {
      const model = config.models.find(m => m.id === id);
      if (model) { affectedModels = [model]; name = model.name; }
    }

    if (affectedModels.length === 0) return null;

    const affectedRoles = [...new Set(affectedModels.flatMap(m => this.rolesForModel(m)))];
    if (affectedRoles.length === 0) return null;

    return {
      type, id, name,
      affectedModels: affectedModels.map(m => m.name),
      affectedModelIds: affectedModels.map(m => m.id),
      affectedRoles,
    };
  }

  /** Execute the confirmed deletion and clear the confirmation dialog. */
  confirmDeleteNow(): void {
    const d = this.confirmDelete();
    if (!d) return;
    if (d.type === 'provider') this._doDeleteProvider(d.id);
    else if (d.type === 'harness') this._doDeleteHarness(d.id);
    else this._doDeleteModel(d.id);
    this.confirmDelete.set(null);
  }

  /** Dismiss the confirmation dialog without deleting. */
  cancelConfirmDelete(): void {
    this.confirmDelete.set(null);
  }

  /** Whether a model (by ID) is affected by the current delete confirmation. */
  isModelAffected(modelId: string): boolean {
    const d = this.confirmDelete();
    return d ? d.affectedModelIds.includes(modelId) : false;
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

  /** Populate roleEdits from the latest config snapshot (v098: per-model provider/harness). */
  private _syncRoleEdits(): void {
    const c = this.config();
    this._ensureRoleEdits(this.roles());
    for (const r of this.roles()) {
      const existing = c.roles.find(rc => rc.role === r);
      // Build model_entries from role_models (prioritized), fall back to single model_id
      const rm = (c.role_models ?? [])
        .filter(m => m.role === r)
        .sort((a, b) => a.priority - b.priority);

      if (rm.length > 0) {
        this.roleEdits[r].model_entries = rm.map(m => {
          // Use the model's native provider/harness as defaults; per-model overrides if set
          const model = c.models.find(mod => mod.id === m.model_id);
          return {
            model_id: m.model_id,
            provider_id: m.provider_id || model?.provider_id || '',
            harness_id: m.harness_id || model?.harness_id || '',
          };
        });
      } else if (existing?.model_id) {
        // Legacy: single model_id from ai_role_config — use role's provider/harness
        this.roleEdits[r].model_entries = [{
          model_id: existing.model_id,
          provider_id: existing.provider_id || '',
          harness_id: existing.harness_id || '',
        }];
      } else {
        this.roleEdits[r].model_entries = [];
      }
    }
  }

  // ── Test tab methods ────────────────────────────────────────────

  /** Called when user selects a model in the test tab dropdown. */
  onTestModelChange(modelId: string): void {
    this.testModelId.set(modelId);
    this.copied.set(false);
    this.clearTestOutput();
  }

  /** Build a command-line preview string from the selected model's harness semantics. */
  testCommandPreview(): string {
    const mid = this.testModelId();
    if (!mid) return '';

    const model = this.config().models.find(m => m.id === mid);
    if (!model) return '';

    const harness = this.config().harnesses.find(h => h.id === model.harness_id);
    if (!harness) return `(harness \"${model.harness_id}\" not found)`;

    let sem: Record<string, any> = {};
    try { sem = JSON.parse(harness.invocation_semantics || '{}'); } catch { /* keep empty */ }

    const binary = sem['binary'] || harness.name.split(' ')[0].toLowerCase();
    const exec = sem['execution'] || {};
    const subcommand = exec['subcommand'] || '';
    const caps = sem['capabilities'] || {};
    const semantics = sem['semantics'] || {};

    const parts: string[] = [binary];
    if (subcommand) parts.push(subcommand);

    // Debug flags (opencode-specific)
    if (binary === 'opencode') {
      parts.push('--print-logs', '--log-level', 'DEBUG');
    }

    // Model flag
    if (caps['model'] && semantics['model']) {
      const modelFlag = semantics['model']['flag'] || '--model';
      parts.push(modelFlag, model.model_identifier);
    }

    // Agent flag
    if (caps['agent'] && semantics['agent']) {
      const agentFlag = semantics['agent']['flag'] || '--agent';
      parts.push(agentFlag, 'builder');
    }

    // Working directory
    if (caps['working_directory'] && semantics['working_directory']) {
      const dirFlag = semantics['working_directory']['flag'] || '--dir';
      parts.push(dirFlag, '~/dev');
    }

    // Prompt — appended as a file path for prompt_file strategy, or flag for system_flag
    const roleStrategy = (sem['role_mapping'] || {})['strategy'] || '';
    if (roleStrategy === 'prompt_file') {
      parts.push('/tmp/test-prompt.txt');
    } else if (caps['system_prompt'] && semantics['system_prompt']) {
      const spFlag = semantics['system_prompt']['flag'] || '--system';
      parts.push(spFlag, '\"<test-prompt>\"');
    } else if (binary === 'ollama') {
      // Ollama uses an inline Python script (matches test_invoke.py pattern)
      parts.length = 0;  // reset — ollama uses python3 wrapper, not binary+flags
      parts.push('python3', '-c', `'import ollama; ollama.generate(model=${JSON.stringify(model.model_identifier)}, prompt=<prompt>)'`);
    } else {
      // Default: prompt passed as positional message arg (matches test_invoke.py for opencode)
      parts.push('"<test-prompt>"');
    }

    return parts.join(' ');
  }

  /** Copy the command preview to the clipboard. */
  copyCommandPreview(): void {
    const cmd = this.testCommandPreview();
    if (!cmd) return;
    navigator.clipboard.writeText(cmd).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => {
      // Fallback: select textarea content
      const ta = document.querySelector('.cmd-preview-textarea') as HTMLTextAreaElement;
      if (ta) { ta.select(); ta.setSelectionRange(0, 99999); }
    });
  }

  /** Test the currently selected model from the Models tab. */
  testSelectedModel(): void {
    const id = this.selectedModelId();
    if (!id) return;
    this.testModelId.set(id);
    this.clearTestOutput();
    this.activeTab.set('test');
  }

  /** Run the test: invoke model with test prompt via backend. */
  runTest(): void {
    const modelId = this.testModelId();
    const prompt = this.testPrompt();
    if (!modelId || !prompt) return;

    this.testRunning.set(true);
    this.testStatus.set('Starting…');
    this.testOutputLines.set([]);
    this.testSessionId.set('');

    // Close any existing SSE connection
    if (this.testEventSource) {
      this.testEventSource.close();
      this.testEventSource = null;
    }

    this.aiConfig.testInvoke(modelId, prompt).subscribe({
      next: (result) => {
        this.testStatus.set('Running');
        this.testSessionId.set(result.sessionId);
        this.testOutputLines.update(lines => [
          ...lines,
          `[test-invoke] Model: ${result.model_name} (${result.model_identifier}) via ${result.harness}`,
          `[test-invoke] Started at: ${result.timestamp}`,
          '───',
        ]);
        this.connectTestSSE(result.sessionId);
      },
      error: (err) => {
        this.testRunning.set(false);
        this.testStatus.set('Error');
        this.testOutputLines.update(lines => [
          ...lines,
          `[ERROR] Failed to start test: ${err.message || err}`,
        ]);
      },
    });
  }

  /** Connect to the session log SSE stream for real-time output. */
  private connectTestSSE(sessionId: string): void {
    const url = `${this.apiUrl}/log/${sessionId}`;

    const es = new EventSource(url);
    this.testEventSource = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'session_log') {
          const line = data.data?.line || '';
          if (line) {
            // Detect completion marker — test_invoke.py writes this as its final line
            if (line.includes('[test-invoke] Exit code:')) {
              this.testCompleted = true;
              this.testOutputLines.update(lines => [...lines, line]);
              this.testRunning.set(false);
              this.testStatus.set('Completed');
              es.close();
              return;
            }
            this.testOutputLines.update(lines => [...lines, line]);
          }
        } else if (data.type === 'session_log_meta') {
          if (!data.data?.logFileExists) {
            this.testOutputLines.update(lines => [...lines, '[test-invoke] Waiting for log file to appear…']);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource closed — mark as completed (guard prevents duplicate if already done via marker)
      if (!this.testCompleted) {
        this.testRunning.set(false);
        this.testStatus.set('Completed');
        this.testOutputLines.update(lines => [...lines, '───', '[test-invoke] Session ended.']);
      }
    };
  }

  /** Cancel the running test: kill the process and reset state. */
  cancelTest(): void {
    const sessionId = this.testSessionId();
    if (!sessionId) {
      this.clearTestOutput();
      return;
    }

    this.testStatus.set('Cancelling…');

    this.aiConfig.cancelTestInvoke(sessionId).subscribe({
      next: () => {
        this.clearTestOutput();
        this.testOutputLines.set(['───', '[test-invoke] Cancelled by user.']);
        this.testStatus.set('Cancelled');
      },
      error: () => {
        // Even if the kill request fails, clean up locally
        this.clearTestOutput();
        this.testOutputLines.set(['───', '[test-invoke] Session ended.']);
        this.testStatus.set('Cancelled');
      },
    });
  }

  /** Clear the test output and stop any running test. */
  clearTestOutput(): void {
    if (this.testEventSource) {
      this.testEventSource.close();
      this.testEventSource = null;
    }
    this.testRunning.set(false);
    this.testStatus.set('');
    this.testOutputLines.set([]);
    this.testSessionId.set('');
  }

  /** Track output lines by index for ngFor. */
  trackTestLine(index: number): number {
    return index;
  }

  /** Clean up SSE connection on destroy to prevent leaks. */
  ngOnDestroy(): void {
    this.clearTestOutput();
  }
}
