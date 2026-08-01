import React from 'react';
import {
  Cpu,
  RefreshCw,
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Menu
} from 'lucide-react';
import { ThemeMode } from '../types';

interface HeaderProps {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isOnline: boolean;
  activeSessionCount: number;
  healthStatus: { status: string; timestamp?: string } | null;
  onRefreshMemory: () => void;
  isRefreshingMemory: boolean;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  setTheme,
  isOnline,
  activeSessionCount,
  onRefreshMemory,
  isRefreshingMemory,
  onToggleMobileMenu
}) => {
  return (
    <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Toggle Button */}
            {onToggleMobileMenu && (
              <button
                onClick={onToggleMobileMenu}
                className="lg:hidden p-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                title="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="h-8 w-8 rounded-lg bg-[var(--badge-bg)] border border-[var(--border-color)] flex items-center justify-center text-[var(--accent-color)] shadow-inner shrink-0">
              <Cpu className="w-4 h-4 animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] uppercase">
                Tackle <span className="text-[var(--accent-color)]">Registry</span>
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] border border-[var(--border-color)] hidden sm:inline-block">
                v3.4.10
              </span>
            </div>
          </div>

          {/* Status Indicators & Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* System Health */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              {isOnline ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold text-[11px] sm:text-xs">API ONLINE</span>
                  <span className="text-[var(--text-muted)] text-[11px] hidden md:inline ml-1">:3410</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400 font-semibold text-[11px] sm:text-xs">OFFLINE</span>
                </>
              )}
            </div>

            {/* Active Sessions */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{activeSessionCount} Sessions</span>
            </div>

            {/* Memory Cache Sync Trigger */}
            <button
              onClick={onRefreshMemory}
              disabled={isRefreshingMemory}
              title="Refresh Role Memory Redis Cache"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent-color)] ${isRefreshingMemory ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Sync Memory</span>
            </button>

            {/* Theme Selector */}
            <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-0.5">
              <button
                onClick={() => setTheme('steel')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                  theme === 'steel'
                    ? 'bg-[var(--accent-color)] text-slate-950 font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Steel Metallic Theme"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">Steel</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-[var(--accent-color)] text-white font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Obsidian Dark Theme"
              >
                <Moon className="w-3 h-3" />
                <span className="hidden sm:inline">Dark</span>
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                  theme === 'light'
                    ? 'bg-[var(--accent-color)] text-white font-semibold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Executive Light Theme"
              >
                <Sun className="w-3 h-3" />
                <span className="hidden sm:inline">Light</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

