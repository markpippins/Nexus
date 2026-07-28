import React, { useState } from 'react';
import { BookOpen, X, Copy, Check, Terminal, Database, Server } from 'lucide-react';

interface IntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegrationModal: React.FC<IntegrationModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const envSnippet = `# PostgreSQL Nexus Connection String
CONDUIT_PG_DSN=postgresql://nexus_admin:YOUR_PASSWORD@postgres.internal.nexus:5432/nexus
CONDUIT_PG_SCHEMA=conduit

# WRP Kernel Runtime API URL
WRP_KERNEL_URL=http://localhost:3103

# Model Chain & MCP Server
MCP_BASE_URL=http://localhost:3100
PIPELINE_MODEL=gemini-1.5-pro

# Server Port
PORT=3000
NODE_ENV=production`;

  const handleCopy = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="font-mono text-base font-bold text-white uppercase">
              Integration & Production Deployment Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded border border-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-300 font-sans">
          This Conduit UI frontend connects seamlessly to your live PostgreSQL <code className="text-cyan-300 font-mono">nexus</code> database, WRP Kernel API server, and MCP agent cluster.
        </p>

        {/* Environment Configuration Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase">
              1. Environment Variables (.env)
            </span>
            <button
              onClick={handleCopy}
              className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Config'}</span>
            </button>
          </div>

          <pre className="bg-zinc-950 p-3 rounded border border-zinc-800 font-mono text-[11px] text-emerald-300 overflow-x-auto leading-relaxed">
            {envSnippet}
          </pre>
        </div>

        {/* Backend Execution Commands */}
        <div className="space-y-2 font-mono text-xs">
          <span className="font-bold text-zinc-400 uppercase">2. Conduit Orchestrator Commands</span>
          <div className="bg-zinc-950 p-3 rounded border border-zinc-800 space-y-1.5 text-zinc-300 text-[11px]">
            <div><span className="text-zinc-500"># Run full orchestrator loop:</span> python3 main.py --all</div>
            <div><span className="text-zinc-500"># Continuous WRP Kernel daemon:</span> python3 main.py --kernel-sync-daemon</div>
            <div><span className="text-zinc-500"># Start FastAPI Kernel API server:</span> python3 -m app.main --port 3103</div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded"
          >
            Got it, return to Control Plane
          </button>
        </div>
      </div>
    </div>
  );
};
