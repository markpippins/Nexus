import React, { useState, useEffect, useCallback } from 'react';
import { NavTab, ExecutionInlineHealth, StatusDistributionResponse, IntegrityScanResponse, ExecutorFleetSummary, ThemeMode } from './types';
import { executionApi } from './services/apiClient';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { ReadmeModal } from './components/ReadmeModal';
import { DashboardView } from './components/DashboardView';
import { IntegrityScanView } from './components/IntegrityScanView';
import { RequestsView } from './components/RequestsView';
import { LeasesView } from './components/LeasesView';
import { ReceiptsOriginView } from './components/ReceiptsOriginView';
import { ExecutorFleetView } from './components/ExecutorFleetView';
import { ApiDocsView } from './components/ApiDocsView';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);

  // Data states
  const [inlineHealth, setInlineHealth] = useState<ExecutionInlineHealth | null>(null);
  const [statusDist, setStatusDist] = useState<StatusDistributionResponse | null>(null);
  const [scanResult, setScanResult] = useState<IntegrityScanResponse | null>(null);
  const [fleetList, setFleetList] = useState<ExecutorFleetSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isReadmeOpen, setIsReadmeOpen] = useState(false);

  // Load overall system telemetry
  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [healthRes, distRes, scanRes, fleetRes] = await Promise.all([
        executionApi.getInlineHealth(),
        executionApi.getStatusDistribution(),
        executionApi.getIntegrityScan(),
        executionApi.getFleetByExecutor() as Promise<ExecutorFleetSummary[]>
      ]);
      setInlineHealth(healthRes);
      setStatusDist(distRes);
      setScanResult(scanRes);
      setFleetList(fleetRes);
    } catch (err) {
      console.error('Failed refreshing observability dataset:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  // Apply dark/light/steel class to root document element
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light', 'steel');
    document.documentElement.classList.add(theme);
  }, [theme]);

  // Select handlers
  const handleSelectRequest = (id: string) => {
    setSelectedRequestId(id);
    setCurrentTab('requests');
  };

  const handleSelectLease = (id: string) => {
    setSelectedLeaseId(id);
    setCurrentTab('leases');
  };

  // Derive active URL path for header addressbar
  const getActivePath = () => {
    switch (currentTab) {
      case 'dashboard':
        return '/health';
      case 'integrity-scan':
        return '/health/integrity-scan';
      case 'requests':
        return selectedRequestId ? `/requests/${selectedRequestId}/state` : '/requests';
      case 'leases':
        return selectedLeaseId ? `/leases/${selectedLeaseId}/lifecycle` : '/leases/stale';
      case 'attempts':
        return '/attempts/tree';
      case 'receipts-origin':
        return '/receipts/pipeline-origin';
      case 'fleet':
        return '/health/by-executor';
      case 'api-docs':
        return '/api/spec';
      default:
        return '/health';
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col bg-[#09090b] text-[#fafafa] font-sans overflow-hidden ${theme}`}>
      {/* Top Header & Branding Box */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        activePath={getActivePath()}
        theme={theme}
        setTheme={setTheme}
        inlineHealth={inlineHealth}
        onRefresh={refreshAllData}
        isRefreshing={isRefreshing}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenReadme={() => setIsReadmeOpen(true)}
      />

      {/* Main Container: Sidebar + Active View Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          inlineHealth={inlineHealth}
          scanResult={scanResult}
        />

        {/* Primary Workspace View */}
        <main className="flex-1 bg-[#09090b] overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              inlineHealth={inlineHealth}
              statusDist={statusDist}
              scanResult={scanResult}
              fleetList={fleetList}
              setCurrentTab={setCurrentTab}
              onSelectRequest={handleSelectRequest}
              onSelectLease={handleSelectLease}
            />
          )}

          {currentTab === 'integrity-scan' && (
            <IntegrityScanView
              scanResult={scanResult}
              onRefreshScan={refreshAllData}
              isScanning={isRefreshing}
              setCurrentTab={setCurrentTab}
              onSelectRequest={handleSelectRequest}
              onSelectLease={handleSelectLease}
            />
          )}

          {currentTab === 'requests' && (
            <RequestsView
              onSelectRequest={setSelectedRequestId}
              selectedRequestId={selectedRequestId}
              onClearSelectedRequest={() => setSelectedRequestId(null)}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'leases' && (
            <LeasesView
              onSelectLease={setSelectedLeaseId}
              selectedLeaseId={selectedLeaseId}
              onClearSelectedLease={() => setSelectedLeaseId(null)}
              onSelectRequest={handleSelectRequest}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'attempts' && (
            <RequestsView
              onSelectRequest={setSelectedRequestId}
              selectedRequestId={selectedRequestId || 'req_000001'}
              onClearSelectedRequest={() => setSelectedRequestId(null)}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'receipts-origin' && (
            <ReceiptsOriginView
              onSelectRequest={handleSelectRequest}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'fleet' && (
            <ExecutorFleetView
              onSelectRequest={handleSelectRequest}
              onSelectLease={handleSelectLease}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'api-docs' && (
            <ApiDocsView
              onOpenReadme={() => setIsReadmeOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Bento Grid Status Footer Bar */}
      <footer className="h-8 border-t border-[#27272a] bg-[#0c0c0e] px-4 flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            MODE: READ_ONLY_SERVICE
          </span>
          <span className="hidden md:inline text-zinc-600">|</span>
          <span className="hidden md:inline text-zinc-400">DB_HOST: PG_EXECUTION_MASTER</span>
          <span className="hidden sm:inline text-zinc-600">|</span>
          <span className="hidden sm:inline text-zinc-400">SEARCH_PATH: execution</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsReadmeOpen(true)} className="text-blue-400 hover:underline cursor-pointer">
            [ DOWNLOAD README ]
          </button>
          <button onClick={() => setCurrentTab('api-docs')} className="text-emerald-400 hover:underline cursor-pointer">
            [ REST API SPEC ]
          </button>
        </div>
      </footer>

      {/* Command Palette Modal (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={setCurrentTab}
        onSelectRequest={handleSelectRequest}
        onSelectLease={handleSelectLease}
      />

      {/* Integration Readme Modal */}
      <ReadmeModal
        isOpen={isReadmeOpen}
        onClose={() => setIsReadmeOpen(false)}
      />
    </div>
  );
}
