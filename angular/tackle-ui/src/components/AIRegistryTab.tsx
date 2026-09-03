import React, { useState } from 'react';
import {
  Server,
  Layers,
  Cpu,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Code,
  Globe,
  CheckCircle,
  XCircle,
  X,
  ShieldCheck,
  Package
} from 'lucide-react';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import { Provider, Harness, AIModel, SystemRole, ConfigBundle } from '../types';
import { BundleModal } from './BundleModal';

interface AIRegistryTabProps {
  providers: Provider[];
  harnesses: Harness[];
  models: AIModel[];
  roles: SystemRole[];
  bundles?: ConfigBundle[];
  onSaveProvider: (prov: Partial<Provider>) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  onSaveHarness: (harn: Partial<Harness>) => Promise<void>;
  onDeleteHarness: (id: string) => Promise<void>;
  onSaveModel: (mod: Partial<AIModel>) => Promise<void>;
  onDeleteModel: (id: string) => Promise<void>;
  onSaveBundle: (bundle: Partial<ConfigBundle>) => Promise<void>;
  onVerifyModel: (modelId: string, prompt?: string) => Promise<any>;
  onVerifyStatus: (sessionId: string) => Promise<any>;
  onRefresh: () => Promise<void>;
}

export const AIRegistryTab: React.FC<AIRegistryTabProps> = ({
  providers,
  harnesses,
  models,
  roles,
  bundles,
  onSaveProvider,
  onDeleteProvider,
  onSaveHarness,
  onDeleteHarness,
  onSaveModel,
  onDeleteModel,
  onSaveBundle,
  onVerifyModel,
  onVerifyStatus,
  onRefresh
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'providers' | 'harnesses' | 'models'>('models');
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});

  // Shared config-bundle modal (same dialog as the Config Bundles view)
  const [bundleModalOpen, setBundleModalOpen] = useState<boolean>(false);
  const [bundlePrefill, setBundlePrefill] = useState<Partial<ConfigBundle> | null>(null);
  // Bumped on every open so the modal remounts with fresh form state.
  const [bundleModalKey, setBundleModalKey] = useState<number>(0);

  // ── Models toolbar state ──────────────────────────────────────────
  const [modelSearch, setModelSearch] = useState('');
  const [modelSort, setModelSort] = useState<'name' | 'provider' | 'verified' | 'date'>('name');
  const [modelSortAsc, setModelSortAsc] = useState(true);
  const [modelFilterProvider, setModelFilterProvider] = useState<string>('all');
  const [modelFilterHarness, setModelFilterHarness] = useState<string>('all');
  const [modelFilterVerified, setModelFilterVerified] = useState<'all' | 'verified' | 'unverified'>('all');
  const [modelFilterAssigned, setModelFilterAssigned] = useState<'all' | 'assigned' | 'unassigned'>('all');

  // Verify-model state — one verification at a time; outcome keyed by model id
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<Record<string, { ok: boolean; message: string }>>({});

  // ── Verify Model flow ──────────────────────────────────────────────
  // Runs a real inference through the harness (POST /config/ai/verify),
  // polls the session status until it settles, then refreshes so the badge
  // flips to VERIFIED and the model's bundles re-arm server-side.
  const verifyModel = async (m: AIModel) => {
    if (verifyingId) return;
    if (!(await showConfirm(
      `Run a verification inference against "${m.name}" (${m.model_identifier})?\n\n` +
      `On success the model becomes VERIFIED and every config bundle referencing it is re-armed (active).`
    ))) return;

    setVerifyingId(m.id);
    setVerifyOutcome(prev => { const n = { ...prev }; delete n[m.id]; return n; });
    try {
      const started = await onVerifyModel(m.id);
      if (started?.alreadyVerified) {
        setVerifyOutcome(prev => ({ ...prev, [m.id]: { ok: true, message: 'Already verified' } }));
        return;
      }

      const sessionId: string | undefined = started?.sessionId;
      if (!sessionId) throw new Error('No verify session returned');

      const deadline = Date.now() + 180_000;
      let status: any = null;
      do {
        await new Promise(r => setTimeout(r, 1500));
        status = await onVerifyStatus(sessionId);
      } while (status?.running && Date.now() < deadline);

      if (!status) {
        setVerifyOutcome(prev => ({ ...prev, [m.id]: { ok: false, message: 'Could not read verify status' } }));
      } else if (status.running) {
        setVerifyOutcome(prev => ({ ...prev, [m.id]: { ok: false, message: 'Verification timed out after 180s — check the session log' } }));
      } else {
        const ok = status.exit_code === 0;
        setVerifyOutcome(prev => ({ ...prev, [m.id]: {
          ok,
          message: ok
            ? 'Verified — model is now selectable and its bundles are re-armed'
            : `Failed (exit ${status.exit_code ?? '?'}) — see the session log for details`
        } }));
      }
    } catch (err: any) {
      setVerifyOutcome(prev => ({ ...prev, [m.id]: { ok: false, message: `Verify failed: ${err instanceof Error ? err.message : String(err)}` } }));
    } finally {
      setVerifyingId(null);
      try { await onRefresh(); } catch { /* refresh is best-effort */ }
    }
  };

  // Modals state
  const [provModalOpen, setProvModalOpen] = useState<boolean>(false);
  const [editingProv, setEditingProv] = useState<Partial<Provider> | null>(null);
  const [provId, setProvId] = useState<string>('');
  const [provName, setProvName] = useState<string>('');
  const [provType, setProvType] = useState<Provider['type']>('gemini');
  const [provEndpoint, setProvEndpoint] = useState<string>('');
  const [provApiKey, setProvApiKey] = useState<string>('');
  const [provConfigJson, setProvConfigJson] = useState<string>('{}');

  const [harnModalOpen, setHarnModalOpen] = useState<boolean>(false);
  const [editingHarn, setEditingHarn] = useState<Partial<Harness> | null>(null);
  const [harnId, setHarnId] = useState<string>('');
  const [harnName, setHarnName] = useState<string>('');
  const [harnStreaming, setHarnStreaming] = useState<boolean>(true);
  const [harnFunctions, setHarnFunctions] = useState<boolean>(true);
  const [harnVision, setHarnVision] = useState<boolean>(true);
  const [harnTimeout, setHarnTimeout] = useState<number>(30000);
  const [harnProtocol, setHarnProtocol] = useState<string>('HTTP REST');

  const [modModalOpen, setModModalOpen] = useState<boolean>(false);
  const [editingMod, setEditingMod] = useState<Partial<AIModel> | null>(null);
  const [modId, setModId] = useState<string>('');
  const [modName, setModName] = useState<string>('');
  const [modHarnessId, setModHarnessId] = useState<string>('');
  const [modProviderId, setModProviderId] = useState<string>('');
  const [modIdentifier, setModIdentifier] = useState<string>('');

  // Provider Handlers
  const openProvModal = (p?: Provider) => {
    if (p) {
      setEditingProv(p);
      setProvId(p.id);
      setProvName(p.name);
      setProvType(p.type);
      setProvEndpoint(p.endpoint_url || '');
      setProvApiKey(p.api_key || '');
      setProvConfigJson(JSON.stringify(p.config_json || {}, null, 2));
    } else {
      setEditingProv(null);
      setProvId(`prov-${Date.now().toString(36)}`);
      setProvName('');
      setProvType('gemini');
      setProvEndpoint('https://generativelanguage.googleapis.com');
      setProvApiKey('');
      setProvConfigJson('{\n  "temperature": 0.7\n}');
    }
    setProvModalOpen(true);
  };

  const handleSaveProv = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedConfig = {};
    try {
      parsedConfig = JSON.parse(provConfigJson);
    } catch (e) {
      parsedConfig = {};
    }
    try {
      await onSaveProvider({
        id: provId,
        name: provName,
        type: provType,
        endpoint_url: provEndpoint,
        api_key: provApiKey,
        config_json: parsedConfig
      });
      setProvModalOpen(false);
    } catch (err) {
      showToast(`Error saving provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Harness Handlers
  const openHarnModal = (h?: Harness) => {
    if (h) {
      setEditingHarn(h);
      setHarnId(h.id);
      setHarnName(h.name);
      setHarnStreaming(h.invocation_semantics?.supports_streaming ?? true);
      setHarnFunctions(h.invocation_semantics?.supports_function_calling ?? true);
      setHarnVision(h.invocation_semantics?.supports_vision ?? true);
      setHarnTimeout(h.invocation_semantics?.timeout_default_ms || 30000);
      setHarnProtocol(h.invocation_semantics?.protocol || 'HTTP REST');
    } else {
      setEditingHarn(null);
      setHarnId(`harn-${Date.now().toString(36)}`);
      setHarnName('');
      setHarnStreaming(true);
      setHarnFunctions(true);
      setHarnVision(true);
      setHarnTimeout(30000);
      setHarnProtocol('HTTP REST');
    }
    setHarnModalOpen(true);
  };

  const handleSaveHarn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSaveHarness({
        id: harnId,
        name: harnName,
        invocation_semantics: {
          supports_streaming: harnStreaming,
          supports_function_calling: harnFunctions,
          supports_vision: harnVision,
          timeout_default_ms: harnTimeout,
          protocol: harnProtocol
        }
      });
      setHarnModalOpen(false);
    } catch (err) {
      showToast(`Error saving harness: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Model Handlers
  const openModModal = (m?: AIModel) => {
    if (m) {
      setEditingMod(m);
      setModId(m.id);
      setModName(m.name);
      setModHarnessId(m.harness_id);
      setModProviderId(m.provider_id || '');
      setModIdentifier(m.model_identifier);
    } else {
      setEditingMod(null);
      setModId(`mod-${Date.now().toString(36)}`);
      setModName('');
      setModHarnessId(harnesses[0]?.id || '');
      setModProviderId(providers[0]?.id || '');
      setModIdentifier('gemini-3.6-flash');
    }
    setModModalOpen(true);
  };

  const handleSaveMod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSaveModel({
        id: modId,
        name: modName,
        harness_id: modHarnessId,
        provider_id: modProviderId || undefined,
        model_identifier: modIdentifier
      });
      setModModalOpen(false);
    } catch (err) {
      showToast(`Error saving model: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Config bundle prefill handlers — open the shared BundleModal preconfigured
  // with the card's model/provider/harness, without leaving this view. Bundles
  // may be assigned to any role and the same config reused across roles.
  const openBundleModal = (prefill: Partial<ConfigBundle>) => {
    setBundlePrefill(prefill);
    setBundleModalKey(k => k + 1);
    setBundleModalOpen(true);
  };

  const openBundleModalForModel = (m: AIModel) => {
    openBundleModal({
      name: m.name,
      model_id: m.id,
      provider_id: m.provider_id,
      harness_id: m.harness_id
    });
  };

  const openBundleModalForProvider = (p: Provider) => {
    const modelForProv = models.find(m => m.provider_id === p.id) || models[0];
    openBundleModal({
      name: p.name,
      provider_id: p.id,
      model_id: modelForProv?.id || '',
      harness_id: modelForProv?.harness_id || ''
    });
  };

  const openBundleModalForHarness = (h: Harness) => {
    const modelForHarn = models.find(m => m.harness_id === h.id) || models[0];
    openBundleModal({
      name: h.name,
      harness_id: h.id,
      model_id: modelForHarn?.id || '',
      provider_id: modelForHarn?.provider_id
    });
  };

  const defaultBundleRole = roles.find(r => r.name === 'engineer')?.name || roles[0]?.name || '';

  // ── Derived: filtered + sorted models ──────────────────────────────
  const uniqueProviderIds = [...new Set(models.map(m => m.provider_id).filter(Boolean))];
  const uniqueHarnessIds = [...new Set(models.map(m => m.harness_id).filter(Boolean))];
  const assignedModelIds = new Set((bundles || []).map(b => b.model_id).filter(Boolean));

  const filteredModels = models
    .filter(m => {
      // Text search
      if (modelSearch) {
        const q = modelSearch.toLowerCase();
        const providerObj = providers.find(p => p.id === m.provider_id);
        const harnessObj = harnesses.find(h => h.id === m.harness_id);
        const haystack = [m.name, m.id, m.model_identifier, providerObj?.name || '', harnessObj?.name || ''].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Provider filter
      if (modelFilterProvider !== 'all' && m.provider_id !== modelFilterProvider) return false;
      // Harness filter
      if (modelFilterHarness !== 'all' && m.harness_id !== modelFilterHarness) return false;
      // Verified filter
      if (modelFilterVerified === 'verified' && !m.verified) return false;
      if (modelFilterVerified === 'unverified' && m.verified) return false;
      // Assigned filter
      if (modelFilterAssigned === 'assigned' && !assignedModelIds.has(m.id)) return false;
      if (modelFilterAssigned === 'unassigned' && assignedModelIds.has(m.id)) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (modelSort === 'name') cmp = a.name.localeCompare(b.name);
      else if (modelSort === 'provider') {
        const pa = providers.find(p => p.id === a.provider_id)?.name || '';
        const pb = providers.find(p => p.id === b.provider_id)?.name || '';
        cmp = pa.localeCompare(pb) || a.name.localeCompare(b.name);
      } else if (modelSort === 'verified') cmp = (a.verified ? 0 : 1) - (b.verified ? 0 : 1);
      else if (modelSort === 'date') cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      return modelSortAsc ? cmp : -cmp;
    });

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubTab('models')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'models'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>AI Models ({models.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('providers')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'providers'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Providers ({providers.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('harnesses')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'harnesses'
                ? 'bg-[var(--accent-color)] text-slate-950 shadow-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Harnesses ({harnesses.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'models' && (
            <button
              onClick={() => openModModal()}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[var(--accent-color)]" />
              <span>Register Model</span>
            </button>
          )}
          {activeSubTab === 'providers' && (
            <button
              onClick={() => openProvModal()}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[var(--accent-color)]" />
              <span>Add Provider</span>
            </button>
          )}
          {activeSubTab === 'harnesses' && (
            <button
              onClick={() => openHarnModal()}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[var(--accent-color)]" />
              <span>Add Harness</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. MODELS VIEW */}
      {activeSubTab === 'models' && (
        <>
          {/* Toolbar: search + sort + filters */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                placeholder="Search models by name, ID, provider…"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg pl-8 pr-3 py-1.5 font-mono text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)]"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              {modelSearch && (
                <button onClick={() => setModelSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* Sort */}
            <select
              value={`${modelSort}-${modelSortAsc}`}
              onChange={e => {
                const [s, d] = e.target.value.split('-');
                setModelSort(s as any);
                setModelSortAsc(d === 'true');
              }}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
            >
              <option value="name-true">Name A→Z</option>
              <option value="name-false">Name Z→A</option>
              <option value="provider-true">Provider A→Z</option>
              <option value="provider-false">Provider Z→A</option>
              <option value="verified-false">Verified first</option>
              <option value="verified-true">Unverified first</option>
              <option value="date-false">Newest first</option>
              <option value="date-true">Oldest first</option>
            </select>

            {/* Provider filter */}
            <select
              value={modelFilterProvider}
              onChange={e => setModelFilterProvider(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
            >
              <option value="all">All providers</option>
              {uniqueProviderIds.map(pid => {
                const p = providers.find(pr => pr.id === pid);
                return <option key={pid} value={pid}>{p?.name || pid}</option>;
              })}
            </select>

            {/* Harness filter */}
            <select
              value={modelFilterHarness}
              onChange={e => setModelFilterHarness(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
            >
              <option value="all">All harnesses</option>
              {uniqueHarnessIds.map(hid => {
                const h = harnesses.find(hr => hr.id === hid);
                return <option key={hid} value={hid}>{h?.name || hid}</option>;
              })}
            </select>

            {/* Verified filter */}
            <select
              value={modelFilterVerified}
              onChange={e => setModelFilterVerified(e.target.value as any)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
            >
              <option value="all">All status</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>

            {/* Assigned filter */}
            <select
              value={modelFilterAssigned}
              onChange={e => setModelFilterAssigned(e.target.value as any)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
            >
              <option value="all">All assignment</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>

            {/* Count badge */}
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {filteredModels.length} of {models.length}
            </span>

            {/* Reset filters */}
            {(modelSearch || modelFilterProvider !== 'all' || modelFilterHarness !== 'all' || modelFilterVerified !== 'all' || modelFilterAssigned !== 'all') && (
              <button
                onClick={() => { setModelSearch(''); setModelFilterProvider('all'); setModelFilterHarness('all'); setModelFilterVerified('all'); setModelFilterAssigned('all'); }}
                className="px-2 py-1 rounded text-[10px] font-bold text-[var(--accent-color)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map(m => {
            const harnessObj = harnesses.find(h => h.id === m.harness_id);
            const providerObj = providers.find(p => p.id === (m.provider_id || harnessObj?.id));

            return (
              <div
                key={m.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 space-y-3 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-[var(--accent-color)]" />
                        <span>{m.name}</span>
                        <span
                          title={m.verified
                            ? 'Verified — exercised successfully through a harness; selectable in dropdowns and eligible for the resolver queue'
                            : 'Unverified — not exercised through a harness; hidden from model dropdowns and bundles referencing it are forced inactive'}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase border inline-flex items-center gap-1 ${
                            m.verified
                              ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/40'
                              : 'bg-amber-950/50 text-amber-300 border-amber-800/40'
                          }`}
                        >
                          {m.verified ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {m.verified ? 'VERIFIED' : 'UNVERIFIED'}
                        </span>
                      </h4>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] block mt-0.5">
                        ID: {m.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openModModal(m)}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="Edit Model"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await showConfirm(`Delete model '${m.name}'?`)) {
                            try {
                              await onDeleteModel(m.id);
                            } catch (err) {
                              showToast(`Error deleting model: ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }
                        }}
                        className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                        title="Delete Model"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-sm space-y-1">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                      Model Identifier String
                    </div>
                    <div className="font-bold text-[var(--accent-color)] break-all">{m.model_identifier}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Harness</div>
                      <div className="font-semibold text-[var(--text-primary)] truncate">
                        {harnessObj?.name || m.harness_id}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">Provider</div>
                      <div className="font-semibold text-[var(--text-primary)] truncate">
                        {providerObj?.name || m.provider_id || 'Default'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => verifyModel(m)}
                    disabled={!!verifyingId}
                    title={
                      m.verified
                        ? 'Re-verify — run a fresh inference to confirm the model still works. On failure it becomes UNVERIFIED and its bundles are forced inactive.'
                        : 'Run a real inference test — on success the model becomes VERIFIED and its bundles are re-armed'
                    }
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                      verifyingId === m.id
                        ? 'bg-[var(--bg-tertiary)] border-[var(--accent-color)] text-[var(--accent-color)] cursor-wait'
                        : m.verified
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50 hover:border-emerald-500/70 hover:text-emerald-300 cursor-pointer'
                          : 'bg-amber-950/30 border-amber-800/50 text-amber-300 hover:border-amber-500/70 hover:text-amber-200 cursor-pointer'
                    }`}
                  >
                    {verifyingId === m.id ? (
                      <ShieldCheck className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {verifyingId === m.id ? 'Verifying…' : m.verified ? 'Re-verify' : 'Verify Model'}
                    </span>
                  </button>

                  <button
                    onClick={() => openBundleModalForModel(m)}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition cursor-pointer"
                    title="Create a config bundle from this model and assign it to a role"
                  >
                    <Package className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                    <span>Add to Role</span>
                  </button>
                </div>

                {verifyOutcome[m.id] && (
                  <div
                    className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                      verifyOutcome[m.id].ok
                        ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                        : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                    }`}
                  >
                    {verifyOutcome[m.id].ok ? (
                      <CheckCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    )}
                    <span>{verifyOutcome[m.id].message}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                  <span>Registered</span>
                  <span>{new Date(m.created_at || '').toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* 2. PROVIDERS VIEW */}
      {activeSubTab === 'providers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map(p => {
            const isApiKeyShown = showApiKeys[p.id];

            return (
              <div
                key={p.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-3 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-5 h-5 text-cyan-400" />
                      <div>
                        <h4 className="font-bold text-sm text-[var(--text-primary)]">{p.name}</h4>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--accent-color)] font-semibold border border-[var(--border-subtle)]">
                          {p.type}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openProvModal(p)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="Edit Provider"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await showConfirm(`Delete provider '${p.name}'?`)) {
                            try {
                              await onDeleteProvider(p.id);
                            } catch (err) {
                              showToast(`Error deleting provider: ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }
                        }}
                        className="p-1.5 text-rose-400 hover:text-rose-300 cursor-pointer"
                        title="Delete Provider"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Endpoint URL */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Endpoint URL</div>
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-sm text-[var(--text-primary)] flex items-center gap-2 truncate">
                      <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{p.endpoint_url || 'https://api.external.com'}</span>
                    </div>
                  </div>

                  {/* API Key */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase flex items-center justify-between">
                      <span>API Secret Key</span>
                      <button
                        onClick={() =>
                          setShowApiKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))
                        }
                        className="text-[var(--accent-color)] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {isApiKeyShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{isApiKeyShown ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-sm text-[var(--text-secondary)]">
                      {p.api_key
                        ? isApiKeyShown
                          ? p.api_key
                          : '••••••••••••••••••••••••'
                        : '(No static key required / system env)'}
                    </div>
                  </div>

                  {/* Config JSON */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase flex items-center gap-1">
                      <Code className="w-3 h-3" />
                      <span>Configuration Json</span>
                    </div>
                    <pre className="p-2.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] overflow-x-auto max-h-24">
                      {JSON.stringify(p.config_json || {}, null, 2)}
                    </pre>
                  </div>
                </div>

                <button
                  onClick={() => openBundleModalForProvider(p)}
                  disabled={models.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={models.length === 0
                    ? 'Register a model first — a config bundle requires a model'
                    : 'Create a config bundle using this provider and assign it to a role'}
                >
                  <Package className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  <span>Add to Role</span>
                </button>

                <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                  <span>Provider ID: {p.id}</span>
                  <span>{new Date(p.created_at || '').toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. HARNESSES VIEW */}
      {activeSubTab === 'harnesses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {harnesses.map(h => {
            const semantics = h.invocation_semantics || {};

            return (
              <div
                key={h.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-400" />
                      <div>
                        <h4 className="font-bold text-sm text-[var(--text-primary)]">{h.name}</h4>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">ID: {h.id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openHarnModal(h)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="Edit Harness"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await showConfirm(`Delete harness '${h.name}'?`)) {
                            try {
                              await onDeleteHarness(h.id);
                            } catch (err) {
                              showToast(`Error deleting harness: ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }
                        }}
                        className="p-1.5 text-rose-400 hover:text-rose-300 cursor-pointer"
                        title="Delete Harness"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Capabilities grid */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center space-y-1">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">Streaming</div>
                      {semantics.supports_streaming ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center space-y-1">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">Tools/Functions</div>
                      {semantics.supports_function_calling ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center space-y-1">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">Vision/Multimodal</div>
                      {semantics.supports_vision ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1 text-sm font-mono">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Protocol:</span>
                      <span className="text-[var(--text-primary)] font-bold">{semantics.protocol || 'HTTP REST'}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Default Timeout:</span>
                      <span className="text-[var(--text-primary)] font-bold">{semantics.timeout_default_ms || 30000}ms</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => openBundleModalForHarness(h)}
                  disabled={models.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={models.length === 0
                    ? 'Register a model first — a config bundle requires a model'
                    : 'Create a config bundle using this harness and assign it to a role'}
                >
                  <Package className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  <span>Add to Role</span>
                </button>

                <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
                  <span>Tackle Invocation Harness</span>
                  <span>{new Date(h.created_at || '').toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PROVIDER MODAL */}
      {provModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingProv ? 'Edit Provider' : 'Add AI Provider'}
              </h3>
              <button onClick={() => setProvModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProv} className="space-y-3 text-sm">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Provider ID *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingProv}
                  value={provId}
                  onChange={e => setProvId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Provider Name *</label>
                <input
                  type="text"
                  required
                  value={provName}
                  onChange={e => setProvName(e.target.value)}
                  placeholder="e.g. OpenAI Direct"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Provider Type</label>
                <select
                  value={provType}
                  onChange={e => setProvType(e.target.value as any)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono"
                >
                  <option value="gemini">gemini (Google Native)</option>
                  <option value="openai">openai (OpenAI Direct)</option>
                  <option value="anthropic">anthropic (Anthropic Cloud)</option>
                  <option value="ollama">ollama (Local Ollama Cluster)</option>
                  <option value="vllm">vllm (High-Throughput vLLM GPU Farm)</option>
                  <option value="custom">custom</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Endpoint URL</label>
                <input
                  type="text"
                  value={provEndpoint}
                  onChange={e => setProvEndpoint(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">API Key Secret</label>
                <input
                  type="password"
                  value={provApiKey}
                  onChange={e => setProvApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Config JSON</label>
                <textarea
                  rows={3}
                  value={provConfigJson}
                  onChange={e => setProvConfigJson(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-2.5 font-mono text-sm text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProvModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HARNESS MODAL */}
      {harnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingHarn ? 'Edit Harness' : 'Add Invocation Harness'}
              </h3>
              <button onClick={() => setHarnModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHarn} className="space-y-3 text-sm">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Harness ID *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingHarn}
                  value={harnId}
                  onChange={e => setHarnId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Harness Name *</label>
                <input
                  type="text"
                  required
                  value={harnName}
                  onChange={e => setHarnName(e.target.value)}
                  placeholder="e.g. Gemini Driver"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="block text-[var(--text-secondary)] font-semibold">Invocation Semantics</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={harnStreaming}
                      onChange={e => setHarnStreaming(e.target.checked)}
                      className="rounded bg-[var(--bg-tertiary)] text-[var(--accent-color)]"
                    />
                    <span>Streaming</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={harnFunctions}
                      onChange={e => setHarnFunctions(e.target.checked)}
                      className="rounded bg-[var(--bg-tertiary)] text-[var(--accent-color)]"
                    />
                    <span>Tools/Functions</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={harnVision}
                      onChange={e => setHarnVision(e.target.checked)}
                      className="rounded bg-[var(--bg-tertiary)] text-[var(--accent-color)]"
                    />
                    <span>Vision</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Protocol</label>
                  <input
                    type="text"
                    value={harnProtocol}
                    onChange={e => setHarnProtocol(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Timeout (ms)</label>
                  <input
                    type="number"
                    value={harnTimeout}
                    onChange={e => setHarnTimeout(parseInt(e.target.value) || 30000)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHarnModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  Save Harness
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODEL MODAL */}
      {modModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingMod ? 'Edit Model' : 'Register AI Model'}
              </h3>
              <button onClick={() => setModModalOpen(false)} className="text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMod} className="space-y-3 text-sm">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Model ID *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingMod}
                  value={modId}
                  onChange={e => setModId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Model Display Name *</label>
                <input
                  type="text"
                  required
                  value={modName}
                  onChange={e => setModName(e.target.value)}
                  placeholder="e.g. Gemini 3.6 Flash"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                  Model Identifier String *
                </label>
                <input
                  type="text"
                  required
                  value={modIdentifier}
                  onChange={e => setModIdentifier(e.target.value)}
                  placeholder="e.g. gemini-3.6-flash or gpt-4o"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Harness *</label>
                <select
                  required
                  value={modHarnessId}
                  onChange={e => setModHarnessId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono"
                >
                  {harnesses.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Provider (Optional)</label>
                <select
                  value={modProviderId}
                  onChange={e => setModProviderId(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono"
                >
                  <option value="">(Inherit Provider)</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold bg-[var(--accent-color)] text-slate-950 cursor-pointer"
                >
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config Bundle Modal — shared with the Config Bundles view */}
      {bundleModalOpen && (
        <BundleModal
          key={bundleModalKey}
          initial={bundlePrefill}
          defaultRole={defaultBundleRole}
          onClose={() => setBundleModalOpen(false)}
          models={models}
          providers={providers}
          harnesses={harnesses}
          roles={roles}
          onSaveBundle={onSaveBundle}
        />
      )}
    </div>
  );
};
