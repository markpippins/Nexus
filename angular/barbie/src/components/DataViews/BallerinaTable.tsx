import React, { useState, useEffect } from 'react';
import { BallerinaPackage, BallerinaService, HealthStatus } from '../../types';
import { registryApi, GatewayUpstreamError } from '../../lib/api';
import {
  Workflow,
  GitFork,
  Package,
  Server as ServerIcon,
  ExternalLink,
  WifiOff
} from 'lucide-react';

interface BallerinaTableProps {
  searchQuery: string;
  refreshTrigger: number;
}

const statusColors: Record<HealthStatus, { dot: string; label: string; text: string }> = {
  healthy: { dot: 'bg-emerald-400', label: 'HEALTHY', text: 'text-emerald-400' },
  degraded: { dot: 'bg-amber-400', label: 'DEGRADED', text: 'text-amber-400' },
  critical: { dot: 'bg-rose-400', label: 'CRITICAL', text: 'text-rose-400' },
  offline: { dot: 'bg-slate-400', label: 'OFFLINE', text: 'text-slate-400' }
};

export const BallerinaTable: React.FC<BallerinaTableProps> = ({
  searchQuery,
  refreshTrigger
}) => {
  const [packages, setPackages] = useState<BallerinaPackage[]>([]);
  const [services, setServices] = useState<BallerinaService[]>([]);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        // Packages come from Ballerina Central (internet) via the gateway moat;
        // services come from the local runtime. Fetch independently so one being
        // unreachable doesn't blank the other.
        const [pkgsRes, svcsRes] = await Promise.allSettled([
          registryApi.getBallerinaPackages({ search: searchQuery }),
          registryApi.getBallerinaServices({ search: searchQuery })
        ]);

        if (isMounted) {
          let unavailableMsg: string | null = null;

          if (pkgsRes.status === 'fulfilled') {
            setPackages(pkgsRes.value);
          } else {
            setPackages([]);
            const e = pkgsRes.reason;
            unavailableMsg = e instanceof GatewayUpstreamError
              ? (e.upstream
                  ? `Ballerina Central packages unreachable (upstream: ${e.upstream}). Internet or vanadium may be offline.`
                  : 'Ballerina Central packages unreachable.')
              : 'Failed to load Ballerina packages.';
          }

          if (svcsRes.status === 'fulfilled') {
            setServices(svcsRes.value);
          } else {
            setServices([]);
            const e = svcsRes.reason;
            unavailableMsg = e instanceof GatewayUpstreamError
              ? (e.upstream
                  ? `Ballerina runtime services unreachable (upstream: ${e.upstream}).`
                  : 'Ballerina runtime services unreachable.')
              : 'Failed to load Ballerina services.';
          }

          setUnavailable(unavailableMsg);
        }
      } catch (err) {
        console.error('Failed fetching Ballerina registry:', err);
        if (isMounted) setUnavailable('Failed to load Ballerina data.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [searchQuery, refreshTrigger]);

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
          <Workflow className="h-4 w-4 text-sky-400" />
          <span>Ballerina Integration Platform</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] font-mono">
          <span>{packages.length} package{packages.length !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1">
            <ServerIcon className="h-3 w-3" />
            {services.length} deployed service{services.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Upstream-unavailable banner (laptop without vanadium / internet) */}
      {!isLoading && unavailable && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-[var(--text-secondary)]">
          <WifiOff className="h-6 w-6 text-amber-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-400">Ballerina data partially unavailable</div>
            <div className="text-xs">{unavailable}</div>
            <div className="text-[11px] mt-1 opacity-70">Auto-refresh will retry.</div>
          </div>
        </div>
      )}

      {/* Deployed Services Section */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
          <ServerIcon className="h-3.5 w-3.5 text-emerald-400" />
          Deployed Services (local runtime)
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--text-secondary)]">Loading deployed services...</div>
        ) : services.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-secondary)]">No deployed services match filters.</div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {services.map((svc) => {
              const sc = statusColors[svc.status] ?? statusColors.offline;
              return (
                <div key={svc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full ${sc.dot} animate-pulse`} />
                    <span className="font-mono font-bold text-sm text-[var(--text-primary)]">{svc.name}</span>
                    <span className="text-[10px] font-mono text-[var(--text-secondary)]">{svc.packageRef}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="max-w-60 truncate">{svc.endpoint}</span>
                    <span className="rounded bg-[var(--bg-main)] px-1.5 py-0.5 text-[10px]">:{svc.listenerPort}</span>
                    <span className={`font-bold ${sc.text}`}>{sc.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Packages Registry */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full text-left text-sm text-[var(--text-primary)]">
          <thead className="border-b border-[var(--border-color)] bg-[var(--bg-main)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3">Package</th>
              <th className="p-3">Version</th>
              <th className="p-3">Platform</th>
              <th className="p-3">License</th>
              <th className="p-3">Dependencies</th>
              <th className="p-3">Updated</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-color)]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  Loading package catalog...
                </td>
              </tr>
            ) : packages.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--text-secondary)]">
                  No Ballerina packages match filters.
                </td>
              </tr>
            ) : (
              packages.map((pkg) => (
                <React.Fragment key={pkg.id}>
                  <tr
                    onClick={() => setExpandedPkg(expandedPkg === pkg.id ? null : pkg.id)}
                    className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <td className="p-3 text-[var(--text-secondary)]">
                      {expandedPkg === pkg.id ? '-' : '+'}
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="flex items-center gap-1.5 font-mono font-bold text-sky-400">
                          <Package className="h-3.5 w-3.5" />
                          {pkg.org}/{pkg.name}
                        </span>
                        {pkg.description && (
                          <p className="text-[10px] text-[var(--text-secondary)]">{pkg.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold">{pkg.version}</td>
                    <td className="p-3 text-xs text-[var(--text-secondary)]">{pkg.platform}</td>
                    <td className="p-3 text-xs font-mono text-[var(--text-secondary)]">{pkg.license}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <GitFork className="h-3 w-3" />
                        {pkg.dependencies.length}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-[var(--text-secondary)]">
                      {new Date(pkg.lastUpdated).toLocaleDateString()}
                    </td>
                  </tr>

                  {/* Expanded dependency graph */}
                  {expandedPkg === pkg.id && (
                    <tr>
                      <td colSpan={7} className="bg-[var(--bg-main)]/40 p-0">
                        <div className="px-6 py-3 border-t border-[var(--border-color)]">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                            <GitFork className="h-3.5 w-3.5 text-sky-400" />
                            Dependency Graph
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {pkg.dependencies.length === 0 ? (
                              <span className="text-xs text-[var(--text-secondary)]">No dependencies</span>
                            ) : (
                              pkg.dependencies.map((dep, idx) => (
                                <span
                                  key={`${dep.org}-${dep.name}-${idx}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 text-xs font-mono"
                                >
                                  <span className="text-sky-400">{dep.org}/{dep.name}</span>
                                  <span className="text-[var(--text-secondary)]">{dep.version}</span>
                                  {idx < pkg.dependencies.length - 1 && (
                                    <ExternalLink className="h-3 w-3 text-[var(--text-secondary)]/60" />
                                  )}
                                </span>
                              ))
                            )}
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
        Ballerina Central + local runtime registry — packages & deployed services
      </div>
    </div>
  );
};