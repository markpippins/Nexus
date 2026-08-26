import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Server, Network, Boxes } from 'lucide-react';
import { registryApi, TerrainHealthSummary } from '../lib/api';

function statusColor(status: unknown): string {
  const s = String(status ?? '').toUpperCase();
  if (['ONLINE', 'ON', 'UP'].includes(s)) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (['DEGRADED'].includes(s)) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (['OFFLINE', 'DOWN'].includes(s)) return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

const Chip: React.FC<{ label: string; sub?: string; status?: unknown; icon?: React.ReactNode }> = ({
  label,
  sub,
  status,
  icon
}) => (
  <div className={`rounded-lg border px-2.5 py-1.5 ${statusColor(status)}`}>
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="truncate font-mono text-[11px] font-semibold">{label}</span>
    </div>
    <div className="mt-0.5 flex items-center justify-between text-[9px] opacity-80">
      <span className="truncate">{sub ?? ''}</span>
      <span className="font-bold">{String(status ?? '—')}</span>
    </div>
  </div>
);

/**
 * Terrain-backed infrastructure topology (barbie-parity #11).
 * Live layers from GET /api/v1/platform/health: host servers → runnable
 * services → MCP servers. Verified contract per D-BP-1.
 */
export const TerrainTopologyView: React.FC = () => {
  const [health, setHealth] = useState<TerrainHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await registryApi.getTerrainHealth());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-secondary)]">
          Infrastructure topology from the terrain registry — hosts, their runnable services and MCP
          front-doors, with live states.
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
          title="Re-check terrain"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          Re-check
        </button>
      </div>

      {!health ? (
        <p className="p-8 text-center text-xs text-[var(--text-secondary)]">Querying terrain…</p>
      ) : !health.terrainUp && health.serverItems.length === 0 ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-6 text-center text-xs text-rose-400">
          {health.terrainError ?? 'Terrain unreachable.'}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Layer 1 — Host servers */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              <Server className="h-3.5 w-3.5" /> Host Servers ({health.servers.online}/{health.servers.total} online)
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {health.serverItems.map((s: any, i) => (
                <Chip key={s.id ?? i} label={s.hostname ?? s.name ?? `host-${i}`} sub={s.ipAddress ?? s.os ?? ''} status={s.status} />
              ))}
            </div>
          </section>

          {/* Layer 2 — Runnable services */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              <Boxes className="h-3.5 w-3.5" /> Runnable Services ({health.services.online}/{health.services.total}{' '}
              online)
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {health.serviceItems.map((s: any, i) => (
                <Chip
                  key={s.id ?? i}
                  label={s.name ?? `svc-${i}`}
                  sub={s.port ? `:${s.port}` : s.version ?? ''}
                  status={s.liveStatus ?? s.status}
                />
              ))}
            </div>
          </section>

          {/* Layer 3 — MCP servers */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              <Network className="h-3.5 w-3.5" /> MCP Servers ({health.mcp.online}/{health.mcp.total} online)
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {health.mcpItems.map((m: any, i) => (
                <Chip
                  key={m.id ?? i}
                  label={m.name ?? `mcp-${i}`}
                  sub={m.port ? `:${m.port}` : m.transportType ?? ''}
                  status={m.liveStatus ?? m.status}
                />
              ))}
            </div>
          </section>

          <p className="text-right text-[10px] text-[var(--text-secondary)] opacity-60">
            checked {new Date(health.loadedAt).toLocaleTimeString()}
            {health.terrainError ? ` · ${health.terrainError}` : ''}
          </p>
        </div>
      )}
    </div>
  );
};
