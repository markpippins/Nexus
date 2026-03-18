import { Component, ChangeDetectionStrategy, signal, inject, Renderer2, OnDestroy, input, output, HostListener, ElementRef, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent } from '../chat/chat.component.js';
import { FileSystemNode } from '../../models/file-system.model.js';
import { TreeViewComponent } from '../tree-view/tree-view.component.js';
import { ServiceTreeComponent } from '../service-tree/service-tree.component.js';
import { ComponentPaletteComponent } from '../component-palette/component-palette.component.js';
import { ComponentLibraryComponent } from '../component-library/component-library.component.js';
import { ImageService } from '../../services/image.service.js';
import { DragDropPayload } from '../../services/drag-drop.service.js';
import { NewBookmark } from '../../models/bookmark.model.js';
import { InputDialogComponent } from '../input-dialog/input-dialog.component.js';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component.js';
import { FileSystemProvider } from '../../services/file-system-provider.js';
import { UiPreferencesService } from '../../services/ui-preferences.service.js';
import { NotesComponent } from '../notes/notes.component.js';
import { ServiceMeshService } from '../../services/service-mesh.service.js';
import { ServiceInstance } from '../../models/service-mesh.model.js';
import { ArchitectureVizService } from '../../services/architecture-viz.service.js';
import { NodeType } from '../../models/component-config.js';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  imports: [CommonModule, ChatComponent, TreeViewComponent, ServiceTreeComponent, ComponentPaletteComponent, ComponentLibraryComponent, InputDialogComponent, ConfirmDialogComponent, NotesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnDestroy {
  private renderer = inject(Renderer2);
  private elementRef = inject(ElementRef);
  private uiPreferencesService = inject(UiPreferencesService);
  private serviceMeshService = inject(ServiceMeshService);
  private vizService = inject(ArchitectureVizService);

  folderTree = input<FileSystemNode | null>(null);
  currentPath = input.required<string[]>();
  getImageService = input.required<(path: string[]) => ImageService>();
  getProvider = input.required<(path: string[]) => FileSystemProvider>();
  isTreeVisible = input(true);
  isChatVisible = input(true);
  isNotesVisible = input(true);
  viewMode = input<'file-explorer' | 'service-mesh'>('file-explorer');
  meshViewMode = input<'console' | 'graph'>('console'); // Sub-mode when in service-mesh
  graphSubView = input<'canvas' | 'creator'>('canvas'); // Sub-view when in graph mode

  pathChange = output<string[]>();
  refreshTree = output<void>();
  loadChildren = output<string[]>();
  itemsMoved = output<{ destPath: string[]; payload: DragDropPayload }>();
  bookmarkDropped = output<{ bookmark: NewBookmark, destPath: string[] }>();
  viewModeChange = output<'file-explorer' | 'service-mesh'>();
  meshViewModeChange = output<'console' | 'graph'>(); // For toggling between console and graph
  refreshServices = output<void>(); // For refreshing service mesh data
  serversMenuClick = output<void>();
  hostServersMenuClick = output<void>();
  localConfigMenuClick = output<void>();
  importClick = output<void>();
  exportClick = output<void>();
  renameItemInTree = output<{ path: string[], newName: string }>();
  deleteItemInTree = output<string[]>();
  createFolderInTree = output<{ path: string[], name: string }>();
  createFileInTree = output<{ path: string[], name: string }>();
  connectToServer = output<string>();
  disconnectFromServer = output<string>();
  editServerProfile = output<string>();
  openCreateUser = output<void>();
  serviceSelected = output<ServiceInstance>();

  // Service Mesh data bindings (from ServiceMeshService)
  services = computed(() => this.serviceMeshService.services());
  dependencies = computed(() => this.serviceMeshService.dependencies());
  deployments = computed(() => this.serviceMeshService.deployments());
  selectedService = this.serviceMeshService.selectedService;

  width = signal(this.uiPreferencesService.sidebarWidth() ?? 288);
  isResizing = signal(false);
  treeExpansionCommand = signal<{ command: 'expand' | 'collapse', id: number } | null>(null);
  isHamburgerMenuOpen = signal(false);
  showRunningOnly = signal(false); // Filter to show only running services

  private unlistenMouseMove: (() => void) | null = null;
  private unlistenMouseUp: (() => void) | null = null;

  // --- Vertical Resizing State for internal panes ---
  // We keep treePaneHeight around only if we want to refer to it, but now Tree will be flex-1
  // We use local signals for chat and notes to allow them to have fixed heights
  chatPaneHeight = signal(this.uiPreferencesService.sidebarChatHeight() ?? 250);
  notesPaneHeight = signal(250); // Default to 250px

  isResizingChat = signal(false);
  isResizingNotes = signal(false);

  private unlistenChatMouseMove: (() => void) | null = null;
  private unlistenChatMouseUp: (() => void) | null = null;
  private unlistenNotesMouseMove: (() => void) | null = null;
  private unlistenNotesMouseUp: (() => void) | null = null;

  isChatPaneCollapsed = this.uiPreferencesService.isChatPaneCollapsed;
  isNotesPaneCollapsed = this.uiPreferencesService.isNotesPaneCollapsed;

  @ViewChild('contentContainer') contentContainerEl!: ElementRef<HTMLDivElement>;

  // Tree always takes full flex space so it expands when chat or notes collapse
  isTreeFlex = computed(() => {
    return true;
  });

  // Chat has fixed height unless overridden by collapse
  isChatFlex = computed(() => {
    return false;
  });

  // --- Context Menu State ---
  contextMenu = signal<{ x: number; y: number; path: string[]; node: FileSystemNode } | null>(null);

  // --- Dialog State ---
  isInputDialogOpen = signal(false);
  private inputDialogCallback = signal<((value: string) => void) | null>(null);
  inputDialogConfig = signal<{ title: string; message: string; initialValue: string }>({ title: '', message: '', initialValue: '' });

  isConfirmDialogOpen = signal(false);
  private confirmDialogCallback = signal<(() => void) | null>(null);
  confirmDialogConfig = signal<{ title: string; message: string; confirmText: string }>({ title: '', message: '', confirmText: 'OK' });

  currentProvider = computed(() => this.getProvider()(this.currentPath()));

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      if (this.isHamburgerMenuOpen()) this.isHamburgerMenuOpen.set(false);
    }
    // Always close context menu on any document click
    if (this.contextMenu()) this.contextMenu.set(null);
  }

  startResize(event: MouseEvent): void {
    this.isResizing.set(true);
    const startX = event.clientX;
    const startWidth = this.width();

    event.preventDefault();

    this.unlistenMouseMove = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      const dx = e.clientX - startX;
      let newWidth = startWidth + dx;

      if (newWidth < 150) newWidth = 150;
      if (newWidth > 500) newWidth = 500;

      this.width.set(newWidth);
    });

    this.unlistenMouseUp = this.renderer.listen('document', 'mouseup', () => {
      this.stopResize();
    });
  }

  private stopResize(): void {
    if (!this.isResizing()) return;
    this.isResizing.set(false);
    if (this.unlistenMouseMove) {
      this.unlistenMouseMove();
      this.unlistenMouseMove = null;
    }
    if (this.unlistenMouseUp) {
      this.unlistenMouseUp();
      this.unlistenMouseUp = null;
    }
    this.uiPreferencesService.setSidebarWidth(this.width());
  }

  // --- Vertical resize methods ---
  startTreeResize(event: MouseEvent): void {
    // This resizer is between Tree and Chat.
    // Since Tree is flex-1 and on top, dragging this resizer UP (smaller clientY) increases Chat's height.
    this.isResizingChat.set(true);
    const container = this.contentContainerEl.nativeElement;
    const containerRect = container.getBoundingClientRect();
    event.preventDefault();

    this.unlistenChatMouseMove = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      // The space below this resizer is Chat + Chat-Notes Resizer + Notes
      let occupiedBelowBase = 0;
      if (this.isNotesVisible()) {
        if (this.isNotesPaneCollapsed()) {
          occupiedBelowBase += 24; // h-6
        } else {
          occupiedBelowBase += this.notesPaneHeight();
        }
      }

      // Height of Chat = Container Bottom - Mouse Y - occupiedBelowBase
      let newChatHeight = (containerRect.bottom - occupiedBelowBase) - e.clientY;

      const minHeight = 100;
      const maxHeight = containerRect.height - occupiedBelowBase - 100; // Leave 100px for Tree

      if (newChatHeight < minHeight) newChatHeight = minHeight;
      if (newChatHeight > maxHeight) newChatHeight = maxHeight;

      this.chatPaneHeight.set(newChatHeight);
    });

    this.unlistenChatMouseUp = this.renderer.listen('document', 'mouseup', () => {
      this.stopChatResize();
    });
  }

  private stopChatResize(): void {
    if (!this.isResizingChat()) return;
    this.isResizingChat.set(false);
    if (this.unlistenChatMouseMove) {
      this.unlistenChatMouseMove();
      this.unlistenChatMouseMove = null;
    }
    if (this.unlistenChatMouseUp) {
      this.unlistenChatMouseUp();
      this.unlistenChatMouseUp = null;
    }
    this.uiPreferencesService.setSidebarChatHeight(this.chatPaneHeight());
  }

  startChatResize(event: MouseEvent): void {
    // This resizer is between Chat and Notes.
    // Dragging UP increases Notes height.
    this.isResizingNotes.set(true);
    const container = this.contentContainerEl.nativeElement;
    const containerRect = container.getBoundingClientRect();
    event.preventDefault();

    this.unlistenNotesMouseMove = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      let newNotesHeight = containerRect.bottom - e.clientY;

      const minHeight = 100;
      // Chat is above this. Need to leave space for Chat and Tree.
      let chatOccupied = 0;
      if (this.isChatVisible()) {
        chatOccupied = this.isChatPaneCollapsed() ? 24 : this.chatPaneHeight();
      }
      const maxHeight = containerRect.height - chatOccupied - 100; // 100px for Tree

      if (newNotesHeight < minHeight) newNotesHeight = minHeight;
      if (newNotesHeight > maxHeight) newNotesHeight = maxHeight;

      this.notesPaneHeight.set(newNotesHeight);
    });

    this.unlistenNotesMouseUp = this.renderer.listen('document', 'mouseup', () => {
      this.stopNotesResize();
    });
  }

  private stopNotesResize(): void {
    if (!this.isResizingNotes()) return;
    this.isResizingNotes.set(false);
    if (this.unlistenNotesMouseMove) {
      this.unlistenNotesMouseMove();
      this.unlistenNotesMouseMove = null;
    }
    if (this.unlistenNotesMouseUp) {
      this.unlistenNotesMouseUp();
      this.unlistenNotesMouseUp = null;
    }
  }

  toggleChatPaneCollapse(): void {
    this.uiPreferencesService.toggleChatPaneCollapse();
  }

  toggleNotesPaneCollapse(): void {
    this.uiPreferencesService.toggleNotesPaneCollapse();
  }

  onViewModeChange(mode: 'file-explorer' | 'service-mesh'): void {
    this.viewModeChange.emit(mode);
  }

  onServiceSelected(service: ServiceInstance): void {
    this.serviceMeshService.selectService(service);
    this.serviceSelected.emit(service);
  }

  onAddComponent(type: NodeType): void {
    // Add a new node at a random position
    const x = (Math.random() - 0.5) * 40;
    const y = (Math.random() - 0.5) * 20 + 10;
    const z = (Math.random() - 0.5) * 20;
    const id = this.vizService.addNode(type, { x, y, z });
    this.vizService.selectNode(id);
  }

  onTreeViewPathChange(path: string[]): void {
    this.pathChange.emit(path);
  }

  onRefreshTree(): void {
    this.refreshTree.emit();
  }

  onMeshViewModeChange(mode: 'console' | 'graph'): void {
    this.meshViewModeChange.emit(mode);
  }

  onRefreshServices(): void {
    this.refreshServices.emit();
  }

  onToggleShowRunningOnly(): void {
    this.showRunningOnly.update(v => !v);
  }

  onExpandAll(): void {
    this.treeExpansionCommand.set({ command: 'expand', id: Date.now() });
  }

  onCollapseAll(): void {
    this.treeExpansionCommand.set({ command: 'collapse', id: Date.now() });
  }

  onLoadChildren(path: string[]): void {
    this.loadChildren.emit(path);
  }

  onItemsDropped(event: { destPath: string[]; payload: DragDropPayload }): void {
    this.itemsMoved.emit(event);
  }

  onBookmarkDropped(event: { bookmark: NewBookmark, destPath: string[] }): void {
    this.bookmarkDropped.emit(event);
  }

  toggleHamburgerMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isHamburgerMenuOpen.update(v => !v);
  }

  onMenuItemClick(emitterName: 'localConfigMenuClick' | 'importClick' | 'exportClick' | 'serversMenuClick' | 'hostServersMenuClick' | 'createUserClick'): void {
    switch (emitterName) {
      case 'localConfigMenuClick':
        this.localConfigMenuClick.emit();
        break;
      case 'importClick':
        this.importClick.emit();
        break;
      case 'exportClick':
        this.exportClick.emit();
        break;
      case 'serversMenuClick':
        this.serversMenuClick.emit();
        break;
      case 'hostServersMenuClick':
        this.hostServersMenuClick.emit();
        break;
      case 'createUserClick':
        this.openCreateUser.emit();
        break;
    }
    this.isHamburgerMenuOpen.set(false);
  }

  onTreeContextMenu(event: { event: MouseEvent; path: string[]; node: FileSystemNode; }): void {
    event.event.preventDefault();
    event.event.stopPropagation();

    // Only show context menu in file system trees, not in other areas like service mesh
    if (this.viewMode() !== 'file-explorer') {
      this.contextMenu.set(null); // Close any existing menu
      return;
    }

    this.contextMenu.set({ x: event.event.clientX, y: event.event.clientY, path: event.path, node: event.node });
  }

  private findNodeByPath(root: FileSystemNode | null, path: string[]): FileSystemNode | null {
    if (!root) return null;

    if (path.length === 0) {
      // An empty path corresponds to the root of the tree itself ('Nexus')
      return root;
    }

    let currentNode: FileSystemNode | undefined = root;
    for (const segment of path) {
      currentNode = currentNode?.children?.find(c => c.name === segment);
      if (!currentNode) return null;
    }

    return currentNode ?? null;
  }

  onSidebarAreaContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only show context menu in file system trees, not in other areas like service mesh
    if (this.viewMode() !== 'file-explorer') {
      this.contextMenu.set(null); // Close any existing menu
      return;
    }

    this.contextMenu.set(null); // Close any existing menu

    const path = this.currentPath();
    const root = this.folderTree();
    const nodeForPath = this.findNodeByPath(root, path);

    if (nodeForPath) {
      // Set the context to the currently active path, allowing actions like "New Folder"
      // to apply to the folder currently being viewed in the main pane.
      this.contextMenu.set({ x: event.clientX, y: event.clientY, path: path, node: nodeForPath });
    }
  }

  isChildOfWritableRoot(path: string[]): boolean {
    if (path.length <= 1) {
      // This is a safeguard. The template logic should prevent this from being called
      // for the Home root (path.length === 0). For top-level items, we let the
      // specific menu logic handle it.
      return false;
    }

    const rootNodeName = path[0];
    // The folderTree is the 'Nexus' node. Its children are the roots we care about.
    const rootNodeInTree = this.folderTree()?.children?.find(c => c.name === rootNodeName);

    if (rootNodeInTree?.isServerRoot) {
      // It's a child of a server. Writable only if connected.
      return rootNodeInTree.connected ?? false;
    }

    // If not a child of a server root, it must be a child of the local session root,
    // which is always writable.
    return true;
  }

  // --- Context Menu Action Handlers ---
  handleSettings(): void {
    this.localConfigMenuClick.emit();
    this.contextMenu.set(null);
  }

  handleServers(): void {
    this.serversMenuClick.emit();
    this.contextMenu.set(null);
  }

  handleRename(): void {
    const ctx = this.contextMenu();
    if (!ctx) return;
    this.contextMenu.set(null);
    this.inputDialogConfig.set({ title: 'Rename', message: 'Enter a new name:', initialValue: ctx.node.name });
    this.inputDialogCallback.set((newName: string) => {
      this.renameItemInTree.emit({ path: ctx.path, newName });
    });
    this.isInputDialogOpen.set(true);
  }

  handleDelete(): void {
    const ctx = this.contextMenu();
    if (!ctx) return;
    this.contextMenu.set(null);
    this.confirmDialogConfig.set({ title: 'Confirm Deletion', message: `Are you sure you want to delete "${ctx.node.name}"?`, confirmText: 'Delete' });
    this.confirmDialogCallback.set(() => {
      this.deleteItemInTree.emit(ctx.path);
    });
    this.isConfirmDialogOpen.set(true);
  }

  handleNewFolder(): void {
    const ctx = this.contextMenu();
    if (!ctx) return;
    this.contextMenu.set(null);
    this.inputDialogConfig.set({ title: 'New Folder', message: `Enter a name for the new folder inside "${ctx.node.name}":`, initialValue: 'New folder' });
    this.inputDialogCallback.set((name: string) => {
      this.createFolderInTree.emit({ path: ctx.path, name });
    });
    this.isInputDialogOpen.set(true);
  }

  handleNewFile(): void {
    const ctx = this.contextMenu();
    if (!ctx) return;
    this.contextMenu.set(null);
    this.inputDialogConfig.set({ title: 'New File', message: `Enter a name for the new file inside "${ctx.node.name}":`, initialValue: 'New file.txt' });
    this.inputDialogCallback.set((name: string) => {
      this.createFileInTree.emit({ path: ctx.path, name });
    });
    this.isInputDialogOpen.set(true);
  }

  handleConnect(): void {
    const profileId = this.contextMenu()?.node.profileId;
    if (profileId) {
      this.connectToServer.emit(profileId);
    }
    this.contextMenu.set(null);
  }

  handleDisconnect(): void {
    const profileId = this.contextMenu()?.node.profileId;
    if (profileId) {
      this.disconnectFromServer.emit(profileId);
    }
    this.contextMenu.set(null);
  }

  handleEditProfile(): void {
    const profileId = this.contextMenu()?.node.profileId;
    if (profileId) {
      this.editServerProfile.emit(profileId);
    }
    this.contextMenu.set(null);
  }

  // --- Dialog Submit/Cancel Handlers ---

  onInputDialogSubmit(value: string): void {
    this.inputDialogCallback()?.(value);
    this.isInputDialogOpen.set(false);
  }

  onConfirmDialogConfirm(): void {
    this.confirmDialogCallback()?.();
    this.isConfirmDialogOpen.set(false);
  }

  ngOnDestroy(): void {
    this.stopResize();
    this.stopChatResize();
    this.stopNotesResize();
  }
}