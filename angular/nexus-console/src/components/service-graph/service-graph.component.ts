import {
  Component,
  input,
  output,
  model,
  effect,
  signal,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ServiceInstance,
  ServiceDependency,
  Deployment
} from '../../models/service-mesh.model.js';
import { ArchitectureVizService, NodeData } from '../../services/architecture-viz.service.js';
import { ComponentRegistryService } from '../../services/component-registry.service.js';
import { NodeType } from '../../models/component-config.js';
import { AtlasService } from '../../services/atlas.service.js';
import type { ConnectionData } from '../../models/graph-view.model.js';
import { LoadViewDialogComponent } from '../load-view-dialog/load-view-dialog.component.js';
import { ComponentCreatorComponent } from '../component-creator/component-creator.component.js';
import * as THREE from 'three';

@Component({
  selector: 'app-service-graph',
  imports: [CommonModule, FormsModule, LoadViewDialogComponent, ComponentCreatorComponent],
  templateUrl: './service-graph.component.html',
  styleUrls: ['./service-graph.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceGraphComponent implements AfterViewInit, OnDestroy {
  // Inputs from parent
  services = input<ServiceInstance[]>([]);
  dependencies = input<ServiceDependency[]>([]);
  deployments = input<Deployment[]>([]);
  showInternalPanels = input(true); // When false, hide internal palette and inspector sidebars
  graphSubView = input<'canvas' | 'creator'>('canvas');
  paletteCollapsed = input(false);
  showRunningOnly = model(false);
  bloomParams = input<{ strength?: number; radius?: number; threshold?: number }>();

  // Outputs
  selectedNode = output<ServiceInstance>();
  graphSubViewChange = output<'canvas' | 'creator'>();
  refreshServices = output<void>();

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('labelInput') labelInput!: ElementRef<HTMLInputElement>;

  public vizService = inject(ArchitectureVizService);
  private registry = inject(ComponentRegistryService);
  private atlas = inject(AtlasService);
  private cdr = inject(ChangeDetectorRef);

  /** Exposed for template — number of multi-selected nodes. */
  multiSelectedCount = this.vizService.multiSelectedCount;

  // UI Panels
  isPaletteOpen = signal(true);
  isInspectorOpen = signal(true);

  // Interaction Mode
  currentMode = this.vizService.modeSignal;
  viewMode = this.vizService.viewMode;
  isSimulationActive = this.vizService.isSimulationActive;

  // Tools - loaded from Registry Service
  toolItems = this.registry.allComponents;

  // Inspector Form Data
  selectedNodeData = this.vizService.selectedNodeData;
  allNodes = this.vizService.allNodes;

  // Scene Settings
  bgColor = '#000510';

  // Active Camera — 1 or 2, toggled via the camera switch button
  activeCamera = this.vizService.activeCamera;

  // Initialization flag
  private isInitialized = signal(false);

  // Stable per-service key to detect whether service list *or visual style* actually changed (not just reference)
  private lastServiceKey = '';
  private lastRegistryReady = false;

  // Context Menu State
  contextMenu = signal<{
    visible: boolean,
    x: number,
    y: number,
    targetNodeId: string | null,
    worldPos: { x: number, y: number, z: number } | null
  }>({
    visible: false, x: 0, y: 0, targetNodeId: null, worldPos: null
  });

  // Computed list of nodes we can connect to (not self, not already connected, AND allowed by config)
  availableTargets = computed(() => {
    const current = this.selectedNodeData();
    const all = this.allNodes();
    if (!current) return [];

    // Get connection rules for current node type
    const config = this.registry.getConfig(current.type);

    return all.filter(n => {
      // Rule 1: Cannot connect to self
      if (n.id === current.id) return false;
      // Rule 2: Cannot connect if already connected
      if (current.connectedTo.includes(n.id)) return false;
      // Rule 3: Must be in allowed connections list
      if (config.allowedConnections && config.allowedConnections !== 'all' && !config.allowedConnections.includes(n.type)) return false;

      return true;
    }).sort((a, b) => a.label.localeCompare(b.label));
  });

  /** All connections involving the selected node (outbound, inbound, bidirectional). */
  allConnections = computed(() => {
    const current = this.selectedNodeData();
    const all = this.allNodes();
    if (!current) return [];

    const result: { nodeId: string; label: string; direction: 'out' | 'in' | 'bidirectional' }[] = [];
    const seen = new Set<string>();

    // Outbound + bidirectional from current
    for (const targetId of current.connectedTo) {
      const key = [current.id, targetId].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      const target = all.find(n => n.id === targetId);
      const bidir = this.vizService.isBidirectional(current.id, targetId);
      result.push({
        nodeId: targetId,
        label: target?.label ?? targetId,
        direction: bidir ? 'bidirectional' : 'out'
      });
    }

    // Incoming (other nodes point to current, not already covered)
    for (const n of all) {
      if (n.id === current.id) continue;
      if (n.connectedTo.includes(current.id)) {
        const key = [current.id, n.id].sort().join('::');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          nodeId: n.id,
          label: n.label,
          direction: 'in'
        });
      }
    }
    return result;
  });

  // Form Models (synced with effect)
  formLabel = '';
  formDesc = '';
  formColor = '#ffffff';
  formX = 0;
  formY = 0;
  formZ = 0;

  // Connection Form
  selectedTargetId = '';

  // Load View Dialog
  showLoadDialog = signal(false);

  // Delete Confirmation Dialog
  showDeleteConfirm = signal(false);

  // Toast notification for save/load debugging
  toastMessage = signal('');
  toastVisible = signal(false);
  toastIsError = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private sub = new Subscription();
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAutoSave = false;

  constructor() {
    // Sync Services Input to Graph
    effect(() => {
      if (!this.isInitialized()) return;
      const services = this.services();
      const allComponents = this.registry.allComponents(); // Dependency to ensure loaded

      if (!services || services.length === 0) return;
      if (allComponents.length === 0) return; // Wait for registry (at least fallback)
      // Only resolve visual styles when backend registry is loaded.
      // INITIAL_REGISTRY uses string IDs (sys-rest, sys-cache) that won't
      // match the numeric IDs returned by the /api/v1/services endpoint.
      const registryReady = this.registry.backendLoaded();

      // Skip full rebuild when nothing changed (prevents position snap-back on poll cycles).
      // Key includes per-service visual style so editing a ServiceType's
      // defaultComponentId (or a service's componentOverrideId) triggers a
      // full rebuild that re-resolves the 3D component.
      const key = services
        .map(s => `${s.id}:${s.componentOverrideId ?? ''}:${s.type?.defaultComponentId ?? s.type?.defaultComponent?.id ?? ''}`)
        .sort().join(',');
      if (key === this.lastServiceKey && registryReady === this.lastRegistryReady) {
        // Lightweight update: refresh labels without clearScene
        services.forEach(svc => {
          const node = this.vizService.getNode(String(svc.id));
          if (node) {
            node.label = svc.name;
            node.description = svc.description || 'No description';
          }
        });
        this.vizService.updateAllLabels();
        return;
      }
      this.lastServiceKey = key;
      this.lastRegistryReady = registryReady;

      // Clear existing scene first
      this.vizService.clearScene();

      // Calculate a simple layout (grid or circle)
      const count = services.length;
      const radius = Math.max(10, count * 2);

      services.forEach((svc, i) => {
        // Resolve Visual Component
        let compConfig = this.registry.getConfigById(String(svc.componentOverrideId));

        // Try ServiceType.defaultComponentId (numeric, from API when set)
        if (!compConfig && svc.type?.defaultComponentId) {
          compConfig = this.registry.getConfigById(String(svc.type.defaultComponentId));
        }

        // Fallback: backend returns `type.defaultComponent: { id: N }` but
        // NOT `type.defaultComponentId` (it's @Transient). The number may
        // come through as number or string — getConfigById coerces with String().
        if (!compConfig && svc.type?.defaultComponent?.id !== undefined &&
            svc.type.defaultComponent.id !== null) {
          compConfig = this.registry.getConfigById(String(svc.type.defaultComponent.id));
        }

        // Fallback or use resolved config
        const typeSlug = compConfig ? compConfig.type : 'box';
        // Note: 'box' isn't really a type slug but generic geometry. 
        // We need a valid registered type slug for addNode to lookup config again?
        // OR addNode should accept the config object directly.
        // Current addNode implementation looks up config by type slug.
        // So we should pass the type slug if found, or a fallback.

        // Position
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Add Node
        // We pass the svc.id as idOverride so we can map back later
        this.vizService.addNode(
          compConfig ? compConfig.type : 'sys-rest', // fallback type to existing system one
          { x, y: 0, z },
          svc.name,
          svc.description || 'No description',
          compConfig ? undefined : undefined, // Color override handled by config lookup in viz service usually
          String(svc.id)
        );
      });

      // Handle Dependencies
      this.dependencies().forEach(dep => {
        this.vizService.connectNodes(String(dep.sourceServiceId), String(dep.targetServiceId));
      });

      // Try to load the default graph view for camera + position overrides
      this.loadDefaultView();

    }, { allowSignalWrites: true });

    // Sync Selected Node to Form (Inspector)
    effect(() => {
      // ... existing sync logic ...
      const node = this.selectedNodeData();
      if (node) {
        this.formLabel = node.label;
        this.formDesc = node.description;
        this.formColor = node.color;
        this.formX = Number(node.position.x.toFixed(2));
        this.formY = Number(node.position.y.toFixed(2));
        this.formZ = Number(node.position.z.toFixed(2));

        this.isInspectorOpen.set(true);
        this.selectedTargetId = '';
        this.cdr.markForCheck();

        // Find corresponding service if any
        const match = this.services().find(s => String(s.id) === node.id);
        if (match) {
          this.selectedNode.emit(match);
        }
      }
    });

    // Listen for Double Click to Focus
    this.sub.add(this.vizService.nodeDoubleClicked.subscribe(() => {
      setTimeout(() => {
        if (this.labelInput) this.labelInput.nativeElement.focus();
      }, 50);
    }));

    // Watch for view load requests from toolbar
    effect(() => {
      const viewId = this.atlas.loadRequested();
      if (viewId !== null) {
        this.loadView(viewId);
        this.atlas.loadRequested.set(null);
      }
    }, { allowSignalWrites: true });

    // Watch for save requests from toolbar
    effect(() => {
      const name = this.atlas.saveRequested();
      if (name !== null) {
        this.saveCurrentView(name);
        this.atlas.saveRequested.set(null);
      }
    }, { allowSignalWrites: true });

    // Watch for palette collapse toggle from sidebar
    effect(() => {
      const collapsed = this.paletteCollapsed();
      this.isPaletteOpen.set(!collapsed);
    }, { allowSignalWrites: true });

    // Apply configurable bloom parameters when provided
    effect(() => {
      const params = this.bloomParams();
      if (!params) return;
      this.vizService.setBloomParams(
        params.strength ?? this.vizService.bloomStrength(),
        params.radius ?? this.vizService.bloomRadius(),
        params.threshold ?? this.vizService.bloomThreshold()
      );
    }, { allowSignalWrites: true });

    // Pause the 3D renderer while the Component Creator sub-view is open
    effect(() => {
      this.vizService.setPaused(this.graphSubView() === 'creator');
    }, { allowSignalWrites: true });

    // Auto-save after drag or camera changes (debounced 500ms)
    this.sub.add(this.vizService.nodePositionChanged.subscribe(() => this.scheduleAutoSave()));
    this.sub.add(this.vizService.cameraChanged.subscribe(() => this.scheduleAutoSave()));
  }

  ngAfterViewInit() {
    if (this.canvasContainer) {
      this.vizService.initialize(this.canvasContainer.nativeElement);
      this.isInitialized.set(true);
    }
  }

  ngOnDestroy() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.vizService.dispose();
    this.sub.unsubscribe();
  }

  // --- Context Menu Handlers ---

  onContextMenu(event: MouseEvent) {
    event.preventDefault();

    // Determine if we clicked a node
    const hitId = this.vizService.getHitNodeId(event);
    // Determine world position for potential new node
    const worldPos = this.vizService.getWorldPosition(event);

    // If we hit a node, select it right away
    if (hitId) {
      this.vizService.selectNode(hitId);
    }

    this.contextMenu.set({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      targetNodeId: hitId,
      worldPos: worldPos
    });
  }

  closeContextMenu() {
    if (this.contextMenu().visible) {
      this.contextMenu.update(s => ({ ...s, visible: false }));
    }
  }

  onContextAction(action: 'new' | 'edit' | 'delete', payload?: any) {
    const menuState = this.contextMenu();

    if (action === 'delete') {
      // If we right-clicked a node, delete it.
      // Otherwise check if a node is currently selected (fallback logic)
      const target = menuState.targetNodeId || this.vizService.selectedNodeData()?.id;
      if (target) {
        this.vizService.deleteNode(target);
      }
    } else if (action === 'new' && payload) {
      // Payload is the Type ID
      const pos = menuState.worldPos || { x: 0, y: 0, z: 0 };
      const id = this.vizService.addNode(payload, pos);
      this.vizService.selectNode(id);
      this.setMode('edit'); // Switch to edit so they can fine tune
    }

    this.closeContextMenu();
  }

  // --- Actions ---

  setMode(mode: 'camera' | 'edit') {
    this.vizService.setViewMode(mode);
  }

  switchCamera() {
    this.vizService.switchActiveCamera();
  }

  toggleSimulation() {
    this.vizService.toggleSimulation(!this.isSimulationActive());
  }

  addNode(type: NodeType) {
    const x = (Math.random() - 0.5) * 40;
    const y = (Math.random() - 0.5) * 20 + 10;
    const z = (Math.random() - 0.5) * 20;
    const id = this.vizService.addNode(type, { x, y, z });
    this.vizService.selectNode(id);

    // Auto switch to edit mode when adding so they can move it
    this.setMode('edit');
  }

  // --- Graph Views (Atlas) ---

  async loadView(id: number): Promise<void> {
    try {
      this.vizService.clearUserDraggedNodes(); // fresh slate for each load
      const view = await this.atlas.getById(id);
      this.atlas.selectedViewId.set(id);

      // Apply camera 1 state to the live camera (preset 1 is set inside setCameraState)
      this.vizService.setCameraState(
        new THREE.Vector3(view.cameraPositionX, view.cameraPositionY, view.cameraPositionZ),
        new THREE.Vector3(view.cameraTargetX, view.cameraTargetY, view.cameraTargetZ)
      );

      // Load camera 2 preset from saved data
      if (view.camera2PositionX !== undefined) {
        this.vizService.setCameraPreset(2,
          new THREE.Vector3(view.camera2PositionX, view.camera2PositionY, view.camera2PositionZ),
          new THREE.Vector3(view.camera2TargetX, view.camera2TargetY, view.camera2TargetZ)
        );
      }

      // Apply node positions + metadata (fromLoadView skips nodes user already dragged)
      if (view.positions) {
        for (const pos of view.positions) {
          this.vizService.setNodePosition(pos.nodeId, pos.positionX, pos.positionY, pos.positionZ, true);
          // Only apply metadata fields that are actually present (avoid undefined overwrites)
          const updates: Partial<NodeData> = {};
          if (pos.label !== undefined) updates.label = pos.label;
          if (pos.description !== undefined) updates.description = pos.description;
          if (pos.color !== undefined) updates.color = pos.color;
          if (Object.keys(updates).length > 0) {
            this.vizService.updateNode(pos.nodeId, updates);
          }
        }
      }

      // Restore connections (backend returns as an array)
      const conns = view.connections;
      if (conns && conns.length > 0) {
        this.vizService.restoreConnections(conns);
      }

      // Always start on camera 1 after loading a view
      if (this.vizService.activeCamera() === 2) {
        this.vizService.switchActiveCamera();
      }
    } catch (e) {
      console.error('Failed to load graph view', e);
    }
  }

  /** Build a view payload from the current scene state. */
  private buildViewPayload(name: string): any {
    return this.vizService.buildAtlasViewPayload(name);
  }

  async saveCurrentView(name: string): Promise<void> {
    try {
      const view = this.buildViewPayload(name);
      const currentId = this.atlas.selectedViewId();
      if (currentId !== null) {
        await this.atlas.update(currentId, view);
        this.showToast(`Saved "${name}"`);
      } else {
        const created = await this.atlas.create(view);
        this.showToast(`Created "${name}"`);
      }
    } catch (e) {
      console.error('Failed to save graph view', e);
      this.showToast('Save failed — check console', true);
    }
  }

  async loadDefaultView(): Promise<void> {
    try {
      // Only run on initial load — don't switch views mid-session
      if (this.atlas.selectedViewId() !== null) return;

      await this.atlas.refresh();
      const views = this.atlas.views();
      if (views.length === 0) return;

      // Load the most recently updated view, not just isDefault.
      // This ensures auto-saved changes survive restarts even after a "Save As"
      // switches selectedViewId to a new (non-default) view.
      const latest = views
        .filter(v => v.updatedAt)
        .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())[0]
        ?? views[0];

      if (latest.id) {
        await this.loadView(latest.id);
        this.showToast(`Loaded "${latest.name ?? 'view'}"`);
        // User-dragged nodes during load take priority over DB — clear tracking now
        this.vizService.clearUserDraggedNodes();
      }

      // If there are pending auto-saves queued before the view was loaded, flush now.
      if (this.pendingAutoSave) {
        this.pendingAutoSave = false;
        this.flushAutoSave();
      }
    } catch (e) {
      console.error('Failed to load default graph view', e);
    }
  }

  clearCanvas() {
    this.vizService.clearScene();
  }

  resetDemo() {
    if (confirm('Discard changes and reload default demo?')) {
      this.vizService.loadDefaultScene();
    }
  }

  // --- Camera Controls ---

  updateBgColor(color: string) {
    this.bgColor = color;
    this.vizService.setBackgroundColor(color);
  }

  zoomIn() { this.vizService.zoomCamera(10); }
  zoomOut() { this.vizService.zoomCamera(-10); }
  rotateLeft() { this.vizService.rotateCamera(0.2); }
  rotateRight() { this.vizService.rotateCamera(-0.2); }

  // --- Save / Load (Atlas DB) ---

  async saveToAtlas() {
    // Always "Save As" — prompt for a name and create a brand-new view copy
    const name = window.prompt('Save view as:');
    if (!name || !name.trim()) return;

    try {
      await this.atlas.create(this.buildViewPayload(name.trim()));
      this.showToast(`Created "${name.trim()}"`);
    } catch (e) {
      console.error('Save As failed', e);
      this.showToast('Save As failed — check console', true);
    }
  }

  openLoadDialog() {
    this.atlas.refresh();
    this.showLoadDialog.set(true);
  }

  closeLoadDialog() {
    this.showLoadDialog.set(false);
  }

  async onSelectLoadView(id: number) {
    this.showLoadDialog.set(false);
    await this.loadView(id);
  }

  // --- File methods removed, using Atlas DB ---

  // --- Form Handling ---

  onFormChange() {
    const node = this.selectedNodeData();
    if (!node) return;

    this.vizService.updateNode(node.id, {
      label: this.formLabel,
      description: this.formDesc,
      color: this.formColor,
      position: { x: this.formX, y: this.formY, z: this.formZ }
    });

    // Auto-save whenever inspector values change
    this.scheduleAutoSave();
  }

  deleteSelected() {
    const node = this.selectedNodeData();
    if (node) {
      this.vizService.deleteNode(node.id);
    }
  }

  // --- Connections ---

  addConnection(direction: 'out' | 'in' | 'bidirectional' = 'out') {
    const current = this.selectedNodeData();
    if (!current || !this.selectedTargetId) return;

    let fromId: string, toId: string;
    if (direction === 'in') {
      fromId = this.selectedTargetId;
      toId = current.id;
    } else {
      fromId = current.id;
      toId = this.selectedTargetId;
    }

    this.vizService.connectNodes(fromId, toId);
    if (direction === 'bidirectional') {
      this.vizService.toggleConnectionDirection(fromId, toId);
    }
    this.selectedTargetId = '';
  }

  removeConnection(targetId: string) {
    const current = this.selectedNodeData();
    if (!current) return;
    // If this is an inbound connection (targetId has current in its connectedTo),
    // disconnect from their side so the visual line is properly removed
    const targetNode = this.vizService.getNode(targetId);
    if (targetNode?.connectedTo.includes(current.id)) {
      this.vizService.disconnectNodes(targetId, current.id);
    } else {
      this.vizService.disconnectNodes(current.id, targetId);
    }
  }

  toggleConnectionDirection(targetId: string, direction: 'out' | 'in' | 'bidirectional') {
    const current = this.selectedNodeData();
    if (!current) return;

    // Determine the actual source/target pair for the underlying edge.
    // For an inbound connection, the edge is stored as targetId -> current.id.
    const fromId = direction === 'in' ? targetId : current.id;
    const toId = direction === 'in' ? current.id : targetId;

    this.vizService.toggleConnectionDirection(fromId, toId);
    // Force inspector refresh
    this.vizService.selectNode(current.id);
  }

  togglePalette() { this.isPaletteOpen.update(v => !v); }
  toggleInspector() { this.isInspectorOpen.update(v => !v); }

  confirmDelete() {
    this.vizService.deleteSelectedNodes();
    this.showDeleteConfirm.set(false);
  }

  /** Debounce auto-save so rapid inspector edits don't hammer the API. */
  private scheduleAutoSave(): void {
    if (this.atlas.selectedViewId() === null) {
      this.pendingAutoSave = true;
      console.warn('[auto-save] deferred — no view loaded yet (selectedViewId is null)');
      return;
    }
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.flushAutoSave(), 500);
  }

  /** Execute auto-save immediately (called from debounced timer or pending flush). */
  private flushAutoSave(): void {
    const currentId = this.atlas.selectedViewId();
    if (currentId === null) return;
    const existingView = this.atlas.views().find(v => v.id === currentId);
    if (!existingView?.name) return;
    this.saveCurrentView(existingView.name);
  }

  /** Show a toast notification (auto-fades after 2.5s). */
  private showToast(message: string, isError = false): void {
    this.toastMessage.set(message);
    this.toastIsError.set(isError);
    this.toastVisible.set(true);
    this.cdr.markForCheck();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastVisible.set(false);
      this.cdr.markForCheck();
    }, 2500);
  }
}