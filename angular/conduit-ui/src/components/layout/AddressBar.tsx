import React, { useState } from 'react';
import {
  Server,
  Database,
  Cpu,
  ShieldAlert,
  RefreshCw,
  Search,
  BookOpen,
  Terminal,
  Activity,
  Zap,
  Sun,
  Moon,
  Palette,
} from 'lucide-react';
import { SystemStatus } from '../../types/conduit';

export type AppTheme = 'dark' | 'light' | 'steel';

interface AddressBarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  status: SystemStatus;
  isMockMode: boolean;
  onToggleMockMode: () => void;
  onOpenIntegrationGuide: () => void;
  onRefresh: () => void;
  onOpenSearch: () => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const AddressBar: React.FC<AddressBarProps> = ({
  currentPath,
  onNavigate,
  status,
  isMockMode,
  onToggleMockMode,
  onOpenIntegrationGuide,
  onRefresh,
  onOpenSearch,
  theme,
  onThemeChange,
}) => {
  const [inputUrl, setInputUrl] = useState(currentPath);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onNavigate(inputUrl);
    }
  };

  React.useEffect(() => {
    setInputUrl(currentPath);
  }, [currentPath]);

  return (
    <header className="bg-[#0c0c0e] border-b border-zinc-800 text-zinc-200 select-none sticky top-0 z-40 shadow-xl">
      {/* Upper bar with Branding box, Address bar, Status badges */}
      <div className="flex items-center justify-between px-4 py-2 gap-3">
        {/* Branding Box */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="bg-[#141416] border border-zinc-800 rounded px-2.5 py-1 flex items-center gap-2">
            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center font-bold text-xs text-white">
              C
            </div>
            <span className="font-mono text-xs font-bold tracking-tight text-white uppercase">
              CONDUIT
            </span>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs font-medium tracking-tight text-zinc-400">
              NEXUS
            </span>
            <span className="bg-blue-900/30 text-blue-400 text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-800/50">
              v2.4
            </span>
          </div>
        </div>

        {/* IDE Address Bar Input */}
        <div className="flex-1 max-w-2xl flex items-center bg-black/40 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono focus-within:border-zinc-600 transition-all">
          <span className="text-zinc-600 mr-2 shrink-0 font-mono text-xs">conduit://</span>
          <input
            type="text"
            value={inputUrl.replace('conduit://', '')}
            onChange={(e) => setInputUrl(e.target.value.startsWith('conduit://') ? e.target.value : `conduit://${e.target.value}`)}
            onKeyDown={handleKeyDown}
            placeholder="nexus.local/dashboard"
            className="w-full bg-transparent text-zinc-300 outline-none font-mono placeholder-zinc-600 text-xs"
          />
          <button
            onClick={onOpenSearch}
            className="ml-auto text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1 text-[10px] font-mono"
            title="Command Search (⌘K)"
          >
            <span>⌘K</span>
          </button>
        </div>

        {/* Action Controls & Status Badges */}
        <div className="flex items-center gap-2 shrink-0">
          {/* PostgreSQL Badge */}
          <div
            className={`hidden xl:flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
              status.pgConnected
                ? 'bg-[#141416] border-zinc-800 text-zinc-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
            title={`PostgreSQL Nexus DSN: ${status.pgDsn}`}
          >
            <Database className="w-3 h-3 text-cyan-400" />
            <span>nexus:pg</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>

          {/* WRP Kernel Badge */}
          <div
            className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono bg-[#141416] border border-zinc-800 text-zinc-300"
            title={`WRP Kernel Server: ${status.wrpKernelUrl}`}
          >
            <Cpu className="w-3 h-3 text-blue-400" />
            <span>wrp_kernel:3103</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>

          {/* Active Leases Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono bg-[#141416] border border-zinc-800 text-amber-400">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Leases: {status.activeLeasesCount}</span>
          </div>

          {/* Circuit Breaker Badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border ${
              status.circuitBreakerTripped
                ? 'bg-rose-950/60 border-rose-600 text-rose-300 animate-bounce'
                : 'bg-[#141416] border-zinc-800 text-emerald-400'
            }`}
          >
            <ShieldAlert
              className={`w-3 h-3 ${status.circuitBreakerTripped ? 'text-rose-400' : 'text-emerald-400'}`}
            />
            <span className="hidden sm:inline">
              {status.circuitBreakerTripped ? 'Circuit: TRIPPED' : 'Circuit: HEALTHY'}
            </span>
          </div>

          {/* Mode Toggle Button */}
          <button
            onClick={onToggleMockMode}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium border transition-colors flex items-center gap-1.5 ${
              isMockMode
                ? 'bg-amber-950/30 border-amber-800/60 text-amber-300 hover:bg-amber-900/40'
                : 'bg-blue-950/30 border-blue-800/60 text-blue-400 hover:bg-blue-900/40'
            }`}
            title="Toggle between Standalone Mock State and Live Backend Proxy API"
          >
            <Activity className="w-3 h-3" />
            <span>{isMockMode ? 'MOCK MODE' : 'LIVE API'}</span>
          </button>

          {/* Theme Selector Control */}
          <div className="flex items-center bg-[#141416] border border-zinc-800 rounded p-0.5 text-[11px] font-mono">
            <button
              onClick={() => onThemeChange('dark')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                theme === 'dark'
                  ? 'bg-zinc-800 text-blue-400 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Dark Theme (Default Charcoal)"
            >
              <Moon className="w-3 h-3" />
              <span className="hidden xl:inline">Dark</span>
            </button>
            <button
              onClick={() => onThemeChange('light')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                theme === 'light'
                  ? 'bg-zinc-800 text-amber-400 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Light Theme (Crisp Slate)"
            >
              <Sun className="w-3 h-3" />
              <span className="hidden xl:inline">Light</span>
            </button>
            <button
              onClick={() => onThemeChange('steel')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                theme === 'steel'
                  ? 'bg-zinc-800 text-cyan-400 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Steel Theme (Industrial Metallic Slate)"
            >
              <Palette className="w-3 h-3" />
              <span className="hidden xl:inline">Steel</span>
            </button>
          </div>

          {/* Integration Guide Modal Button */}
          <button
            onClick={onOpenIntegrationGuide}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
            title="Integration & Live Deployment Guide"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
            title="Refresh State"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>
    </header>
  );
};
