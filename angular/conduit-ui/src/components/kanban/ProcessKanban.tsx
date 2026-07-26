import React, { useState } from 'react';
import {
  Kanban,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Shield,
  Layers,
  ChevronRight,
  Plus,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  ImplementationPlan,
  PlanLifecycleStatus,
  HTMLHarvest,
  CandidateItem,
  IntentRecord,
  RequirementSpec,
  SystemCanonicalSpec,
} from '../../types/conduit';

interface ProcessKanbanProps {
  plans: ImplementationPlan[];
  harvests: HTMLHarvest[];
  candidates: CandidateItem[];
  intents: IntentRecord[];
  requirements: RequirementSpec[];
  specs: SystemCanonicalSpec[];
  onSelectPlan: (plan: ImplementationPlan) => void;
  onAdvancePlanStatus: (planId: string, currentStatus: PlanLifecycleStatus) => void;
  onProposeNewPlan: () => void;
}

export const ProcessKanban: React.FC<ProcessKanbanProps> = ({
  plans,
  harvests,
  candidates,
  intents,
  requirements,
  specs,
  onSelectPlan,
  onAdvancePlanStatus,
  onProposeNewPlan,
}) => {
  const [boardType, setBoardType] = useState<'plans' | 'artifacts'>('plans');

  const planColumns: { status: PlanLifecycleStatus; label: string; color: string }[] = [
    { status: 'PROPOSED', label: '1. Proposed', color: 'border-zinc-700 bg-zinc-950/40' },
    { status: 'PLANNING', label: '2. Planning', color: 'border-indigo-900 bg-indigo-950/20' },
    { status: 'PENDING', label: '3. Pending (Elucidated)', color: 'border-amber-900 bg-amber-950/20' },
    { status: 'ACTIVE', label: '4. Active (Building)', color: 'border-emerald-800 bg-emerald-950/30' },
    { status: 'COMPLETED', label: '5. Completed / Approved', color: 'border-blue-900 bg-blue-950/20' },
    { status: 'BLOCKED', label: 'Blocked / Retry', color: 'border-rose-900 bg-rose-950/30' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1800px] mx-auto text-zinc-100">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <Kanban className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
              Process & Task Kanban Board
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Receipt-first plan lifecycle control plane: Propose → Promote → Plan → Build → Review → Complete.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle between Plan Execution Kanban and Artifact Board */}
          <div className="bg-zinc-950 p-1 rounded-md border border-zinc-800 flex items-center gap-1 font-mono text-xs">
            <button
              onClick={() => setBoardType('plans')}
              className={`px-3 py-1 rounded transition-colors font-semibold ${
                boardType === 'plans'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Plan Execution Kanban
            </button>
            <button
              onClick={() => setBoardType('artifacts')}
              className={`px-3 py-1 rounded transition-colors font-semibold ${
                boardType === 'artifacts'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Artifact Lifecycle Board
            </button>
          </div>

          <button
            onClick={onProposeNewPlan}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Propose Plan</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Plan Execution Kanban */}
      {boardType === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {planColumns.map((col) => {
            const colPlans = plans.filter((p) => p.status === col.status);
            return (
              <div
                key={col.status}
                className={`border ${col.color} rounded-lg p-3 min-w-[260px] flex flex-col h-[calc(100vh-250px)]`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-3">
                  <span className="text-xs font-mono font-bold uppercase text-zinc-300 tracking-wider">
                    {col.label}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                    {colPlans.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {colPlans.map((plan) => {
                    const latestReceipt = plan.receipts[plan.receipts.length - 1];
                    return (
                      <div
                        key={plan.id}
                        onClick={() => onSelectPlan(plan)}
                        className="bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 rounded-md p-3 space-y-2 cursor-pointer transition-all shadow-md group hover:bg-zinc-900/90"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-emerald-400 font-bold">{plan.id}</span>
                          <span className="text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                            {plan.ticketId}
                          </span>
                        </div>

                        <h4 className="font-semibold text-xs text-zinc-100 group-hover:text-emerald-300 transition-colors line-clamp-2">
                          {plan.title}
                        </h4>

                        <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400">
                          <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded capitalize">
                            Role: {plan.currentRole}
                          </span>
                          <span className="text-cyan-400">{plan.activeModel}</span>
                        </div>

                        {plan.blockReason && (
                          <div className="bg-rose-950/80 border border-rose-800/60 p-1.5 rounded text-[10px] font-mono text-rose-300 line-clamp-2">
                            ⚠️ {plan.blockReason}
                          </div>
                        )}

                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                          <span>${plan.costUsd.toFixed(2)}</span>
                          <span>Receipts: {plan.receipts.length}</span>
                        </div>

                        {/* Quick Advance Button */}
                        {col.status !== 'COMPLETED' && col.status !== 'BLOCKED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAdvancePlanStatus(plan.id, plan.status);
                            }}
                            className="w-full mt-1 py-1 bg-zinc-800 hover:bg-emerald-950 hover:text-emerald-300 hover:border-emerald-600/50 text-zinc-400 text-[10px] font-mono font-bold rounded border border-zinc-700/80 flex items-center justify-center gap-1 transition-colors"
                          >
                            <span>Advance Stage</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mode 2: Artifact Lifecycle Board */}
      {boardType === 'artifacts' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {/* Col 1: Harvests */}
          <div className="border border-zinc-800 bg-zinc-950/40 rounded-lg p-3 min-w-[260px]">
            <div className="border-b border-zinc-800 pb-2 mb-3 flex items-center justify-between font-mono text-xs font-bold uppercase text-indigo-400">
              <span>1. Harvest Transcripts</span>
              <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                {harvests.length}
              </span>
            </div>
            <div className="space-y-2">
              {harvests.map((h) => (
                <div key={h.id} className="bg-zinc-900 p-2.5 rounded border border-zinc-800 text-xs">
                  <span className="font-mono text-[10px] text-indigo-400 block">{h.id}</span>
                  <span className="font-semibold text-zinc-200 line-clamp-2">{h.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 2: Candidates */}
          <div className="border border-zinc-800 bg-zinc-950/40 rounded-lg p-3 min-w-[260px]">
            <div className="border-b border-zinc-800 pb-2 mb-3 flex items-center justify-between font-mono text-xs font-bold uppercase text-amber-400">
              <span>2. Candidates</span>
              <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                {candidates.length}
              </span>
            </div>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div key={c.id} className="bg-zinc-900 p-2.5 rounded border border-zinc-800 text-xs">
                  <span className="font-mono text-[10px] text-amber-400 block">{c.id}</span>
                  <span className="font-semibold text-zinc-200 line-clamp-2">{c.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 3: Intents */}
          <div className="border border-zinc-800 bg-zinc-950/40 rounded-lg p-3 min-w-[260px]">
            <div className="border-b border-zinc-800 pb-2 mb-3 flex items-center justify-between font-mono text-xs font-bold uppercase text-cyan-400">
              <span>3. Intent Records</span>
              <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                {intents.length}
              </span>
            </div>
            <div className="space-y-2">
              {intents.map((i) => (
                <div key={i.id} className="bg-zinc-900 p-2.5 rounded border border-zinc-800 text-xs">
                  <span className="font-mono text-[10px] text-cyan-400 block">{i.id}</span>
                  <span className="font-semibold text-zinc-200 line-clamp-2">{i.summary}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 4: Requirements */}
          <div className="border border-zinc-800 bg-zinc-950/40 rounded-lg p-3 min-w-[260px]">
            <div className="border-b border-zinc-800 pb-2 mb-3 flex items-center justify-between font-mono text-xs font-bold uppercase text-emerald-400">
              <span>4. Requirements</span>
              <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                {requirements.length}
              </span>
            </div>
            <div className="space-y-2">
              {requirements.map((r) => (
                <div key={r.id} className="bg-zinc-900 p-2.5 rounded border border-zinc-800 text-xs">
                  <span className="font-mono text-[10px] text-emerald-400 block">{r.codeName}</span>
                  <span className="font-semibold text-zinc-200 line-clamp-2">{r.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 5: Canonical Specs */}
          <div className="border border-zinc-800 bg-zinc-950/40 rounded-lg p-3 min-w-[260px]">
            <div className="border-b border-zinc-800 pb-2 mb-3 flex items-center justify-between font-mono text-xs font-bold uppercase text-purple-400">
              <span>5. Canonical Specs</span>
              <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                {specs.length}
              </span>
            </div>
            <div className="space-y-2">
              {specs.map((s) => (
                <div key={s.id} className="bg-zinc-900 p-2.5 rounded border border-zinc-800 text-xs">
                  <span className="font-mono text-[10px] text-purple-400 block">{s.systemName}</span>
                  <span className="font-semibold text-zinc-200 line-clamp-2">{s.subsystemName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
