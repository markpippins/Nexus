import React from 'react';
import { 
  FileCode2, 
  Clock, 
  PlayCircle, 
  GitBranch, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Cpu, 
  ArrowUpRight, 
  Activity,
  Layers,
  Database
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  NavTab, 
  ExecutionInlineHealth, 
  StatusDistributionResponse, 
  IntegrityScanResponse,
  ExecutorFleetSummary
} from '../types';

interface DashboardViewProps {
  inlineHealth: ExecutionInlineHealth | null;
  statusDist: StatusDistributionResponse | null;
  scanResult: IntegrityScanResponse | null;
  fleetList: ExecutorFleetSummary[];
  setCurrentTab: (tab: NavTab) => void;
  onSelectRequest: (id: string) => void;
  onSelectLease: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  inlineHealth,
  statusDist,
  scanResult,
  fleetList,
  setCurrentTab,
  onSelectRequest,
  onSelectLease
}) => {
  // Chart Colors
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

  // Prepare chart data for Requests Status
  const reqChartData = statusDist ? Object.entries(statusDist.requests).map(([status, count]) => ({
    name: status,
    count
  })) : [
    { name: 'COMPLETED', count: 204 },
    { name: 'READY', count: 45 },
    { name: 'RUNNING', count: 28 },
    { name: 'FAILED', count: 24 },
    { name: 'PENDING', count: 18 },
    { name: 'CANCELLED', count: 4 }
  ];

  // Prepare chart data for Lease Status
  const leaseChartData = statusDist ? Object.entries(statusDist.leases).map(([status, count]) => ({
    name: status,
    count
  })) : [
    { name: 'RELEASED', count: 265 },
    { name: 'ACTIVE', count: 32 },
    { name: 'EXPIRED', count: 24 }
  ];

  // Prepare chart data for Attempt Status
  const attemptChartData = statusDist ? Object.entries(statusDist.attempts).map(([status, count]) => ({
    name: status,
    count
  })) : [
    { name: 'SUCCEEDED', count: 260 },
    { name: 'RUNNING', count: 28 },
    { name: 'FAILED', count: 22 },
    { name: 'TIMED_OUT', count: 6 },
    { name: 'CREATED', count: 5 }
  ];

  // Prepare chart data for Receipts Event Types
  const receiptChartData = statusDist ? Object.entries(statusDist.receipts).map(([type, count]) => ({
    name: type.replace('EXECUTION_', ''),
    count
  })) : [];

  const totalPathologies = scanResult?.total_issues_count ?? 8;
  const staleLeasesCount = inlineHealth?.stale_active_leases ?? 8;

  return (
    <div className="p-6 space-y-4 font-sans text-zinc-100 overflow-y-auto max-w-7xl mx-auto">
      {/* Top Banner: Integrity Warning / Health Summary */}
      {staleLeasesCount > 0 && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-300 font-mono text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-amber-200">Enforcement Gap Detected:</span>{' '}
              <span>{staleLeasesCount} ACTIVE leases have passed expires_at without release receipts.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentTab('leases')}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold transition-colors"
            >
              Inspect Stale Leases
            </button>
            <button
              onClick={() => setCurrentTab('integrity-scan')}
              className="px-3 py-1.5 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-zinc-200 border border-[#3f3f46] transition-colors"
            >
              Integrity Scan ({totalPathologies})
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid (Bento Top Row) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Requests */}
        <div 
          onClick={() => setCurrentTab('requests')}
          className="p-4 bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-blue-500/50 rounded-xl transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
        >
          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileCode2 className="w-4 h-4 text-blue-400" />
              READY REQUESTS
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
          </div>
          <div className="text-3xl font-mono font-bold mt-2 text-zinc-100">
            {inlineHealth?.total_requests ?? 323}
          </div>
          <div className="mt-2 text-[11px] text-emerald-400 font-mono">
            +{inlineHealth?.ready_requests ?? 45} READY in queue
          </div>
        </div>

        {/* KPI 2: Leases */}
        <div 
          onClick={() => setCurrentTab('leases')}
          className="p-4 bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-amber-500/50 rounded-xl transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
        >
          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              ACTIVE LEASES
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
          </div>
          <div className="text-3xl font-mono font-bold mt-2 text-zinc-100 flex items-baseline gap-2">
            <span>{inlineHealth?.total_leases ?? 321}</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-400 font-mono underline">
            {staleLeasesCount} expired unreleased
          </div>
        </div>

        {/* KPI 3: Attempts */}
        <div 
          onClick={() => setCurrentTab('attempts')}
          className="p-4 bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-emerald-500/50 rounded-xl transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
        >
          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <PlayCircle className="w-4 h-4 text-emerald-400" />
              RUNNING ATTEMPTS
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-emerald-400 transition-opacity" />
          </div>
          <div className="text-3xl font-mono font-bold mt-2 text-zinc-100">
            {inlineHealth?.running_attempts ?? 28}
          </div>
          <div className="mt-2 text-[11px] text-blue-400 font-mono">
            Executing on 6 nodes
          </div>
        </div>

        {/* KPI 4: Integrity Alerts */}
        <div 
          onClick={() => setCurrentTab('integrity-scan')}
          className="p-4 bg-[#18181b] hover:bg-[#202024] border border-amber-500/30 hover:border-amber-500/60 rounded-xl transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
        >
          <div className="text-xs text-amber-500 font-bold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              INTEGRITY ALERTS
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
          </div>
          <div className="text-3xl font-mono font-bold mt-2 text-amber-500">
            0{totalPathologies}
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 font-mono">
            Across 5 pathology kinds
          </div>
        </div>
      </div>

      {/* Main Charts & Distribution Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Requests & Leases Status Breakdown */}
        <div className="p-5 bg-[#18181b] border border-[#27272a] rounded-xl font-mono space-y-4">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Requests Status Distribution
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">Real-Time Postgres View</span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reqChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '11px', color: '#fafafa' }}
                  cursor={{ fill: '#27272a' }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {reqChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Attempts Status Distribution */}
        <div className="p-5 bg-[#18181b] border border-[#27272a] rounded-xl font-mono space-y-4">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Attempts Outcome Distribution
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">321 Executions</span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={attemptChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="count"
                >
                  {attemptChartData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '11px', color: '#fafafa' }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Executor Fleet Health & Cross-Table Integrity Scan Quick Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono">
        {/* Executor Fleet Workload Grid (2 Columns) */}
        <div className="lg:col-span-2 p-5 bg-[#18181b] border border-[#27272a] rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Executor Fleet Workload & Stale Leases
              </span>
            </div>
            <button 
              onClick={() => setCurrentTab('fleet')}
              className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
            >
              View Fleet
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fleetList.map(executor => {
              const isStale = executor.health_status === 'STALE_LEASES';
              return (
                <div 
                  key={executor.executor_id}
                  onClick={() => setCurrentTab('fleet')}
                  className="p-3.5 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] rounded-lg transition-all cursor-pointer flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-zinc-100 truncate">{executor.executor_id}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded border font-mono ${
                      isStale 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    }`}>
                      {executor.health_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] text-zinc-400 pt-2 border-t border-[#27272a]">
                    <div>
                      <span className="block text-zinc-500">Active Leases</span>
                      <span className="text-zinc-200 font-bold">{executor.active_leases_count}</span>
                    </div>
                    <div>
                      <span className="block text-zinc-500">Running</span>
                      <span className="text-emerald-400 font-bold">{executor.in_progress_attempts_count}</span>
                    </div>
                    <div>
                      <span className="block text-zinc-500">Total Handled</span>
                      <span className="text-zinc-200 font-bold">{executor.total_requests_handled}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Integrity Scanner Pathology Breakdown Quick Card (1 Column) */}
        <div className="p-5 bg-[#18181b] border border-[#27272a] rounded-xl space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Integrity Pathologies
                </span>
              </div>
              <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                {totalPathologies} Issues
              </span>
            </div>

            <p className="text-[11px] text-zinc-400">
              Scans for orphans, stale active leases, divergent request/attempt statuses, and unreleased terminal leases.
            </p>

            <div className="space-y-2 pt-1">
              {scanResult?.items.slice(0, 4).map((item) => (
                <div 
                  key={item.kind}
                  onClick={() => setCurrentTab('integrity-scan')}
                  className="p-2.5 bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] rounded-lg flex items-center justify-between text-xs cursor-pointer"
                >
                  <span className="truncate text-zinc-300 text-[11px]">{item.title}</span>
                  <span className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${
                    item.count > 0 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setCurrentTab('integrity-scan')}
            className="w-full mt-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <span>Launch Full Integrity Scanner</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
