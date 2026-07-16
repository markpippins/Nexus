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
  ChangeDetectionStrategy
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
import * as THREE from 'three';

@Component({
  selector: 'app-service-graph',
  imports: [CommonModule, FormsModule],
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

  // Outputs
  selectedNode = output<ServiceInstance>();
  graphSubViewChange = output<'canvas' | 'creator'>();
  refreshServices = output<void>();

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('labelInput') labelInput!: ElementRef<HTMLInputElement>;

  private vizService = inject(ArchitectureVizService);
  private registry = inject(ComponentRegistryService);
  private atlas = inject(AtlasService);

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

  // Derived list of actual connection objects for display
  currentConnections = computed(() => {
    const current = this.selectedNodeData();
    const all = this.allNodes();
    if (!current) return [];
    return current.connectedTo.map(targetId => {
      const target = all.find(n => n.id === targetId);
      return target ? { id: targetId, label: target.label } : { id: targetId, label: 'Unknown' };
    });
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

  private sub = new Subscription();
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Auto-save after position or camera changes (debounced 500ms)
    const scheduleAutoSave = () => {
      if (this.atlas.selectedViewId() === null) return; // no view loaded yet
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        const currentId = this.atlas.selectedViewId();
        if (currentId === null) return;
        const existingView = this.atlas.views().find(v => v.id === currentId);
        if (!existingView?.name) return; // skip if views list is stale
        this.saveCurrentView(existingView.name).catch(e => console.error('Auto-save failed', e));
      }, 500);
    };

    this.sub.add(this.vizService.nodePositionChanged.subscribe(() => scheduleAutoSave()));
    this.sub.add(this.vizService.cameraChanged.subscribe(() => scheduleAutoSave()));
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

      // Apply node positions
      if (view.positions) {
        for (const pos of view.positions) {
          this.vizService.setNodePosition(pos.nodeId, pos.positionX, pos.positionY, pos.positionZ);
        }
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
    const activeCam = this.vizService.activeCamera();
    const live = { pos: this.vizService.getCameraPosition(), target: this.vizService.getCameraTarget() };
    const defaultPos = new THREE.Vector3(-20, 40, 120);
    const defaultTarget = new THREE.Vector3(0, 15, 0);
    const preset1 = this.vizService.getCameraPreset(1) ?? { pos: defaultPos, target: defaultTarget };
    const preset2 = this.vizService.getCameraPreset(2) ?? { pos: defaultPos, target: defaultTarget };
    const cam1 = activeCam === 1 ? live : preset1;
    const cam2 = activeCam === 2 ? live : preset2;
    const positions = this.vizService.getAllNodePositions();

    return {
      name,
      cameraPositionX: cam1.pos.x, cameraPositionY: cam1.pos.y, cameraPositionZ: cam1.pos.z,
      cameraTargetX: cam1.target.x, cameraTargetY: cam1.target.y, cameraTargetZ: cam1.target.z,
      camera2PositionX: cam2.pos.x, camera2PositionY: cam2.pos.y, camera2PositionZ: cam2.pos.z,
      camera2TargetX: cam2.target.x, camera2TargetY: cam2.target.y, camera2TargetZ: cam2.target.z,
      positions: Array.from(positions.entries()).map(([nodeId, pos]) => ({
        nodeId, positionX: pos.x, positionY: pos.y, positionZ: pos.z
      }))
    };
  }

  async saveCurrentView(name: string): Promise<void> {
    try {
      const view = this.buildViewPayload(name);
      const currentId = this.atlas.selectedViewId();
      if (currentId !== null) {
        await this.atlas.update(currentId, view);
      } else {
        await this.atlas.create(view);
      }
    } catch (e) {
      console.error('Failed to save graph view', e);
    }
  }

  async loadDefaultView(): Promise<void> {
    try {
      await this.atlas.refresh();
      const views = this.atlas.views();
      const defaultView = views.find(v => v.isDefault);
      if (defaultView && defaultView.id) {
        await this.loadView(defaultView.id);
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
    } catch (e) {
      console.error('Save As failed', e);
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
  }

  deleteSelected() {
    const node = this.selectedNodeData();
    if (node) {
      this.vizService.deleteNode(node.id);
    }
  }

  // --- Connections ---

  addConnection() {
    const current = this.selectedNodeData();
    if (current && this.selectedTargetId) {
      this.vizService.connectNodes(current.id, this.selectedTargetId);
      this.selectedTargetId = ''; // Reset
    }
  }

  removeConnection(targetId: string) {
    const current = this.selectedNodeData();
    if (current) {
      this.vizService.disconnectNodes(current.id, targetId);
    }
  }

  togglePalette() { this.isPaletteOpen.update(v => !v); }
  toggleInspector() { this.isInspectorOpen.update(v => !v); }
}