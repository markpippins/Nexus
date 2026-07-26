import React, { useState } from 'react';
import { 
  Terminal, 
  Search, 
  RefreshCw, 
  Sun, 
  Moon, 
  Database, 
  ShieldAlert, 
  BookOpen, 
  Command, 
  CheckCircle2, 
  AlertTriangle,
  Server,
  Code
} from 'lucide-react';
import { NavTab, ExecutionInlineHealth, ThemeMode } from '../types';
import { getApiClientConfig, setApiClientConfig } from '../services/apiClient';

interface HeaderProps {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
  activePath: string;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  inlineHealth: ExecutionInlineHealth | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenCommandPalette: () => void;
  onOpenReadme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  activePath,
  theme,
  setTheme,
  inlineHealth,
  onRefresh,
  isRefreshing,
  onOpenCommandPalette,
  onOpenReadme
}) => {
  const [config, setConfig] = useState(getApiClientConfig());
  const [showConfigDropdown, setShowConfigDropdown] = useState(false);

  const toggleApiMode = () => {
    const nextConfig = { ...config, useMock: !config.useMock };
    setApiClientConfig(nextConfig);
    setConfig(nextConfig);
    onRefresh();
  };

  const handleBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextConfig = { ...config, baseUrl: e.target.value };
    setApiClientConfig(nextConfig);
    setConfig(nextConfig);
  };

  const hasPathologies = (inlineHealth?.stale_active_leases ?? 0) > 0;

  return (
    <header className="h-12 bg-[#09090b] border-b border-[#27272a] text-zinc-100 flex items-center justify-between px-0 select-none z-30 shrink-0 font-sans">
      {/* Far Left: Blue Accent Brand Icon Box */}
      <div className="flex items-center h-full shrink-0">
        <div 
          onClick={() => setCurrentTab('dashboard')}
          className="w-12 h-full bg-blue-600 border-r border-[#27272a] flex items-center justify-center cursor-pointer hover:bg-blue-500 transition-colors shrink-0"
          title="NEXUS IDE Observability Suite"
        >
          <Code className="w-5 h-5 text-white" />
        </div>

        <div 
          onClick={() => setCurrentTab('dashboard')}
          className="flex items-center gap-2 px-3 py-1 cursor-pointer group"
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wider font-mono text-zinc-100 flex items-center gap-1.5">
              NEXUS <span className="text-zinc-600">//</span> EXECUTION-SRV
            </span>
            <span className="text-[10px] font-mono text-emerald-400 leading-tight">
              v1.4.2 [READ-ONLY]
            </span>
          </div>
        </div>

        {/* Status indicator pill */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#18181b] border border-[#27272a]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-300">PORT: 3110</span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">PG: nexus.execution</span>
        </div>
      </div>

      {/* Middle: Interactive Bento Addressbar & Breadcrumbs */}
      <div className="flex-1 max-w-xl mx-4 hidden md:flex items-center">
        <div className="w-full flex items-center bg-[#18181b] border border-[#27272a] rounded-md px-3 py-1 text-xs font-mono text-zinc-300 focus-within:border-blue-500 transition-colors">
          <Terminal className="w-3.5 h-3.5 text-blue-400 mr-2 shrink-0" />
          <span className="text-zinc-500 select-none mr-1">GET</span>
          <span className="text-blue-400 mr-1">/api/execution</span>
          <span className="text-emerald-400 font-bold truncate flex-1">{activePath}</span>
          
          <button
            onClick={onOpenCommandPalette}
            className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#27272a] text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Search commands, requests, leases (⌘K)"
          >
            <Command className="w-3 h-3" />
            <span>K</span>
          </button>
        </div>
      </div>

      {/* Right: Quick Controls & Toggles */}
      <div className="flex items-center gap-3 pr-4 shrink-0">
        {/* Quick Integrity Alert Badge */}
        {hasPathologies && (
          <button
            onClick={() => setCurrentTab('integrity-scan')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-mono transition-colors"
            title="Pathologies / Stale active leases detected"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{inlineHealth?.stale_active_leases} Stale</span>
          </button>
        )}

        {/* API Mode Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowConfigDropdown(!showConfigDropdown)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
              config.useMock 
                ? 'bg-purple-950/40 border-purple-800/60 text-purple-300 hover:bg-purple-900/40' 
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/40'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{config.useMock ? 'MOCK MODE' : 'LIVE API'}</span>
          </button>

          {showConfigDropdown && (
            <div className="absolute right-0 mt-2 w-72 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl p-3 z-50 font-sans text-xs">
              <div className="flex items-center justify-between font-mono font-semibold text-zinc-200 mb-2 border-b border-[#27272a] pb-1.5">
                <span>Data Engine Config</span>
                <span className="text-[10px] text-zinc-400">execution-srv</span>
              </div>

              <div className="flex items-center justify-between mb-3 bg-[#09090b] p-2 rounded-md border border-[#27272a]">
                <div className="flex flex-col">
                  <span className="font-medium text-zinc-200">Mock Scheme</span>
                  <span className="text-[10px] text-zinc-400">Offline deterministic seed</span>
                </div>
                <button
                  onClick={toggleApiMode}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                    config.useMock ? 'bg-purple-600' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.useMock ? 'translate-x-4' : ''}`} />
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-zinc-400 block">Live Express API Base URL</label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={handleBaseUrlChange}
                  disabled={config.useMock}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-zinc-200 font-mono text-xs focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="/api/execution"
                />
              </div>

              <div className="mt-3 pt-2 border-t border-[#27272a] text-[10px] text-zinc-400 flex justify-between items-center font-mono">
                <span>Target: execution.*</span>
                <button 
                  onClick={() => setShowConfigDropdown(false)}
                  className="text-blue-400 hover:underline"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-md bg-[#18181b] hover:bg-[#27272a] text-zinc-300 border border-[#27272a] transition-colors"
          title="Refresh dataset"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>

        {/* Theme Toggle Pill (Bento style) */}
        <div className="flex bg-[#18181b] p-1 rounded-md border border-[#27272a] gap-0.5">
          <button
            onClick={() => setTheme('dark')}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded transition-colors ${
              theme === 'dark' ? 'bg-[#27272a] text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Dark obsidian theme"
          >
            DARK
          </button>
          <button
            onClick={() => setTheme('light')}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded transition-colors ${
              theme === 'light' ? 'bg-[#27272a] text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Clean studio light theme"
          >
            LIGHT
          </button>
          <button
            onClick={() => setTheme('steel')}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded transition-colors ${
              theme === 'steel' ? 'bg-[#263143] text-cyan-300 font-bold border border-cyan-500/30' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Metallic blue-steel high-contrast theme"
          >
            STEEL
          </button>
        </div>

        {/* Integration README Button */}
        <button
          onClick={onOpenReadme}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-zinc-300 text-xs font-mono transition-colors"
          title="View Integration Deployment Guide"
        >
          <BookOpen className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">README</span>
        </button>
      </div>
    </header>
  );
};
