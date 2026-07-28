import React, { useState } from 'react';
import {
  ShieldCheck,
  Terminal,
  Cpu,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Code2,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import { WorkRequestDCO, WRPKernelDelta } from '../../types/conduit';

interface ReceiptsAuditLogProps {
  workRequests: WorkRequestDCO[];
  kernelDeltas: WRPKernelDelta[];
}

export const ReceiptsAuditLog: React.FC<ReceiptsAuditLogProps> = ({
  workRequests,
  kernelDeltas,
}) => {
  const [selectedWr, setSelectedWr] = useState<WorkRequestDCO | null>(
    workRequests.length > 0 ? workRequests[0] : null
  );
  const [activeTab, setActiveTab] = useState<'requests' | 'kernel_deltas'>('requests');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
              Execution Authority (ADR-006) & Receipt Audit Trail
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Mutual exclusion leases, attempt logs, cryptographic receipt hashes, and WRP Kernel replay state.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-md border border-zinc-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              activeTab === 'requests'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Work Requests & Leases
          </button>
          <button
            onClick={() => setActiveTab('kernel_deltas')}
            className={`px-3 py-1 rounded font-semibold transition-colors ${
              activeTab === 'kernel_deltas'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            WRP Kernel Replay Deltas ({kernelDeltas.length})
          </button>
        </div>
      </div>

      {activeTab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Work Request Table (2 cols) */}
          <div className="lg:col-span-2 bg-zinc-900/90 border border-zinc-800 rounded-lg overflow-hidden shadow-md">
            <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between font-mono text-xs">
              <span className="text-zinc-300 font-bold uppercase">ADR-006 Dispatched Work Requests</span>
              <span className="text-amber-400">Total: {workRequests.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-zinc-950 text-zinc-400 font-mono uppercase tracking-wider border-b border-zinc-800">
                    <th className="py-2.5 px-3 font-semibold">WR ID / Plan</th>
                    <th className="py-2.5 px-3 font-semibold">Lease Owner</th>
                    <th className="py-2.5 px-3 font-semibold">Attempt Status</th>
                    <th className="py-2.5 px-3 font-semibold">Primary Model</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Receipt Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {workRequests.map((wr) => {
                    const isSelected = selectedWr?.id === wr.id;
                    return (
                      <tr
                        key={wr.id}
                        onClick={() => setSelectedWr(wr)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-800/80 font-medium' : 'hover:bg-zinc-800/40'
                        }`}
                      >
                        <td className="py-3 px-3 font-mono">
                          <div className="text-emerald-400 font-bold">{wr.id}</div>
                          <div className="text-[10px] text-zinc-500">{wr.planId}</div>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <div className="text-zinc-200">{wr.leaseOwner}</div>
                          <div className="text-[10px] text-zinc-500">
                            Lease: <span className="text-amber-400">{wr.leaseId}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                              wr.attemptStatus === 'SUCCEEDED'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : wr.attemptStatus === 'IN_PROGRESS'
                                ? 'bg-amber-950 text-amber-300 border-amber-700'
                                : 'bg-rose-950 text-rose-300 border-rose-700'
                            }`}
                          >
                            {wr.attemptStatus === 'IN_PROGRESS' && (
                              <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
                            )}
                            {wr.attemptStatus === 'SUCCEEDED' && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            )}
                            {wr.attemptStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-cyan-300">{wr.primaryModel}</td>
                        <td className="py-3 px-3 font-mono text-right text-zinc-500 text-[11px]">
                          {wr.executionReceiptHash ? (
                            <span>{wr.executionReceiptHash.substring(0, 10)}...</span>
                          ) : (
                            'Pending...'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* DCO Inspector (1 col) */}
          {selectedWr ? (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-xs font-bold text-zinc-200">
                    DCO Input/Output Inspector
                  </span>
                </div>
                <span className="font-mono text-xs text-emerald-400">{selectedWr.id}</span>
              </div>

              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between text-zinc-400">
                  <span>Attempt ID:</span>
                  <span className="text-zinc-200">{selectedWr.attemptId}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Lease Owner:</span>
                  <span className="text-amber-300">{selectedWr.leaseOwner}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Lease Expires:</span>
                  <span className="text-zinc-300">
                    {new Date(selectedWr.leaseExpiresAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* DCO Input Payload Code Box */}
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold text-zinc-400 block">
                  DCO Input Payload (YAML/JSON):
                </span>
                <pre className="bg-zinc-950 p-3 rounded border border-zinc-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48 leading-relaxed">
                  {selectedWr.inputPayload}
                </pre>
              </div>

              {/* DCO Output Result */}
              {selectedWr.outputResult && (
                <div className="space-y-1">
                  <span className="text-xs font-mono font-bold text-zinc-400 block">
                    Execution Result Event:
                  </span>
                  <pre className="bg-zinc-950 p-3 rounded border border-zinc-800 text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-48 leading-relaxed">
                    {selectedWr.outputResult}
                  </pre>
                </div>
              )}

              {/* Cryptographic Execution Receipt */}
              {selectedWr.executionReceiptHash && (
                <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    Sha256 Execution Receipt Hash:
                  </span>
                  <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 break-all">
                    <span>{selectedWr.executionReceiptHash}</span>
                    <button
                      onClick={() => handleCopyHash(selectedWr.executionReceiptHash!)}
                      className="ml-2 p-1 text-zinc-400 hover:text-zinc-100"
                      title="Copy Hash"
                    >
                      {copiedHash === selectedWr.executionReceiptHash ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 font-mono text-xs">
              Select a work request to inspect DCO payload details.
            </div>
          )}
        </div>
      )}

      {/* Tab 2: WRP Kernel Replay Deltas */}
      {activeTab === 'kernel_deltas' && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-mono font-bold uppercase text-zinc-200">
                WRP Kernel Runtime Replay Delta Sequence
              </h2>
              <p className="text-xs text-zinc-400">
                Deterministic reduction state pipeline served from FastAPI at port 3103
              </p>
            </div>

            <button
              onClick={() => alert('WRP Kernel delta replay initiated from sequence 1042.')}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replay Snapshot From Seq #1042</span>
            </button>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {kernelDeltas.map((delta) => (
              <div
                key={delta.sequenceId}
                className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-cyan-500/50 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">Seq #{delta.sequenceId}</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-emerald-300 font-bold">{delta.action}</span>
                    <span className="bg-zinc-900 text-zinc-400 px-1.5 py-0.2 rounded text-[10px] border border-zinc-800">
                      {delta.deltaType}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Receipt Ref: <span className="text-indigo-300">{delta.receiptId}</span> ({delta.planId})
                  </div>
                </div>

                <div className="text-right text-[11px] text-zinc-500">
                  <div>Engine: {delta.engineSignature}</div>
                  <div>
                    State Hash: <span className="text-amber-400 font-bold">{delta.stateHash}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
