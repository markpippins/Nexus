import React from 'react';
import { X, ShieldCheck, FileCode, Activity, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { ImplementationPlan, HTMLHarvest } from '../../types/conduit';
import { ReceiptsTimeline } from './ReceiptsTimeline';

interface DetailDrawerProps {
  plan: ImplementationPlan | null;
  harvest: HTMLHarvest | null;
  onClose: () => void;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({ plan, harvest, onClose }) => {
  if (!plan && !harvest) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-2xl h-full p-6 space-y-6 shadow-2xl text-zinc-100 overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Close Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-white uppercase">
            {plan && (
              <>
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Plan Inspector: {plan.id}</span>
              </>
            )}
            {harvest && (
              <>
                <FileCode className="w-5 h-5 text-indigo-400" />
                <span>Transcript Harvest Inspector: {harvest.id}</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded border border-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Plan Inspection Mode */}
        {plan && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-emerald-400 font-bold">{plan.ticketId}</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border font-mono ${
                    plan.status === 'ACTIVE'
                      ? 'bg-blue-950/90 text-blue-300 border-blue-500/60 shadow-sm'
                      : plan.status === 'COMPLETED'
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-sm'
                      : plan.status === 'PLANNING' || plan.status === 'PENDING' || plan.status === 'PROPOSED'
                      ? 'bg-amber-950/90 text-amber-300 border-amber-500/60 shadow-sm'
                      : plan.status === 'BLOCKED'
                      ? 'bg-rose-950/90 text-rose-300 border-rose-500/60 shadow-sm'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {plan.status === 'ACTIVE' && <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />}
                  {plan.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {(plan.status === 'PLANNING' || plan.status === 'PENDING' || plan.status === 'PROPOSED') && (
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  {plan.status === 'BLOCKED' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                  {plan.status}
                </span>
              </div>
              <h2 className="text-base font-bold text-zinc-100">{plan.title}</h2>
              <p className="text-xs text-zinc-300 font-sans">{plan.description}</p>
            </div>

            {/* Role & Model Info */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs bg-zinc-950 p-3 rounded border border-zinc-800">
              <div>
                <span className="text-zinc-500 block text-[10px]">CURRENT ROLE:</span>
                <span className="text-zinc-200 font-bold capitalize">{plan.currentRole}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">ACTIVE MODEL:</span>
                <span className="text-cyan-300 font-bold">{plan.activeModel}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">TOTAL COST:</span>
                <span className="text-emerald-400 font-bold">${plan.costUsd.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">LEASE OWNER:</span>
                <span className="text-amber-300">{plan.leaseOwner || 'Unassigned'}</span>
              </div>
            </div>

            {/* Receipt Chain Audit History Timeline */}
            <ReceiptsTimeline receipts={plan.receipts} />
          </div>
        )}

        {/* Harvest Transcript Mode */}
        {harvest && (
          <div className="space-y-4 font-mono text-xs">
            <div>
              <span className="text-indigo-400 font-bold block mb-1">{harvest.id}</span>
              <h2 className="text-base font-bold font-sans text-zinc-100">{harvest.title}</h2>
              <span className="text-zinc-400 text-xs font-sans">
                Author: {harvest.author} | Ingested: {new Date(harvest.ingestedAt).toLocaleString()}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-400 uppercase font-bold text-[11px] block">
                Raw HTML Transcript View
              </span>
              <div
                className="bg-zinc-950 p-4 rounded border border-zinc-800 text-zinc-300 font-sans text-xs prose prose-invert max-w-none max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: harvest.rawHtmlContent }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
