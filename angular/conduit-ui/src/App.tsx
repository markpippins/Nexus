import React, { useState, useEffect } from 'react';
import { AddressBar, AppTheme } from './components/layout/AddressBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainDashboard } from './components/dashboard/MainDashboard';

// REST Spec Views
import { DeltaIngestionView } from './components/delta/DeltaIngestionView';
import { StateInspectionView } from './components/state/StateInspectionView';
import { ReplayEngineView } from './components/replay/ReplayEngineView';
import { ReceiptsLedgerView } from './components/receipts/ReceiptsLedgerView';
import { AgentSessionsView } from './components/sessions/AgentSessionsView';
import { CircuitBreakerView } from './components/breaker/CircuitBreakerView';
import { AdminCatalogView } from './components/admin/AdminCatalogView';

// Legacy Views (for backward compatibility)
import { ProcessKanban } from './components/kanban/ProcessKanban';
import { DeliberationSurface } from './components/deliberation/DeliberationSurface';
import { ModelChainControl } from './components/modelchain/ModelChainControl';

import { IntegrationModal } from './components/modals/IntegrationModal';
import { NewHarvestModal } from './components/modals/NewHarvestModal';
import { NewPlanModal } from './components/modals/NewPlanModal';
import { DetailDrawer } from './components/modals/DetailDrawer';

import { apiService } from './services/apiService';
import {
  ImplementationPlan,
  WorkRequestDCO,
  ModelChainConfig,
  SystemStatus,
  HTMLHarvest,
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
  const [status, setStatus] = useState<SystemStatus>({
    pgConnected: true,
    pgDsn: 'postgresql://nexus_admin:***@postgres.internal.nexus:5432/nexus',
    pgSchema: 'conduit',
    wrpKernelActive: true,
    wrpKernelUrl: 'http://localhost:3103',
    mcpServerUrl: 'http://localhost:3100',
    activeLeasesCount: 2,
    circuitBreakerTripped: false,
    lastSyncTimestamp: new Date().toISOString(),
  });

  const [isMockMode, setIsMockMode] = useState<boolean>(apiService.isMockMode());
  const [receiptsCount, setReceiptsCount] = useState<number>(0);
  const [sessionsCount, setSessionsCount] = useState<number>(0);
  const [identitiesCount, setIdentitiesCount] = useState<number>(0);
  const [lineageEventsCount, setLineageEventsCount] = useState<number>(0);

  const [plans, setPlans] = useState<ImplementationPlan[]>([]);
  const [workRequests, setWorkRequests] = useState<WorkRequestDCO[]>([]);
  const [modelChains, setModelChains] = useState<ModelChainConfig[]>([]);

  // Modals & Drawers
  const [isIntegrationGuideOpen, setIsIntegrationGuideOpen] = useState(false);
  const [isNewHarvestOpen, setIsNewHarvestOpen] = useState(false);
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [selectedPlanForDrawer, setSelectedPlanForDrawer] = useState<ImplementationPlan | null>(null);
  const [selectedHarvestForDrawer, setSelectedHarvestForDrawer] = useState<HTMLHarvest | null>(null);

  // Sync data from API Service
  const refreshAllData = async () => {
    try {
      const st = await apiService.getSystemStatus();
      setStatus(st);

      const [stateSummary, sessions, identities, lineage, mc] = await Promise.all([
        apiService.getStateSummary(),
        apiService.getSessions(),
        apiService.getAdminIdentities(),
        apiService.getLineageEvents(),
        apiService.getModelChains(),
      ]);

      setReceiptsCount(stateSummary.receipt_count);
      setSessionsCount(sessions.length);
      setIdentitiesCount(identities.total);
      setLineageEventsCount(lineage.count);
      setModelChains(mc);

      // Create dummy plans for legacy kanban view compatibility
      const dummyPlans: ImplementationPlan[] = [
        {
          id: 'plan_0053',
          ticketId: 'TCK-2026-0053',
          title: 'Plan 0053 — Auth Module',
          description: 'OAuth2 / OIDC authentication flow & RBAC middleware',
          status: 'ACTIVE',
          currentRole: 'planner',
          modelChain: ['gemini-2.5-pro', 'claude-3-5-sonnet'],
          activeModel: 'gemini-2.5-pro',
          costUsd: 1.25,
          tokenCount: 45000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          retryAttempts: 0,
          receipts: [],
        },
        {
          id: 'plan_0054',
          ticketId: 'TCK-2026-0054',
          title: 'Plan 0054 — Storage Engine',
          description: 'PostgreSQL & Drizzle schema migration for WRP Kernel',
          status: 'PLANNING',
          currentRole: 'builder',
          modelChain: ['claude-3-5-sonnet'],
          activeModel: 'claude-3-5-sonnet',
          costUsd: 3.5,
          tokenCount: 92000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          retryAttempts: 1,
          receipts: [],
        },
      ];
      setPlans(dummyPlans);

      const dummyWRs: WorkRequestDCO[] = [
        {
          id: 'WR-001',
          planId: 'plan_0053',
          leaseOwnerPid: 'sess-1001',
          attemptStatus: 'IN_PROGRESS',
          leaseExpiresAt: new Date(Date.now() + 600000).toISOString(),
          promptSha256: 'a1b2c3d4...',
          costLimitUsd: 5.0,
        },
      ];
      setWorkRequests(dummyWRs);
    } catch (e) {
      console.error('Data refresh error', e);
    }
  };

  // On mount, check if the server is in live mode (CONDUIT_LIVE_MODE=true).
  // If so, disable mock so the client fetches real data from proxied backends.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const isLive = await apiService.initializeMode();
      if (!cancelled) {
        setIsMockMode(!isLive);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []); // run once on mount

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
            receipts: receiptsCount,
            sessions: sessionsCount,
            identities: identitiesCount,
            events: lineageEventsCount,
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

          {activeTab === 'delta_ingestion' && <DeltaIngestionView />}

          {activeTab === 'state_inspection' && <StateInspectionView />}

          {activeTab === 'replay_engine' && <ReplayEngineView />}

          {activeTab === 'receipts_ledger' && <ReceiptsLedgerView />}

          {activeTab === 'agent_sessions' && <AgentSessionsView />}

          {activeTab === 'circuit_breaker' && <CircuitBreakerView />}

          {activeTab === 'admin_catalog' && <AdminCatalogView />}

          {/* Legacy Tab Fallbacks */}
          {activeTab === 'kanban_boards' && (
            <ProcessKanban
              plans={plans}
              harvests={[]}
              candidates={[]}
              intents={[]}
              requirements={[]}
              specs={[]}
              onSelectPlan={(plan) => setSelectedPlanForDrawer(plan)}
              onAdvancePlanStatus={() => {}}
              onProposeNewPlan={() => setIsNewPlanOpen(true)}
            />
          )}

          {activeTab === 'deliberation' && (
            <DeliberationSurface
              agendas={[]}
              onCreateAgenda={() => {}}
              onVote={() => {}}
              onPromoteToPlan={() => {}}
            />
          )}

          {activeTab === 'model_chain' && (
            <ModelChainControl
              modelChains={modelChains}
              onUpdateChain={async () => {
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
        onSubmit={async () => {}}
      />

      <NewPlanModal
        isOpen={isNewPlanOpen}
        onClose={() => setIsNewPlanOpen(false)}
        onSubmit={(newTitle, newDesc) => {
          const newTicketId = `WRP-${Math.floor(100 + Math.random() * 900)}`;
          const newPlanId = `plan_${String(plans.length + 54).padStart(4, '0')}`;
          const newPlanObj: ImplementationPlan = {
            id: newPlanId,
            ticketId: newTicketId,
            title: newTitle,
            description: newDesc,
            currentRole: 'planner',
            modelChain: ['gemini-2.5-pro', 'gemini-2.5-flash'],
            activeModel: 'gemini-2.5-pro',
            status: 'ACTIVE',
            costUsd: 0.12,
            tokenCount: 45000,
            retryAttempts: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            receipts: [
              {
                id: `rcp_gen_${Date.now().toString().slice(-6)}`,
                ticketId: newTicketId,
                receiptType: 'PROPOSED',
                issuedAt: new Date().toISOString(),
                payload: { action: 'Plan Proposed via Template Modal', title: newTitle },
                hash: `0x${Math.random().toString(16).substring(2, 14)}`,
              },
            ],
          };
          setPlans((prev) => [newPlanObj, ...prev]);
        }}
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
