import React, { useState, useEffect } from 'react';
import { SonarProject, SonarMetricPoint, SonarRating } from '../../types';
import { registryApi, GatewayUpstreamError } from '../../lib/api';
import {
  Gauge,
  Filter,
  ExternalLink,
  ShieldCheck,
  LineChart,
  Clock,
  WifiOff
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
  E: 'text-rose-400 bg-rose-500/10 ring-rose-500/30'
};

export const SonarQubeTable: React.FC<SonarQubeTableProps> = ({
  searchQuery,
  refreshTrigger
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
          gate: gateFilter
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