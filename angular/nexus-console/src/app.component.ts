


import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, Renderer2, ElementRef, OnDestroy, Injector, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FileExplorerComponent } from './components/file-explorer/file-explorer.component.js';
import { SidebarComponent } from './components/sidebar/sidebar.component.js';
import { FileSystemNode, FileType } from './models/file-system.model.js';
import { FileSystemProvider, ItemReference } from './services/file-system-provider.js';
import { BrokerProfileService } from './services/broker-profile.service.js';
import { HostProfileService } from './services/host-profile.service.js';
import { DetailPaneComponent } from './components/detail-pane/detail-pane.component.js';
import { SessionService } from './services/in-memory-file-system.service.js';
import { BrokerProfile } from './models/broker-profile.model.js';
import { PlatformManagementService, ServicePayload, FrameworkPayload, Host } from './services/platform-management.service.js';
import { RemoteFileSystemService } from './services/remote-file-system.service.js';
import { FsService } from './services/fs.service.js';
import { ImageService } from './services/image.service.js';
import { ImageClientService } from './services/image-client.service.js';
import { LoginService } from './services/login.service.js';
import { User } from './models/user.model.js';
import { PreferencesService } from './services/preferences.service.js';
import { DragDropPayload } from './services/drag-drop.service.js';
import { ToolbarComponent, SortCriteria } from './components/toolbar/toolbar.component.js';
import { ClipboardService } from './services/clipboard.service.js';
import { BookmarkService } from './services/bookmark.service.js';
import { NewBookmark, Bookmark } from './models/bookmark.model.js';
import { ToastsComponent } from './components/toasts/toasts.component.js';
import { ToastService } from './services/toast.service.js';
import { WebviewDialogComponent } from './components/webview-dialog/webview-dialog.component.js';
import { WebviewService } from './services/webview.service.js';
import { LocalConfigDialogComponent } from './components/local-config-dialog/local-config-dialog.component.js';
import { LocalConfig, LocalConfigService } from './services/local-config.service.js';
import { LoginDialogComponent } from './components/login-dialog/login-dialog.component.js';
import { Theme, UiPreferences, UiPreferencesService } from './services/ui-preferences.service.js';
import { RssFeedsDialogComponent } from './components/rss-feeds-dialog/rss-feeds-dialog.component.js';
import { ImportDialogComponent } from './components/import-dialog/import-dialog.component.js';
import { ExportDialogComponent } from './components/export-dialog/export-dialog.component.js';
import { FolderPropertiesService } from './services/folder-properties.service.js';
import { TextEditorService } from './services/note-dialog.service.js';
import { TextEditorDialogComponent } from './components/note-view-dialog/note-view-dialog.component.js';
import { DbService } from './services/db.service.js';
import { GoogleSearchService, GoogleSearchParams } from './services/google-search.service.js';
import { UnsplashService } from './services/unsplash.service.js';
import { GeminiService, GeminiSearchParams } from './services/gemini.service.js';
import { YoutubeSearchService } from './services/youtube-search.service.js';
import { AcademicSearchService } from './services/academic-search.service.js';
import { GoogleSearchResult } from './models/google-search-result.model.js';
import { ImageSearchResult } from './models/image-search-result.model.js';
import { YoutubeSearchResult } from './models/youtube-search-result.model.js';
import { AcademicSearchResult } from './models/academic-search-result.model.js';
import { NodeType } from './models/tree-node.model.js';
import { WebResultCardComponent } from './components/stream-cards/web-result-card.component.js';
import { ImageResultCardComponent } from './components/stream-cards/image-result-card.component.js';
import { GeminiResultCardComponent } from './components/stream-cards/gemini-result-card.component.js';
import { YoutubeResultCardComponent } from './components/stream-cards/youtube-result-card.component.js';
import { AcademicResultCardComponent } from './components/stream-cards/academic-result-card.component.js';
import { WebResultListItemComponent } from './components/stream-list-items/web-result-list-item.component.js';
import { ImageResultListItemComponent } from './components/stream-list-items/image-result-list-item.component.js';
import { GeminiResultListItemComponent } from './components/stream-list-items/gemini-result-list-item.component.js';
import { YoutubeResultListItemComponent } from './components/stream-list-items/youtube-result-list-item.component.js';
import { AcademicResultListItemComponent } from './components/stream-list-items/academic-result-list-item.component.js';
import { PreferencesDialogComponent } from './components/preferences-dialog/preferences-dialog.component.js';
import { TerminalComponent } from './components/terminal/terminal.component.js';
import { NotesService } from './services/notes.service.js';
import { ComplexSearchDialogComponent } from './components/complex-search-dialog/complex-search-dialog.component.js';
import { ComplexSearchParams } from './components/complex-search/complex-search.component.js';
import { HealthCheckService } from './services/health-check.service.js';
import { GeminiSearchDialogComponent } from './components/gemini-search-dialog/gemini-search-dialog.component.js';
import { TreeManagerService } from './services/tree-manager.service.js';
import { RegistryServerProvider } from './services/registry-server-provider.service.js';
import { TreeProviderAdapter } from './services/tree-provider-adapter.js';
import { ServiceMeshComponent } from './components/service-mesh/service-mesh.component.js';
import { CreateUserDialogComponent } from './components/create-user/create-user-dialog.component.js';
import { PlatformManagementComponent } from './components/platform-management/platform-management.component.js';
import { ServiceMeshService } from './services/service-mesh.service.js';
import { ArchitectureVizService } from './services/architecture-viz.service.js';
import { ServiceRegistryEditorComponent } from './components/service-registry-editor/service-registry-editor.component.js';
import { GatewayEditorComponent } from './components/gateway-editor/gateway-editor.component.js';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component.js';
import { GatewayManagementComponent } from './components/gateway-management/gateway-management.component.js';
import { HostServerManagementComponent } from './components/host-server-management/host-server-management.component.js';
import { GenericTreeNode } from './models/generic-tree.model.js';

interface PanePath {
  id: number;
  path: string[];
}
interface PaneStatus {
  selectedItemsCount: number;
  totalItemsCount: number;
  filteredItemsCount: number | null;
}
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Type definitions for items in the unified stream
type GeminiResult = { query: string; text: string; publishedAt: string; };

type StreamItem =
  | (GoogleSearchResult & { type: 'web' })
  | (ImageSearchResult & { type: 'image' })
  | (YoutubeSearchResult & { type: 'youtube' })
  | (AcademicSearchResult & { type: 'academic' })
  | (GeminiResult & { type: 'gemini' });

type StreamItemType = 'web' | 'image' | 'youtube' | 'academic' | 'gemini';
type StreamSortKey = 'relevance' | 'title' | 'source' | 'date';
interface StreamSortCriteria {
  key: StreamSortKey;
  direction: 'asc' | 'desc';
}

const readOnlyProviderOps = {
  createDirectory: () => Promise.reject(new Error('Operation not supported.')),
  removeDirectory: () => Promise.reject(new Error('Operation not supported.')),
  createFile: () => Promise.reject(new Error('Operation not supported.')),
  deleteFile: () => Promise.reject(new Error('Operation not supported.')),
  rename: () => Promise.reject(new Error('Operation not supported.')),
  uploadFile: () => Promise.reject(new Error('Operation not supported.')),
  move: () => Promise.reject(new Error('Operation not supported.')),
  copy: () => Promise.reject(new Error('Operation not supported.')),
  importTree: () => Promise.reject(new Error('Operation not supported.')),
  getFileContent: () => Promise.reject(new Error('Operation not supported.')),
  saveFileContent: () => Promise.reject(new Error('Operation not supported.')),
  hasFile: (path: string[], filename: string) => Promise.resolve(false),
  hasFolder: () => Promise.resolve(false),
  // Methods added for GenericTreeProvider
  getNodeContent: () => Promise.reject(new Error('Operation not supported.')),
  saveNodeContent: () => Promise.reject(new Error('Operation not supported.')),
  getTree: () => Promise.reject(new Error('Operation not supported.')),
  createFolder: () => Promise.reject(new Error('Operation not supported.')),
  removeFolder: () => Promise.reject(new Error('Operation not supported.')),
  createNode: () => Promise.reject(new Error('Operation not supported.')),
  deleteNode: () => Promise.reject(new Error('Operation not supported.')),
  hasNode: () => Promise.reject(new Error('Operation not supported.')),
};

const disconnectedProvider: FileSystemProvider = {
  getContents: () => Promise.resolve([]),
  getFolderTree: () => Promise.reject(new Error('Server is disconnected.')),
  ...readOnlyProviderOps,
};

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FileExplorerComponent, SidebarComponent, DetailPaneComponent, ToolbarComponent, ToastsComponent, WebviewDialogComponent, LocalConfigDialogComponent, LoginDialogComponent, RssFeedsDialogComponent, ImportDialogComponent, ExportDialogComponent, TextEditorDialogComponent, WebResultCardComponent, ImageResultCardComponent, GeminiResultCardComponent, YoutubeResultCardComponent, AcademicResultCardComponent, WebResultListItemComponent, ImageResultListItemComponent, GeminiResultListItemComponent, YoutubeResultListItemComponent, AcademicResultListItemComponent, PreferencesDialogComponent, TerminalComponent, ComplexSearchDialogComponent, GeminiSearchDialogComponent, ServiceMeshComponent, CreateUserDialogComponent, PlatformManagementComponent, ServiceRegistryEditorComponent, GatewayEditorComponent, GatewayManagementComponent, HostServerManagementComponent, ConfirmDialogComponent],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:click)': 'onDocumentClick($event)',
  }
})
export class AppComponent implements OnInit, OnDestroy {
  private sessionFs = inject(SessionService);
  private profileService = inject(BrokerProfileService);
  private hostProfileService = inject(HostProfileService);
  private localConfigService = inject(LocalConfigService);
  private fsService = inject(FsService);
  private imageClientService = inject(ImageClientService);
  private loginService = inject(LoginService);
  private preferencesService = inject(PreferencesService);
  private clipboardService = inject(ClipboardService);
  private bookmarkService = inject(BookmarkService);
  private toastService = inject(ToastService);
  private webviewService = inject(WebviewService);
  private textEditorService = inject(TextEditorService);
  private folderPropertiesService = inject(FolderPropertiesService);
  private injector = inject(Injector);
  private document: Document = inject(DOCUMENT);
  private renderer = inject(Renderer2);
  private elementRef = inject(ElementRef);
  private dbService = inject(DbService);
  private uiPreferencesService = inject(UiPreferencesService);
  private homeProvider: FileSystemProvider;
  private googleSearchService = inject(GoogleSearchService);
  private unsplashService = inject(UnsplashService);
  private geminiService = inject(GeminiService);
  private youtubeSearchService = inject(YoutubeSearchService);
  private academicSearchService = inject(AcademicSearchService);
  private notesService = inject(NotesService);
  private healthCheckService = inject(HealthCheckService);
  private treeManager = inject(TreeManagerService);
  private registryServerProvider = inject(RegistryServerProvider);
  private serviceMeshService = inject(ServiceMeshService);
  public vizService = inject(ArchitectureVizService);

  private initialAutoConnectAttempted = false;

  // --- State Management ---
  isSplitView = signal(false);
  activePaneId = signal(1);
  folderTree = signal<FileSystemNode | null>(null);
  isLocalConfigDialogOpen = signal(false);
  isRssFeedsDialogOpen = signal(false);
  isImportDialogOpen = signal(false);
  isExportDialogOpen = signal(false);
  isPreferencesDialogOpen = signal(false);
  isComplexSearchDialogOpen = signal(false);
  isGeminiSearchDialogOpen = signal(false);
  isCreateUserDialogOpen = signal(false);
  isImportDependencyWarningOpen = signal(false);
  importWarningDontShowAgain = signal(false);
  profileForCreateUser = signal<BrokerProfile | undefined>(undefined);
  selectedDetailItem = signal<FileSystemNode | null>(null);
  connectionStatus = signal<ConnectionStatus>('disconnected');
  refreshPanes = signal(0);
  currentViewMode = signal<'file-explorer' | 'service-mesh'>('file-explorer');  // Default to file explorer
  meshViewMode = signal<'console' | 'graph'>('console');  // Sub-mode when in service-mesh
  graphBackgroundColor = signal('#000510');  // Graph background color
  graphSubView = signal<'canvas' | 'creator'>('canvas');  // Sub-view when in graph mode (canvas vs creator)

  // --- Pane Visibility State (from service) ---
  isSidebarVisible = this.uiPreferencesService.isSidebarVisible;
  isTreeVisible = this.uiPreferencesService.isTreeVisible;
  isChatVisible = this.uiPreferencesService.isChatVisible;
  isNotesVisible = this.uiPreferencesService.isNotesVisible;
  isDetailPaneOpen = this.uiPreferencesService.isDetailPaneOpen;
  isSavedItemsVisible = this.uiPreferencesService.isSavedItemsVisible;
  isRssFeedVisible = this.uiPreferencesService.isRssFeedVisible;
  isStreamVisible = this.uiPreferencesService.isStreamVisible;
  isConsoleCollapsed = this.uiPreferencesService.isConsoleCollapsed;
  isStreamPaneCollapsed = this.uiPreferencesService.isStreamPaneCollapsed;
  isStreamActiveSearchEnabled = this.uiPreferencesService.isStreamActiveSearchEnabled;

  shouldShowStreamPane = computed(() => {
    if (!this.isStreamVisible()) return false;

    const path = this.activePanePath();
    if (path.length > 0 && path[0] === 'Platform Management') {
      return false;
    }

    return true;
  });

  // --- Content Status Bar (CRUD screens) ---
  contentStatusInfo = signal<{ type: string; count: number } | null>(null);

  // Keep track of each pane's path
  panePaths = signal<PanePath[]>([{ id: 1, path: [] }]);

  // --- Dialog Control State ---
  profileForLogin = signal<BrokerProfile | null>(null);

  // --- Mounted Profile State ---
  mountedProfiles = signal<BrokerProfile[]>([]);
  mountedProfileUsers = signal<Map<string, User>>(new Map());
  mountedProfileTokens = signal<Map<string, string>>(new Map());
  mountedProfileIds = computed(() => this.mountedProfiles().map(p => p.id));
  private remoteProviders = signal<Map<string, RemoteFileSystemService>>(new Map());
  private remoteImageServices = signal<Map<string, ImageService>>(new Map());

  // --- Status Bar State ---
  pane1Status = signal<PaneStatus>({ selectedItemsCount: 0, totalItemsCount: 0, filteredItemsCount: null });
  pane2Status = signal<PaneStatus>({ selectedItemsCount: 0, totalItemsCount: 0, filteredItemsCount: null });

  activePaneStatus = computed<PaneStatus>(() => {
    const activeId = this.activePaneId();
    if (activeId === 1) {
      return this.pane1Status();
    }
    return this.pane2Status();
  });

  statusBarSelectionInfo = computed(() => {
    const item = this.selectedDetailItem();
    if (!item) {
      return 'Ready';
    }

    if (item.isServerRoot) {
      const profile = this.profileService.profiles().find(p => p.name === item.name);
      if (profile) {
        return `Broker Profile: ${profile.name} | Broker: ${profile.brokerUrl}`;
      }
    }

    const itemType = item.type.charAt(0).toUpperCase() + item.type.slice(1);
    let info = `${itemType}: ${item.name} | Modified: ${item.modified ? new Date(item.modified).toLocaleString() : 'N/A'}`;

    if (item.isMagnet) {
      info += ' | 🧲 Magnet Folder';
    }

    return info;
  });

  statusBarItemCounts = computed(() => {
    const status = this.activePaneStatus();
    let message = `${status.totalItemsCount} items`;

    if (status.filteredItemsCount !== null) {
      message = `${status.filteredItemsCount} of ${status.totalItemsCount} items`;
    }

    if (status.selectedItemsCount > 0) {
      message += ` | ${status.selectedItemsCount} selected`;
    }
    return message;
  });

  // --- Pane Path & Provider Management ---
  pane1Path = computed(() => this.panePaths().find(p => p.id === 1)?.path ?? []);
  pane2Path = computed(() => this.panePaths().find(p => p.id === 2)?.path ?? []);
  activePanePath = computed(() => this.activePaneId() === 1 ? this.pane1Path() : this.pane2Path());
  activeRootName = computed(() => this.activePanePath()[0] ?? this.localConfigService.sessionName());

  // Derive display path (without server/session name) for address bar
  activeDisplayPath = computed(() => {
    const path = this.activePanePath();
    return path.length > 1 ? path.slice(1) : [];
  });

  canGoUpActivePane = computed(() => this.activePanePath().length > 0);

  pane1Provider = computed<FileSystemProvider>(() => this.getProvider(this.pane1Path()));
  pane2Provider = computed<FileSystemProvider>(() => this.getProvider(this.pane2Path()));
  pane1ImageService = computed<ImageService>(() => this.getImageService(this.pane1Path()));
  pane2ImageService = computed<ImageService>(() => this.getImageService(this.pane2Path()));

  pane1PlatformNode = computed(() => this.getPlatformNodeForPath(this.pane1Path()));
  pane2PlatformNode = computed(() => this.getPlatformNodeForPath(this.pane2Path()));
  activePanePlatformNode = computed(() => this.activePaneId() === 1 ? this.pane1PlatformNode() : this.pane2PlatformNode());

  // Host Server Profile Editor Detection
  // When path is ['Host Servers', 'Profile Name'], we show the editor
  pane1HostServerProfileId = computed(() => this.getHostServerProfileIdForPath(this.pane1Path()));
  pane2HostServerProfileId = computed(() => this.getHostServerProfileIdForPath(this.pane2Path()));

  // Gateway Profile Editor Detection
  pane1GatewayProfileId = computed(() => this.getGatewayProfileIdForPath(this.pane1Path()));
  pane2GatewayProfileId = computed(() => this.getGatewayProfileIdForPath(this.pane2Path()));

  private getHostServerProfileIdForPath(path: string[]): string | null {
    // Path must be exactly ['Service Registries', 'Profile Name'] to show editor
    if (path.length !== 2 || path[0] !== 'Service Registries') {
      return null;
    }
    const profileName = path[1];
    const profile = this.hostProfileService.profiles().find(p => p.name === profileName);
    return profile?.id ?? null;
  }

  private getGatewayProfileIdForPath(path: string[]): string | null {
    // Path must be exactly ['Gateways', 'Profile Name'] to show editor
    if (path.length !== 2 || path[0] !== 'Gateways') {
      return null;
    }
    const profileName = path[1];
    const profile = this.profileService.profiles().find(p => p.name === profileName);
    return profile?.id ?? null;
  }

  private getPlatformNodeForPath(path: string[]) {
    // Valid management types
    const validTypes = ['data dictionary', 'services', 'frameworks', 'libraries', 'deployments', 'servers', 'hosts', 'service hosts', 'lookup tables', 'service types', 'server types', 'framework languages', 'framework categories', 'library categories', 'service definitions', 'languages', 'categories', 'operating systems', 'environments'];
    const profiles = this.hostProfileService.profiles();
    const activeProfile = this.hostProfileService.activeProfile();

    // Helper to normalize type for component
    const normalizeType = (t: string) => {
      let n = t.replace(/\s+/g, '-');
      // Normalize dictionary child types
      if (n === 'data-dictionary') return null; // Data Dictionary is just a folder, don't load data
      if (n === 'service-definitions') return 'services';
      if (n === 'service-hosts' || n === 'hosts') return 'servers';
      if (n === 'languages') return 'framework-languages';
      if (n === 'categories') return 'framework-categories';
      return n;
    };

    if (!path || path.length === 0) {
      return null;
    }

    // Explicitly exclude "Search & Discovery" paths to prevent masking user folders
    if (path[0] === 'Search & Discovery') {
      return null;
    }

    console.log('[AppComponent] getPlatformNodeForPath', { path, profilesCount: profiles.length, activeProfile: activeProfile?.name });

    // Handle single-element path (direct child of root - e.g., ["Services"])
    if (path.length === 1) {
      const type = path[0].toLowerCase();
      if (validTypes.includes(type)) {
        const profile = activeProfile;
        if (profile) {
          const baseUrl = profile.hostServerUrl.startsWith('http') ? profile.hostServerUrl.replace(/\/$/, '') : `http://${profile.hostServerUrl.replace(/\/$/, '')}`;
          console.log('[AppComponent] Matched single-element path', { type, baseUrl });
          return { type: normalizeType(type), baseUrl };
        }
      }
      return null;
    }

    // Handle multi-element path
    const pmIndex = path.findIndex(p => p.toLowerCase() === 'platform management');

    if (pmIndex !== -1) {
      // Path contains "Platform Management"
      const remaining = path.slice(pmIndex + 1);

      let type: string | null = null;
      let targetProfileName: string | null = null;

      if (remaining.length === 0) {
        // Parent "Platform Management" selected - do NOT default to services.
        type = null;
      } else {
        // Find the first element in remaining that matches a valid type
        const typeIndex = remaining.findIndex(p => validTypes.includes(p.toLowerCase()));

        if (typeIndex !== -1) {
          type = remaining[typeIndex].toLowerCase();

          // Special case: if type is "data dictionary", check if there's a sub-type segment
          if (type === 'data dictionary' && remaining.length > typeIndex + 1) {
            const subType = remaining[remaining.length - 1].toLowerCase();
            if (validTypes.includes(subType)) {
              type = subType;
            }
          }

          // Resolve profile name - if type matches at index 1 or later, index 0 is likely the profile
          if (typeIndex > 0) {
            targetProfileName = remaining[0];
          }
        }
      }

      if (type) {
        const profile = targetProfileName
          ? profiles.find(p => p.name === targetProfileName)
          : (path[0] === 'Service Registries' && path.length > 1 ? profiles.find(p => p.name === path[1]) : (path[0].toLowerCase() !== 'platform management' ? profiles.find(p => p.name === path[0]) : activeProfile));

        const finalProfile = profile || activeProfile;
        if (finalProfile) {
          const normalizedType = normalizeType(type);
          // If normalized type is null (e.g., Data Dictionary), return null to show children instead
          if (!normalizedType) {
            return null;
          }
          const baseUrl = finalProfile.hostServerUrl.startsWith('http') ? finalProfile.hostServerUrl.replace(/\/$/, '') : `http://${finalProfile.hostServerUrl.replace(/\/$/, '')}`;
          console.log('[AppComponent] Matched Platform Management path', { type, baseUrl, targetProfileName });
          return { type: normalizedType, baseUrl };
        }
      }
    } else {
      // Path does NOT contain "Platform Management" but might still be a valid management path
      // e.g., ['Local Host', 'Services'] or ['Profile Name', 'Frameworks']
      const lastElement = path[path.length - 1].toLowerCase();
      if (validTypes.includes(lastElement)) {
        // Try to find profile by first element of path, or use default
        // Improved profile resolution: check path[1] for profile name (e.g. Services/Profile/Node)
        let profile = path.length > 1 ? profiles.find(p => p.name === path[1]) : null;

        if (!profile) {
          profile = profiles.find(p => p.name === path[0]);
        }

        // Fallback to active profile
        if (!profile) {
          profile = activeProfile;
        }

        if (profile) {
          const baseUrl = profile.hostServerUrl.startsWith('http') ? profile.hostServerUrl.replace(/\/$/, '') : `http://${profile.hostServerUrl.replace(/\/$/, '')}`;
          console.log('[AppComponent] Matched direct management path', { type: lastElement, baseUrl, profileName: path[0] });
          return { type: normalizeType(lastElement), baseUrl };
        }
      }
    }

    console.log('[AppComponent] No match found, returning null');
    return null;
  }

  // --- Gateway Context Signals ---
  isGatewayContext = computed(() => this.activePanePath()[0] === 'Gateways');
  isGatewaysNodeSelected = computed(() => this.activePanePath().length === 1 && this.activePanePath()[0] === 'Gateways');
  isGatewaySelected = computed(() => this.activePanePath().length === 2 && this.activePanePath()[0] === 'Gateways');

  isServiceRegistryContext = computed(() => this.activePanePath()[0] === 'Service Registries');
  isServiceRegistriesNodeSelected = computed(() => this.activePanePath().length === 1 && this.activePanePath()[0] === 'Service Registries');
  isServiceRegistrySelected = computed(() => this.activePanePath().length === 2 && this.activePanePath()[0] === 'Service Registries');

  isPlatformManagementContext = computed(() => {
    // Check if current view is a platform management view
    return !!(this.activePaneId() === 1 ? this.pane1PlatformNode() : this.pane2PlatformNode());
  });

  // Trigger for child editor save/reset
  editorSaveTrigger = signal<{ id: number; paneId: number } | null>(null);
  editorResetTrigger = signal<{ id: number; paneId: number } | null>(null);
  editorIsDirty = signal(false);

  onSaveGateway(): void {
    this.editorSaveTrigger.set({ id: Date.now(), paneId: this.activePaneId() });
  }

  onResetGateway(): void {
    this.editorResetTrigger.set({ id: Date.now(), paneId: this.activePaneId() });
  }

  isDeleteGatewayConfirmOpen = signal(false);
  gatewayToDelete = signal<string | null>(null);

  async onDeleteGateway(): Promise<void> {
    const profileId = this.gatewayToDelete() || this.pane1GatewayProfileId() || this.pane2GatewayProfileId();
    if (profileId) {
      await this.profileService.deleteProfile(profileId);
      this.isDeleteGatewayConfirmOpen.set(false);
      this.gatewayToDelete.set(null);
      await this.loadFolderTree();
      // Navigate back to Gateways root if we were editing
      const activeId = this.activePaneId();
      this.panePaths.update(paths => {
        const pathObj = paths.find(p => p.id === activeId);
        if (pathObj && pathObj.path.length > 1 && pathObj.path[0] === 'Gateways') {
          const otherPanes = paths.filter(p => p.id !== activeId);
          return [...otherPanes, { id: activeId, path: ['Gateways'] }];
        }
        return paths;
      });
    }
  }

  onDeleteGatewayById(id: string): void {
    this.gatewayToDelete.set(id);
    this.isDeleteGatewayConfirmOpen.set(true);
  }

  isDeleteServiceRegistryConfirmOpen = signal(false);
  serviceRegistryToDelete = signal<string | null>(null);

  async onDeleteServiceRegistry(): Promise<void> {
    const profileId = this.serviceRegistryToDelete() || this.pane1HostServerProfileId() || this.pane2HostServerProfileId();
    if (profileId) {
      await this.hostProfileService.deleteProfile(profileId);
      this.isDeleteServiceRegistryConfirmOpen.set(false);
      this.serviceRegistryToDelete.set(null);
      await this.loadFolderTree();
      // Navigate back to Service Registries root
      const activeId = this.activePaneId();
      this.panePaths.update(paths => {
        const pathObj = paths.find(p => p.id === activeId);
        if (pathObj && pathObj.path.length > 1 && pathObj.path[0] === 'Service Registries') {
          const otherPanes = paths.filter(p => p.id !== activeId);
          return [...otherPanes, { id: activeId, path: ['Service Registries'] }];
        }
        return paths;
      });
    }
  }

  onDeleteServiceRegistryById(id: string): void {
    this.serviceRegistryToDelete.set(id);
    this.isDeleteServiceRegistryConfirmOpen.set(true);
  }

  onAddServiceRegistry(): void {
    const name = prompt('Enter name for the new Service Registry:', `New Service Registry ${Date.now()}`);
    if (!name) return; // User cancelled

    const activeId = this.activePaneId();
    this.hostProfileService.saveProfile({
      id: Date.now().toString(),
      name,
      hostServerUrl: 'http://localhost:8000',
      imageUrl: '',
      status: 'ACTIVE'
    }).then(() => {
      this.loadFolderTree();
      this.panePaths.update(paths => {
        const otherPanes = paths.filter(p => p.id !== activeId);
        return [...otherPanes, { id: activeId, path: ['Service Registries', name] }];
      });
    });
  }

  onAddGateway = async (): Promise<void> => {
    const existingProfiles = this.profileService.profiles();
    let counter = 1;
    let newName = 'New Gateway';
    while (existingProfiles.some(p => p.name === newName)) {
      newName = `New Gateway (${counter++})`;
    }

    const newProfile = {
      name: newName,
      brokerUrl: 'localhost:8080',
      imageUrl: '',
      autoConnect: false,
    };

    await this.profileService.addProfile(newProfile);
    await this.loadFolderTree();

    const activeId = this.activePaneId();
    this.panePaths.update(paths => {
      const otherPanes = paths.filter(p => p.id !== activeId);
      return [...otherPanes, { id: activeId, path: ['Gateways', newName] }];
    });
  };

  onEditServiceRegistryByName(name: string): void {
    const activeId = this.activePaneId();
    this.panePaths.update(paths => {
      const otherPanes = paths.filter(p => p.id !== activeId);
      return [...otherPanes, { id: activeId, path: ['Service Registries', name] }];
    });
  }

  onEditGatewayByName(name: string): void {
    const activeId = this.activePaneId();
    this.panePaths.update(paths => {
      const otherPanes = paths.filter(p => p.id !== activeId);
      return [...otherPanes, { id: activeId, path: ['Gateways', name] }];
    });
  }


  // --- Toolbar State Management ---
  toolbarAction = signal<{ name: string; payload?: any; id: number } | null>(null);

  pane1SortCriteria = signal<SortCriteria>({ key: 'name', direction: 'asc' });
  pane2SortCriteria = signal<SortCriteria>({ key: 'name', direction: 'asc' });
  activeSortCriteria = computed(() => this.activePaneId() === 1 ? this.pane1SortCriteria() : this.pane2SortCriteria());

  pane1DisplayMode = signal<'grid' | 'list'>('grid');
  pane2DisplayMode = signal<'grid' | 'list'>('grid');
  activeDisplayMode = computed(() => this.activePaneId() === 1 ? this.pane1DisplayMode() : this.pane2DisplayMode());

  pane1FilterQuery = signal('');
  pane2FilterQuery = signal('');
  activeFilterQuery = computed(() => this.activePaneId() === 1 ? this.pane1FilterQuery() : this.pane2FilterQuery());

  isHomeContext = computed(() => this.activePanePath().length === 0);

  // Toolbar visibility signals
  showExtendedControls = computed(() => {
    const path = this.activePanePath();
    const sessionName = this.localConfigService.sessionName();

    // sessionName or File Systems as root
    if (path.length === 0 || path[0] === sessionName || path[0] === 'File Systems') {
      return true;
    }

    return false;
  });

  showAllToolbarControls = computed(() => {
    return true;
  });

  isStreamToolbarVisible = computed(() => {
    const path = this.activePanePath();
    if (path.length === 0) return false;

    const root = path[0];
    const sessionName = this.localConfigService.sessionName();

    return root === sessionName || root === 'File Systems' || root === 'Gateways';
  });

  isActionableContext = computed(() => {
    const path = this.activePanePath();
    if (path.length === 0) {
      return false; // Home root is not actionable
    }

    const rootName = path[0];
    const profile = this.profileService.profiles().find(p => p.name === rootName);

    if (profile) {
      // It's a server profile path, check if it's mounted
      return this.mountedProfileIds().includes(profile.id);
    }

    // It's not a server profile path, so it must be the local session, which is always actionable.
    // Also include management nodes (e.g., Infrastructure, Services) which are handled by getPlatformNodeForPath
    if (this.activePaneId() === 1 && this.pane1PlatformNode()) return true;
    if (this.activePaneId() === 2 && this.pane2PlatformNode()) return true;

    return true;
  });

  // States computed from active pane status for toolbar
  canCutCopyShareDelete = computed(() => this.isActionableContext() && this.activePaneStatus().selectedItemsCount > 0);
  canRename = computed(() => this.isActionableContext() && this.activePaneStatus().selectedItemsCount === 1);
  canPaste = computed(() => this.isActionableContext() && !!this.clipboardService.clipboard());
  canMagnetize = computed(() => this.isActionableContext() && this.activePaneStatus().selectedItemsCount > 0);

  // Import capability
  canImport = computed(() => {
    const activeId = this.activePaneId();
    const node = activeId === 1 ? this.pane1PlatformNode() : this.pane2PlatformNode();
    if (!node) return false;

    // Enable for Frameworks, Services, and Servers
    return ['frameworks', 'services', 'servers'].includes(node.type || '');
  });

  @ViewChild('importFileInput') importFileInput!: ElementRef<HTMLInputElement>;
  private platformManagementService = inject(PlatformManagementService);

  onToolbarImport(): void {
    if (this.canImport()) {
      if (this.uiPreferencesService.showImportDependencyWarning()) {
        this.isImportDependencyWarningOpen.set(true);
      } else {
        this.importFileInput.nativeElement.click();
      }
    }
  }

  onConfirmImportWarning(): void {
    if (this.importWarningDontShowAgain()) {
      this.uiPreferencesService.setImportDependencyWarning(false);
    }
    this.isImportDependencyWarningOpen.set(false);
    this.importFileInput.nativeElement.click();
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === 'string') {
          const data = JSON.parse(text);
          const activeId = this.activePaneId();
          const node = activeId === 1 ? this.pane1PlatformNode() : this.pane2PlatformNode();

          if (!node || !node.baseUrl || !Array.isArray(data)) {
            this.toastService.showError('Invalid import data or context.');
            return;
          }

          const baseUrl = node.baseUrl;
          this.toastService.showInfo(`Importing ${data.length} items...`);

          let successes = 0;
          let failures = 0;

          // Pre-load lookups based on context
          let serverTypes: any[] = [];
          let environmentTypes: any[] = [];
          let operatingSystems: any[] = [];
          let serviceTypes: any[] = [];
          let frameworks: any[] = [];
          let frameworkCategories: any[] = [];
          let frameworkLanguages: any[] = [];

          try {
            if (node.type === 'servers') {
              const [st, et, os] = await Promise.all([
                this.platformManagementService.getLookup(baseUrl, 'server-types'),
                this.platformManagementService.getLookup(baseUrl, 'environments'),
                this.platformManagementService.getLookup(baseUrl, 'operating-systems')
              ]);
              serverTypes = st;
              environmentTypes = et;
              operatingSystems = os;
            } else if (node.type === 'services') {
              const [fw, st] = await Promise.all([
                this.platformManagementService.getFrameworks(baseUrl),
                this.platformManagementService.getLookup(baseUrl, 'service-types')
              ]);
              frameworks = fw;
              serviceTypes = st;
            } else if (node.type === 'frameworks') {
              const [fc, fl] = await Promise.all([
                this.platformManagementService.getLookup(baseUrl, 'framework-categories'),
                this.platformManagementService.getLookup(baseUrl, 'framework-languages')
              ]);
              frameworkCategories = fc;
              frameworkLanguages = fl;
            }
          } catch (err) {
            console.error('Failed to load lookups', err);
            this.toastService.showError('Failed to load necessary reference data for import.');
            return;
          }

          for (const item of data) {
            try {
              if (node.type === 'frameworks') {
                // Map strings to IDs
                const category = frameworkCategories.find(c => c.name === item.category);
                const language = frameworkLanguages.find(l => l.name === item.language);

                // Remove string fields that conflict with backend relationships
                const { category: _c, language: _l, ...cleanedItem } = item;

                const payload: FrameworkPayload = {
                  ...cleanedItem,
                  categoryId: category ? category.id : item.categoryId,
                  languageId: language ? language.id : item.languageId,
                  vendorId: item.vendorId || undefined
                };
                await this.platformManagementService.createFramework(baseUrl, payload);

              } else if (node.type === 'services') {
                // Map strings to IDs
                const framework = frameworks.find(f => f.name === item.framework);
                const type = serviceTypes.find(t => t.name === item.type);

                if (!framework && !item.frameworkId) {
                  throw new Error(`Framework '${item.framework}' not found`);
                }

                // Remove string fields
                const { framework: _f, type: _t, ...cleanedItem } = item;

                const payload: ServicePayload = {
                  ...cleanedItem,
                  frameworkId: framework ? Number(framework.id) : item.frameworkId,
                  serviceTypeId: type ? type.id : item.serviceTypeId
                };
                await this.platformManagementService.createService(baseUrl, payload);

              } else if (node.type === 'servers') {
                // Map strings to IDs
                const st = serverTypes.find(t => t.name === item.type);
                const et = environmentTypes.find(e => e.name === item.environment);
                const os = operatingSystems.find(o => o.name === item.operatingSystem);

                // Remove string fields
                const { type: _t, environment: _e, operatingSystem: _o, ...cleanedItem } = item;

                // If mappings fail, fallback to existing IDs if present, or let it fail gracefully (or send what we have)
                const payload: Partial<Host> = {
                  ...cleanedItem,
                  serverTypeId: st ? st.id : item.serverTypeId,
                  environmentTypeId: et ? et.id : item.environmentTypeId,
                  operatingSystemId: os ? os.id : item.operatingSystemId
                };

                // Cleanup string fields that shouldn't be sent if we have IDs? 
                // The Host interface has 'status' as string, which is fine.
                // But fields like 'type', 'environment', 'operatingSystem' (if they exist in item) are not part of Host interface for creation (Host entity has relationships).
                // However, the Service/Controller might ignore unknown fields.
                // IMPORTANT: 'type' in Host interface is 'serverTypeId' (number). 
                // The interface I imported for Host has: serverTypeId: number

                await this.platformManagementService.createServer(baseUrl, payload);
              }
              successes++;
            } catch (err) {
              console.error('Import error for item', item, err);
              failures++;
            }
          }

          if (failures === 0) {
            this.toastService.showSuccess(`Successfully imported ${successes} items.`);
          } else {
            this.toastService.showWarning(`Imported ${successes} items. Failed to import ${failures} items.`);
          }

          // trigger refresh
          this.triggerRefresh();
        }
      } catch (err) {
        this.toastService.showError(`Error parsing file: ${(err as Error).message}`);
      }
      // Reset
      input.value = '';
    };
    reader.readAsText(file);
  }

  // --- Split View Resizing ---
  pane1Width = signal(this.uiPreferencesService.splitViewPaneWidth() ?? 50); // percentage
  private isResizingPane = false;
  private unlistenPaneResizeMove: (() => void) | null = null;
  private unlistenPaneResizeUp: (() => void) | null = null;

  @ViewChild('paneContainer') paneContainerEl!: ElementRef<HTMLDivElement>;

  // --- Stream Pane Resizing ---
  streamPaneHeight = signal(this.uiPreferencesService.explorerStreamHeight() ?? 25); // percentage
  private isResizingStream = false;
  private unlistenStreamResizeMove: (() => void) | null = null;
  private unlistenStreamResizeUp: (() => void) | null = null;

  @ViewChild('mainContentWrapper') mainContentWrapperEl!: ElementRef<HTMLDivElement>;

  // --- Console Pane Resizing ---
  consolePaneHeight = signal(this.uiPreferencesService.explorerConsoleHeight() ?? 20); // percentage
  private isResizingConsole = false;
  private unlistenConsoleResizeMove: (() => void) | null = null;
  private unlistenConsoleResizeUp: (() => void) | null = null;

  // --- Webview and Text Editor State ---
  webviewContent = this.webviewService.viewRequest;
  textEditorContent = this.textEditorService.viewRequest;

  // --- Bookmarks ---
  bookmarkedLinks = this.bookmarkService.bookmarkedLinks;

  // --- Theme Dropdown ---
  isThemeDropdownOpen = signal(false);
  themeMenuPosition = signal({ top: '0px', right: '0px' });
  themes: { id: Theme; name: string }[] = [
    { id: 'theme-light', name: 'Light' },
    { id: 'theme-steel', name: 'Steel' },
    { id: 'theme-dark', name: 'Dark' },
  ];
  currentTheme = this.uiPreferencesService.theme;

  // --- Idea Stream State ---
  streamResultsForPane1 = signal<StreamItem[]>([]);
  streamResultsForPane2 = signal<StreamItem[]>([]);
  streamDisplayMode = signal<'grid' | 'list'>('grid');
  streamSourceToggle = signal<'all' | 'active' | 'left' | 'right'>('active');
  streamSearchQuery = signal('');

  readonly streamFilterTypes: { type: StreamItemType; label: string; iconPath: string }[] = [
    { type: 'web', label: 'Web', iconPath: 'M10 18a8 8 0 100-16 8 8 0 000 16zM4.75 5.177a3.502 3.502 0 014.22.613l.31.39a.75.75 0 001.442 0l.31-.39a3.502 3.502 0 014.22-.613A4.502 4.502 0 0119 8.5v.081a4.5 4.5 0 01-5.138 4.417l-.27-1.353a.75.75 0 00-1.44-.288l-1.045 1.62a.75.75 0 00.288 1.441l1.354.27a4.5 4.5 0 01-4.416 5.137H8.5a4.502 4.502 0 01-3.323-1.413 3.502 3.502 0 01-.613-4.22l.39-.31a.75.75 0 000-1.442l-.39-.31a3.502 3.502 0 01-.613-4.22A4.502 4.502 0 014.75 5.177z' },
    { type: 'image', label: 'Images', iconPath: 'M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4V5h12v10zM6 8a1 1 0 100-2 1 1 0 000 2zm2 4l-2 3h8l-3-4-2 2.5L8 12z' },
    { type: 'youtube', label: 'Videos', iconPath: 'M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z' },
    { type: 'academic', label: 'Academic', iconPath: 'M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 16c1.255 0 2.443-.29 3.5-.804V4.804zM14.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 0114.5 16c1.255 0 2.443-.29 3.5-.804v-10A7.968 7.968 0 0014.5 4z' },
    { type: 'gemini', label: 'AI', iconPath: 'M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z' }
  ];
  activeStreamFilters = signal<Set<StreamItemType>>(new Set(this.streamFilterTypes.map(f => f.type)));

  isStreamSortDropdownOpen = signal(false);
  streamSortCriteria = signal<StreamSortCriteria>({ key: 'relevance', direction: 'asc' });

  // Filtered and sorted stream results for rendering
  visibleStreamResults = computed(() => {
    const source = this.streamSourceToggle();
    let combinedResults: StreamItem[] = [];

    if (source === 'all') {
      combinedResults = [...this.streamResultsForPane1(), ...this.streamResultsForPane2()];
    } else if (source === 'left') {
      combinedResults = this.streamResultsForPane1();
    } else if (source === 'right') {
      combinedResults = this.streamResultsForPane2();
    } else { // 'active'
      combinedResults = this.activePaneId() === 1 ? this.streamResultsForPane1() : this.streamResultsForPane2();
    }
    return combinedResults;
  });

  processedStreamResults = computed(() => {
    let items = this.visibleStreamResults();
    const query = this.streamSearchQuery().toLowerCase();
    const filters = this.activeStreamFilters();
    const sort = this.streamSortCriteria();

    // 1. Filter by query
    if (query) {
      items = items.filter(item => {
        if ('title' in item && item.title.toLowerCase().includes(query)) return true;
        if ('snippet' in item && item.snippet?.toLowerCase().includes(query)) return true;
        if ('description' in item && item.description?.toLowerCase().includes(query)) return true;
        if ('text' in item && item.text.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    // 2. Filter by type
    items = items.filter(item => filters.has(item.type));

    // 3. Sort
    items.sort((a, b) => {
      if (sort.key === 'relevance') {
        return 0; // Maintain original order which is assumed to be relevance
      }

      let valA: string = '';
      let valB: string = '';

      const getSource = (item: StreamItem): string => {
        switch (item.type) {
          case 'web':
            return item.source ?? '';
          case 'image':
            return item.source ?? '';
          case 'youtube':
            return item.channelTitle ?? '';
          case 'academic':
            return item.publication ?? '';
          case 'gemini':
            return 'Gemini';
        }
      };

      switch (sort.key) {
        case 'title':
          valA = ('title' in a ? a.title : ('description' in a ? a.description : a.query)) ?? '';
          valB = ('title' in b ? b.title : ('description' in b ? b.description : b.query)) ?? '';
          break;
        case 'source':
          valA = getSource(a);
          valB = getSource(b);
          break;
        case 'date':
          valA = a.publishedAt ?? '0';
          valB = b.publishedAt ?? '0';
          // For dates, we want newest first by default, so we reverse the comparison
          return new Date(valB).getTime() - new Date(valA).getTime();
      }
      return valA.localeCompare(valB, undefined, { sensitivity: 'base' });
    });

    return items;
  });

  // --- Pane Context Signals for Stream ---
  pane1Context = computed(() => {
    const path = this.pane1Path();
    const rootName = path.length > 0 ? path[0] : 'Home';
    const profile = this.profileService.profiles().find(p => p.name === rootName);
    const token = profile ? this.mountedProfileTokens().get(profile.id) : null;
    return { path, profile, token };
  });

  pane2Context = computed(() => {
    const path = this.pane2Path();
    const rootName = path.length > 0 ? path[0] : 'Home';
    const profile = this.profileService.profiles().find(p => p.name === rootName);
    const token = profile ? this.mountedProfileTokens().get(profile.id) : null;
    return { path, profile, token };
  });


  private treeAdapters = new Map<string, TreeProviderAdapter>();

  constructor() {
    // Initialize adapters for each Host Server root
    // Initialize adapters for each Host Server root
    // Services, Users, Search etc are now handled by ServiceMeshComponent and no longer mapped to file system
    // this.treeAdapters.set('Services', new TreeProviderAdapter(this.hostServerProvider, 'services'));
    // this.treeAdapters.set('Users', new TreeProviderAdapter(this.hostServerProvider, 'users'));
    // this.treeAdapters.set('File Systems', new TreeProviderAdapter(this.hostServerProvider, 'filesystems'));
    this.treeAdapters.set('Platform Management', new TreeProviderAdapter(this.registryServerProvider, 'platform'));

    this.homeProvider = {
      getContents: async (path: string[]): Promise<FileSystemNode[]> => {
        console.log('[homeProvider.getContents] path:', path);
        // Get Host Server children (for platform categories like Services, Users, etc.)
        const hostChildren = await this.registryServerProvider.getChildren('root');
        console.log('[homeProvider.getContents] hostChildren:', hostChildren.map(c => c.name));
        const hostNodes: FileSystemNode[] = hostChildren.map(node => {
          // Convert NodeType to FileType
          let fileType: 'folder' | 'file' | 'host-server' = 'folder';
          if (node.type === NodeType.FILE) {
            fileType = 'file';
          } else if (node.type === NodeType.HOST_SERVER) {
            fileType = 'host-server';
          }

          return {
            name: node.name,
            type: node.type === NodeType.HOST_SERVER ? 'host-server' :
              node.type === NodeType.FILE ? 'file' : 'folder',
            id: node.id,
            metadata: node.metadata,
            children: [],
            childrenLoaded: false,
            isServerRoot: false
          };
        });

        // Get Local Session
        const sessionNode = await this.sessionFs.getFolderTree();

        // Build broker gateway nodes for the Gateways folder
        const allBrokerProfiles = this.profileService.profiles();
        const mountedIds = this.mountedProfileIds();
        const brokerProfileNodes: FileSystemNode[] = allBrokerProfiles.map(p => {
          const isConnected = mountedIds.includes(p.id);
          return {
            name: p.name,
            type: 'folder' as const,
            isServerRoot: true,
            profileId: p.id,
            connected: isConnected,
            healthStatus: this.healthCheckService.getServiceStatus(p.imageUrl),
            modified: isConnected ? new Date().toISOString() : undefined,
            children: [],
            childrenLoaded: false,
          };
        });

        // Build host server profile nodes for the Host Servers folder
        const allHostProfiles = this.hostProfileService.profiles();
        const hostProfileNodes: FileSystemNode[] = allHostProfiles.map(p => ({
          name: p.name,
          type: 'folder' as const,
          isServerRoot: true,
          profileId: p.id,
          connected: true, // Host servers are considered connected if they exist
          healthStatus: this.healthCheckService.getServiceStatus(p.imageUrl),
          children: [],
          childrenLoaded: false,
        }));

        // Handle subdirectory paths for virtual organization folders
        if (path.length > 0) {
          const rootName = path[0];

          // Local Session - handle directly if it's at root level
          const sessionName = this.localConfigService.sessionName();
          if (rootName === sessionName) {
            // Path is like ['Local Session', ...], delegate to session provider
            // Adjust path to remove the root name for the session provider
            const sessionPath = path.slice(1);
            return this.sessionFs.getContents(sessionPath);
          }


          // File Systems folder
          if (rootName === 'File Systems') {
            // Return only connected gateways that offer file services
            const mountedIds = this.mountedProfileIds();
            const allBrokerProfiles = this.profileService.profiles();

            // Filter to only return profiles that are currently mounted/connected
            const connectedFileServiceGateways = allBrokerProfiles.filter(p =>
              mountedIds.includes(p.id)
            );

            // Convert to FileSystemNode format
            return connectedFileServiceGateways.map(profile => ({
              name: profile.name,
              type: 'folder' as FileType,
              isServerRoot: true,
              profileId: profile.id,
              connected: true,
              healthStatus: this.healthCheckService.getServiceStatus(profile.imageUrl),
              children: [],
              childrenLoaded: false,
            }));
          }

          // Gateways folder - contains broker gateway nodes
          if (rootName === 'Gateways') {
            return brokerProfileNodes;
          }

          // Service Registries folder
          if (rootName === 'Service Registries') {
            return hostProfileNodes;
          }

          // Platform Management folder - flat structure defaulting to primary registry
          if (rootName === 'Platform Management') {
            let currentNodeId = 'platform';

            if (path.length > 1) {
              // Traverse children starting from platform root
              for (let i = 1; i < path.length; i++) {
                const segment = path[i];
                const children = await this.registryServerProvider.getChildren(currentNodeId);
                const match = children.find(c => c.name === segment);
                if (match) {
                  currentNodeId = match.id;
                } else {
                  return [];
                }
              }
            }

            const nodes = await this.registryServerProvider.getChildren(currentNodeId);
            return nodes.map(node => {
              // Determine the type based on NodeType enum, converting to FileType
              let fileType: 'file' | 'folder' | 'host-server' = 'folder';
              if (node.type === NodeType.FILE) {
                fileType = 'file';
              } else if (node.type === NodeType.HOST_SERVER) {
                fileType = 'host-server';
              } else {
                fileType = 'folder';
              }

              return {
                name: node.name,
                type: fileType,
                id: node.id,
                metadata: node.metadata,
                children: [], // Children will be loaded on demand
                childrenLoaded: false, // Children are not loaded until the node is expanded
                isServerRoot: false
              };
            });
          }

          // Services - show empty (managed by HostServerProvider)
          const hostNodeNames = hostNodes.map(n => n.name).filter(n => n !== 'Platform Management' && n !== 'Search & Discovery' && n !== 'Servers' && n !== 'Users');
          if (hostNodeNames.includes(rootName)) {
            return []; // These nodes are placeholders, no children to show in main area
          }

          // Unknown path
          throw new Error(`Home provider does not support path: ${path.join('/')}`);
        }

        // Root path [] - return all children
        // Create "Gateways" virtual folder containing broker profiles
        const gatewaysNode: FileSystemNode = {
          name: 'Gateways',
          type: 'folder' as FileType,
          children: brokerProfileNodes,
          childrenLoaded: true,
          isVirtualFolder: true,
        };

        // Create "Service Registries" virtual folder containing host server profiles
        const serviceRegistriesNode: FileSystemNode = {
          name: 'Service Registries',
          type: 'folder' as FileType,
          children: hostProfileNodes,
          childrenLoaded: true,
          isVirtualFolder: true,
        };



        // Find the "File Systems" node and add Local Session as its child
        const fileSystemsNode = hostNodes.find(n => n.name === 'File Systems');
        if (fileSystemsNode) {
          fileSystemsNode.childrenLoaded = true;
        }

        // Find the "Search & Discovery" node to move it to root level
        const searchDiscoveryNode = hostNodes.find(n => n.name === 'Search & Discovery');

        // Find the "Users" node
        const usersNode = hostNodes.find(n => n.name === 'Users');

        // Filter out nodes we want to order manually
        const otherHostNodes = hostNodes.filter((n: FileSystemNode) =>
          n.name !== 'Users' &&
          n.name !== 'Search & Discovery' &&
          n.name !== 'Service Registries' &&
          n.id !== 'service-registries' &&
          n.name !== 'File Systems' &&
          n.name !== 'Platform Management'
        );

        const platformNode = hostNodes.find(n => n.name === 'Platform Management');

        const rootChildren = [
          ...otherHostNodes,
          ...(fileSystemsNode ? [fileSystemsNode] : []),
          gatewaysNode,
          ...(platformNode ? [platformNode] : []),
          serviceRegistriesNode,
          sessionNode,
          ...(usersNode ? [usersNode] : []),
          ...(searchDiscoveryNode ? [searchDiscoveryNode] : [])
        ];

        // Sort alphabetically (case-insensitive)
        rootChildren.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

        console.log('[homeProvider.getContents] returning rootChildren:', rootChildren.map(c => c.name));
        return rootChildren;
      },
      getFolderTree: () => this.buildCombinedFolderTree(),
      ...readOnlyProviderOps,
    };

    // --- Effects ---
    // Update theme class on body when theme changes
    effect(() => {
      const theme = this.currentTheme();
      this.renderer.removeClass(this.document.body, 'theme-light');
      this.renderer.removeClass(this.document.body, 'theme-steel');
      this.renderer.removeClass(this.document.body, 'theme-dark');
      this.renderer.addClass(this.document.body, theme);
    });

    // Monitor health of server profiles
    effect(() => {
      const brokerProfiles = this.profileService.profiles();
      const hostProfiles = this.hostProfileService.profiles();
      const allProfiles = [
        ...brokerProfiles,
        ...hostProfiles.map(p => ({ imageUrl: p.imageUrl, healthCheckDelayMinutes: undefined }))
      ];
      this.healthCheckService.syncMonitoredProfiles(allProfiles);
    });

    // Reactive Folder Tree and Auto-Connect
    effect(() => {
      // Rebuilds the master folder tree whenever the list of server profiles changes,
      // or when the connection status (mounted profiles) of any profile changes. This ensures
      // the tree view is always in sync with the application's connection state.
      this.profileService.profiles(); // Dependency
      this.mountedProfiles(); // Dependency
      this.healthCheckService.statusMap(); // Dependency
      this.loadFolderTree();

      // Handles auto-connecting on startup, once profiles are loaded.
      if (!this.initialAutoConnectAttempted) {
        const profiles = this.profileService.profiles();
        if (profiles.length > 0) {
          this.initialAutoConnectAttempted = true;
          for (const profile of profiles) {
            if (profile.autoConnect) {
              // Attempt to auto-connect without credentials. This is a placeholder for a
              // more robust session/token management system. For now, we assume this is
              // only for profiles that don't need interactive login.
              this.onLoginAndMount({ profile, username: 'auto-user', password: 'auto-password' });
            }
          }
        }
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    // Initialization is now handled reactively by effects in the constructor.
    // This method is kept to satisfy the OnInit interface, but can be left empty.
  }

  ngOnDestroy(): void {
    this.stopPaneResize();
    this.stopStreamResize();
    this.stopConsoleResize();
  }

  getProvider = (path: string[]): FileSystemProvider => {
    if (path.length === 0) return this.homeProvider;
    const rootName = path[0];

    // Handle "Gateways" virtual folder - broker gateways are nested under it
    if (rootName === 'Gateways') {
      if (path.length === 1) {
        // At the Gateways folder level itself - return home provider 
        // (children are already loaded in the tree)
        return this.homeProvider;
      }
      // Path is like ['Gateways', 'ServerName', ...]
      const serverName = path[1];
      const remoteProvider = this.remoteProviders().get(serverName);
      if (remoteProvider) {
        return remoteProvider;
      }
      // Server is known but not mounted
      const isServerProfile = this.profileService.profiles().some(p => p.name === serverName);
      if (isServerProfile) {
        return disconnectedProvider;
      }
      return this.homeProvider;
    }

    // Handle Local Session at root level
    const sessionName = this.localConfigService.sessionName();
    if (rootName === sessionName) {
      // Path is like ['Local Session', ...], use session provider
      return this.sessionFs;
    }

    // Handle "File Systems" folder - contains connected gateways that offer file services
    if (rootName === 'File Systems') {
      if (path.length === 1) {
        // At the File Systems folder level itself
        return this.homeProvider;
      }
      // Path is like ['File Systems', 'GatewayName', ...]
      const gatewayName = path[1];
      const remoteProvider = this.remoteProviders().get(gatewayName);
      if (remoteProvider) {
        // Return the remote provider for the specific gateway
        return remoteProvider;
      }
      // Gateway is known but not connected
      const isKnownGateway = this.profileService.profiles().some(p => p.name === gatewayName);
      if (isKnownGateway) {
        return disconnectedProvider;
      }
      return this.homeProvider;
    }

    // Handle "Service Registries" virtual folder - host server profiles are nested under it
    if (rootName === 'Service Registries') {
      if (path.length === 1) {
        // At the Service Registries folder level itself - return home provider
        // (children are already loaded in the tree)
        return this.homeProvider;
      }
      // Path is like ['Service Registries', 'ProfileName', ...]
      // For now, host server profiles don't have navigable children in file explorer
      // They are informational only
      return this.homeProvider;
    }

    // Handle virtual organization folders (Platform Management, Users, Services)
    // These are top-level categories that don't have navigable children in the file explorer main area
    const virtualOrgFolders = ['Platform Management', 'Users', 'Services'];
    if (virtualOrgFolders.includes(rootName)) {
      // Return homeProvider which handles these paths with special logic
      return this.homeProvider;
    }

    // Check if it's one of the Host Server root nodes (for tree navigation only)
    if (this.treeAdapters.has(rootName)) {
      return this.treeAdapters.get(rootName)!;
    }

    // Legacy/fallback: Check if the root of the path corresponds to a known server profile directly
    // (This supports old paths like ['ServerName', ...] for backwards compatibility)
    const isServerProfile = this.profileService.profiles().some(p => p.name === rootName);

    if (isServerProfile) {
      const remoteProvider = this.remoteProviders().get(rootName);
      if (remoteProvider) {
        // The server is mounted, return its specific provider.
        return remoteProvider;
      } else {
        // The server is known but not mounted, return the disconnected provider.
        return disconnectedProvider;
      }
    }

    // If the path does not point to a server, it must be the local session.
    return this.sessionFs;
  }

  getImageService = (path: string[]): ImageService => {
    let effectiveRootName = path.length > 0 ? path[0] : this.localConfigService.sessionName();

    // Handle "Gateways" virtual folder - server name is at path[1]
    if (effectiveRootName === 'Gateways' && path.length > 1) {
      effectiveRootName = path[1];
    }

    // Handle "File Systems" folder - Local Session is at path[1]
    if (effectiveRootName === 'File Systems' && path.length > 1) {
      effectiveRootName = path[1];
    }

    const remote = this.remoteImageServices().get(effectiveRootName);

    // Check if it's a HOST_SERVER
    // In HostServerProvider, we use 'host-<profileId>' for ID, but name is profile.name
    // We can check if the profile type is 'host'
    const profile = this.profileService.profiles().find(p => p.name === effectiveRootName);
    // const isHostServer = profile?.type === 'host'; // BrokerProfile no longer has type

    if (remote) {
      // We need to intercept the getIconUrl call or subclass/wrap the service
      // But cleaner is to let ImageService handle a "force default image name" logic
      // For now, let's just return the service. The caller (FileExplorer) calls getIconUrl.
      // Wait, the caller passes the item. We need to tell ImageService to override.
      // It seems simpler to modify ImageService.getIconUrl to accept an optional 'overrideName'.
      // BUT, getImageService returns the service instance.
      // Let's modify how ImageService is constructed or used?
      // Actually, the ImageService instance is cached in remoteImageServices.
      // Maybe we just attach a property to the service instance?
      // Or better, let's look at how getIconUrl is CALLED.
      // It is called in file-explorer.component.html: imageService.getIconUrl(item)
      // We can't easily change the call site to know about host-server type without logic there.

      // Alternative: The HostServerProvider sets the node type to HOST_SERVER (which we added).
      // If we change the ImageService.getIconUrl to handle HOST_SERVER type specifically?
      // But ImageService takes a generic FileSystemNode.
      return remote;
    }

    // Fallback for local session or if no remote service is found
    const localProfile: BrokerProfile = {
      id: 'local-session',
      name: this.localConfigService.sessionName(),
      brokerUrl: '', // not used for images
      imageUrl: this.localConfigService.defaultImageUrl(),
    };
    return new ImageService(localProfile, this.imageClientService, this.preferencesService, this.healthCheckService, this.localConfigService);
  }

  async buildCombinedFolderTree(): Promise<FileSystemNode> {
    const sessionTree = await this.sessionFs.getFolderTree();
    const allProfiles = this.profileService.profiles();
    const mountedIds = this.mountedProfileIds();
    const remoteRoots: FileSystemNode[] = [];

    // Host Server Nodes
    const hostChildren = await this.registryServerProvider.getChildren('root');
    const hostNodes: FileSystemNode[] = hostChildren.map(node => ({
      name: node.name,
      type: 'folder' as FileType,
      id: node.id,
      metadata: node.metadata,
      children: [],
      childrenLoaded: false,
      isServerRoot: false
    }));

    // Build broker gateway nodes
    for (const profile of allProfiles) {
      const isConnected = mountedIds.includes(profile.id);

      if (isConnected) {
        const provider = this.remoteProviders().get(profile.name);
        if (provider) {
          try {
            const remoteTree = await provider.getFolderTree();
            remoteRoots.push({
              ...remoteTree,
              name: profile.name, // Ensure the root name is the profile name
              isServerRoot: true,
              profileId: profile.id,
              connected: true,
              healthStatus: this.healthCheckService.getServiceStatus(profile.imageUrl),
            });
          } catch (e) {
            console.error(`Failed to get folder tree for ${profile.name}`, e);
            // Fallback to a disconnected-style node on error
            remoteRoots.push({
              name: profile.name,
              type: 'folder' as FileType,
              isServerRoot: true,
              profileId: profile.id,
              connected: false,
              healthStatus: this.healthCheckService.getServiceStatus(profile.imageUrl),
              children: [],
            });
          }
        } else {
          // This case indicates an inconsistency (mounted but no provider). Show as disconnected.
          remoteRoots.push({
            name: profile.name,
            type: 'folder' as FileType,
            isServerRoot: true,
            profileId: profile.id,
            connected: false,
            healthStatus: this.healthCheckService.getServiceStatus(profile.imageUrl),
            children: [],
          });
        }
      } else {
        // Profile is not connected
        remoteRoots.push({
          name: profile.name,
          type: 'folder' as FileType,
          isServerRoot: true,
          profileId: profile.id,
          connected: false,
          healthStatus: this.healthCheckService.getServiceStatus(profile.imageUrl),
          children: [],
        });
      }
    }

    // Create "Gateways" parent node for broker gateways
    const gatewaysNode: FileSystemNode = {
      name: 'Gateways',
      type: 'folder' as FileType,
      children: remoteRoots,
      childrenLoaded: true,
      isVirtualFolder: true, // Mark as a virtual organizational folder
    };

    // Find the "File Systems" node
    const fileSystemsNode = hostNodes.find(n => n.name === 'File Systems');
    if (fileSystemsNode) {
      fileSystemsNode.childrenLoaded = true;
    }

    // Prepare the Local Session to be added at root level
    if (sessionTree.children) {
      sessionTree.children = sessionTree.children.filter((c: FileSystemNode) => c.name !== 'Search & Discovery');
    }

    // Build host server profile nodes for the Service Registries folder
    const allHostProfiles = this.hostProfileService.profiles();
    const hostProfileNodes: FileSystemNode[] = allHostProfiles.map(p => ({
      name: p.name,
      type: 'folder' as const,
      isServerRoot: true,
      profileId: p.id,
      connected: true, // Host servers are considered connected if they exist
      healthStatus: this.healthCheckService.getServiceStatus(p.imageUrl),
      children: [],
      childrenLoaded: false,
    }));

    // Create "Service Registries" parent node
    const serviceRegistriesNode: FileSystemNode = {
      name: 'Service Registries',
      type: 'folder' as FileType,
      children: hostProfileNodes,
      childrenLoaded: true,
      isVirtualFolder: true,
    };

    // Filter out specific nodes for manual ordering
    const otherHostNodes = hostNodes.filter((n: FileSystemNode) =>
      n.name !== 'File Systems' &&
      n.name !== 'Search & Discovery' &&
      n.name !== 'Platform Management'
    );

    const platformNode = hostNodes.find(n => n.name === 'Platform Management');

    // Build the final tree structure alphabetically
    const rootChildren = [
      ...otherHostNodes,
      ...(fileSystemsNode ? [fileSystemsNode] : []),
      gatewaysNode,
      ...(platformNode ? [platformNode] : []),
      ...(allHostProfiles.length > 0 ? [serviceRegistriesNode] : []),
      sessionTree,
    ];

    // Sort alphabetically (case-insensitive)
    rootChildren.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return {
      name: 'Home',
      type: 'folder' as FileType,
      children: rootChildren,
      childrenLoaded: true,
    };
  }

  localSessionNode = computed(() => {
    const tree = this.folderTree();
    if (!tree?.children) return null;
    return tree.children.find(c => !c.isServerRoot) ?? null;
  });

  async loadFolderTree(): Promise<void> {
    this.folderTree.set(await this.buildCombinedFolderTree());
  }



  onLoadChildren = async (path: string[]) => {
    const provider = this.getProvider(path);
    const rootName = path[0];

    // Platform Management uses homeProvider but still needs lazy loading
    const needsLazyLoading = rootName === 'Platform Management';

    if (provider === this.homeProvider && !needsLazyLoading) {
      // Home provider children are already loaded, no need to lazy load
      return;
    }

    // For sessionFs, the children are also fully loaded
    if (provider === this.sessionFs) {
      return;
    }

    try {
      // Calculate the provider-relative path by removing the routing prefix
      let providerPath: string[];

      if (rootName === 'Gateways' && path.length > 1) {
        // Path is ['Gateways', 'ServerName', ...], provider expects path without 'Gateways' and 'ServerName'
        providerPath = path.slice(2);
      } else if (rootName === 'File Systems' && path.length > 1) {
        // Path is ['File Systems', 'Local Session', ...], provider expects path without both prefixes
        providerPath = path.slice(2);
      } else if (rootName === 'Platform Management') {
        // Platform Management uses homeProvider with full path
        providerPath = path;
      } else {
        // Legacy or other paths: just remove the root name
        providerPath = path.slice(1);
      }

      const children = await provider.getContents(providerPath);

      this.folderTree.update(currentTree => {
        if (!currentTree) return null;

        // Recursive function to perform an immutable update on the tree
        const updateNodeRecursive = (node: FileSystemNode, currentPathSegments: string[]): FileSystemNode => {
          // If we've reached the target node...
          if (currentPathSegments.length === 0) {
            return {
              ...node,
              childrenLoaded: true,
              children: children.map(child => ({
                ...child,
                children: child.type === 'folder' ? [] : undefined,
                childrenLoaded: child.type !== 'folder',
              })),
            };
          }

          // If we're still traversing, find the next child in the path
          const nextSegment = currentPathSegments[0];
          const remainingSegments = currentPathSegments.slice(1);

          return {
            ...node,
            children: (node.children ?? []).map(child => {
              if (child.name === nextSegment) {
                // This is the child we need to recurse into
                return updateNodeRecursive(child, remainingSegments);
              }
              // This is not the child we're looking for, return it as is
              return child;
            }),
          };
        };

        // Start the recursive update from the root node.
        return updateNodeRecursive(currentTree, path);
      });

    } catch (e) {
      this.toastService.show(`Error loading contents for ${path.join('/')}: ${(e as Error).message}`, 'error');
    }
  }

  // --- Pane Management ---
  setActivePane(id: number): void {
    this.toolbarAction.set(null);
    this.activePaneId.set(id);
  }

  toggleSplitView(): void {
    this.isSplitView.update(v => !v);
    const currentPaths = this.panePaths();
    if (this.isSplitView() && !currentPaths.find(p => p.id === 2)) {
      // When opening split view, mirror the active pane's path
      const activePath = this.activePanePath();
      this.panePaths.update(paths => [...paths, { id: 2, path: activePath }]);
    } else if (!this.isSplitView()) {
      // When closing, keep only the active pane's path
      const activeId = this.activePaneId();
      this.panePaths.update(paths => paths.filter(p => p.id === activeId));
      if (activeId === 2) {
        this.panePaths.update(paths => [{ id: 1, path: paths[0]?.path ?? [] }]);
        this.activePaneId.set(1);
      }
    }
  }

  onPane1PathChanged(path: string[]): void {
    this.toolbarAction.set(null);
    this.panePaths.update(paths => {
      const newPaths = paths.filter(p => p.id !== 1);
      return [...newPaths, { id: 1, path }];
    });
  }

  onPane2PathChanged(path: string[]): void {
    this.toolbarAction.set(null);
    this.panePaths.update(paths => {
      const newPaths = paths.filter(p => p.id !== 2);
      return [...newPaths, { id: 2, path }];
    });
  }

  goUpActivePane(): void {
    if (!this.canGoUpActivePane()) return;
    const activeId = this.activePaneId();
    this.panePaths.update(paths => {
      const pane = paths.find(p => p.id === activeId);
      if (pane) {
        const newPath = pane.path.slice(0, -1);
        const otherPanes = paths.filter(p => p.id !== activeId);
        return [...otherPanes, { id: activeId, path: newPath }];
      }
      return paths;
    });
  }

  navigatePathActivePane(index: number): void {
    const activeId = this.activePaneId();
    const currentPath = this.activePanePath();
    const newPath = currentPath.slice(0, index + 1);

    this.panePaths.update(paths => {
      const otherPanes = paths.filter(p => p.id !== activeId);
      return [...otherPanes, { id: activeId, path: newPath }];
    });
  }

  onItemSelectedInPane(item: FileSystemNode | null): void {
    this.selectedDetailItem.set(item);
  }

  onPane1StatusChanged(status: PaneStatus): void {
    this.pane1Status.set(status);
  }

  onPane2StatusChanged(status: PaneStatus): void {
    this.pane2Status.set(status);
  }


  // --- UI Toggles ---
  toggleDetailPane(): void {
    this.uiPreferencesService.toggleDetailPane();
  }

  toggleSidebar(): void {
    this.uiPreferencesService.toggleSidebar();
  }

  toggleTree(): void {
    this.uiPreferencesService.toggleTree();
  }

  toggleChat(): void {
    this.uiPreferencesService.toggleChat();
  }

  toggleNotes(): void {
    this.uiPreferencesService.toggleNotes();
  }

  toggleSavedItems(): void {
    this.uiPreferencesService.toggleSavedItems();
  }

  toggleRssFeed(): void {
    this.uiPreferencesService.toggleRssFeed();
  }

  toggleStream(): void {
    this.uiPreferencesService.toggleStream();
  }

  toggleConsole(): void {
    this.uiPreferencesService.toggleConsole();
  }

  toggleStreamPaneCollapse(): void {
    this.uiPreferencesService.toggleStreamPaneCollapse();
  }

  toggleStreamActiveSearch(): void {
    this.uiPreferencesService.toggleStreamActiveSearch();
  }

  triggerRefresh(): void {
    this.refreshPanes.update(v => v + 1);
  }

  toggleViewMode(): void {
    this.currentViewMode.update(mode =>
      mode === 'file-explorer' ? 'service-mesh' : 'file-explorer'
    );
  }

  onMeshViewModeChange(mode: 'console' | 'graph'): void {
    this.meshViewMode.set(mode);
  }

  onGraphSubViewChange(view: 'canvas' | 'creator'): void {
    this.graphSubView.set(view);
  }

  onRefreshServices(): void {
    this.serviceMeshService.fetchAllData();
  }

  // --- Graph Visualization Control Handlers ---
  onGraphModeChange(mode: 'camera' | 'edit'): void {
    this.vizService.setMode(mode);
  }

  onToggleSimulation(): void {
    const isActive = this.vizService.isSimulationActive();
    this.vizService.toggleSimulation(!isActive);
  }

  onSaveGraph(): void {
    const data = this.vizService.exportScene();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = 'service-mesh-graph.json';
    a.click();
    URL.revokeObjectURL(url);
    this.toastService.show('Graph saved successfully', 'success');
  }

  onLoadGraph(): void {
    const input = this.document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result as string);
            this.vizService.importScene(data);
            this.toastService.show('Graph loaded successfully', 'success');
          } catch (err) {
            this.toastService.show('Failed to load graph file', 'error');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  onBackgroundColorChange(color: string): void {
    this.graphBackgroundColor.set(color);
    this.vizService.setBackgroundColor(color);
  }

  onZoomIn(): void {
    this.vizService.zoomIn();
  }

  onZoomOut(): void {
    this.vizService.zoomOut();
  }

  onRotateLeft(): void {
    this.vizService.rotateCamera(-Math.PI / 8);
  }

  onRotateRight(): void {
    this.vizService.rotateCamera(Math.PI / 8);
  }

  onResetCamera(): void {
    this.vizService.resetCamera();
  }

  onClearGraph(): void {
    this.vizService.clearScene();
    this.toastService.show('Graph cleared', 'info');
  }

  // --- Toolbar Action Handling ---
  // --- Toolbar Action Handling ---
  onToolbarAction(name: string, payload?: any): void {
    if (name === 'delete') {
      if (this.isGatewaySelected()) {
        this.isDeleteGatewayConfirmOpen.set(true);
        return;
      }
      if (this.isServiceRegistrySelected()) {
        this.isDeleteServiceRegistryConfirmOpen.set(true);
        return;
      }
    }

    if (name === 'rename') {
      if ((this.isGatewayContext() && this.isGatewaysNodeSelected()) ||
        (this.isServiceRegistryContext() && this.isServiceRegistriesNodeSelected())) {
        // Handled by management component
        return;
      }
    }

    this.toolbarAction.set({ name, payload, id: Date.now() });
  }

  onSortChange(criteria: SortCriteria): void {
    if (this.activePaneId() === 1) {
      this.pane1SortCriteria.set(criteria);
    } else {
      this.pane2SortCriteria.set(criteria);
    }
  }

  onDisplayModeChange(mode: 'grid' | 'list'): void {
    if (this.activePaneId() === 1) {
      this.pane1DisplayMode.set(mode);
    } else {
      this.pane2DisplayMode.set(mode);
    }
  }

  onFilterChange(query: string): void {
    if (this.activePaneId() === 1) {
      this.pane1FilterQuery.set(query);
    } else {
      this.pane2FilterQuery.set(query);
    }
  }

  // --- Sidebar Navigation ---
  onSidebarNavigation(path: string[]): void {
    this.toolbarAction.set(null);
    const activeId = this.activePaneId();
    this.panePaths.update(paths => {
      const otherPanes = paths.filter(p => p.id !== activeId);
      return [...otherPanes, { id: activeId, path }];
    });

    // Check if the selected node is "Service Mesh"
    const isServiceMesh = path.length > 0 && path[path.length - 1] === 'Service Mesh';

    if (isServiceMesh) {
      if (this.currentViewMode() !== 'service-mesh') {
        this.currentViewMode.set('service-mesh');
      }
    } else {
      if (this.currentViewMode() !== 'file-explorer') {
        this.currentViewMode.set('file-explorer');
      }
    }
  }


  // --- Local Config Dialog ---
  openLocalConfigDialog(): void {
    this.isLocalConfigDialogOpen.set(true);
  }

  closeLocalConfigDialog(): void {
    this.isLocalConfigDialogOpen.set(false);
  }

  onLocalConfigSaved(config: LocalConfig): void {
    this.localConfigService.updateConfig(config);
    this.closeLocalConfigDialog();
    this.loadFolderTree(); // Reload tree to reflect new session name
    this.toastService.show('Local configuration saved.');
  }

  // --- RSS Feeds Dialog ---
  openRssFeedsDialog(): void {
    this.isRssFeedsDialogOpen.set(true);
  }

  closeRssFeedsDialog(): void {
    this.isRssFeedsDialogOpen.set(false);
  }

  // --- Import / Export ---
  async handleImport(event: { destPath: string[], data: FileSystemNode }): Promise<void> {
    try {
      await this.sessionFs.importTree(event.destPath.slice(1), event.data);
      this.isImportDialogOpen.set(false);
      this.loadFolderTree();
      this.toastService.show('Folder structure imported successfully.');
    } catch (e) {
      this.toastService.show(`Import failed: ${(e as Error).message}`, 'error');
    }
  }

  async handleExport(event: { node: FileSystemNode, path: string[] }): Promise<void> {
    try {
      const json = JSON.stringify(event.node, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.node.name || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.isExportDialogOpen.set(false);
    } catch (e) {
      this.toastService.show(`Export failed: ${(e as Error).message}`, 'error');
    }
  }

  // --- Login and Connection Management ---
  async onLoginAndMount({ profile, username, password }: { profile: BrokerProfile, username: string, password: string }): Promise<void> {
    try {
      const { user, token } = await this.loginService.login(profile, username, password);

      const provider = new RemoteFileSystemService(profile, this.fsService, token);
      const imageService = new ImageService(profile, this.imageClientService, this.preferencesService, this.healthCheckService, this.localConfigService);

      this.mountedProfiles.update(p => [...p, profile]);
      this.mountedProfileUsers.update(m => new Map(m).set(profile.id, user));
      this.mountedProfileTokens.update(m => new Map(m).set(profile.id, token));
      this.remoteProviders.update(m => new Map(m).set(profile.name, provider));
      this.remoteImageServices.update(m => new Map(m).set(profile.name, imageService));
      this.notesService.setToken(profile.id, token);

      await this.loadFolderTree();

      this.toastService.show(`Successfully connected to ${profile.name}.`);

    } catch (e) {
      const profileName = profile ? profile.name : 'the server';
      this.toastService.show(`Login to ${profileName} failed: ${(e as Error).message}`, 'error');
    }
  }

  onUnmountProfile(profile: BrokerProfile): void {
    this.mountedProfiles.update(p => p.filter(item => item.id !== profile.id));

    this.mountedProfileUsers.update(m => {
      const newMap = new Map(m);
      newMap.delete(profile.id);
      return newMap;
    });

    this.mountedProfileTokens.update(m => {
      const newMap = new Map(m);
      newMap.delete(profile.id);
      return newMap;
    });

    this.remoteProviders.update(m => {
      const newMap = new Map(m);
      newMap.delete(profile.name);
      return newMap;
    });

    this.remoteImageServices.update(m => {
      const newMap = new Map(m);
      newMap.delete(profile.name);
      return newMap;
    });

    this.notesService.removeToken(profile.id);

    // If any pane was inside the unmounted profile, navigate it to root
    this.panePaths.update(paths => {
      return paths.map(p => {
        if (p.path[0] === profile.name) {
          return { ...p, path: [] };
        }
        return p;
      });
    });

    this.loadFolderTree();
    this.toastService.show(`Disconnected from ${profile.name}.`);
  }

  onConnectToServer(profileId: string): void {
    const profile = this.profileService.profiles().find(p => p.id === profileId);
    if (profile) {
      this.profileForLogin.set(profile);
    }
  }

  onDisconnectFromServer(profileId: string): void {
    const profile = this.mountedProfiles().find(p => p.id === profileId);
    if (profile) {
      this.onUnmountProfile(profile);
    }
  }

  onEditServerProfile(profileId: string): void {
    // Try broker profiles first
    const brokerProfile = this.profileService.profiles().find(p => p.id === profileId);
    if (brokerProfile) {
      const activeId = this.activePaneId();
      this.panePaths.update(paths => {
        const otherPanes = paths.filter(p => p.id !== activeId);
        return [...otherPanes, { id: activeId, path: ['Gateways', brokerProfile.name] }];
      });
      return;
    }

    // Try host profiles second
    const hostProfile = this.hostProfileService.profiles().find(p => p.id === profileId);
    if (hostProfile) {
      const activeId = this.activePaneId();
      this.panePaths.update(paths => {
        const otherPanes = paths.filter(p => p.id !== activeId);
        return [...otherPanes, { id: activeId, path: ['Host Servers', hostProfile.name] }];
      });
    }
  }

  onServerProfileRenamed(event: { oldName: string, newName: string, profile: BrokerProfile }): void {
    const { oldName, newName, profile } = event;

    // 1. Update remoteProviders and remoteImageServices keys if the profile is mounted
    if (this.remoteProviders().has(oldName)) {
      const provider = this.remoteProviders().get(oldName)!;
      this.remoteProviders.update(m => {
        const newMap = new Map(m);
        newMap.delete(oldName);
        newMap.set(newName, provider);
        return newMap;
      });

      const imageService = this.remoteImageServices().get(oldName)!;
      this.remoteImageServices.update(m => {
        const newMap = new Map(m);
        newMap.delete(oldName);
        newMap.set(newName, imageService);
        return newMap;
      });
    }

    // 2. Update paths in any open panes
    this.panePaths.update(paths => {
      return paths.map(panePath => {
        if (panePath.path[0] === oldName) {
          return { ...panePath, path: [newName, ...panePath.path.slice(1)] };
        }
        return panePath;
      });
    });

    // 3. Reload the folder tree to reflect the name change
    this.loadFolderTree();
  }

  onLoginSubmittedFromSidebar({ username, password }: { username: string, password: string }): void {
    const profile = this.profileForLogin();
    if (profile) {
      this.onLoginAndMount({ profile, username, password });
      this.profileForLogin.set(null);
    } else {
      console.error("Login submitted but no profile was selected for login.");
      this.toastService.show('Login failed: No profile selected.', 'error');
    }
  }

  // --- Drag & Drop for Bookmarks ---
  onBookmarkDroppedOnPane(event: { bookmark: NewBookmark, dropOn: FileSystemNode }): void {
    const destPath = [...this.activePanePath(), event.dropOn.name];
    this.bookmarkService.addBookmark(destPath, event.bookmark);
    this.toastService.show(`Bookmark saved to ${event.dropOn.name}.`);
  }

  onBookmarkDroppedOnSidebar(event: { bookmark: NewBookmark, destPath: string[] }): void {
    this.bookmarkService.addBookmark(event.destPath, event.bookmark);
    this.toastService.show(`Bookmark saved.`);
  }

  // --- File/Folder Item Manipulation (from panes or sidebar) ---
  onPaneItemRenamed(event: { oldName: string, newName: string }, path: string[]): void {
    const oldFullPath = [...path, event.oldName];
    const newFullPath = [...path, event.newName];
    this.folderPropertiesService.handleRename(oldFullPath, newFullPath);
    this.loadFolderTree();
  }

  onSidebarRenameItem(event: { path: string[], newName: string }): void {
    const oldName = event.path[event.path.length - 1];
    const parentPath = event.path.slice(0, -1);
    const provider = this.getProvider(parentPath);
    const providerPath = parentPath.length > 0 ? parentPath.slice(1) : [];

    provider.rename(providerPath, oldName, event.newName)
      .then(() => {
        this.folderPropertiesService.handleRename(event.path, [...parentPath, event.newName]);
        this.loadFolderTree();
        this.toastService.show('Item renamed.');
      })
      .catch(e => this.toastService.show(`Rename failed: ${(e as Error).message}`, 'error'));
  }

  onItemsDeleted(paths: string[][]): void {
    for (const path of paths) {
      this.folderPropertiesService.handleDelete(path);
    }
    this.loadFolderTree();
  }

  onSidebarDeleteItem(path: string[]): void {
    const name = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const provider = this.getProvider(path);
    const providerPath = parentPath.length > 0 ? parentPath.slice(1) : [];

    // We need to know if it's a file or folder
    provider.getContents(providerPath).then(contents => {
      const item = contents.find(c => c.name === name);
      if (!item) {
        throw new Error("Item not found for deletion.");
      }
      const promise = item.type === 'folder'
        ? provider.removeDirectory(providerPath, name)
        : provider.deleteFile(providerPath, name);

      promise.then(() => {
        this.folderPropertiesService.handleDelete(path);
        this.loadFolderTree();
        this.toastService.show('Item deleted.');
      }).catch(e => this.toastService.show(`Delete failed: ${(e as Error).message}`, 'error'));
    }).catch(e => this.toastService.show(`Delete failed: ${(e as Error).message}`, 'error'));
  }

  onItemsMoved(event: { sourcePath: string[]; destPath: string[]; items: ItemReference[] }): void {
    for (const item of event.items) {
      if (item.type === 'folder') {
        const oldFullPath = [...event.sourcePath, item.name];
        const newFullPath = [...event.destPath, item.name];
        this.folderPropertiesService.handleRename(oldFullPath, newFullPath);
      }
    }
    this.loadFolderTree();
    this.triggerRefresh();
  }

  onSidebarItemsMoved(event: { destPath: string[]; payload: DragDropPayload }): void {
    if (event.payload.type !== 'filesystem') return;

    const { sourceProvider, sourcePath, items } = event.payload.payload;
    const destProvider = this.getProvider(event.destPath);

    // Moving between providers is not supported yet.
    if (sourceProvider !== destProvider) {
      this.toastService.show('Moving items between different file systems is not supported yet.', 'error');
      return;
    }

    const sourceProviderPath = sourcePath.length > 0 ? sourcePath.slice(1) : [];
    const destProviderPath = event.destPath.length > 0 ? event.destPath.slice(1) : [];

    sourceProvider.move(sourceProviderPath, destProviderPath, items.map(i => ({ name: i.name, type: i.type })))
      .then(() => {
        // Update properties and notes for each moved folder
        for (const item of items) {
          if (item.type === 'folder') {
            const oldFullPath = [...sourcePath, item.name];
            const newFullPath = [...event.destPath, item.name];
            this.folderPropertiesService.handleRename(oldFullPath, newFullPath);
          }
        }
        this.loadFolderTree();
        this.triggerRefresh();
        this.toastService.show('Items moved successfully.');
      })
      .catch(e => this.toastService.show(`Move failed: ${(e as Error).message}`, 'error'));
  }

  onSidebarNewFolder(event: { path: string[]; name: string }): void {
    const provider = this.getProvider(event.path);
    const providerPath = event.path.length > 0 ? event.path.slice(1) : [];
    provider.createDirectory(providerPath, event.name)
      .then(() => {
        this.loadFolderTree();
        this.toastService.show('Folder created.');
      })
      .catch(e => this.toastService.show(`Failed to create folder: ${(e as Error).message}`, 'error'));
  }

  onSidebarNewFile(event: { path: string[]; name: string }): void {
    const provider = this.getProvider(event.path);
    const providerPath = event.path.length > 0 ? event.path.slice(1) : [];
    provider.createFile(providerPath, event.name)
      .then(() => {
        this.loadFolderTree();
        this.toastService.show('File created.');
      })
      .catch(e => this.toastService.show(`Failed to create file: ${(e as Error).message}`, 'error'));
  }

  // --- Keyboard Shortcuts ---
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === '`') {
      event.preventDefault();
      this.toggleConsole();
    }
  }

  // --- Global Click for closing menus ---
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // If the click is on the button that opens the theme menu, do nothing.
    // This prevents the menu from closing immediately after opening.
    if (target.closest('[data-theme-menu-trigger]')) {
      return;
    }

    // Close theme dropdown if clicking outside of it
    if (this.isThemeDropdownOpen() && !target.closest('.theme-menu')) {
      this.isThemeDropdownOpen.set(false);
    }
    // Close stream sort dropdown
    if (this.isStreamSortDropdownOpen() && !target.closest('.stream-sort-menu')) {
      this.isStreamSortDropdownOpen.set(false);
    }
  }

  // --- Resizing logic ---
  startPaneResize(event: MouseEvent): void {
    if (!this.isSplitView()) return;
    this.isResizingPane = true;
    event.preventDefault();
    const container = this.paneContainerEl.nativeElement;
    const startX = event.clientX;
    const startWidth = container.children[0].getBoundingClientRect().width;
    const totalWidth = container.getBoundingClientRect().width;

    this.unlistenPaneResizeMove = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      const dx = e.clientX - startX;
      let newWidth = startWidth + dx;

      const minWidth = 150; // min width in pixels
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > totalWidth - minWidth) newWidth = totalWidth - minWidth;

      this.pane1Width.set((newWidth / totalWidth) * 100);
    });

    this.unlistenPaneResizeUp = this.renderer.listen('document', 'mouseup', () => this.stopPaneResize());
  }

  private stopPaneResize(): void {
    if (!this.isResizingPane) return;
    this.isResizingPane = false;
    this.unlistenPaneResizeMove?.();
    this.unlistenPaneResizeUp?.();
    this.uiPreferencesService.setSplitViewPaneWidth(this.pane1Width());
  }

  startStreamResize(event: MouseEvent): void {
    this.isResizingStream = true;
    event.preventDefault();
    const container = this.mainContentWrapperEl.nativeElement;
    const startY = event.clientY;
    const containerRect = container.getBoundingClientRect();
    const initialStreamHeight = container.children[2].getBoundingClientRect().height;

    this.unlistenStreamResizeMove = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      const dy = startY - e.clientY;
      let newStreamHeight = initialStreamHeight + dy;

      const minHeight = 100;
      const consoleHeight = this.isConsoleCollapsed() ? 28 : (this.consolePaneHeight() / 100 * containerRect.height);
      const maxHeight = containerRect.height - 100 - consoleHeight; // Leave 100px for file explorer

      if (newStreamHeight < minHeight) newStreamHeight = minHeight;
      if (newStreamHeight > maxHeight) newStreamHeight = maxHeight;

      this.streamPaneHeight.set((newStreamHeight / containerRect.height) * 100);
    });

    this.unlistenStreamResizeUp = this.renderer.listen('document', 'mouseup', () => this.stopStreamResize());
  }

  private stopStreamResize(): void {
    if (!this.isResizingStream) return;
    this.isResizingStream = false;
    this.unlistenStreamResizeMove?.();
    this.unlistenStreamResizeUp?.();
    this.uiPreferencesService.setExplorerStreamHeight(this.streamPaneHeight());
  }

  startConsolePaneResize(event: MouseEvent): void {
    this.isResizingConsole = true;
    event.preventDefault();
    const container = this.mainContentWrapperEl.nativeElement;
    const startY = event.clientY;
    const containerRect = container.getBoundingClientRect();
    const initialConsoleHeight = container.children[this.isStreamVisible() ? 4 : 2].getBoundingClientRect().height;

    this.unlistenConsoleResizeMove = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      const dy = startY - e.clientY;
      let newConsoleHeight = initialConsoleHeight + dy;

      const minHeight = 100; // Minimum height in pixels for the console when expanded
      const streamHeight = this.isStreamVisible() ? (this.isStreamPaneCollapsed() ? 28 : (this.streamPaneHeight() / 100 * containerRect.height)) : 0;
      const maxHeight = containerRect.height - 100 - streamHeight; // Leave 100px for file explorer

      if (newConsoleHeight < minHeight) newConsoleHeight = minHeight;
      if (newConsoleHeight > maxHeight) newConsoleHeight = maxHeight;

      this.consolePaneHeight.set((newConsoleHeight / containerRect.height) * 100);
    });

    this.unlistenConsoleResizeUp = this.renderer.listen('document', 'mouseup', () => this.stopConsoleResize());
  }

  private stopConsoleResize(): void {
    if (!this.isResizingConsole) return;
    this.isResizingConsole = false;
    this.unlistenConsoleResizeMove?.();
    this.unlistenConsoleResizeUp?.();
    this.uiPreferencesService.setExplorerConsoleHeight(this.consolePaneHeight());
  }

  // --- Theme Menu ---
  openThemeMenu(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    this.themeMenuPosition.set({
      top: `${rect.bottom + 8}px`,
      right: `${viewportWidth - rect.right}px`
    });
    this.isThemeDropdownOpen.set(true);
  }

  setTheme(theme: Theme): void {
    this.uiPreferencesService.setTheme(theme);
    this.isThemeDropdownOpen.set(false);
  }

  // --- Preferences Dialog ---
  openPreferencesDialog(): void {
    this.isPreferencesDialogOpen.set(true);
  }

  closePreferencesDialog(): void {
    this.isPreferencesDialogOpen.set(false);
  }

  onPreferencesSaved(prefs: Partial<UiPreferences>): void {
    this.uiPreferencesService.saveAllPreferences(prefs);
    this.closePreferencesDialog();
    this.toastService.show('Preferences saved.');
  }

  // --- Complex Search ---
  openComplexSearchDialog(): void {
    this.isComplexSearchDialogOpen.set(true);
  }

  closeComplexSearchDialog(): void {
    this.isComplexSearchDialogOpen.set(false);
  }

  onComplexSearch(params: ComplexSearchParams): void {
    this.toastService.show(`Complex search initiated for: "${params.query}"`);
    console.log("Complex Search Params:", params);
    // In a real app, you would now use these params to call a search service.
  }

  // --- Gemini Search ---
  openGeminiSearchDialog(): void {
    this.isGeminiSearchDialogOpen.set(true);
  }

  closeGeminiSearchDialog(): void {
    this.isGeminiSearchDialogOpen.set(false);
  }

  onGeminiSearch(params: GeminiSearchParams): void {
    this.toastService.show(`Gemini search initiated for: "${params.query}"`);
    console.log("Gemini Search Params:", params);
    // Here we could call the gemini service and update the stream results.
    // For now, just logging as requested.
  }

  // --- Stream ---

  private loadStreamResultsForPanes = effect(async () => {
    // This effect reacts to changes in pane contexts, ensuring it runs on every navigation.
    const contexts: ({ id: number; } & ReturnType<typeof this.pane1Context>)[] = [];

    if (this.isSplitView()) {
      contexts.push({ id: 1, ...this.pane1Context() });
      contexts.push({ id: 2, ...this.pane2Context() });
    } else {
      const activeId = this.activePaneId();
      contexts.push({ id: activeId, ...(activeId === 1 ? this.pane1Context() : this.pane2Context()) });
    }

    for (const context of contexts) {
      const { id, path, profile, token } = context;

      let isMagnetFolder = false;
      if (path.length > 0) {
        const provider = this.getProvider(path);
        // The provider's internal path does not include the root name (e.g., 'Local Session')
        const providerPath = path.slice(1);
        isMagnetFolder = await provider.hasFile(providerPath, '.magnet');
      }

      // If not a magnet folder OR active search is disabled, clear results.
      if (!isMagnetFolder || !this.isStreamActiveSearchEnabled()) {
        if (id === 1) {
          this.streamResultsForPane1.set([]);
        } else {
          this.streamResultsForPane2.set([]);
        }
        continue; // Move to the next pane context
      }

      // --- If it IS a magnet folder AND active search is enabled, proceed with the existing search logic ---
      const rootName = path[0];
      const relativePath = path.slice(1);

      const query = relativePath.length > 0 ? relativePath[relativePath.length - 1] : rootName;
      const simpleSearchQuery = relativePath.join(', ');

      const promises: Promise<StreamItem[]>[] = [];

      // If we have a profile and token, we are in a "real search" context.
      // We will only call the real services (Google Search) and potentially real services (Gemini).
      if (profile && token) {
        const safeBrokerUrl = profile.brokerUrl || '';
        const searchParams: GoogleSearchParams = {
          brokerUrl: safeBrokerUrl,
          token: token,
          query: simpleSearchQuery
        };
        promises.push(
          this.googleSearchService.search(searchParams)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'web' as const, paneId: id })))
        );

        // Gemini Search (could be real or mock depending on API key)
        promises.push(
          this.geminiService.search(query)
            .then(text => [{ query, text, publishedAt: new Date().toISOString(), type: 'gemini' as const, paneId: id }])
        );
      } else {
        // Otherwise, we are in a "mock search" context (e.g., Local Session).
        // Call all the mock services.
        promises.push(
          this.unsplashService.search(query)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'image' as const, paneId: id })))
        );

        promises.push(
          this.youtubeSearchService.search(query)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'youtube' as const, paneId: id })))
        );

        promises.push(
          this.academicSearchService.search(query)
            .then((results: any[]) => results.map(r => ({ ...r, type: 'academic' as const, paneId: id })))
        );

        promises.push(
          this.geminiService.search(query)
            .then(text => [{ query, text, publishedAt: new Date().toISOString(), type: 'gemini' as const, paneId: id }])
        );
      }

      try {
        const results = await Promise.all(promises);
        const flattenedResults = results.flat();

        if (id === 1) {
          this.streamResultsForPane1.set(flattenedResults);
        } else {
          this.streamResultsForPane2.set(flattenedResults);
        }

      } catch (error) {
        console.error(`Failed to load stream results for pane ${id}`, error);
        if (id === 1) {
          this.streamResultsForPane1.set([]);
        } else {
          this.streamResultsForPane2.set([]);
        }
      }
    }
  }, { allowSignalWrites: true });

  onStreamSearchChange(event: Event): void {
    this.streamSearchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleStreamFilter(type: StreamItemType): void {
    this.activeStreamFilters.update(current => {
      const newSet = new Set(current);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }

  toggleAllStreamFilters(): void {
    if (this.activeStreamFilters().size === this.streamFilterTypes.length) {
      this.activeStreamFilters.set(new Set());
    } else {
      this.activeStreamFilters.set(new Set(this.streamFilterTypes.map(f => f.type)));
    }
  }

  toggleStreamSortDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isStreamSortDropdownOpen.update(v => !v);
  }

  onStreamSortChange(key: StreamSortKey): void {
    this.streamSortCriteria.set({ key, direction: 'asc' }); // Direction is handled in computed for now
    this.isStreamSortDropdownOpen.set(false);
  }

  getStreamItemLink(item: StreamItem): string {
    switch (item.type) {
      case 'web':
      case 'academic':
        return item.link;
      case 'image':
        return item.url;
      case 'youtube':
        return `https://www.youtube.com/watch?v=${item.videoId}`;
      case 'gemini':
        // Gemini results don't have a unique link, so we create one from content
        return `gemini:${item.query}:${item.publishedAt}`;
    }
  }

  onBookmarkToggled(item: StreamItem): void {
    const link = this.getStreamItemLink(item);
    const existing = this.bookmarkService.findBookmarkByLink(link);

    if (existing) {
      this.bookmarkService.deleteBookmark(existing._id);
      this.toastService.show('Bookmark removed.');
    } else {
      let newBookmark: NewBookmark;
      switch (item.type) {
        case 'web':
          newBookmark = { type: 'web', title: item.title, link: item.link, snippet: item.snippet, source: item.source };
          break;
        case 'image':
          newBookmark = { type: 'image', title: item.description, link: item.url, thumbnailUrl: item.thumbnailUrl, snippet: `by ${item.photographer}`, source: item.source };
          break;
        case 'youtube':
          newBookmark = { type: 'youtube', title: item.title, link: `https://www.youtube.com/watch?v=${item.videoId}`, thumbnailUrl: item.thumbnailUrl, snippet: item.description, source: item.channelTitle };
          break;
        case 'academic':
          newBookmark = { type: 'academic', title: item.title, link: item.link, snippet: item.snippet, source: item.publication };
          break;
        case 'gemini':
          newBookmark = { type: 'gemini', title: `Gemini: ${item.query}`, link: this.getStreamItemLink(item), snippet: item.text, source: 'Gemini' };
          break;
      }
      this.bookmarkService.addBookmark(this.activePanePath(), newBookmark);
      this.toastService.show('Bookmark saved to current folder.');
    }
  }
}

