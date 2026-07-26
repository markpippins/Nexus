import React, { useState } from 'react';
import {
  FileCode,
  GitBranch,
  Target,
  CheckSquare,
  Layers,
  Plus,
  ArrowRight,
  Code2,
  ListFilter,
  Eye,
  Sparkles,
  Zap,
  CheckCircle,
} from 'lucide-react';
import {
  HTMLHarvest,
  CandidateItem,
  IntentRecord,
  RequirementSpec,
  SystemCanonicalSpec,
} from '../../types/conduit';

interface ArtifactPipelineProps {
  harvests: HTMLHarvest[];
  candidates: CandidateItem[];
  intents: IntentRecord[];
  requirements: RequirementSpec[];
  specs: SystemCanonicalSpec[];
  onAddHarvestClick: () => void;
  onExtractCandidates: (harvestId: string) => void;
  onPromoteCandidate: (candidateId: string) => void;
  onPromoteIntent: (intentId: string) => void;
  onCanonicalizeReq: (reqId: string) => void;
  onViewRawHarvest: (harvest: HTMLHarvest) => void;
}

export const ArtifactPipeline: React.FC<ArtifactPipelineProps> = ({
  harvests,
  candidates,
  intents,
  requirements,
  specs,
  onAddHarvestClick,
  onExtractCandidates,
  onPromoteCandidate,
  onPromoteIntent,
  onCanonicalizeReq,
  onViewRawHarvest,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'harvests' | 'candidates' | 'intents' | 'requirements' | 'specs'
  >('harvests');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100">
      {/* Header & Section Description */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
              Artifact Lifecycle & Pipeline Decomposition
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Progressive canonicalization: Ingestion (HTML Transcripts) → Candidates → Intent Records → Requirement Specs → Canonical Systems.
          </p>
        </div>

        <button
          onClick={onAddHarvestClick}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(99,102,241,0.3)] self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Ingest HTML Harvest</span>
        </button>
      </div>

      {/* Sub-tab Pipeline Switcher */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('harvests')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all shrink-0 ${
            activeSubTab === 'harvests'
              ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/60'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-indigo-400" />
          <span>1. Harvests ({harvests.length})</span>
        </button>

        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

        <button
          onClick={() => setActiveSubTab('candidates')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all shrink-0 ${
            activeSubTab === 'candidates'
              ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/60'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>2. Candidates ({candidates.length})</span>
        </button>

        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

        <button
          onClick={() => setActiveSubTab('intents')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all shrink-0 ${
            activeSubTab === 'intents'
              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/60'
          }`}
        >
          <Target className="w-3.5 h-3.5 text-cyan-400" />
          <span>3. Intent Records ({intents.length})</span>
        </button>

        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

        <button
          onClick={() => setActiveSubTab('requirements')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all shrink-0 ${
            activeSubTab === 'requirements'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/60'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
          <span>4. Requirements ({requirements.length})</span>
        </button>

        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

        <button
          onClick={() => setActiveSubTab('specs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all shrink-0 ${
            activeSubTab === 'specs'
              ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span>5. Canonical Specs ({specs.length})</span>
        </button>
      </div>

      {/* Tab 1: Harvests */}
      {activeSubTab === 'harvests' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {harvests.map((h) => (
            <div
              key={h.id}
              className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 flex flex-col justify-between hover:border-zinc-700 transition-all shadow-md"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-xs mb-2">
                  <span className="text-indigo-400 font-bold">{h.id}</span>
                  <span className="text-zinc-500 text-[11px]">
                    {new Date(h.ingestedAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-zinc-100 line-clamp-2 mb-2">
                  {h.title}
                </h3>
                <p className="text-xs text-zinc-400 font-mono mb-3">
                  Author: <span className="text-zinc-200">{h.author}</span>
                </p>

                <div className="flex flex-wrap gap-1 mb-4">
                  {h.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => onViewRawHarvest(h)}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded border border-zinc-700 flex items-center gap-1 transition-colors"
                >
                  <Eye className="w-3 h-3 text-indigo-400" />
                  <span>View Transcript</span>
                </button>

                <button
                  onClick={() => onExtractCandidates(h.id)}
                  className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-600/50 text-xs font-mono rounded flex items-center gap-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Extract Candidates ({h.candidateCount})</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Candidates */}
      {activeSubTab === 'candidates' && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg overflow-hidden shadow-md">
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between font-mono text-xs">
            <span className="text-zinc-300 font-bold uppercase">
              Actionable Candidates Extracted from Harvests
            </span>
            <span className="text-zinc-500">Total: {candidates.length}</span>
          </div>

          <div className="divide-y divide-zinc-800/80">
            {candidates.map((cand) => (
              <div
                key={cand.id}
                className="p-4 hover:bg-zinc-800/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-amber-400 font-bold">{cand.id}</span>
                    <span className="text-zinc-500">from {cand.harvestId}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        cand.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-300 border-rose-700'
                          : cand.severity === 'HIGH'
                          ? 'bg-amber-950 text-amber-300 border-amber-700'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {cand.severity}
                    </span>
                    <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">
                      {cand.category}
                    </span>
                  </div>

                  <h4 className="font-semibold text-sm text-zinc-100">{cand.title}</h4>
                  <p className="text-xs text-zinc-400">{cand.description}</p>
                </div>

                <div className="shrink-0">
                  {cand.status === 'converted_to_intent' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-700 text-xs font-mono rounded font-semibold">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      Converted to Intent
                    </span>
                  ) : (
                    <button
                      onClick={() => onPromoteCandidate(cand.id)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-md"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>Promote to Intent</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Intent Records */}
      {activeSubTab === 'intents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {intents.map((intent) => (
            <div
              key={intent.id}
              className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 space-y-3 hover:border-zinc-700 transition-all shadow-md"
            >
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-cyan-400 font-bold">{intent.id}</span>
                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                  Impact Score: {intent.impactScore}/10
                </span>
              </div>

              <h3 className="font-bold text-sm text-zinc-100">{intent.summary}</h3>
              <p className="text-xs text-zinc-400">{intent.intentScope}</p>

              <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800/80 text-xs font-mono">
                <span className="text-zinc-500">Target Outcome:</span>
                <p className="text-emerald-300 font-sans mt-0.5">{intent.targetOutcome}</p>
              </div>

              <div className="pt-2 flex justify-end">
                {intent.status === 'promoted_to_requirement' ? (
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded border border-emerald-800">
                    ✓ Promoted to Requirement
                  </span>
                ) : (
                  <button
                    onClick={() => onPromoteIntent(intent.id)}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Create Requirement</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Requirements */}
      {activeSubTab === 'requirements' && (
        <div className="space-y-4">
          {requirements.map((req) => (
            <div
              key={req.id}
              className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">{req.codeName}</span>
                  <span className="text-zinc-500">({req.id})</span>
                  <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded text-[10px]">
                    Priority {req.priority}
                  </span>
                </div>
                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                  Complexity: {req.estimatedComplexity}
                </span>
              </div>

              <h3 className="font-bold text-base text-zinc-100">{req.title}</h3>

              <div className="space-y-1">
                <span className="text-xs font-mono text-zinc-400">Acceptance Criteria:</span>
                <ul className="space-y-1 pl-4 list-disc text-xs text-zinc-300">
                  {req.acceptanceCriteria.map((ac, idx) => (
                    <li key={idx}>{ac}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 flex justify-end">
                {req.status === 'canonicalized' ? (
                  <span className="text-xs font-mono text-purple-300 bg-purple-950 px-2.5 py-1 rounded border border-purple-800">
                    Canonicalized System Spec
                  </span>
                ) : (
                  <button
                    onClick={() => onCanonicalizeReq(req.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Canonicalize System Spec</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 5: Canonical Specs */}
      {activeSubTab === 'specs' && (
        <div className="space-y-4">
          {specs.map((spec) => (
            <div
              key={spec.id}
              className="bg-zinc-900/90 border border-purple-900/50 rounded-lg p-5 space-y-4 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">{spec.systemName}</span>
                  <span className="text-zinc-500">/</span>
                  <span className="text-zinc-200">{spec.subsystemName}</span>
                </div>
                <span className="bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-700 text-[10px]">
                  Spec Version: {spec.specVersion}
                </span>
              </div>

              <p className="text-xs text-zinc-300 font-sans">{spec.architectureSummary}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                  <span className="text-purple-400 font-bold text-[11px] block mb-1">
                    API CONTRACTS
                  </span>
                  <ul className="space-y-1 text-[11px] text-zinc-300">
                    {spec.apiContracts.map((api, idx) => (
                      <li key={idx} className="truncate">
                        • <code>{api}</code>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                  <span className="text-purple-400 font-bold text-[11px] block mb-1">
                    MODULE BOUNDARIES
                  </span>
                  <ul className="space-y-1 text-[11px] text-zinc-300">
                    {spec.moduleBoundaries.map((mod, idx) => (
                      <li key={idx} className="truncate">
                        • <code>{mod}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
