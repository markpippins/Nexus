import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ViewMode = 'file-explorer' | 'service-mesh' | 'conduit-ui' | 'duality' | 'plurality' | 'nebula-rms';

@Component({
  selector: 'app-view-mode-toolbar',
  templateUrl: './view-mode-toolbar.component.html',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewModeToolbarComponent {
  viewMode = input<ViewMode>('file-explorer');
  viewModeChange = output<ViewMode>();
}
