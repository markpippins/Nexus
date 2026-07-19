import { Component, ChangeDetectionStrategy, input, output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EXTERNAL_SITES } from '../components/external-site-selector/external-site-selector.component.js';
import { MessageBoxService } from '../services/message-box.service.js';

export type ViewMode = 'file-explorer' | 'service-mesh' | 'conduit-ui' | 'duality' | 'plurality' | 'assembly' | 'nebula-rms' | 'tackle-ui' | 'kanban' | 'cascade-ui';

@Component({
  selector: 'app-bottom-bar',
  templateUrl: './bottom-bar.component.html',
  styleUrls: ['./bottom-bar.component.scss'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class BottomBarComponent {
  private mbox = inject(MessageBoxService);

  /** Status text shown on the left side of the bar */
  statusInfo = input<string>('Ready');
  /** Selection count text shown next to status */
  statusCounts = input<string>('');
  /** Base URL for the image server (used for site button icons via substitution scheme) */
  imageBaseUrl = input<string | null>(null);

  /** Emitted when the AI config button is clicked */
  aiconfigClick = output<void>();

  readonly externalSites = EXTERNAL_SITES;

  openExternal(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Open a new chat messagebox instance */
  openNewChat(): void {
    this.mbox.open('Operator');
  }

  /** Emit aiconfigClick event */
  onAiconfigClick(): void {
    this.aiconfigClick.emit();
  }

  /** Build an image URL for an external site using the same substitution scheme as the treeview. */
  getSiteIconUrl(shortName: string): string | null {
    const base = this.imageBaseUrl();
    if (!base) return null;
    // Normalize the same way ImageService.getIconUrl does: lowercase, spaces→dashes
    const normalized = shortName.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
    return `${base}/${encodeURIComponent(normalized)}`;
  }

  /** Hide the image inside a button when it fails to load (image not found on server). */
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
