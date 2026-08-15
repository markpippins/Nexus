import { Component, ChangeDetectionStrategy, input, output, ViewEncapsulation, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageBoxService } from '../services/message-box.service.js';
import { LinkService } from '../services/link.service.js';
import { LinkEditorDialogComponent } from '../components/link-editor-dialog/link-editor-dialog.component.js';

export type ViewMode = 'file-explorer' | 'service-mesh' | 'conduit-ui' | 'duality' | 'plurality' | 'assembly' | 'nebula-rms' | 'peb-ui' | 'kernel-ui' | 'tackle-ui' | 'kanban' | 'cascade-ui' | 'execution-ui' | 'vision-ui' | 'wind-ui' | 'nebula-cp' | 'semantics-ui' | 'throttler-ui' | 'barbie' | 'monaco-judge' | 'conduit-legacy-ui' | 'data-explorer';

@Component({
  selector: 'app-bottom-bar',
  templateUrl: './bottom-bar.component.html',
  styleUrls: ['./bottom-bar.component.scss'],
  imports: [CommonModule, LinkEditorDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class BottomBarComponent {
  private mbox = inject(MessageBoxService);
  readonly linkService = inject(LinkService);

  /** Status text shown on the left side of the bar */
  statusInfo = input<string>('Ready');
  /** Selection count text shown next to status */
  statusCounts = input<string>('');
  /** Base URL for the image server (used for site button icons via substitution scheme) */
  imageBaseUrl = input<string | null>(null);

  /** Emitted when the AI config button is clicked */
  aiconfigClick = output<void>();

  /** Whether the link editor dialog is visible */
  showLinkEditor = signal(false);
  /** Whether the hamburger menu is open */
  menuOpen = signal(false);

  /** Reactive links from the API */
  readonly externalSites = computed(() => this.linkService.links());

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

  /** Toggle the hamburger menu */
  toggleMenu(): void {
    this.menuOpen.update(v => !v);
    if (this.menuOpen()) {
      setTimeout(() => {
        const handler = () => { this.menuOpen.set(false); document.removeEventListener('click', handler); };
        document.addEventListener('click', handler, { once: true });
      }, 0);
    }
  }

  /** Close the hamburger menu */
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Open the link editor dialog */
  openLinkEditor(): void {
    this.menuOpen.set(false);
    this.showLinkEditor.set(true);
  }

  /** Hide the image inside a button when it fails to load (image not found on server). */
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
