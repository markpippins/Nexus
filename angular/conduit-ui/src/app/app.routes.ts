import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/wr-dashboard/wr-dashboard.component').then(
        (m) => m.WrDashboardComponent,
      ),
  },
  {
    path: 'overview',
    loadComponent: () =>
      import('./components/overview-dashboard/overview-dashboard.component').then(
        (m) => m.OverviewDashboardComponent,
      ),
  },
  {
    path: 'kanban',
    loadComponent: () =>
      import('./components/kanban-board/kanban-board.component').then(
        (m) => m.KanbanBoardComponent,
      ),
  },
  {
    path: 'archive',
    loadComponent: () =>
      import('./components/archive-browser/archive-browser.component').then(
        (m) => m.ArchiveBrowserComponent,
      ),
  },
  {
    path: 'inspections',
    loadComponent: () =>
      import('./components/inspection-dashboard/inspection-dashboard.component').then(
        (m) => m.InspectionDashboardComponent,
      ),
  },
  {
    path: 'prompts',
    loadComponent: () =>
      import('./components/prompt-catalog/prompt-catalog.component').then(
        (m) => m.PromptCatalogComponent,
      ),
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./components/analytics-dashboard/analytics-dashboard.component').then(
        (m) => m.AnalyticsDashboardComponent,
      ),
  },
  {
    path: 'changes',
    loadComponent: () =>
      import('./components/changes-view/changes-view.component').then(
        (m) => m.ChangesViewComponent,
      ),
  },
  {
    path: 'graph',
    loadComponent: () =>
      import('./components/dependency-graph/dependency-graph.component').then(
        (m) => m.DependencyGraphComponent,
      ),
  },
  {
    path: 'sessions',
    loadComponent: () =>
      import('./components/sessions/sessions.component').then(
        (m) => m.SessionsComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
