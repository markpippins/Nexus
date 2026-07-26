import {
  HTMLHarvest,
  CandidateItem,
  IntentRecord,
  RequirementSpec,
  SystemCanonicalSpec,
  DeliberationAgenda,
  ImplementationPlan,
  WorkRequestDCO,
  WRPKernelDelta,
  SystemNode,
  ModelChainConfig,
  SystemStatus,
  PlanLifecycleStatus,
  AgentRole,
} from '../types/conduit';

import {
  INITIAL_SYSTEM_STATUS,
  INITIAL_HARVESTS,
  INITIAL_CANDIDATES,
  INITIAL_INTENTS,
  INITIAL_REQUIREMENTS,
  INITIAL_CANONICAL_SPECS,
  INITIAL_AGENDAS,
  INITIAL_PLANS,
  INITIAL_WORK_REQUESTS,
  INITIAL_KERNEL_DELTAS,
  INITIAL_SYSTEM_NODES,
  INITIAL_MODEL_CHAINS,
} from './mockData';

// Storage keys
const STORAGE_KEYS = {
  STATUS: 'nexus_system_status_v1',
  HARVESTS: 'nexus_harvests_v1',
  CANDIDATES: 'nexus_candidates_v1',
  INTENTS: 'nexus_intents_v1',
  REQUIREMENTS: 'nexus_requirements_v1',
  CANONICAL_SPECS: 'nexus_canonical_specs_v1',
  AGENDAS: 'nexus_agendas_v1',
  PLANS: 'nexus_plans_v1',
  WORK_REQUESTS: 'nexus_work_requests_v1',
  KERNEL_DELTAS: 'nexus_kernel_deltas_v1',
  SYSTEM_NODES: 'nexus_system_nodes_v1',
  MODEL_CHAINS: 'nexus_model_chains_v1',
  USE_MOCK: 'nexus_use_mock_api_v1',
};

class ApiService {
  private useMock: boolean = true;

  constructor() {
    const storedMock = localStorage.getItem(STORAGE_KEYS.USE_MOCK);
    if (storedMock !== null) {
      this.useMock = storedMock === 'true';
    } else {
      this.useMock = true; // Default to mock for standalone preview
    }
    this.initLocalStorage();
  }

  public isMockMode(): boolean {
    return this.useMock;
  }

  public setMockMode(enabled: boolean): void {
    this.useMock = enabled;
    localStorage.setItem(STORAGE_KEYS.USE_MOCK, String(enabled));
  }

  private initLocalStorage(): void {
    if (!localStorage.getItem(STORAGE_KEYS.HARVESTS)) {
      localStorage.setItem(STORAGE_KEYS.HARVESTS, JSON.stringify(INITIAL_HARVESTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CANDIDATES)) {
      localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(INITIAL_CANDIDATES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.INTENTS)) {
      localStorage.setItem(STORAGE_KEYS.INTENTS, JSON.stringify(INITIAL_INTENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.REQUIREMENTS)) {
      localStorage.setItem(STORAGE_KEYS.REQUIREMENTS, JSON.stringify(INITIAL_REQUIREMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CANONICAL_SPECS)) {
      localStorage.setItem(STORAGE_KEYS.CANONICAL_SPECS, JSON.stringify(INITIAL_CANONICAL_SPECS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.AGENDAS)) {
      localStorage.setItem(STORAGE_KEYS.AGENDAS, JSON.stringify(INITIAL_AGENDAS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PLANS)) {
      localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(INITIAL_PLANS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.WORK_REQUESTS)) {
      localStorage.setItem(STORAGE_KEYS.WORK_REQUESTS, JSON.stringify(INITIAL_WORK_REQUESTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.KERNEL_DELTAS)) {
      localStorage.setItem(STORAGE_KEYS.KERNEL_DELTAS, JSON.stringify(INITIAL_KERNEL_DELTAS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SYSTEM_NODES)) {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_NODES, JSON.stringify(INITIAL_SYSTEM_NODES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MODEL_CHAINS)) {
      localStorage.setItem(STORAGE_KEYS.MODEL_CHAINS, JSON.stringify(INITIAL_MODEL_CHAINS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.STATUS)) {
      localStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(INITIAL_SYSTEM_STATUS));
    }
  }

  public resetToDefaults(): void {
    localStorage.setItem(STORAGE_KEYS.HARVESTS, JSON.stringify(INITIAL_HARVESTS));
    localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(INITIAL_CANDIDATES));
    localStorage.setItem(STORAGE_KEYS.INTENTS, JSON.stringify(INITIAL_INTENTS));
    localStorage.setItem(STORAGE_KEYS.REQUIREMENTS, JSON.stringify(INITIAL_REQUIREMENTS));
    localStorage.setItem(STORAGE_KEYS.CANONICAL_SPECS, JSON.stringify(INITIAL_CANONICAL_SPECS));
    localStorage.setItem(STORAGE_KEYS.AGENDAS, JSON.stringify(INITIAL_AGENDAS));
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(INITIAL_PLANS));
    localStorage.setItem(STORAGE_KEYS.WORK_REQUESTS, JSON.stringify(INITIAL_WORK_REQUESTS));
    localStorage.setItem(STORAGE_KEYS.KERNEL_DELTAS, JSON.stringify(INITIAL_KERNEL_DELTAS));
    localStorage.setItem(STORAGE_KEYS.SYSTEM_NODES, JSON.stringify(INITIAL_SYSTEM_NODES));
    localStorage.setItem(STORAGE_KEYS.MODEL_CHAINS, JSON.stringify(INITIAL_MODEL_CHAINS));
    localStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(INITIAL_SYSTEM_STATUS));
  }

  // System Status
  public async getSystemStatus(): Promise<SystemStatus> {
    if (!this.useMock) {
      try {
        const res = await fetch('/api/status');
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn('Backend /api/status offline, fallback to mock state', e);
      }
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.STATUS) || JSON.stringify(INITIAL_SYSTEM_STATUS));
  }

  // Harvest Transcripts
  public async getHarvests(): Promise<HTMLHarvest[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.HARVESTS) || '[]');
  }

  public async addHarvest(harvestData: Omit<HTMLHarvest, 'id' | 'ingestedAt' | 'candidateCount'>): Promise<HTMLHarvest> {
    const harvests = await this.getHarvests();
    const newHarvest: HTMLHarvest = {
      ...harvestData,
      id: `HARVEST-2026-${String(harvests.length + 1).padStart(3, '0')}`,
      ingestedAt: new Date().toISOString(),
      candidateCount: 0,
    };
    harvests.unshift(newHarvest);
    localStorage.setItem(STORAGE_KEYS.HARVESTS, JSON.stringify(harvests));
    return newHarvest;
  }

  // Candidates
  public async getCandidates(): Promise<CandidateItem[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CANDIDATES) || '[]');
  }

  public async addCandidate(candidate: Omit<CandidateItem, 'id' | 'createdAt' | 'status'>): Promise<CandidateItem> {
    const candidates = await this.getCandidates();
    const newCand: CandidateItem = {
      ...candidate,
      id: `CND-${800 + candidates.length + 1}`,
      status: 'unassigned',
      createdAt: new Date().toISOString(),
    };
    candidates.unshift(newCand);
    localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(candidates));

    // Update harvest candidate count
    const harvests = await this.getHarvests();
    const targetHarvest = harvests.find(h => h.id === candidate.harvestId);
    if (targetHarvest) {
      targetHarvest.candidateCount += 1;
      localStorage.setItem(STORAGE_KEYS.HARVESTS, JSON.stringify(harvests));
    }

    return newCand;
  }

  // Promote Candidate -> Intent
  public async promoteCandidateToIntent(candidateId: string, intentData: { systemId: string; subsystemId: string; summary: string; targetOutcome: string }): Promise<IntentRecord> {
    const candidates = await this.getCandidates();
    const cand = candidates.find(c => c.id === candidateId);
    if (cand) {
      cand.status = 'converted_to_intent';
      localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(candidates));
    }

    const intents = await this.getIntents();
    const newIntent: IntentRecord = {
      id: `INT-${300 + intents.length + 1}`,
      candidateId,
      systemId: intentData.systemId,
      subsystemId: intentData.subsystemId,
      summary: intentData.summary,
      intentScope: cand ? cand.description : 'Extracted scope from candidate decomposition.',
      impactScore: cand?.severity === 'CRITICAL' ? 10 : cand?.severity === 'HIGH' ? 8 : 6,
      status: 'draft',
      createdAt: new Date().toISOString(),
      targetOutcome: intentData.targetOutcome,
    };

    intents.unshift(newIntent);
    localStorage.setItem(STORAGE_KEYS.INTENTS, JSON.stringify(intents));
    return newIntent;
  }

  // Intents
  public async getIntents(): Promise<IntentRecord[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.INTENTS) || '[]');
  }

  // Promote Intent -> Requirement
  public async promoteIntentToRequirement(intentId: string, title: string, codeName: string, acceptanceCriteria: string[]): Promise<RequirementSpec> {
    const intents = await this.getIntents();
    const intent = intents.find(i => i.id === intentId);
    if (intent) {
      intent.status = 'promoted_to_requirement';
      localStorage.setItem(STORAGE_KEYS.INTENTS, JSON.stringify(intents));
    }

    const requirements = await this.getRequirements();
    const newReq: RequirementSpec = {
      id: `REQ-${codeName.toUpperCase().replace(/\s+/g, '-')}`,
      intentId,
      codeName,
      title,
      acceptanceCriteria,
      priority: intent && intent.impactScore >= 9 ? 'P0' : 'P1',
      status: 'draft',
      estimatedComplexity: 'M',
      createdAt: new Date().toISOString(),
    };

    requirements.unshift(newReq);
    localStorage.setItem(STORAGE_KEYS.REQUIREMENTS, JSON.stringify(requirements));
    return newReq;
  }

  // Requirements
  public async getRequirements(): Promise<RequirementSpec[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUIREMENTS) || '[]');
  }

  // Canonical Specs
  public async getCanonicalSpecs(): Promise<SystemCanonicalSpec[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CANONICAL_SPECS) || '[]');
  }

  public async canonicalizeRequirement(reqId: string, specData: { systemName: string; subsystemName: string; architectureSummary: string; apiContracts: string[] }): Promise<SystemCanonicalSpec> {
    const reqs = await this.getRequirements();
    const req = reqs.find(r => r.id === reqId);
    if (req) {
      req.status = 'canonicalized';
      localStorage.setItem(STORAGE_KEYS.REQUIREMENTS, JSON.stringify(reqs));
    }

    const specs = await this.getCanonicalSpecs();
    const newSpec: SystemCanonicalSpec = {
      id: `SPEC-${specData.systemName.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase()}-${specs.length + 1}`,
      requirementId: reqId,
      systemName: specData.systemName,
      subsystemName: specData.subsystemName,
      specVersion: '1.0.0-CANONICAL',
      architectureSummary: specData.architectureSummary,
      apiContracts: specData.apiContracts,
      moduleBoundaries: ['main.py', 'schema.sql', 'db_adapter.py'],
      status: 'canonical',
      updatedAt: new Date().toISOString(),
    };

    specs.unshift(newSpec);
    localStorage.setItem(STORAGE_KEYS.CANONICAL_SPECS, JSON.stringify(specs));
    return newSpec;
  }

  // Deliberation Agendas
  public async getDeliberationAgendas(): Promise<DeliberationAgenda[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.AGENDAS) || '[]');
  }

  public async createDeliberationAgenda(specId: string, title: string, proposedByRole: AgentRole): Promise<DeliberationAgenda> {
    const agendas = await this.getDeliberationAgendas();
    const newAgenda: DeliberationAgenda = {
      id: `AGENDA-2026-${String(77 + agendas.length).padStart(3, '0')}`,
      specId,
      title,
      proposedByRole,
      createdAt: new Date().toISOString(),
      status: 'IN_DELIBERATION',
      feasibilityConsensusScore: 75,
      participants: [
        { agentId: 'agent-planner-01', name: 'Planner Agent AI', role: 'planner', model: 'gemini-1.5-pro' },
        { agentId: 'agent-builder-04', name: 'Builder Agent Core', role: 'builder', model: 'claude-3-5-sonnet' },
        { agentId: 'agent-reviewer-02', name: 'Reviewer Authority', role: 'reviewer', model: 'gpt-4o' },
        { agentId: 'agent-kernel-01', name: 'Kernel Guard', role: 'kernel', model: 'wrp-kernel-validator' },
      ],
      discussionTranscript: [
        {
          timestamp: new Date().toISOString(),
          agentId: 'agent-planner-01',
          agentName: 'Planner Agent AI',
          role: 'planner',
          text: `Opened feasibility deliberation round for artifact specification ${specId}: "${title}".`,
        },
      ],
    };

    agendas.unshift(newAgenda);
    localStorage.setItem(STORAGE_KEYS.AGENDAS, JSON.stringify(agendas));
    return newAgenda;
  }

  public async addDeliberationVote(agendaId: string, agentId: string, vote: 'APPROVE' | 'REJECT' | 'NEUTRAL', comments: string, feasibilityScore: number): Promise<DeliberationAgenda> {
    const agendas = await this.getDeliberationAgendas();
    const agenda = agendas.find(a => a.id === agendaId);
    if (!agenda) throw new Error('Agenda not found');

    const participant = agenda.participants.find(p => p.agentId === agentId);
    if (participant) {
      participant.vote = vote;
      participant.comments = comments;
      participant.feasibilityScore = feasibilityScore;
    }

    agenda.discussionTranscript.push({
      timestamp: new Date().toISOString(),
      agentId,
      agentName: participant?.name || 'Agent',
      role: participant?.role || 'planner',
      text: `Voted [${vote}] (Feasibility: ${feasibilityScore}%): ${comments}`,
    });

    // Recalculate average feasibility
    const votedParts = agenda.participants.filter(p => p.feasibilityScore !== undefined);
    if (votedParts.length > 0) {
      const avg = Math.round(votedParts.reduce((acc, p) => acc + (p.feasibilityScore || 0), 0) / votedParts.length);
      agenda.feasibilityConsensusScore = avg;
      if (votedParts.length === agenda.participants.length) {
        agenda.status = avg >= 70 ? 'CONSENSUS_REACHED' : 'REJECTED';
        agenda.summaryOutput = avg >= 70 ? `Feasibility consensus reached (${avg}%). Ready for Plan Promotion.` : `Proposal rejected due to low consensus score (${avg}%).`;
      }
    }

    localStorage.setItem(STORAGE_KEYS.AGENDAS, JSON.stringify(agendas));
    return agenda;
  }

  // Promote Deliberation -> Implementation Plan
  public async promoteAgendaToPlan(agendaId: string): Promise<ImplementationPlan> {
    const agendas = await this.getDeliberationAgendas();
    const agenda = agendas.find(a => a.id === agendaId);
    if (!agenda) throw new Error('Agenda not found');

    agenda.status = 'CONSENSUS_REACHED';
    localStorage.setItem(STORAGE_KEYS.AGENDAS, JSON.stringify(agendas));

    const plans = await this.getPlans();
    const newPlanId = `plan_00${77 + plans.length}`;
    const newTicketId = `TCK-2026-00${77 + plans.length}`;

    const newPlan: ImplementationPlan = {
      id: newPlanId,
      ticketId: newTicketId,
      title: agenda.title,
      description: agenda.summaryOutput || 'Promoted from Deliberation Agenda consensus round.',
      specId: agenda.specId,
      status: 'PROPOSED',
      currentRole: 'planner',
      modelChain: ['claude-3-5-sonnet', 'gemini-1.5-pro', 'gpt-4o-mini'],
      activeModel: 'claude-3-5-sonnet',
      costUsd: 0.0,
      tokenCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryAttempts: 0,
      receipts: [
        {
          id: `RCP-${newPlanId}-1`,
          ticketId: newTicketId,
          receiptType: 'PROPOSED',
          issuedAt: new Date().toISOString(),
          payload: { promotedFromAgenda: agendaId, consensusScore: agenda.feasibilityConsensusScore },
          hash: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        },
      ],
    };

    plans.unshift(newPlan);
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));

    // Log Kernel Delta
    await this.addKernelDelta({
      receiptId: newPlan.receipts[0].id,
      planId: newPlanId,
      action: 'PROMOTE_AGENDA_TO_PROPOSED_PLAN',
      deltaType: 'STATE_MUTATION',
    });

    return newPlan;
  }

  // Implementation Plans
  public async getPlans(): Promise<ImplementationPlan[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLANS) || '[]');
  }

  public async updatePlanStatus(planId: string, newStatus: PlanLifecycleStatus, nextRole?: AgentRole): Promise<ImplementationPlan> {
    const plans = await this.getPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) throw new Error('Plan not found');

    plan.status = newStatus;
    plan.updatedAt = new Date().toISOString();
    if (nextRole) plan.currentRole = nextRole;

    // Issue new receipt depending on status transition
    const receiptTypeMap: Record<PlanLifecycleStatus, 'PROPOSED' | 'PLANNING' | 'PLAN_CREATE' | 'IMPLEMENTATION' | 'REVIEW_PASS' | 'BLOCK'> = {
      PROPOSED: 'PROPOSED',
      PLANNING: 'PLANNING',
      PENDING: 'PLAN_CREATE',
      ACTIVE: 'IMPLEMENTATION',
      COMPLETED: 'REVIEW_PASS',
      BLOCKED: 'BLOCK',
    };

    const newReceiptType = receiptTypeMap[newStatus];
    const prevHash = plan.receipts.length > 0 ? plan.receipts[plan.receipts.length - 1].hash : undefined;
    const newHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const newReceipt = {
      id: `RCP-${plan.id}-${plan.receipts.length + 1}`,
      ticketId: plan.ticketId,
      receiptType: newReceiptType,
      issuedAt: new Date().toISOString(),
      payload: { transitionTo: newStatus, role: plan.currentRole, activeModel: plan.activeModel },
      hash: newHash,
      previousHash: prevHash,
    };

    plan.receipts.push(newReceipt);
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));

    // Append Kernel Delta
    await this.addKernelDelta({
      receiptId: newReceipt.id,
      planId: plan.id,
      action: `TRANSITION_${newStatus}`,
      deltaType: newStatus === 'COMPLETED' ? 'SNAPSHOT_POINT' : 'STATE_MUTATION',
    });

    return plan;
  }

  // Work Requests (ADR-006 Execution Authority)
  public async getWorkRequests(): Promise<WorkRequestDCO[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.WORK_REQUESTS) || '[]');
  }

  public async dispatchWorkRequest(planId: string, role: AgentRole, model: string): Promise<WorkRequestDCO> {
    const requests = await this.getWorkRequests();
    const newWrId = `WR-2026-${String(90 + requests.length).padStart(3, '0')}`;
    const newLeaseId = `LSE-${Math.floor(1000 + Math.random() * 9000)}`;
    const newAttemptId = `ATT-2026-${Math.floor(500 + Math.random() * 500)}`;

    const newWr: WorkRequestDCO = {
      id: newWrId,
      planId,
      role,
      leaseId: newLeaseId,
      leaseOwner: 'executor-cloud-node-01',
      leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      attemptId: newAttemptId,
      attemptStatus: 'IN_PROGRESS',
      primaryModel: model,
      inputPayload: JSON.stringify(
        {
          dcoVersion: '1.2.0',
          planId,
          role,
          dispatchTimestamp: new Date().toISOString(),
          instructions: `Execute ADR-006 authority for role ${role} using model ${model}`,
        },
        null,
        2
      ),
      costEstimateUsd: 1.50,
      createdAt: new Date().toISOString(),
    };

    requests.unshift(newWr);
    localStorage.setItem(STORAGE_KEYS.WORK_REQUESTS, JSON.stringify(requests));
    return newWr;
  }

  public async completeWorkRequest(wrId: string, output: string, success: boolean): Promise<WorkRequestDCO> {
    const requests = await this.getWorkRequests();
    const wr = requests.find(r => r.id === wrId);
    if (!wr) throw new Error('Work request not found');

    wr.attemptStatus = success ? 'SUCCEEDED' : 'FAILED';
    wr.completedAt = new Date().toISOString();
    wr.outputResult = output;
    wr.executionReceiptHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    localStorage.setItem(STORAGE_KEYS.WORK_REQUESTS, JSON.stringify(requests));
    return wr;
  }

  // WRP Kernel Deltas
  public async getKernelDeltas(): Promise<WRPKernelDelta[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.KERNEL_DELTAS) || '[]');
  }

  public async addKernelDelta(deltaData: Omit<WRPKernelDelta, 'sequenceId' | 'timestamp' | 'engineSignature' | 'stateHash'>): Promise<WRPKernelDelta> {
    const deltas = await this.getKernelDeltas();
    const newDelta: WRPKernelDelta = {
      ...deltaData,
      sequenceId: 1046 + deltas.length,
      timestamp: new Date().toISOString(),
      engineSignature: 'WRP-ENGINE-v1.8.2',
      stateHash: '0x' + Math.floor(Math.random() * 0xffffffffffff).toString(16),
    };

    deltas.push(newDelta);
    localStorage.setItem(STORAGE_KEYS.KERNEL_DELTAS, JSON.stringify(deltas));
    return newDelta;
  }

  // System Nodes
  public async getSystemNodes(): Promise<SystemNode[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SYSTEM_NODES) || '[]');
  }

  // Model Chains
  public async getModelChains(): Promise<ModelChainConfig[]> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MODEL_CHAINS) || '[]');
  }

  public async updateModelChain(config: ModelChainConfig): Promise<ModelChainConfig[]> {
    const chains = await this.getModelChains();
    const idx = chains.findIndex(c => c.role === config.role);
    if (idx !== -1) {
      chains[idx] = config;
      localStorage.setItem(STORAGE_KEYS.MODEL_CHAINS, JSON.stringify(chains));
    }
    return chains;
  }
}

export const apiService = new ApiService();
