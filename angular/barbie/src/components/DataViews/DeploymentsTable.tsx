import React, { useState, useEffect } from 'react';
import { Deployment, HealthStatus } from '../../types';
import { registryApi } from '../../lib/api';
import {
  GitCommit,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Edit2,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface DeploymentsTableProps {
  onSelectDeployment: (deployment: Deployment) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (deployment: Deployment) => void;
  searchQuery: string;
  refreshTrigger: number;
}

export const DeploymentsTable: React.FC<DeploymentsTableProps> = ({
  onSelectDeployment,
  onOpenCreateModal,
  onOpenEditModal,
  searchQuery,
  refreshTrigger
}) => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const response = await registryApi.getDeployments({
          page,
          size,
          search: searchQuery,
          status: statusFilter,
          environment: envFilter
        });

        if (isMounted) {
          setDeployments(response.data);
          setTotalItems(response.meta.totalItems);
          setTotalPages(response.meta.totalPages);
        }
      } catch (err) {
        console.error('Failed fetching deployments:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [page, size, searchQuery, statusFilter, envFilter, refreshTrigger]);

  const handleDeleteDeployment = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete deployment record "${id}"?`)) return;
    try {
      await registryApi.deleteDeployment(id);
      setDeployments(prev => prev.filter(d => d.id !== id));
      setTotalItems(prev => prev - 1);
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const getStatusBadge = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Healthy
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Degraded
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            Critical
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Offline
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
            <Filter className="h-3.5 w-3.5 text-sky-400" />
            <span>Filters:</span>
          </span>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={envFilter}
            onChange={(e) => { setEnvFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="all">All Environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Deployment</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-xs text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3">Deployment Target</th>
              <th className="p-3">Status</th>
              <th className="p-3">Environment</th>
              <th className="p-3">Replicas Ready</th>
              <th className="p-3">Git Commit</th>
              <th className="p-3">Deployed By & Date</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading active deployment rollouts...
                </td>
              </tr>
            ) : deployments.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  No deployment rollouts match filters.
                </td>
              </tr>
            ) : (
              deployments.map((dep) => (
                <tr
                  key={dep.id}
                  onClick={() => onSelectDeployment(dep)}
                  className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <td className="p-3">
                    <div>
                      <span className="font-mono font-bold text-sky-400">{dep.serviceName}</span>
                      <p className="text-[10px] text-[var(--text-secondary)]">Cluster: {dep.clusterName}</p>
                    </div>
                  </td>

                  <td className="p-3">{getStatusBadge(dep.status)}</td>

                  <td className="p-3">
                    <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                      {dep.environment}
                    </span>
                  </td>

                  <td className="p-3 font-mono font-bold">
                    <span className={dep.replicasReady === dep.replicasTarget ? 'text-emerald-400' : 'text-amber-400'}>
                      {dep.replicasReady}
                    </span>
                    <span className="text-[var(--text-secondary)]"> / {dep.replicasTarget}</span>
                  </td>

                  <td className="p-3">
                    <span className="flex items-center gap-1 font-mono text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 w-fit">
                      <GitCommit className="h-3 w-3" />
                      <span>{dep.commitHash}</span>
                    </span>
                  </td>

                  <td className="p-3">
                    <div>
                      <span className="text-[var(--text-primary)]">{dep.deployedBy}</span>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        {new Date(dep.deployedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </td>

                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenEditModal(dep)}
                        className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
                        title="Edit Deployment"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteDeployment(e, dep.id)}
                        className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                        title="Delete Deployment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)] px-1">
        <div>Total Deployments: {totalItems}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-color)] bg-[var(--bg-main)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 font-mono text-[var(--text-primary)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border-color)] bg-[var(--bg-main)] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
