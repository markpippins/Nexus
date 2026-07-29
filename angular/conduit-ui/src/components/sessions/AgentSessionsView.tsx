import React, { useState, useEffect } from 'react';
import { Cpu, Skull, RefreshCw, Activity, AlertTriangle, Clock } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { KernelSession } from '../../types/conduit';

export const AgentSessionsView: React.FC = () => {
  const [sessions, setSessions] = useState<KernelSession[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'running' | 'stale'>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [costInput, setCostInput] = useState<string>('');

  const loadSessions = async () => {
    setLoading(true);
    try {
      if (filterMode === 'running') {
        const data = await apiService.getSessions(true);
        setSessions(data);
      } else if (filterMode === 'stale') {
        const data = await apiService.getStaleSessions();
        setSessions(data);
      } else {
        const data = await apiService.getSessions(false);
        setSessions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [filterMode]);

  const handleKillSession = async (sessId: string) => {
    if (!confirm(`Force kill session process ${sessId}?`)) return;
    try {
      await apiService.killSession(sessId);
      await loadSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCost = async (sessId: string) => {
    const val = parseFloat(costInput);
    if (isNaN(val)) return;
    try {
      await apiService.updateSessionCost(sessId, val);
      setEditingCostId(null);
      await loadSessions();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      {/* Header */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              5. Agent Sessions & Process PID Control (`/api/sessions`)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Monitor running agent PIDs, send heartbeats, adjust cost tracking, and force-kill stuck processes.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center bg-[#0c0c0e] rounded p-1 border border-zinc-800">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded transition-colors ${
                filterMode === 'all' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400'
              }`}
            >
              All Sessions
            </button>
            <button
              onClick={() => setFilterMode('running')}
              className={`px-3 py-1 rounded transition-colors ${
                filterMode === 'running' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400'
              }`}
            >
              Running Only
            </button>
            <button
              onClick={() => setFilterMode('stale')}
              className={`px-3 py-1 rounded transition-colors ${
                filterMode === 'stale' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400'
              }`}
            >
              Stale Only
            </button>
          </div>

          <button
            onClick={loadSessions}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0c0c0e] text-zinc-400 uppercase border-b border-zinc-800 text-[11px]">
              <th className="py-2.5 px-4">Session ID / PID</th>
              <th className="py-2.5 px-4">Role & Detail</th>
              <th className="py-2.5 px-4">State</th>
              <th className="py-2.5 px-4">Cost (USD)</th>
              <th className="py-2.5 px-4">Started / Heartbeat</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {sessions.length > 0 ? (
              sessions.map((sess) => (
                <tr key={sess.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-blue-400">
                    <div>{sess.id}</div>
                    <div className="text-[10px] text-zinc-500 font-normal">PID: {sess.pid}</div>
                  </td>
                  <td className="py-3 px-4 max-w-sm">
                    <div className="font-bold text-zinc-200 capitalize">{sess.role}</div>
                    <div className="text-zinc-400 font-sans text-[11px] truncate">{sess.detail}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                        sess.state === 'running'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                          : sess.state === 'stale'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                          : 'bg-rose-950/80 text-rose-300 border-rose-700'
                      }`}
                    >
                      {sess.state === 'running' && <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />}
                      {sess.state === 'stale' && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                      {sess.state === 'failed' && <Clock className="w-3 h-3 text-rose-400" />}
                      {sess.state}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {editingCostId === sess.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={costInput}
                          onChange={(e) => setCostInput(e.target.value)}
                          className="w-16 bg-[#0c0c0e] border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200"
                        />
                        <button
                          onClick={() => handleUpdateCost(sess.id)}
                          className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px]"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingCostId(sess.id);
                          setCostInput(sess.cost_usd.toString());
                        }}
                        className="cursor-pointer hover:text-blue-400 transition-colors font-bold text-emerald-400"
                        title="Click to update cost via PATCH /api/sessions/:id/cost"
                      >
                        ${sess.cost_usd.toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[10px] text-zinc-500">
                    <div>Start: {new Date(sess.started_at).toLocaleTimeString()}</div>
                    <div>Beat: {new Date(sess.last_heartbeat).toLocaleTimeString()}</div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {sess.state === 'running' && (
                      <button
                        onClick={() => handleKillSession(sess.id)}
                        className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[11px] font-bold flex items-center gap-1 ml-auto transition-colors"
                      >
                        <Skull className="w-3.5 h-3.5" />
                        <span>Kill PID</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">
                  No sessions found for filter mode "{filterMode}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
