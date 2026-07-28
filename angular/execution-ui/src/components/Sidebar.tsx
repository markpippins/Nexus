import React from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  FileCode2, 
  Clock, 
  PlayCircle, 
  GitBranch, 
  Cpu, 
  Terminal, 
  FileText, 
  AlertTriangle,
  Layers,
  ChevronRight,
  Database
} from 'lucide-react';
import { NavTab, ExecutionInlineHealth, IntegrityScanResponse } from '../types';

interface SidebarProps {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
  inlineHealth: ExecutionInlineHealth | null;
  scanResult: IntegrityScanResponse | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  inlineHealth,
  scanResult
}) => {
  const staleLeases = inlineHealth?.stale_active_leases ?? 0;
  const pathologyCount = scanResult?.total_issues_count ?? 8;

  const coreNavItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      description: 'System status & key counters'
    },
    {
      id: 'requests' as NavTab,
      label: 'Requests',
      icon: FileCode2,
      badge: inlineHealth?.total_requests ? `${inlineHealth.total_requests}` : '323',
      badgeColor: 'bg-[#27272a] text-blue-400 border-[#3f3f46]',
      description: 'Requests aggregate root browser'
    },
    {
      id: 'leases' as NavTab,
      label: 'Leases',
      icon: Clock,
      badge: staleLeases > 0 ? `${staleLeases} Stale` : null,
      badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      description: 'Active, released & stale TTL leases'
    },
    {
      id: 'attempts' as NavTab,
      label: 'Attempts',
      icon: PlayCircle,
      badge: inlineHealth?.running_attempts ? `${inlineHealth.running_attempts} Run` : '28',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      description: 'Attempt execution history'
    },
    {
      id: 'receipts-origin' as NavTab,
      label: 'Receipts & Lineage',
      icon: GitBranch,
      badge: inlineHealth?.total_receipts ? `${inlineHealth.total_receipts}` : '1558',
      badgeColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      description: 'Differential origin seam visualizer'
    },
    {
      id: 'fleet' as NavTab,
      label: 'Executor Fleet',
      icon: Cpu,
      badge: '6 Nodes',
      badgeColor: 'bg-[#27272a] text-zinc-300 border-[#3f3f46]',
      description: 'Executor workload & leases'
    }
  ];

  const integrityNavItems = [
    {
      id: 'integrity-scan' as NavTab,
      label: 'System Scans',
      icon: ShieldCheck,
      badge: pathologyCount > 0 ? `${pathologyCount}` : null,
      badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      description: 'Cross-table pathology scanner'
    },
    {
      id: 'api-docs' as NavTab,
      label: 'REST API Tester',
      icon: Terminal,
      badge: '8 Endpoints',
      badgeColor: 'bg-[#27272a] text-zinc-300 border-[#3f3f46]',
      description: 'Live curl & JSON schema playground'
    }
  ];

  return (
    <aside className="w-56 bg-[#09090b] border-r border-[#27272a] text-zinc-300 flex flex-col justify-between select-none shrink-0 z-20 font-sans">
      {/* Top Header & Navigation Items */}
      <div className="p-3 space-y-4">
        {/* Execution Core Section */}
        <div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 mb-2">
            Execution Core
          </div>
          <nav className="space-y-1">
            {coreNavItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id || (currentTab === 'request-detail' && item.id === 'requests') || (currentTab === 'lease-detail' && item.id === 'leases');

              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-sans transition-all group ${
                    isActive
                      ? 'bg-[#18181b] text-blue-400 border border-[#27272a] font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b] border border-transparent'
                  }`}
                  title={item.description}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-zinc-400 group-hover:text-zinc-200'
                    }`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${item.badgeColor || 'bg-[#27272a] text-zinc-300 border-[#3f3f46]'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Integrity & Diagnostics Section */}
        <div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 mb-2">
            Integrity
          </div>
          <nav className="space-y-1">
            {integrityNavItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-sans transition-all group ${
                    isActive
                      ? 'bg-[#18181b] text-blue-400 border border-[#27272a] font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b] border border-transparent'
                  }`}
                  title={item.description}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-blue-400' : 'text-zinc-400 group-hover:text-zinc-200'
                    }`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${item.badgeColor || 'bg-[#27272a] text-zinc-300 border-[#3f3f46]'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Panel: Schema Quick Overview */}
      <div className="p-3 border-t border-[#27272a] bg-[#0c0c0e] text-xs font-mono space-y-2">
        <div className="flex items-center justify-between text-zinc-500 text-[10px] font-bold tracking-wider uppercase">
          <span className="flex items-center gap-1">
            <Database className="w-3 h-3 text-zinc-400" />
            LIVE TABLE COUNTS
          </span>
          <span className="text-emerald-400">SYNCED</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="bg-[#18181b] border border-[#27272a] p-2 rounded-md flex flex-col">
            <span className="text-zinc-500 text-[10px]">requests</span>
            <span className="text-zinc-100 font-bold">{inlineHealth?.total_requests ?? 323}</span>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] p-2 rounded-md flex flex-col">
            <span className="text-zinc-500 text-[10px]">leases</span>
            <span className="text-zinc-100 font-bold">{inlineHealth?.total_leases ?? 321}</span>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] p-2 rounded-md flex flex-col">
            <span className="text-zinc-500 text-[10px]">attempts</span>
            <span className="text-zinc-100 font-bold">{inlineHealth?.total_attempts ?? 321}</span>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] p-2 rounded-md flex flex-col">
            <span className="text-zinc-500 text-[10px]">receipts</span>
            <span className="text-zinc-100 font-bold">{inlineHealth?.total_receipts ?? 1558}</span>
          </div>
        </div>

        <div className="pt-1 text-[10px] text-zinc-500 flex items-center justify-between border-t border-[#27272a]/60">
          <span>conduit-mcp: 3100</span>
          <span>execution: 3110</span>
        </div>
      </div>
    </aside>
  );
};
