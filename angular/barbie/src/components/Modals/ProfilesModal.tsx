import React, { useState } from 'react';
import { X, Plus, Pencil, Trash2, Plug, Server, Network } from 'lucide-react';
import {
  BarbieProfile,
  getProfiles,
  saveProfiles,
  testProfileConnection,
  registryApi
} from '../../lib/api';

interface ProfilesModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired when the ACTIVE registry profile changes so tables reload. */
  onActiveChanged?: () => void;
}

type Tab = 'registry' | 'broker';
type Draft = Omit<BarbieProfile, 'id'> & { id?: string };

const EMPTY_DRAFT: Draft = { name: '', baseUrl: '', kind: 'registry' };

/**
 * Registry & Broker/Gateway profile manager (barbie-parity #13/#14).
 * CRUD + connection test, stored locally; the active REGISTRY profile
 * repoints all data views via registryApi.setApiBaseUrl.
 */
export const ProfilesModal: React.FC<ProfilesModalProps> = ({ open, onClose, onActiveChanged }) => {
  const [tab, setTab] = useState<Tab>('registry');
  const [profiles, setProfiles] = useState<BarbieProfile[]>(() => getProfiles());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({});

  if (!open) return null;

  const visible = profiles.filter(p => p.kind === tab);

  const persist = (list: BarbieProfile[]) => {
    saveProfiles(list);
    setProfiles(list);
  };

  const saveDraft = () => {
    if (!draft || !draft.name.trim() || !draft.baseUrl.trim()) return;
    const cleaned: BarbieProfile = {
      id: draft.id ?? `prf-${Date.now().toString(36)}`,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/$/, ''),
      kind: draft.kind
    };
    let list = getProfiles();
    list = draft.id ? list.map(p => (p.id === draft.id ? cleaned : p)) : [...list, cleaned];
    persist(list);
    if (cleaned.kind === 'registry' && !draft.id && registryApi.getApiBaseUrl().startsWith('/')) {
      registryApi.setApiBaseUrl(cleaned.baseUrl);
      onActiveChanged?.();
    }
    setDraft(null);
  };

  const remove = (p: BarbieProfile) => {
    persist(getProfiles().filter(x => x.id !== p.id));
    if (p.kind === 'registry' && registryApi.getApiBaseUrl() === p.baseUrl) {
      registryApi.setApiBaseUrl('/api/v1/registry'); // fall back to same-origin proxy
      onActiveChanged?.();
    }
  };

  const runTest = async (p: BarbieProfile) => {
    setTestingId(p.id);
    setTestResult(prev => ({ ...prev, [p.id]: { ok: false, detail: 'probing…' } }));
    const res = await testProfileConnection(p);
    setTestResult(prev => ({ ...prev, [p.id]: res }));
    setTestingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[620px] max-w-[94vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Connection Profiles</h3>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-secondary)] hover:bg-white/5" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex gap-1 rounded-lg border border-[var(--border-color)] p-1 text-xs">
          {([['registry', 'Service Registry', Server], ['broker', 'Broker / Gateway', Network]] as const).map(
            ([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => { setTab(key as Tab); setDraft(null); }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 ${
                  tab === key ? 'bg-sky-500/10 font-semibold text-sky-400' : 'text-[var(--text-secondary)] hover:bg-white/5'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          )}
        </div>

        {/* Rows */}
        <ul className="mb-3 max-h-72 space-y-1 overflow-auto">
          {visible.length === 0 && !draft && (
            <li className="rounded-lg border border-dashed border-[var(--border-color)] p-6 text-center text-xs text-[var(--text-secondary)]">
              No {tab === 'registry' ? 'registry' : 'broker/gateway'} profiles yet — add one below.
            </li>
          )}
          {visible.map((p) => {
            const isActive = p.kind === 'registry' && registryApi.getApiBaseUrl() === p.baseUrl;
            const tr = testResult[p.id];
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                        ACTIVE
                      </span>
                    )}
                    <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{p.name}</span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--text-secondary)]">{p.baseUrl}</div>
                  {tr && (
                    <div className={`text-[10px] ${tr.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tr.ok ? '✓' : '✗'} {tr.detail}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {p.kind === 'registry' && !isActive && (
                    <button
                      onClick={() => { registryApi.setApiBaseUrl(p.baseUrl); onActiveChanged?.(); }}
                      className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
                      title="Make active — repoints all data views"
                    >
                      <Plug className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => runTest(p)}
                    disabled={testingId === p.id}
                    className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
                    title={p.kind === 'broker' ? 'Test connection (actuator/health)' : 'Test connection (/health)'}
                  >
                    {testingId === p.id ? '…' : '⚡'}
                  </button>
                  <button
                    onClick={() => setDraft({ name: p.name, baseUrl: p.baseUrl, kind: p.kind, id: p.id })}
                    className="rounded p-1 text-slate-400 hover:bg-white/5"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Add / Edit form */}
        {draft ? (
          <div className="space-y-2 rounded-lg border border-[var(--border-color)] p-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Profile name (e.g. Titanium Registry)"
              className="h-8 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-main)] px-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-highlight)]"
            />
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder={draft.kind === 'broker' ? 'http://host:8081' : 'http://host:8085 or /api/v1/registry'}
              className="h-8 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-main)] px-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-highlight)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDraft(null)}
                className="h-7 rounded-md border border-[var(--border-color)] px-3 text-xs text-[var(--text-secondary)] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={saveDraft}
                disabled={!draft.name.trim() || !draft.baseUrl.trim()}
                className="h-7 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                Save Profile
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDraft({ ...EMPTY_DRAFT, kind: tab })}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-color)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-highlight)] hover:text-[var(--text-primary)]"
          >
            <Plus className="h-3.5 w-3.5" /> Add {tab === 'registry' ? 'Registry' : 'Broker/Gateway'} Profile
          </button>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-secondary)] opacity-70">
          Registry profiles are stored locally. The ACTIVE registry profile repoints every data view;
          deleting it falls back to the same-origin proxy (/api/v1/registry). Connection tests probe
          /health (registry) or /actuator/health (broker) with a 4s timeout.
        </p>
      </div>
    </div>
  );
};
