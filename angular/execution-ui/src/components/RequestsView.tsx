import React, { useState, useEffect } from 'react';
import { 
  FileCode2, 
  Search, 
  Filter, 
  ExternalLink, 
  Clock, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Layers,
  FileJson
} from 'lucide-react';
import { RequestItem, RequestStatus, RequestStateResponse, RequestAttemptsTree, RequestLineageBuckets, NavTab } from '../types';
import { executionApi } from '../services/apiClient';

interface RequestsViewProps {
  onSelectRequest: (id: string) => void;
  selectedRequestId: string | null;
  onClearSelectedRequest: () => void;
  setCurrentTab: (tab: NavTab) => void;
}

export const RequestsView: React.FC<RequestsViewProps> = ({
  onSelectRequest,
  selectedRequestId,
  onClearSelectedRequest,
  setCurrentTab
}) => {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Detail State
  const [reqState, setReqState] = useState<RequestStateResponse | null>(null);
  const [attemptsTree, setAttemptsTree] = useState<RequestAttemptsTree | null>(null);
  const [lineageBuckets, setLineageBuckets] = useState<RequestLineageBuckets | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    async function loadRequests() {
      const data = await executionApi.listRequests({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        limit,
        offset: page * limit
      });
      setRequests(data.items);
      setTotalCount(data.total);
    }
    loadRequests();
  }, [statusFilter, searchQuery, page]);

  // Load detailed request state when selectedRequestId changes
  useEffect(() => {
    if (!selectedRequestId) {
      setReqState(null);
      setAttemptsTree(null);
      setLineageBuckets(null);
      return;
    }

    async function loadDetails() {
      setIsLoadingDetail(true);
      try {
        const [stateRes, treeRes, lineageRes] = await Promise.all([
          executionApi.getRequestState(selectedRequestId!),
          executionApi.getRequestAttemptsTree(selectedRequestId!),
          executionApi.getReceiptsLineage(selectedRequestId!)
        ]);
        setReqState(stateRes);
        setAttemptsTree(treeRes);
        setLineageBuckets(lineageRes);
      } catch (err) {
        console.error('Failed loading request state details:', err);
      } finally {
        setIsLoadingDetail(false);
      }
    }

    loadDetails();
  }, [selectedRequestId]);

  const getStatusPill = (status: RequestStatus) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'RUNNING':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40 animate-pulse';
      case 'READY':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40';
      case 'PENDING':
        return 'bg-slate-700/60 text-slate-300 border-slate-600';
      case 'FAILED':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'CANCELLED':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="p-4 space-y-4 font-sans text-slate-200 overflow-y-auto max-w-7xl mx-auto">
      {/* Top Filter & Search Bar */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-mono text-xs shadow-md">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Filter by Request ID, Executor ID, or Payload content..."
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="READY">READY</option>
              <option value="RUNNING">RUNNING</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 text-slate-400 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
          <span>Showing {requests.length} of {totalCount} requests</span>
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

      {/* Main Layout: Split Table vs Inspector Drawer */}
      <div className={`grid grid-cols-1 ${selectedRequestId ? 'lg:grid-cols-12' : ''} gap-4`}>
        {/* Requests High-Contrast Data Table */}
        <div className={`${selectedRequestId ? 'lg:col-span-5' : 'w-full'} bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md font-mono text-xs`}>
          <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <FileCode2 className="w-4 h-4 text-blue-400" />
              REQUESTS AGGREGATE ROOT VIEW
            </span>
            <span className="text-[10px] text-slate-500">execution.requests</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
                  <th className="p-2.5">Request ID</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Executor</th>
                  <th className="p-2.5">Task Kind</th>
                  <th className="p-2.5 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {requests.map(req => {
                  const isSelected = selectedRequestId === req.id;
                  return (
                    <tr
                      key={req.id}
                      onClick={() => onSelectRequest(req.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-500/15 text-slate-100 font-semibold border-l-2 border-l-blue-400' 
                          : 'hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <td className="p-2.5 text-blue-400 font-bold font-mono truncate">{req.id}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${getStatusPill(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-300 truncate max-w-[120px]">{req.executor_id}</td>
                      <td className="p-2.5 text-slate-400 truncate max-w-[140px]">
                        {req.payload?.task_kind || 'N/A'}
                      </td>
                      <td className="p-2.5 text-right text-slate-500 text-[10px]">
                        {new Date(req.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Request State Aggregate Root Detail Drawer (/requests/{id}/state) */}
        {selectedRequestId && (
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono space-y-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-blue-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    Request State Root: <span className="text-blue-400">{selectedRequestId}</span>
                  </h2>
                  <span className="text-[10px] text-slate-400">
                    GET /api/execution/requests/{selectedRequestId}/state
                  </span>
                </div>
              </div>

              <button
                onClick={onClearSelectedRequest}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs border border-slate-700"
              >
                Close Inspector
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Clock className="w-6 h-6 animate-spin mx-auto text-blue-400" />
                <p className="text-xs">Fetching lifecycle aggregate root...</p>
              </div>
            ) : reqState ? (
              <div className="space-y-4 text-xs">
                {/* 1. Request Primary Info Box */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400 font-bold">Aggregate State</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusPill(reqState.request.status)}`}>
                      {reqState.request.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Executor ID</span>
                      <span className="text-slate-200 font-bold">{reqState.request.executor_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Task Kind</span>
                      <span className="text-slate-200">{reqState.request.payload?.task_kind}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Created At</span>
                      <span className="text-slate-300">{new Date(reqState.request.created_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Updated At</span>
                      <span className="text-slate-300">{new Date(reqState.request.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Current Lease & Latest Attempt Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Current Lease Card */}
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-1.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        Current Lease
                      </span>
                      {reqState.lease ? (
                        <span className={`px-1.5 py-0.2 text-[10px] rounded border ${
                          reqState.lease.status === 'ACTIVE' 
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {reqState.lease.status}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">No Lease</span>
                      )}
                    </div>

                    {reqState.lease ? (
                      <div className="text-[11px] space-y-1 text-slate-300">
                        <div>ID: <span className="text-amber-300 font-bold">{reqState.lease.id}</span></div>
                        <div>Promised TTL: {reqState.lease.promised_ttl_seconds}s</div>
                        <div>Expires: {new Date(reqState.lease.expires_at).toLocaleTimeString()}</div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 pt-1">No lease currently assigned to request.</p>
                    )}
                  </div>

                  {/* Latest Attempt Card */}
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-1.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-bold flex items-center gap-1">
                        <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                        Latest Attempt
                      </span>
                      {reqState.latest_attempt ? (
                        <span className={`px-1.5 py-0.2 text-[10px] rounded border ${
                          reqState.latest_attempt.status === 'SUCCEEDED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : reqState.latest_attempt.status === 'RUNNING'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                            : 'bg-red-500/20 text-red-400 border-red-500/40'
                        }`}>
                          {reqState.latest_attempt.status}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">No Attempt</span>
                      )}
                    </div>

                    {reqState.latest_attempt ? (
                      <div className="text-[11px] space-y-1 text-slate-300">
                        <div>Attempt ID: <span className="text-emerald-300 font-bold">{reqState.latest_attempt.id}</span></div>
                        <div>Attempt #: {reqState.latest_attempt.attempt_number}</div>
                        <div>Started: {new Date(reqState.latest_attempt.started_at).toLocaleTimeString()}</div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 pt-1">No execution attempts started yet.</p>
                    )}
                  </div>
                </div>

                {/* 3. Receipts Lineage Buckets (/receipts/lineage) */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400 font-bold flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                      Receipts Lineage Buckets ({reqState.receipts.length} total)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                      <span className="text-slate-400 block text-[10px]">NATIVE</span>
                      <span className="text-emerald-400 font-bold">{lineageBuckets?.native.length ?? 0}</span>
                    </div>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                      <span className="text-slate-400 block text-[10px]">BACKFILLED (VISION)</span>
                      <span className="text-purple-400 font-bold">{lineageBuckets?.backfilled.length ?? 0}</span>
                    </div>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                      <span className="text-slate-400 block text-[10px]">UNKNOWN</span>
                      <span className="text-slate-500 font-bold">{lineageBuckets?.unknown.length ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Raw JSON Payload Inspector */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold">
                    <FileJson className="w-3.5 h-3.5 text-blue-400" />
                    REQUEST PAYLOAD & METADATA
                  </div>
                  <pre className="p-2 bg-slate-900 rounded text-[10px] text-blue-300 overflow-x-auto">
                    {JSON.stringify(reqState.request.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
