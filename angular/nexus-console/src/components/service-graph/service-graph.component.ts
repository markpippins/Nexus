import {
  Component,
  input,
  output,
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
  selectedNode = output<ServiceInstance>();

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('labelInput') labelInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private vizService = inject(ArchitectureVizService);
  private registry = inject(ComponentRegistryService);

  // UI Panels
  isPaletteOpen = signal(true);
  isInspectorOpen = signal(true);

  // Interaction Mode
  currentMode = this.vizService.modeSignal;
  isSimulationActive = this.vizService.isSimulationActive;

  // Tools - loaded from Registry Service
  toolItems = this.registry.allComponents;

  // Inspector Form Data
  selectedNodeData = this.vizService.selectedNodeData;
  allNodes = this.vizService.allNodes;

  // Scene Settings
  bgColor = '#000510';

  // Initialization flag
  private isInitialized = signal(false);

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

  private sub = new Subscription();

  constructor() {
    // Sync Services Input to Graph
    effect(() => {
      if (!this.isInitialized()) return;
      const services = this.services();
      const allComponents = this.registry.allComponents(); // Dependency to ensure loaded

      if (!services || services.length === 0) return;
      if (allComponents.length === 0) return; // Wait for registry

      // Clear existing scene first
      this.vizService.clearScene();

      // Calculate a simple layout (grid or circle)
      const count = services.length;
      const radius = Math.max(10, count * 2);

      services.forEach((svc, i) => {
        // Resolve Visual Component
        let compConfig = this.registry.getConfigById(String(svc.componentOverrideId));

        if (!compConfig && svc.type?.defaultComponentId) {
          compConfig = this.registry.getConfigById(String(svc.type.defaultComponentId));
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
  }

  ngAfterViewInit() {
    if (this.canvasContainer) {
      this.vizService.initialize(this.canvasContainer.nativeElement);
      this.isInitialized.set(true);
    }
  }

  ngOnDestroy() {
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
    this.vizService.setInteractionMode(mode);
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

  // --- Save / Load ---

  saveJson() {
    const json = this.vizService.exportSceneToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architecture-diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  triggerLoad() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          this.vizService.importSceneFromJson(result);
          input.value = ''; // Reset
        }
      };
      reader.readAsText(file);
    }
  }

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