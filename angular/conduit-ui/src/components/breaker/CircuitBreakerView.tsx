import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertOctagon, RotateCcw, Pause, Play, Settings, Save } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { BreakerStateResponse, FailureRecoveryConfig } from '../../types/conduit';

export const CircuitBreakerView: React.FC = () => {
  const [breakerState, setBreakerState] = useState<BreakerStateResponse | null>(null);
  const [recoveryConfig, setRecoveryConfig] = useState<FailureRecoveryConfig | null>(null);
  const [tripReason, setTripReason] = useState<string>('LLM rate limit exceeded repeatedly');
  const [loading, setLoading] = useState<boolean>(false);

  const loadBreaker = async () => {
    setLoading(true);
    try {
      const [bRes, rRes] = await Promise.all([
        apiService.getBreakerState(),
        apiService.getFailureRecoveryConfig(),
      ]);
      setBreakerState(bRes);
      setRecoveryConfig(rRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBreaker();
  }, []);

  const handleTrip = async () => {
    try {
      await apiService.tripBreaker({ reason: tripReason, detail: 'Manual trip by operator' });
      await loadBreaker();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = async () => {
    try {
      await apiService.resetBreaker();
      await loadBreaker();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePause = async () => {
    try {
      await apiService.pauseOrchestration();
      await loadBreaker();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    try {
      await apiService.resumeOrchestration();
      await loadBreaker();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRecoveryConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryConfig) return;
    try {
      const updated = await apiService.saveFailureRecoveryConfig(recoveryConfig);
      setRecoveryConfig(updated);
      alert('Failure recovery config updated successfully!');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      {/* Header */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              6. Circuit Breaker & Safety Controls (`/api/breaker`)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Emergency orchestration safety controls: trip breaker, pause queues, reset faults, and configure model recovery limits.
          </p>
        </div>

        <button
          onClick={loadBreaker}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded border border-zinc-700"
        >
          Refresh Safety Status
        </button>
      </div>

      {/* Main Status Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
        {/* Breaker State Card */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <h2 className="font-bold text-zinc-300 uppercase flex items-center justify-between border-b border-zinc-800 pb-2">
            <span>Circuit Breaker Realtime Status</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                breakerState?.tripped
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {breakerState?.tripped ? 'TRIPPED (STOPPED)' : 'CLOSED (NORMAL)'}
            </span>
          </h2>

          <div className="space-y-3 bg-[#0c0c0e] border border-zinc-800 p-4 rounded">
            <div className="flex justify-between">
              <span className="text-zinc-500">Orchestration Paused:</span>
              <span className={`font-bold ${breakerState?.paused ? 'text-amber-400' : 'text-emerald-400'}`}>
                {breakerState?.paused ? 'YES (PAUSED)' : 'NO (RUNNING)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Retry Cooldown After:</span>
              <span className="text-zinc-200">{breakerState?.retry_after ?? 1800}s</span>
            </div>
            {breakerState?.tripped && (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Trip Reason:</span>
                  <span className="text-rose-400 font-bold">{breakerState.error}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tripped At:</span>
                  <span className="text-zinc-300">{breakerState.tripped_at ? new Date(breakerState.tripped_at).toLocaleString() : '--'}</span>
                </div>
              </>
            )}
          </div>

          {/* Breaker Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {breakerState?.tripped ? (
              <button
                onClick={handleReset}
                className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>POST /reset (Reset Breaker)</span>
              </button>
            ) : (
              <button
                onClick={handleTrip}
                className="py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>POST /trip (Trip Breaker)</span>
              </button>
            )}

            {breakerState?.paused ? (
              <button
                onClick={handleResume}
                className="py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>POST /resume</span>
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                <Pause className="w-4 h-4" />
                <span>POST /pause</span>
              </button>
            )}
          </div>
        </div>

        {/* Failure Recovery Config Form */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <h2 className="font-bold text-zinc-300 uppercase flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-400" />
              Failure Recovery Limits (`/api/breaker/failure-recovery`)
            </span>
          </h2>

          {recoveryConfig ? (
            <form onSubmit={handleSaveRecoveryConfig} className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">Max Retries Per Model</label>
                <input
                  type="number"
                  value={recoveryConfig.max_retries_per_model}
                  onChange={(e) => setRecoveryConfig({ ...recoveryConfig, max_retries_per_model: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Retry Delay Seconds</label>
                <input
                  type="number"
                  value={recoveryConfig.retry_delay_seconds}
                  onChange={(e) => setRecoveryConfig({ ...recoveryConfig, retry_delay_seconds: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Max Fallback Escalations</label>
                <input
                  type="number"
                  value={recoveryConfig.max_fallbacks}
                  onChange={(e) => setRecoveryConfig({ ...recoveryConfig, max_fallbacks: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="push_back"
                  checked={recoveryConfig.push_back_to_pending}
                  onChange={(e) => setRecoveryConfig({ ...recoveryConfig, push_back_to_pending: e.target.checked })}
                  className="accent-blue-500 rounded"
                />
                <label htmlFor="push_back" className="text-zinc-300">Push failed work requests back to PENDING queue</label>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded flex items-center justify-center gap-1.5 transition-colors mt-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Recovery Config</span>
              </button>
            </form>
          ) : (
            <div className="p-8 text-center text-zinc-500">Loading config...</div>
          )}
        </div>
      </div>
    </div>
  );
};
