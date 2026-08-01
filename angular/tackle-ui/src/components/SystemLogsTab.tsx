import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Filter,
  Terminal,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  Pause,
  Play,
  Download,
  Copy,
  Check,
  Plus,
  Clock,
  Activity,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { SystemLogEntry } from '../types';

export const SystemLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(3000);
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [timeWindow, setTimeWindow] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Interactive State
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [showEmitModal, setShowEmitModal] = useState<boolean>(false);

  // Emit Form State
  const [emitLevel, setEmitLevel] = useState<'INFO' | 'WARN' | 'ERROR' | 'DEBUG'>('WARN');
  const [emitCategory, setEmitCategory] = useState<string>('CIRCUIT_BREAKER');
  const [emitMessage, setEmitMessage] = useState<string>('Manual circuit breaker reset requested by operator');
  const [emitSource, setEmitSource] = useState<string>('operator-ui');
  const [emitDetails, setEmitDetails] = useState<string>('{"circuit_status": "HALF_OPEN", "retry_count": 0}');
  const [isEmitting, setIsEmitting] = useState<boolean>(false);

  // Fetch logs from server
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const queryParams = new URLSearchParams();
      if (selectedLevel !== 'ALL') queryParams.append('level', selectedLevel);
      if (selectedCategory !== 'ALL') queryParams.append('category', selectedCategory);
      if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());
      queryParams.append('limit', '250');

      const res = await fetch(`/logs?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.categories) setCategories(data.categories);
        setLastPolledAt(data.last_polled_at || new Date().toISOString());
      }
    } catch (err) {
      console.error('Failed to fetch system logs:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedLevel, selectedCategory, searchQuery]);

  // Initial load & Polling interval
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, pollIntervalMs, fetchLogs]);

  // Handle Clear Logs
  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear the system log buffer?')) return;
    try {
      const res = await fetch('/logs', { method: 'DELETE' });
      if (res.ok) {
        fetchLogs();
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  // Handle Emit Event
  const handleEmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emitMessage.trim()) return;
    setIsEmitting(true);
    try {
      let parsedDetails: any = emitDetails;
      try {
        parsedDetails = JSON.parse(emitDetails);
      } catch {
        // use string if not valid json
      }

      const res = await fetch('/logs/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: emitLevel,
          category: emitCategory,
          message: emitMessage,
          source: emitSource,
          details: parsedDetails
        })
      });

      if (res.ok) {
        setShowEmitModal(false);
        setEmitMessage('');
        fetchLogs();
      }
    } catch (err) {
      console.error('Failed to emit log event:', err);
    } finally {
      setIsEmitting(false);
    }
  };

  // Toggle expanded log item
  const toggleExpand = (id: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Copy log entry payload
  const handleCopyLog = (log: SystemLogEntry) => {
    const text = `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message} (source: ${log.source || 'n/a'})\nDetails: ${JSON.stringify(log.details, null, 2)}`;
    navigator.clipboard.writeText(text);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  // Export logs to JSON download
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `tackle-system-logs-${new Date().toISOString().slice(0, 19)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Filtering on client side for responsive UI feel
  const nowMs = Date.now();
  const filteredLogs = logs.filter(log => {
    // Time Window Filter
    if (timeWindow !== 'ALL') {
      const logTime = new Date(log.timestamp).getTime();
      const diffMs = nowMs - logTime;
      if (timeWindow === '5M' && diffMs > 5 * 60 * 1000) return false;
      if (timeWindow === '15M' && diffMs > 15 * 60 * 1000) return false;
      if (timeWindow === '1H' && diffMs > 60 * 60 * 1000) return false;
    }
    return true;
  }).sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  // Calculate statistics
  const errorCount = logs.filter(l => l.level === 'ERROR').length;
  const warnCount = logs.filter(l => l.level === 'WARN').length;
  const infoCount = logs.filter(l => l.level === 'INFO').length;
  const debugCount = logs.filter(l => l.level === 'DEBUG').length;

  // Helper for level badge colors
  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            WARN
          </span>
        );
      case 'DEBUG':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Bug className="w-3 h-3" />
            DEBUG
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Info className="w-3 h-3" />
            INFO
          </span>
        );
    }
  };

  // Helper for category badge colors
  const getCategoryBadge = (cat: string) => {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] uppercase">
        {cat}
      </span>
    );
  };

  const formatRelativeTime = (isoString: string) => {
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return `${Math.floor(diffSec / 3600)}h ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner & Polling Controls */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-color)] bg-[var(--badge-bg)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                Troubleshooting Engine
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)]">
                <Clock className="w-3 h-3" />
                Live Feed Buffer
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Subsystem Event Stream & Diagnostic Logs
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Real-time chronologic logs from <code className="font-mono text-blue-400">tackle-srv :3410</code>, Redis memory cache, Gemini API proxy, and failure circuit monitors.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap shrink-0">
            {/* Auto Refresh Toggle */}
            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-1.5 px-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded transition cursor-pointer ${
                  autoRefresh
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {autoRefresh ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
                <span>{autoRefresh ? 'LIVE POLLING' : 'PAUSED'}</span>
              </button>

              {autoRefresh && (
                <select
                  value={pollIntervalMs}
                  onChange={e => setPollIntervalMs(Number(e.target.value))}
                  className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs rounded px-2 py-1 outline-none font-mono"
                >
                  <option value={1000}>1s interval</option>
                  <option value={3000}>3s interval</option>
                  <option value={5000}>5s interval</option>
                  <option value={10000}>10s interval</option>
                </select>
              )}
            </div>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchLogs()}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg text-xs font-medium text-[var(--text-primary)] transition cursor-pointer disabled:opacity-50"
              title="Refresh logs manually"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent-color)] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>

            {/* Emit Test Event Button */}
            <button
              onClick={() => setShowEmitModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-lg text-xs transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Emit Test Event</span>
            </button>

            {/* Export & Clear */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleExportJSON}
                className="p-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                title="Export Filtered Logs (JSON)"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleClearLogs}
                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-400 transition cursor-pointer"
                title="Clear Log Buffer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-2.5 px-3">
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Total Log Events</span>
            <span className="text-base font-bold text-[var(--text-primary)] font-mono">{logs.length}</span>
          </div>

          <div className="bg-[var(--bg-tertiary)] border border-rose-500/20 rounded-lg p-2.5 px-3">
            <span className="text-[10px] font-mono text-rose-400 uppercase block">Errors</span>
            <span className="text-base font-bold text-rose-400 font-mono">{errorCount}</span>
          </div>

          <div className="bg-[var(--bg-tertiary)] border border-amber-500/20 rounded-lg p-2.5 px-3">
            <span className="text-[10px] font-mono text-amber-400 uppercase block">Warnings</span>
            <span className="text-base font-bold text-amber-400 font-mono">{warnCount}</span>
          </div>

          <div className="bg-[var(--bg-tertiary)] border border-blue-500/20 rounded-lg p-2.5 px-3">
            <span className="text-[10px] font-mono text-blue-400 uppercase block">Info / Debug</span>
            <span className="text-base font-bold text-blue-400 font-mono">{infoCount + debugCount}</span>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-2.5 px-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Last Polled</span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                {lastPolledAt ? new Date(lastPolledAt).toLocaleTimeString() : 'Never'}
              </span>
            </div>
            <Activity className={`w-4 h-4 ${autoRefresh ? 'text-emerald-400 animate-pulse' : 'text-[var(--text-muted)]'}`} />
          </div>
        </div>
      </div>

      {/* Filter and Search Controls Bar */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search message, category, source, or payload details..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-color)] outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Level Filter Pills */}
            <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-1 text-xs">
              {['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-2.5 py-1 rounded-md font-mono font-medium text-[11px] transition cursor-pointer ${
                    selectedLevel === lvl
                      ? 'bg-[var(--accent-color)] text-white font-bold shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-transparent text-[var(--text-primary)] font-mono text-xs outline-none cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Time Window Dropdown */}
            <select
              value={timeWindow}
              onChange={e => setTimeWindow(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs rounded-lg px-2.5 py-2 outline-none cursor-pointer"
            >
              <option value="ALL">All Time</option>
              <option value="5M">Last 5 min</option>
              <option value="15M">Last 15 min</option>
              <option value="1H">Last 1 hour</option>
            </select>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="px-2.5 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title="Toggle Sort Order"
            >
              {sortOrder === 'desc' ? '↓ Newest First' : '↑ Oldest First'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Stream Log View Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-xs">
        <div className="p-3 px-4 bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--accent-color)]" />
            <span>STREAM LOGS ({filteredLogs.length} matching)</span>
          </div>
          <span>Format: ISO-8601 | Server PID {process.env.PID || 3410}</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-[var(--text-muted)] font-mono flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent-color)]" />
            <span>Loading system log stream...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--text-muted)] font-mono flex flex-col items-center justify-center gap-2">
            <Info className="w-6 h-6 text-[var(--text-muted)]" />
            <span>No log records match current search or level filters.</span>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedLevel('ALL');
                setSelectedCategory('ALL');
                setTimeWindow('ALL');
              }}
              className="text-[var(--accent-color)] underline cursor-pointer hover:opacity-80 mt-1"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] font-mono text-xs">
            {filteredLogs.map(log => {
              const isExpanded = expandedLogIds.has(log.id);
              const hasDetails = log.details && (typeof log.details === 'object' ? Object.keys(log.details).length > 0 : String(log.details).trim().length > 0);

              return (
                <div
                  key={log.id}
                  className={`transition-colors ${
                    log.level === 'ERROR'
                      ? 'bg-rose-500/5 hover:bg-rose-500/10'
                      : log.level === 'WARN'
                      ? 'bg-amber-500/5 hover:bg-amber-500/10'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {/* Log Row Summary */}
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="p-3 px-4 flex flex-col md:flex-row md:items-center gap-2 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      {hasDetails ? (
                        <button className="text-[var(--text-muted)]">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--accent-color)]" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-3.5" />
                      )}
                      <span className="text-[11px] text-[var(--text-muted)] font-mono w-24 shrink-0" title={log.timestamp}>
                        {formatRelativeTime(log.timestamp)}
                      </span>
                      {getLevelBadge(log.level)}
                      {getCategoryBadge(log.category)}
                    </div>

                    <div className="flex-1 min-w-0 font-mono text-slate-200 truncate">
                      <span className="text-[var(--text-primary)]">{log.message}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] shrink-0 self-end md:self-auto">
                      {log.source && (
                        <span className="bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                          {log.source}
                        </span>
                      )}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleCopyLog(log);
                        }}
                        className="p-1 hover:text-[var(--text-primary)] rounded cursor-pointer"
                        title="Copy log entry payload"
                      >
                        {copiedLogId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Inspector Panel */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-950/80 border-t border-[var(--border-subtle)] text-xs font-mono space-y-3">
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] border-b border-slate-800 pb-2">
                        <span>Log ID: {log.id}</span>
                        <span>Timestamp: {new Date(log.timestamp).toISOString()}</span>
                      </div>

                      {log.details && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[var(--accent-color)] block mb-1">
                            Payload & Metadata
                          </span>
                          <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-[11px] overflow-x-auto leading-relaxed">
                            {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Emit Modal Dialog */}
      {showEmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--accent-color)]" />
                Emit Diagnostic Log Event
              </h3>
              <button
                onClick={() => setShowEmitModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEmitEvent} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Log Level</label>
                  <select
                    value={emitLevel}
                    onChange={e => setEmitLevel(e.target.value as any)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-2 outline-none font-mono"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARN">WARN</option>
                    <option value="ERROR">ERROR</option>
                    <option value="DEBUG">DEBUG</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Category</label>
                  <select
                    value={emitCategory}
                    onChange={e => setEmitCategory(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-2 outline-none font-mono"
                  >
                    <option value="CIRCUIT_BREAKER">CIRCUIT_BREAKER</option>
                    <option value="RESOLVER">RESOLVER</option>
                    <option value="GEMINI_PROXY">GEMINI_PROXY</option>
                    <option value="SCHEDULER">SCHEDULER</option>
                    <option value="MEMORY_CACHE">MEMORY_CACHE</option>
                    <option value="SESSION_DRIVER">SESSION_DRIVER</option>
                    <option value="API_ROUTER">API_ROUTER</option>
                    <option value="SYSTEM">SYSTEM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Log Message</label>
                <input
                  type="text"
                  required
                  value={emitMessage}
                  onChange={e => setEmitMessage(e.target.value)}
                  placeholder="e.g. Manual circuit breaker reset requested"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-2 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Source Identifier</label>
                <input
                  type="text"
                  value={emitSource}
                  onChange={e => setEmitSource(e.target.value)}
                  placeholder="e.g. operator-ui"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md px-3 py-2 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Details (JSON or string)</label>
                <textarea
                  rows={3}
                  value={emitDetails}
                  onChange={e => setEmitDetails(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-md p-3 outline-none font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowEmitModal(false)}
                  className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-md font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEmitting}
                  className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-md cursor-pointer disabled:opacity-50"
                >
                  {isEmitting ? 'Emitting...' : 'Emit Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
