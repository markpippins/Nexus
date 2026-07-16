import { Component, ChangeDetectionStrategy, input, output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewMode } from '../bottom-bar/bottom-bar.component.js';
import { OrbComponent } from '../orb/orb.component.js';
import { Theme } from '../services/ui-preferences.service.js';

export interface NavItem {
  key: ViewMode;
  label: string;
  title: string;
  /** Heroicon-style SVG path for the icon button */
  iconPath: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'file-explorer',
    label: 'Throttler',
    title: 'Throttler',
    iconPath: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
  },
  {
    key: 'nebula-rms',
    label: 'Nebula',
    title: 'Nebula',
    iconPath: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z',
  },
  {
    key: 'conduit-ui',
    label: 'Conduit',
    title: 'Conduit',
    iconPath: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182',
  },
  {
    key: 'service-mesh',
    label: 'Service Mesh',
    title: 'Service Mesh',
    iconPath: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
  },
  {
    key: 'duality',
    label: 'Duality',
    title: 'Duality',
    iconPath: 'M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v.75c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-.75z',
  },
  {
    key: 'plurality',
    label: 'Plurality',
    title: 'Plurality',
    iconPath: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  },
  {
    key: 'assembly',
    label: 'Assembly',
    title: 'Assembly',
    iconPath: 'M8.25 3v1.5a4.5 4.5 0 004.5 4.5h3a.75.75 0 01.75.75v1.5a4.5 4.5 0 014.5 4.5h-1.5a3 3 0 00-3 3v1.5a.75.75 0 01-.75.75h-1.5a4.5 4.5 0 00-4.5-4.5H6a.75.75 0 01-.75-.75v-1.5A4.5 4.5 0 008.25 3z',
  },
  {
    key: 'kanban',
    label: 'Operations',
    title: 'Operations',
    iconPath: 'M5 5a2 2 0 00-2 2v8a2 2 0 002 2h1a2 2 0 002-2V7a2 2 0 00-2-2H5zm5 4a2 2 0 012-2h1a2 2 0 012 2v6a2 2 0 01-2 2h-1a2 2 0 01-2-2V9zm5-2a2 2 0 00-2 2v4a2 2 0 002 2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1z',
  },
  {
    key: 'cascade-ui',
    label: 'Cascade',
    title: 'Cascade Event Monitor',
    iconPath: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605',
  },
  {
    key: 'tackle-ui',
    label: 'Tackle',
    title: 'Tackle',
    iconPath: 'M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z',
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
  /** Current theme for the toggle button icon */
  theme = input<Theme>('theme-steel');
  /** Emitted when the user clicks a navigation button */
  viewModeChange = output<ViewMode>();
  /** Emitted when the user clicks the theme toggle */
  themeChange = output<Theme>();

  readonly navItems = NAV_ITEMS;
  readonly THEME_CYCLE: Theme[] = ['theme-steel', 'theme-light', 'theme-dark'];

  toggleTheme(): void {
    const current = this.theme();
    const idx = this.THEME_CYCLE.indexOf(current);
    const next = this.THEME_CYCLE[(idx + 1) % this.THEME_CYCLE.length];
    this.themeChange.emit(next);
  }
}
