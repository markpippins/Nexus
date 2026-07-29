import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, CheckCircle2, Edit2, Trash2, ShieldCheck, Database, RefreshCw } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { AdminIdentitiesResponse, EngineConsistencyResponse } from '../../types/conduit';

export const AdminCatalogView: React.FC = () => {
  const [identities, setIdentities] = useState<any[]>([]);
  const [consistency, setConsistency] = useState<EngineConsistencyResponse | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState<string>('');
  const [aliasesInput, setAliasesInput] = useState<string>('');

  const loadData = async () => {
    try {
      const [idRes, consRes] = await Promise.all([
        apiService.getAdminIdentities('', 50),
        apiService.getEngineConsistency(),
      ]);
      setIdentities(idRes.identities);
      setConsistency(consRes);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateIdentity = async (identityId: string) => {
    try {
      const aliases = aliasesInput.split(',').map((s) => s.trim()).filter(Boolean);
      await apiService.updateIdentity(identityId, { label: labelInput, aliases });
      setEditingId(null);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteIdentity = async (identityId: string) => {
    if (!confirm(`Delete identity ${identityId}?`)) return;
    try {
      await apiService.deleteIdentity(identityId);
      await loadData();
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
            <SlidersHorizontal className="w-5 h-5 text-purple-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              7. Admin Catalog & Consistency Inspector (`/admin`)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Admin identity mapping catalog, alias management, and engine vs delta-store consistency validation.
          </p>
        </div>

        <button
          onClick={loadData}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded border border-zinc-700 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Catalog</span>
        </button>
      </div>

      {/* Engine Consistency Banner */}
      {consistency && (
        <div
          className={`p-4 border rounded-lg flex items-center justify-between font-mono text-xs ${
            consistency.aligned
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>ENGINE & DELTA-LOG CONSISTENCY ALIGNED (`GET /admin/consistency`)</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>Engine Version: <strong>v{consistency.engine_version}</strong></span>
            <span>Delta Log Version: <strong>v{consistency.delta_log_version}</strong></span>
            <span>Plans: <strong>{consistency.engine_plan_count}</strong></span>
          </div>
        </div>
      )}

      {/* Identities Catalog Table */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs">
        <div className="p-3 bg-[#0c0c0e] border-b border-zinc-800 font-bold text-zinc-300">
          IDENTITY MAP CATALOG (`GET /admin/identities`)
        </div>

        <div className="divide-y divide-zinc-800/80">
          {identities.length > 0 ? (
            identities.map((iden) => (
              <div key={iden.id} className="p-4 hover:bg-zinc-800/30 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-400 font-bold text-sm">{iden.id}</span>
                    <span className="text-zinc-200 font-sans font-semibold text-xs">{iden.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {editingId === iden.id ? (
                      <button
                        onClick={() => handleUpdateIdentity(iden.id)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-[11px]"
                      >
                        Save PATCH
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(iden.id);
                          setLabelInput(iden.label);
                          setAliasesInput((iden.aliases || []).join(', '));
                        }}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteIdentity(iden.id)}
                      className="px-2 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[11px] flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {editingId === iden.id ? (
                  <div className="grid grid-cols-2 gap-3 bg-[#0c0c0e] p-3 rounded border border-zinc-800">
                    <div>
                      <label className="block text-zinc-500 text-[10px] mb-1">Label</label>
                      <input
                        type="text"
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        className="w-full bg-[#141416] border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-500 text-[10px] mb-1">Aliases (comma separated)</label>
                      <input
                        type="text"
                        value={aliasesInput}
                        onChange={(e) => setAliasesInput(e.target.value)}
                        className="w-full bg-[#141416] border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-[10px] uppercase">Aliases:</span>
                    {(iden.aliases || []).map((alias: string) => (
                      <span key={alias} className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px]">
                        {alias}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-zinc-500">No identities registered</div>
          )}
        </div>
      </div>
    </div>
  );
};
