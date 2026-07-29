import React, { useState } from 'react';
import {
  PlatformAggregateState,
  EntitySelection,
  HealthStatus,
  System,
  Service,
  Server,
  Deployment
} from '../types';
import {
  Activity,
  Server as ServerIcon,
  Cpu,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Network,
  Grid,
  Layers,
  ArrowRight,
  Radio,
  Clock,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface VisualizerProps {
  aggregateState: PlatformAggregateState | null;
  systems: System[];
  services: Service[];
  servers: Server[];
  deployments: Deployment[];
  selectedEntity: EntitySelection | null;
  onSelectEntity: (entity: EntitySelection) => void;
  searchFilter: string;
}

export const AggregatePlatformVisualizer: React.FC<VisualizerProps> = ({
  aggregateState,
  systems,
  services,
  servers,
  deployments,
  selectedEntity,
  onSelectEntity,
  searchFilter
}) => {
  const [viewMode, setViewMode] = useState<'topology' | 'heatmap' | 'incidents'>('topology');

  if (!aggregateState) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Activity className="h-5 w-5 animate-spin text-sky-400" />
          <span>Synthesizing platform state telemetry...</span>
        </div>
      </div>
    );
  }

  // Filter services & servers if search query is present
  const filteredServices = services.filter(s =>
    searchFilter
      ? s.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.systemName.toLowerCase().includes(searchFilter.toLowerCase())
      : true
  );

  const filteredServers = servers.filter(s =>
    searchFilter
      ? s.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.hostname.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.datacenterRegion.toLowerCase().includes(searchFilter.toLowerCase())
      : true
  );

  const getStatusBadge = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Healthy
          </span>
        );
      case 'degraded':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Degraded
          </span>
        );
      case 'critical':
        return (
          <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
            Critical
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Offline
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Platform State Summary Header KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        
        {/* KPI 1: Overall Health */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Health Index</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-[var(--text-primary)]">
              {aggregateState.overallHealthPercent}%
            </span>
            <span className="text-[10px] font-bold text-emerald-400">OPERATIONAL</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-700/30 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${aggregateState.overallHealthPercent}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Total Throughput (RPS) */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">System RPS</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-[var(--text-primary)]">
              {aggregateState.totalRps.toLocaleString()}
            </span>
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">req/sec</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Aggregated HTTP/gRPC</p>
        </div>

        {/* KPI 3: Avg Latency */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Avg Latency</span>
            <Clock className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-[var(--text-primary)]">
              {aggregateState.avgLatencyMs}
              <span className="text-xs font-normal text-[var(--text-secondary)]">ms</span>
            </span>
            <span className="text-[10px] font-medium text-emerald-400">p95 38ms</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Edge to Microservice</p>
        </div>

        {/* KPI 4: Active Incidents */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active Alerts</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-xl font-black ${aggregateState.activeIncidentsCount > 0 ? 'text-rose-400' : 'text-[var(--text-primary)]'}`}>
              {aggregateState.activeIncidentsCount}
            </span>
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">Needs Review</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Degraded / Critical</p>
        </div>

        {/* KPI 5: Registered Services */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Services</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-[var(--text-primary)]">
              {aggregateState.totalServices}
            </span>
            <span className="text-[10px] font-medium text-emerald-400">{aggregateState.healthyCount} Healthy</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">In Service Registry</p>
        </div>

        {/* KPI 6: Active Nodes & Servers */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Nodes / Servers</span>
            <ServerIcon className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black text-[var(--text-primary)]">
              {aggregateState.totalServers}
            </span>
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">4 Regions</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Bare Metal & K8s</p>
        </div>
      </div>

      {/* Aggregate Visualizer Center Card Container */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-md overflow-hidden">
        
        {/* Header toolbar for visualization view mode toggle */}
        <div className="flex flex-col gap-3 border-b border-[var(--border-color)] bg-[var(--bg-main)]/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <Network className="h-5 w-5 text-sky-400" />
              <span>Platform State Topology & Aggregate Health</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Click any service, node or system block to populate real-time logs and metrics in the right panel.
            </p>
          </div>

          <div className="flex items-center gap-1 self-start sm:self-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-1">
            <button
              onClick={() => setViewMode('topology')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'topology'
                  ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              <span>Topology Map</span>
            </button>

            <button
              onClick={() => setViewMode('heatmap')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'heatmap'
                  ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>Cluster Grid</span>
            </button>

            <button
              onClick={() => setViewMode('incidents')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'incidents'
                  ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Health Incidents ({aggregateState.activeIncidentsCount})</span>
            </button>
          </div>
        </div>

        {/* VIEW MODE 1: INTERACTIVE TOPOLOGY MAP */}
        {viewMode === 'topology' && (
          <div className="p-5">
            <div className="space-y-6">
              {systems.map((system) => {
                const sysServices = filteredServices.filter(s => s.systemId === system.id || s.systemName === system.name);

                return (
                  <div
                    key={system.id}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]/40 p-4 transition-all hover:border-[var(--border-highlight)]"
                  >
                    {/* System Header */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)]/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectEntity({ type: 'system', id: system.id, name: system.name, data: system })}
                          className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] hover:text-sky-400 transition-colors group"
                        >
                          <Layers className="h-4 w-4 text-sky-400 group-hover:scale-110 transition-transform" />
                          <span>{system.name}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        {getStatusBadge(system.status)}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <span className="rounded bg-slate-800/60 px-2 py-0.5 text-[11px] font-mono text-slate-300">
                          {system.tier}
                        </span>
                        <span>{sysServices.length} Microservices</span>
                      </div>
                    </div>

                    {/* Services connected within this system */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {sysServices.map((svc) => {
                        const isSelected = selectedEntity?.id === svc.id;
                        const relatedServer = servers.find(srv => srv.id === svc.serverId);

                        return (
                          <div
                            key={svc.id}
                            onClick={() => onSelectEntity({ type: 'service', id: svc.id, name: svc.name, data: svc })}
                            className={`group relative cursor-pointer rounded-lg border p-3 transition-all ${
                              isSelected
                                ? 'border-sky-500 bg-sky-500/10 shadow-md ring-2 ring-sky-500/30'
                                : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-sky-500/50 hover:bg-[var(--bg-card-hover)]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] group-hover:text-sky-400 transition-colors">
                                  {svc.name}
                                </h3>
                                <p className="text-[11px] text-[var(--text-secondary)]">{svc.type}</p>
                              </div>
                              {getStatusBadge(svc.status)}
                            </div>

                            {/* Service metrics summary row */}
                            <div className="mt-3 flex items-center justify-between border-t border-[var(--border-color)]/50 pt-2 text-[10px] text-[var(--text-secondary)]">
                              <span className="font-mono text-[var(--text-primary)]">{svc.rps} req/s</span>
                              <span className="font-mono text-[var(--text-primary)]">{svc.latencyMs}ms lat</span>
                              <span className="font-mono text-emerald-400">{svc.uptimePercent}% up</span>
                            </div>

                            {/* Hosted dependencies count */}
                            {svc.hostedServicesCount > 0 && (
                              <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                                <Radio className="h-3 w-3 text-sky-400 animate-pulse" />
                                <span>{svc.hostedServicesCount} embedded internal proxies</span>
                              </div>
                            )}

                            {/* Server link indicator */}
                            {relatedServer && (
                              <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-secondary)] border-t border-dashed border-[var(--border-color)] pt-1.5">
                                <span className="flex items-center gap-1">
                                  <ServerIcon className="h-3 w-3 text-purple-400" />
                                  <span className="font-mono">{relatedServer.name}</span>
                                </span>
                                <span className="font-mono text-xs text-[var(--text-primary)]">
                                  CPU {relatedServer.cpuUsage}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW MODE 2: CLUSTER HEATMAP & SERVERS GRID */}
        {viewMode === 'heatmap' && (
          <div className="p-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Infrastructure Server Clusters & Regional Nodes
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredServers.map((srv) => {
                const isSelected = selectedEntity?.id === srv.id;

                return (
                  <div
                    key={srv.id}
                    onClick={() => onSelectEntity({ type: 'server', id: srv.id, name: srv.name, data: srv })}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/10 shadow-md ring-2 ring-sky-500/30'
                        : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-sky-500/50 hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <ServerIcon className="h-4 w-4 text-purple-400" />
                          <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                            {srv.name}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
                          {srv.ipAddress} • {srv.datacenterRegion}
                        </p>
                      </div>
                      {getStatusBadge(srv.status)}
                    </div>

                    {/* Progress bars for CPU, RAM, Disk */}
                    <div className="mt-4 space-y-2.5">
                      <div>
                        <div className="flex justify-between text-[10px] font-medium text-[var(--text-secondary)] mb-1">
                          <span>CPU Pressure</span>
                          <span className="font-mono text-[var(--text-primary)]">{srv.cpuUsage}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              srv.cpuUsage > 85 ? 'bg-rose-500' : srv.cpuUsage > 65 ? 'bg-amber-500' : 'bg-sky-400'
                            }`}
                            style={{ width: `${srv.cpuUsage}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-medium text-[var(--text-secondary)] mb-1">
                          <span>Memory Allocated</span>
                          <span className="font-mono text-[var(--text-primary)]">{srv.memoryUsage}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              srv.memoryUsage > 85 ? 'bg-rose-500' : srv.memoryUsage > 65 ? 'bg-amber-500' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${srv.memoryUsage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[var(--border-color)]/60 pt-2 text-[10px] text-[var(--text-secondary)]">
                      <span>{srv.activePodsCount} Active K8s Pods</span>
                      <span>{srv.operatingSystem}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW MODE 3: ACTIVE HEALTH INCIDENTS */}
        {viewMode === 'incidents' && (
          <div className="p-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Operational Incidents & Degraded System Alerts
            </h3>

            {aggregateState.activeIncidentsCount === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-main)]/30 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">All Platform Systems Operational</p>
                <p className="text-xs text-[var(--text-secondary)]">No critical or degraded alerts in queue.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {services
                  .filter(s => s.status === 'degraded' || s.status === 'critical')
                  .map(s => (
                    <div
                      key={s.id}
                      onClick={() => onSelectEntity({ type: 'service', id: s.id, name: s.name, data: s })}
                      className="cursor-pointer rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 transition-all hover:border-rose-500"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-rose-400" />
                          <div>
                            <h4 className="font-mono text-sm font-bold text-rose-200">{s.name}</h4>
                            <p className="text-xs text-rose-300/80">
                              System: {s.systemName} • Latency: {s.latencyMs}ms • Error Rate: {s.errorRate}%
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(s.status)}
                      </div>
                    </div>
                  ))}

                {servers
                  .filter(s => s.status === 'degraded' || s.status === 'critical')
                  .map(srv => (
                    <div
                      key={srv.id}
                      onClick={() => onSelectEntity({ type: 'server', id: srv.id, name: srv.name, data: srv })}
                      className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 transition-all hover:border-amber-500"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-5 w-5 text-amber-400" />
                          <div>
                            <h4 className="font-mono text-sm font-bold text-amber-200">{srv.name}</h4>
                            <p className="text-xs text-amber-300/80">
                              CPU Pressure: {srv.cpuUsage}% • Memory: {srv.memoryUsage}% • Region: {srv.datacenterRegion}
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(srv.status)}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
