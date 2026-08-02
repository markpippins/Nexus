import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Cpu,
  Clock,
  Search,
  Filter,
  Calendar
} from 'lucide-react';
import { ConfigBundle, AIModel, Provider, Harness, SystemRole } from '../types';
import { BundleModal } from './BundleModal';

interface BundlesTabProps {
  bundles: ConfigBundle[];
  models: AIModel[];
  providers: Provider[];
  harnesses: Harness[];
  roles: SystemRole[];
  onSaveBundle: (bundle: Partial<ConfigBundle>) => Promise<void>;
  onDeleteBundle: (id: string) => Promise<void>;
  onReorderPriority: (role: string, bundleId: string, direction: 'up' | 'down') => Promise<void>;
}

export const BundlesTab: React.FC<BundlesTabProps> = ({
  bundles,
  models,
  providers,
  harnesses,
  roles,
  onSaveBundle,
  onDeleteBundle,
  onReorderPriority
}) => {
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingBundle, setEditingBundle] = useState<Partial<ConfigBundle> | null>(null);
  // Bumped on every open so the shared modal remounts with fresh form state.
  const [modalKey, setModalKey] = useState<number>(0);
  // Role default for the create modal when opened from the header/filter bar.
  const [createDefaultRole, setCreateDefaultRole] = useState<string | undefined>(undefined);

  const openCreateModal = (roleDefault?: string) => {
    setEditingBundle(null);
    setCreateDefaultRole(roleDefault);
    setModalKey(k => k + 1);
    setIsModalOpen(true);
  };

  const openEditModal = (bundle: ConfigBundle) => {
    setEditingBundle(bundle);
    setCreateDefaultRole(undefined);
    setModalKey(k => k + 1);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (bundle: ConfigBundle) => {
    try {
      await onSaveBundle({
        ...bundle,
        is_active: !bundle.is_active
      });
    } catch (err) {
      alert(`Error saving bundle: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReorder = async (role: string, bundleId: string, direction: 'up' | 'down') => {
    try {
      await onReorderPriority(role, bundleId, direction);
    } catch (err) {
      alert(`Error reordering bundles: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Filter logic
  const filteredBundles = bundles.filter(b => {
    if (selectedRoleFilter !== 'all' && b.role !== selectedRoleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        b.role.toLowerCase().includes(q) ||
        b.model_id.toLowerCase().includes(q) ||
        b.invocation_mode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by role for structured view
  const groupedRoles = selectedRoleFilter === 'all'
    ? Array.from(new Set(bundles.map(b => b.role)))
    : [selectedRoleFilter];

  return (
    <div className="space-y-6">
      {/* Top Filter & Action Bar */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search bundles, models, roles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={selectedRoleFilter}
              onChange={e => setSelectedRoleFilter(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-color)]"
            >
              <option value="all">All System Roles ({bundles.length} bundles)</option>
              {roles.map(r => (
                <option key={r.id} value={r.name}>
                  Role: {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={() => openCreateModal(selectedRoleFilter !== 'all' ? selectedRoleFilter : undefined)}
          className="w-full md:w-auto px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Config Bundle</span>
        </button>
      </div>

      {/* Role Grouped Bundles Stack */}
      <div className="space-y-6">
        {groupedRoles.map(roleName => {
          const roleBundles = filteredBundles
            .filter(b => b.role === roleName)
            .sort((a, b) => a.priority - b.priority);

          if (roleBundles.length === 0 && selectedRoleFilter !== 'all') {
            return (
              <div key={roleName} className="p-8 text-center bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] text-xs text-[var(--text-muted)]">
                No bundles found for role '{roleName}'.
              </div>
            );
          }

          if (roleBundles.length === 0) return null;

          return (
            <div key={roleName} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
              {/* Role Header */}
              <div className="bg-[var(--bg-tertiary)] px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-[var(--accent-color)]">
                    Role: {roleName}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    {roleBundles.length} registered bundles
                  </span>
                </div>

                <button
                  onClick={() => openCreateModal(roleName)}
                  className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  <span>Add bundle for {roleName}</span>
                </button>
              </div>

              {/* Bundles Table */}
              <div className="divide-y divide-[var(--border-subtle)]">
                {roleBundles.map((bundle, idx) => {
                  const modelObj = models.find(m => m.id === bundle.model_id);
                  const providerObj = providers.find(p => p.id === (bundle.provider_id || modelObj?.provider_id));
                  const harnessObj = harnesses.find(h => h.id === (bundle.harness_id || modelObj?.harness_id));

                  return (
                    <div
                      key={bundle.id}
                      className={`p-4 transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                        bundle.is_active ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-secondary)] opacity-60'
                      }`}
                    >
                      {/* Priority + Name + Status */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Priority Badge */}
                        <div className="flex flex-col items-center justify-center shrink-0">
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold border ${
                              idx === 0 && bundle.is_active
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)]'
                            }`}
                          >
                            #{bundle.priority}
                          </span>
                          <div className="flex items-center gap-0.5 mt-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => handleReorder(roleName, bundle.id, 'up')}
                              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 cursor-pointer"
                              title="Increase priority"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              disabled={idx === roleBundles.length - 1}
                              onClick={() => handleReorder(roleName, bundle.id, 'down')}
                              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 cursor-pointer"
                              title="Decrease priority"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Title & Details */}
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-[var(--text-primary)]">
                              {bundle.name}
                            </span>

                            {/* Mode Pill */}
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${
                                bundle.invocation_mode === 'stream'
                                  ? 'bg-cyan-950/50 text-cyan-300 border-cyan-800/40'
                                  : bundle.invocation_mode === 'fallback'
                                  ? 'bg-amber-950/50 text-amber-300 border-amber-800/40'
                                  : 'bg-indigo-950/50 text-indigo-300 border-indigo-800/40'
                              }`}
                            >
                              {bundle.invocation_mode}
                            </span>

                            {/* Active Toggle Switch */}
                            <button
                              onClick={() => handleToggleActive(bundle)}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold cursor-pointer transition ${
                                bundle.is_active
                                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {bundle.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </button>
                          </div>

                          <div className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-3 flex-wrap">
                            <span className="flex items-center gap-1 text-[var(--text-primary)] font-semibold">
                              <Cpu className="w-3 h-3 text-[var(--accent-color)]" />
                              {modelObj?.name || bundle.model_id}
                            </span>
                            <span>•</span>
                            <span>Provider: {providerObj?.name || 'Default'}</span>
                            <span>•</span>
                            <span>Harness: {harnessObj?.name || 'Standard'}</span>
                          </div>

                          {(bundle.valid_from || bundle.valid_to) && (
                            <div className="text-[11px] text-[var(--text-muted)] font-mono flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                Valid: {bundle.valid_from ? new Date(bundle.valid_from).toLocaleDateString() : 'Now'} →{' '}
                                {bundle.valid_to ? new Date(bundle.valid_to).toLocaleDateString() : 'Forever'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right metadata + actions */}
                      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                        <div className="text-right font-mono text-[11px] text-[var(--text-muted)] hidden sm:block">
                          <div className="flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            <span>{bundle.timeout_ms || 30000}ms</span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {Object.keys(bundle.metadata || {}).length} meta keys
                          </div>
                        </div>

                        <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] p-1 rounded-lg border border-[var(--border-subtle)]">
                          <button
                            onClick={() => openEditModal(bundle)}
                            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition cursor-pointer"
                            title="Edit Bundle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Delete config bundle '${bundle.name}'?`)) {
                                try {
                                  await onDeleteBundle(bundle.id);
                                } catch (err) {
                                  alert(`Error deleting bundle: ${err instanceof Error ? err.message : String(err)}`);
                                }
                              }
                            }}
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded transition cursor-pointer"
                            title="Delete Bundle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Modal Dialog — shared with the AI Registry view */}
      {isModalOpen && (
        <BundleModal
          key={modalKey}
          initial={editingBundle}
          defaultRole={createDefaultRole}
          onClose={() => setIsModalOpen(false)}
          models={models}
          providers={providers}
          harnesses={harnesses}
          roles={roles}
          onSaveBundle={onSaveBundle}
        />
      )}
    </div>
  );
};
