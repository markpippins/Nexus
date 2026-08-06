import React, { useState, useEffect, useRef } from 'react';
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

// The live backend stores procedures as markdown bodies in varying formats:
// numbered headings (`### 1. Heading`), plain numbered list lines
// (`1. **Step**`), or plain section headings (`### Section`). Parse in that
// order of preference so the checklist shows real content for every card.
const parseSteps = (bodyMd: unknown): string[] => {
  if (typeof bodyMd !== 'string' || !bodyMd) return [];
  const lines = bodyMd.split('\n').map(line => line.trim());
  const clean = (s: string) => s.replace(/\*\*/g, '').trim();

  const numberedHeadings = lines.filter(line => /^#{2,3}\s*\d+[.)]/.test(line));
  if (numberedHeadings.length > 0) {
    return numberedHeadings.map(line => clean(line.replace(/^#{2,3}\s*\d+[.)]\s*/, '')));
  }

  const numberedLines = lines.filter(line => /^\d+[.)]\s+\S/.test(line));
  if (numberedLines.length > 0) {
    return numberedLines.map(line => clean(line.replace(/^\d+[.)]\s*/, '')));
  }

  // `###`-only: an H2 is usually the document title (e.g. `## Conduit-MCP
  // Tool Reference`), which would render as a bogus first step. Numbered
  // `## N.` headings are already handled by the first tier above.
  const headings = lines.filter(line => /^###\s+/.test(line));
  if (headings.length > 0) {
    return headings.map(line => clean(line.replace(/^###\s*/, '')));
  }

  return [];
};

// Live backend returns PG-style timestamps ("2026-06-25 01:27:55.694433+00"
// with a space separator) which are not strict ISO — normalize before parsing.
const parseDate = (ts: unknown): Date | null => {
  if (typeof ts !== 'string' || !ts) return null;
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
};
const formatCardDate = (ts?: string): string => parseDate(ts)?.toLocaleDateString() ?? '—';
const formatCheckTime = (ts?: string): string => parseDate(ts)?.toLocaleTimeString() ?? 'just now';

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
  // Guards against stale responses overwriting the grid when the user
  // switches roles faster than the (parallelized) card fetches resolve.
  const fetchIdRef = useRef(0);

  useEffect(() => {
    fetchProcedures(selectedRole);
  }, [selectedRole]);

  const fetchProcedures = async (roleName: string) => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/memory/procedures/${roleName}`);
      if (!res.ok) {
        if (fetchId === fetchIdRef.current) setProcedures([]);
        return;
      }
      const data = await res.json();
      const index: { slug: string; summary: string; tags?: string[] }[] = data.procedures || [];
      // /memory/procedures/:role returns only the index (slug/summary/tags).
      // Hydrate each entry with its full ProcedureCard so we never render
      // index entries as full cards (which crashed on `card.steps.length`
      // when `steps` was undefined).
      const cards = await Promise.all(
        index.map(async (entry) => {
          const fallback = {
            role: roleName,
            slug: entry.slug,
            title: entry.slug,
            category: entry.tags?.[0] || 'procedure',
            summary: entry.summary,
            steps: [],
            as_of_dt: '',
            owner: 'infra'
          };
          try {
            const cardRes = await fetch(`/memory/procedure/${encodeURIComponent(entry.slug)}`);
            if (!cardRes.ok) throw new Error(`HTTP ${cardRes.status}`);
            const card = await cardRes.json();
            return {
              ...fallback,
              slug: card.slug || entry.slug,
              title: card.title || entry.slug,
              category: card.tags?.[0] || fallback.category,
              summary: card.summary || fallback.summary,
              steps: parseSteps(card.body_md),
              as_of_dt: card.updated_at || '',
              owner: card.roles?.[0] || fallback.owner
            };
          } catch {
            // Fall back to index data so one missing card never blanks the tab
            return fallback;
          }
        })
      );
      if (fetchId === fetchIdRef.current) setProcedures(cards);
    } catch (e) {
      if (fetchId === fetchIdRef.current) setProcedures([]);
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
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
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Reads `mem:*` Redis namespace cached from canonical PostgreSQL database via `role-memory-srv` (:3500).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={checkStaleness}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Check Staleness (1h)</span>
          </button>

          <button
            onClick={onRefreshMemory}
            disabled={isRefreshingMemory}
            className="px-4 py-1.5 rounded-lg text-sm font-bold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMemory ? 'animate-spin' : ''}`} />
            <span>Proxy POST /memory/refresh</span>
          </button>
        </div>
      </div>

      {/* Staleness Banner if clicked */}
      {stalenessResult && (
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-sm flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>
              Role '{selectedRole}' Redis Sync Check: {stalenessResult.changed ? 'UPDATES DETECTED IN PG' : 'CACHE IS FRESH & WARM'}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            As of: {formatCheckTime(stalenessResult.latest_as_of)}
          </span>
        </div>
      )}

      {/* Role Picker Tabs */}
      <div className="flex space-x-2 border-b border-[var(--border-color)] pb-3 overflow-x-auto">
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => setSelectedRole(r.name)}
            className={`px-3 py-1.5 rounded-lg text-sm font-mono font-bold transition cursor-pointer ${
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
        <div className="py-12 text-center text-sm text-[var(--text-muted)] animate-pulse font-mono">
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
                <div className="space-y-1 bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]">
                  {card.steps.length > 0 ? (
                    card.steps.map((step, sIdx) => (
                      <div key={sIdx} className="flex items-start gap-2">
                        <span className="font-mono text-[10px] text-[var(--accent-color)] font-bold mt-0.5">
                          {sIdx + 1}.
                        </span>
                        <span>{step}</span>
                      </div>
                    ))
                  ) : (
                    <p>{card.summary || 'No steps documented for this procedure.'}</p>
                  )}
                </div>
              </div>

              {/* Recovery Action */}
              {card.recovery_action && (
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 text-sm font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <strong className="block text-[10px] text-amber-400">Recovery Trigger:</strong>
                    {card.recovery_action}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                <span>Cached in mem:proc:{selectedRole}</span>
                <span>{formatCardDate(card.as_of_dt)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-10 text-center bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-muted)] space-y-2">
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
