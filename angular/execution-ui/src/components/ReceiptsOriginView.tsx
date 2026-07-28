import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  ArrowRight,
  FileJson,
  Database,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ReceiptItem, PipelineOriginResponse, NavTab } from '../types';
import { executionApi } from '../services/apiClient';

interface ReceiptsOriginViewProps {
  onSelectRequest: (id: string) => void;
  setCurrentTab: (tab: NavTab) => void;
}

export const ReceiptsOriginView: React.FC<ReceiptsOriginViewProps> = ({
  onSelectRequest,
  setCurrentTab
}) => {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>('rcp_000001');
  const [eventFilter, setEventFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Origin differential state
  const [origin, setOrigin] = useState<PipelineOriginResponse | null>(null);
  const [isLoadingOrigin, setIsLoadingOrigin] = useState(false);

  useEffect(() => {
    async function loadReceipts() {
      const data = await executionApi.listReceipts({
        event_type: eventFilter || undefined,
        search: searchQuery || undefined,
        limit,
        offset: page * limit
      });
      setReceipts(data.items);
      setTotalCount(data.total);
    }
    loadReceipts();
  }, [eventFilter, searchQuery, page]);

  // Load pipeline origin differential
  useEffect(() => {
    if (!selectedReceiptId) {
      setOrigin(null);
      return;
    }

    async function loadOrigin() {
      setIsLoadingOrigin(true);
      try {
        const res = await executionApi.getPipelineOrigin(selectedReceiptId!);
        setOrigin(res);
      } catch (err) {
        console.error('Failed loading pipeline origin differential:', err);
      } finally {
        setIsLoadingOrigin(false);
      }
    }

    loadOrigin();
  }, [selectedReceiptId]);

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
              placeholder="Filter by Receipt ID, Request ID, or Attempt ID..."
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={eventFilter}
              onChange={e => { setEventFilter(e.target.value); setPage(0); }}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
            >
              <option value="">All Event Types</option>
              <option value="LEASE_ACQUIRED">LEASE_ACQUIRED</option>
              <option value="EXECUTION_START">EXECUTION_START</option>
              <option value="CHECKPOINT">CHECKPOINT</option>
              <option value="EXECUTION_COMPLETE">EXECUTION_COMPLETE</option>
              <option value="EXECUTION_FAILED">EXECUTION_FAILED</option>
              <option value="LEASE_RELEASED">LEASE_RELEASED</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 text-slate-400 shrink-0">
          <span>Showing {receipts.length} of {totalCount} receipts</span>
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

      {/* Main Split Layout: Receipts List vs Side-by-Side Lineage Seam Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono text-xs">
        {/* Receipts Table */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
          <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-purple-400" />
              RECEIPTS LOG BROWSER
            </span>
            <span className="text-[10px] text-slate-500">execution.receipts</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
                  <th className="p-2.5">Receipt ID</th>
                  <th className="p-2.5">Event Type</th>
                  <th className="p-2.5">Lineage Source</th>
                  <th className="p-2.5 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {receipts.map(rc => {
                  const isSelected = selectedReceiptId === rc.id;
                  return (
                    <tr
                      key={rc.id}
                      onClick={() => setSelectedReceiptId(rc.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-purple-500/15 text-slate-100 font-semibold border-l-2 border-l-purple-400' 
                          : 'hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <td className="p-2.5 text-purple-400 font-bold truncate">{rc.id}</td>
                      <td className="p-2.5 text-slate-300">{rc.event_type}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.2 rounded text-[10px] border ${
                          rc.lineage_source === 'vision.receipts'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {rc.lineage_source || 'native'}
                        </span>
                      </td>
                      <td className="p-2.5 text-right text-slate-500 text-[10px]">
                        {new Date(rc.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side-by-Side Origin Lineage Seam Matrix (/receipts/{id}/pipeline-origin) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-purple-400" />
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Lineage Origin Differential Seam: <span className="text-purple-400">{selectedReceiptId}</span>
                </h2>
                <span className="text-[10px] text-slate-400">
                  GET /api/execution/receipts/{selectedReceiptId}/pipeline-origin
                </span>
              </div>
            </div>
          </div>

          {isLoadingOrigin ? (
            <div className="py-12 text-center text-slate-400">
              Comparing execution.receipts vs vision.receipts...
            </div>
          ) : origin ? (
            <div className="space-y-4">
              {/* Relationship Badge */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded flex items-center justify-between">
                <span className="text-slate-400 font-bold">LINEAGE RELATIONSHIP</span>
                <span className={`px-2.5 py-1 rounded text-xs font-bold border uppercase ${
                  origin.relationship === 'backfilled_from_vision'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}>
                  {origin.relationship}
                </span>
              </div>

              {/* Side-by-Side Comparison Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. execution.receipts Record */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold border-b border-slate-800 pb-1">
                    <Database className="w-3.5 h-3.5" />
                    execution.receipts (Native)
                  </div>
                  <pre className="p-2 bg-slate-900 rounded text-[10px] text-emerald-300 overflow-x-auto">
                    {JSON.stringify(origin.execution_receipt, null, 2)}
                  </pre>
                </div>

                {/* 2. vision.receipts Record */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold border-b border-slate-800 pb-1">
                    <Database className="w-3.5 h-3.5" />
                    vision.receipts (Origin Seam)
                  </div>
                  {origin.vision_receipt ? (
                    <pre className="p-2 bg-slate-900 rounded text-[10px] text-purple-300 overflow-x-auto">
                      {JSON.stringify(origin.vision_receipt, null, 2)}
                    </pre>
                  ) : (
                    <div className="p-4 text-slate-500 text-center text-[11px]">
                      Native execution receipt — no backfill link in vision.receipts.
                    </div>
                  )}
                </div>
              </div>

              {/* Field Differential Matrix */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-2">
                <span className="text-slate-400 font-bold block border-b border-slate-800 pb-1">
                  FIELD MATCH DIFFERENTIAL MATRIX
                </span>

                <div className="space-y-1.5">
                  {origin.diff_fields.map(df => (
                    <div key={df.field} className="flex items-center justify-between text-[11px] p-1.5 bg-slate-900 rounded border border-slate-800">
                      <span className="text-slate-300 font-bold">{df.field}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">exec: {String(df.execution_value)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-slate-400">vis: {String(df.vision_value)}</span>
                        {df.matches ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
