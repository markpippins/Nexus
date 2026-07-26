import React, { useState } from 'react';
import {
  Cpu,
  RefreshCw,
  AlertOctagon,
  ShieldAlert,
  Zap,
  Sliders,
  Play,
  CheckCircle2,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { ModelChainConfig, AgentRole } from '../../types/conduit';

interface ModelChainControlProps {
  modelChains: ModelChainConfig[];
  onUpdateChain: (config: ModelChainConfig) => void;
}

export const ModelChainControl: React.FC<ModelChainControlProps> = ({
  modelChains,
  onUpdateChain,
}) => {
  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<AgentRole>('builder');
  const [isSimulating, setIsSimulating] = useState(false);

  const activeChain = modelChains.find((c) => c.role === selectedRole) || modelChains[0];

  const handleSimulateFallback = () => {
    setIsSimulating(true);
    setSimulationLog([]);

    const steps = [
      `[00:00] Initiating dispatch for role '${selectedRole}' with primary model '${activeChain.primaryModel}'...`,
      `[00:01] ⚠️ Primary model '${activeChain.primaryModel}' returned HTTP 429 Rate Limit.`,
      `[00:02] In-place retry 1/5 initiated (300s backoff timer active). Lease lock retained.`,
      `[00:03] ⚠️ Primary model '${activeChain.primaryModel}' still rate-limited on retry 2.`,
      `[00:04] 🔄 Transitioning to Fallback Model 1: '${activeChain.fallbackModels[0]}'...`,
      `[00:05] ✅ Dispatch succeeded on fallback '${activeChain.fallbackModels[0]}'! Attempt completed.`,
      `[00:06] Execution receipt issued and signed under ADR-006 authority.`,
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setSimulationLog((prev) => [...prev, step]);
        if (index === steps.length - 1) setIsSimulating(false);
      }, (index + 1) * 600);
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
              Model Chain Resilience & Budget Control Plane
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configure primary and fallback AI model chains per role, set USD budget ceilings, and simulate rate-limit recoveries.
          </p>
        </div>

        <button
          onClick={handleSimulateFallback}
          disabled={isSimulating}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(99,102,241,0.3)] self-start md:self-auto"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isSimulating ? 'Simulating Fallback...' : 'Simulate Model Chain Fallback'}</span>
        </button>
      </div>

      {/* Grid of Role Model Configurations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modelChains.map((config) => (
          <div
            key={config.role}
            onClick={() => setSelectedRole(config.role)}
            className={`bg-zinc-900 border rounded-lg p-4 space-y-3 cursor-pointer transition-all ${
              selectedRole === config.role
                ? 'border-indigo-500/80 ring-1 ring-indigo-500/40 shadow-lg'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-emerald-400 font-bold uppercase">{config.role} Role</span>
              {config.circuitBreakerTripped ? (
                <span className="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">
                  TRIPPED
                </span>
              ) : (
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                  ACTIVE
                </span>
              )}
            </div>

            <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800/80 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-500">Primary:</span>
                <span className="text-cyan-300 font-bold">{config.primaryModel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Fallbacks:</span>
                <span className="text-zinc-300">{config.fallbackModels.join(' → ')}</span>
              </div>
            </div>

            <div className="space-y-1 font-mono text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Budget Usage:</span>
                <span className="text-white font-bold">
                  ${config.currentUsageUsd.toFixed(2)} / ${config.budgetCapUsd.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (config.currentUsageUsd / config.budgetCapUsd) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Simulator Log Drawer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 font-mono text-xs">
          <span className="text-zinc-200 font-bold uppercase flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Model Chain Resilience Test Harness Log
          </span>
          <span className="text-zinc-500">Target Role: {selectedRole}</span>
        </div>

        <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-xs text-emerald-300 min-h-40 max-h-60 overflow-y-auto space-y-1.5 leading-relaxed">
          {simulationLog.length > 0 ? (
            simulationLog.map((log, idx) => <div key={idx}>{log}</div>)
          ) : (
            <div className="text-zinc-600 italic">
              Click "Simulate Model Chain Fallback" above to test primary model failure & fallback dispatch.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
