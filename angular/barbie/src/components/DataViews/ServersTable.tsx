import React, { useState, useEffect } from 'react';
import { Server, HealthStatus } from '../../types';
import { registryApi } from '../../lib/api';
import {
  Server as ServerIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Cpu,
  HardDrive
} from 'lucide-react';

interface ServersTableProps {
  onSelectServer: (server: Server) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (server: Server) => void;
  searchQuery: string;
  refreshTrigger: number;
}

export const ServersTable: React.FC<ServersTableProps> = ({
  onSelectServer,
  onOpenCreateModal,
  onOpenEditModal,
  searchQuery,
  refreshTrigger
}) => {
  const [servers, setServers] = useState<Server[]>([]);
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
        const response = await registryApi.getServers({
          page,
          size,
          search: searchQuery,
          status: statusFilter,
          environment: envFilter
        });

        if (isMounted) {
          setServers(response.data);
          setTotalItems(response.meta.totalItems);
          setTotalPages(response.meta.totalPages);
        }
      } catch (err) {
        console.error('Failed fetching servers table:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [page, size, searchQuery, statusFilter, envFilter, refreshTrigger]);

  const handleDeleteServer = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete server node "${name}"?`)) return;
    try {
      await registryApi.deleteServer(id);
      setServers(prev => prev.filter(s => s.id !== id));
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
            <option value="offline">Offline</option>
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
          <span>New Server</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-xs text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3">Server Name & IP</th>
              <th className="p-3">Status</th>
              <th className="p-3">Server Type</th>
              <th className="p-3">Datacenter Region</th>
              <th className="p-3">CPU Pressure</th>
              <th className="p-3">Memory Allocated</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading server nodes...
                </td>
              </tr>
            ) : servers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  No servers match current criteria.
                </td>
              </tr>
            ) : (
              servers.map((srv) => (
                <tr
                  key={srv.id}
                  onClick={() => onSelectServer(srv)}
                  className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ServerIcon className="h-4 w-4 text-purple-400" />
                      <div>
                        <span className="font-mono font-bold text-[var(--text-primary)]">{srv.name}</span>
                        <p className="text-[10px] font-mono text-[var(--text-secondary)]">{srv.ipAddress}</p>
                      </div>
                    </div>
                  </td>

                  <td className="p-3">{getStatusBadge(srv.status)}</td>

                  <td className="p-3">
                    <span className="font-medium text-[var(--text-primary)]">{srv.serverType}</span>
                  </td>

                  <td className="p-3">
                    <span className="text-[var(--text-secondary)]">{srv.datacenterRegion}</span>
                  </td>

                  <td className="p-3 w-36">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] w-8">{srv.cpuUsage}%</span>
                      <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${
                            srv.cpuUsage > 80 ? 'bg-rose-500' : srv.cpuUsage > 60 ? 'bg-amber-500' : 'bg-sky-400'
                          }`}
                          style={{ width: `${srv.cpuUsage}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="p-3 w-36">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] w-8">{srv.memoryUsage}%</span>
                      <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${
                            srv.memoryUsage > 80 ? 'bg-rose-500' : srv.memoryUsage > 60 ? 'bg-amber-500' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${srv.memoryUsage}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenEditModal(srv)}
                        className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
                        title="Edit Server"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteServer(e, srv.id, srv.name)}
                        className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                        title="Delete Server"
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
        <div>Total Servers: {totalItems}</div>
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
