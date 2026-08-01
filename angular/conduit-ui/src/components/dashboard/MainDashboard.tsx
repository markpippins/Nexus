import React, { useState, useMemo } from 'react';
import {
  Activity,
  Zap,
  ShieldCheck,
  DollarSign,
  Cpu,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileCode,
  Layers,
  Search,
  X,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  ImplementationPlan,
  WorkRequestDCO,
  ModelChainConfig,
  SystemStatus,
} from '../../types/conduit';
import { PlanGanttChart } from './PlanGanttChart';
import { PerformanceMetricsCard } from './PerformanceMetricsCard';
import { RecentActivityWidget } from './RecentActivityWidget';
import { TokenSparkline } from './TokenSparkline';

interface MainDashboardProps {
  plans: ImplementationPlan[];
  workRequests: WorkRequestDCO[];
  modelChains: ModelChainConfig[];
  status: SystemStatus;
  onNavigateTab: (tabId: string) => void;
  onSelectPlan: (planId: string) => void;
}

// Chart mock time series for dispatch velocity
const PIPELINE_VELOCITY_DATA = [
  { time: '08:00', dispatches: 4, receipts: 4, tokensK: 120 },
  { time: '09:00', dispatches: 7, receipts: 6, tokensK: 240 },
  { time: '10:00', dispatches: 12, receipts: 11, tokensK: 380 },
  { time: '11:00', dispatches: 9, receipts: 9, tokensK: 310 },
  { time: '12:00', dispatches: 15, receipts: 14, tokensK: 490 },
  { time: '13:00', dispatches: 18, receipts: 17, tokensK: 560 },
];

export const MainDashboard: React.FC<MainDashboardProps> = ({
  plans,
  workRequests,
  modelChains,
  status,
  onNavigateTab,
  onSelectPlan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Available status chips with counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: plans.length,
      ACTIVE: 0,
      PLANNING: 0,
      COMPLETED: 0,
      BLOCKED: 0,
    };
    plans.forEach((p) => {
      const st = p.status ? p.status.toUpperCase() : 'OTHER';
      if (counts[st] !== undefined) {
        counts[st] += 1;
      } else if (st === 'PENDING' || st === 'PROPOSED') {
        counts['PLANNING'] = (counts['PLANNING'] || 0) + 1;
      } else {
        counts[st] = (counts[st] || 0) + 1;
      }
    });
    return counts;
  }, [plans]);

  // Real-time filtered plans by status chip and title/status/ID/ticket query
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      // Status Filter
      if (selectedStatus !== 'ALL') {
        const st = p.status ? p.status.toUpperCase() : '';
        if (selectedStatus === 'PLANNING') {
          if (st !== 'PLANNING' && st !== 'PENDING' && st !== 'PROPOSED') return false;
        } else if (st !== selectedStatus) {
          return false;
        }
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery =
          p.title.toLowerCase().includes(query) ||
          p.status.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query) ||
          p.ticketId.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [plans, selectedStatus, searchQuery]);

  // Compute key stats
  const activePlansCount = plans.filter((p) => p.status === 'ACTIVE').length;
  const totalCostUsd = plans.reduce((acc, p) => acc + p.costUsd, 0);
  const totalTokens = plans.reduce((acc, p) => acc + p.tokenCount, 0);
  const totalBudgetUsd = modelChains.reduce((acc, c) => acc + c.budgetCapUsd, 0);
  const activeWorkRequests = workRequests.filter((wr) => wr.attemptStatus === 'IN_PROGRESS');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100">
      {/* Top Welcome / Status Headline Banner with Real-time Search */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Control Plane Overview
            </h1>
            <span className="bg-blue-900/30 border border-blue-800/50 text-blue-400 text-[10px] font-mono font-semibold px-2 py-0.5 rounded uppercase">
              Auto-Orchestrating
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-sans leading-relaxed">
            PostgreSQL <code className="text-blue-300 font-mono bg-zinc-800/60 px-1 py-0.5 rounded">nexus</code> orchestrator driving hierarchical plan decomposition, model chain resilience, and deterministic WRP Kernel replay.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Real-time Search Input Field */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title or status..."
              className="bg-zinc-900 border border-zinc-700/80 rounded pl-8 pr-7 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-blue-500 w-52 sm:w-64 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-zinc-400 hover:text-zinc-200"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => onNavigateTab('kanban_boards')}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Process Kanban</span>
          </button>
          <button
            onClick={() => onNavigateTab('deliberation')}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-medium text-xs rounded transition-colors flex items-center gap-1.5"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span>Deliberation Surface</span>
          </button>
        </div>
      </div>

      {/* Status Chips Filter Bar */}
      <div className="flex items-center justify-between bg-[#141416] border border-zinc-800 rounded-lg p-2.5 px-4 font-mono text-xs flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider mr-1">Status Filter:</span>
          {[
            { key: 'ALL', label: 'ALL' },
            { key: 'ACTIVE', label: 'ACTIVE' },
            { key: 'PLANNING', label: 'PLANNING' },
            { key: 'COMPLETED', label: 'COMPLETED' },
            { key: 'BLOCKED', label: 'BLOCKED' },
          ].map((chip) => {
            const count = statusCounts[chip.key] || 0;
            const isSelected = selectedStatus === chip.key;

            let activeStyle = 'bg-blue-600 text-white border-blue-500 shadow-sm';
            if (chip.key === 'ACTIVE') activeStyle = 'bg-blue-600 text-white border-blue-400 shadow-sm';
            if (chip.key === 'PLANNING') activeStyle = 'bg-amber-600 text-white border-amber-400 shadow-sm';
            if (chip.key === 'COMPLETED') activeStyle = 'bg-emerald-600 text-white border-emerald-400 shadow-sm';
            if (chip.key === 'BLOCKED') activeStyle = 'bg-rose-600 text-white border-rose-400 shadow-sm';

            return (
              <button
                key={chip.key}
                onClick={() => setSelectedStatus(chip.key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? activeStyle
                    : 'bg-zinc-900/90 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? 'bg-black/30 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-zinc-400 font-mono">
          Showing <strong className="text-white">{filteredPlans.length}</strong> of{' '}
          <strong className="text-zinc-400">{plans.length}</strong> plans
        </div>
      </div>

      {/* Top 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Execution Leases */}
        <div className="bg-[#141416]/90 border border-zinc-800 rounded-lg p-4 shadow-sm hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono uppercase tracking-wider mb-2 font-bold">
            <span>ACTIVE LEASES (ADR-006)</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-white">
              {activeWorkRequests.length}
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
              Leases Lock Active
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 font-mono">
            TTL Mutual Exclusion enforced
          </p>
        </div>

        {/* Metric 2: Active Plans */}
        <div className="bg-[#141416]/90 border border-zinc-800 rounded-lg p-4 shadow-sm hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono uppercase tracking-wider mb-2 font-bold">
            <span>EXECUTING PLANS</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-white">
              {activePlansCount} / {plans.length}
            </span>
            <span className="text-[10px] font-mono text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-700/40">
              Receipt Chained
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 font-mono">
            Planner → Builder → Reviewer loop
          </p>
        </div>

        {/* Metric 3: Token Usage & Cost */}
        <div className="bg-[#141416]/90 border border-zinc-800 rounded-lg p-4 shadow-sm hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono uppercase tracking-wider mb-2 font-bold">
            <span>TOTAL BUDGET</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-emerald-400">
              ${totalCostUsd.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-zinc-500">
              / ${totalBudgetUsd.toFixed(0)}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full"
              style={{
                width: `${Math.min(100, (totalCostUsd / totalBudgetUsd) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Metric 4: WRP Kernel Replay State */}
        <div className="bg-[#141416]/90 border border-zinc-800 rounded-lg p-4 shadow-sm hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono uppercase tracking-wider mb-2 font-bold">
            <span>WRP KERNEL STATE</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-white">
              {(totalTokens / 1000).toFixed(0)}k
            </span>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
              Tokens Evaluated
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 font-mono">
            FastAPI port 3103 synced
          </p>
        </div>
      </div>

      {/* Interactive Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Velocity Chart (2 cols) */}
        <div className="lg:col-span-2 bg-[#141416] border border-zinc-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wide">
                Pipeline Dispatch & Receipt Rate
              </h2>
              <p className="text-xs text-zinc-500">
                WorkRequest dispatches vs deterministic execution receipts issued
              </p>
            </div>
            <span className="text-[10px] font-mono text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded border border-blue-800/40">
              Realtime Poll
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PIPELINE_VELOCITY_DATA}>
                <defs>
                  <linearGradient id="colorDispatches" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReceipts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="time" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141416',
                    borderColor: '#27272a',
                    borderRadius: '0.375rem',
                    color: '#f4f4f5',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="dispatches"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDispatches)"
                  name="Dispatches"
                />
                <Area
                  type="monotone"
                  dataKey="receipts"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorReceipts)"
                  name="Receipts"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Chain Fallback & Usage (1 col) */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wide">
                Role Model Usage
              </h2>
              <p className="text-xs text-zinc-500">Budget allocation per role</p>
            </div>
            <button
              onClick={() => onNavigateTab('model_chain')}
              className="text-xs font-mono text-blue-400 hover:underline flex items-center gap-1"
            >
              Config <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={modelChains.map((mc) => ({
                  role: mc.role,
                  usage: mc.currentUsageUsd,
                  cap: mc.budgetCapUsd,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="role" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141416',
                    borderColor: '#27272a',
                    borderRadius: '0.375rem',
                    color: '#f4f4f5',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
                <Bar dataKey="usage" fill="#3b82f6" name="Used ($)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Performance Metrics Card */}
      <PerformanceMetricsCard plans={filteredPlans} />

      {/* Recent Activity Stream Widget */}
      <RecentActivityWidget
        plans={filteredPlans}
        workRequests={workRequests}
        onSelectPlan={onSelectPlan}
      />

      {/* Gantt Timeline & Token Density Visualization */}
      <PlanGanttChart plans={filteredPlans} onSelectPlan={onSelectPlan} />

      {/* Active Implementation Plans High Contrast Table */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#0c0c0e]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-2">
              <span>Active Implementation Plans & Receipt Chain State</span>
              {searchQuery && (
                <span className="text-[10px] font-normal text-cyan-300 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded font-mono">
                  {filteredPlans.length} of {plans.length} match "{searchQuery}"
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={() => onNavigateTab('kanban_boards')}
            className="text-xs font-mono text-blue-400 hover:underline flex items-center gap-1"
          >
            View All Plans <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="bg-[#0c0c0e] text-zinc-400 text-xs font-mono uppercase tracking-wider border-b border-zinc-800">
                <th className="py-2.5 px-4 font-semibold">Plan ID / Ticket</th>
                <th className="py-2.5 px-4 font-semibold">Title & Description</th>
                <th className="py-2.5 px-4 font-semibold">Role</th>
                <th className="py-2.5 px-4 font-semibold">Active Model</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold">Token Usage Trend (5 Updates)</th>
                <th className="py-2.5 px-4 font-semibold">Cost (USD)</th>
                <th className="py-2.5 px-4 font-semibold text-right">Receipt Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-xs">
              {filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 font-mono text-xs">
                    No implementation plans match your search query "{searchQuery}".
                    <button
                      onClick={() => setSearchQuery('')}
                      className="ml-2 text-blue-400 hover:underline"
                    >
                      Clear search
                    </button>
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan) => {
                  const latestReceipt = plan.receipts[plan.receipts.length - 1];
                  return (
                    <tr
                      key={plan.id}
                      onClick={() => onSelectPlan(plan.id)}
                      className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-zinc-300 font-bold whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400">{plan.id}</span>
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700 font-mono">
                            {plan.ticketId}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-semibold text-zinc-100 truncate">{plan.title}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{plan.description}</div>
                      </td>
                      <td className="py-3 px-4 font-mono capitalize">
                        <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 text-[11px]">
                          {plan.currentRole}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-cyan-300">{plan.activeModel}</td>
                      <td className="py-3 px-4 font-mono">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                            plan.status === 'ACTIVE'
                              ? 'bg-blue-950/80 text-blue-300 border-blue-500/60 shadow-sm'
                              : plan.status === 'COMPLETED'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 shadow-sm'
                              : plan.status === 'PLANNING' || plan.status === 'PENDING' || plan.status === 'PROPOSED'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 shadow-sm'
                              : plan.status === 'BLOCKED'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-sm'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {plan.status === 'ACTIVE' && <Activity className="w-3 h-3 text-blue-400 animate-pulse" />}
                          {plan.status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          {(plan.status === 'PLANNING' || plan.status === 'PENDING' || plan.status === 'PROPOSED') && (
                            <Clock className="w-3 h-3 text-amber-400" />
                          )}
                          {plan.status === 'BLOCKED' && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                          {plan.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <TokenSparkline plan={plan} />
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-200">
                        ${plan.costUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-zinc-500 text-[11px]">
                        {latestReceipt ? (
                          <span title={latestReceipt.hash}>
                            {latestReceipt.hash.substring(0, 12)}...
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
