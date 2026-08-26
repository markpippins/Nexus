import React, { useState, useEffect } from 'react';
import { Service, HealthStatus, Environment, EntitySelection } from '../../types';
import { registryApi } from '../../lib/api';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Heart,
  Edit2,
  Trash2,
  Radio,
  ExternalLink,
  Plus
} from 'lucide-react';

interface ServicesTableProps {
  onSelectService: (service: Service) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (service: Service) => void;
  searchQuery: string;
  selectedSystemFilter: string;
  refreshTrigger: number;
}

export const ServicesTable: React.FC<ServicesTableProps> = ({
  onSelectService,
  onOpenCreateModal,
  onOpenEditModal,
  searchQuery,
  selectedSystemFilter,
  refreshTrigger
}) => {
  const [services, setServices] = useState<Service[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Sorting & Filtering
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sub-modules browser (barbie-parity item #9)
  const [subModulesFor, setSubModulesFor] = useState<Service | null>(null);
  const [subModules, setSubModules] = useState<Array<Record<string, unknown>>>([]);
  const [subLoading, setSubLoading] = useState(false);

  const handleViewSubModules = async (e: React.MouseEvent, service: Service) => {
    e.stopPropagation();
    setSubModulesFor(service);
    setSubModules([]);
    setSubLoading(true);
    try {
      setSubModules(await registryApi.getServiceSubModules(service.id));
    } catch {
      setSubModules([]);
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const response = await registryApi.getServices({
          page,
          size,
          search: searchQuery,
          status: statusFilter,
          system: selectedSystemFilter === 'all' ? undefined : selectedSystemFilter,
          environment: envFilter,
          sortBy,
          sortOrder
        });

        if (isMounted) {
          setServices(response.data);
          setTotalItems(response.meta.totalItems);
          setTotalPages(response.meta.totalPages);
        }
      } catch (err) {
        console.error('Failed fetching services table:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [page, size, searchQuery, statusFilter, selectedSystemFilter, envFilter, sortBy, sortOrder, refreshTrigger]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleDeleteService = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete service "${name}" from registry?`)) return;
    try {
      await registryApi.deleteService(id);
      setServices(prev => prev.filter(s => s.id !== id));
      setTotalItems(prev => prev - 1);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleHeartbeat = async (e: React.MouseEvent, serviceName: string) => {
    e.stopPropagation();
    try {
      await registryApi.sendHeartbeat(serviceName);
      setServices(prev =>
        prev.map(s => (s.name === serviceName ? { ...s, status: 'healthy', lastHeartbeat: new Date().toISOString() } : s))
      );
    } catch (err: any) {
      alert(`Heartbeat error: ${err.message}`);
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 text-[var(--text-secondary)] opacity-50" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-sky-400" />
    ) : (
      <ArrowDown className="h-3 w-3 text-sky-400" />
    );
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
      
      {/* Table Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
            <Filter className="h-3.5 w-3.5 text-sky-400" />
            <span>Filters:</span>
          </span>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
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
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
          >
            <option value="all">All Environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-sky-500"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Service</span>
        </button>
      </div>

      {/* Main Data Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-sm text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3 cursor-pointer" onClick={() => handleSort('name')}>
                <div className="flex items-center gap-1">
                  <span>Service Name</span>
                  {renderSortIcon('name')}
                </div>
              </th>

              <th className="p-3 cursor-pointer" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  {renderSortIcon('status')}
                </div>
              </th>

              <th className="p-3 cursor-pointer" onClick={() => handleSort('systemName')}>
                <div className="flex items-center gap-1">
                  <span>System Platform</span>
                  {renderSortIcon('systemName')}
                </div>
              </th>

              <th className="p-3 cursor-pointer" onClick={() => handleSort('environment')}>
                <div className="flex items-center gap-1">
                  <span>Env</span>
                  {renderSortIcon('environment')}
                </div>
              </th>

              <th className="p-3 cursor-pointer" onClick={() => handleSort('rps')}>
                <div className="flex items-center gap-1">
                  <span>RPS</span>
                  {renderSortIcon('rps')}
                </div>
              </th>

              <th className="p-3 cursor-pointer" onClick={() => handleSort('latencyMs')}>
                <div className="flex items-center gap-1">
                  <span>Latency</span>
                  {renderSortIcon('latencyMs')}
                </div>
              </th>

              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading service registry data...
                </td>
              </tr>
            ) : services.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  No registered microservices match the selected filters.
                </td>
              </tr>
            ) : (
              services.map((service) => (
                <tr
                  key={service.id}
                  onClick={() => onSelectService(service)}
                  className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <td className="p-3">
                    <div>
                      <span className="font-mono font-bold text-sky-400">{service.name}</span>
                      <p className="text-[10px] text-[var(--text-secondary)]">{service.type} v{service.version}</p>
                    </div>
                  </td>

                  <td className="p-3">{getStatusBadge(service.status)}</td>

                  <td className="p-3">
                    <span className="font-medium text-[var(--text-primary)]">{service.systemName}</span>
                  </td>

                  <td className="p-3">
                    <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                      {service.environment}
                    </span>
                  </td>

                  <td className="p-3 font-mono">{service.rps} req/s</td>

                  <td className="p-3 font-mono">{service.latencyMs} ms</td>

                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleHeartbeat(e, service.name)}
                        className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10"
                        title="Send Heartbeat Ping"
                      >
                        <Heart className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => onOpenEditModal(service)}
                        className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
                        title="Edit Service"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={(e) => handleViewSubModules(e, service)}
                        className="rounded p-1 text-violet-400 hover:bg-violet-500/10"
                        title="Browse Sub-modules"
                      >
                        <Layers className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteService(e, service.id, service.name)}
                        className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                        title="Delete Service"
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

      {/* Pagination Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)] px-1">
        <div className="flex items-center gap-2">
          <span>Show</span>
          <select
            value={size}
            onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
            className="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-0.5 text-sm text-[var(--text-primary)]"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>entries per page (Total: {totalItems})</span>
        </div>

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

      {/* Sub-modules modal (barbie-parity #9) */}
      {subModulesFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSubModulesFor(null)}
        >
          <div
            className="w-[480px] max-w-[92vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Sub-modules — <span className="font-mono text-sky-400">{subModulesFor.name}</span>
              </h3>
              <button
                onClick={() => setSubModulesFor(null)}
                className="rounded p-1 text-[var(--text-secondary)] hover:bg-white/5"
                title="Close"
              >
                ✕
              </button>
            </div>
            {subLoading ? (
              <p className="p-6 text-center text-xs text-[var(--text-secondary)]">Loading sub-modules…</p>
            ) : subModules.length === 0 ? (
              <p className="p-6 text-center text-xs text-[var(--text-secondary)]">
                No sub-modules registered for this service.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-auto">
                {subModules.map((m, i) => {
                  const name = String(m.name ?? m.moduleName ?? m.id ?? `module-${i}`);
                  const version = m.version ? String(m.version) : null;
                  const status = m.status ? String(m.status) : null;
                  const up = !!status && ['active', 'healthy', 'running'].includes(status.toLowerCase());
                  return (
                    <li
                      key={name}
                      className="flex items-center justify-between rounded-lg border border-[var(--border-color)] px-3 py-2"
                    >
                      <span className="font-mono text-xs text-[var(--text-primary)]">{name}</span>
                      <span className="flex items-center gap-2">
                        {version && (
                          <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                            v{version}
                          </span>
                        )}
                        {status && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'
                            }`}
                          >
                            {status}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
