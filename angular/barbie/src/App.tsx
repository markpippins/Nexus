import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './components/ThemeContext';
import { Navbar } from './components/Navbar';
import { SidebarNav, ActiveTab } from './components/SidebarNav';
import { AggregatePlatformVisualizer } from './components/AggregatePlatformVisualizer';
import { ServicesTable } from './components/DataViews/ServicesTable';
import { ServersTable } from './components/DataViews/ServersTable';
import { DeploymentsTable } from './components/DataViews/DeploymentsTable';
import { SystemsTable } from './components/DataViews/SystemsTable';
import { FrameworksLibrariesTable } from './components/DataViews/FrameworksLibrariesTable';
import { LookupTablesView } from './components/DataViews/LookupTablesView';
import { DetailContextPanel } from './components/DetailContextPanel';
import { EntityModal } from './components/Modals/EntityModal';
import {
  PlatformAggregateState,
  EntitySelection,
  System,
  Service,
  Server,
  Deployment
} from './types';
import { registryApi } from './lib/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('aggregate');

  // API Mode State
  const [apiMode, setApiModeState] = useState<'live' | 'mock'>(registryApi.getApiMode());

  const handleApiModeChange = (mode: 'live' | 'mock') => {
    registryApi.setApiMode(mode);
    setApiModeState(mode);
  };

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSystemFilter, setSelectedSystemFilter] = useState('all');

  // Core Data State
  const [aggregateState, setAggregateState] = useState<PlatformAggregateState | null>(null);
  const [systemsList, setSystemsList] = useState<System[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [serversList, setServersList] = useState<Server[]>([]);
  const [deploymentsList, setDeploymentsList] = useState<Deployment[]>([]);

  // Selection & Telemetry Context Panel
  const [selectedEntity, setSelectedEntity] = useState<EntitySelection | null>(null);

  // Auto Refresh & Trigger
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(5000); // 5 seconds default
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Mobile navigation drawer toggle
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'service' | 'server' | 'deployment' | 'system' | 'link-service' | 'register-service'>('service');
  const [editingData, setEditingData] = useState<any>(null);

  // Fetch telemetry & aggregate state
  const fetchAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [agg, sysRes, svcRes, srvRes, depRes] = await Promise.all([
        registryApi.getPlatformAggregate(),
        registryApi.getSystems({ size: 100 }),
        registryApi.getServicesWithHosted(1000),
        registryApi.getServers({ size: 100 }),
        registryApi.getDeployments({ size: 100 })
      ]);

      setAggregateState(agg);
      setSystemsList(sysRes.data);
      setServicesList(svcRes.data);
      setServersList(srvRes.data);
      setDeploymentsList(depRes.data);
    } catch (err) {
      console.error('Failed refreshing platform telemetry:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial load and periodic polling
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData, refreshTrigger, apiMode]);

  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchAllData();
    }, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchAllData]);

  // Handle entity selection from graph, table, or list
  const handleSelectEntity = (entity: EntitySelection) => {
    setSelectedEntity(entity);
  };

  const handleOpenCreateModal = (type: 'service' | 'server' | 'deployment' | 'system' | 'link-service' | 'register-service') => {
    setModalType(type);
    setEditingData(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (data: any) => {
    if (data.hostname || data.ipAddress) {
      setModalType('server');
    } else if (data.systemId || data.endpoint) {
      setModalType('service');
    } else if (data.commitHash) {
      setModalType('deployment');
    } else {
      setModalType('system');
    }
    setEditingData(data);
    setIsModalOpen(true);
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] transition-colors duration-200">
        
        {/* Top Navbar */}
        <Navbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedSystemFilter={selectedSystemFilter}
          onSystemFilterChange={setSelectedSystemFilter}
          systemsList={systemsList}
          autoRefreshInterval={autoRefreshInterval}
          onAutoRefreshChange={setAutoRefreshInterval}
          onOpenRegisterModal={() => handleOpenCreateModal('register-service')}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          isRefreshing={isRefreshing}
          onManualRefresh={() => {
            fetchAllData();
            setRefreshTrigger(t => t + 1);
          }}
          activeView={activeTab}
          apiMode={apiMode}
          onApiModeChange={handleApiModeChange}
        />

        {/* Main Application Layout with Left Sidebar Navigation */}
        <div className="flex flex-1 min-h-[calc(100vh-65px)]">
          
          {/* Left Sidebar Navigation Component */}
          <SidebarNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            servicesCount={servicesList.length}
            serversCount={serversList.length}
            deploymentsCount={deploymentsList.length}
            systemsCount={systemsList.length}
            selectedSystemFilter={selectedSystemFilter}
            onSystemFilterChange={setSelectedSystemFilter}
            systemsList={systemsList}
            onOpenRegisterModal={() => handleOpenCreateModal('register-service')}
            isMobileOpen={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
            apiMode={apiMode}
            onApiModeChange={handleApiModeChange}
          />

          {/* Center Stage Main Content Area */}
          <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 space-y-6 overflow-x-hidden">
            {activeTab === 'aggregate' && (
              <AggregatePlatformVisualizer
                aggregateState={aggregateState}
                systems={systemsList}
                services={servicesList}
                servers={serversList}
                deployments={deploymentsList}
                selectedEntity={selectedEntity}
                onSelectEntity={handleSelectEntity}
                searchFilter={searchQuery}
              />
            )}

            {activeTab === 'services' && (
              <ServicesTable
                onSelectService={(svc) => handleSelectEntity({ type: 'service', id: svc.id, name: svc.name, data: svc })}
                onOpenCreateModal={() => handleOpenCreateModal('service')}
                onOpenEditModal={(svc) => handleOpenEditModal(svc)}
                searchQuery={searchQuery}
                selectedSystemFilter={selectedSystemFilter}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'servers' && (
              <ServersTable
                onSelectServer={(srv) => handleSelectEntity({ type: 'server', id: srv.id, name: srv.name, data: srv })}
                onOpenCreateModal={() => handleOpenCreateModal('server')}
                onOpenEditModal={(srv) => handleOpenEditModal(srv)}
                searchQuery={searchQuery}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'deployments' && (
              <DeploymentsTable
                onSelectDeployment={(dep) => handleSelectEntity({ type: 'deployment', id: dep.id, name: dep.serviceName, data: dep })}
                onOpenCreateModal={() => handleOpenCreateModal('deployment')}
                onOpenEditModal={(dep) => handleOpenEditModal(dep)}
                searchQuery={searchQuery}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'systems' && (
              <SystemsTable
                onSelectSystem={(sys) => handleSelectEntity({ type: 'system', id: sys.id, name: sys.name, data: sys })}
                onOpenCreateModal={() => handleOpenCreateModal('system')}
                onOpenEditModal={(sys) => handleOpenEditModal(sys)}
                onOpenLinkModal={(sys) => {
                  setEditingData({ systemName: sys.name, serviceName: servicesList[0]?.name });
                  handleOpenCreateModal('link-service');
                }}
                searchQuery={searchQuery}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'frameworks-libraries' && (
              <FrameworksLibrariesTable searchQuery={searchQuery} refreshTrigger={refreshTrigger} />
            )}

            {activeTab === 'lookup-tables' && (
              <LookupTablesView refreshTrigger={refreshTrigger} />
            )}
          </main>
        </div>

        {/* Footer Status Bar with Live/Mock Mode Indicator */}
        <footer className="mt-8 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-[11px] text-[var(--text-secondary)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 font-mono">
              <span className={`flex items-center gap-1.5 font-semibold ${
                registryApi.getApiMode() === 'live' ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  registryApi.getApiMode() === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}></span>
                {registryApi.getApiMode() === 'live' ? 'Live REST API Online' : 'Client Mock Engine Active'}
              </span>
              <span>•</span>
              <span>Build v1.8-stable</span>
              <span>•</span>
              <span>Management Console</span>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span>ENDPOINT: {registryApi.getApiBaseUrl()}</span>
              <span>MODE: {registryApi.getApiMode().toUpperCase()}</span>
            </div>
          </div>
        </footer>

        {/* Right Detail Context Panel (Slides in on Entity Selection) */}
        {selectedEntity && (
          <DetailContextPanel
            selection={selectedEntity}
            onClose={() => setSelectedEntity(null)}
            onEntityUpdated={() => {
              fetchAllData();
              setRefreshTrigger(t => t + 1);
            }}
            onOpenEditModal={(entity) => handleOpenEditModal(entity.data || entity)}
          />
        )}

        {/* Create / Edit Entity Modal */}
        <EntityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          modalType={modalType}
          editingData={editingData}
          systemsList={systemsList}
          servicesList={servicesList}
          serversList={serversList}
          onSuccess={() => {
            fetchAllData();
            setRefreshTrigger(t => t + 1);
          }}
        />
      </div>
    </ThemeProvider>
  );
}
