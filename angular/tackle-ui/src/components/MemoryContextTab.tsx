import React, { useState, useEffect } from 'react';
import {
  Terminal,
  RefreshCw,
  Clock,
  ShieldAlert,
  CheckCircle2,
  List,
  Sparkles,
  Database,
  ArrowRight
} from 'lucide-react';
import { ProcedureCard, SystemRole } from '../types';

interface MemoryContextTabProps {
  roles: SystemRole[];
  onRefreshMemory: () => void;
  isRefreshingMemory: boolean;
}

export const MemoryContextTab: React.FC<MemoryContextTabProps> = ({
  roles,
  onRefreshMemory,
  isRefreshingMemory
}) => {
  const [selectedRole, setSelectedRole] = useState<string>(roles[0]?.name || 'operator');
  const [procedures, setProcedures] = useState<ProcedureCard[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeCard, setActiveCard] = useState<ProcedureCard | null>(null);
  const [stalenessResult, setStalenessResult] = useState<any>(null);

  useEffect(() => {
    fetchProcedures(selectedRole);
  }, [selectedRole]);

  const fetchProcedures = async (roleName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/memory/procedures/${roleName}`);
      if (res.ok) {
        const data = await res.json();
        setProcedures(data.procedures || []);
      } else {
        setProcedures([]);
      }
    } catch (e) {
      setProcedures([]);
    } finally {
      setLoading(false);
    }
  };

  const checkStaleness = async () => {
    try {
      const res = await fetch('/memory/check-since', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          since: new Date(Date.now() - 3600000).toISOString()
        })
      });
      const data = await res.json();
      setStalenessResult(data);
    } catch (e) {
      setStalenessResult({ changed: false, error: 'Check failed' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-[var(--accent-color)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Role Memory Procedure Registry Reader
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Reads `mem:*` Redis namespace cached from canonical PostgreSQL database via `role-memory-srv` (:3500).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={checkStaleness}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Check Staleness (1h)</span>
          </button>

          <button
            onClick={onRefreshMemory}
            disabled={isRefreshingMemory}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMemory ? 'animate-spin' : ''}`} />
            <span>Proxy POST /memory/refresh</span>
          </button>
        </div>
      </div>

      {/* Staleness Banner if clicked */}
      {stalenessResult && (
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-xs flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>
              Role '{selectedRole}' Redis Sync Check: {stalenessResult.changed ? 'UPDATES DETECTED IN PG' : 'CACHE IS FRESH & WARM'}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            As of: {new Date(stalenessResult.latest_as_of || '').toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Role Picker Tabs */}
      <div className="flex space-x-2 border-b border-[var(--border-color)] pb-3 overflow-x-auto">
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => setSelectedRole(r.name)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
              selectedRole === r.name
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Procedure Cards Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[var(--text-muted)] animate-pulse font-mono">
          Fetching cached ProcedureCard entries from Redis memory layer...
        </div>
      ) : procedures.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {procedures.map((card, idx) => (
            <div
              key={idx}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4 shadow-sm hover:border-[var(--accent-color)] transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] font-bold border border-[var(--border-subtle)]">
                    {card.category}
                  </span>
                  <h3 className="font-bold text-sm text-[var(--text-primary)] mt-1">{card.title}</h3>
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                    Slug: {card.slug}
                  </span>
                </div>

                <div className="text-right text-[10px] font-mono text-[var(--text-muted)]">
                  <span>Owner: {card.owner || 'infra'}</span>
                </div>
              </div>

              {/* Steps checklist */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] flex items-center gap-1">
                  <List className="w-3 h-3 text-[var(--accent-color)]" />
                  <span>Procedure Steps ({card.steps.length})</span>
                </span>
                <div className="space-y-1 bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                  {card.steps.map((step, sIdx) => (
                    <div key={sIdx} className="flex items-start gap-2">
                      <span className="font-mono text-[10px] text-[var(--accent-color)] font-bold mt-0.5">
                        {sIdx + 1}.
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recovery Action */}
              {card.recovery_action && (
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <strong className="block text-[10px] text-amber-400">Recovery Trigger:</strong>
                    {card.recovery_action}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                <span>Cached in mem:proc:{selectedRole}</span>
                <span>{new Date(card.as_of_dt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-10 text-center bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-muted)] space-y-2">
          <div>No cached ProcedureCard entries found for role '{selectedRole}'.</div>
          <button
            onClick={onRefreshMemory}
            className="px-3 py-1 rounded bg-[var(--accent-color)] text-slate-950 font-bold"
          >
            Trigger Refresh
          </button>
        </div>
      )}
    </div>
  );
};
