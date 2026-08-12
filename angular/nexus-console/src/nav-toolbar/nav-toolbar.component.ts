import { Component, ChangeDetectionStrategy, input, output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewMode } from '../bottom-bar/bottom-bar.component.js';
import { OrbComponent } from '../orb/orb.component.js';

export interface NavItem {
  key: ViewMode;
  label: string;
  title: string;
  /** Heroicon-style SVG path for the icon button */
  iconPath: string;
}

export type NavItemOrSeparator =
  | { type: 'item'; key: ViewMode; label: string; title: string; iconPath: string }
  | { type: 'separator' };

export const NAV_ITEMS: NavItemOrSeparator[] = [
  // ── Primary tools ─────────────────────────────────────────────
  {
    type: 'item', key: 'file-explorer',
    label: 'Throttler',
    title: 'Throttler',
    iconPath: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
  },
  {
    type: 'item', key: 'service-mesh',
    label: 'Service Mesh',
    title: 'Service Mesh',
    iconPath: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
  },
  {
    type: 'item', key: 'nebula-rms',
    label: 'Nebula',
    title: 'Nebula',
    iconPath: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z',
  },
  {
    type: 'item', key: 'kanban',
    label: 'Operations',
    title: 'Operations',
    iconPath: 'M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184',
  },
  {
    type: 'item', key: 'conduit-legacy-ui',
    label: 'Conduit Legacy UI',
    title: 'Conduit Legacy UI',
    iconPath: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182',
  },
  {
    type: 'item', key: 'cascade-ui',
    label: 'Cascade',
    title: 'Cascade Event Monitor',
    iconPath: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605',
  },
  // ── Separator ─────────────────────────────────────────────────
  { type: 'separator' },

  // ── Control planes & dashboards ───────────────────────────────
  {
    type: 'item', key: 'throttler-ui',
    label: 'Throttler',
    title: 'Throttler File Manager',
    iconPath: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  },
  {
    type: 'item', key: 'nebula-cp',
    label: 'Nebula Control Plane',
    title: 'Nebula Control Plane',
    iconPath: 'M9.75 17.25v-.75a2.25 2.25 0 012.25-2.25h.75a2.25 2.25 0 012.25 2.25v.75M12 12a3 3 0 100-6 3 3 0 000 6zM3 5.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 5.25v9a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 14.25v-9z',
  },
  {
    type: 'item', key: 'semantics-ui',
    label: 'Semantics UI',
    title: 'Semantics Database Explorer',
    // Heroicons v2 'book-open' icon — a stylised open book.
    iconPath: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  },
  {
    type: 'item', key: 'barbie',
    label: 'Barbie',
    title: 'Platform Operations Dashboard',
    iconPath: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  },
  {
    type: 'item', key: 'wind-ui',
    label: 'Wind Dashboard',
    title: 'Wind Dashboard',
    iconPath: 'M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2',
  },
  {
    type: 'item', key: 'conduit-ui',
    label: 'Conduit',
    title: 'Conduit Control Plane',
    iconPath: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182',
  },
  {
    type: 'item', key: 'execution-ui',
    label: 'Execution Observability',
    title: 'Execution Observability',
    iconPath: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.216-.456a1.125 1.125 0 011.114 1.114l-.456 1.216c-.133.355-.073.751.124 1.075.044.073.085.146.127.22.184.332.496.582.87.645l1.28-.213c.542-.09.94.56.94 1.11v2.593c0 .55-.398 1.02-.94 1.11l-1.281.213c-.374.063-.686.313-.87.645a1.122 1.122 0 00-.127.22c-.196.324-.257.72-.124 1.075l.456 1.216a1.125 1.125 0 01-1.114 1.114l-1.216-.456c-.355-.133-.751-.073-1.075.124-.073.044-.146.085-.22.127-.332.184-.582.496-.645.87l-.213 1.28c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a1.114 1.114 0 00-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.216.456a1.125 1.125 0 01-1.114-1.114l.456-1.216c.133-.355.073-.751-.124-1.075a1.114 1.114 0 00-.127-.22c-.184-.332-.496-.582-.87-.645l-1.28.213c-.542.09-.94-.56-.94-1.11V9.593c0-.55.398-1.02.94-1.11l1.281-.213c.374-.063.686-.313.87-.645a1.13 1.13 0 00.127-.22c.196-.324.257-.72.124-1.075l-.456-1.216a1.125 1.125 0 011.114-1.114l1.216.456c.355.133.751.073 1.075-.124a1.114 1.114 0 00.22-.127c.332-.184.582-.496.645-.87l.213-1.28zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z',
  },
  {
    type: 'item', key: 'peb-ui',
    label: 'Observability',
    title: 'Observability',
    iconPath: 'M12 4.5a1.5 1.5 0 00-1.5 1.5v10.628c-.3-.07-.618-.128-.94-.128a3.002 3.002 0 00-2.999 3h10.878a3.002 3.002 0 00-2.999-3c-.322 0-.64.058-.94.128V6a1.5 1.5 0 00-1.5-1.5zM18.75 18v1.5H5.25V18h13.5zM12 10.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm4.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  },
  {
    type: 'item', key: 'vision-ui',
    label: 'Vision Control Plane',
    title: 'Vision Control Plane',
    iconPath: 'M9 3v1.5M15 3v1.5M3 9h1.5M3 15h1.5M19.5 9H21M19.5 15H21M6 6h12a3 3 0 013 3v6a3 3 0 01-3 3H6a3 3 0 01-3-3V9a3 3 0 013-3zm3 3h6v6H9V9z',
  },
  {
    type: 'item', key: 'kernel-ui',
    label: 'Semantic Kernel UI',
    title: 'Semantic Kernel UI',
    iconPath: 'M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3zM12 8v8M8 12h8',
  },

  // ── Separator ─────────────────────────────────────────────────
  { type: 'separator' },

  // ── Database tools ────────────────────────────────────────────
  {
    type: 'item', key: 'data-explorer',
    label: 'Data Explorer',
    title: 'Data Explorer - SQL database tool',
    iconPath: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75',
  },

  // ── Separator ─────────────────────────────────────────────────
  { type: 'separator' },

  // ── Cognitive & AI tools ──────────────────────────────────────
  {
    type: 'item', key: 'tackle-ui',
    label: 'Tackle',
    title: 'Tackle',
    iconPath: 'M8 10h.01M16 10h.01M9 20h6M12 16v4M8 6h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2Z',
  },
  {
    type: 'item', key: 'duality',
    label: 'Duality',
    title: 'Duality',
    iconPath: 'M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v.75c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-.75z',
  },
  {
    type: 'item', key: 'plurality',
    label: 'Plurality',
    title: 'Plurality',
    iconPath: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  },

  // ── Separator ─────────────────────────────────────────────────
  { type: 'separator' },

  // ── Code & editing ────────────────────────────────────────────
  {
    type: 'item', key: 'monaco-judge',
    label: 'Monaco Judge',
    title: 'Monaco Judge',
    iconPath: 'M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z',
  },

  // ── Separator ────────────────────────────────────────────────
  { type: 'separator' },

  // ── Community ─────────────────────────────────────────────────
  {
    type: 'item', key: 'assembly',
    label: 'Assembly',
    title: 'Assembly',
    iconPath: 'M2.25 12.7593C2.25 14.3604 3.37341 15.754 4.95746 15.987C6.04357 16.1467 7.14151 16.27 8.25 16.3556V21L12.326 16.924C12.6017 16.6483 12.9738 16.4919 13.3635 16.481C15.2869 16.4274 17.1821 16.2606 19.0425 15.9871C20.6266 15.7542 21.75 14.3606 21.75 12.7595V6.74056C21.75 5.13946 20.6266 3.74583 19.0425 3.51293C16.744 3.17501 14.3926 3 12.0003 3C9.60776 3 7.25612 3.17504 4.95747 3.51302C3.37342 3.74593 2.25 5.13956 2.25 6.74064V12.7593Z',
  },
];

@Component({
  selector: 'app-nav-toolbar',
  templateUrl: './nav-toolbar.component.html',
  styleUrls: ['./nav-toolbar.component.scss'],
  imports: [CommonModule, OrbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class NavToolbarComponent {
  /** Current view mode to highlight the active button */
  viewMode = input<ViewMode>('file-explorer');
  /** Emitted when the user clicks a navigation button */
  viewModeChange = output<ViewMode>();

  /** Whether the nav toolbar is collapsed */
  collapsed = input(false);
  /** Emitted when the collapse/expand toggle button is clicked */
  collapseToggled = output<void>();

  readonly navItems = NAV_ITEMS;

  onCollapseToggle(): void {
    this.collapseToggled.emit();
  }
}
