import React, { useState, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu,
  BarChart2,
  ArrowUpDown,
  Filter,
  Info,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { ImplementationPlan, WRPState } from '../../types/conduit';

interface PlanGanttChartProps {
  plans: ImplementationPlan[];
  onSelectPlan: (planId: string) => void;
}

type SortKey = 'startDate' | 'tokens' | 'status' | 'cost';
type FilterStatus = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'BLOCKED' | 'PENDING';

export const PlanGanttChart: React.FC<PlanGanttChartProps> = ({
  plans: rawPlans,
  onSelectPlan,
}) => {
  const plans = Array.isArray(rawPlans) ? rawPlans : [];
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [activeTab, setActiveTab] = useState<'gantt' | 'token_density'>('gantt');
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
  const [hoveredReceiptId, setHoveredReceiptId] = useState<string | null>(null);

  // Filter plans
  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      if (filterStatus === 'ALL') return true;
      if (filterStatus === 'ACTIVE') return plan.status === 'ACTIVE' || plan.status === 'EXECUTING';
      if (filterStatus === 'COMPLETED') return plan.status === 'COMPLETED';
      if (filterStatus === 'BLOCKED') return plan.status === 'BLOCKED';
      if (filterStatus === 'PENDING') return plan.status === 'PENDING' || plan.status === 'PROPOSED' || plan.status === 'PLANNING';
      return plan.status === filterStatus;
    });
  }, [plans, filterStatus]);

  // Sort plans
  const sortedPlans = useMemo(() => {
    return [...filteredPlans].sort((a, b) => {
      if (sortKey === 'startDate') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortKey === 'tokens') {
        return b.tokenCount - a.tokenCount;
      }
      if (sortKey === 'cost') {
        return b.costUsd - a.costUsd;
      }
      if (sortKey === 'status') {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });
  }, [filteredPlans, sortKey]);

  // Compute time boundaries
  const timeBoundaries = useMemo(() => {
    if (plans.length === 0) {
      const now = Date.now();
      return { minTime: now - 86400000, maxTime: now, totalDuration: 86400000 };
    }

    let min = Infinity;
    let max = -Infinity;

    plans.forEach((p) => {
      const start = new Date(p.createdAt).getTime();
      const end = new Date(p.updatedAt).getTime();
      if (start < min) min = start;
      if (end > max) max = end;

      p.receipts.forEach((r) => {
        const rTime = new Date(r.issuedAt).getTime();
        if (rTime < min) min = rTime;
        if (rTime > max) max = rTime;
      });
    });

    const now = Date.now();
    if (now > max) max = now;

    // Pad by 6 hours on each side
    const pad = 6 * 3600 * 1000;
    min = min - pad;
    max = max + pad;
    const totalDuration = Math.max(1, max - min);

    return { minTime: min, maxTime: max, totalDuration };
  }, [plans]);

  // Time ticks for X axis (5 ticks)
  const timeTicks = useMemo(() => {
    const ticks = [];
    const count = 5;
    const step = timeBoundaries.totalDuration / (count - 1);

    for (let i = 0; i < count; i++) {
      const t = timeBoundaries.minTime + step * i;
      const d = new Date(t);
      const formatted = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      ticks.push({ time: t, label: formatted, percent: (i / (count - 1)) * 100 });
    }
    return ticks;
  }, [timeBoundaries]);

  // Max tokens for scaling density
  const maxTokens = useMemo(() => {
    return Math.max(...plans.map((p) => p.tokenCount), 1);
  }, [plans]);

  // Status color helper
  const getStatusColor = (status: WRPState) => {
    switch (status) {
      case 'ACTIVE':
      case 'EXECUTING':
        return {
          barBg: 'bg-gradient-to-r from-blue-600/50 to-cyan-500/50',
          border: 'border-blue-500',
          badge: 'bg-blue-950/80 text-blue-300 border-blue-600/50',
          dot: 'bg-blue-400',
        };
      case 'COMPLETED':
        return {
          barBg: 'bg-gradient-to-r from-emerald-600/50 to-teal-500/50',
          border: 'border-emerald-500',
          badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50',
          dot: 'bg-emerald-400',
        };
      case 'BLOCKED':
        return {
          barBg: 'bg-gradient-to-r from-rose-600/50 to-amber-600/50',
          border: 'border-rose-500',
          badge: 'bg-rose-950/80 text-rose-300 border-rose-600/50',
          dot: 'bg-rose-400',
        };
      case 'PENDING':
      case 'PROPOSED':
      case 'PLANNING':
        return {
          barBg: 'bg-gradient-to-r from-amber-600/40 to-yellow-500/40',
          border: 'border-amber-500',
          badge: 'bg-amber-950/80 text-amber-300 border-amber-600/50',
          dot: 'bg-amber-400',
        };
      default:
        return {
          barBg: 'bg-gradient-to-r from-zinc-700/50 to-zinc-600/50',
          border: 'border-zinc-500',
          badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          dot: 'bg-zinc-400',
        };
    }
  };

  const formatTokens = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}k`;
    return `${count}`;
  };

  // Prepare data for Recharts Token Density chart
  const rechartsData = useMemo(() => {
    return sortedPlans.map((p) => ({
      id: p.id,
      title: p.title.length > 25 ? `${p.title.slice(0, 22)}...` : p.title,
      tokensK: Math.round(p.tokenCount / 1000),
      costUsd: p.costUsd,
      status: p.status,
    }));
  }, [sortedPlans]);

  return (
    <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 shadow-sm space-y-4">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-2">
              Implementation Plans Gantt Timeline
              <span className="text-[10px] font-normal text-cyan-400 bg-cyan-950/50 border border-cyan-800/40 px-2 py-0.5 rounded">
                Token & Receipt Overlay
              </span>
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Execution span, receipt milestone checkpoints, and token usage intensity across active plans.
          </p>
        </div>

        {/* View Switcher & Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Tab Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setActiveTab('gantt')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                activeTab === 'gantt'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Gantt Chart</span>
            </button>
            <button
              onClick={() => setActiveTab('token_density')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                activeTab === 'token_density'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              <span>Token Density</span>
            </button>
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono">
            <Filter className="w-3 h-3 text-zinc-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="BLOCKED">Blocked</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono">
            <ArrowUpDown className="w-3 h-3 text-zinc-500" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-transparent text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="startDate">Sort: Timeline</option>
              <option value="tokens">Sort: Token Count</option>
              <option value="cost">Sort: Cost (USD)</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Legend & Stats Summary Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400 bg-zinc-900/60 p-2.5 rounded border border-zinc-800/80 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 uppercase text-[10px] font-bold">Status:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-zinc-300">Active</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-300">Completed</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-zinc-300">Blocked</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-zinc-300">Pending</span>
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <span>
            Plans: <strong className="text-white">{sortedPlans.length}</strong>
          </span>
          <span>
            Total Tokens:{' '}
            <strong className="text-cyan-300 font-bold">
              {formatTokens(sortedPlans.reduce((acc, p) => acc + p.tokenCount, 0))}
            </strong>
          </span>
          <span>
            Total Cost:{' '}
            <strong className="text-emerald-400 font-bold">
              ${sortedPlans.reduce((acc, p) => acc + p.costUsd, 0).toFixed(2)}
            </strong>
          </span>
        </div>
      </div>

      {/* Main View Area */}
      {activeTab === 'gantt' ? (
        <div className="space-y-2">
          {/* Timeline Grid Table Header */}
          <div className="grid grid-cols-12 gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider px-2 py-1 bg-[#0c0c0e] rounded border border-zinc-800">
            <div className="col-span-4 lg:col-span-3 font-semibold flex items-center gap-1">
              <span>Plan Identification</span>
            </div>
            <div className="col-span-8 lg:col-span-9 relative">
              <div className="flex justify-between items-center w-full">
                {timeTicks.map((tick, idx) => (
                  <span
                    key={idx}
                    className="text-zinc-500 font-mono"
                    style={{ position: 'relative' }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Plan Rows */}
          {sortedPlans.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs font-mono">
              No implementation plans match current filter criteria.
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
              {sortedPlans.map((plan) => {
                const colors = getStatusColor(plan.status);
                const startTime = new Date(plan.createdAt).getTime();
                const endTime =
                  plan.status === 'ACTIVE' || plan.status === 'EXECUTING'
                    ? Math.max(new Date(plan.updatedAt).getTime(), Date.now())
                    : new Date(plan.updatedAt).getTime();

                // Percentage math
                const leftPercent = Math.max(
                  0,
                  Math.min(
                    95,
                    ((startTime - timeBoundaries.minTime) / timeBoundaries.totalDuration) * 100
                  )
                );
                const durationPercent = Math.max(
                  4,
                  Math.min(
                    100 - leftPercent,
                    ((endTime - startTime) / timeBoundaries.totalDuration) * 100
                  )
                );

                const tokenDensityRatio = Math.min(100, (plan.tokenCount / maxTokens) * 100);
                const isHovered = hoveredPlanId === plan.id;

                return (
                  <div
                    key={plan.id}
                    onMouseEnter={() => setHoveredPlanId(plan.id)}
                    onMouseLeave={() => {
                      setHoveredPlanId(null);
                      setHoveredReceiptId(null);
                    }}
                    onClick={() => onSelectPlan(plan.id)}
                    className={`grid grid-cols-12 gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isHovered
                        ? 'bg-zinc-800/80 border-blue-500/80 shadow-md'
                        : 'bg-[#0e0e10] border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    {/* Left Column: Plan Metadata */}
                    <div className="col-span-4 lg:col-span-3 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-blue-400 hover:underline truncate">
                          {plan.id}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${colors.badge}`}
                        >
                          {plan.status}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-zinc-200 truncate" title={plan.title}>
                        {plan.title}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 gap-1">
                        <span className="text-zinc-400 truncate">
                          Model: <span className="text-cyan-300">{plan.activeModel}</span>
                        </span>
                        <span className="text-amber-300/90 font-bold shrink-0">
                          {formatTokens(plan.tokenCount)} tok
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Interactive Gantt Bar & Receipts */}
                    <div className="col-span-8 lg:col-span-9 relative flex items-center">
                      {/* Grid background guide lines */}
                      <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20 border-x border-zinc-700">
                        <div className="w-px bg-zinc-700 h-full" />
                        <div className="w-px bg-zinc-700 h-full" />
                        <div className="w-px bg-zinc-700 h-full" />
                        <div className="w-px bg-zinc-700 h-full" />
                      </div>

                      {/* Timeline Bar Container */}
                      <div className="relative w-full h-9 bg-zinc-900/80 rounded border border-zinc-800 overflow-visible flex items-center">
                        {/* Main Execution Duration Bar */}
                        <div
                          className={`absolute h-7 rounded border ${colors.barBg} ${colors.border} flex items-center px-2 transition-all shadow-sm group`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${durationPercent}%`,
                          }}
                        >
                          {/* Inner Token Density Highlight Bar */}
                          <div
                            className="absolute bottom-0 left-0 h-1 bg-cyan-400/80 rounded-b"
                            style={{ width: `${tokenDensityRatio}%` }}
                            title={`Token Density: ${formatTokens(plan.tokenCount)} tokens`}
                          />

                          {/* Bar Content Label */}
                          <div className="text-[10px] font-mono font-bold text-white truncate drop-shadow z-10 flex items-center gap-1.5 w-full justify-between">
                            <span className="truncate">
                              {plan.currentRole} • {formatTokens(plan.tokenCount)}
                            </span>
                            <span className="text-emerald-300 shrink-0 font-sans font-semibold">
                              ${plan.costUsd.toFixed(2)}
                            </span>
                          </div>

                          {/* Receipt Milestones Dots */}
                          {plan.receipts.map((rcp, idx) => {
                            const rTime = new Date(rcp.issuedAt).getTime();
                            const rPercent = Math.max(
                              0,
                              Math.min(
                                100,
                                ((rTime - startTime) / Math.max(1, endTime - startTime)) * 100
                              )
                            );
                            const isRcpHovered = hoveredReceiptId === rcp.id;

                            return (
                              <div
                                key={rcp.id || idx}
                                onMouseEnter={(e) => {
                                  e.stopPropagation();
                                  setHoveredReceiptId(rcp.id);
                                }}
                                onMouseLeave={() => setHoveredReceiptId(null)}
                                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white/80 cursor-pointer transition-transform hover:scale-150 z-20 ${
                                  rcp.receiptType === 'BLOCK'
                                    ? 'bg-rose-500'
                                    : rcp.receiptType === 'REVIEW_PASS'
                                    ? 'bg-emerald-400'
                                    : 'bg-blue-400'
                                }`}
                                style={{ left: `${rPercent}%` }}
                              >
                                {isRcpHovered && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-[#18181b] border border-zinc-700 rounded shadow-xl text-[10px] font-mono text-zinc-200 z-50 pointer-events-none">
                                    <div className="font-bold text-blue-400">{rcp.receiptType}</div>
                                    <div className="text-zinc-400">{rcp.id}</div>
                                    <div className="text-zinc-500">
                                      {new Date(rcp.issuedAt).toLocaleTimeString()}
                                    </div>
                                    <div className="text-zinc-300 truncate mt-1">
                                      Hash: {rcp.hash.substring(0, 10)}...
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Token Density Recharts Section */
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Token Usage & Cost Profile per Implementation Plan
            </h3>
            <span className="text-[10px] font-mono text-zinc-500">
              Bar Height = Tokens (k) • Color = Status
            </span>
          </div>

          <div className="h-64 w-full bg-[#0c0c0e] p-3 rounded-lg border border-zinc-800">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rechartsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="id" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  unit="k"
                  name="Tokens (k)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141416',
                    borderColor: '#27272a',
                    borderRadius: '0.375rem',
                    color: '#f4f4f5',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                  formatter={(value: any, name: string) => [
                    name === 'tokensK' ? `${value}k Tokens` : `$${value}`,
                    name === 'tokensK' ? 'Token Volume' : 'Est. Cost',
                  ]}
                />
                <Bar dataKey="tokensK" name="Tokens (k)" radius={[4, 4, 0, 0]}>
                  {rechartsData.map((entry, index) => {
                    let fill = '#3b82f6';
                    if (entry.status === 'COMPLETED') fill = '#10b981';
                    if (entry.status === 'BLOCKED') fill = '#f43f5e';
                    if (entry.status === 'PENDING') fill = '#f59e0b';
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
