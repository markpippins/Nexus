import React, { useState, useEffect } from 'react';
import { Network, Search, GitBranch, Layers, Clock, ArrowRight, Shield } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { CrossPlanGraphResponse, PlanDetailResponse, KernelIdentity, LineageEventItem } from '../../types/conduit';

export const StateInspectionView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'graph' | 'identity' | 'plan' | 'lineage'>('graph');
  
  // State data
  const [graphData, setGraphData] = useState<CrossPlanGraphResponse | null>(null);
  const [searchIdentityId, setSearchIdentityId] = useState<string>('plan_0053');
  const [identityResult, setIdentityResult] = useState<KernelIdentity | null>(null);
  const [searchPlanNum, setSearchPlanNum] = useState<string>('plan_0053');
  const [planDetail, setPlanDetail] = useState<PlanDetailResponse | null>(null);
  const [lineageEvents, setLineageEvents] = useState<LineageEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadGraph();
    loadPlan('plan_0053');
    loadLineage();
  }, []);

  const loadGraph = async () => {
    try {
      const data = await apiService.getCrossPlanGraph('', 200);
      setGraphData(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleResolveIdentity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await apiService.getIdentity(searchIdentityId);
      setIdentityResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Identity not found');
      setIdentityResult(null);
    }
  };

  const loadPlan = async (pNum: string) => {
    setErrorMsg(null);
    try {
      const res = await apiService.getPlanDetail(pNum);
      setPlanDetail(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Plan detail error');
      setPlanDetail(null);
    }
  };

  const loadLineage = async () => {
    try {
      const res = await apiService.getLineageEvents(undefined, 100);
      setLineageEvents(Array.isArray(res.events) ? res.events : []);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      {/* Header & Sub-Tab Navigation */}
      <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-400" />
            <h1 className="text-base font-bold font-mono text-white uppercase tracking-tight">
              2. State Inspection & Cross-Plan Graph (<code className="text-blue-400">/state</code>)
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Explore kernel state, cross-plan relationship graphs, plan receipt timelines, and lineage event logs.
          </p>
        </div>

        {/* Sub tab buttons */}
        <div className="flex items-center bg-[#0c0c0e] border border-zinc-800 rounded p-1 text-xs font-mono">
          <button
            onClick={() => setActiveSubTab('graph')}
            className={`px-3 py-1 rounded transition-colors ${
              activeSubTab === 'graph' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Graph (/state/graph)
          </button>
          <button
            onClick={() => {
              setActiveSubTab('identity');
              handleResolveIdentity();
            }}
            className={`px-3 py-1 rounded transition-colors ${
              activeSubTab === 'identity' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Identity Resolver
          </button>
          <button
            onClick={() => setActiveSubTab('plan')}
            className={`px-3 py-1 rounded transition-colors ${
              activeSubTab === 'plan' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Plan Profile
          </button>
          <button
            onClick={() => setActiveSubTab('lineage')}
            className={`px-3 py-1 rounded transition-colors ${
              activeSubTab === 'lineage' ? 'bg-blue-600 font-bold text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Lineage Log
          </button>
        </div>
      </div>

      {/* SubTab 1: Cross Plan Graph */}
      {activeSubTab === 'graph' && (
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-2">
              <Network className="w-4 h-4 text-purple-400" />
              Cross-Plan Relationship Graph (`GET /state/graph`)
            </h2>
            <span className="text-xs font-mono text-zinc-400">
              Total Edges: <strong className="text-purple-400">{graphData?.total_edges ?? 0}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nodes list */}
            <div className="space-y-2">
              <div className="text-xs font-mono font-bold text-zinc-400">GRAPH NODES</div>
              <div className="space-y-2">
                {graphData?.nodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSearchPlanNum(node.id.replace('iden::', ''));
                      setActiveSubTab('plan');
                      loadPlan(node.id.replace('iden::', ''));
                    }}
                    className="p-3 bg-[#0c0c0e] border border-zinc-800 hover:border-blue-600 rounded cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-blue-400">{node.id}</div>
                      <div className="text-xs text-zinc-300 font-semibold">{node.label}</div>
                    </div>
                    <div className="flex gap-1 font-mono text-[10px]">
                      {node.aliases.map((a) => (
                        <span key={a} className="bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Edges list */}
            <div className="space-y-2">
              <div className="text-xs font-mono font-bold text-zinc-400">GRAPH EDGES</div>
              <div className="space-y-2">
                {graphData?.edges.map((edge, idx) => (
                  <div key={idx} className="p-3 bg-[#0c0c0e] border border-zinc-800 rounded space-y-1 font-mono text-xs">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <span className="text-blue-400 font-bold">{edge.source_label || edge.source}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="text-cyan-400 font-bold">{edge.target_label || edge.target}</span>
                    </div>
                    <div className="text-[11px] text-purple-400">
                      Relation: <code>{edge.relation}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Identity Resolver */}
      {activeSubTab === 'identity' && (
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4 font-mono">
          <form onSubmit={handleResolveIdentity} className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchIdentityId}
                onChange={(e) => setSearchIdentityId(e.target.value)}
                placeholder="Enter identity ID, alias, or plan number (e.g., iden::plan_0053, plan_0053, 0053)"
                className="w-full bg-[#0c0c0e] border border-zinc-700 rounded pl-9 pr-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded transition-colors"
            >
              GET /state/identity/:id
            </button>
          </form>

          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {identityResult && (
            <div className="p-4 bg-[#0c0c0e] border border-zinc-800 rounded space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-sm font-bold text-blue-400">{identityResult.id}</span>
                <span className="text-xs text-zinc-300 font-sans font-semibold">{identityResult.label}</span>
              </div>
              <div>
                <div className="text-zinc-500 text-[10px] uppercase mb-1">Aliases</div>
                <div className="flex gap-2">
                  {(Array.isArray(identityResult.aliases) ? identityResult.aliases : []).map((a) => (
                    <span key={a} className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-xs">
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              {identityResult.edges_outgoing && identityResult.edges_outgoing.length > 0 && (
                <div>
                  <div className="text-zinc-500 text-[10px] uppercase mb-1">Outgoing Edges</div>
                  <pre className="text-xs text-purple-300 bg-zinc-950 p-2 rounded border border-zinc-800">
                    {JSON.stringify(identityResult.edges_outgoing, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SubTab 3: Plan Profile */}
      {activeSubTab === 'plan' && (
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-3 font-mono">
            <input
              type="text"
              value={searchPlanNum}
              onChange={(e) => setSearchPlanNum(e.target.value)}
              placeholder="e.g. plan_0053 or 0053"
              className="bg-[#0c0c0e] border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => loadPlan(searchPlanNum)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded transition-colors"
            >
              GET /state/plan/:num
            </button>
          </div>

          {planDetail && (
            <div className="space-y-4">
              <div className="p-4 bg-[#0c0c0e] border border-zinc-800 rounded flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
                <div>
                  <div className="text-blue-400 font-bold text-sm">{planDetail.plan_num}</div>
                  <div className="text-zinc-400 font-sans">{planDetail.label}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-[10px] uppercase">WRP State</div>
                  <div className="text-emerald-400 font-bold">{planDetail.current_wrp_state}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-[10px] uppercase">Receipt Count</div>
                  <div className="text-white font-bold">{planDetail.receipt_count}</div>
                </div>
                <div>
                  <div className="text-zinc-500 text-[10px] uppercase">Valid Next Transitions</div>
                  <div className="flex gap-1 mt-1">
                    {(Array.isArray(planDetail.valid_transitions) ? planDetail.valid_transitions : []).map((t) => (
                      <span key={t} className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Receipt timeline */}
              <div className="space-y-2">
                <div className="text-xs font-mono font-bold text-zinc-400">CHRONOLOGICAL RECEIPT TIMELINE</div>
                <div className="space-y-2">
                  {(Array.isArray(planDetail.receipts) ? planDetail.receipts : []).map((rc) => (
                    <div key={rc.id} className="p-3 bg-[#0c0c0e] border border-zinc-800 rounded font-mono text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400 font-bold">{rc.id}</span>
                        <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 text-[10px]">
                          {rc.type}
                        </span>
                      </div>
                      <div className="text-zinc-300 text-[11px] font-sans">{rc.summary}</div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/80">
                        <span>Role: {rc.agent_role}</span>
                        <span>{new Date(rc.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SubTab 4: Lineage Log */}
      {activeSubTab === 'lineage' && (
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h2 className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Append-Only Kernel Lineage Log (`GET /state/lineage`)
            </h2>
            <button
              onClick={loadLineage}
              className="text-xs font-mono text-blue-400 hover:underline"
            >
              Refresh Events
            </button>
          </div>

          <div className="space-y-2 font-mono text-xs">
            {lineageEvents.map((ev) => (
              <div key={ev.id} className="p-3 bg-[#0c0c0e] border border-zinc-800 rounded flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold">Event #{ev.id}</span>
                    <span className="bg-blue-900/40 text-blue-300 px-1.5 py-0.2 rounded border border-blue-800 text-[10px]">
                      v{ev.version}
                    </span>
                    <span className="text-zinc-400">Step: {ev.step}</span>
                  </div>
                  <div className="text-zinc-200 font-sans">{ev.detail}</div>
                </div>
                <div className="text-right text-[10px] text-zinc-500 shrink-0">
                  <div>Delta: {ev.delta_id}</div>
                  <div>Plans: {(Array.isArray(ev.affected_plans) ? ev.affected_plans : []).join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
