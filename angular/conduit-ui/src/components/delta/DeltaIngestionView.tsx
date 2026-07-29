import React, { useState, useEffect } from 'react';
import { Zap, Play, CheckCircle2, AlertCircle, Database, Layers } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { DeltaStateSummary, DeltaIngestResponse } from '../../types/conduit';

export const DeltaIngestionView: React.FC = () => {
  const [deltaState, setDeltaState] = useState<DeltaStateSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastResponse, setLastResponse] = useState<DeltaIngestResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states for POST /delta
  const [deltaId, setDeltaId] = useState<string>(`delta-2026-07-25-${Math.floor(100 + Math.random() * 900)}`);
  const [batchId, setBatchId] = useState<string>('sync-cycle-42');
  const [planNum, setPlanNum] = useState<string>('plan_0053');
  const [receiptType, setReceiptType] = useState<string>('PLAN_CREATE');
  const [agentRole, setAgentRole] = useState<string>('planner');
  const [summaryText, setSummaryText] = useState<string>('Auth module specification validated and reduced into Kernel state');

  const fetchDeltaState = async () => {
    setLoading(true);
    try {
      const summary = await apiService.getDeltaState();
      setDeltaState(summary);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeltaState();
  }, []);

  const handleIngestDelta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setLastResponse(null);

    const payload = {
      delta_id: deltaId,
      batch_id: batchId,
      receipts: [
        {
          id: `RCP-${planNum.toUpperCase()}-${Date.now().toString().slice(-4)}`,
          plan_id: planNum,
          type: receiptType,
          agent_role: agentRole,
          created_at: new Date().toISOString(),
          ticket_id: `TCK-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          summary: summaryText,
          metadata_json: JSON.stringify({ batch: batchId, ingested_via: 'UI_Console' }),
          tokens_used: 1500,
        },
      ],
      affected_plans: [planNum],
      invalidated_plans: [],
    };

    try {
      const res = await apiService.postDelta(payload);
      setLastResponse(res);
      await fetchDeltaState();
      // Generate next delta ID
      setDeltaId(`delta-2026-07-25-${Math.floor(100 + Math.random() * 900)}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Delta ingestion failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      {/* Header Banner */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              1. Delta Ingestion Pipeline (<code className="text-blue-400">POST /delta</code>)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Receives KernelDelta JSON payloads, validates receipt hashes, and reduces deltas into immutable state line.
          </p>
        </div>

        <button
          onClick={fetchDeltaState}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded border border-zinc-700 transition-colors self-start md:self-auto"
        >
          Refresh Delta State
        </button>
      </div>

      {/* Delta State Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#141416] border border-zinc-800 p-3 rounded">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Version</div>
          <div className="text-xl font-mono font-bold text-blue-400">{deltaState?.version ?? '--'}</div>
        </div>
        <div className="bg-[#141416] border border-zinc-800 p-3 rounded">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Plans Tracked</div>
          <div className="text-xl font-mono font-bold text-white">{deltaState?.plan_count ?? '--'}</div>
        </div>
        <div className="bg-[#141416] border border-zinc-800 p-3 rounded">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Total Receipts</div>
          <div className="text-xl font-mono font-bold text-emerald-400">{deltaState?.receipt_count ?? '--'}</div>
        </div>
        <div className="bg-[#141416] border border-zinc-800 p-3 rounded">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Identities</div>
          <div className="text-xl font-mono font-bold text-cyan-400">{deltaState?.identity_count ?? '--'}</div>
        </div>
        <div className="bg-[#141416] border border-zinc-800 p-3 rounded">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Graph Edges</div>
          <div className="text-xl font-mono font-bold text-purple-400">{deltaState?.graph_edge_count ?? '--'}</div>
        </div>
        <div className="bg-[#141416] border border-zinc-800 p-3 rounded">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Lineage Events</div>
          <div className="text-xl font-mono font-bold text-amber-400">{deltaState?.lineage_event_count ?? '--'}</div>
        </div>
      </div>

      {/* Interactive Form & Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Interactive Ingestion Form */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            Ingest New KernelDelta Payload
          </h2>

          <form onSubmit={handleIngestDelta} className="space-y-4 text-xs font-mono">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">delta_id</label>
                <input
                  type="text"
                  value={deltaId}
                  onChange={(e) => setDeltaId(e.target.value)}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">batch_id</label>
                <input
                  type="text"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">plan_id</label>
                <input
                  type="text"
                  value={planNum}
                  onChange={(e) => setPlanNum(e.target.value)}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">type</label>
                <select
                  value={receiptType}
                  onChange={(e) => setReceiptType(e.target.value)}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="PROPOSED">PROPOSED</option>
                  <option value="PLANNING">PLANNING</option>
                  <option value="PLAN_CREATE">PLAN_CREATE</option>
                  <option value="IMPLEMENTATION">IMPLEMENTATION</option>
                  <option value="REVIEW_PASS">REVIEW_PASS</option>
                  <option value="BLOCK">BLOCK</option>
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">agent_role</label>
                <select
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="planner">planner</option>
                  <option value="builder">builder</option>
                  <option value="reviewer">reviewer</option>
                  <option value="kernel">kernel</option>
                  <option value="executor">executor</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">summary</label>
              <textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                rows={2}
                className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Zap className="w-4 h-4" />
              <span>{submitting ? 'Reducing Delta...' : 'POST /delta (Submit Delta Ingestion)'}</span>
            </button>
          </form>
        </div>

        {/* Right: Response Inspection Console */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4 font-mono">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Kernel Reduction Output Log
          </h2>

          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {lastResponse ? (
            <div className="p-3 bg-[#0c0c0e] border border-zinc-800 rounded text-xs space-y-2">
              <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-zinc-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Delta Reduced Successfully (HTTP 200)
                </span>
                <span>Version: v{lastResponse.version}</span>
              </div>
              <pre className="text-zinc-300 text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed pt-1">
                {JSON.stringify(lastResponse, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="p-8 border border-dashed border-zinc-800 rounded text-center text-zinc-500 text-xs">
              Submit a KernelDelta payload using the form to execute reduction pipeline (persist → reduce → lineage → snapshot).
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
