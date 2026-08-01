import React from 'react';
import {
  LayoutDashboard,
  Zap,
  Network,
  RotateCcw,
  Receipt,
  Cpu,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  counts: {
    receipts: number;
    sessions: number;
    identities: number;
    events: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  counts,
}) => {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Kernel Control Plane',
      icon: LayoutDashboard,
      badge: null,
      category: 'SYSTEM & STATUS',
    },
    {
      id: 'delta_ingestion',
      label: 'Delta Ingestion Pipeline',
      icon: Zap,
      badge: null,
      category: 'DELTA & REDUCE',
    },
    {
      id: 'state_inspection',
      label: 'State & Cross-Plan Graph',
      icon: Network,
      badge: counts.identities,
      category: 'STATE & LINEAGE',
    },
    {
      id: 'replay_engine',
      label: 'KSRA Replay & Compare',
      icon: RotateCcw,
      badge: counts.events,
      category: 'STATE & LINEAGE',
    },
    {
      id: 'receipts_ledger',
      label: 'Receipts Ledger & Audit',
      icon: Receipt,
      badge: counts.receipts,
      category: 'RECEIPTS & SESSIONS',
    },
    {
      id: 'agent_sessions',
      label: 'Agent Sessions & PIDs',
      icon: Cpu,
      badge: counts.sessions,
      category: 'RECEIPTS & SESSIONS',
    },
    {
      id: 'circuit_breaker',
      label: 'Circuit Breaker & Recovery',
      icon: ShieldAlert,
      badge: null,
      category: 'GOVERNANCE & ADMIN',
    },
    {
      id: 'admin_catalog',
      label: 'Admin Catalog & Alignment',
      icon: SlidersHorizontal,
      badge: counts.identities,
      category: 'GOVERNANCE & ADMIN',
    },
  ];

  const categories = Array.from(new Set(navItems.map((item) => item.category)));

  return (
    <aside className="w-64 bg-[#0c0c0e] border-r border-zinc-800 text-zinc-300 flex flex-col h-[calc(100vh-45px)] select-none shrink-0 font-sans">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-[#141416]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center font-bold text-xs text-white">
            W
          </div>
          <span className="text-xs font-mono font-bold tracking-tight text-zinc-100 uppercase">
            WRP KERNEL RUNTIME
          </span>
        </div>
        <span className="text-[10px] font-mono text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/80">
          v0.1.0
        </span>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {categories.map((cat) => {
          const catItems = navItems.filter((i) => i.category === cat);
          return (
            <div key={cat} className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                {cat}
              </div>
              {catItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-zinc-800 text-blue-400 font-semibold border border-zinc-700/60 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== null && item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                          isActive
                            ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer Context */}
      <div className="p-3 border-t border-zinc-800 bg-[#141416]/50 text-[11px] font-mono text-zinc-400 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase">Port</span>
          <span className="text-zinc-200 font-semibold">3103 (FastAPI)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase">Status</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            READY (v42)
          </span>
        </div>
      </div>
    </aside>
  );
};
