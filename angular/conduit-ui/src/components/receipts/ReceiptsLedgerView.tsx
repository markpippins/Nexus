import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Trash2, Code, CheckCircle2, Search, Tag } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { ReceiptItem } from '../../types/conduit';

export const ReceiptsLedgerView: React.FC = () => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_0053');
  const [receipts, setReceipts] = useState<Array<ReceiptItem & { parsed_metadata?: any }>>([]);
  const [latestType, setLatestType] = useState<string>('NONE');
  const [viewMode, setViewMode] = useState<'parsed' | 'raw'>('parsed');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Add form states
  const [newType, setNewType] = useState<string>('PLAN_CREATE');
  const [newRole, setNewRole] = useState<string>('planner');
  const [newSummary, setNewSummary] = useState<string>('Manual receipt added via WRP Control Plane');
  const [newTicket, setNewTicket] = useState<string>('TCK-2026-0053');

  // Delete states
  const [deleteType, setDeleteType] = useState<string>('');

  const loadReceipts = async (pId: string) => {
    try {
      if (viewMode === 'parsed') {
        const data = await apiService.getFormattedReceipts(pId);
        setReceipts(data);
      } else {
        const raw = await apiService.getFormattedReceipts(pId);
        setReceipts(raw);
      }
      const typeRes = await apiService.getFormattedReceipts(pId);
      if (typeRes.length > 0) {
        setLatestType(typeRes[typeRes.length - 1].type);
      } else {
        setLatestType('NONE');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadReceipts(selectedPlanId);
  }, [selectedPlanId, viewMode]);

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.insertReceipt({
        plan_id: selectedPlanId,
        type: newType,
        agent_role: newRole,
        ticket_id: newTicket,
        summary: newSummary,
        metadata_json: JSON.stringify({ source: 'manual_ui_insert', timestamp: new Date().toISOString() }),
        tokens_used: 1200,
      });
      setShowAddModal(false);
      await loadReceipts(selectedPlanId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteReceipts = async () => {
    if (!confirm(`Are you sure you want to delete receipts for ${selectedPlanId}?`)) return;
    try {
      const types = deleteType ? [deleteType] : [];
      await apiService.deleteReceipts(selectedPlanId, types);
      await loadReceipts(selectedPlanId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      {/* Header */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              4. Receipts Ledger & Audit Surface (<code className="text-emerald-400">/api/receipts</code>)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Read, parse, insert, and delete cryptographic execution receipts per plan ID.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>POST /api/receipts (Insert)</span>
          </button>
        </div>
      </div>

      {/* Plan Filter & Bar Controls */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="text-zinc-400">Select Plan ID:</span>
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="bg-[#0c0c0e] border border-zinc-700 rounded px-3 py-1.5 text-zinc-200 font-bold focus:outline-none focus:border-emerald-500"
          >
            <option value="plan_0053">plan_0053 (Auth Module)</option>
            <option value="plan_0054">plan_0054 (Storage Engine)</option>
            <option value="plan_0052">plan_0052 (Core DB)</option>
          </select>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#0c0c0e] px-2.5 py-1 rounded border border-zinc-800">
            <Tag className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-zinc-400">Latest Receipt Type:</span>
            <span className="font-bold text-emerald-400">{latestType}</span>
          </div>

          <div className="flex items-center bg-[#0c0c0e] rounded p-1 border border-zinc-800">
            <button
              onClick={() => setViewMode('parsed')}
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'parsed' ? 'bg-emerald-600 font-bold text-white' : 'text-zinc-400'
              }`}
            >
              Parsed View
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'raw' ? 'bg-emerald-600 font-bold text-white' : 'text-zinc-400'
              }`}
            >
              Raw DB Records
            </button>
          </div>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs">
        <div className="p-3 bg-[#0c0c0e] border-b border-zinc-800 flex items-center justify-between">
          <span className="font-bold text-zinc-300">RECEIPTS FOR {selectedPlanId.toUpperCase()}</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter type to delete..."
              value={deleteType}
              onChange={(e) => setDeleteType(e.target.value)}
              className="bg-[#141416] border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none"
            />
            <button
              onClick={handleDeleteReceipts}
              className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>DELETE /api/receipts</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-zinc-800/80">
          {receipts.length > 0 ? (
            receipts.map((rc) => (
              <div key={rc.id} className="p-4 hover:bg-zinc-800/30 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold text-sm">{rc.id}</span>
                    <span className="bg-emerald-950/80 border border-emerald-700 text-emerald-300 px-2 py-0.5 rounded font-bold text-[10px]">
                      {rc.type}
                    </span>
                    <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700 text-[10px]">
                      {rc.ticket_id}
                    </span>
                  </div>
                  <div className="text-zinc-500 text-[11px]">
                    Role: <span className="text-zinc-300 capitalize">{rc.agent_role}</span> | Tokens: <span className="text-zinc-300">{rc.tokens_used}</span>
                  </div>
                </div>

                <div className="text-zinc-200 font-sans text-xs font-semibold">{rc.summary}</div>

                <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded p-2.5 space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase flex items-center justify-between">
                    <span>Artifact Path: {rc.artifact_path}</span>
                    <span>Created: {new Date(rc.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    <span className="text-zinc-500">Metadata JSON: </span>
                    <code className="text-amber-300">{rc.metadata_json}</code>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-zinc-500">No receipts found for {selectedPlanId}</div>
          )}
        </div>
      </div>

      {/* Insert Receipt Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-mono">
          <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                POST /api/receipts (Insert Receipt)
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddReceipt} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Plan ID</label>
                <input
                  type="text"
                  value={selectedPlanId}
                  disabled
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                  >
                    <option value="PROPOSED">PROPOSED</option>
                    <option value="PLANNING">PLANNING</option>
                    <option value="PLAN_CREATE">PLAN_CREATE</option>
                    <option value="IMPLEMENTATION">IMPLEMENTATION</option>
                    <option value="REVIEW_PASS">REVIEW_PASS</option>
                    <option value="BLOCK">BLOCK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                  >
                    <option value="planner">planner</option>
                    <option value="builder">builder</option>
                    <option value="reviewer">reviewer</option>
                    <option value="kernel">kernel</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Ticket ID</label>
                <input
                  type="text"
                  value={newTicket}
                  onChange={(e) => setNewTicket(e.target.value)}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Summary</label>
                <textarea
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  rows={2}
                  className="w-full bg-[#0c0c0e] border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
                >
                  Insert Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
