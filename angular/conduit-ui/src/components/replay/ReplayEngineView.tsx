import React, { useState, useEffect } from 'react';
import { RotateCcw, CheckCircle2, AlertTriangle, Layers, ArrowRight, Cpu } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { ReplayStateResponse, ReplayCompareResponse } from '../../types/conduit';

export const ReplayEngineView: React.FC = () => {
  const [targetVersion, setTargetVersion] = useState<number>(42);
  const [replayState, setReplayState] = useState<ReplayStateResponse | null>(null);
  const [compareResult, setCompareResult] = useState<ReplayCompareResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    handleReplay(42);
  }, []);

  const handleReplay = async (ver: number) => {
    setLoading(true);
    try {
      const [stateRes, compRes] = await Promise.all([
        apiService.getReplayState(ver),
        apiService.compareReplay(ver),
      ]);
      setReplayState(stateRes);
      setCompareResult(compRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      {/* Header */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              3. KSRA Replay & State Audit Engine (<code className="text-cyan-400">/replay</code>)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Reconstruct historical Kernel states using exact formula: <code className="text-blue-300">KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)</code>.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <label className="text-zinc-400">Target Version:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={targetVersion}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1;
              setTargetVersion(val);
            }}
            className="w-20 bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1 text-center font-bold text-cyan-300 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => handleReplay(targetVersion)}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors"
          >
            Reconstruct & Compare
          </button>
        </div>
      </div>

      {/* Version Slider Control */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-3 font-mono">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">STATE RECONSTRUCTION TIMELINE SLIDER</span>
          <span className="text-cyan-400 font-bold">Selected Version: v{targetVersion}</span>
        </div>
        <input
          type="range"
          min={1}
          max={42}
          value={targetVersion}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setTargetVersion(val);
            handleReplay(val);
          }}
          className="w-full accent-cyan-500 bg-zinc-800 h-2 rounded cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>v1 (Initial Boot)</span>
          <span>v21 (Checkpoint Snapshot)</span>
          <span>v42 (Live Engine Current)</span>
        </div>
      </div>

      {/* Reconstructed State vs Compare Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
        {/* Reconstructed State Box */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <h2 className="font-bold text-zinc-300 uppercase flex items-center gap-2 border-b border-zinc-800 pb-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Reconstructed State (`GET /replay?version={targetVersion}`)
          </h2>

          {replayState ? (
            <div className="space-y-3 bg-[#0c0c0e] border border-zinc-800 p-4 rounded">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">Version</div>
                  <div className="text-lg font-bold text-cyan-400">v{replayState.version}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">Plans Count</div>
                  <div className="text-lg font-bold text-white">{replayState.plan_count}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">Receipts Reconstituted</div>
                  <div className="text-lg font-bold text-emerald-400">{replayState.receipt_count}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">Graph Edges</div>
                  <div className="text-lg font-bold text-purple-400">{replayState.graph_edge_count}</div>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400">
                Reconstructed from snapshot baseline version {replayState.reconstructed_from_version}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500">Loading replay state...</div>
          )}
        </div>

        {/* Live vs Replay Audit Compare Box */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <h2 className="font-bold text-zinc-300 uppercase flex items-center gap-2 border-b border-zinc-800 pb-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Live vs Reconstructed Compare Audit (`GET /replay/compare`)
          </h2>

          {compareResult ? (
            <div className="space-y-3">
              <div
                className={`p-3 rounded border flex items-center justify-between ${
                  compareResult.match
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/60 border-amber-800 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {compareResult.match ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  )}
                  <span>
                    {compareResult.match
                      ? 'DETERMINISTIC REPLAY MATCH PERFECT'
                      : 'HISTORICAL STATE DISCREPANCY DETECTED'}
                  </span>
                </div>
                <span className="text-xs">
                  Live: v{compareResult.live_version} vs Replay: v{compareResult.replay_version}
                </span>
              </div>

              <div className="bg-[#0c0c0e] border border-zinc-800 p-4 rounded space-y-2">
                <div className="flex justify-between border-b border-zinc-800 pb-1.5 text-[11px]">
                  <span className="text-zinc-500">Metric</span>
                  <span className="text-zinc-300">Live Engine</span>
                  <span className="text-cyan-300">Replay Engine</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Plan Count</span>
                  <span className="text-zinc-200">{compareResult.live_plan_count}</span>
                  <span className="text-cyan-300">{compareResult.replay_plan_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Receipt Count</span>
                  <span className="text-zinc-200">{compareResult.live_receipt_count}</span>
                  <span className="text-cyan-300">{compareResult.replay_receipt_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Identity Count</span>
                  <span className="text-zinc-200">{compareResult.live_identity_count}</span>
                  <span className="text-cyan-300">{compareResult.replay_identity_count}</span>
                </div>
              </div>

              {compareResult.diffs && compareResult.diffs.length > 0 && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded text-rose-300 text-[11px] space-y-1">
                  <div className="font-bold uppercase">Discrepancy Details:</div>
                  {compareResult.diffs.map((d, idx) => (
                    <div key={idx}>• {d}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500">Loading compare audit...</div>
          )}
        </div>
      </div>
    </div>
  );
};
