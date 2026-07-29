import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Clock,
  DollarSign,
  BarChart2,
  Activity,
  Layers,
  Award,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ImplementationPlan } from '../../types/conduit';

interface PerformanceMetricsCardProps {
  plans: ImplementationPlan[];
}

type GroupBy = 'status' | 'role' | 'plan';

export const PerformanceMetricsCard: React.FC<PerformanceMetricsCardProps> = ({ plans }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [metricFocus, setMetricFocus] = useState<'both' | 'cost' | 'duration'>('both');

  // Overall Averages
  const overallMetrics = useMemo(() => {
    if (!plans || plans.length === 0) {
      return { avgCost: 0, avgDurationMin: 0, totalPlans: 0, avgTokens: 0 };
    }

    let totalCost = 0;
    let totalDurationMs = 0;
    let totalTokens = 0;

    plans.forEach((p) => {
      totalCost += p.costUsd || 0;
      totalTokens += p.tokenCount || 0;
      const start = new Date(p.createdAt).getTime();
      const end = new Date(p.updatedAt).getTime();
      const diff = Math.max(300000, end - start); // Min 5 mins for realistic display
      totalDurationMs += diff;
    });

    const count = plans.length;
    return {
      avgCost: totalCost / count,
      avgDurationMin: totalDurationMs / count / 60000,
      totalPlans: count,
      avgTokens: Math.round(totalTokens / count),
    };
  }, [plans]);

  // Grouped Chart Data
  const chartData = useMemo(() => {
    if (!plans || plans.length === 0) return [];

    if (groupBy === 'status') {
      const groups: Record<string, { count: number; totalCost: number; totalDurationMs: number }> = {};

      plans.forEach((p) => {
        const st = p.status || 'UNKNOWN';
        if (!groups[st]) {
          groups[st] = { count: 0, totalCost: 0, totalDurationMs: 0 };
        }
        groups[st].count += 1;
        groups[st].totalCost += p.costUsd || 0;
        const start = new Date(p.createdAt).getTime();
        const end = new Date(p.updatedAt).getTime();
        groups[st].totalDurationMs += Math.max(300000, end - start);
      });

      return Object.entries(groups).map(([st, val]) => ({
        name: st,
        avgCost: Number((val.totalCost / val.count).toFixed(2)),
        avgDurationMin: Number((val.totalDurationMs / val.count / 60000).toFixed(1)),
        count: val.count,
      }));
    }

    if (groupBy === 'role') {
      const groups: Record<string, { count: number; totalCost: number; totalDurationMs: number }> = {};

      plans.forEach((p) => {
        const role = p.currentRole ? p.currentRole.toUpperCase() : 'UNASSIGNED';
        if (!groups[role]) {
          groups[role] = { count: 0, totalCost: 0, totalDurationMs: 0 };
        }
        groups[role].count += 1;
        groups[role].totalCost += p.costUsd || 0;
        const start = new Date(p.createdAt).getTime();
        const end = new Date(p.updatedAt).getTime();
        groups[role].totalDurationMs += Math.max(300000, end - start);
      });

      return Object.entries(groups).map(([role, val]) => ({
        name: role,
        avgCost: Number((val.totalCost / val.count).toFixed(2)),
        avgDurationMin: Number((val.totalDurationMs / val.count / 60000).toFixed(1)),
        count: val.count,
      }));
    }

    // By Individual Plan
    return plans.map((p) => {
      const start = new Date(p.createdAt).getTime();
      const end = new Date(p.updatedAt).getTime();
      const durMin = Math.max(5, (end - start) / 60000);
      return {
        name: p.id,
        title: p.title,
        avgCost: Number((p.costUsd || 0).toFixed(2)),
        avgDurationMin: Number(durMin.toFixed(1)),
        count: 1,
      };
    });
  }, [plans, groupBy]);

  return (
    <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-2">
              Performance Metrics
              <span className="text-[10px] font-normal text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded">
                Avg Cost & Duration
              </span>
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Quantitative baseline analysis of execution duration (minutes) and model inference cost ($) across implementation plans.
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Group By selector */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setGroupBy('status')}
              className={`px-2.5 py-1 rounded transition-colors ${
                groupBy === 'status'
                  ? 'bg-emerald-600 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              By Status
            </button>
            <button
              onClick={() => setGroupBy('role')}
              className={`px-2.5 py-1 rounded transition-colors ${
                groupBy === 'role'
                  ? 'bg-emerald-600 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              By Role
            </button>
            <button
              onClick={() => setGroupBy('plan')}
              className={`px-2.5 py-1 rounded transition-colors ${
                groupBy === 'plan'
                  ? 'bg-emerald-600 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              By Plan
            </button>
          </div>

          {/* Metric Focus */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setMetricFocus('both')}
              className={`px-2 py-1 rounded ${
                metricFocus === 'both' ? 'bg-zinc-700 text-white font-semibold' : 'text-zinc-400'
              }`}
            >
              Both
            </button>
            <button
              onClick={() => setMetricFocus('cost')}
              className={`px-2 py-1 rounded ${
                metricFocus === 'cost' ? 'bg-zinc-700 text-emerald-300 font-semibold' : 'text-zinc-400'
              }`}
            >
              Cost ($)
            </button>
            <button
              onClick={() => setMetricFocus('duration')}
              className={`px-2 py-1 rounded ${
                metricFocus === 'duration' ? 'bg-zinc-700 text-cyan-300 font-semibold' : 'text-zinc-400'
              }`}
            >
              Duration (m)
            </button>
          </div>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded p-3 flex items-center gap-3">
          <div className="p-2 bg-emerald-950/60 border border-emerald-800/40 rounded text-emerald-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase">Avg Plan Cost</div>
            <div className="text-base font-mono font-bold text-emerald-400">
              ${overallMetrics.avgCost.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded p-3 flex items-center gap-3">
          <div className="p-2 bg-cyan-950/60 border border-cyan-800/40 rounded text-cyan-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase">Avg Duration</div>
            <div className="text-base font-mono font-bold text-cyan-300">
              {overallMetrics.avgDurationMin.toFixed(1)} mins
            </div>
          </div>
        </div>

        <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded p-3 flex items-center gap-3">
          <div className="p-2 bg-blue-950/60 border border-blue-800/40 rounded text-blue-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase">Sample Size</div>
            <div className="text-base font-mono font-bold text-white">
              {overallMetrics.totalPlans} Plans
            </div>
          </div>
        </div>

        <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded p-3 flex items-center gap-3">
          <div className="p-2 bg-amber-950/60 border border-amber-800/40 rounded text-amber-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase">Avg Token Vol</div>
            <div className="text-base font-mono font-bold text-amber-300">
              {(overallMetrics.avgTokens / 1000).toFixed(1)}k tok
            </div>
          </div>
        </div>
      </div>

      {/* Bar Chart Visualization */}
      <div className="h-64 w-full bg-[#0c0c0e] p-3 rounded-lg border border-zinc-800">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
            
            {/* Dual Y-Axes if viewing both */}
            {(metricFocus === 'both' || metricFocus === 'cost') && (
              <YAxis
                yAxisId="cost"
                orientation="left"
                stroke="#10b981"
                fontSize={11}
                tickLine={false}
                unit="$"
                name="Avg Cost ($)"
              />
            )}
            {(metricFocus === 'both' || metricFocus === 'duration') && (
              <YAxis
                yAxisId="duration"
                orientation={metricFocus === 'both' ? 'right' : 'left'}
                stroke="#06b6d4"
                fontSize={11}
                tickLine={false}
                unit="m"
                name="Avg Duration (min)"
              />
            )}

            <Tooltip
              contentStyle={{
                backgroundColor: '#141416',
                borderColor: '#27272a',
                borderRadius: '0.375rem',
                color: '#f4f4f5',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
              formatter={(value: any, name: string) => {
                if (name === 'Average Cost ($)' || name === 'avgCost') return [`$${value}`, 'Avg Cost'];
                if (name === 'Average Duration (min)' || name === 'avgDurationMin') return [`${value} mins`, 'Avg Duration'];
                return [value, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
            />

            {(metricFocus === 'both' || metricFocus === 'cost') && (
              <Bar
                yAxisId="cost"
                dataKey="avgCost"
                name="Average Cost ($)"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
            )}

            {(metricFocus === 'both' || metricFocus === 'duration') && (
              <Bar
                yAxisId={metricFocus === 'both' ? 'duration' : 'duration'}
                dataKey="avgDurationMin"
                name="Average Duration (min)"
                fill="#06b6d4"
                radius={[4, 4, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
