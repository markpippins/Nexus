import React from 'react';
import {
  LayoutDashboard,
  Kanban,
  GitBranch,
  MessageSquareCode,
  Layers,
  ShieldCheck,
  Cpu,
  FileCode2,
  Sliders,
  Database,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  counts: {
    harvests: number;
    candidates: number;
    plans: number;
    agendas: number;
    workRequests: number;
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
      label: 'Control Plane Overview',
      icon: LayoutDashboard,
      badge: null,
      category: 'OVERVIEW',
    },
    {
      id: 'artifact_pipeline',
      label: 'Artifact Pipeline & Decomposition',
      icon: GitBranch,
      badge: counts.harvests + counts.candidates,
      category: 'PROCESS & ARTIFACTS',
    },
    {
      id: 'kanban_boards',
      label: 'Process & Plan Kanban Boards',
      icon: Kanban,
      badge: counts.plans,
      category: 'PROCESS & ARTIFACTS',
    },
    {
      id: 'deliberation',
      label: 'Review & Deliberation Surface',
      icon: MessageSquareCode,
      badge: counts.agendas,
      category: 'DELIBERATION & FEASIBILITY',
    },
    {
      id: 'architecture',
      label: 'Hierarchical System Architecture',
      icon: Layers,
      badge: null,
      category: 'DELIBERATION & FEASIBILITY',
    },
    {
      id: 'execution_authority',
      label: 'Execution Authority & Receipts (ADR-006)',
      icon: ShieldCheck,
      badge: counts.workRequests,
      category: 'EXECUTION & KERNEL',
    },
    {
      id: 'model_chain',
      label: 'Model Chain Resilience & Budget',
      icon: Cpu,
      badge: null,
      category: 'EXECUTION & KERNEL',
    },
  ];

  // Group nav items by category
  const categories = Array.from(new Set(navItems.map((item) => item.category)));

  return (
    <aside className="w-64 bg-[#0c0c0e] border-r border-zinc-800 text-zinc-300 flex flex-col h-[calc(100vh-45px)] select-none shrink-0 font-sans">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-[#141416]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center font-bold text-xs text-white">
            C
          </div>
          <span className="text-xs font-mono font-bold tracking-tight text-zinc-100 uppercase">
            CONDUIT NEXUS
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700">
          v2.4
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
                      {isActive ? (
                        <span className="w-2 h-2 bg-blue-400 rounded-full shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                      ) : (
                        <span className="w-1.5 h-1.5 border border-zinc-600 rounded-full shrink-0" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== null && (
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
          <span className="text-[10px] text-zinc-500 uppercase">Tenant</span>
          <span className="text-zinc-200 font-semibold">org_agentic_se</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase">WRP Daemon</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            RUNNING
          </span>
        </div>
      </div>
    </aside>
  );
};
