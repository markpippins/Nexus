import React, { useState, useEffect } from 'react';
import { System, Service } from '../../types';
import { registryApi } from '../../lib/api';
import {
  Layers,
  Plus,
  Link,
  Edit2,
  Trash2,
  ChevronRight,
  ShieldCheck,
  Check
} from 'lucide-react';

interface SystemsTableProps {
  onSelectSystem: (system: System) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (system: System) => void;
  onOpenLinkModal: (system: System) => void;
  searchQuery: string;
  refreshTrigger: number;
}

export const SystemsTable: React.FC<SystemsTableProps> = ({
  onSelectSystem,
  onOpenCreateModal,
  onOpenEditModal,
  onOpenLinkModal,
  searchQuery,
  refreshTrigger
}) => {
  const [systems, setSystems] = useState<System[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const response = await registryApi.getSystems({ search: searchQuery });
        if (isMounted) setSystems(response.data);
      } catch (err) {
        console.error('Failed loading systems:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [searchQuery, refreshTrigger]);

  const handleDeleteSystem = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete system architecture platform "${name}"?`)) return;
    try {
      await registryApi.deleteSystem(id);
      setSystems(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">System Architectures & Platform Domains</h3>
          <p className="text-xs text-[var(--text-secondary)]">Manage system platform boundaries and link registered services.</p>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New System Domain</span>
        </button>
      </div>

      {/* Grid Cards of Systems */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {systems.map((system) => (
          <div
            key={system.id}
            onClick={() => onSelectSystem(system)}
            className="group cursor-pointer rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm transition-all hover:border-sky-500/50 hover:bg-[var(--bg-card-hover)]"
          >
            <div className="flex items-start justify-between gap-2 border-b border-[var(--border-color)]/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-sky-400 transition-colors">
                    {system.name}
                  </h4>
                  <p className="text-[10px] text-[var(--text-secondary)]">Owner: {system.owner}</p>
                </div>
              </div>

              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                {system.tier}
              </span>
            </div>

            <p className="mt-3 text-xs text-[var(--text-secondary)] line-clamp-2">
              {system.description}
            </p>

            {/* Linked Services Tags */}
            <div className="mt-4 pt-3 border-t border-[var(--border-color)]/60">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mb-2">
                <span className="font-semibold">Linked Services ({system.services?.length || 0})</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLinkModal(system);
                  }}
                  className="flex items-center gap-1 text-sky-400 hover:underline font-bold"
                >
                  <Link className="h-3 w-3" />
                  <span>Link Service</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {system.services && system.services.length > 0 ? (
                  system.services.map((svcName) => (
                    <span
                      key={svcName}
                      className="rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 font-mono text-[10px] text-sky-300"
                    >
                      {svcName}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-[var(--text-secondary)] italic">No services linked yet.</span>
                )}
              </div>
            </div>

            {/* Card Action footer */}
            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)]/60 pt-2 text-xs">
              <span className="text-[10px] text-[var(--text-secondary)]">Environment: {system.environment}</span>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onOpenEditModal(system)}
                  className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
                  title="Edit System"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleDeleteSystem(e, system.id, system.name)}
                  className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                  title="Delete System"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
