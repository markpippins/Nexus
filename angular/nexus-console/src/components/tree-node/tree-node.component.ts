import { Component, ChangeDetectionStrategy, input, output, signal, computed, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileSystemNode } from '../../models/file-system.model.js';
import { ImageService } from '../../services/image.service.js';
import { DragDropService, DragDropPayload } from '../../services/drag-drop.service.js';
import { NewBookmark } from '../../models/bookmark.model.js';
import { FileSystemProvider } from '../../services/file-system-provider.js';
import { FolderPropertiesService } from '../../services/folder-properties.service.js';

@Component({
  selector: 'app-tree-node',
  standalone: true,
  templateUrl: './tree-node.component.html',
  imports: [CommonModule, TreeNodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeNodeComponent {
  private dragDropService = inject(DragDropService);
  private folderPropertiesService = inject(FolderPropertiesService);

  node = input.required<FileSystemNode>();
  path = input.required<string[]>();
  currentPath = input.required<string[]>();
  level = input(0);
  expansionCommand = input<{ command: 'expand' | 'collapse', id: number } | null>();
  expandedPaths = input<ReadonlySet<string>>(new Set());
  getImageService = input.required<(path: string[]) => ImageService>();
  getProvider = input.required<(path: string[]) => FileSystemProvider>();

  pathChange = output<string[]>();
  loadChildren = output<string[]>();
  itemsDropped = output<{ destPath: string[]; payload: DragDropPayload }>();
  bookmarkDropped = output<{ bookmark: NewBookmark, destPath: string[] }>();
  contextMenuRequest = output<{ event: MouseEvent; path: string[]; node: FileSystemNode }>();
  toggleExpand = output<{ path: string[]; expanded: boolean }>();

  /** Derive expansion state from the externally-owned expandedPaths set so it survives tree rebuilds */
  isExpanded = computed(() => this.expandedPaths()?.has(this.path().join('/')) ?? false);
  imageHasError = signal(false);
  imageIsLoaded = signal(false);
  isDragOver = signal(false);

  properties = computed(() => this.folderPropertiesService.getProperties(this.path()));

  iconUrl = computed(() => {
    const service = this.getImageService()(this.path());
    const node = this.node();
    const props = this.properties();

    if (node.isServerRoot) {
      return service.getIconUrl({ ...node, name: 'cloud' });
    }
    if (node.metadata?.['mountId'] && !node.metadata?.['isMountChild']) {
      return service.getIconUrl(node, 'mount');
    }
    return service.getIconUrl(node, props?.imageName);
  });

  isSelected = computed(() => {
    const p1 = this.path().join('/');
    const p2 = this.currentPath().join('/');
    return p1 === p2;
  });

  isExpandable = computed(() => {
    return this.node().type === 'folder';
  });

  displayName = computed(() => {
    const props = this.properties();
    if (props?.displayName) {
      return props.displayName;
    }
    return this.node().name;
  });

  folderChildren = computed(() => {
    const children = this.node().children;
    if (!children) {
      return [];
    }

    const folderChildren = children.filter(c => c.type === 'folder');

    // Special sorting for children of the root "Home" node.
    // The Home node is the only one that directly contains server roots.
    if (folderChildren.some(c => c.isServerRoot)) {
      const localNodes = folderChildren.filter(item => !item.isServerRoot);
      const serverNodes = folderChildren.filter(item => item.isServerRoot);

      serverNodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      // Keep local nodes in their original order (Session first, then Host Server nodes)
      // or sort them if desired. For now, preserving order from app.component.ts
      return [...localNodes, ...serverNodes];
    }

    // Default alphabetical sort for all other nodes
    return folderChildren
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  });

  /** Tracks the last currentPath we auto-expanded for, so we only re-expand when the user
   *  navigates — not on every tree rebuild (which creates new component instances / path refs). */
  private lastAutoExpandedPath: string | null = null;

  constructor() {
    // Effect for auto-expanding ancestor of current path. Only fires when the currentPath
    // string actually changes — NOT on tree rebuilds that produce equivalent path arrays.
    // Without this guard, tree rebuilds (from loadFolderTree polling) would silently undo
    // user-initiated collapses of ancestor nodes.
    effect(() => {
      const currentStr = this.currentPath().join('/');
      const myPathStr = this.path().join('/');
      if (currentStr.startsWith(myPathStr) && currentStr !== myPathStr) {
        // Only auto-expand if this is a genuine navigation change, not a tree rebuild
        // that re-creates this component with the same currentPath.
        if (this.lastAutoExpandedPath !== currentStr) {
          this.lastAutoExpandedPath = currentStr;
          this.expandProgrammatically();
        }
      }
    });

    // Effect for handling expand/collapse-all commands. Emits toggleExpand to persist.
    effect(() => {
      const command = this.expansionCommand();
      if (!command) return;

      if (command.command === 'expand') {
        this.expandProgrammatically();
      } else if (command.command === 'collapse') {
        if (this.level() > 0) {
          this.collapse();
        }
      }
    });

    effect(() => {
      // When the iconUrl changes, we need to reset the loading indicators.
      this.iconUrl(); // Establish dependency on the computed signal
      this.imageIsLoaded.set(false);
      this.imageHasError.set(false);
    });

    // When the tree is completely rebuilt (e.g., after a gateway connection),
    // new component instances are created. If this node restores its expanded
    // state from expandedPaths but the new tree object lacks its children,
    // automatically re-fetch them so the tree doesn't appear collapsed.
    effect(() => {
      const node = this.node();
      if (this.isExpanded() && this.isExpandable() && !node.childrenLoaded) {
        if (!(node.isServerRoot && !node.connected)) {
          untracked(() => this.loadChildren.emit(this.path()));
        }
      }
    });

    // Ensure root node is expanded by default if not already in expandedPaths
    effect(() => {
      if (this.level() === 0) {
        const key = this.path().join('/');
        if (!this.expandedPaths()?.has(key)) {
          this.expandProgrammatically();
        }
      }
    });
  }

  // This method emits toggleExpand to persist state to the external set.
  // SAFE to be called from effects — it doesn't mutate local state.
  private expandProgrammatically(): void {
    const node = this.node();
    if (this.isExpandable() && !this.isExpanded()) {
      if (node.isServerRoot && !node.connected) {
        return;
      }
      // Emit to parent to update the external expandedPaths set
      this.toggleExpand.emit({ path: this.path(), expanded: true });

      // If we expand and children are not loaded, we must load them.
      if (!node.childrenLoaded) {
        this.loadChildren.emit(this.path());
      }
    }
  }

  private collapse(): void {
    if (this.isExpandable() && this.isExpanded()) {
      this.toggleExpand.emit({ path: this.path(), expanded: false });
    }
  }

  onToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    const node = this.node();
    if (!this.isExpandable()) return;
    if (node.isServerRoot && !node.connected) {
      return;
    }

    // Capture the state BEFORE toggling — isExpanded() will reflect the new state
    // after toggleExpand.emit() updates the external expandedPaths signal.
    const wasExpanded = this.isExpanded();
    const willExpand = !wasExpanded;

    this.toggleExpand.emit({ path: this.path(), expanded: willExpand });

    // Load children lazily when expanding a node whose children haven't been fetched.
    // (Previously this checked !this.isExpanded() which was already the post-toggle value,
    //  so children were never loaded on manual expand — only on auto-expand.)
    if (willExpand && !node.childrenLoaded) {
      this.loadChildren.emit(this.path());
    }
  }

  selectNode(): void {
    this.pathChange.emit(this.path());
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuRequest.emit({ event, path: this.path(), node: this.node() });
  }

  getChildPath(childNode: FileSystemNode): string[] {
    return [...this.path(), childNode.name];
  }

  onImageLoad(): void {
    this.imageIsLoaded.set(true);
  }

  onImageError(): void {
    this.imageHasError.set(true);
  }

  onDragOver(event: DragEvent): void {
    const payload = this.dragDropService.getPayload();
    if (!payload) return;

    if (payload.type === 'filesystem') {
      const { sourcePath, items } = payload.payload;
      if (items.some(item => this.path().join('/').startsWith([...sourcePath, item.name].join('/')))) {
        return;
      }
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = payload.type === 'filesystem' ? 'move' : 'copy';
    }
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const payload = this.dragDropService.getPayload();
    if (!payload) return;

    const destPath = this.path();

    if (payload.type === 'filesystem') {
      this.itemsDropped.emit({ destPath, payload });
    } else if (payload.type === 'bookmark') {
      this.bookmarkDropped.emit({ bookmark: payload.payload.data, destPath });
    }
  }

  onDragStart(event: DragEvent): void {
    const provider = this.getProvider()(this.path());

    const payload: DragDropPayload = {
      type: 'filesystem',
      payload: { sourceProvider: provider, sourcePath: this.path().slice(0, -1), items: [this.node()] }
    };
    this.dragDropService.startDrag(payload);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify({ type: 'filesystem' }));
    }
  }

  // --- Child Event Bubbling ---
  onChildPathChange(path: string[]): void {
    this.pathChange.emit(path);
  }

  onLoadChildren(path: string[]): void {
    this.loadChildren.emit(path);
  }

  onChildItemsDropped(event: { destPath: string[]; payload: DragDropPayload }): void {
    this.itemsDropped.emit(event);
  }

  onChildBookmarkDropped(event: { bookmark: NewBookmark, destPath: string[] }): void {
    this.bookmarkDropped.emit(event);
  }

  onChildContextMenuRequest(event: { event: MouseEvent; path: string[]; node: FileSystemNode; }): void {
    this.contextMenuRequest.emit(event);
  }

  onToggleExpand(event: { path: string[]; expanded: boolean }): void {
    this.toggleExpand.emit(event);
  }
}
