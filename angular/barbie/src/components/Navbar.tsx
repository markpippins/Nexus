import React from 'react';
import { useTheme } from './ThemeContext';
import { registryApi } from '../lib/api';
import {
  Search,
  Moon,
  Sun,
  Shield,
  Activity,
  PlusCircle,
  RefreshCw,
  Menu,
  X,
  Radio,
  Server,
  Layers,
  Cpu
} from 'lucide-react';
import { ThemeMode, System } from '../types';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedSystemFilter: string;
  onSystemFilterChange: (systemName: string) => void;
  systemsList: System[];
  autoRefreshInterval: number;
  onAutoRefreshChange: (interval: number) => void;
  onOpenRegisterModal: () => void;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  isRefreshing: boolean;
  onManualRefresh: () => void;
  activeView: string;
  apiMode?: 'live' | 'mock';
  onApiModeChange?: (mode: 'live' | 'mock') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedSystemFilter,
  onSystemFilterChange,
  systemsList,
  autoRefreshInterval,
  onAutoRefreshChange,
  onOpenRegisterModal,
  isMobileMenuOpen,
  onToggleMobileMenu,
  isRefreshing,
  onManualRefresh,
  activeView,
  apiMode = registryApi.getApiMode(),
  onApiModeChange
}) => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        
        {/* Left: Brand / Logo & Mobile Menu Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] lg:hidden"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500 p-2 text-white shadow-md shadow-sky-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-100">
                  PLATFORM<span className="text-sky-400">CORE</span>
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-300 border border-slate-700">
                  v1.8
                </span>
              </div>
              <p className="hidden text-[11px] text-slate-400 sm:block font-medium">
                Enterprise Registry & Infrastructure Telemetry
              </p>
            </div>
          </div>
        </div>

        {/* Center: Search Bar for Quick System Filtering */}
        <div className="mx-4 max-w-md flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search services, servers, endpoints, systems, or tags..."
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] py-2 pl-9 pr-8 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all focus:border-[var(--accent-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
              aria-label="Filter systems and entities"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: Auto-refresh, Mode Switcher, System Status, Register Button */}
        <div className="flex items-center gap-3">
          
          {/* Data Mode Toggle (LIVE REST API vs MOCK) */}
          <div className="hidden md:flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-1">
            <button
              onClick={() => {
                registryApi.setApiMode('live');
                onApiModeChange ? onApiModeChange('live') : onManualRefresh();
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all ${
                apiMode === 'live'
                  ? 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Connect to Live Express REST Backend Server (/api/v1/registry)"
            >
              <Radio className="h-3 w-3" />
              <span>LIVE API</span>
            </button>

            <button
              onClick={() => {
                registryApi.setApiMode('mock');
                onApiModeChange ? onApiModeChange('mock') : onManualRefresh();
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all ${
                apiMode === 'mock'
                  ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Switch to Client-side Offline Mock Data Generator"
            >
              <Cpu className="h-3 w-3" />
              <span>MOCK</span>
            </button>
          </div>

          {/* System Status Display from Professional Polish theme */}
          <div className="hidden lg:flex flex-col items-end pr-2 border-r border-[var(--border-color)]">
            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
              {apiMode === 'live' ? 'Live Backend' : 'Mock Client'}
            </span>
            <span className={`text-xs font-bold flex items-center gap-1.5 ${
              apiMode === 'live' ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                apiMode === 'live' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-amber-500'
              }`}></span>
              {apiMode === 'live' ? 'REST ONLINE' : 'MOCK ACTIVE'}
            </span>
          </div>
          
          {/* Manual Refresh & Auto Refresh Select */}
          <div className="hidden items-center gap-1 sm:flex">
            <button
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className={`flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] ${
                isRefreshing ? 'opacity-50' : ''
              }`}
              title="Refresh platform telemetry"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
              <span>Refresh</span>
            </button>

            <select
              value={autoRefreshInterval}
              onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-highlight)] focus:outline-none"
              title="Set Live Telemetry Interval"
            >
              <option value={3000}>3s Live</option>
              <option value={5000}>5s Poll</option>
              <option value={10000}>10s Poll</option>
              <option value={30000}>30s Poll</option>
              <option value={0}>Paused</option>
            </select>
          </div>

          {/* Service Register Button */}
          <button
            onClick={onOpenRegisterModal}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 active:scale-95 transition-all"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Register Service</span>
          </button>

          {/* Theme Mode Selector (Dark, Light, Steel) */}
          <div className="flex items-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-0.5">
            <button
              onClick={() => setTheme('dark')}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all ${
                theme === 'dark'
                  ? 'bg-sky-500/20 text-sky-400 font-bold ring-1 ring-sky-500/40'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Dark Theme"
              aria-label="Dark Theme"
            >
              <Moon className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setTheme('steel')}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all ${
                theme === 'steel'
                  ? 'bg-cyan-500/20 text-cyan-400 font-bold ring-1 ring-cyan-500/40'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Steel Metallic Theme"
              aria-label="Steel Theme"
            >
              <Shield className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setTheme('light')}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all ${
                theme === 'light'
                  ? 'bg-amber-500/20 text-amber-600 font-bold ring-1 ring-amber-500/40'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Light High Contrast Theme"
              aria-label="Light Theme"
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* System Filter Pills Sub-Bar */}
      <div className="border-t border-[var(--border-color)] bg-[var(--bg-main)]/60 px-4 py-2">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto text-xs no-scrollbar">
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] whitespace-nowrap uppercase tracking-wider">
            Filter System:
          </span>

          <button
            onClick={() => onSystemFilterChange('all')}
            className={`rounded-full px-3 py-1 font-medium whitespace-nowrap transition-all ${
              selectedSystemFilter === 'all'
                ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-400'
                : 'border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            All Systems (5)
          </button>

          {systemsList.map((sys) => (
            <button
              key={sys.id}
              onClick={() => onSystemFilterChange(sys.name)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium whitespace-nowrap transition-all ${
                selectedSystemFilter === sys.name
                  ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-400'
                  : 'border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  sys.status === 'healthy'
                    ? 'bg-emerald-400'
                    : sys.status === 'degraded'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              <span>{sys.name}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
