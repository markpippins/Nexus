import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  ArrowRight,
  Shield,
  Layers,
  Cpu,
  Server,
  Play,
  Clock,
  Sparkles,
  Lock,
  Globe
} from 'lucide-react';
import { SystemRole, ValidationReport, AIModel, Provider, Harness, ConfigBundle } from '../types';

interface OverviewTabProps {
  roles: SystemRole[];
  models: AIModel[];
  providers: Provider[];
  harnesses: Harness[];
  bundles: ConfigBundle[];
  validationReport: ValidationReport | null;
  onValidate: () => void;
  onRunTest: (role: string, modelId: string, prompt: string) => void | Promise<unknown>;
  onSeedDefaults: () => void;
  onNavigateToTab: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  roles,
  models,
  providers,
  harnesses,
  bundles,
  validationReport,
  onValidate,
  onRunTest,
  onSeedDefaults,
  onNavigateToTab
}) => {
  const [selectedRole, setSelectedRole] = useState<string>(roles[0]?.name || 'operator');
  const [resolvedData, setResolvedData] = useState<any>(null);
  const [loadingResolve, setLoadingResolve] = useState<boolean>(false);
  const [quickPrompt, setQuickPrompt] = useState<string>('Verify system status and inspect active inference config.');

  useEffect(() => {
    if (selectedRole) {
      fetchResolvedRole(selectedRole);
    }
  }, [selectedRole, bundles]);

  const fetchResolvedRole = async (roleName: string) => {
    setLoadingResolve(true);
    try {
      const res = await fetch(`/config/ai/resolve/${roleName}`);
      if (res.ok) {
        const data = await res.json();
        setResolvedData(data);
      } else {
        setResolvedData(null);
      }
    } catch (err) {
      setResolvedData(null);
    } finally {
      setLoadingResolve(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--accent-color)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                AI Configuration Subsystem Overview
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Live resolution of role config bundles, model bindings, providers & failure recovery parameters.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onValidate}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              <span>Validate Integrity</span>
            </button>
            <button
              onClick={onSeedDefaults}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>Seed Defaults</span>
            </button>
          </div>
        </div>

        {/* Validation Status Box */}
        {validationReport && (
          <div
            className={`mt-4 p-3 rounded-lg border text-xs flex items-start gap-3 ${
              validationReport.valid
                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
            }`}
          >
            {validationReport.valid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 flex-1">
              <div className="font-semibold flex items-center justify-between">
                <span>
                  Configuration Integrity Status:{' '}
                  {validationReport.valid ? 'PASSED & HEALTHY' : 'WARNINGS DETECTED'}
                </span>
                <span className="font-mono text-[10px] opacity-70">
                  {validationReport.check_timestamp
                    ? `Checked: ${new Date(validationReport.check_timestamp).toLocaleTimeString()}`
                    : ''}
                </span>
              </div>
              {validationReport.warnings.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 opacity-90 text-[11px]">
                  {validationReport.warnings.map((w, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">[{w.role}]</span>{' '}
                      {w.message}
                      {w.severity === 'error' && (
                        <span className="ml-1 text-[10px] font-bold text-rose-400 uppercase">ERROR</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {validationReport.errors && validationReport.errors.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] text-rose-300">
                  {validationReport.errors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Role Active Resolver Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Role Selection */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent-color)]" />
              <span>Select System Role</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Select a role to inspect active priority bundle resolution (`/config/ai/resolve/:role`).
            </p>

            <div className="space-y-2">
              {roles.map(r => {
                const isSelected = selectedRole === r.name;
                const roleBundles = bundles.filter(b => b.role === r.name && b.is_active);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRole(r.name)}
                    className={`w-full text-left p-3 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[var(--bg-tertiary)] border-[var(--accent-color)] text-[var(--text-primary)] shadow-sm'
                        : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-color)]'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-bold text-xs flex items-center gap-2">
                        <span>{r.name}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-ping" />
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                        {r.description || 'System agent role'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] border border-[var(--border-subtle)]">
                        {roleBundles.length} active
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab('bundles')}
            className="mt-4 w-full py-2 px-3 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Manage All Config Bundles</span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          </button>
        </div>

        {/* Right Column (2 cols): Resolved Active Config Card */}
        <div className="lg:col-span-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Active Resolved Bundle for <span className="font-mono text-[var(--accent-color)]">{selectedRole}</span>
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Evaluated based on priority ascending, is_active=true, and valid date bounds.
              </p>
            </div>

            <button
              onClick={() => fetchResolvedRole(selectedRole)}
              className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title="Refresh Resolution"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingResolve ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingResolve ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)] animate-pulse">
              Resolving active bundle from tackle-srv...
            </div>
          ) : resolvedData ? (
            resolvedData.error ? (
              <div className="py-10 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Resolution Error for '{selectedRole}'
                </div>
                <p className="text-xs text-[var(--text-secondary)] font-mono">
                  {resolvedData.error}
                </p>
              </div>
            ) : (() => {
              // Normalize: backend returns flat shape, mock returns nested
              const isFlat = !resolvedData.resolved_bundle;
              const modelId = isFlat ? resolvedData.model_identifier : resolvedData.resolved_bundle?.model_id;
              const modelName = isFlat ? resolvedData.model_identifier : resolvedData.model?.name;
              const providerName = isFlat ? (resolvedData.provider_name || resolvedData.provider_type) : resolvedData.provider?.name;
              const providerUrl = isFlat ? resolvedData.endpoint_url : resolvedData.provider?.endpoint_url;
              const harnessName = isFlat ? resolvedData.harness_name : resolvedData.harness?.name;
              const harnessProto = isFlat
                ? (resolvedData.invocation_semantics?.execution?.mode || resolvedData.invocation_semantics?.semantics?.model?.type || 'direct')
                : resolvedData.harness?.invocation_semantics?.protocol;
              const bundleName = isFlat ? `${selectedRole} config` : resolvedData.resolved_bundle?.name;
              const bundleId = isFlat ? null : resolvedData.resolved_bundle?.id;
              const bundleMode = isFlat ? (resolvedData.invocation_semantics?.execution?.mode || 'direct') : resolvedData.resolved_bundle?.invocation_mode;
              const bundleTimeout = isFlat ? null : resolvedData.resolved_bundle?.timeout_ms;
              const fallbacks = isFlat ? (resolvedData.fallback_models || []) : (resolvedData.fallbacks || []);

              return (
            <div className="space-y-4">
              {/* Primary Active Resolved Bundle Header */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {bundleName || 'Unnamed Bundle'}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] border border-[var(--border-subtle)]">
                        {bundleMode}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] font-mono mt-1">
                      {bundleId ? `Bundle ID: ${bundleId}` : `Model: ${modelId}`}
                    </div>
                  </div>
                  <div className="text-right">
                    {bundleTimeout && (
                      <span className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" />
                        {bundleTimeout}ms timeout
                      </span>
                    )}
                  </div>
                </div>

                {/* Subsystem Pipeline Stack */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  {/* Model */}
                  <div className="p-2.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[var(--accent-color)]" />
                      <span>Model</span>
                    </div>
                    <div className="font-bold text-xs text-[var(--text-primary)]">
                      {modelName || 'Unknown Model'}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] truncate">
                      {modelId || modelName || '—'}
                    </div>
                  </div>

                  {/* Provider */}
                  <div className="p-2.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] flex items-center gap-1">
                      <Server className="w-3 h-3 text-cyan-400" />
                      <span>Provider</span>
                    </div>
                    <div className="font-bold text-xs text-[var(--text-primary)]">
                      {providerName || 'Default Provider'}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] truncate flex items-center gap-1">
                      <Globe className="w-2.5 h-2.5" />
                      {providerUrl || 'Standard API'}
                    </div>
                  </div>

                  {/* Harness */}
                  <div className="p-2.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1">
                    <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] flex items-center gap-1">
                      <Layers className="w-3 h-3 text-indigo-400" />
                      <span>Harness</span>
                    </div>
                    <div className="font-bold text-xs text-[var(--text-primary)]">
                      {harnessName || 'Direct Harness'}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--text-secondary)]">
                      {harnessProto ? `Mode: ${harnessProto}` : 'HTTP REST'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fallback Bundles Queue */}
              {fallbacks.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider font-mono">
                    Standby Fallbacks ({fallbacks.length})
                  </div>
                  <div className="space-y-1.5">
                    {fallbacks.map((fb: any, idx: number) => (
                      <div
                        key={fb.model_identifier || fb.id || idx}
                        className="p-2.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] font-bold">
                            #{fb.priority ?? idx + 2}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">{fb.model_identifier || fb.name}</span>
                          {fb.provider_type && (
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">via {fb.provider_type}</span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/40">
                          FALLBACK
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Prompt Test */}
              <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Quick Test Invocation</span>
                  </span>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    Target: {modelName || modelId}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={quickPrompt}
                    onChange={e => setQuickPrompt(e.target.value)}
                    placeholder="Enter test prompt..."
                    className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] font-mono"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await onRunTest(selectedRole, modelName || modelId || 'mod-gemini-3.6-flash', quickPrompt);
                      } catch (err) {
                        alert(`Test failed: ${err instanceof Error ? err.message : String(err)}`);
                      }
                      onNavigateToTab('sessions-playground');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-color)] text-slate-950 hover:bg-[var(--accent-hover)] transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>Run in Sandbox</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
              );
            })()
          ) : (
            <div className="py-10 text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                No Active Bundle Resolved for '{selectedRole}'
              </div>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                No bundle currently matches priority conditions or valid date window. Please assign or activate a bundle for this role.
              </p>
              <button
                onClick={() => onNavigateToTab('bundles')}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-color)] text-slate-950 font-bold"
              >
                Create Bundle
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subsystem Architecture Topology Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div
          onClick={() => onNavigateToTab('registry')}
          className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[var(--text-muted)]">01. Providers</span>
            <Server className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">{providers.length}</div>
          <div className="text-xs text-[var(--text-secondary)]">Google Gemini, OpenAI, Anthropic, Ollama, vLLM</div>
        </div>

        {/* Card 2 */}
        <div
          onClick={() => onNavigateToTab('registry')}
          className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[var(--text-muted)]">02. Harnesses</span>
            <Layers className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">{harnesses.length}</div>
          <div className="text-xs text-[var(--text-secondary)]">Gemini SDK, OpenAI Direct, Anthropic Messages</div>
        </div>

        {/* Card 3 */}
        <div
          onClick={() => onNavigateToTab('registry')}
          className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[var(--text-muted)]">03. Models</span>
            <Cpu className="w-4 h-4 text-[var(--accent-color)] group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">{models.length}</div>
          <div className="text-xs text-[var(--text-secondary)]">gemini-3.6-flash, gpt-4o, claude-3-7-sonnet</div>
        </div>

        {/* Card 4 */}
        <div
          onClick={() => onNavigateToTab('bundles')}
          className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-[var(--text-muted)]">04. Bundles</span>
            <Zap className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">{bundles.length}</div>
          <div className="text-xs text-[var(--text-secondary)]">Priority ordering, invocation modes & fallback rules</div>
        </div>
      </div>
    </div>
  );
};
