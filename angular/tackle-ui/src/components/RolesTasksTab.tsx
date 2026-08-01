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
}

export const RolesTasksTab: React.FC<RolesTasksTabProps> = ({
  roles,
  prompts,
  tasks,
  inspectorDispatch,
  onSaveRole,
  onDeleteRole,
  onSavePrompt,
  onSaveTask
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

  // Handlers
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSaveRole({ name: roleName, description: roleDesc });
      setRoleModalOpen(false);
    } catch (err) {
      alert(`Error saving role: ${err instanceof Error ? err.message : String(err)}`);
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
      alert(`Error saving prompt: ${err instanceof Error ? err.message : String(err)}`);
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
      alert(`Error saving task: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubTab('prompts')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[var(--accent-color)]" />
            <span>New Prompt Template</span>
          </button>
        )}
        {activeSubTab === 'tasks' && (
          <button
            onClick={() => openTaskModal()}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Register Task</span>
          </button>
        )}
        {activeSubTab === 'roles' && (
          <button
            onClick={() => {
              setRoleName('');
              setRoleDesc('');
              setRoleModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Add Role</span>
          </button>
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
                  <div className="text-xs font-mono text-[var(--text-secondary)] mt-1 flex items-center gap-3">
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
                <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--text-primary)] leading-relaxed">
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

                  <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                    <strong className="text-[var(--text-primary)] block mb-1">Scope:</strong>
                    {task.scope}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      Acceptance Criteria
                    </span>
                    <ul className="space-y-1 text-xs">
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
            <p className="text-xs text-[var(--text-secondary)] mt-1">
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
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{item.scope}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Acceptance Checklist</span>
                  </span>
                  <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1 text-xs font-mono text-[var(--text-secondary)]">
                    {item.acceptance_criteria.map((c, i) => (
                      <div key={i}>✓ {c}</div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                    <span>Bundled Persona Body ({item.prompt_title} v{item.prompt_version})</span>
                  </span>
                  <pre className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] max-h-36 overflow-y-auto whitespace-pre-wrap">
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
                        alert(`Error deleting role: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                    className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                    title="Delete Role"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {r.description || 'System agent role'}
                </p>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                <span>Role ID: {r.id}</span>
                <span>{new Date(r.created_at || '').toLocaleDateString()}</span>
              </div>
            </div>
          ))}
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

            <form onSubmit={handleSaveRole} className="space-y-3 text-xs">
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

            <form onSubmit={handleSavePromptSubmit} className="space-y-3 text-xs">
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
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] leading-relaxed"
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

            <form onSubmit={handleSaveTaskSubmit} className="space-y-3 text-xs">
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
