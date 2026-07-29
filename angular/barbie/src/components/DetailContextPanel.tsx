import React, { useState, useEffect, useRef } from 'react';
import {
  EntitySelection,
  LogEntry,
  MetricPoint,
  HealthStatus,
  Service,
  Server
} from '../types';
import { registryApi } from '../lib/api';
import {
  X,
  Activity,
  Terminal,
  BarChart3,
  Heart,
  Power,
  RefreshCw,
  Search,
  Copy,
  Check,
  Pause,
  Play,
  Trash2,
  Download,
  Info,
  Server as ServerIcon,
  Layers,
  Cpu,
  Globe,
  GitCommit,
  Edit
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';

interface DetailContextPanelProps {
  selection: EntitySelection | null;
  onClose: () => void;
  onEntityUpdated: () => void;
  onOpenEditModal: (entity: EntitySelection) => void;
}

export const DetailContextPanel: React.FC<DetailContextPanelProps> = ({
  selection,
  onClose,
  onEntityUpdated,
  onOpenEditModal
}) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'metrics' | 'specs'>('logs');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');
  const [isLogPaused, setIsLogPaused] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch telemetry whenever selected entity changes
  useEffect(() => {
    if (!selection) return;

    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const [logsRes, metricsRes] = await Promise.all([
          registryApi.getLogs(selection.type, selection.name),
          registryApi.getMetrics(selection.type, selection.name)
        ]);

        if (isMounted) {
          setLogs(logsRes.logs);
          setMetrics(metricsRes.metrics);
        }
      } catch (err) {
        console.error('Failed loading detail panel telemetry:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [selection]);

  // Live log simulation ticker
  useEffect(() => {
    if (!selection || isLogPaused) return;

    const interval = setInterval(() => {
      const levels: Array<'info' | 'warn' | 'error' | 'debug'> = ['info', 'info', 'info', 'warn', 'debug'];
      const randomLevel = levels[Math.floor(Math.random() * levels.length)];
      const sampleMsgs = [
        `Received HTTP GET /v1/${selection.name}/healthcheck 200 OK - 2ms`,
        `Outbound gRPC keepalive pulse acknowledged by cluster ingress`,
        `Thread pool size: 32 active workers`,
        `Cache key payload validated in 0.8ms`,
        `Database query executed in 14ms (0 rows locked)`
      ];

      const newEntry: LogEntry = {
        id: `log-live-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: randomLevel,
        message: `[${selection.type.toUpperCase()}:${selection.name}] ${sampleMsgs[Math.floor(Math.random() * sampleMsgs.length)]}`,
        traceId: `tr-${Math.random().toString(36).substring(2, 9)}`
      };

      setLogs((prev) => [...prev.slice(-100), newEntry]);
    }, 4000);

    return () => clearInterval(interval);
  }, [selection, isLogPaused]);

  if (!selection) return null;

  const data = selection.data || {};

  const handleSendHeartbeat = async () => {
    try {
      setActionStatus('Sending heartbeat...');
      await registryApi.sendHeartbeat(selection.name);
      setActionStatus('Heartbeat acknowledged!');
      setTimeout(() => setActionStatus(null), 3000);
      onEntityUpdated();
    } catch (err: any) {
      setActionStatus(`Heartbeat failed: ${err.message}`);
    }
  };

  const handleGracefulDeregister = async () => {
    if (!window.confirm(`Deregister ${selection.name} gracefully from the registry?`)) return;
    try {
      setActionStatus('Deregistering service...');
      await registryApi.deregisterServiceGraceful(selection.name);
      setActionStatus('Service deregistered as offline.');
      setTimeout(() => setActionStatus(null), 3000);
      onEntityUpdated();
    } catch (err: any) {
      setActionStatus(`Deregistration failed: ${err.message}`);
    }
  };

  const handleCopyLog = (log: LogEntry) => {
    navigator.clipboard.writeText(`${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const filteredLogs = logs.filter((l) => {
    const matchesText = logFilter ? l.message.toLowerCase().includes(logFilter.toLowerCase()) || l.traceId?.includes(logFilter) : true;
    const matchesLevel = logLevelFilter === 'all' ? true : l.level === logLevelFilter;
    return matchesText && matchesLevel;
  });

  const getStatusColor = (status?: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'degraded':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'critical':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl transition-all sm:w-[460px] md:w-[520px]">
      
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] p-4 bg-[var(--bg-main)]/80">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
            {selection.type === 'service' ? (
              <Layers className="h-5 w-5" />
            ) : selection.type === 'server' ? (
              <ServerIcon className="h-5 w-5" />
            ) : (
              <Activity className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                {selection.name}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusColor(data.status)}`}>
                {data.status || 'ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] capitalize">
              {selection.type} Entity Context
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close Context Panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          {selection.type === 'service' && (
            <>
              <button
                onClick={handleSendHeartbeat}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all"
                title="Send manual heartbeat ping to registry"
              >
                <Heart className="h-3.5 w-3.5 animate-pulse" />
                <span>Heartbeat</span>
              </button>

              <button
                onClick={handleGracefulDeregister}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all"
                title="Gracefully deregister service"
              >
                <Power className="h-3.5 w-3.5" />
                <span>Deregister</span>
              </button>
            </>
          )}

          <button
            onClick={() => onOpenEditModal(selection)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 py-1 font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
          >
            <Edit className="h-3.5 w-3.5 text-sky-400" />
            <span>Edit</span>
          </button>
        </div>

        {actionStatus && (
          <span className="animate-fade-in font-mono text-[10px] font-bold text-sky-400">
            {actionStatus}
          </span>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-main)]/50 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 transition-colors ${
            activeTab === 'logs'
              ? 'border-sky-500 text-sky-400 font-bold bg-[var(--bg-card)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Terminal className="h-4 w-4" />
          <span>Live Logs ({logs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 transition-colors ${
            activeTab === 'metrics'
              ? 'border-sky-500 text-sky-400 font-bold bg-[var(--bg-card)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Telemetry & Metrics</span>
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 transition-colors ${
            activeTab === 'specs'
              ? 'border-sky-500 text-sky-400 font-bold bg-[var(--bg-card)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Info className="h-4 w-4" />
          <span>Entity Specs</span>
        </button>
      </div>

      {/* TAB 1: LIVE LOGS STREAM */}
      {activeTab === 'logs' && (
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-950 p-3 font-mono text-xs">
          
          {/* Search & Level Filter Controls */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                placeholder="Filter log stream..."
                className="w-full rounded border border-slate-800 bg-slate-900 py-1 pl-8 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLogLevelFilter(lvl)}
                  className={`rounded px-2 py-0.5 text-[10px] uppercase font-bold transition-all ${
                    logLevelFilter === lvl
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}

              <button
                onClick={() => setIsLogPaused(!isLogPaused)}
                className={`flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 ${
                  isLogPaused ? 'text-amber-400' : 'text-emerald-400'
                }`}
                title={isLogPaused ? 'Resume stream' : 'Pause stream'}
              >
                {isLogPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              </button>

              <button
                onClick={() => setLogs([])}
                className="flex h-6 w-6 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-400"
                title="Clear logs"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Log Stream Output Box */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-600">
                No log output matching current filter.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="group flex items-start gap-2 rounded bg-slate-900/60 p-1.5 hover:bg-slate-900 transition-colors"
                >
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>

                  <span
                    className={`rounded px-1 text-[9px] font-bold uppercase ${
                      log.level === 'error'
                        ? 'bg-rose-500/20 text-rose-400'
                        : log.level === 'warn'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-sky-500/20 text-sky-400'
                    }`}
                  >
                    {log.level}
                  </span>

                  <p className="flex-1 text-[11px] text-slate-300 break-all leading-relaxed">
                    {log.message}
                  </p>

                  <button
                    onClick={() => handleCopyLog(log)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-sky-400 transition-opacity"
                    title="Copy line"
                  >
                    {copiedLogId === log.id ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* TAB 2: TELEMETRY & METRICS */}
      {activeTab === 'metrics' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Chart 1: CPU & Memory Usage % */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-sky-400" />
              <span>CPU & Memory Pressure (%)</span>
            </h4>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34D399" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263147" />
                  <XAxis dataKey="timeLabel" stroke="#94A3B8" fontSize={10} />
                  <YAxis stroke="#94A3B8" fontSize={10} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#141A26', borderColor: '#263147', borderRadius: '8px', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#38BDF8" fillOpacity={1} fill="url(#cpuGrad)" />
                  <Area type="monotone" dataKey="memory" name="RAM %" stroke="#34D399" fillOpacity={1} fill="url(#memGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Request Latency & RPS */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              <span>Latency (ms) & Throughput (RPS)</span>
            </h4>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263147" />
                  <XAxis dataKey="timeLabel" stroke="#94A3B8" fontSize={10} />
                  <YAxis stroke="#94A3B8" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#141A26', borderColor: '#263147', borderRadius: '8px', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="latency" name="Latency (ms)" stroke="#FBBF24" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="rps" name="RPS" stroke="#C084FC" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SPECS & SPECS */}
      {activeTab === 'specs' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4 space-y-3">
            <h4 className="font-bold text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2 uppercase tracking-wider text-[11px] text-[var(--text-secondary)]">
              Entity Configuration
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[var(--text-secondary)] block text-[10px]">Entity ID</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">{selection.id}</span>
              </div>

              <div>
                <span className="text-[var(--text-secondary)] block text-[10px]">Environment</span>
                <span className="font-mono text-[var(--text-primary)]">{data.environment || 'production'}</span>
              </div>

              {data.endpoint && (
                <div className="col-span-2">
                  <span className="text-[var(--text-secondary)] block text-[10px]">Registry Endpoint</span>
                  <span className="font-mono text-sky-400 break-all">{data.endpoint}</span>
                </div>
              )}

              {data.version && (
                <div>
                  <span className="text-[var(--text-secondary)] block text-[10px]">Version Tag</span>
                  <span className="font-mono text-[var(--text-primary)]">{data.version}</span>
                </div>
              )}

              {data.uptimePercent !== undefined && (
                <div>
                  <span className="text-[var(--text-secondary)] block text-[10px]">SLA Uptime</span>
                  <span className="font-mono text-emerald-400 font-bold">{data.uptimePercent}%</span>
                </div>
              )}

              {data.ipAddress && (
                <div>
                  <span className="text-[var(--text-secondary)] block text-[10px]">IP Address</span>
                  <span className="font-mono text-[var(--text-primary)]">{data.ipAddress}</span>
                </div>
              )}

              {data.datacenterRegion && (
                <div>
                  <span className="text-[var(--text-secondary)] block text-[10px]">Datacenter Region</span>
                  <span className="font-mono text-[var(--text-primary)]">{data.datacenterRegion}</span>
                </div>
              )}
            </div>

            {data.hostedServices && data.hostedServices.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--border-color)]">
                <span className="text-[var(--text-secondary)] block text-[10px] mb-1 font-semibold">
                  Hosted Embedded Services ({data.hostedServices.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {data.hostedServices.map((hs: string) => (
                    <span key={hs} className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono text-sky-300 border border-sky-500/20">
                      {hs}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
