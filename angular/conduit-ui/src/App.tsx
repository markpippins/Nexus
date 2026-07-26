import React, { useState, useEffect } from 'react';
import { AddressBar, AppTheme } from './components/layout/AddressBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainDashboard } from './components/dashboard/MainDashboard';
import { ArtifactPipeline } from './components/artifacts/ArtifactPipeline';
import { ProcessKanban } from './components/kanban/ProcessKanban';
import { DeliberationSurface } from './components/deliberation/DeliberationSurface';
import { HierarchicalTree } from './components/architecture/HierarchicalTree';
import { ReceiptsAuditLog } from './components/execution/ReceiptsAuditLog';
import { ModelChainControl } from './components/modelchain/ModelChainControl';

import { IntegrationModal } from './components/modals/IntegrationModal';
import { NewHarvestModal } from './components/modals/NewHarvestModal';
import { NewPlanModal } from './components/modals/NewPlanModal';
import { DetailDrawer } from './components/modals/DetailDrawer';

import { apiService } from './services/apiService';
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
} from './types/conduit';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [currentPath, setCurrentPath] = useState<string>('conduit://nexus.local/dashboard');
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('nexus_theme');
    return (saved as AppTheme) || 'dark';
  });

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
    localStorage.setItem('nexus_theme', newTheme);
  };

  // Domain State
  const [status, setStatus] = useState<SystemStatus>(apiService.getSystemStatus() as any);
  const [isMockMode, setIsMockMode] = useState<boolean>(apiService.isMockMode());
  const [harvests, setHarvests] = useState<HTMLHarvest[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [intents, setIntents] = useState<IntentRecord[]>([]);
  const [requirements, setRequirements] = useState<RequirementSpec[]>([]);
  const [specs, setSpecs] = useState<SystemCanonicalSpec[]>([]);
  const [agendas, setAgendas] = useState<DeliberationAgenda[]>([]);
  const [plans, setPlans] = useState<ImplementationPlan[]>([]);
  const [workRequests, setWorkRequests] = useState<WorkRequestDCO[]>([]);
  const [kernelDeltas, setKernelDeltas] = useState<WRPKernelDelta[]>([]);
  const [systemNodes, setSystemNodes] = useState<SystemNode[]>([]);
  const [modelChains, setModelChains] = useState<ModelChainConfig[]>([]);

  // Modals & Drawers
  const [isIntegrationGuideOpen, setIsIntegrationGuideOpen] = useState(false);
  const [isNewHarvestOpen, setIsNewHarvestOpen] = useState(false);
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [selectedPlanForDrawer, setSelectedPlanForDrawer] = useState<ImplementationPlan | null>(
    null
  );
  const [selectedHarvestForDrawer, setSelectedHarvestForDrawer] = useState<HTMLHarvest | null>(
    null
  );

  // Load all state from API service
  const refreshAllData = async () => {
    const st = await apiService.getSystemStatus();
    setStatus(st);
    setHarvests(await apiService.getHarvests());
    setCandidates(await apiService.getCandidates());
    setIntents(await apiService.getIntents());
    setRequirements(await apiService.getRequirements());
    setSpecs(await apiService.getCanonicalSpecs());
    setAgendas(await apiService.getDeliberationAgendas());
    setPlans(await apiService.getPlans());
    setWorkRequests(await apiService.getWorkRequests());
    setKernelDeltas(await apiService.getKernelDeltas());
    setSystemNodes(await apiService.getSystemNodes());
    setModelChains(await apiService.getModelChains());
  };

  useEffect(() => {
    refreshAllData();
  }, [isMockMode]);

  // Tab navigation & URL bar synchronization
  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setCurrentPath(`conduit://nexus.local/${tabId}`);
  };

  const handleNavigatePath = (path: string) => {
    setCurrentPath(path);
    const clean = path.replace('conduit://nexus.local/', '').replace('/', '');
    if (clean) setActiveTab(clean);
  };

  const handleToggleMockMode = () => {
    const next = !isMockMode;
    apiService.setMockMode(next);
    setIsMockMode(next);
  };

  // Handlers for Artifact Pipeline Actions
  const handleIngestHarvest = async (data: {
    title: string;
    rawHtmlContent: string;
    author: string;
    tags: string[];
  }) => {
    await apiService.addHarvest(data);
    await refreshAllData();
  };

  const handleExtractCandidates = async (harvestId: string) => {
    await apiService.addCandidate({
      harvestId,
      title: 'Auto-Extracted Candidate: WorkRequest Isolation',
      description: 'Extracted actionable requirement from HTML transcript review.',
      severity: 'HIGH',
      category: 'architecture',
      suggestedSystem: 'nexus.conduit.executor_cloud',
    });
    await refreshAllData();
  };

  const handlePromoteCandidate = async (candidateId: string) => {
    await apiService.promoteCandidateToIntent(candidateId, {
      systemId: 'SYS-CONDUIT',
      subsystemId: 'SUB-EXECUTOR',
      summary: 'Promoted Candidate to Intent Record',
      targetOutcome: 'Full implementation under ADR-006 lease control.',
    });
    await refreshAllData();
  };

  const handlePromoteIntent = async (intentId: string) => {
    const target = intents.find((i) => i.id === intentId);
    await apiService.promoteIntentToRequirement(
      intentId,
      target?.summary || 'New Promoted Requirement',
      `REQ-${Math.floor(100 + Math.random() * 900)}`,
      ['Target criteria 1 met', 'Receipt chain verified']
    );
    await refreshAllData();
  };

  const handleCanonicalizeReq = async (reqId: string) => {
    const req = requirements.find((r) => r.id === reqId);
    await apiService.canonicalizeRequirement(reqId, {
      systemName: req?.codeName || 'nexus.canonical.system',
      subsystemName: 'core_subsystem',
      architectureSummary: 'Canonicalized architecture spec from requirements decomposition.',
      apiContracts: ['dispatch_work_request()', 'issue_execution_receipt()'],
    });
    await refreshAllData();
  };

  // Handlers for Plan Actions
  const handleProposeNewPlan = async (title: string, description: string) => {
    const plansList = await apiService.getPlans();
    const newPlanId = `plan_00${78 + plansList.length}`;
    const newTicketId = `TCK-2026-00${78 + plansList.length}`;

    const newPlan: ImplementationPlan = {
      id: newPlanId,
      ticketId: newTicketId,
      title,
      description,
      status: 'PROPOSED',
      currentRole: 'planner',
      modelChain: ['claude-3-5-sonnet', 'gemini-1.5-pro'],
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
          payload: { title, proposedBy: 'UserControlPlane' },
          hash: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        },
      ],
    };

    plansList.unshift(newPlan);
    localStorage.setItem('nexus_plans_v1', JSON.stringify(plansList));
    await refreshAllData();
  };

  const handleAdvancePlanStatus = async (
    planId: string,
    currentStatus: PlanLifecycleStatus
  ) => {
    const statusSequence: PlanLifecycleStatus[] = [
      'PROPOSED',
      'PLANNING',
      'PENDING',
      'ACTIVE',
      'COMPLETED',
    ];

    const currentIdx = statusSequence.indexOf(currentStatus);
    if (currentIdx !== -1 && currentIdx < statusSequence.length - 1) {
      const nextStatus = statusSequence[currentIdx + 1];
      const roleMap: Record<PlanLifecycleStatus, AgentRole> = {
        PROPOSED: 'planner',
        PLANNING: 'planner',
        PENDING: 'builder',
        ACTIVE: 'builder',
        COMPLETED: 'reviewer',
        BLOCKED: 'builder',
      };

      await apiService.updatePlanStatus(planId, nextStatus, roleMap[nextStatus]);
      await refreshAllData();
    }
  };

  // Handlers for Deliberation Actions
  const handleCreateAgenda = async () => {
    const spec = specs.length > 0 ? specs[0].id : 'SPEC-CONDUIT-001';
    await apiService.createDeliberationAgenda(
      spec,
      'Deliberation Round: WRP Kernel Replay Optimization',
      'planner'
    );
    await refreshAllData();
  };

  const handleVoteAgenda = async (
    agendaId: string,
    agentId: string,
    vote: 'APPROVE' | 'REJECT' | 'NEUTRAL',
    comments: string,
    feasibilityScore: number
  ) => {
    await apiService.addDeliberationVote(
      agendaId,
      agentId,
      vote,
      comments,
      feasibilityScore
    );
    await refreshAllData();
  };

  const handlePromoteAgendaToPlan = async (agendaId: string) => {
    await apiService.promoteAgendaToPlan(agendaId);
    await refreshAllData();
    setActiveTab('kanban_boards');
  };

  return (
    <div
      data-theme={theme}
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        theme === 'light'
          ? 'bg-slate-50 text-slate-900 selection:bg-blue-500 selection:text-white'
          : theme === 'steel'
          ? 'bg-[#0b1329] text-slate-100 selection:bg-cyan-500 selection:text-slate-950'
          : 'bg-[#0c0c0e] text-zinc-100 selection:bg-blue-500 selection:text-white'
      }`}
    >
      {/* Top Address Bar with Branding Box */}
      <AddressBar
        currentPath={currentPath}
        onNavigate={handleNavigatePath}
        status={status}
        isMockMode={isMockMode}
        onToggleMockMode={handleToggleMockMode}
        onOpenIntegrationGuide={() => setIsIntegrationGuideOpen(true)}
        onRefresh={refreshAllData}
        onOpenSearch={() => setIsIntegrationGuideOpen(true)}
        theme={theme}
        onThemeChange={handleThemeChange}
      />

      {/* Main Body: Sidebar + Active View Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          counts={{
            harvests: harvests.length,
            candidates: candidates.length,
            plans: plans.length,
            agendas: agendas.length,
            workRequests: workRequests.length,
          }}
        />

        {/* Workspace Surface Area */}
        <main className="flex-1 overflow-y-auto bg-zinc-950">
          {activeTab === 'dashboard' && (
            <MainDashboard
              plans={plans}
              workRequests={workRequests}
              modelChains={modelChains}
              status={status}
              onNavigateTab={handleSelectTab}
              onSelectPlan={(planId) => {
                const target = plans.find((p) => p.id === planId);
                if (target) setSelectedPlanForDrawer(target);
              }}
            />
          )}

          {activeTab === 'artifact_pipeline' && (
            <ArtifactPipeline
              harvests={harvests}
              candidates={candidates}
              intents={intents}
              requirements={requirements}
              specs={specs}
              onAddHarvestClick={() => setIsNewHarvestOpen(true)}
              onExtractCandidates={handleExtractCandidates}
              onPromoteCandidate={handlePromoteCandidate}
              onPromoteIntent={handlePromoteIntent}
              onCanonicalizeReq={handleCanonicalizeReq}
              onViewRawHarvest={(harvest) => setSelectedHarvestForDrawer(harvest)}
            />
          )}

          {activeTab === 'kanban_boards' && (
            <ProcessKanban
              plans={plans}
              harvests={harvests}
              candidates={candidates}
              intents={intents}
              requirements={requirements}
              specs={specs}
              onSelectPlan={(plan) => setSelectedPlanForDrawer(plan)}
              onAdvancePlanStatus={handleAdvancePlanStatus}
              onProposeNewPlan={() => setIsNewPlanOpen(true)}
            />
          )}

          {activeTab === 'deliberation' && (
            <DeliberationSurface
              agendas={agendas}
              onCreateAgenda={handleCreateAgenda}
              onVote={handleVoteAgenda}
              onPromoteToPlan={handlePromoteAgendaToPlan}
            />
          )}

          {activeTab === 'architecture' && <HierarchicalTree nodes={systemNodes} />}

          {activeTab === 'execution_authority' && (
            <ReceiptsAuditLog workRequests={workRequests} kernelDeltas={kernelDeltas} />
          )}

          {activeTab === 'model_chain' && (
            <ModelChainControl
              modelChains={modelChains}
              onUpdateChain={async (cfg) => {
                await apiService.updateModelChain(cfg);
                await refreshAllData();
              }}
            />
          )}
        </main>
      </div>

      {/* Global Modals & Detail Slide-Over Drawers */}
      <IntegrationModal
        isOpen={isIntegrationGuideOpen}
        onClose={() => setIsIntegrationGuideOpen(false)}
      />

      <NewHarvestModal
        isOpen={isNewHarvestOpen}
        onClose={() => setIsNewHarvestOpen(false)}
        onSubmit={handleIngestHarvest}
      />

      <NewPlanModal
        isOpen={isNewPlanOpen}
        onClose={() => setIsNewPlanOpen(false)}
        onSubmit={handleProposeNewPlan}
      />

      <DetailDrawer
        plan={selectedPlanForDrawer}
        harvest={selectedHarvestForDrawer}
        onClose={() => {
          setSelectedPlanForDrawer(null);
          setSelectedHarvestForDrawer(null);
        }}
      />
    </div>
  );
}
