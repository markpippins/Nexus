import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  X,
  Filter,
  BookOpen,
  Layers
} from 'lucide-react';
import { TaskDefinition, PromptTemplate, SystemRole } from '../types';

interface TasksTabProps {
  tasks: TaskDefinition[];
  prompts: PromptTemplate[];
  roles: SystemRole[];
  onSaveTask: (task: Partial<TaskDefinition>) => Promise<void>;
  onDeleteTask: (task: TaskDefinition) => Promise<void>;
}

export const TasksTab: React.FC<TasksTabProps> = ({
  tasks,
  prompts,
  roles,
  onSaveTask,
  onDeleteTask
}) => {
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Task Modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDefinition | null>(null);
  const [tRole, setTRole] = useState('inspector');
  const [tSlug, setTSlug] = useState('');
  const [tScope, setTScope] = useState('');
  const [tCriteriaStr, setTCriteriaStr] = useState('');
  const [tPromptId, setTPromptId] = useState('');
  const [tActive, setTActive] = useState(true);

  const filteredTasks = roleFilter === 'all'
    ? tasks
    : tasks.filter(t => t.role === roleFilter);

  const openCreateTask = () => {
    setEditingTask(null);
    setTRole(roleFilter !== 'all' ? roleFilter : (roles[0]?.name || 'inspector'));
    setTSlug('task-' + Date.now().toString(36));
    setTScope('');
    setTCriteriaStr('');
    setTPromptId(prompts[0]?.id || '');
    setTActive(true);
    setTaskModalOpen(true);
  };

  const openEditTask = (task: TaskDefinition) => {
    setEditingTask(task);
    setTRole(task.role);
    setTSlug(task.task_slug);
    setTScope(task.scope);
    setTCriteriaStr((task.acceptance_criteria || []).join('\n'));
    setTPromptId(task.prompt_id);
    setTActive(task.active);
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
        active: tActive
      });
      setTaskModalOpen(false);
    } catch (err) {
      alert(`Error saving task: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (task: TaskDefinition) => {
    if (!confirm(`Delete task "${task.task_slug}"? Scheduled jobs attached to it will fall back to the role's default persona.`)) return;
    try {
      await onDeleteTask(task);
    } catch (err) {
      alert(`Error deleting task: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const roleOptions = roles.length > 0
    ? roles
    : Array.from(new Set(tasks.map(t => t.role))).map(r => ({ id: r, name: r }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Task Registry (`/tasks`)
              </h2>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Concrete task assignments in <code className="font-mono">tackle.tasks</code> — bind a role, slug,
              scope and acceptance criteria to a prompt template. Tasks can be attached to scheduled jobs so their
              prompt is appended to the role's default persona.
            </p>
          </div>

          <button
            onClick={openCreateTask}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 font-mono text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
          >
            <option value="all">All Roles ({tasks.length})</option>
            {roleOptions.map(r => (
              <option key={r.id} value={r.name}>
                {r.name} ({tasks.filter(t => t.role === r.name).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task Cards */}
      {filteredTasks.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-dashed border-[var(--border-color)] rounded-xl p-10 text-center">
          <Layers className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">
            {roleFilter === 'all'
              ? 'No tasks registered yet.'
              : `No tasks for role "${roleFilter}".`}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Create one with the "New Task" button — the task registry feeds the scheduler task selector.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks.map(task => {
            const boundPrompt = prompts.find(p => p.id === task.prompt_id);

            return (
              <div
                key={task.id}
                className={`bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-3 shadow-sm flex flex-col justify-between ${
                  task.active ? '' : 'opacity-60'
                }`}
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
                        Role: <strong className="text-[var(--text-primary)]">{task.role}</strong>
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        task.active
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {task.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  {task.scope && (
                    <div className="text-sm text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                      <strong className="text-[var(--text-primary)] block mb-1">Scope:</strong>
                      {task.scope}
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      Acceptance Criteria ({task.acceptance_criteria.length})
                    </span>
                    <ul className="space-y-1 text-sm">
                      {task.acceptance_criteria.map((crit, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[var(--text-secondary)]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{crit}</span>
                        </li>
                      ))}
                      {task.acceptance_criteria.length === 0 && (
                        <li className="text-[var(--text-muted)] italic">No criteria set.</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1 min-w-0">
                    <BookOpen className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {boundPrompt
                        ? `${boundPrompt.title} (${boundPrompt.role}/${boundPrompt.slug} v${boundPrompt.version})`
                        : `Prompt: ${task.prompt_id}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditTask(task)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition cursor-pointer"
                      title="Edit Task"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded transition cursor-pointer"
                      title="Delete Task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TASK MODAL */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-5xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingTask ? `Edit Task: ${editingTask.task_slug}` : 'Register New Task'}
              </h3>
              <button onClick={() => setTaskModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskSubmit} className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Role *</label>
                  <select
                    value={tRole}
                    onChange={e => setTRole(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  >
                    {roleOptions.map(r => (
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

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Scope Description</label>
                  <input
                    type="text"
                    value={tScope}
                    onChange={e => setTScope(e.target.value)}
                    placeholder="What the task is scoped to (plan ref, subsystem, path...)"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Bound Prompt Template</label>
                  <select
                    value={tPromptId}
                    onChange={e => setTPromptId(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  >
                    {(prompts.length ? prompts : []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.role}/{p.slug} v{p.version})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    This template's body is appended to the role's default persona when the task is attached to a scheduled job.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                  Acceptance Criteria (1 per line)
                </label>
                <textarea
                  rows={6}
                  value={tCriteriaStr}
                  onChange={e => setTCriteriaStr(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)]"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tActive}
                  onChange={e => setTActive(e.target.checked)}
                  className="h-4 w-4 rounded bg-[var(--bg-tertiary)] text-[var(--accent-color)] cursor-pointer"
                />
                <span className="text-[var(--text-secondary)] font-semibold">
                  Active (available for scheduling)
                </span>
              </label>

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
                  {editingTask ? 'Update Task' : 'Register Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
