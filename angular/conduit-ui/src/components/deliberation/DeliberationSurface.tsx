import React, { useState } from 'react';
import {
  MessageSquareCode,
  Users,
  CheckCircle,
  XCircle,
  MinusCircle,
  Plus,
  Send,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Award,
} from 'lucide-react';
import { DeliberationAgenda, AgentRole } from '../../types/conduit';

interface DeliberationSurfaceProps {
  agendas: DeliberationAgenda[];
  onCreateAgenda: () => void;
  onVote: (
    agendaId: string,
    agentId: string,
    vote: 'APPROVE' | 'REJECT' | 'NEUTRAL',
    comments: string,
    feasibilityScore: number
  ) => void;
  onPromoteToPlan: (agendaId: string) => void;
}

export const DeliberationSurface: React.FC<DeliberationSurfaceProps> = ({
  agendas,
  onCreateAgenda,
  onVote,
  onPromoteToPlan,
}) => {
  const [selectedAgendaId, setSelectedAgendaId] = useState<string>(
    agendas.length > 0 ? agendas[0].id : ''
  );

  const activeAgenda = agendas.find((a) => a.id === selectedAgendaId) || agendas[0];

  const [voteForm, setVoteForm] = useState<{
    agentId: string;
    vote: 'APPROVE' | 'REJECT' | 'NEUTRAL';
    feasibilityScore: number;
    comments: string;
  }>({
    agentId: 'agent-planner-01',
    vote: 'APPROVE',
    feasibilityScore: 90,
    comments: '',
  });

  const handleVoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAgenda || !voteForm.comments.trim()) return;
    onVote(
      activeAgenda.id,
      voteForm.agentId,
      voteForm.vote,
      voteForm.comments,
      voteForm.feasibilityScore
    );
    setVoteForm({ ...voteForm, comments: '' });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareCode className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
              Artifact Feasibility Review & Deliberation Surface
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Multi-agent feasibility debate, role consensus matrix, and formal plan promotion.
          </p>
        </div>

        <button
          onClick={onCreateAgenda}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(99,102,241,0.3)] self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Deliberation Agenda</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Agenda List */}
        <div className="space-y-3">
          <h2 className="text-xs font-mono font-bold uppercase text-zinc-400 tracking-wider">
            Deliberation Agendas ({agendas.length})
          </h2>

          <div className="space-y-2">
            {agendas.map((agenda) => {
              const isSelected = activeAgenda && activeAgenda.id === agenda.id;
              return (
                <div
                  key={agenda.id}
                  onClick={() => setSelectedAgendaId(agenda.id)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-zinc-900 border-indigo-500/60 shadow-lg'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-xs mb-1.5">
                    <span className="text-indigo-400 font-bold">{agenda.id}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        agenda.status === 'CONSENSUS_REACHED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : agenda.status === 'REJECTED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {agenda.status}
                    </span>
                  </div>

                  <h3 className="font-semibold text-xs text-zinc-100 line-clamp-2 mb-2">
                    {agenda.title}
                  </h3>

                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>Proposed by: {agenda.proposedByRole}</span>
                    <span className="text-emerald-400 font-bold">
                      Feasibility: {agenda.feasibilityConsensusScore}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Active Deliberation Surface */}
        {activeAgenda ? (
          <div className="lg:col-span-2 space-y-6">
            {/* Active Agenda Banner */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-indigo-400 font-mono font-bold text-sm">
                    {activeAgenda.id}
                  </span>
                  <span className="text-zinc-600 font-mono">/</span>
                  <span className="text-zinc-300 font-mono text-xs">
                    Spec: {activeAgenda.specId}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs font-mono font-bold px-3 py-1 rounded flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span>Feasibility Score: {activeAgenda.feasibilityConsensusScore}%</span>
                  </div>

                  {activeAgenda.status === 'CONSENSUS_REACHED' && (
                    <button
                      onClick={() => onPromoteToPlan(activeAgenda.id)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1 transition-all shadow-md"
                    >
                      <span>Promote to Plan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <h2 className="text-base font-bold text-zinc-100">{activeAgenda.title}</h2>

              {activeAgenda.summaryOutput && (
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80 text-xs text-emerald-300 font-mono">
                  💡 {activeAgenda.summaryOutput}
                </div>
              )}

              {/* Participants & Role Voting Matrix */}
              <div className="space-y-2">
                <h3 className="text-xs font-mono font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Agent Participant Feasibility Votes</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeAgenda.participants.map((part) => (
                    <div
                      key={part.agentId}
                      className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-zinc-200">
                            {part.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded uppercase">
                            {part.role}
                          </span>
                        </div>
                        {part.vote === 'APPROVE' && (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        )}
                        {part.vote === 'REJECT' && <XCircle className="w-4 h-4 text-rose-400" />}
                        {part.vote === 'NEUTRAL' && (
                          <MinusCircle className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-cyan-400 mb-1">
                        Model: {part.model}
                      </div>

                      {part.comments ? (
                        <p className="text-xs text-zinc-300 italic">"{part.comments}"</p>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">Awaiting vote response...</p>
                      )}

                      <div className="mt-2 text-right font-mono text-[11px] text-emerald-400 font-bold">
                        Feasibility: {part.feasibilityScore ?? '--'}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discussion Transcript Log */}
              <div className="space-y-2">
                <h3 className="text-xs font-mono font-bold uppercase text-zinc-400 tracking-wider">
                  Deliberation Discussion Transcript
                </h3>

                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 max-h-56 overflow-y-auto space-y-2.5 font-mono text-xs">
                  {activeAgenda.discussionTranscript.map((msg, idx) => (
                    <div key={idx} className="border-b border-zinc-900/80 pb-2">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                        <span className="text-indigo-300 font-bold">{msg.agentName} ({msg.role})</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-zinc-300 font-sans">{msg.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Deliberation Vote Form */}
              <form onSubmit={handleVoteSubmit} className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-3">
                <h4 className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Submit Agent Feasibility Vote</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div>
                    <label className="block text-zinc-400 mb-1">Select Participant</label>
                    <select
                      value={voteForm.agentId}
                      onChange={(e) => setVoteForm({ ...voteForm, agentId: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-zinc-200 outline-none"
                    >
                      {activeAgenda.participants.map((p) => (
                        <option key={p.agentId} value={p.agentId}>
                          {p.name} ({p.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 mb-1">Vote Outcome</label>
                    <select
                      value={voteForm.vote}
                      onChange={(e) =>
                        setVoteForm({
                          ...voteForm,
                          vote: e.target.value as 'APPROVE' | 'REJECT' | 'NEUTRAL',
                        })
                      }
                      className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-zinc-200 outline-none"
                    >
                      <option value="APPROVE">APPROVE (Feasible)</option>
                      <option value="NEUTRAL">NEUTRAL (Needs Work)</option>
                      <option value="REJECT">REJECT (Unfeasible)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-zinc-400 mb-1">
                      Feasibility Score: {voteForm.feasibilityScore}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={voteForm.feasibilityScore}
                      onChange={(e) =>
                        setVoteForm({ ...voteForm, feasibilityScore: Number(e.target.value) })
                      }
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voteForm.comments}
                    onChange={(e) => setVoteForm({ ...voteForm, comments: e.target.value })}
                    placeholder="Enter agent feasibility evaluation comments..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-200 outline-none font-sans"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Vote</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-lg p-12 text-center text-zinc-500 font-mono text-xs">
            Select a deliberation agenda to view the multi-agent consensus matrix.
          </div>
        )}
      </div>
    </div>
  );
};
