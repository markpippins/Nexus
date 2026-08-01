import React, { useState } from 'react';
import {
  Play,
  Skull,
  Clock,
  Cpu,
  Terminal,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Folder,
  Send,
  Sparkles,
  BarChart2,
  Layers
} from 'lucide-react';
import { SessionLedger, SystemRole, AIModel } from '../types';

interface SessionsPlaygroundTabProps {
  sessions: SessionLedger[];
  roles: SystemRole[];
  models: AIModel[];
  onKillSession: (sessionId: string) => Promise<void>;
  onRunTest: (role: string, modelId: string, prompt: string) => Promise<any>;
}

export const SessionsPlaygroundTab: React.FC<SessionsPlaygroundTabProps> = ({
  sessions,
  roles,
  models,
  onKillSession,
  onRunTest
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sandbox' | 'ledger'>('sandbox');

  // Sandbox state
  const [testRole, setTestRole] = useState<string>(roles[0]?.name || 'operator');
  const [testModelId, setTestModelId] = useState<string>(models[0]?.id || 'mod-gemini-3.6-flash');
  const [promptText, setPromptText] = useState<string>(
    'Analyze the current Tackle inference configuration and output an optimized execution plan for low latency streaming.'
  );
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handleExecuteTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    setIsRunningTest(true);
    setTestResult(null);

    try {
      const resData = await onRunTest(testRole, testModelId, promptText);
      setTestResult(resData);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to execute inference test'
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub navigation */}
      <div className="flex items-center space-x-2 border-b border-[var(--border-color)] pb-3">
        <button
          onClick={() => setActiveSubTab('sandbox')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'sandbox'
              ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Inference Testing Sandbox</span>
        </button>
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'ledger'
              ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Session Ledger ({sessions.length})</span>
        </button>
      </div>

      {/* 1. SANDBOX VIEW */}
      {activeSubTab === 'sandbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Test Controls */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <Zap className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Live Model Execution Sandbox
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Send live test payloads to `/config/ai/test` using server-side Gemini SDK.
                </p>
              </div>
            </div>

            <form onSubmit={handleExecuteTest} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                    Target Role Context
                  </label>
                  <select
                    value={testRole}
                    onChange={e => setTestRole(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                    Target Model
                  </label>
                  <select
                    value={testModelId}
                    onChange={e => setTestModelId(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                  Test Prompt Payload
                </label>
                <textarea
                  rows={6}
                  required
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                  placeholder="Enter prompt instructions..."
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-color)]"
                />
              </div>

              <button
                type="submit"
                disabled={isRunningTest}
                className="w-full py-2.5 rounded-lg font-bold text-xs bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isRunningTest ? (
                  <>
                    <Zap className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Executing Inference in Server...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Run Inference Test</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Execution Output Console */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Inference Output & Trace
                  </h3>
                </div>

                {testResult && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-800/40">
                    {testResult.latency_ms || 120}ms
                  </span>
                )}
              </div>

              {isRunningTest ? (
                <div className="py-20 text-center space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-color)] border-t-transparent animate-spin mx-auto" />
                  <div className="text-xs font-mono text-[var(--accent-color)] animate-pulse">
                    Dispatching stream roundtrip to backend server...
                  </div>
                </div>
              ) : testResult ? (
                <div className="space-y-3 mt-3">
                  {/* Performance stats banner */}
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Latency</div>
                      <div className="font-bold text-emerald-400">{testResult.latency_ms || 180} ms</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Input Tokens</div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {testResult.usage?.input_tokens || 42}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Output Tokens</div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {testResult.usage?.output_tokens || 128}
                      </div>
                    </div>
                  </div>

                  {/* Output Text */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      Model Generated Output
                    </span>
                    <div className="p-3.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)] leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                      {testResult.output || testResult.text || JSON.stringify(testResult, null, 2)}
                    </div>
                  </div>

                  {/* Execution Trace */}
                  {testResult.trace && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                        Subsystem Resolved Trace
                      </span>
                      <pre className="p-2.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-secondary)] overflow-x-auto">
                        {JSON.stringify(testResult.trace, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center text-xs text-[var(--text-muted)] font-mono space-y-2">
                  <Sparkles className="w-6 h-6 text-[var(--text-muted)] mx-auto opacity-40" />
                  <div>No test execution output yet.</div>
                  <p className="text-[11px] opacity-70">
                    Click 'Run Inference Test' on the left panel to trigger execution.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. SESSIONS LEDGER VIEW */}
      {activeSubTab === 'ledger' && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Tackle Session Ledger (`tackle.sessions`)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Active worker processes, cost tracking, token usage & process termination control.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            {sessions.map(sess => (
              <div
                key={sess.id}
                className="p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-[var(--text-primary)]">
                      Session #{sess.id}
                    </span>

                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                        sess.status === 'running'
                          ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40 animate-pulse'
                          : sess.status === 'completed'
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
                          : sess.status === 'killed'
                          ? 'bg-rose-950/60 text-rose-300 border-rose-800/40'
                          : 'bg-amber-950/60 text-amber-300 border-amber-800/40'
                      }`}
                    >
                      {sess.status}
                    </span>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] font-bold">
                      ROLE: {sess.active_role}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-[var(--text-secondary)] flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Folder className="w-3 h-3 text-[var(--text-muted)]" />
                      {sess.project_dir}
                    </span>
                    <span>•</span>
                    <span>Model: {sess.model_id}</span>
                  </div>

                  <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-3">
                    <span>Started: {new Date(sess.started_at).toLocaleTimeString()}</span>
                    <span>•</span>
                    <span>Tokens: {sess.tokens_used?.total || 0}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {sess.status === 'running' && (
                    <button
                      onClick={async () => {
                        if (confirm(`Send SIGKILL to session '${sess.id}'?`)) {
                          try {
                            await onKillSession(sess.id);
                          } catch (err) {
                            alert(`Error killing session: ${err instanceof Error ? err.message : String(err)}`);
                          }
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Skull className="w-3.5 h-3.5" />
                      <span>{'POST /sessions/{id}/kill (SIGKILL)'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
