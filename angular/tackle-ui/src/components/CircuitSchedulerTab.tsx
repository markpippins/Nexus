import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Play,
  Calendar,
  Settings,
  Folder,
  X
} from 'lucide-react';
import { FailureRecoveryConfig, AgentScheduleEntry, SystemRole, AIModel } from '../types';

interface CircuitSchedulerTabProps {
  failureConfig: FailureRecoveryConfig;
  onSaveFailureConfig: (config: FailureRecoveryConfig) => Promise<void>;
  schedules: AgentScheduleEntry[];
  roles: SystemRole[];
  models: AIModel[];
  onSaveSchedule: (sched: Partial<AgentScheduleEntry>) => Promise<void>;
  onToggleSchedule: (id: string, enabled: boolean) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
}

export const CircuitSchedulerTab: React.FC<CircuitSchedulerTabProps> = ({
  failureConfig,
  onSaveFailureConfig,
  schedules,
  roles,
  models,
  onSaveSchedule,
  onToggleSchedule,
  onDeleteSchedule
}) => {
  // Circuit Breaker form state
  const [maxRetries, setMaxRetries] = useState<number>(failureConfig.max_retries_per_model);
  const [retryDelay, setRetryDelay] = useState<number>(failureConfig.retry_delay_seconds);
  const [maxFallbacks, setMaxFallbacks] = useState<number>(failureConfig.max_fallbacks);
  const [pushBack, setPushBack] = useState<boolean>(failureConfig.push_back_to_pending);
  const [circuitRetryAfter, setCircuitRetryAfter] = useState<number>(failureConfig.circuit_breaker_retry_after);
  const [isSavingCircuit, setIsSavingCircuit] = useState<boolean>(false);
  const [circuitSavedSuccess, setCircuitSavedSuccess] = useState<boolean>(false);

  // Scheduler modal state
  const [schedModalOpen, setSchedModalOpen] = useState<boolean>(false);
  const [editingSched, setEditingSched] = useState<AgentScheduleEntry | null>(null);
  const [schedRole, setSchedRole] = useState<string>(roles[0]?.name || 'operator');
  const [schedModelId, setSchedModelId] = useState<string>(models[0]?.id || '');
  const [schedType, setSchedType] = useState<'cron' | 'interval' | 'manual'>('cron');
  const [schedValue, setSchedValue] = useState<string>('0 */2 * * *');
  const [schedProjectDir, setSchedProjectDir] = useState<string>('/nexus/tackle');

  const handleCircuitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCircuit(true);
    try {
      await onSaveFailureConfig({
        max_retries_per_model: maxRetries,
        retry_delay_seconds: retryDelay,
        max_fallbacks: maxFallbacks,
        push_back_to_pending: pushBack,
        circuit_breaker_retry_after: circuitRetryAfter
      });
      setCircuitSavedSuccess(true);
      setTimeout(() => setCircuitSavedSuccess(false), 3000);
    } catch (e) {
      alert('Error updating circuit breaker configuration');
    } finally {
      setIsSavingCircuit(false);
    }
  };

  const openCreateSched = () => {
    setEditingSched(null);
    setSchedRole(roles[0]?.name || 'operator');
    setSchedModelId(models[0]?.id || '');
    setSchedType('cron');
    setSchedValue('0 */2 * * *');
    setSchedProjectDir('/nexus/tackle');
    setSchedModalOpen(true);
  };

  const openEditSched = (s: AgentScheduleEntry) => {
    setEditingSched(s);
    setSchedRole(s.role);
    setSchedModelId(s.model_id || models[0]?.id || '');
    setSchedType(s.schedule_type);
    setSchedValue(String(s.schedule_value ?? ''));
    setSchedProjectDir(s.project_dir || '/nexus/tackle');
    setSchedModalOpen(true);
  };

  const closeSchedModal = () => {
    setSchedModalOpen(false);
    setEditingSched(null);
  };

  const handleSaveSchedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSaveSchedule({
        id: editingSched?.id,
        role: schedRole,
        model_id: schedModelId,
        schedule_type: schedType,
        schedule_value: schedValue,
        project_dir: schedProjectDir,
        enabled: editingSched ? editingSched.enabled : true
      });
      closeSchedModal();
    } catch (err) {
      alert(`Error saving schedule: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleToggleSched = async (s: AgentScheduleEntry) => {
    try {
      await onToggleSchedule(s.id, !s.enabled);
    } catch (err) {
      alert(`Error toggling schedule: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteSched = async (id: string) => {
    try {
      await onDeleteSchedule(id);
    } catch (err) {
      alert(`Error deleting schedule: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. CIRCUIT BREAKER CONFIGURATION SECTION */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Circuit Breaker & Failure Recovery Subsystem (`/config/failure-recovery`)
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Configures threshold triggers for model failovers, retries, and pushback queue routing.
            </p>
          </div>

          {circuitSavedSuccess && (
            <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/40 px-3 py-1 rounded border border-emerald-800/40">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved Circuit Config</span>
            </span>
          )}
        </div>

        <form onSubmit={handleCircuitSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Max Retries */}
            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1">
              <label className="block text-[var(--text-primary)] font-bold">
                Max Retries Per Model
              </label>
              <p className="text-[10px] text-[var(--text-muted)]">
                Attempts before flagging endpoint degraded
              </p>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRetries}
                onChange={e => setMaxRetries(parseInt(e.target.value) || 1)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-3 py-1.5 font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Retry Delay */}
            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1">
              <label className="block text-[var(--text-primary)] font-bold">
                Retry Delay (Seconds)
              </label>
              <p className="text-[10px] text-[var(--text-muted)]">
                Backoff pause before retrying
              </p>
              <input
                type="number"
                min={1}
                max={60}
                value={retryDelay}
                onChange={e => setRetryDelay(parseInt(e.target.value) || 1)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-3 py-1.5 font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Max Fallbacks */}
            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1">
              <label className="block text-[var(--text-primary)] font-bold">
                Max Fallbacks
              </label>
              <p className="text-[10px] text-[var(--text-muted)]">
                Secondary models to cascade through
              </p>
              <input
                type="number"
                min={1}
                max={5}
                value={maxFallbacks}
                onChange={e => setMaxFallbacks(parseInt(e.target.value) || 1)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-3 py-1.5 font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Circuit Retry After */}
            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1">
              <label className="block text-[var(--text-primary)] font-bold">
                Circuit Breaker Retry After (s)
              </label>
              <p className="text-[10px] text-[var(--text-muted)]">
                Cooldown window before probing primary endpoint
              </p>
              <input
                type="number"
                min={10}
                max={600}
                value={circuitRetryAfter}
                onChange={e => setCircuitRetryAfter(parseInt(e.target.value) || 30)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-3 py-1.5 font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Push Back To Pending Toggle */}
            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between col-span-1 sm:col-span-2">
              <div>
                <label className="block text-[var(--text-primary)] font-bold">
                  Push Back To Pending Queue
                </label>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Re-queue turn execution when all fallbacks fail
                </p>
              </div>
              <input
                type="checkbox"
                checked={pushBack}
                onChange={e => setPushBack(e.target.checked)}
                className="h-5 w-5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-color)] cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingCircuit}
              className="px-5 py-2 rounded-lg font-bold text-xs bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition cursor-pointer"
            >
              {isSavingCircuit ? 'Updating...' : 'Save Failure Recovery Config'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. AGENT SCHEDULER SECTION */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Agent Scheduler Registry (`/scheduler`)
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Automated cron / interval agent tasks for continuous inspection and orchestration.
            </p>
          </div>

          <button
            onClick={openCreateSched}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Agent Schedule</span>
          </button>
        </div>

        {/* Schedules Table */}
        <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          {schedules.map(s => (
            <div
              key={s.id}
              className={`p-4 transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                s.enabled ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-secondary)] opacity-60'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[var(--text-primary)]">
                    Role: {s.role}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] font-bold uppercase">
                    {s.schedule_type}: {s.schedule_value}
                  </span>
                  <button
                    onClick={() => handleToggleSched(s)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold cursor-pointer transition ${
                      s.enabled
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {s.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="text-xs font-mono text-[var(--text-secondary)] flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Folder className="w-3 h-3 text-[var(--text-muted)]" />
                    {s.project_dir || '/nexus/tackle'}
                  </span>
                  <span>•</span>
                  <span>Model: {s.model_id || 'Default'}</span>
                  <span>•</span>
                  <span>ID: {s.id}</span>
                </div>

                {s.last_run_at && (
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">
                    Last run: {new Date(s.last_run_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditSched(s)}
                  className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition cursor-pointer"
                  title="Edit Schedule"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteSched(s.id)}
                  className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded cursor-pointer transition"
                  title="Delete Schedule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SCHEDULER MODAL */}
      {schedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingSched ? 'Edit Agent Schedule' : 'New Agent Schedule Entry'}
              </h3>
              <button onClick={closeSchedModal} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Target Agent Role *</label>
                <select
                  value={schedRole}
                  onChange={e => setSchedRole(e.target.value)}
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
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Target Model</label>
                <select
                  value={schedModelId}
                  onChange={e => setSchedModelId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.model_identifier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Schedule Type</label>
                <select
                  value={schedType}
                  onChange={e => setSchedType(e.target.value as any)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                >
                  <option value="cron">cron (Standard 5-part cron string)</option>
                  <option value="interval">interval (e.g. 15m, 1h, 30s)</option>
                  <option value="manual">manual (On Demand Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                  Schedule Expression *
                </label>
                <input
                  type="text"
                  required
                  value={schedValue}
                  onChange={e => setSchedValue(e.target.value)}
                  placeholder="0 */2 * * * or 15m"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Project Directory</label>
                <input
                  type="text"
                  value={schedProjectDir}
                  onChange={e => setSchedProjectDir(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSchedModal}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  {editingSched ? 'Update Schedule' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
