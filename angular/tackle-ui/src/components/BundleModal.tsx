import React, { useState } from 'react';
import { Zap, X, Code } from 'lucide-react';
import { ConfigBundle, AIModel, Provider, Harness, SystemRole } from '../types';

interface BundleModalProps {
  /**
   * Existing bundle to edit, a partial prefill for a new bundle (e.g. the
   * model/provider/harness picked on the AI Registry card), or null for a
   * blank new bundle. Parents should remount this component (via `key`)
   * each time they open it so the form always initializes from the latest
   * value.
   */
  initial: Partial<ConfigBundle> | null;
  /** Default role used when `initial.role` is absent (e.g. "engineer"). */
  defaultRole?: string;
  onClose: () => void;
  models: AIModel[];
  providers: Provider[];
  harnesses: Harness[];
  roles: SystemRole[];
  onSaveBundle: (bundle: Partial<ConfigBundle>) => Promise<void>;
}

export const BundleModal: React.FC<BundleModalProps> = ({
  initial,
  defaultRole,
  onClose,
  models,
  providers,
  harnesses,
  roles,
  onSaveBundle
}) => {
  const isEdit = !!(initial && initial.id);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form state is initialized once on mount — see `initial` note above.
  const [formName, setFormName] = useState<string>(initial?.name || '');
  const [formRole, setFormRole] = useState<string>(
    initial?.role || defaultRole || roles[0]?.name || 'operator'
  );
  const [formModelId, setFormModelId] = useState<string>(initial?.model_id || models[0]?.id || '');
  const [formProviderId, setFormProviderId] = useState<string>(
    initial === null ? providers[0]?.id || '' : initial.provider_id || ''
  );
  const [formHarnessId, setFormHarnessId] = useState<string>(
    initial === null ? harnesses[0]?.id || '' : initial.harness_id || ''
  );
  const [formPriority, setFormPriority] = useState<number>(initial?.priority || 1);
  const [formMode, setFormMode] = useState<ConfigBundle['invocation_mode']>(
    initial?.invocation_mode || 'stream'
  );
  const [formTimeout, setFormTimeout] = useState<number>(initial?.timeout_ms || 30000);
  const [formValidFrom, setFormValidFrom] = useState<string>(
    initial?.valid_from ? new Date(initial.valid_from).toISOString().slice(0, 16) : ''
  );
  const [formValidTo, setFormValidTo] = useState<string>(
    initial?.valid_to ? new Date(initial.valid_to).toISOString().slice(0, 16) : ''
  );
  const [formIsActive, setFormIsActive] = useState<boolean>(initial?.is_active ?? true);
  const [formCommand, setFormCommand] = useState<string>(initial?.command || '');
  const [formEndpoint, setFormEndpoint] = useState<string>(initial?.endpoint_url || '');
  const [formMetadataJson, setFormMetadataJson] = useState<string>(
    initial && initial.metadata
      ? JSON.stringify(initial.metadata, null, 2)
      : initial && initial.id
        ? '{}'
        : '{\n  "environment": "production"\n}'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let parsedMeta = {};
      try {
        parsedMeta = JSON.parse(formMetadataJson);
      } catch (err) {
        parsedMeta = {};
      }

      await onSaveBundle({
        id: initial?.id,
        name: formName,
        role: formRole,
        model_id: formModelId,
        provider_id: formProviderId || undefined,
        harness_id: formHarnessId || undefined,
        priority: formPriority,
        invocation_mode: formMode,
        timeout_ms: formTimeout,
        valid_from: formValidFrom ? new Date(formValidFrom).toISOString() : undefined,
        valid_to: formValidTo ? new Date(formValidTo).toISOString() : undefined,
        is_active: formIsActive,
        command: formCommand || undefined,
        endpoint_url: formEndpoint || undefined,
        metadata: parsedMeta
      });
      onClose();
    } catch (err) {
      alert(`Error saving bundle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent-color)]" />
            <span>{isEdit ? 'Edit Config Bundle' : 'New Config Bundle'}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bundle Name */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Bundle Name *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Operator Gemini Flash Primary"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Target Role */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Target Role *</label>
              <select
                value={formRole}
                onChange={e => setFormRole(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              >
                {roles.map(r => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Model */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Model *</label>
              <select
                value={formModelId}
                onChange={e => setFormModelId(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.model_identifier})
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">
                Priority Order (1 = Top) *
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={formPriority}
                onChange={e => setFormPriority(parseInt(e.target.value) || 1)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Provider Override */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Provider Override</label>
              <select
                value={formProviderId}
                onChange={e => setFormProviderId(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              >
                <option value="">(Use Model's Default Provider)</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Harness Override */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Harness Override</label>
              <select
                value={formHarnessId}
                onChange={e => setFormHarnessId(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              >
                <option value="">(Use Model's Default Harness)</option>
                {harnesses.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Invocation Mode */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Invocation Mode</label>
              <select
                value={formMode}
                onChange={e => setFormMode(e.target.value as ConfigBundle['invocation_mode'])}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              >
                <option value="stream">stream (Real-time SSE Chunking)</option>
                <option value="direct">direct (Single Round-Trip JSON)</option>
                <option value="fallback">fallback (Secondary Circuit Breaker Standby)</option>
                <option value="batch">batch (Asynchronous Queued Queue)</option>
              </select>
            </div>

            {/* Timeout MS */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Timeout (ms)</label>
              <input
                type="number"
                step={1000}
                value={formTimeout}
                onChange={e => setFormTimeout(parseInt(e.target.value) || 30000)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Valid From */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Valid From (Optional)</label>
              <input
                type="datetime-local"
                value={formValidFrom}
                onChange={e => setFormValidFrom(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>

            {/* Valid To */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">Valid To (Optional)</label>
              <input
                type="datetime-local"
                value={formValidTo}
                onChange={e => setFormValidTo(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>
          </div>

          {/* Active Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="bundleActiveCheck"
              checked={formIsActive}
              onChange={e => setFormIsActive(e.target.checked)}
              className="rounded border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--accent-color)] focus:ring-0"
            />
            <label htmlFor="bundleActiveCheck" className="text-xs text-[var(--text-primary)] font-semibold cursor-pointer">
              Bundle Active in Resolver Queue
            </label>
          </div>

          {/* Metadata JSON */}
          <div>
            <label className="block text-[var(--text-secondary)] font-medium mb-1 flex items-center justify-between">
              <span>Metadata JSON Object</span>
              <Code className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </label>
            <textarea
              rows={3}
              value={formMetadataJson}
              onChange={e => setFormMetadataJson(e.target.value)}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-2.5 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isEdit ? 'Update Bundle' : 'Create Bundle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
