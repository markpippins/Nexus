import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SonarProject,
  SonarMetricPoint,
  SonarRating,
} from '../../types';
import {
  SonarIssueRow,
  SonarHotspotRow,
  SonarListEnvelope,
  registryApi,
  GatewayUpstreamError,
} from '../../lib/api';
import {
  Gauge,
  Filter,
  ExternalLink,
  ShieldCheck,
  LineChart,
  Clock,
  WifiOff,
  Bug,
  Flame,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';

interface SonarQubeTableProps {
  searchQuery: string;
  refreshTrigger: number;
}

const ratingColors: Record<SonarRating, string> = {
  A: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30',
  B: 'text-lime-400 bg-lime-500/10 ring-lime-500/30',
  C: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  D: 'text-orange-400 bg-orange-500/10 ring-orange-500/30',
  E: 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
};

const severityColors: Record<string, string> = {
  BLOCKER: 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
  CRITICAL: 'text-orange-400 bg-orange-500/10 ring-orange-500/30',
  MAJOR: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  MINOR: 'text-sky-400 bg-sky-500/10 ring-sky-500/30',
  INFO: 'text-slate-400 bg-slate-500/10 ring-slate-500/30',
};

const probabilityColors: Record<string, string> = {
  HIGH: 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
  MEDIUM: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  LOW: 'text-sky-400 bg-sky-500/10 ring-sky-500/30',
  NORMAL: 'text-slate-400 bg-slate-500/10 ring-slate-500/30',
};

const severityRank: Record<string, number> = { BLOCKER: 4, CRITICAL: 3, MAJOR: 2, MINOR: 1, INFO: 0 };
const probabilityRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NORMAL: 0 };

function severityBadge(sev?: string | null) {
  const s = sev ?? 'INFO';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${severityColors[s] ?? severityColors.INFO}`}>
      {s}
    </span>
  );
}

function probabilityBadge(p?: string | null) {
  const v = p ?? 'NORMAL';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${probabilityColors[v] ?? probabilityColors.NORMAL}`}>
      {v}
    </span>
  );
}

function reviewBadge(reviewStatus?: string | null) {
  if (!reviewStatus) {
    return <span className="text-[10px] font-mono text-slate-500">—</span>;
  }
  const reviewed = reviewStatus !== 'to-review';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
        reviewed ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30' : 'text-amber-400 bg-amber-500/10 ring-amber-500/30'
      }`}
    >
      {reviewStatus}
    </span>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

type WriteAction = { label: string; value: string; cls: string };

function ActionButtons({
  busy,
  actions,
  onAction,
}: {
  busy: boolean;
  actions: WriteAction[];
  onAction: (value: string) => void;
}) {
  if (busy) return <span className="inline-block mt-1 text-[10px] text-[var(--text-secondary)] animate-pulse">saving…</span>;
  return (
    <span className="flex flex-wrap gap-1 mt-1">
      {actions.map((a) => (
        <button
          key={a.value}
          onClick={(e) => { e.stopPropagation(); onAction(a.value); }}
          title={`Write review decision back to SonarQube + local schema`}
          className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${a.cls}`}
        >
          {a.label}
        </button>
      ))}
    </span>
  );
}

type SonarMode = 'projects' | 'issues' | 'hotspots';

export const SonarQubeTable: React.FC<SonarQubeTableProps> = ({ searchQuery, refreshTrigger }) => {
  const [mode, setMode] = useState<SonarMode>('projects');

  return (
    <div className="space-y-4">
      {/* Mode tabs — SonarQube Quality covers live project metrics (gateway)
          plus the canonical issue/hotspot mirror (sonar-sync schema). */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1 w-fit">
        {([
          ['projects', 'Projects', Gauge],
          ['issues', 'Issues', Bug],
          ['hotspots', 'Security Hotspots', Flame],
        ] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === m ? 'bg-sky-500/15 text-sky-300' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-main)]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'projects' && <ProjectsView searchQuery={searchQuery} refreshTrigger={refreshTrigger} />}
      {mode === 'issues' && <IssuesView searchQuery={searchQuery} refreshTrigger={refreshTrigger} />}
      {mode === 'hotspots' && <HotspotsView searchQuery={searchQuery} refreshTrigger={refreshTrigger} />}
    </div>
  );
};

/* ── Projects (live metrics via ci-gateway) ───────────────────────── */
const ProjectsView: React.FC<{ searchQuery: string; refreshTrigger: number }> = ({
  searchQuery,
  refreshTrigger,
}) => {
  const [projects, setProjects] = useState<SonarProject[]>([]);
  const [metrics, setMetrics] = useState<Record<string, SonarMetricPoint[]>>({});
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gateFilter, setGateFilter] = useState<string>('all');
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const data = await registryApi.getSonarProjects({
          search: searchQuery,
          gate: gateFilter,
        });

        if (isMounted) {
          setUnavailable(null);
          setProjects(data);
          // Pre-fetch metric history for each project
          const metricMap: Record<string, SonarMetricPoint[]> = {};
          for (const proj of data) {
            try {
              const m = await registryApi.getSonarMetrics(proj.id);
              metricMap[proj.id] = m;
            } catch {
              metricMap[proj.id] = []; // per-project measures unavailable; keep project row
            }
          }
          setMetrics(metricMap);
        }
      } catch (err) {
        console.error('Failed fetching SonarQube projects:', err);
        if (isMounted) {
          setProjects([]);
          setMetrics({});
          if (err instanceof GatewayUpstreamError) {
            setUnavailable(err.upstream
              ? `SonarQube is unreachable (upstream: ${err.upstream}). The vanadium host may be offline.`
              : `SonarQube is unreachable. The CI gateway could not be reached.`);
          } else {
            setUnavailable('Failed to load SonarQube data.');
          }
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [searchQuery, gateFilter, refreshTrigger]);

  const getGateBadge = (gate: SonarProject['gate']) => {
    switch (gate) {
      case 'passed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            PASSED
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            NO GATE
          </span>
        );
    }
  };

  const getRatingBadge = (rating: SonarRating) => (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-1 ${ratingColors[rating]}`}>
      {rating}
    </span>
  );

  const CoverageBar = ({ value }: { value: number }) => {
    const color = value >= 80 ? 'bg-emerald-400' : value >= 60 ? 'bg-amber-400' : 'bg-rose-400';
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border-color)]">
          <div className={`h-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
        </div>
        <span className="font-mono text-xs text-[var(--text-secondary)]">{value.toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
            <Filter className="h-3.5 w-3.5 text-sky-400" />
            <span>Quality Gate:</span>
          </span>
          <select
            value={gateFilter}
            onChange={(e) => setGateFilter(e.target.value)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
          >
            <option value="all">All Projects</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="none">No Gate</option>
          </select>
        </div>

        <div className="text-xs text-[var(--text-secondary)] font-mono">
          {projects.length} project{projects.length !== 1 ? 's' : ''} analyzed
        </div>
      </div>

      {/* Projects Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-sm text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3">Project</th>
              <th className="p-3">Gate</th>
              <th className="p-3">Reliability</th>
              <th className="p-3">Security</th>
              <th className="p-3">Maintainability</th>
              <th className="p-3">Coverage</th>
              <th className="p-3">Duplications</th>
              <th className="p-3">Lines</th>
              <th className="p-3">Last Analysis</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {unavailable ? (
              <tr>
                <td colSpan={10} className="p-8">
                  <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                    <WifiOff className="h-6 w-6 text-amber-400 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-amber-400">SonarQube unavailable</div>
                      <div className="text-xs">{unavailable}</div>
                      <div className="text-[11px] mt-1 opacity-70">Auto-refresh will retry. Runs fine on the laptop without vanadium.</div>
                    </div>
                  </div>
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading code quality metrics...
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[var(--text-secondary)]">
                  No SonarQube projects match filters.
                </td>
              </tr>
            ) : (
              projects.map((proj) => (
                <React.Fragment key={proj.id}>
                  <tr
                    onClick={() => setExpandedProject(expandedProject === proj.id ? null : proj.id)}
                    className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <td className="p-3 text-[var(--text-secondary)]">
                      {expandedProject === proj.id ? '-' : '+'}
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-mono font-bold text-sky-400">{proj.name}</span>
                        {proj.description && (
                          <p className="text-[10px] text-[var(--text-secondary)]">{proj.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">{getGateBadge(proj.gate)}</td>
                    <td className="p-3">{getRatingBadge(proj.reliabilityRating)}</td>
                    <td className="p-3">{getRatingBadge(proj.securityRating)}</td>
                    <td className="p-3">{getRatingBadge(proj.maintainabilityRating)}</td>
                    <td className="p-3"><CoverageBar value={proj.coveragePercent} /></td>
                    <td className="p-3">
                      <span className={`font-mono text-xs ${proj.duplicationsPercent > 5 ? 'text-rose-400' : 'text-[var(--text-secondary)]'}`}>
                        {proj.duplicationsPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">
                      {proj.linesOfCode.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Clock className="h-3 w-3" />
                        {new Date(proj.lastAnalysis).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded metric history */}
                  {expandedProject === proj.id && metrics[proj.id] && (
                    <tr>
                      <td colSpan={10} className="bg-[var(--bg-main)]/40 p-0">
                        <div className="px-6 py-3 border-t border-[var(--border-color)]">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                              <LineChart className="h-3.5 w-3.5 text-sky-400" />
                              <span>Coverage History — last {metrics[proj.id].length} analyses</span>
                            </div>
                            <a
                              href={proj.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              SonarQube
                            </a>
                          </div>

                          {/* Mini bar chart (pure CSS, no chart lib) */}
                          <div className="flex items-end gap-1.5 h-20">
                            {metrics[proj.id].map((m) => (
                              <div key={m.id} className="flex flex-col items-center gap-1 flex-1">
                                <span className="text-[9px] font-mono text-[var(--text-secondary)]">
                                  {m.coveragePercent.toFixed(0)}%
                                </span>
                                <div
                                  className={`w-full max-w-6 rounded-t ${m.coveragePercent >= 80 ? 'bg-emerald-400/70' : m.coveragePercent >= 60 ? 'bg-amber-400/70' : 'bg-rose-400/70'}`}
                                  style={{ height: `${Math.max((m.coveragePercent / 100) * 64, 6)}px` }}
                                />
                                <span className="text-[8px] text-[var(--text-secondary)]">
                                  {new Date(m.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="text-xs text-[var(--text-secondary)] text-center">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-sky-400" />
          SonarQube Code Quality Registry — A–E ratings, quality gates, coverage trend
        </span>
      </div>
    </div>
  );
};

/* ── Shared filter-chrome + pagination for the mirror tables ─────── */
interface MirrorTableProps<T> {
  envelope: SonarListEnvelope<T>;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  isLoading: boolean;
  unavailable: string | null;
  columns: number;
}

function Pager({ envelope, page, pageSize, onPageChange, columns, isLoading, unavailable }: MirrorTableProps<never>) {
  if (unavailable) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <WifiOff className="h-6 w-6 text-amber-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-400">Sonar sync unavailable</div>
            <div className="text-xs">{unavailable}</div>
          </div>
        </div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
        Loading...
      </div>
    );
  }
  if (envelope.items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
        No items match the current filters.
      </div>
    );
  }
  const totalPages = Math.max(1, Math.ceil(envelope.count / pageSize));
  return (
    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
      <span className="font-mono">
        {envelope.count} total · page {page}/{totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 disabled:opacity-40 hover:bg-[var(--bg-card-hover)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 disabled:opacity-40 hover:bg-[var(--bg-card-hover)]"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
      {label}:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

type IssueSortKey = 'severity' | 'updated' | 'component';

/* ── Issues (canonical mirror) ───────────────────────────────────── */
const IssuesView: React.FC<{ searchQuery: string; refreshTrigger: number }> = ({ searchQuery, refreshTrigger }) => {
  const [items, setItems] = useState<SonarIssueRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState('');
  const [issueType, setIssueType] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<IssueSortKey>('severity');
  const [isLoading, setIsLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [writeError, setWriteError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    (async () => {
      try {
        const env = await registryApi.getSonarIssues({
          severity: severity || undefined,
          issueType: issueType || undefined,
          status: status || undefined,
          query: query || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (isMounted) {
          setItems(env.items);
          setCount(env.count);
          setUnavailable(null);
        }
      } catch (err: any) {
        console.error('Failed fetching sonar issues:', err);
        if (isMounted) {
          setItems([]);
          setCount(0);
          setUnavailable(err?.upstream ? `sonar-sync unreachable (upstream: ${err.upstream})` : 'Failed to load sonar issues.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [severity, issueType, status, query, page, refreshTrigger, revision]);

  const applyReview = async (key: string, transition: string) => {
    setBusy((p) => ({ ...p, [key]: true }));
    setWriteError(null);
    try {
      await registryApi.reviewIssue(key, transition as 'resolve' | 'wontfix' | 'falsepositive', 'ui');
      setRevision((r) => r + 1);
    } catch (err: any) {
      console.error('issue writeback failed:', err);
      setWriteError(err?.message ?? 'Writeback failed — sonar-sync unreachable?');
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  };

  const ordered = useMemo(() => {
    const copy = [...items];
    switch (sortKey) {
      case 'severity':
        copy.sort((a, b) => (severityRank[b.severity ?? ''] ?? -1) - (severityRank[a.severity ?? ''] ?? -1));
        break;
      case 'component':
        copy.sort((a, b) => (a.component_key ?? '').localeCompare(b.component_key ?? ''));
        break;
      case 'updated':
        copy.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
        break;
    }
    return copy;
  }, [items, sortKey]);

  const resetPageOnFilter = (setter: (v: string) => void) => (v: string) => { setPage(1); setter(v); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <FilterSelect label="Severity" value={severity} onChange={resetPageOnFilter(setSeverity)}
          options={[['', 'Any'], ['BLOCKER', 'Blocker'], ['CRITICAL', 'Critical'], ['MAJOR', 'Major'], ['MINOR', 'Minor'], ['INFO', 'Info']]} />
        <FilterSelect label="Type" value={issueType} onChange={resetPageOnFilter(setIssueType)}
          options={[['', 'Any'], ['BUG', 'Bug'], ['VULNERABILITY', 'Vulnerability'], ['CODE_SMELL', 'Code Smell']]} />
        <FilterSelect label="Status" value={status} onChange={resetPageOnFilter(setStatus)}
          options={[['', 'Any'], ['OPEN', 'Open'], ['CONFIRMED', 'Confirmed'], ['REOPENED', 'Reopened'], ['RESOLVED', 'Resolved']]} />
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1">
          <Search className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          <input
            value={query}
            onChange={(e) => { setPage(1); setQuery(e.target.value); }}
            placeholder="Search message / component…"
            className="w-52 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <ArrowUpDown className="h-3.5 w-3.5 text-sky-400" />
          Sort:
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as IssueSortKey)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="severity">Severity</option>
            <option value="updated">Updated</option>
            <option value="component">Component</option>
          </select>
        </div>
      </div>

      {writeError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          Writeback failed: {writeError}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-sm text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3">Severity</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
              <th className="p-3">Message</th>
              <th className="p-3">Component</th>
              <th className="p-3">Line</th>
              <th className="p-3">Review</th>
              <th className="p-3">Updated</th>
            </tr>
          </thead>
          {!unavailable && !isLoading && items.length > 0 && (
            <tbody className="divide-y divide-[var(--border-color)]">
              {ordered.map((it) => (
                <tr key={it.key} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                  <td className="p-3">{severityBadge(it.severity)}</td>
                  <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{it.sonar_type ?? ''}</td>
                  <td className="p-3 text-xs text-[var(--text-secondary)]">{it.status ?? ''}</td>
                  <td className="p-3 max-w-md">
                    <span className="text-xs text-[var(--text-primary)]" title={it.message ?? ''}>{truncate(it.message ?? '', 110)}</span>
                    <span className="block text-[10px] font-mono text-[var(--text-secondary)]">{it.rule_key ?? ''}</span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)]">{truncate(it.component_key ?? '', 40)}</td>
                  <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{it.line ?? ''}</td>
                  <td className="p-3">
                    {reviewBadge(it.review_status)}
                    {!it.review_status && (
                      <ActionButtons
                        busy={!!busy[it.key]}
                        onAction={(v) => applyReview(it.key, v)}
                        actions={[
                          { label: 'Resolve', value: 'resolve', cls: 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' },
                          { label: "Won't fix", value: 'wontfix', cls: 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' },
                          { label: 'False pos', value: 'falsepositive', cls: 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10' },
                        ]}
                      />
                    )}
                  </td>
                  <td className="p-3 text-xs text-[var(--text-secondary)]">
                    {it.updated_at ? new Date(it.updated_at).toLocaleDateString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
        <div className="p-3 border-t border-[var(--border-color)]">
          <Pager envelope={{ items, count }} page={page} pageSize={PAGE_SIZE} onPageChange={setPage}
            isLoading={isLoading} unavailable={unavailable} columns={8} />
        </div>
      </div>
    </div>
  );
};

/* ── Security Hotspots (canonical mirror) ────────────────────────── */
const HotspotsView: React.FC<{ searchQuery: string; refreshTrigger: number }> = ({ searchQuery, refreshTrigger }) => {
  const [items, setItems] = useState<SonarHotspotRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'probability' | 'updated' | 'component'>('probability');
  const [isLoading, setIsLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [writeError, setWriteError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const PAGE_SIZE = 25;

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return ['', ...items.map((h) => h.security_category ?? '').filter((c) => c && !seen.has(c) && seen.add(c))];
  }, [items]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    (async () => {
      try {
        const env = await registryApi.getSonarHotspots({
          category: category || undefined,
          status: status || undefined,
          query: query || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (isMounted) {
          setItems(env.items);
          setCount(env.count);
          setUnavailable(null);
        }
      } catch (err: any) {
        console.error('Failed fetching sonar hotspots:', err);
        if (isMounted) {
          setItems([]);
          setCount(0);
          setUnavailable(err?.upstream ? `sonar-sync unreachable (upstream: ${err.upstream})` : 'Failed to load sonar hotspots.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [category, status, query, page, refreshTrigger, revision]);

  const applyReview = async (key: string, action: string) => {
    setBusy((p) => ({ ...p, [key]: true }));
    setWriteError(null);
    try {
      await registryApi.reviewHotspot(key, action as 'safe' | 'fixed' | 'accept-risk', 'ui');
      setRevision((r) => r + 1);
    } catch (err: any) {
      console.error('hotspot writeback failed:', err);
      setWriteError(err?.message ?? 'Writeback failed — sonar-sync unreachable?');
    } finally {
      setBusy((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  };

  const ordered = useMemo(() => {
    const copy = [...items];
    switch (sortKey) {
      case 'probability':
        copy.sort((a, b) => (probabilityRank[b.vulnerability_probability ?? ''] ?? -1) - (probabilityRank[a.vulnerability_probability ?? ''] ?? -1));
        break;
      case 'component':
        copy.sort((a, b) => (a.component_key ?? '').localeCompare(b.component_key ?? ''));
        break;
      case 'updated':
        copy.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
        break;
    }
    return copy;
  }, [items, sortKey]);

  const resetPageOnFilter = (setter: (v: string) => void) => (v: string) => { setPage(1); setter(v); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <FilterSelect label="Category" value={category} onChange={resetPageOnFilter(setCategory)}
          options={[['', 'Any'], ...categories.filter((c) => c !== '').map((c) => [c, c] as [string, string])]} />
        <FilterSelect label="Status" value={status} onChange={resetPageOnFilter(setStatus)}
          options={[['', 'Any'], ['TO_REVIEW', 'To Review'], ['REVIEWED', 'Reviewed'], ['REVIEWED_FIXED', 'Fixed']]} />
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1">
          <Search className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          <input
            value={query}
            onChange={(e) => { setPage(1); setQuery(e.target.value); }}
            placeholder="Search message / component…"
            className="w-52 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <ArrowUpDown className="h-3.5 w-3.5 text-sky-400" />
          Sort:
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as 'probability' | 'updated' | 'component')}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="probability">Probability</option>
            <option value="updated">Updated</option>
            <option value="component">Component</option>
          </select>
        </div>
      </div>

      {writeError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          Writeback failed: {writeError}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-sm text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3">Probability</th>
              <th className="p-3">Category</th>
              <th className="p-3">Status</th>
              <th className="p-3">Message</th>
              <th className="p-3">Component</th>
              <th className="p-3">Line</th>
              <th className="p-3">Review</th>
              <th className="p-3">Updated</th>
            </tr>
          </thead>
          {!unavailable && !isLoading && items.length > 0 && (
            <tbody className="divide-y divide-[var(--border-color)]">
              {ordered.map((h) => (
                <tr key={h.key} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                  <td className="p-3">{probabilityBadge(h.vulnerability_probability)}</td>
                  <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{h.security_category ?? ''}</td>
                  <td className="p-3 text-xs text-[var(--text-secondary)]">{h.status ?? ''}</td>
                  <td className="p-3 max-w-md">
                    <span className="text-xs text-[var(--text-primary)]" title={h.message ?? ''}>{truncate(h.message ?? '', 110)}</span>
                    <span className="block text-[10px] font-mono text-[var(--text-secondary)]">{h.rule_key ?? ''}</span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)]">{truncate(h.component_key ?? '', 40)}</td>
                  <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{h.line ?? ''}</td>
                  <td className="p-3">
                    {reviewBadge(h.review_status)}
                    {!h.review_status && h.status === 'TO_REVIEW' && (
                      <ActionButtons
                        busy={!!busy[h.key]}
                        onAction={(v) => applyReview(h.key, v)}
                        actions={[
                          { label: 'Safe', value: 'safe', cls: 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' },
                          { label: 'Fixed', value: 'fixed', cls: 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10' },
                          { label: 'Accept risk', value: 'accept-risk', cls: 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' },
                        ]}
                      />
                    )}
                  </td>
                  <td className="p-3 text-xs text-[var(--text-secondary)]">
                    {h.updated_at ? new Date(h.updated_at).toLocaleDateString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
        <div className="p-3 border-t border-[var(--border-color)]">
          <Pager envelope={{ items, count }} page={page} pageSize={PAGE_SIZE} onPageChange={setPage}
            isLoading={isLoading} unavailable={unavailable} columns={8} />
        </div>
      </div>
    </div>
  );
};