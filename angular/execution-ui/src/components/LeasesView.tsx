import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Activity,
  Timer
} from 'lucide-react';
import { LeaseItem, LeaseLifecycleResponse, LifecycleState, NavTab } from '../types';
import { executionApi } from '../services/apiClient';

interface LeasesViewProps {
  onSelectLease: (id: string) => void;
  selectedLeaseId: string | null;
  onClearSelectedLease: () => void;
  onSelectRequest: (id: string) => void;
  setCurrentTab: (tab: NavTab) => void;
}

export const LeasesView: React.FC<LeasesViewProps> = ({
  onSelectLease,
  selectedLeaseId,
  onClearSelectedLease,
  onSelectRequest,
  setCurrentTab
}) => {
  const [leases, setLeases] = useState<LeaseItem[]>([]);
  const [staleLeases, setStaleLeases] = useState<LeaseItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showOnlyStale, setShowOnlyStale] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Lifecycle detail state
  const [lifecycle, setLifecycle] = useState<LeaseLifecycleResponse | null>(null);
  const [isLoadingLifecycle, setIsLoadingLifecycle] = useState(false);

  useEffect(() => {
    async function loadData() {
      const staleRes = await executionApi.getStaleLeases();
      setStaleLeases(staleRes);

      if (showOnlyStale) {
        let filtered = staleRes;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(l => l.id.toLowerCase().includes(q) || l.request_id.toLowerCase().includes(q) || l.executor_id.toLowerCase().includes(q));
        }
        setTotalCount(filtered.length);
        setLeases(filtered.slice(page * limit, (page + 1) * limit));
      } else {
        const data = await executionApi.listLeases({
          status: statusFilter || undefined,
          search: searchQuery || undefined,
          limit,
          offset: page * limit
        });
        setLeases(data.items);
        setTotalCount(data.total);
      }
    }

    loadData();
  }, [statusFilter, showOnlyStale, searchQuery, page]);

  // Load detailed lifecycle when selectedLeaseId changes
  useEffect(() => {
    if (!selectedLeaseId) {
      setLifecycle(null);
      return;
    }

    async function loadLifecycle() {
      setIsLoadingLifecycle(true);
      try {
        const res = await executionApi.getLeaseLifecycle(selectedLeaseId!);
        setLifecycle(res);
      } catch (err) {
        console.error('Failed loading lease lifecycle:', err);
      } finally {
        setIsLoadingLifecycle(false);
      }
    }

    loadLifecycle();
  }, [selectedLeaseId]);

  const getLifecyclePill = (state: LifecycleState) => {
    switch (state) {
      case 'live':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'released':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'stale_active':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse';
      case 'expired_unreleased':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="p-4 space-y-4 font-sans text-slate-200 overflow-y-auto max-w-7xl mx-auto">
      {/* Top Banner: Stale Active Leases Alert */}
      {staleLeases.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between gap-3 text-amber-300 font-mono text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>
              <strong>GET /api/execution/leases/stale:</strong> {staleLeases.length} ACTIVE leases have passed <code className="text-amber-200">expires_at</code> without being released.
            </span>
          </div>

          <button
            onClick={() => { setShowOnlyStale(!showOnlyStale); setPage(0); }}
            className={`px-2.5 py-1 rounded font-bold transition-colors ${
              showOnlyStale 
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
            }`}
          >
            {showOnlyStale ? 'Show All Leases' : `Filter Stale Only (${staleLeases.length})`}
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-mono text-xs shadow-md">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Filter by Lease ID, Request ID, or Executor..."
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setShowOnlyStale(false); setPage(0); }}
              disabled={showOnlyStale}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="RELEASED">RELEASED</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 text-slate-400 shrink-0">
          <span>Showing {leases.length} of {totalCount} leases</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2">{page + 1}/{totalPages || 1}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Split Table & Inspector Layout */}
      <div className={`grid grid-cols-1 ${selectedLeaseId ? 'lg:grid-cols-12' : ''} gap-4`}>
        {/* Leases Data Table */}
        <div className={`${selectedLeaseId ? 'lg:col-span-5' : 'w-full'} bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md font-mono text-xs`}>
          <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              LEASES SCHEMA VIEW
            </span>
            <span className="text-[10px] text-slate-500">execution.leases</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
                  <th className="p-2.5">Lease ID</th>
                  <th className="p-2.5">Request ID</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Promised TTL</th>
                  <th className="p-2.5 text-right">Expires At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {leases.map(lease => {
                  const isSelected = selectedLeaseId === lease.id;
                  const isStale = lease.status === 'ACTIVE' && new Date(lease.expires_at).getTime() < Date.now();

                  return (
                    <tr
                      key={lease.id}
                      onClick={() => onSelectLease(lease.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-amber-500/15 text-slate-100 font-semibold border-l-2 border-l-amber-400' 
                          : isStale
                          ? 'bg-amber-500/10 text-amber-200'
                          : 'hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <td className="p-2.5 text-amber-400 font-bold font-mono truncate">{lease.id}</td>
                      <td className="p-2.5 text-blue-400 truncate max-w-[120px]">{lease.request_id}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${
                          isStale 
                            ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 font-bold animate-pulse'
                            : lease.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {isStale ? 'STALE ACTIVE' : lease.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-400">{lease.promised_ttl_seconds}s</td>
                      <td className="p-2.5 text-right text-slate-500 text-[10px]">
                        {new Date(lease.expires_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lease Lifecycle Inspector (/leases/{id}/lifecycle) */}
        {selectedLeaseId && (
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono space-y-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    Lease Lifecycle: <span className="text-amber-400">{selectedLeaseId}</span>
                  </h2>
                  <span className="text-[10px] text-slate-400">
                    GET /api/execution/leases/{selectedLeaseId}/lifecycle
                  </span>
                </div>
              </div>

              <button
                onClick={onClearSelectedLease}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs border border-slate-700"
              >
                Close Inspector
              </button>
            </div>

            {isLoadingLifecycle ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Clock className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                <p className="text-xs">Computing TTL & lifecycle state...</p>
              </div>
            ) : lifecycle ? (
              <div className="space-y-4 text-xs">
                {/* 1. Lifecycle State Badge Box */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400 font-bold">LIFECYCLE STATE</span>
                    <span className={`px-2.5 py-1 rounded text-xs font-bold border uppercase ${getLifecyclePill(lifecycle.lifecycle_state)}`}>
                      {lifecycle.lifecycle_state}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Target Request</span>
                      <button
                        onClick={() => onSelectRequest(lifecycle.request_id)}
                        className="text-blue-400 hover:underline font-bold flex items-center gap-1"
                      >
                        {lifecycle.request_id}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Executor ID</span>
                      <span className="text-slate-200 font-bold">{lifecycle.executor_id}</span>
                    </div>
                  </div>
                </div>

                {/* 2. TTL Comparison Visual Bar */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-2">
                  <span className="text-slate-400 font-bold block border-b border-slate-800 pb-1">
                    PROMISED VS ACTUAL TTL
                  </span>

                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Promised TTL</span>
                        <span className="font-bold text-amber-400">{lifecycle.promised_ttl_seconds}s</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded overflow-hidden">
                        <div className="bg-amber-400 h-full w-full" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Actual Duration Held</span>
                        <span className="font-bold text-emerald-400">
                          {lifecycle.actual_ttl_seconds ? `${lifecycle.actual_ttl_seconds}s` : 'Holding / Overdue'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded overflow-hidden">
                        <div 
                          className="bg-emerald-400 h-full"
                          style={{ width: `${Math.min(100, ((lifecycle.actual_ttl_seconds || 120) / lifecycle.promised_ttl_seconds) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Timeline Breakdown */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-2">
                  <span className="text-slate-400 font-bold block border-b border-slate-800 pb-1">
                    TIMELINE SEQUENCE
                  </span>

                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">acquired_at:</span>
                      <span>{new Date(lifecycle.acquired_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">expires_at:</span>
                      <span className="text-amber-300">{new Date(lifecycle.expires_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">released_at:</span>
                      <span>{lifecycle.released_at ? new Date(lifecycle.released_at).toLocaleString() : 'NULL (UNRELEASED)'}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800 pt-1">
                      <span className="text-slate-500">expiry_gap:</span>
                      <span className={`font-bold ${lifecycle.expiry_gap_seconds > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {lifecycle.expiry_gap_seconds > 0 ? `+${lifecycle.expiry_gap_seconds}s overdue` : `${lifecycle.expiry_gap_seconds}s remaining`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
