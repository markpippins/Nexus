import React, { useState, useEffect } from 'react';
import { Cpu, Activity, Clock, PlayCircle, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import { ExecutorFleetSummary, ExecutorFleetDetail, NavTab } from '../types';
import { executionApi } from '../services/apiClient';

interface ExecutorFleetViewProps {
  onSelectRequest: (id: string) => void;
  onSelectLease: (id: string) => void;
  setCurrentTab: (tab: NavTab) => void;
}

export const ExecutorFleetView: React.FC<ExecutorFleetViewProps> = ({
  onSelectRequest,
  onSelectLease,
  setCurrentTab
}) => {
  const [summaryList, setSummaryList] = useState<ExecutorFleetSummary[]>([]);
  const [selectedExecutorId, setSelectedExecutorId] = useState<string | null>('executor-gpu-us-east-01');
  const [executorDetail, setExecutorDetail] = useState<ExecutorFleetDetail | null>(null);

  useEffect(() => {
    async function loadFleet() {
      const summaries = await executionApi.getFleetByExecutor() as ExecutorFleetSummary[];
      setSummaryList(summaries);
    }
    loadFleet();
  }, []);

  useEffect(() => {
    if (!selectedExecutorId) return;
    async function loadDetail() {
      const detail = await executionApi.getFleetByExecutor(selectedExecutorId!) as ExecutorFleetDetail;
      setExecutorDetail(detail);
    }
    loadDetail();
  }, [selectedExecutorId]);

  return (
    <div className="p-4 space-y-4 font-sans text-slate-200 overflow-y-auto max-w-7xl mx-auto">
      {/* Executor Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 font-mono text-xs">
        {summaryList.map(executor => {
          const isSelected = selectedExecutorId === executor.executor_id;
          const isStale = executor.health_status === 'STALE_LEASES';

          return (
            <div
              key={executor.executor_id}
              onClick={() => setSelectedExecutorId(executor.executor_id)}
              className={`p-3.5 bg-slate-900 border rounded-lg transition-all cursor-pointer shadow-md ${
                isSelected
                  ? 'border-emerald-500/60 bg-slate-850 shadow-emerald-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-100 flex items-center gap-1.5 truncate">
                  <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
                  {executor.executor_id}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  isStale 
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                }`}>
                  {executor.health_status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                <div>
                  <span className="block text-slate-500 text-[10px]">Active Leases</span>
                  <span className="font-bold text-slate-200">{executor.active_leases_count}</span>
                </div>
                <div>
                  <span className="block text-slate-500 text-[10px]">In Progress</span>
                  <span className="font-bold text-emerald-400">{executor.in_progress_attempts_count}</span>
                </div>
                <div>
                  <span className="block text-slate-500 text-[10px]">Total Handled</span>
                  <span className="font-bold text-slate-200">{executor.total_requests_handled}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Executor Detail Inspector */}
      {executorDetail && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg font-mono space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-bold text-slate-100">
                  Executor Fleet Inspector: <span className="text-emerald-400">{executorDetail.summary.executor_id}</span>
                </h2>
                <span className="text-[10px] text-slate-400">
                  GET /api/execution/health/by-executor?executor_id={executorDetail.summary.executor_id}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400">
              Last heartbeat: {new Date(executorDetail.summary.last_heartbeat).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Active Leases List */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2">
              <span className="font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                Active Leases Held ({executorDetail.active_leases.length})
              </span>

              {executorDetail.active_leases.length === 0 ? (
                <p className="text-slate-500 text-[11px] py-4 text-center">No active leases currently held.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {executorDetail.active_leases.map(lease => (
                    <div
                      key={lease.id}
                      onClick={() => onSelectLease(lease.id)}
                      className="p-2 bg-slate-900 border border-slate-800 rounded hover:border-amber-500/50 cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="text-amber-400 font-bold">{lease.id}</div>
                        <div className="text-[10px] text-slate-500">Req: {lease.request_id}</div>
                      </div>
                      <span className="text-[10px] text-slate-400">TTL: {lease.promised_ttl_seconds}s</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* In-Progress Attempts List */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2">
              <span className="font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-1">
                <PlayCircle className="w-4 h-4 text-emerald-400" />
                In-Progress Execution Attempts ({executorDetail.in_progress_attempts.length})
              </span>

              {executorDetail.in_progress_attempts.length === 0 ? (
                <p className="text-slate-500 text-[11px] py-4 text-center">No attempts currently running.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {executorDetail.in_progress_attempts.map(att => (
                    <div
                      key={att.id}
                      onClick={() => onSelectRequest(att.request_id)}
                      className="p-2 bg-slate-900 border border-slate-800 rounded hover:border-emerald-500/50 cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="text-emerald-400 font-bold">{att.id}</div>
                        <div className="text-[10px] text-slate-500">Req: {att.request_id}</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Attempt #{att.attempt_number}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
