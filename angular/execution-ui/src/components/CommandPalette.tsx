import React, { useState, useEffect } from 'react';
import { Search, Terminal, FileCode2, Clock, PlayCircle, GitBranch, ShieldAlert, Cpu, X, ArrowRight } from 'lucide-react';
import { NavTab } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: NavTab) => void;
  onSelectRequest: (id: string) => void;
  onSelectLease: (id: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onSelectRequest,
  onSelectLease
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    { id: 'dashboard', title: 'Go to Fleet Overview', category: 'Navigation', icon: Terminal, action: () => { onSelectTab('dashboard'); onClose(); } },
    { id: 'integrity-scan', title: 'Run Integrity Scan', category: 'Health & Integrity', icon: ShieldAlert, action: () => { onSelectTab('integrity-scan'); onClose(); } },
    { id: 'requests', title: 'Browse All Requests (323)', category: 'Requests', icon: FileCode2, action: () => { onSelectTab('requests'); onClose(); } },
    { id: 'leases', title: 'Inspect Stale Leases & TTL', category: 'Leases', icon: Clock, action: () => { onSelectTab('leases'); onClose(); } },
    { id: 'attempts', title: 'View Attempts Tree History', category: 'Attempts', icon: PlayCircle, action: () => { onSelectTab('attempts'); onClose(); } },
    { id: 'receipts-origin', title: 'Inspect Receipts Lineage Seam', category: 'Receipts', icon: GitBranch, action: () => { onSelectTab('receipts-origin'); onClose(); } },
    { id: 'fleet', title: 'Inspect Executor Fleet Status', category: 'Fleet', icon: Cpu, action: () => { onSelectTab('fleet'); onClose(); } },
    { id: 'req_000001', title: 'Inspect Sample Request req_000001', category: 'Sample Request', icon: FileCode2, action: () => { onSelectRequest('req_000001'); onClose(); } },
    { id: 'les_000001', title: 'Inspect Sample Lease les_000001', category: 'Sample Lease', icon: Clock, action: () => { onSelectLease('les_000001'); onClose(); } }
  ];

  const filteredCommands = commands.filter(c => 
    c.title.toLowerCase().includes(query.toLowerCase()) || 
    c.category.toLowerCase().includes(query.toLowerCase()) ||
    c.id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-xl overflow-hidden font-mono text-xs">
        {/* Search Header */}
        <div className="flex items-center px-3 py-2.5 border-b border-slate-800 bg-slate-950/50">
          <Search className="w-4 h-4 text-slate-400 mr-2.5" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type command, request ID (e.g. req_000001), or lease ID..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-sm"
            autoFocus
          />
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Command list */}
        <div className="max-h-80 overflow-y-auto p-1 space-y-0.5">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-slate-500">
              No matching commands or entities found for &quot;{query}&quot;.
            </div>
          ) : (
            filteredCommands.map(cmd => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors group text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-slate-200 font-medium group-hover:text-emerald-300">{cmd.title}</div>
                      <div className="text-[10px] text-slate-500">{cmd.category}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-emerald-400 transition-opacity" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-slate-800/80 bg-slate-950/80 text-[10px] text-slate-500 flex justify-between items-center">
          <span>Navigate with 🠅 🠇, Select with ↵</span>
          <span>NEXUS // EXECUTION-SRV</span>
        </div>
      </div>
    </div>
  );
};
