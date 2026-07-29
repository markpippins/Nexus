import React, { useState, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  ShieldCheck,
  FileCode,
  Layers,
  ChevronRight,
  Filter,
  Terminal,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { ImplementationPlan, LegacyReceipt, WorkRequestDCO } from '../../types/conduit';

interface RecentActivityWidgetProps {
  plans: ImplementationPlan[];
  workRequests?: WorkRequestDCO[];
  onSelectPlan: (planId: string) => void;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: string;
  category: 'RECEIPT' | 'PLAN' | 'WORK_REQUEST';
  planId: string;
  planTitle: string;
  role: string;
  hash?: string;
  detail: string;
  statusColor: 'blue' | 'emerald' | 'amber' | 'rose' | 'zinc';
}

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  plans,
  workRequests = [],
  onSelectPlan,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Extract and synthesize all system events, sort chronologically descending
  const recentEvents = useMemo(() => {
    const events: ActivityEvent[] = [];

    // 1. Gather Receipts
    plans.forEach((plan) => {
      plan.receipts.forEach((rcp) => {
        let statusColor: ActivityEvent['statusColor'] = 'blue';
        if (rcp.receiptType === 'BLOCK' || rcp.receiptType === 'REJECTED') {
          statusColor = 'rose';
        } else if (rcp.receiptType === 'REVIEW_PASS' || rcp.receiptType === 'COMPLETED') {
          statusColor = 'emerald';
        } else if (rcp.receiptType === 'PROPOSED' || rcp.receiptType === 'PLANNING') {
          statusColor = 'amber';
        }

        events.push({
          id: `rcp-${rcp.id}-${rcp.issuedAt}`,
          timestamp: rcp.issuedAt,
          type: rcp.receiptType,
          category: 'RECEIPT',
          planId: plan.id,
          planTitle: plan.title,
          role: plan.currentRole || 'planner',
          hash: rcp.hash,
          detail: `Receipt ${rcp.id} issued for ${plan.id} (${rcp.receiptType})`,
          statusColor,
        });
      });

      // 2. Plan creation / status update events
      events.push({
        id: `plan-upd-${plan.id}-${plan.updatedAt}`,
        timestamp: plan.updatedAt,
        type: `PLAN_${plan.status}`,
        category: 'PLAN',
        planId: plan.id,
        planTitle: plan.title,
        role: plan.currentRole || 'planner',
        detail: `Plan state updated to ${plan.status} on model ${plan.activeModel}`,
        statusColor:
          plan.status === 'ACTIVE'
            ? 'blue'
            : plan.status === 'COMPLETED'
            ? 'emerald'
            : plan.status === 'BLOCKED'
            ? 'rose'
            : 'amber',
      });
    });

    // 3. Work requests
    workRequests.forEach((wr) => {
      const wrTime = (wr as any).recordedOnDt || wr.createdAt || new Date().toISOString();
      events.push({
        id: `wr-${wr.id}-${wrTime}`,
        timestamp: wrTime,
        type: `WORK_REQ_${wr.attemptStatus}`,
        category: 'WORK_REQUEST',
        planId: wr.planId,
        planTitle: `Work Request ${wr.id}`,
        role: wr.role || 'executor',
        detail: `DCO Lease PID ${wr.leaseOwnerPid || 'N/A'} - status ${wr.attemptStatus}`,
        statusColor: wr.attemptStatus === 'SUCCEEDED' || wr.attemptStatus === 'COMPLETED' ? 'emerald' : 'blue',
      });
    });

    // Sort chronologically descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return events;
  }, [plans, workRequests]);

  // Filtered event list
  const filteredEvents = useMemo(() => {
    let list = recentEvents;
    if (filterCategory !== 'ALL') {
      list = list.filter((e) => e.category === filterCategory);
    }
    return list.slice(0, 10); // Take last 10 system events
  }, [recentEvents, filterCategory]);

  const formatTimeAgo = (isoString: string) => {
    const time = new Date(isoString).getTime();
    if (isNaN(time)) return 'just now';
    const diffSec = Math.floor((Date.now() - time) / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const getBadgeStyle = (statusColor: ActivityEvent['statusColor']) => {
    switch (statusColor) {
      case 'emerald':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
      case 'rose':
        return 'bg-rose-950/80 text-rose-300 border-rose-700/60';
      case 'amber':
        return 'bg-amber-950/80 text-amber-300 border-amber-700/60';
      case 'blue':
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-700/60';
    }
  };

  const getEventIcon = (statusColor: ActivityEvent['statusColor']) => {
    switch (statusColor) {
      case 'emerald':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'rose':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      case 'amber':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'blue':
      default:
        return <Activity className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 shadow-sm space-y-3">
      {/* Widget Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-2">
              Recent System Activity Log
              <span className="text-[10px] font-normal text-blue-400 bg-blue-950/50 border border-blue-800/40 px-2 py-0.5 rounded">
                Last 10 System Events
              </span>
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time audit trail of receipt issuances, plan state transitions, and DCO lease executions.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono shrink-0">
          <button
            onClick={() => setFilterCategory('ALL')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterCategory === 'ALL'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterCategory('RECEIPT')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterCategory === 'RECEIPT'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Receipts
          </button>
          <button
            onClick={() => setFilterCategory('PLAN')}
            className={`px-2.5 py-1 rounded transition-colors ${
              filterCategory === 'PLAN'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Plans
          </button>
        </div>
      </div>

      {/* Events Stream List */}
      <div className="space-y-2">
        {filteredEvents.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 font-mono text-xs">
            No recent system events logged.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60 bg-[#0c0c0e] rounded border border-zinc-800/80 overflow-hidden">
            {filteredEvents.map((evt) => {
              const isExpanded = expandedEventId === evt.id;
              return (
                <div
                  key={evt.id}
                  className="p-2.5 hover:bg-zinc-800/40 transition-colors text-xs font-mono group"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {/* Left: Icon, Type Badge, Plan Link */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">{getEventIcon(evt.statusColor)}</span>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded border font-bold shrink-0 ${getBadgeStyle(
                          evt.statusColor
                        )}`}
                      >
                        {evt.type}
                      </span>

                      <button
                        onClick={() => onSelectPlan(evt.planId)}
                        className="text-blue-400 font-bold hover:underline truncate text-left max-w-[140px] sm:max-w-[200px]"
                        title={evt.planTitle}
                      >
                        {evt.planId}
                      </button>

                      <span className="text-zinc-500 text-[10px] hidden md:inline truncate max-w-[180px]">
                        • {evt.planTitle}
                      </span>
                    </div>

                    {/* Right: Timestamp & Expand Action */}
                    <div className="flex items-center gap-3 shrink-0 ml-auto">
                      <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {formatTimeAgo(evt.timestamp)}
                      </span>

                      <button
                        onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
                        title="Toggle event details"
                      >
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform ${
                            isExpanded ? 'rotate-90 text-blue-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="text-zinc-300 text-[11px] mt-1 pl-5 truncate">
                    {evt.detail}
                  </div>

                  {/* Expanded detail box */}
                  {isExpanded && (
                    <div className="mt-2 ml-5 p-2.5 bg-[#141416] border border-zinc-800 rounded text-[11px] text-zinc-300 space-y-1.5 shadow-inner">
                      <div className="flex justify-between items-center text-zinc-400 border-b border-zinc-800/80 pb-1">
                        <span>Role: <strong className="text-cyan-300">{evt.role}</strong></span>
                        <span>Category: <strong className="text-zinc-200">{evt.category}</strong></span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Timestamp: </span>
                        <span className="text-zinc-300">{new Date(evt.timestamp).toLocaleString()}</span>
                      </div>
                      {evt.hash && (
                        <div>
                          <span className="text-zinc-500">Cryptographic Hash: </span>
                          <span className="text-emerald-400 font-mono text-[10px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            {evt.hash}
                          </span>
                        </div>
                      )}
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => onSelectPlan(evt.planId)}
                          className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          View Plan {evt.planId} <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
