import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  Cpu,
  Server,
  RefreshCw,
  Play,
  Pause,
  AlertTriangle,
  Zap,
  Clock,
  HardDrive,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Info
} from 'lucide-react';
import { SystemHealthStatus, SystemMetricPoint } from '../types';

interface SystemInsightsTabProps {
  initialHealthStatus?: SystemHealthStatus | null;
}

export const SystemInsightsTab: React.FC<SystemInsightsTabProps> = ({
  initialHealthStatus
}) => {
  const [healthStatus, setHealthStatus] = useState<SystemHealthStatus | null>(initialHealthStatus || null);
  const [metricsHistory, setMetricsHistory] = useState<SystemMetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(3000);
  const [viewMode, setViewMode] = useState<'combined' | 'split'>('combined');
  const [showThresholdLine, setShowThresholdLine] = useState<boolean>(true);
  const [isSimulatingSpike, setIsSimulatingSpike] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Hovered data point for crosshair tooltip
  const [hoveredPoint, setHoveredPoint] = useState<SystemMetricPoint | null>(null);

  // Container refs for D3 charts
  const combinedContainerRef = useRef<HTMLDivElement>(null);
  const cpuContainerRef = useRef<HTMLDivElement>(null);
  const memoryContainerRef = useRef<HTMLDivElement>(null);

  // Client fallback data generator if backend is unreachable
  const generateFallbackHistory = useCallback((): SystemMetricPoint[] => {
    const now = Date.now();
    return Array.from({ length: 60 }, (_, idx) => {
      const minAgo = 59 - idx;
      const t = now - minAgo * 60 * 1000;
      const angle = idx / 5.0;
      const cpu = Math.max(12, Math.min(88, Math.round((28 + Math.sin(angle) * 16 + Math.cos(idx / 3) * 8) * 10) / 10));
      const memPct = Math.max(28, Math.min(74, Math.round((41 + Math.sin(idx / 8) * 6 + (idx / 59) * 5) * 10) / 10));
      const memUsed = Math.round((memPct / 100) * 4096 * 10) / 10;
      return {
        timestamp: new Date(t).toISOString(),
        cpu_percent: cpu,
        memory_percent: memPct,
        memory_used_mb: memUsed,
        memory_total_mb: 4096.0,
        active_requests: Math.round(14 + Math.sin(angle) * 8),
        latency_avg_ms: Math.round(19 + Math.sin(idx / 6) * 12)
      };
    });
  }, []);

  // Fetch health status & history
  const fetchHealthData = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data: SystemHealthStatus = await res.json();
        setHealthStatus(data);
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
          setMetricsHistory(data.history);
        } else if (metricsHistory.length === 0) {
          setMetricsHistory(generateFallbackHistory());
        }
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('Could not fetch /health from backend, using client telemetry fallback.');
      if (metricsHistory.length === 0) {
        const fallback = generateFallbackHistory();
        setMetricsHistory(fallback);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [generateFallbackHistory, metricsHistory.length]);

  // Initial load
  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchHealthData(true);
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, pollIntervalMs, fetchHealthData]);

  // Handle Simulate Load Spike
  const handleSimulateSpike = async () => {
    setIsSimulatingSpike(true);
    try {
      const res = await fetch('/health/simulate-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'MANUAL_STRESS_SPIKE' })
      });
      if (res.ok) {
        const data: SystemHealthStatus = await res.json();
        setHealthStatus(data);
        if (data.history && Array.isArray(data.history)) {
          setMetricsHistory(data.history);
        }
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        // Fallback local spike if API proxy fails
        setMetricsHistory(prev => {
          const next = [...prev];
          const now = Date.now();
          const last = next[next.length - 1];
          const cpuSpike = Math.min(94, Math.round((78 + Math.random() * 16) * 10) / 10);
          const memSpike = Math.min(84, Math.round((last ? last.memory_percent + 14 : 65) * 10) / 10);
          next.push({
            timestamp: new Date(now).toISOString(),
            cpu_percent: cpuSpike,
            memory_percent: memSpike,
            memory_used_mb: Math.round((memSpike / 100) * 4096 * 10) / 10,
            memory_total_mb: 4096.0,
            active_requests: Math.round(45 + Math.random() * 20),
            latency_avg_ms: Math.round(68 + Math.random() * 30)
          });
          return next.slice(-60);
        });
      }
    } catch (err) {
      console.error('Simulate load spike error:', err);
    } finally {
      setIsSimulatingSpike(false);
    }
  };

  // Render D3 Combined Chart
  const renderCombinedChart = useCallback((container: HTMLDivElement, data: SystemMetricPoint[]) => {
    d3.select(container).selectAll('*').remove();
    if (!data || data.length === 0) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 340;
    const margin = { top: 20, right: 30, bottom: 35, left: 45 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'overflow-visible');

    // Root group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Define X scale (time)
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, innerWidth]);

    // Define Y scale (0 - 100%)
    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    // Gridlines
    const yGrid = d3
      .axisLeft(yScale)
      .tickValues([0, 25, 50, 75, 100])
      .tickSize(-innerWidth)
      .tickFormat(() => '');

    g.append('g')
      .attr('class', 'grid text-[var(--border-subtle)] opacity-40')
      .call(yGrid)
      .selectAll('line')
      .attr('stroke-dasharray', '3,3');

    // Defs for gradients
    const defs = svg.append('defs');

    // CPU gradient
    const cpuGradient = defs
      .append('linearGradient')
      .attr('id', 'cpu-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    cpuGradient.append('stop').attr('offset', '0%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.28);
    cpuGradient.append('stop').attr('offset', '100%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.02);

    // Memory gradient
    const memGradient = defs
      .append('linearGradient')
      .attr('id', 'mem-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    memGradient.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.25);
    memGradient.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.02);

    // Area generators
    const cpuArea = d3
      .area<SystemMetricPoint>()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(new Date(d.timestamp)))
      .y0(innerHeight)
      .y1(d => yScale(d.cpu_percent));

    const memArea = d3
      .area<SystemMetricPoint>()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(new Date(d.timestamp)))
      .y0(innerHeight)
      .y1(d => yScale(d.memory_percent));

    // Line generators
    const cpuLine = d3
      .line<SystemMetricPoint>()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.cpu_percent));

    const memLine = d3
      .line<SystemMetricPoint>()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.memory_percent));

    // Draw memory area & line
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#mem-gradient)')
      .attr('d', memArea);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2.2)
      .attr('d', memLine);

    // Draw CPU area & line
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#cpu-gradient)')
      .attr('d', cpuArea);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#22d3ee')
      .attr('stroke-width', 2.2)
      .attr('d', cpuLine);

    // Warning Threshold line at 80%
    if (showThresholdLine) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(80))
        .attr('y2', yScale(80))
        .attr('stroke', '#f43f5e')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.85);

      g.append('text')
        .attr('x', innerWidth - 6)
        .attr('y', yScale(80) - 6)
        .attr('text-anchor', 'end')
        .attr('fill', '#f43f5e')
        .attr('font-size', '10px')
        .attr('font-family', 'monospace')
        .attr('font-weight', 'bold')
        .text('80% WARNING THRESHOLD');
    }

    // Axes
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(width < 500 ? 4 : 8)
      .tickFormat((d: any) => d3.timeFormat('%H:%M')(d));

    const yAxis = d3
      .axisLeft(yScale)
      .tickValues([0, 25, 50, 75, 100])
      .tickFormat(d => `${d}%`);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .attr('class', 'text-[var(--text-muted)] font-mono text-[10px]')
      .call(xAxis)
      .select('.domain')
      .attr('stroke', 'var(--border-color)');

    g.append('g')
      .attr('class', 'text-[var(--text-muted)] font-mono text-[10px]')
      .call(yAxis)
      .select('.domain')
      .attr('stroke', 'var(--border-color)');

    // Crosshair & Hover interaction overlay
    const crosshairLine = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'var(--text-secondary)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    const cpuDot = g
      .append('circle')
      .attr('r', 4.5)
      .attr('fill', '#22d3ee')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('opacity', 0);

    const memDot = g
      .append('circle')
      .attr('r', 4.5)
      .attr('fill', '#10b981')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('opacity', 0);

    const bisectDate = d3.bisector<SystemMetricPoint, Date>(d => new Date(d.timestamp)).left;

    const overlay = g
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all');

    overlay.on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event);
      const xDate = xScale.invert(mx);
      const index = bisectDate(data, xDate, 1);
      const d0 = data[index - 1];
      const d1 = data[index];
      const d = d0 && d1 ? (xDate.getTime() - new Date(d0.timestamp).getTime() > new Date(d1.timestamp).getTime() - xDate.getTime() ? d1 : d0) : d0 || d1;

      if (!d) return;

      const cx = xScale(new Date(d.timestamp));
      crosshairLine.attr('x1', cx).attr('x2', cx).style('opacity', 1);

      cpuDot
        .attr('cx', cx)
        .attr('cy', yScale(d.cpu_percent))
        .style('opacity', 1);

      memDot
        .attr('cx', cx)
        .attr('cy', yScale(d.memory_percent))
        .style('opacity', 1);

      setHoveredPoint(d);
    });

    overlay.on('mouseleave', () => {
      crosshairLine.style('opacity', 0);
      cpuDot.style('opacity', 0);
      memDot.style('opacity', 0);
      setHoveredPoint(null);
    });
  }, [showThresholdLine]);

  // Render D3 Split Single Metric Chart (for split view)
  const renderSingleChart = useCallback((
    container: HTMLDivElement,
    data: SystemMetricPoint[],
    metricKey: 'cpu_percent' | 'memory_percent',
    color: string,
    gradientId: string,
    label: string
  ) => {
    d3.select(container).selectAll('*').remove();
    if (!data || data.length === 0) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 200;
    const margin = { top: 15, right: 25, bottom: 28, left: 42 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    const defs = svg.append('defs');
    const grad = defs
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.3);
    grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0.02);

    const area = d3
      .area<SystemMetricPoint>()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(new Date(d.timestamp)))
      .y0(innerHeight)
      .y1(d => yScale(d[metricKey]));

    const line = d3
      .line<SystemMetricPoint>()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d[metricKey]));

    g.append('path')
      .datum(data)
      .attr('fill', `url(#${gradientId})`)
      .attr('d', area);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(4)
      .tickFormat((d: any) => d3.timeFormat('%H:%M')(d));

    const yAxis = d3
      .axisLeft(yScale)
      .tickValues([0, 50, 100])
      .tickFormat(d => `${d}%`);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .attr('class', 'text-[var(--text-muted)] font-mono text-[9px]')
      .call(xAxis);

    g.append('g')
      .attr('class', 'text-[var(--text-muted)] font-mono text-[9px]')
      .call(yAxis);
  }, []);

  // ResizeObserver for dynamic SVG responsiveness
  useEffect(() => {
    if (!metricsHistory || metricsHistory.length === 0) return;

    const handleResize = () => {
      if (viewMode === 'combined' && combinedContainerRef.current) {
        renderCombinedChart(combinedContainerRef.current, metricsHistory);
      } else if (viewMode === 'split') {
        if (cpuContainerRef.current) {
          renderSingleChart(cpuContainerRef.current, metricsHistory, 'cpu_percent', '#22d3ee', 'split-cpu', 'CPU');
        }
        if (memoryContainerRef.current) {
          renderSingleChart(memoryContainerRef.current, metricsHistory, 'memory_percent', '#10b981', 'split-mem', 'Memory');
        }
      }
    };

    handleResize();

    const observer = new ResizeObserver(() => {
      handleResize();
    });

    if (viewMode === 'combined' && combinedContainerRef.current) {
      observer.observe(combinedContainerRef.current);
    } else if (viewMode === 'split') {
      if (cpuContainerRef.current) observer.observe(cpuContainerRef.current);
      if (memoryContainerRef.current) observer.observe(memoryContainerRef.current);
    }

    return () => observer.disconnect();
  }, [metricsHistory, viewMode, renderCombinedChart, renderSingleChart]);

  // Compute stats
  const latestMetric = metricsHistory[metricsHistory.length - 1] || {
    cpu_percent: healthStatus?.cpu?.usage_percent || 32.4,
    memory_percent: healthStatus?.memory?.usage_percent || 42.1,
    memory_used_mb: healthStatus?.memory?.used_mb || 1724.5,
    memory_total_mb: healthStatus?.memory?.total_mb || 4096.0,
    active_requests: 18,
    latency_avg_ms: 24
  };

  const peakCpu = metricsHistory.length > 0
    ? Math.max(...metricsHistory.map(m => m.cpu_percent))
    : latestMetric.cpu_percent;

  const peakMemory = metricsHistory.length > 0
    ? Math.max(...metricsHistory.map(m => m.memory_percent))
    : latestMetric.memory_percent;

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner & Polling Controls */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-color)] bg-[var(--badge-bg)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                D3 Telemetry Engine
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)]">
                <Clock className="w-3 h-3" />
                60-Minute Rolling History
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Subsystem CPU & Memory Usage Trends
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Real-time D3 time-series visualization powered by <code className="font-mono text-blue-400">GET /health</code> status API and runtime metrics telemetry.
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
                  className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs rounded px-2 py-1 outline-none font-mono cursor-pointer"
                >
                  <option value={1000}>1s interval</option>
                  <option value={3000}>3s interval</option>
                  <option value={5000}>5s interval</option>
                  <option value={10000}>10s interval</option>
                </select>
              )}
            </div>

            {/* Manual Sync Button */}
            <button
              onClick={() => fetchHealthData()}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg text-xs font-medium text-[var(--text-primary)] transition cursor-pointer disabled:opacity-50"
              title="Sync metrics immediately"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent-color)] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>

            {/* Simulate Stress Load Spike Button */}
            <button
              onClick={handleSimulateSpike}
              disabled={isSimulatingSpike}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold rounded-lg text-xs transition cursor-pointer shadow-xs"
            >
              <Zap className="w-3.5 h-3.5 text-rose-400" />
              <span>{isSimulatingSpike ? 'Injecting Spike...' : 'Simulate Load Spike'}</span>
            </button>
          </div>
        </div>

        {/* Top KPI Summary Metrics Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
          {/* CPU Status Card */}
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" />
                CPU LOAD TREND
              </span>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">
                8 CORES
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                {latestMetric.cpu_percent}%
              </span>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                Peak: <strong className="text-cyan-400">{peakCpu}%</strong>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-color)]/60 pt-1.5">
              <span>Load Avg:</span>
              <span className="text-[var(--text-secondary)] font-semibold">
                {healthStatus?.cpu?.load_average?.join(' / ') || '1.34 / 1.28 / 1.15'}
              </span>
            </div>
          </div>

          {/* Memory Status Card */}
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-emerald-400" />
                MEMORY UTILIZATION
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">
                {latestMetric.memory_percent}%
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                {latestMetric.memory_used_mb}
              </span>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                / {latestMetric.memory_total_mb} MB
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-color)]/60 pt-1.5">
              <span>Peak: <strong className="text-emerald-400">{peakMemory}%</strong></span>
              <span>Heap: {healthStatus?.memory?.heap_used_mb || Math.round(latestMetric.memory_used_mb * 0.28)} MB</span>
            </div>
          </div>

          {/* API Health & Uptime Card */}
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                <Server className="w-3 h-3 text-blue-400" />
                API HEALTH & UPTIME
              </span>
              {healthStatus?.status === 'degraded' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  DEGRADED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  HEALTHY
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                {formatUptime(healthStatus?.uptime_seconds || 7200)}
              </span>
              <span className="text-xs font-mono text-blue-400 font-semibold">
                Port :{healthStatus?.port || 3410}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-color)]/60 pt-1.5">
              <span>Server PID: {healthStatus?.pid || 14820}</span>
              <span>Req Rate: {latestMetric.active_requests} req/s</span>
            </div>
          </div>

          {/* Telemetry Window Card */}
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                  <Activity className="w-3 h-3 text-purple-400" />
                  TELEMETRY WINDOW
                </span>
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                  60 Samples
                </span>
              </div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Last 1 Hour (1m Tick Interval)
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-color)]/60 pt-1.5">
              <span>Avg Latency:</span>
              <span className="text-emerald-400 font-semibold">{latestMetric.latency_avg_ms} ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main D3 Visualizer Chart Section */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 shadow-xs space-y-4">
        {/* Chart Top Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase font-mono tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent-color)]" />
              1-Hour System Telemetry Trends
            </h3>

            {/* Legend Badges */}
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-1 rounded bg-cyan-400 block" />
                <span className="text-[var(--text-secondary)]">CPU (%)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-1 rounded bg-emerald-400 block" />
                <span className="text-[var(--text-secondary)]">Memory (%)</span>
              </span>
              {showThresholdLine && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t border-dashed border-rose-500 block" />
                  <span className="text-[var(--text-muted)]">80% Limit</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Threshold toggle */}
            <button
              onClick={() => setShowThresholdLine(!showThresholdLine)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                showThresholdLine
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 font-semibold'
                  : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              80% Line {showThresholdLine ? 'ON' : 'OFF'}
            </button>

            {/* View Mode Switcher (Combined vs Split) */}
            <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('combined')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1 ${
                  viewMode === 'combined'
                    ? 'bg-[var(--accent-color)] text-white font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                Overlay
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1 ${
                  viewMode === 'split'
                    ? 'bg-[var(--accent-color)] text-white font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Minimize2 className="w-3 h-3" />
                Split Views
              </button>
            </div>
          </div>
        </div>

        {/* Hover Crosshair Tooltip Bar */}
        <div className="min-h-[2.25rem] px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono transition-all">
          {hoveredPoint ? (
            <div className="w-full flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)] text-white text-[10px] font-bold">
                  SAMPLE AT
                </span>
                <span className="font-bold text-[var(--text-primary)]">
                  {new Date(hoveredPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center gap-5">
                <span>
                  CPU: <strong className="text-cyan-400">{hoveredPoint.cpu_percent}%</strong>
                </span>
                <span>
                  MEM: <strong className="text-emerald-400">{hoveredPoint.memory_percent}%</strong>
                  <span className="text-[var(--text-muted)] ml-1">({hoveredPoint.memory_used_mb} MB)</span>
                </span>
                <span>
                  REQ: <strong className="text-purple-400">{hoveredPoint.active_requests} req/s</strong>
                </span>
                <span>
                  LATENCY: <strong className="text-blue-400">{hoveredPoint.latency_avg_ms} ms</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[var(--text-muted)] flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              <span>Hover over any point on the D3 chart below to inspect minute-level telemetry samples.</span>
            </div>
          )}
        </div>

        {/* D3 Chart Canvas Area */}
        {isLoading ? (
          <div className="h-80 flex flex-col items-center justify-center gap-3 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent-color)]" />
            <span>Rendering D3 time-series visualization...</span>
          </div>
        ) : viewMode === 'combined' ? (
          <div
            ref={combinedContainerRef}
            className="w-full h-80 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)] relative overflow-hidden p-2"
          />
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-1 px-1">
                CPU Usage Trend (%) — Last 60 Minutes
              </div>
              <div
                ref={cpuContainerRef}
                className="w-full h-44 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)] overflow-hidden p-2"
              />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider mb-1 px-1">
                Memory Usage Trend (%) — Last 60 Minutes
              </div>
              <div
                ref={memoryContainerRef}
                className="w-full h-44 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)] overflow-hidden p-2"
              />
            </div>
          </div>
        )}

        {/* Chart Bottom Info Line */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span>X-Axis: Time (EST/UTC)</span>
            <span>•</span>
            <span>Y-Axis: Utilization (0–100%)</span>
          </div>
          <div>
            {lastUpdated && <span>Last synced at {lastUpdated}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
