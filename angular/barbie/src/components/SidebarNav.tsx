import React, { useState } from 'react';
import {
  Network,
  Layers,
  Server as ServerIcon,
  GitCommit,
  Activity,
  Code,
  ListFilter,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  ShieldCheck,
  Cpu,
  Radio
} from 'lucide-react';
import { System } from '../types';
import { registryApi } from '../lib/api';

export type ActiveTab =
  | 'aggregate'
  | 'services'
  | 'servers'
  | 'deployments'
  | 'systems'
  | 'frameworks-libraries'
  | 'lookup-tables';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  servicesCount: number;
  serversCount: number;
  deploymentsCount: number;
  systemsCount: number;
  selectedSystemFilter: string;
  onSystemFilterChange: (systemName: string) => void;
  systemsList: System[];
  onOpenRegisterModal: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  apiMode?: 'live' | 'mock';
  onApiModeChange?: (mode: 'live' | 'mock') => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onTabChange,
  servicesCount,
  serversCount,
  deploymentsCount,
  systemsCount,
  selectedSystemFilter,
  onSystemFilterChange,
  systemsList,
  onOpenRegisterModal,
  isMobileOpen,
  onCloseMobile,
  apiMode = registryApi.getApiMode(),
  onApiModeChange
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navGroups = [
    {
      title: 'TELEMETRY & OVERVIEW',
      items: [
        {
          id: 'aggregate' as ActiveTab,
          label: 'Aggregate Visualizer',
          icon: Network,
          badge: null
        }
      ]
    },
    {
      title: 'REGISTRY ENTITIES',
      items: [
        {
          id: 'services' as ActiveTab,
          label: 'Services Registry',
          icon: Layers,
          badge: servicesCount
        },
        {
          id: 'servers' as ActiveTab,
          label: 'Servers & Nodes',
          icon: ServerIcon,
          badge: serversCount
        },
        {
          id: 'deployments' as ActiveTab,
          label: 'Deployments',
          icon: GitCommit,
          badge: deploymentsCount
        },
        {
          id: 'systems' as ActiveTab,
          label: 'Systems Architecture',
          icon: Activity,
          badge: systemsCount
        }
      ]
    },
    {
      title: 'CATALOG & CONFIG',
      items: [
        {
          id: 'frameworks-libraries' as ActiveTab,
          label: 'Frameworks & Libraries',
          icon: Code,
          badge: null
        },
        {
          id: 'lookup-tables' as ActiveTab,
          label: 'Lookup Tables',
          icon: ListFilter,
          badge: null
        }
      ]
    }
  ];

  const handleSelectTab = (tab: ActiveTab) => {
    onTabChange(tab);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between p-3.5">
      {/* Top Header / Actions inside Sidebar */}
      <div className="space-y-4">
        
        {/* Collapse Toggle (Desktop Only) */}
        <div className="hidden lg:flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
          {!isCollapsed && (
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              <ShieldCheck className="h-4 w-4 text-sky-400" />
              <span>Registry Navigation</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Quick Action: Register Service */}
        <button
          onClick={() => {
            onOpenRegisterModal();
            onCloseMobile();
          }}
          className={`w-full flex items-center justify-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 px-3 text-xs shadow-md shadow-sky-500/20 transition-all active:scale-[0.98] ${
            isCollapsed ? 'px-0' : ''
          }`}
          title="Register New Microservice"
        >
          <PlusCircle className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span className="truncate">Register Service</span>}
        </button>

        {/* System Filter Dropdown (Hidden when collapsed) */}
        {!isCollapsed && (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5 space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              <Filter className="h-3 w-3 text-sky-400" />
              <span>System Domain Filter</span>
            </label>
            <select
              value={selectedSystemFilter}
              onChange={(e) => onSystemFilterChange(e.target.value)}
              className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            >
              <option value="all">All Systems ({systemsList.length})</option>
              {systemsList.map((sys) => (
                <option key={sys.id} value={sys.name}>
                  {sys.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Sections */}
        <div className="space-y-4 pt-1">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              {!isCollapsed && (
                <div className="px-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]/70">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-sky-500 text-white font-bold shadow-sm shadow-sky-500/30 ring-1 ring-sky-400'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                      }`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {item.badge !== null && (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-[var(--border-color)] text-[var(--text-secondary)]'
                          } ${isCollapsed ? 'hidden' : 'block'}`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Footer Widget in Sidebar */}
      <div className="mt-6 border-t border-[var(--border-color)] pt-3">
        {!isCollapsed ? (
          <div className="rounded-lg bg-[var(--bg-main)] p-2.5 border border-[var(--border-color)] text-[11px] space-y-1.5">
            <div className="flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">Mode</span>
              <button
                onClick={() => onApiModeChange && onApiModeChange(apiMode === 'live' ? 'mock' : 'live')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer hover:opacity-80 transition-opacity ${
                  apiMode === 'live' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
                title="Click to toggle REST Backend Mode"
              >
                {apiMode === 'live' ? 'LIVE API' : 'CLIENT MOCK'}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-mono">
              <span>Services Online</span>
              <span className="font-bold text-[var(--text-primary)]">{servicesCount} Nodes</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center" title="Platform Health Normal">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop & Drawer Navigation */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 text-white font-extrabold text-xs">
                  PC
                </div>
                <span className="font-extrabold text-sm text-[var(--text-primary)]">Platform Core</span>
              </div>
              <button
                onClick={onCloseMobile}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {navContent}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Left Sidebar Component */}
      <aside
        className={`hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] min-h-[calc(100vh-65px)] ${
          isCollapsed ? 'w-16' : 'w-64 xl:w-72'
        }`}
      >
        <div className="sticky top-[65px] max-h-[calc(100vh-65px)] overflow-y-auto">
          {navContent}
        </div>
      </aside>
    </>
  );
};
