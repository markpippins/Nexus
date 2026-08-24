import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Code,
  Shield,
  FileText,
  CheckCircle2,
  X,
  Send,
  Layers,
  Sparkles
} from 'lucide-react';
import { showToast } from '../components/Toast';
import { SystemRole, PromptTemplate, TaskDefinition, InspectorTaskDispatch } from '../types';

interface RolesTasksTabProps {
  roles: SystemRole[];
  prompts: PromptTemplate[];
  tasks: TaskDefinition[];
  inspectorDispatch: InspectorTaskDispatch[];
  onSaveRole: (role: Partial<SystemRole>) => Promise<void>;
  onDeleteRole: (id: string) => Promise<void>;
  onSavePrompt: (prompt: Partial<PromptTemplate>) => Promise<void>;
  onSaveTask: (task: Partial<TaskDefinition>) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export interface ReadinessPiece {
  key: string;
  label: string;
  required: boolean;
  present: boolean;
  detail: string;
}

export interface ReadinessReport {
  role: string;
  ready: boolean;
  requiredPresent: number;
  requiredTotal: number;
  pieces: ReadinessPiece[];
}

export const RolesTasksTab: React.FC<RolesTasksTabProps> = ({
  roles,
  prompts,
  tasks,
  inspectorDispatch,
  onSaveRole,
  onDeleteRole,
  onSavePrompt,
  onSaveTask,
  onRefresh
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'roles' | 'prompts' | 'tasks' | 'dispatch'>('prompts');

  // Role Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');

  // Prompt Modal
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Partial<PromptTemplate> | null>(null);
  const [pRole, setPRole] = useState('operator');
  const [pSlug, setPSlug] = useState('opencode-persona');
  const [pVersion, setPVersion] = useState(2);
  const [pTitle, setPTitle] = useState('');
  const [pBodyMd, setPBodyMd] = useState('');
  const [pTagsStr, setPTagsStr] = useState('system-prompt, canonical');

  // Task Modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [tRole, setTRole] = useState('inspector');
  const [tSlug, setTSlug] = useState('verify-ai-bundle-integrity');
  const [tScope, setTScope] = useState('');
  const [tCriteriaStr, setTCriteriaStr] = useState('Check active bundle priority\nVerify valid dates');
  const [tPromptId, setTPromptId] = useState('');

  // Provision Role modal (Gap 1 onboarding — POST /roles/provision)
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [pvName, setPvName] = useState('');
  const [pvDesc, setPvDesc] = useState('');
  const [pvDisplayName, setPvDisplayName] = useState('');
  const [pvModelId, setPvModelId] = useState('');
  const [pvTools, setPvTools] = useState('');
  const [pvProcedures, setPvProcedures] = useState('');
  const [pvCreateUser, setPvCreateUser] = useState(true);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ steps?: string[]; readiness?: ReadinessReport } | null>(null);

  // Readiness modal (Gap 6 — GET /roles/readiness/:name)
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionBusy(true);
    setProvisionResult(null);
    try {
      const res = await fetch('/roles/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pvName.trim(),
          description: pvDesc.trim() || undefined,
          displayName: pvDisplayName.trim() || undefined,
          modelId: pvModelId.trim() || undefined,
          tools: pvTools.split(',').map(s => s.trim()).filter(Boolean),
          procedures: pvProcedures.split(',').map(s => s.trim()).filter(Boolean),
          createAssemblyUser: pvCreateUser,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err && (err.error || err.message)) || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProvisionResult(data);
      await onRefresh();
    } catch (err) {
      showToast(`Provision error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProvisionBusy(false);
    }
  };

  const handleShowReadiness = async (roleName: string) => {
    setReadinessBusy(true);
    try {
      const res = await fetch(`/roles/readiness/${encodeURIComponent(roleName)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err && (err.error || err.message)) || `HTTP ${res.status}`);
      }
      setReadiness(await res.json());
    } catch (err) {
      showToast(`Readiness error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReadinessBusy(false);
    }
  };

  // Handlers
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSaveRole({ name: roleName, description: roleDesc });
      setRoleModalOpen(false);
    } catch (err) {
      showToast(`Error saving role: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const openPromptModal = (prompt?: PromptTemplate) => {
    if (prompt) {
      setEditingPrompt(prompt);
      setPRole(prompt.role);
      setPSlug(prompt.slug);
      setPVersion(prompt.version);
      setPTitle(prompt.title);
      setPBodyMd(prompt.body_md);
      setPTagsStr((prompt.tags || []).join(', '));
    } else {
      setEditingPrompt(null);
      setPRole(roles[0]?.name || 'operator');
      setPSlug('custom-persona');
      setPVersion(1);
      setPTitle('');
      setPBodyMd('# Role Instructions\n\nWrite system directives here...');
      setPTagsStr('system-prompt');
    }
    setPromptModalOpen(true);
  };

  const handleSavePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = pTagsStr.split(',').map(s => s.trim()).filter(Boolean);
    try {
      await onSavePrompt({
        id: editingPrompt?.id,
        role: pRole,
        slug: pSlug,
        version: pVersion,
        title: pTitle,
        body_md: pBodyMd,
        tags
      });
      setPromptModalOpen(false);
    } catch (err) {
      showToast(`Error saving prompt: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const openTaskModal = () => {
    setTRole(roles[0]?.name || 'inspector');
    setTSlug('task-' + Date.now().toString(36));
    setTScope('Scope description...');
    setTCriteriaStr('Criteria 1\nCriteria 2');
    setTPromptId(prompts[0]?.id || '');
    setTaskModalOpen(true);
  };

  const handleSaveTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const acceptance_criteria = tCriteriaStr.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      await onSaveTask({
        role: tRole,
        task_slug: tSlug,
        scope: tScope,
        acceptance_criteria,
        prompt_id: tPromptId,
        active: true
      });
      setTaskModalOpen(false);
    } catch (err) {
      showToast(`Error saving task: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubTab('prompts')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'prompts'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Prompt Templates ({prompts.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('tasks')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'tasks'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Task Registry ({tasks.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('dispatch')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'dispatch'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <Send className="w-4 h-4 text-cyan-400" />
            <span>Inspector Dispatch ({inspectorDispatch.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'roles'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>System Roles ({roles.length})</span>
          </button>
        </div>

        {activeSubTab === 'prompts' && (
          <button
            onClick={() => openPromptModal()}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[var(--accent-color)]" />
            <span>New Prompt Template</span>
          </button>
        )}
        {activeSubTab === 'tasks' && (
          <button
            onClick={() => openTaskModal()}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Register Task</span>
          </button>
        )}
        {activeSubTab === 'roles' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setProvisionOpen(true);
                setProvisionResult(null);
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--accent-color)] text-slate-950 hover:opacity-90 border border-[var(--border-color)] transition flex items-center gap-1.5 cursor-pointer"
              title="One-call atomic role setup (identity + bundle + persona + tools + procedures + nebula sync)"
            >
              <Sparkles className="w-4 h-4" />
              <span>Provision Role</span>
            </button>
            <button
              onClick={() => {
                setRoleName('');
                setRoleDesc('');
                setRoleModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[var(--accent-color)]" />
              <span>Add Role</span>
            </button>
          </div>
        )}
      </div>

      {/* 1. PROMPT TEMPLATES VIEW */}
      {activeSubTab === 'prompts' && (
        <div className="space-y-4">
          {prompts.map(prompt => (
            <div
              key={prompt.id}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[var(--accent-color)]" />
                    <h4 className="font-bold text-sm text-[var(--text-primary)]">{prompt.title}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] font-bold border border-[var(--border-subtle)]">
                      v{prompt.version}
                    </span>
                  </div>
                  <div className="text-sm font-mono text-[var(--text-secondary)] mt-1 flex items-center gap-3">
                    <span>Role: <strong className="text-[var(--text-primary)]">{prompt.role}</strong></span>
                    <span>•</span>
                    <span>Slug: <strong>{prompt.slug}</strong></span>
                    <span>•</span>
                    <span>ID: {prompt.id}</span>
                  </div>
                </div>

                <button
                  onClick={() => openPromptModal(prompt)}
                  className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-subtle)] transition cursor-pointer"
                  title="Edit Prompt"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tag Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="w-3 h-3 text-[var(--text-muted)]" />
                {(prompt.tags || []).map((t, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {/* Markdown Body Viewer */}
              <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3 max-h-48 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm text-[var(--text-primary)] leading-relaxed">
                  {prompt.body_md}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. TASK REGISTRY VIEW */}
      {activeSubTab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map(task => {
            const boundPrompt = prompts.find(p => p.id === task.prompt_id);

            return (
              <div
                key={task.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-3 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <h4 className="font-bold text-sm text-[var(--text-primary)] font-mono">
                          {task.task_slug}
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] block mt-0.5">
                        Role: {task.role}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-800/40">
                      ACTIVE
                    </span>
                  </div>

                  <div className="text-sm text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <strong className="text-[var(--text-primary)] block mb-1">Scope:</strong>
                    {task.scope}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      Acceptance Criteria
                    </span>
                    <ul className="space-y-1 text-sm">
                      {task.acceptance_criteria.map((crit, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[var(--text-secondary)]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{crit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex items-center justify-between">
                  <span>Bound Prompt: {boundPrompt?.title || task.prompt_id}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. INSPECTOR DISPATCH VIEW */}
      {activeSubTab === 'dispatch' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Inspector Task Dispatch Wiring (`/tasks/inspector/dispatch`)
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Bundles task definition + full persona prompt `body_md` in a single payload for zero-roundtrip agent dispatch.
            </p>
          </div>

          {inspectorDispatch.map(item => (
            <div key={item.id} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-cyan-400" />
                    <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                      Task: {item.task_slug}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] font-bold">
                      ROLE: {item.role}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{item.scope}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Acceptance Checklist</span>
                  </span>
                  <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1 text-sm font-mono text-[var(--text-secondary)]">
                    {item.acceptance_criteria.map((c, i) => (
                      <div key={i}>✓ {c}</div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                    <span>Bundled Persona Body ({item.prompt_title} v{item.prompt_version})</span>
                  </span>
                  <pre className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-sm text-[var(--text-primary)] max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {item.prompt_body_md}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. SYSTEM ROLES VIEW */}
      {activeSubTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(r => (
            <div
              key={r.id}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-3 shadow-sm flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--accent-color)]" />
                    <h4 className="font-mono font-bold text-sm text-[var(--text-primary)]">{r.name}</h4>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await onDeleteRole(r.id);
                      } catch (err) {
                        showToast(`Error deleting role: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                    className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                    title="Delete Role"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {r.description || 'System agent role'}
                </p>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex items-center justify-between">
                <span>Role ID: {r.id}</span>
                <button
                  onClick={() => handleShowReadiness(r.name)}
                  disabled={readinessBusy}
                  className="px-2 py-1 rounded-md text-[10px] font-bold bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--accent-color)] hover:text-slate-950 hover:bg-[var(--accent-color)] transition cursor-pointer"
                  title="Check role readiness (10-piece checklist)"
                >
                  {readinessBusy ? '…' : '✓ Readiness'}
                </button>
                <span>{new Date(r.created_at || '').toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PROVISION ROLE MODAL */}
      {provisionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent-color)]" />
                Provision Role
              </h3>
              <button onClick={() => setProvisionOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Role Name *</label>
                  <input
                    type="text"
                    required
                    value={pvName}
                    onChange={e => setPvName(e.target.value)}
                    placeholder="e.g. synthesizer"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Display Name</label>
                  <input
                    type="text"
                    value={pvDisplayName}
                    onChange={e => setPvDisplayName(e.target.value)}
                    placeholder="Synthesizer"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Description</label>
                <textarea
                  rows={2}
                  value={pvDesc}
                  onChange={e => setPvDesc(e.target.value)}
                  placeholder="What this role does..."
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                  Model ID <span className="text-[var(--text-muted)] font-normal">(optional — creates the config bundle)</span>
                </label>
                <input
                  type="text"
                  value={pvModelId}
                  onChange={e => setPvModelId(e.target.value)}
                  placeholder="e.g. mod-glm-5-2"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Tools (comma-separated)</label>
                  <input
                    type="text"
                    value={pvTools}
                    onChange={e => setPvTools(e.target.value)}
                    placeholder="conduit-mcp_query_conduit_state"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Procedures (comma-separated)</label>
                  <input
                    type="text"
                    value={pvProcedures}
                    onChange={e => setPvProcedures(e.target.value)}
                    placeholder="inbox-query-procedure"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={pvCreateUser}
                  onChange={e => setPvCreateUser(e.target.checked)}
                  className="accent-[var(--accent-color)]"
                />
                <span>Also create Assembly user (posting identity)</span>
              </label>

              {provisionResult && (
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-2 text-xs font-mono">
                  <div className="text-emerald-400 font-bold">✓ Provisioned — {provisionResult.readiness?.ready ? 'READY' : 'INCOMPLETE'}
                    {provisionResult.readiness ? ` (${provisionResult.readiness.requiredPresent}/${provisionResult.readiness.requiredTotal} required pieces)` : ''}
                  </div>
                  {provisionResult.steps && provisionResult.steps.length > 0 && (
                    <div className="text-[var(--text-secondary)]">Steps: {provisionResult.steps.join(' → ')}</div>
                  )}
                  {provisionResult.readiness?.pieces && (
                    <ul className="space-y-0.5 text-[var(--text-secondary)]">
                      {provisionResult.readiness.pieces.filter(p => p.required).map(p => (
                        <li key={p.key} className={p.present ? 'text-emerald-400' : 'text-rose-400'}>· {p.present ? '✓' : '✗'} {p.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProvisionOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={provisionBusy}
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer disabled:opacity-50"
                >
                  {provisionBusy ? 'Provisioning…' : 'Provision Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* READINESS MODAL */}
      {readiness && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-color)]" />
                Readiness: <span className="font-mono">{readiness.role}</span>
              </h3>
              <button onClick={() => setReadiness(null)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`text-sm font-bold ${readiness.ready ? 'text-emerald-400' : 'text-amber-400'}`}>
              {readiness.ready ? '✓ READY' : '⚠ INCOMPLETE'} — {readiness.requiredPresent}/{readiness.requiredTotal} required pieces present
            </div>

            <ul className="space-y-1.5 text-sm">
              {readiness.pieces.map(p => (
                <li key={p.key} className="flex items-start justify-between gap-2">
                  <span className={`${p.present ? 'text-emerald-400' : 'text-rose-400'} shrink-0`}>{p.present ? '✓' : '✗'}</span>
                  <span className="flex-1 text-[var(--text-secondary)]">
                    {p.label}
                    {!p.required && <span className="text-[var(--text-muted)] text-[10px] ml-1">(optional)</span>}
                  </span>
                  {p.detail && <span className="text-[10px] font-mono text-[var(--text-muted)]">{p.detail}</span>}
                </li>
              ))}
            </ul>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setReadiness(null)}
                className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE MODAL */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Add System Role</h3>
              <button onClick={() => setRoleModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3 text-sm">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Role Name *</label>
                <input
                  type="text"
                  required
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  placeholder="e.g. architect or synthesizer"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Role Description</label>
                <textarea
                  rows={3}
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  placeholder="System role capabilities..."
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  Save Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROMPT MODAL */}
      {promptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingPrompt ? 'Edit Prompt Template' : 'New Prompt Template'}
              </h3>
              <button onClick={() => setPromptModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePromptSubmit} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Role *</label>
                  <select
                    value={pRole}
                    onChange={e => setPRole(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Slug *</label>
                  <input
                    type="text"
                    required
                    value={pSlug}
                    onChange={e => setPSlug(e.target.value)}
                    placeholder="e.g. opencode-persona"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Title *</label>
                  <input
                    type="text"
                    required
                    value={pTitle}
                    onChange={e => setPTitle(e.target.value)}
                    placeholder="e.g. Operator System Prompt"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Version Number</label>
                  <input
                    type="number"
                    value={pVersion}
                    onChange={e => setPVersion(parseInt(e.target.value) || 1)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Markdown Body (body_md) *</label>
                <textarea
                  rows={8}
                  required
                  value={pBodyMd}
                  onChange={e => setPBodyMd(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={pTagsStr}
                  onChange={e => setPTagsStr(e.target.value)}
                  placeholder="system-prompt, canonical"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPromptModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  Save Prompt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK MODAL */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Register New Task</h3>
              <button onClick={() => setTaskModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskSubmit} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Role *</label>
                  <select
                    value={tRole}
                    onChange={e => setTRole(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Task Slug *</label>
                  <input
                    type="text"
                    required
                    value={tSlug}
                    onChange={e => setTSlug(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Scope Description</label>
                <input
                  type="text"
                  value={tScope}
                  onChange={e => setTScope(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                  Acceptance Criteria (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={tCriteriaStr}
                  onChange={e => setTCriteriaStr(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Bound Prompt Template</label>
                <select
                  value={tPromptId}
                  onChange={e => setTPromptId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                >
                  {prompts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.role}/{p.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  Register Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
