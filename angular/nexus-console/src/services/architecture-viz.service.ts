
import { Injectable, NgZone, Signal, signal, WritableSignal, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Subject } from 'rxjs';
import { NodeType } from '../models/component-config.js';
import { ComponentRegistryService } from './component-registry.service.js';
import type { ConnectionData } from '../models/graph-view.model.js';

export type { NodeType } from '../models/component-config.js';

export type ViewMode = 'camera' | 'edit';

export interface NodeData {
    id: string;
    type: NodeType;
    label: string;
    description: string;
    position: { x: number; y: number; z: number };
    color: string;
    connectedTo: string[]; // List of IDs this node sends data to
}

interface VisualNode {
    mesh: THREE.Mesh;
    data: NodeData;
    labelObj?: CSS2DObject;
    wireframe?: THREE.LineSegments;
}

interface FlowParticle {
    mesh: THREE.Mesh;
    fromId: string;
    toId: string;
    progress: number; // 0 to 1
    speed: number;
    color: number;
}

@Injectable({
    providedIn: 'root'
})
export class ArchitectureVizService {
    private ngZone = inject(NgZone);
    private registry = inject(ComponentRegistryService);

    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private composer!: EffectComposer;
    private labelRenderer!: CSS2DRenderer;
    private controls!: OrbitControls;
    private animationId: number | null = null;
    private container!: HTMLElement;

    // State
    private nodes: Map<string, VisualNode> = new Map();
    // Key: "fromId::toId" (using :: as separator because UUIDs contain -)
    private connectionLines: Map<string, THREE.Line> = new Map();

    // Bidirectional edges — normalized key so A↔B is stored once
    private readonly bidirectionalEdges = new Set<string>();

    // Persistent position store — survives clearScene() and component lifecycle
    private readonly savedPositions = new Map<string, { x: number; y: number; z: number }>();

    // Selection & Interaction
    private selectionBox!: THREE.BoxHelper;
    private selectedNodeId: string | null = null;
    private multiSelectedNodeIds = new Set<string>();
    private multiSelectionBoxes = new Map<string, THREE.BoxHelper>();
    private interactionMode: 'camera' | 'edit' = 'camera';

    /** Signal for external consumers — number of selected nodes (0 = none selected). */
    public readonly multiSelectedCount: WritableSignal<number> = signal(0);

    // Track nodes the user dragged this session — prevents loadView from
    // overwriting fresh drags with stale DB data during initial async load.
    private readonly userDraggedNodeIds = new Set<string>();

    // View Mode (3-way: camera | auto | edit)
    public readonly viewMode = signal<ViewMode>('camera');

    // Dragging State
    private isDragging = false;
    private dragPlane = new THREE.Plane();
    private dragOffset = new THREE.Vector3();
    private dragStartPositions = new Map<string, THREE.Vector3>();
    private draggedNodeId: string | null = null;

    // Lasso State
    private isLassoing = false;
    private lassoStart = new THREE.Vector2();
    private lassoDiv: HTMLDivElement | null = null;

    // Simulation State
    public isSimulationActive: WritableSignal<boolean> = signal(false);
    private flowParticles: FlowParticle[] = [];
    private packetGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    private packetMaterialForward = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    private packetMaterialReverse = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    private cameraOrbitAngle = 0;

    // Signals & Events
    public selectedNodeData: WritableSignal<NodeData | null> = signal(null);
    public allNodes: WritableSignal<NodeData[]> = signal([]);
    public nodeDoubleClicked = new Subject<string>();
    public nodePositionChanged = new Subject<string>(); // emits node ID when position changes (drag end or updateNode)
    public cameraChanged = new Subject<void>(); // emits when orbit controls stop moving
    public modeSignal: WritableSignal<'camera' | 'edit'> = signal('camera');
    public webglError: WritableSignal<string | null> = signal(null);

    // Dual camera presets — two saved viewpoints the user can toggle between
    public readonly activeCamera: WritableSignal<1 | 2> = signal(1);
    private readonly cameraPresets = new Map<1 | 2, { pos: THREE.Vector3; target: THREE.Vector3 }>();

    // Floor (grid + shadow plane) visibility
    private readonly _floorVisible: WritableSignal<boolean> = signal(true);
    public readonly floorVisible: Signal<boolean> = this._floorVisible.asReadonly();
    private gridHelper!: THREE.GridHelper;
    private shadowPlane!: THREE.Mesh;

    // Bloom post-processing parameters
    private bloomPass!: UnrealBloomPass;
    private readonly _bloomEnabled: WritableSignal<boolean> = signal(true);
    private readonly _bloomStrength: WritableSignal<number> = signal(0.6);
    private readonly _bloomRadius: WritableSignal<number> = signal(0.3);
    private readonly _bloomThreshold: WritableSignal<number> = signal(0.2);
    public readonly bloomEnabled: Signal<boolean> = this._bloomEnabled.asReadonly();
    public readonly bloomStrength: Signal<number> = this._bloomStrength.asReadonly();
    public readonly bloomRadius: Signal<number> = this._bloomRadius.asReadonly();
    public readonly bloomThreshold: Signal<number> = this._bloomThreshold.asReadonly();

    // Camera animation state (lerp transition between presets)
    private cameraAnimating = false;
    private cameraAnimStartPos = new THREE.Vector3();
    private cameraAnimStartTarget = new THREE.Vector3();
    private cameraAnimEndPos = new THREE.Vector3();
    private cameraAnimEndTarget = new THREE.Vector3();
    private cameraAnimElapsed = 0;
    private cameraAnimLastTime = 0;
    private readonly CAMERA_ANIM_DURATION = 0.8; // seconds

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private resizeObserver: ResizeObserver | null = null;
    private keyDownHandler = this.onKeyDown.bind(this);
    private canvasFocusHandler = this.onCanvasFocus.bind(this);

    initialize(container: HTMLElement) {
        this.container = container;

        // 1. Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000510);
        this.scene.fog = new THREE.FogExp2(0x000510, 0.008);

        // 2. Setup Camera
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(-20, 40, 120);

        // 3. Setup Renderer with WebGL error handling
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

            // Check if context was actually created
            const gl = this.renderer.getContext();
            if (!gl) {
                throw new Error('WebGL context is null');
            }
        } catch (e) {
            const errorMsg = 'WebGL is not available. This may be due to:\n' +
                '• Running in a virtual machine without GPU passthrough\n' +
                '• Disabled hardware acceleration in browser settings\n' +
                '• Outdated or incompatible GPU drivers\n\n' +
                'Try: chrome://settings/system → Enable "Use hardware acceleration"';
            console.error('WebGL initialization failed:', e);
            this.webglError.set(errorMsg);

            // Create a fallback message in the container
            const fallbackDiv = document.createElement('div');
            fallbackDiv.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                padding: 2rem;
                text-align: center;
                color: #94a3b8;
                background: #0f172a;
            `;
            fallbackDiv.innerHTML = `
                <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #f59e0b; margin-bottom: 0.5rem;">WebGL Not Available</h3>
                <p style="max-width: 400px; line-height: 1.5;">
                    3D visualization requires WebGL support.<br><br>
                    <strong>Possible solutions:</strong><br>
                    • Enable hardware acceleration in browser settings<br>
                    • Update your GPU drivers<br>
                    • Try a different browser (Firefox often has better WebGL support)<br>
                    • If using a VM, enable GPU passthrough
                </p>
            `;
            container.appendChild(fallbackDiv);
            return;
        }

        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.domElement.style.outline = 'none';
        container.appendChild(this.renderer.domElement);

        // 3b. Setup Post-Processing (Bloom)
        const renderScene = new RenderPass(this.scene, this.camera);
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            this.bloomStrength(),
            this.bloomRadius(),
            this.bloomThreshold()
        );
        const outputPass = new OutputPass();
        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(window.devicePixelRatio);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(outputPass);

        // 4. Setup Label Renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(width, height);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        container.appendChild(this.labelRenderer.domElement);

        // 5. Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.addEventListener('end', () => this.cameraChanged.next());

        // Seed camera 1 (near-horizontal, looking at the ring)
        // and camera 2 (top-down, vertical view on the ring)
        const pos1 = new THREE.Vector3(-20, 40, 120);
        const target1 = new THREE.Vector3(0, 15, 0);
        const pos2 = new THREE.Vector3(0, 80, 1);
        const target2 = new THREE.Vector3(0, 0, 0);
        this.cameraPresets.set(1, { pos: pos1.clone(), target: target1.clone() });
        this.cameraPresets.set(2, { pos: pos2.clone(), target: target2.clone() });

        // 6. Lights — multi-source setup for strong contrast and readable shapes
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        // Key light: warm directional light from upper-right front (casts shadows)
        const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.4);
        keyLight.position.set(40, 60, 40);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.left = -60;
        keyLight.shadow.camera.right = 60;
        keyLight.shadow.camera.top = 60;
        keyLight.shadow.camera.bottom = -60;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 150;
        keyLight.shadow.bias = -0.001;
        this.scene.add(keyLight);

        // Fill light: cool directional light from lower-left back (reduces harsh shadows)
        const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.7);
        fillLight.position.set(-40, 20, -40);
        this.scene.add(fillLight);

        // Rim light: sharp backlight to separate nodes from the dark background
        const rimLight = new THREE.DirectionalLight(0xc7d2fe, 1.0);
        rimLight.position.set(0, 30, -60);
        this.scene.add(rimLight);

        // Point lights for local highlights
        const pointLight = new THREE.PointLight(0xffffff, 0.9, 200);
        pointLight.position.set(20, 20, 20);
        this.scene.add(pointLight);
        const pointLight2 = new THREE.PointLight(0x4444ff, 0.6, 200);
        pointLight2.position.set(-20, -10, 10);
        this.scene.add(pointLight2);

        // Subtle ground grid for spatial reference and contrast
        this.gridHelper = new THREE.GridHelper(200, 40, 0x334155, 0x1e293b);
        this.gridHelper.position.y = -20;
        this.scene.add(this.gridHelper);

        // Invisible shadow-receiving plane so nodes cast shadows on the ground
        this.shadowPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 200),
            new THREE.ShadowMaterial({ opacity: 0.4 })
        );
        this.shadowPlane.rotation.x = -Math.PI / 2;
        this.shadowPlane.position.y = -20;
        this.shadowPlane.receiveShadow = true;
        this.scene.add(this.shadowPlane);

        // 7. Helpers
        this.selectionBox = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), 0xffff00);
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);

        // 8. Event Listeners
        this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
        this.resizeObserver.observe(container);

        // We attach pointer events to the Renderer DOM Element
        this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.renderer.domElement.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.renderer.domElement.addEventListener('dblclick', (e) => this.onDoubleClick(e));

        // Middle-click (mousewheel click) toggles between camera presets 1 and 2
        this.renderer.domElement.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                this.switchActiveCamera();
            }
        });

        // Keyboard shortcuts for selection and deselection
        document.addEventListener('keydown', this.keyDownHandler);

        // Focus the canvas container on pointer down so keyboard shortcuts work
        this.renderer.domElement.addEventListener('pointerdown', this.canvasFocusHandler);

        // 9. Start Loop
        // this.loadDefaultScene(); // Disabled automatic demo loading. Driven by ServiceGraphComponent inputs.
        this.ngZone.runOutsideAngular(() => this.animate());
        setTimeout(() => this.onWindowResize(), 0);
    }

    // --- View Control ---

    public setBackgroundColor(color: string) {
        if (this.scene) {
            const threeColor = new THREE.Color(color);
            this.scene.background = threeColor;
            this.scene.fog = new THREE.FogExp2(threeColor.getHex(), 0.008);
        }
    }

    public toggleFloor(): void {
        const isVisible = !this._floorVisible();
        this._floorVisible.set(isVisible);
        if (this.gridHelper) this.gridHelper.visible = isVisible;
        if (this.shadowPlane) this.shadowPlane.visible = isVisible;
    }

    public setBloomEnabled(value: boolean): void {
        this._bloomEnabled.set(value);
        if (this.bloomPass) {
            this.bloomPass.strength = value ? this._bloomStrength() : 0;
        }
    }

    public toggleBloom(): void {
        this.setBloomEnabled(!this._bloomEnabled());
    }

    public setBloomStrength(value: number): void {
        this._bloomStrength.set(value);
        if (this.bloomPass && this._bloomEnabled()) this.bloomPass.strength = value;
    }

    public setBloomRadius(value: number): void {
        this._bloomRadius.set(value);
        if (this.bloomPass && this._bloomEnabled()) this.bloomPass.radius = value;
    }

    public setBloomThreshold(value: number): void {
        this._bloomThreshold.set(value);
        if (this.bloomPass && this._bloomEnabled()) this.bloomPass.threshold = value;
    }

    public setBloomParams(strength: number, radius: number, threshold: number): void {
        this.setBloomStrength(strength);
        this.setBloomRadius(radius);
        this.setBloomThreshold(threshold);
    }

    public zoomCamera(amount: number) {
        if (!this.camera || !this.controls) return;
        const distance = this.camera.position.distanceTo(this.controls.target);
        const newDist = distance - amount;

        if (newDist < 5 || newDist > 500) return; // Clamping

        const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
        this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(newDist));
        this.controls.update();
    }

    public rotateCamera(angle: number) {
        if (!this.camera || !this.controls) return;

        const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Rotate around Y axis
        const newX = offset.x * cos - offset.z * sin;
        const newZ = offset.x * sin + offset.z * cos;

        offset.x = newX;
        offset.z = newZ;

        this.camera.position.copy(this.controls.target).add(offset);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
    }

    // Convenience methods for toolbar
    public zoomIn() {
        this.zoomCamera(15);
    }

    public zoomOut() {
        this.zoomCamera(-15);
    }

    public resetCamera() {
        if (!this.camera || !this.controls) return;
        this.camera.position.set(-20, 40, 120);
        this.controls.target.set(0, 15, 0);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
    }

    /** Get current camera position (clone — safe to mutate). */
    public getCameraPosition(): THREE.Vector3 {
        return this.camera ? this.camera.position.clone() : new THREE.Vector3(-20, 40, 120);
    }

    /** Get current orbit controls target (clone — safe to mutate). */
    public getCameraTarget(): THREE.Vector3 {
        if (this.controls) {
            return (this.controls as any).target.clone();
        }
        return new THREE.Vector3(0, 15, 0);
    }

    /** Set camera position + target immediately (no animation). */
    public setCameraState(pos: THREE.Vector3, target: THREE.Vector3): void {
        if (!this.camera || !this.controls) return;
        this.camera.position.copy(pos);
        (this.controls as any).target.copy(target);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
        // Keep the active preset in sync so toggle doesn't revert to a stale value
        const slot = this.activeCamera();
        this.cameraPresets.set(slot, { pos: pos.clone(), target: target.clone() });
    }

    /** Switch between camera preset 1 and 2, saving the current viewpoint first.
     *  Animates the transition with a smooth ease-out lerp. */
    public switchActiveCamera(): void {
        if (!this.camera || !this.controls) return;
        if (this.cameraAnimating) return; // don't interrupt an in-progress transition

        // Save current camera state into the current slot
        const currentSlot = this.activeCamera();
        this.cameraPresets.set(currentSlot, {
            pos: this.camera.position.clone(),
            target: (this.controls as any).target.clone()
        });

        // Toggle to the other slot
        const newSlot: 1 | 2 = currentSlot === 1 ? 2 : 1;
        this.activeCamera.set(newSlot);

        // Start animation from current position to the new preset
        const preset = this.cameraPresets.get(newSlot)!;
        this.cameraAnimStartPos.copy(this.camera.position);
        this.cameraAnimStartTarget.copy((this.controls as any).target);
        this.cameraAnimEndPos.copy(preset.pos);
        this.cameraAnimEndTarget.copy(preset.target);
        this.cameraAnimElapsed = 0;
        this.cameraAnimating = true;
        this.controls.enabled = false;
    }

    /** Get a specific camera preset's position + target (clone — safe to mutate). */
    public getCameraPreset(slot: 1 | 2): { pos: THREE.Vector3; target: THREE.Vector3 } | null {
        const preset = this.cameraPresets.get(slot);
        return preset ? { pos: preset.pos.clone(), target: preset.target.clone() } : null;
    }

    /** Set a specific camera preset without moving the live camera. */
    public setCameraPreset(slot: 1 | 2, pos: THREE.Vector3, target: THREE.Vector3): void {
        this.cameraPresets.set(slot, { pos: pos.clone(), target: target.clone() });
    }

    /** Move a node and persist its position in savedPositions.
     *  If fromLoadView is true, skips nodes the user already dragged this session. */
    public setNodePosition(id: string, x: number, y: number, z: number, fromLoadView = false): void {
        if (fromLoadView && this.userDraggedNodeIds.has(id)) return; // don't overwrite user drags
        const node = this.nodes.get(id);
        if (!node) return;
        node.mesh.position.set(x, y, z);
        node.data.position = { x, y, z };
        this.savedPositions.set(id, { x, y, z });
    }

    /** Clear the user-dragged tracking set (called after initial load completes). */
    public clearUserDraggedNodes(): void {
        this.userDraggedNodeIds.clear();
    }

    /** Get all node positions (current live positions, not just saved). */
    public getAllNodePositions(): Map<string, { x: number; y: number; z: number }> {
        const result = new Map<string, { x: number; y: number; z: number }>();
        this.nodes.forEach((node, id) => {
            result.set(id, { ...node.data.position });
        });
        return result;
    }

    public setMode(mode: ViewMode) {
        this.setViewMode(mode);
    }

    public setViewMode(mode: ViewMode): void {
        this.viewMode.set(mode);

        if (mode === 'camera') {
            this.interactionMode = 'camera';
            this.modeSignal.set('camera');
            this.controls.enabled = true;
            this.renderer.domElement.style.cursor = 'grab';
            this.deselect();
        } else if (mode === 'edit') {
            this.setInteractionMode('edit');
        }

        this.updateAllConnections();
    }

    public exportScene(): object {
        return Array.from(this.nodes.values()).map(n => n.data);
    }

    public importScene(data: unknown) {
        if (!Array.isArray(data)) {
            console.error('Invalid scene data: expected array');
            return;
        }
        this.importSceneFromJson(JSON.stringify(data));
    }

    /** Build an Atlas graph-view payload from the current scene state. */
    public buildAtlasViewPayload(name: string): {
        name: string;
        cameraPositionX: number; cameraPositionY: number; cameraPositionZ: number;
        cameraTargetX: number; cameraTargetY: number; cameraTargetZ: number;
        camera2PositionX: number; camera2PositionY: number; camera2PositionZ: number;
        camera2TargetX: number; camera2TargetY: number; camera2TargetZ: number;
        connections: ConnectionData[];
        positions: { nodeId: string; positionX: number; positionY: number; positionZ: number; label?: string; description?: string; color?: string }[];
    } {
        const activeCam = this.activeCamera();
        const live = { pos: this.getCameraPosition(), target: this.getCameraTarget() };
        const defaultPos = new THREE.Vector3(-20, 40, 120);
        const defaultTarget = new THREE.Vector3(0, 15, 0);
        const preset1 = this.getCameraPreset(1) ?? { pos: defaultPos, target: defaultTarget };
        const preset2 = this.getCameraPreset(2) ?? { pos: defaultPos, target: defaultTarget };
        const cam1 = activeCam === 1 ? live : preset1;
        const cam2 = activeCam === 2 ? live : preset2;
        const positions = this.getAllNodePositions();
        const allNodes = Array.from(this.nodes.values()).map(n => n.data);

        return {
            name,
            cameraPositionX: cam1.pos.x, cameraPositionY: cam1.pos.y, cameraPositionZ: cam1.pos.z,
            cameraTargetX: cam1.target.x, cameraTargetY: cam1.target.y, cameraTargetZ: cam1.target.z,
            camera2PositionX: cam2.pos.x, camera2PositionY: cam2.pos.y, camera2PositionZ: cam2.pos.z,
            camera2TargetX: cam2.target.x, camera2TargetY: cam2.target.y, camera2TargetZ: cam2.target.z,
            connections: this.getAllConnections(),
            positions: Array.from(positions.entries()).map(([nodeId, pos]) => {
                const node = allNodes.find(n => n.id === nodeId);
                return {
                    nodeId,
                    positionX: pos.x, positionY: pos.y, positionZ: pos.z,
                    label: node?.label,
                    description: node?.description,
                    color: node?.color
                };
            })
        };
    }

    // --- Raycasting Helpers for Context Menu ---

    public getHitNodeId(event: MouseEvent): string | null {
        const intersects = this.raycast(event);
        if (intersects.length > 0) {
            return intersects[0].object.userData['id'];
        }
        return null;
    }

    public getWorldPosition(event: MouseEvent): { x: number, y: number, z: number } {
        // Calculate a point on a plane facing the camera, passing through origin
        // or at least a consistent depth for new items

        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Default Z=0 plane

        // If we rotated the camera significantly, picking a Z=0 plane might be hard
        // Let's use a plane that faces the camera
        const normal = new THREE.Vector3();
        this.camera.getWorldDirection(normal);
        // We want a plane with this normal. 
        // If we want new objects to appear "at the center" depth roughly, we pass it through (0,0,0)
        plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0, 0));

        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, target)) {
            return { x: target.x, y: target.y, z: target.z };
        }
        return { x: 0, y: 0, z: 0 };
    }

    // --- Core Operations ---

    public setInteractionMode(mode: 'camera' | 'edit') {
        this.interactionMode = mode;
        this.modeSignal.set(mode);

        // Disable simulation if we switch modes explicitly
        if (this.isSimulationActive()) {
            this.toggleSimulation(false);
        }

        this.controls.enabled = (mode === 'camera');
        this.renderer.domElement.style.cursor = mode === 'camera' ? 'grab' : 'default';

        this.updateAllConnections();
    }

    public toggleSimulation(isActive: boolean) {
        this.isSimulationActive.set(isActive);

        if (isActive) {
            // Switch to camera mode visually but disable controls for auto-orbit
            this.modeSignal.set('camera');
            this.interactionMode = 'camera';
            this.controls.enabled = false;

            // Calculate current angle based on camera position for smooth start
            this.cameraOrbitAngle = Math.atan2(this.camera.position.x, this.camera.position.z);
        } else {
            this.controls.enabled = true;
            this.cleanupParticles();
        }
    }

    private cleanupParticles() {
        this.flowParticles.forEach(p => this.scene.remove(p.mesh));
        this.flowParticles = [];
    }

    public clearScene() {
        // Guard: Return early if scene hasn't been initialized yet
        if (!this.scene) {
            return;
        }
        this.nodes.forEach(node => {
            this.scene.remove(node.mesh);
            if (node.labelObj) node.mesh.remove(node.labelObj);
            node.mesh.geometry.dispose();
            (node.mesh.material as THREE.Material).dispose();
        });
        this.nodes.clear();
        this.connectionLines.forEach(line => {
            this.scene.remove(line);
            line.geometry.dispose();
        });
        this.connectionLines.clear();
        this.bidirectionalEdges.clear();
        this.deselect();
        this.cleanupParticles();
        this.allNodes.set([]);
        // NOTE: Do NOT clear this.savedPositions — they must survive rebuilds
    }

    private static randomId(): string {
        if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // Fallback UUID v4
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    public addNode(
        type: NodeType,
        pos: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 },
        label?: string,
        description: string = 'Description...',
        colorOverride?: string,
        idOverride?: string
    ): string {
        if (!this.scene) {
            console.error('ArchitectureVizService: addNode called before initialize()');
            return idOverride || ArchitectureVizService.randomId();
        }
        const id = idOverride || ArchitectureVizService.randomId();
        // Use saved position if one exists for this node ID (survives clearScene rebuilts)
        const saved = this.savedPositions.get(id);
        const finalPos = saved ? { ...saved } : pos;

        const config = this.registry.getConfig(type);

        const colorHex = colorOverride ? parseInt(colorOverride.replace('#', ''), 16) : config.defaultColor;

        // Auto-generate label based on Registry Default Prefix if not provided
        if (!label) {
            const count = Array.from(this.nodes.values()).filter(n => n.data.type === type).length;
            const prefix = config.defaultNamePrefix || config.name || 'Component';
            label = `${prefix} ${count + 1}`;
        }

        let geometry: THREE.BufferGeometry;
        switch (config.geometry) {
            case 'sphere': geometry = new THREE.SphereGeometry(0.7, 32, 16); break;
            case 'torus': geometry = new THREE.TorusGeometry(0.7, 0.2, 16, 100); break;
            case 'octahedron': geometry = new THREE.OctahedronGeometry(1); break;
            case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
            case 'icosahedron': geometry = new THREE.IcosahedronGeometry(1); break;
            case 'box': geometry = new THREE.BoxGeometry(1, 1, 1); break;
            case 'tall-cylinder': geometry = new THREE.CylinderGeometry(0.8, 0.8, 3, 32); break;
            case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(1); break;
            case 'cone': geometry = new THREE.ConeGeometry(0.7, 1.5, 32); break;
            case 'tetrahedron': geometry = new THREE.TetrahedronGeometry(1); break;
            case 'capsule': geometry = new THREE.CapsuleGeometry(0.5, 1, 8, 16); break;
            case 'torus-knot': geometry = new THREE.TorusKnotGeometry(0.7, 0.2, 100, 16); break;
            case 'ring': geometry = new THREE.TorusGeometry(0.7, 0.3, 16, 40); break;
            case 'lathe': {
                const points = [];
                for (let i = 0; i <= 10; i++) {
                    const t = i / 10;
                    const r = 0.5 + Math.sin(t * Math.PI) * 0.3;
                    points.push(new THREE.Vector2(r, t * 2 - 1));
                }
                geometry = new THREE.LatheGeometry(points, 32);
                break;
            }
            case 'tube': {
                const curvePoints = [];
                for (let i = 0; i <= 32; i++) {
                    const t = i / 32;
                    const angle = t * Math.PI * 2;
                    curvePoints.push(new THREE.Vector3(Math.cos(angle) * 0.5, t * 2 - 1, Math.sin(angle) * 0.5));
                }
                const curve = new (THREE as any).CatmullRomCurve3(curvePoints);
                geometry = new THREE.TubeGeometry(curve, 64, 0.15, 8, false);
                break;
            }
            default: geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        const material = new THREE.MeshPhongMaterial({
            color: colorHex, emissive: colorHex, emissiveIntensity: 0.8, shininess: 100, flatShading: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(finalPos.x, finalPos.y, finalPos.z);
        mesh.scale.setScalar(config.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { id, type };

        const wireGeo = new THREE.WireframeGeometry(geometry);
        const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
        const wireframe = new THREE.LineSegments(wireGeo, wireMat);
        mesh.add(wireframe);

        let labelObj: CSS2DObject | undefined;
        if (label) {
            const div = document.createElement('div');
            div.className = 'label';
            div.textContent = label;
            labelObj = new CSS2DObject(div);
            labelObj.position.set(0, config.geometry === 'tall-cylinder' ? 2 : 1.5, 0);
            mesh.add(labelObj);
        }

        const nodeData: NodeData = {
            id, type, label, description, position: finalPos,
            color: '#' + new THREE.Color(colorHex).getHexString(),
            connectedTo: []
        };

        this.scene.add(mesh);
        this.nodes.set(id, { mesh, data: nodeData, labelObj, wireframe });
        this.updateAllNodesSignal();

        return id;
    }

    public updateNode(id: string, updates: Partial<NodeData>) {
        const node = this.nodes.get(id);
        if (!node) return;

        node.data = { ...node.data, ...updates };

        if (updates.position) {
            node.mesh.position.set(updates.position.x, updates.position.y, updates.position.z);
            node.data.position = updates.position;
            this.savedPositions.set(id, updates.position);
            this.nodePositionChanged.next(id);
            // Connections will be updated in the next frame of animate loop
        }

        if (updates.color) {
            const color = new THREE.Color(updates.color);
            (node.mesh.material as THREE.MeshPhongMaterial).color = color;
            (node.mesh.material as THREE.MeshPhongMaterial).emissive = color;
        }

        if (updates.label !== undefined && node.labelObj) {
            node.labelObj.element.textContent = updates.label;
        }

        if (this.selectedNodeId === id) {
            this.selectionBox.update();
            this.selectedNodeData.set(node.data);
        }
        this.updateAllNodesSignal();
    }

    public deleteNode(id: string) {
        if (!this.scene) return;
        const node = this.nodes.get(id);
        if (!node) return;

        node.data.connectedTo.forEach(targetId => {
            this.bidirectionalEdges.delete(ArchitectureVizService.edgeKey(id, targetId));
            this.removeVisualConnection(id, targetId);
        });

        this.nodes.forEach(otherNode => {
            if (otherNode.data.connectedTo.includes(id)) {
                this.disconnectNodes(otherNode.data.id, id);
            }
        });

        this.scene.remove(node.mesh);
        this.nodes.delete(id);

        // Clean up multi-selection
        this.multiSelectedNodeIds.delete(id);
        this.removeMultiBox(id);
        this.multiSelectedCount.set(this.multiSelectedNodeIds.size);

        if (this.selectedNodeId === id) {
            // Pick a new primary from remaining multi-set, or deselect
            const remaining = [...this.multiSelectedNodeIds];
            if (remaining.length > 0) {
                this.setPrimarySelection(remaining[0]);
            } else {
                this.deselect();
            }
        }
        this.updateAllNodesSignal();
    }

    public getNode(id: string): NodeData | undefined {
        return this.nodes.get(id)?.data;
    }

    public updateAllLabels(): void {
        this.nodes.forEach((node) => {
            const labelDiv = node.labelObj?.element;
            if (labelDiv) {
                labelDiv.textContent = node.data.label;
            }
        });
    }

    // --- Connection Management ---

    private static edgeKey(a: string, b: string): string {
        return [a, b].sort().join('::');
    }

    /** Check whether an edge between two nodes is bidirectional. */
    public isBidirectional(fromId: string, toId: string): boolean {
        return this.bidirectionalEdges.has(ArchitectureVizService.edgeKey(fromId, toId));
    }

    /** Get all connections in the graph as ConnectionData array (for persistence). */
    public getAllConnections(): ConnectionData[] {
        const seen = new Set<string>();
        const result: ConnectionData[] = [];

        for (const node of this.nodes.values()) {
            for (const targetId of node.data.connectedTo) {
                const key = ArchitectureVizService.edgeKey(node.data.id, targetId);
                if (seen.has(key)) continue;
                seen.add(key);

                const bidir = this.bidirectionalEdges.has(key);
                result.push({
                    sourceNodeId: node.data.id,
                    targetNodeId: targetId,
                    direction: bidir ? 'BIDIRECTIONAL' : 'OUTBOUND'
                });
            }
        }
        return result;
    }

    /** Restore connections from persisted data. */
    public restoreConnections(connections: ConnectionData[]): void {
        for (const conn of connections) {
            this.connectNodes(conn.sourceNodeId, conn.targetNodeId);
            if (conn.direction === 'BIDIRECTIONAL') {
                // Also create the reverse in connectedTo and flag as bidirectional
                const toNode = this.nodes.get(conn.targetNodeId);
                if (toNode && !toNode.data.connectedTo.includes(conn.sourceNodeId)) {
                    toNode.data.connectedTo.push(conn.sourceNodeId);
                }
                this.bidirectionalEdges.add(ArchitectureVizService.edgeKey(conn.sourceNodeId, conn.targetNodeId));
                // Recolor the line — it was created as blue before the flag was set
                this.updateConnectionColor(conn.sourceNodeId, conn.targetNodeId);
            }
        }
        this.updateAllNodesSignal();
    }

    /** Toggle a connection between OUTBOUND and BIDIRECTIONAL. */
    public toggleConnectionDirection(fromId: string, toId: string): void {
        const key = ArchitectureVizService.edgeKey(fromId, toId);
        if (this.bidirectionalEdges.has(key)) {
            // Downgrade to outbound: remove reverse connectedTo entry
            this.bidirectionalEdges.delete(key);
            const toNode = this.nodes.get(toId);
            if (toNode) {
                toNode.data.connectedTo = toNode.data.connectedTo.filter(id => id !== fromId);
            }
        } else {
            // Upgrade to bidirectional: add reverse connectedTo entry
            this.bidirectionalEdges.add(key);
            const toNode = this.nodes.get(toId);
            if (toNode && !toNode.data.connectedTo.includes(fromId)) {
                toNode.data.connectedTo.push(fromId);
            }
        }
        this.updateConnectionColor(fromId, toId);
        this.updateAllNodesSignal();
    }

    public connectNodes(fromId: string, toId: string) {
        if (!this.scene) return;
        const fromNode = this.nodes.get(fromId);
        const toNode = this.nodes.get(toId);
        if (!fromNode || !toNode) return;

        // Check Config Rules
        const fromConfig = this.registry.getConfig(fromNode.data.type);
        const allowed = fromConfig.allowedConnections;

        if (allowed && allowed !== 'all' && !allowed.includes(toNode.data.type)) {
            console.warn(`Connection not allowed: ${fromNode.data.type} cannot connect to ${toNode.data.type}`);
            return;
        }

        // If reverse connection already exists, upgrade to bidirectional
        // but don't create a duplicate line — just recolor the existing one
        if (toNode.data.connectedTo.includes(fromId)) {
            this.bidirectionalEdges.add(ArchitectureVizService.edgeKey(fromId, toId));
            this.updateConnectionColor(fromId, toId);
            if (!fromNode.data.connectedTo.includes(toId)) {
                fromNode.data.connectedTo.push(toId);
            }
            if (this.selectedNodeId === fromId) this.selectedNodeData.set(fromNode.data);
            this.updateAllNodesSignal();
            return;
        }

        if (fromNode.data.connectedTo.includes(toId)) return;
        fromNode.data.connectedTo.push(toId);
        this.createVisualConnection(fromId, toId);
        if (this.selectedNodeId === fromId) this.selectedNodeData.set(fromNode.data);
        this.updateAllNodesSignal();
    }

    public disconnectNodes(fromId: string, toId: string) {
        const fromNode = this.nodes.get(fromId);
        if (!fromNode) return;

        // Remove bidirectional flag if set
        const key = ArchitectureVizService.edgeKey(fromId, toId);
        this.bidirectionalEdges.delete(key);

        fromNode.data.connectedTo = fromNode.data.connectedTo.filter(id => id !== toId);
        this.removeVisualConnection(fromId, toId);
        if (this.selectedNodeId === fromId) this.selectedNodeData.set(fromNode.data);
        this.updateAllNodesSignal();
    }

    private createVisualConnection(fromId: string, toId: string) {
        // We use :: separator to avoid conflict with UUID hyphens
        const key = `${fromId}::${toId}`;
        if (this.connectionLines.has(key)) return;
        const fromNode = this.nodes.get(fromId);
        const toNode = this.nodes.get(toId);
        if (!fromNode || !toNode) return;

        const points = [fromNode.mesh.position, toNode.mesh.position];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const isBidir = this.bidirectionalEdges.has(ArchitectureVizService.edgeKey(fromId, toId));
        const material = new THREE.LineBasicMaterial({
            color: isBidir ? 0xf59e0b : 0x4aa8d8,
            transparent: true,
            opacity: isBidir ? 0.7 : 0.4
        });
        const line = new THREE.Line(geometry, material);

        // Store IDs in userData so we don't have to parse the string key later
        line.userData = { fromId, toId };

        this.scene.add(line);
        this.connectionLines.set(key, line);
    }

    /** Update a connection line's color/opacity to reflect its directionality. */
    private updateConnectionColor(fromId: string, toId: string): void {
        // The visual line may be stored under either key orientation
        const line = this.connectionLines.get(`${fromId}::${toId}`)
                  || this.connectionLines.get(`${toId}::${fromId}`);
        if (!line) return;

        const isBidir = this.bidirectionalEdges.has(ArchitectureVizService.edgeKey(fromId, toId));
        const mat = line.material as THREE.LineBasicMaterial;
        mat.color.setHex(isBidir ? 0xf59e0b : 0x4aa8d8);
        mat.opacity = isBidir ? 0.7 : 0.4;
    }

    private removeVisualConnection(fromId: string, toId: string) {
        const key = `${fromId}::${toId}`;
        const line = this.connectionLines.get(key);
        if (line) {
            this.scene.remove(line);
            line.geometry.dispose();
            this.connectionLines.delete(key);
        }
    }

    private updateAllConnections() {
        this.connectionLines.forEach((line) => {
            // Use userData to get IDs reliably
            const { fromId, toId } = line.userData;

            const fromNode = this.nodes.get(fromId);
            const toNode = this.nodes.get(toId);

            if (fromNode && toNode) {
                const positions = line.geometry.attributes['position'].array as Float32Array;

                // Update positions
                positions[0] = fromNode.mesh.position.x;
                positions[1] = fromNode.mesh.position.y;
                positions[2] = fromNode.mesh.position.z;
                positions[3] = toNode.mesh.position.x;
                positions[4] = toNode.mesh.position.y;
                positions[5] = toNode.mesh.position.z;

                line.geometry.attributes['position'].needsUpdate = true;

                // Important to update bounding sphere so lines don't get culled if they stretch far
                line.geometry.computeBoundingSphere();
            }
        });
    }

    // --- Input & Interaction Handling ---

    private onPointerDown(event: PointerEvent) {
        if (event.button !== 0) return; // Only Left Click

        const intersects = this.raycast(event);
        const ctrl = event.ctrlKey || event.metaKey;

        if (intersects.length > 0) {
            // Hit a node
            const object = intersects[0].object;
            const id = object.userData['id'];

            if (ctrl) {
                // Ctrl+Click: toggle node in multi-selection
                this.toggleMultiSelect(id);
            } else if (!this.multiSelectedNodeIds.has(id)) {
                // Plain click on unselected node: clear multi-set, select this one
                this.clearMultiSelection();
                this.selectNode(id);
            } else {
                // Plain click on already-selected node: make it primary (for inspector)
                this.setPrimarySelection(id);
            }

            // If Edit Mode, Start Dragging
            if (this.interactionMode === 'edit') {
                this.isDragging = true;
                this.draggedNodeId = id;
                this.controls.enabled = false;

                // Snapshot starting positions for all multi-selected nodes
                this.dragStartPositions.clear();
                for (const selId of this.multiSelectedNodeIds) {
                    const n = this.nodes.get(selId);
                    if (n) this.dragStartPositions.set(selId, n.mesh.position.clone());
                }
                // Also snapshot the primary if not already in multi-set
                if (!this.dragStartPositions.has(id)) {
                    const n = this.nodes.get(id);
                    if (n) this.dragStartPositions.set(id, n.mesh.position.clone());
                }

                // Create a drag plane at the hit object's position, facing the camera
                const normal = new THREE.Vector3();
                this.camera.getWorldDirection(normal);
                normal.negate();
                this.dragPlane.setFromNormalAndCoplanarPoint(normal, object.position);

                // Calculate offset from the intersection point
                const intersectionPoint = intersects[0].point;
                this.dragOffset.subVectors(object.position, intersectionPoint);

                this.renderer.domElement.style.cursor = 'grabbing';
            }
        } else {
            // Hit empty space
            if (this.interactionMode === 'edit' && !ctrl) {
                // Start lasso (rectangle select)
                this.isLassoing = true;
                const rect = this.renderer.domElement.getBoundingClientRect();
                this.lassoStart.set(event.clientX - rect.left, event.clientY - rect.top);
                this.ensureLassoDiv();
                this.lassoDiv!.style.left = this.lassoStart.x + 'px';
                this.lassoDiv!.style.top = this.lassoStart.y + 'px';
                this.lassoDiv!.style.width = '0px';
                this.lassoDiv!.style.height = '0px';
                this.lassoDiv!.style.display = 'block';
            } else {
                this.deselect();
            }
        }
    }

    private onPointerMove(event: PointerEvent) {
        if (this.isLassoing) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const cx = event.clientX - rect.left;
            const cy = event.clientY - rect.top;
            const l = Math.min(this.lassoStart.x, cx);
            const t = Math.min(this.lassoStart.y, cy);
            const w = Math.abs(cx - this.lassoStart.x);
            const h = Math.abs(cy - this.lassoStart.y);
            if (this.lassoDiv) {
                this.lassoDiv.style.left = l + 'px';
                this.lassoDiv.style.top = t + 'px';
                this.lassoDiv.style.width = w + 'px';
                this.lassoDiv.style.height = h + 'px';
            }
            return;
        }

        if (this.isDragging && this.draggedNodeId && this.interactionMode === 'edit') {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const targetPoint = new THREE.Vector3();

            if (this.raycaster.ray.intersectPlane(this.dragPlane, targetPoint)) {
                targetPoint.add(this.dragOffset);

                // Compute delta from the dragged node's start position
                const startPos = this.dragStartPositions.get(this.draggedNodeId);
                const delta = startPos
                    ? new THREE.Vector3().subVectors(targetPoint, startPos)
                    : new THREE.Vector3();

                // Move ALL multi-selected nodes by the same delta
                const idsToMove = this.multiSelectedNodeIds.size > 0
                    ? this.multiSelectedNodeIds
                    : new Set([this.draggedNodeId]);

                for (const id of idsToMove) {
                    const node = this.nodes.get(id);
                    if (!node) continue;
                    const base = this.dragStartPositions.get(id);
                    if (!base) continue;
                    const newPos = base.clone().add(delta);
                    node.mesh.position.copy(newPos);
                    node.data.position = { x: newPos.x, y: newPos.y, z: newPos.z };
                    this.savedPositions.set(id, { ...node.data.position });

                    // Update selection box if this is the primary
                    if (id === this.selectedNodeId) this.selectionBox.update();
                    // Update multi-selection box
                    const multiBox = this.multiSelectionBoxes.get(id);
                    if (multiBox) multiBox.setFromObject(node.mesh);
                }
            }
        }
    }

    private onPointerUp(event: PointerEvent) {
        if (this.isLassoing) {
            this.isLassoing = false;
            if (this.lassoDiv) this.lassoDiv.style.display = 'none';
            this.resolveLasso();
            return;
        }

        if (this.isDragging && this.draggedNodeId) {
            // Finalize Drag — emit position changed for every moved node
            const primaryNode = this.nodes.get(this.draggedNodeId);
            if (primaryNode) {
                this.selectedNodeData.set({ ...primaryNode.data });
            }

            for (const id of this.multiSelectedNodeIds) {
                this.nodePositionChanged.next(id);
                this.userDraggedNodeIds.add(id);
            }
            // Also emit for the primary if not in multi-set
            if (!this.multiSelectedNodeIds.has(this.draggedNodeId)) {
                this.nodePositionChanged.next(this.draggedNodeId);
                this.userDraggedNodeIds.add(this.draggedNodeId);
            }

            this.updateAllNodesSignal();
            this.isDragging = false;
            this.draggedNodeId = null;
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    private onDoubleClick(event: MouseEvent) {
        // Double click selects and focuses, but preserves multi-selection
        const intersects = this.raycast(event);
        if (intersects.length > 0) {
            const id = intersects[0].object.userData['id'];
            if (!this.multiSelectedNodeIds.has(id)) {
                this.clearMultiSelection();
                this.selectNode(id);
            } else {
                this.setPrimarySelection(id);
            }
            this.nodeDoubleClicked.next(id);
        } else {
            // Double-click on empty space toggles between camera and edit modes
            const newMode: ViewMode = this.viewMode() === 'camera' ? 'edit' : 'camera';
            this.setViewMode(newMode);
        }
    }

    private raycast(event: MouseEvent | PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Intersect the Meshes
        return this.raycaster.intersectObjects(
            Array.from(this.nodes.values()).map(n => n.mesh),
            false // Not recursive, we only want the main mesh
        );
    }

    public selectNode(id: string) {
        const node = this.nodes.get(id);
        if (!node) return;

        this.selectedNodeId = id;
        this.selectionBox.setFromObject(node.mesh);
        this.selectionBox.visible = true;

        // Add to multi-set as sole member (single-select on plain click)
        if (!this.multiSelectedNodeIds.has(id)) {
            this.multiSelectedNodeIds = new Set([id]);
            this.refreshMultiSelectionBoxes();
        }
        this.multiSelectedCount.set(this.multiSelectedNodeIds.size);

        this.selectedNodeData.set({ ...node.data });
    }

    public deselect() {
        this.selectedNodeId = null;
        if (this.selectionBox) {
            this.selectionBox.visible = false;
        }
        this.selectedNodeData.set(null);
        this.clearMultiSelection();
    }

    /** Select every node in the scene. */
    public selectAll(): void {
        if (this.nodes.size === 0) return;
        this.clearMultiSelection();
        for (const id of this.nodes.keys()) {
            this.multiSelectedNodeIds.add(id);
        }
        // Set the first node as primary selection
        const firstId = this.nodes.keys().next().value as string | undefined;
        if (firstId) {
            this.setPrimarySelection(firstId);
        }
        this.refreshMultiSelectionBoxes();
        this.multiSelectedCount.set(this.multiSelectedNodeIds.size);
    }

    private onCanvasFocus() {
        this.container?.focus();
    }

    private onKeyDown(event: KeyboardEvent) {
        // Ignore shortcuts when the user is typing in a form element
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
            return;
        }

        // Only act when the graph canvas has focus (or contains the focused element)
        const active = document.activeElement;
        const graphHasFocus = this.container && (this.container === active || this.container.contains(active));
        if (!graphHasFocus) {
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            event.stopPropagation();
            this.selectAll();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.deselect();
            return;
        }
    }

    // --- Multi-Selection Helpers ---

    /** Toggle a node in/out of the multi-selection set. */
    private toggleMultiSelect(id: string): void {
        if (this.multiSelectedNodeIds.has(id)) {
            this.multiSelectedNodeIds.delete(id);
            this.removeMultiBox(id);
            // If we removed the primary, pick a new one
            if (this.selectedNodeId === id) {
                const remaining = [...this.multiSelectedNodeIds];
                if (remaining.length > 0) {
                    this.setPrimarySelection(remaining[0]);
                } else {
                    this.deselect();
                    return;
                }
            }
        } else {
            this.multiSelectedNodeIds.add(id);
            this.refreshMultiSelectionBoxes();
            // Make this the primary
            this.setPrimarySelection(id);
        }
        this.multiSelectedCount.set(this.multiSelectedNodeIds.size);
    }

    /** Clear the multi-selection set and all associated BoxHelpers. */
    private clearMultiSelection(): void {
        this.multiSelectedNodeIds.clear();
        for (const [id, box] of this.multiSelectionBoxes) {
            this.scene.remove(box);
            box.dispose();
        }
        this.multiSelectionBoxes.clear();
        this.multiSelectedCount.set(0);
    }

    /** Remove the multi-selection BoxHelper for a specific node. */
    private removeMultiBox(id: string): void {
        const box = this.multiSelectionBoxes.get(id);
        if (box) {
            this.scene.remove(box);
            box.dispose();
            this.multiSelectionBoxes.delete(id);
        }
    }

    /** Set a node as the primary (focused) selection without changing the multi-set. */
    private setPrimarySelection(id: string): void {
        const node = this.nodes.get(id);
        if (!node) return;
        this.selectedNodeId = id;
        this.selectionBox.setFromObject(node.mesh);
        this.selectionBox.visible = true;
        this.selectedNodeData.set({ ...node.data });
    }

    /** Rebuild all multi-selection BoxHelpers (thin cyan boxes). */
    private refreshMultiSelectionBoxes(): void {
        // Remove existing multi boxes
        for (const [id, box] of this.multiSelectionBoxes) {
            this.scene.remove(box);
            box.dispose();
        }
        this.multiSelectionBoxes.clear();

        // Create new cyan boxes for each multi-selected node (except primary, which uses the yellow box)
        for (const id of this.multiSelectedNodeIds) {
            if (id === this.selectedNodeId) continue;
            const node = this.nodes.get(id);
            if (!node) continue;
            const box = new THREE.BoxHelper(node.mesh, 0x06b6d4); // cyan
            this.scene.add(box);
            this.multiSelectionBoxes.set(id, box);
        }
    }

    /** Whether a node is in the multi-selection set. */
    public isNodeMultiSelected(id: string): boolean {
        return this.multiSelectedNodeIds.has(id);
    }

    /** Delete all currently selected (multi-selected + primary) nodes. */
    public deleteSelectedNodes(): void {
        const ids = [...this.multiSelectedNodeIds];
        for (const id of ids) {
            this.deleteNode(id);
        }
    }

    // --- Lasso Helpers ---

    /** Create or retrieve the lasso overlay div. */
    private ensureLassoDiv(): void {
        if (this.lassoDiv) return;
        const div = document.createElement('div');
        div.style.cssText = `
            position: absolute;
            border: 1px solid #06b6d4;
            background: rgba(6, 182, 212, 0.1);
            pointer-events: none;
            z-index: 100;
            display: none;
        `;
        this.container.appendChild(div);
        this.lassoDiv = div;
    }

    /** Resolve the lasso: project all nodes to screen space, add those inside the rect. */
    private resolveLasso(): void {
        if (!this.lassoDiv) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const l = parseFloat(this.lassoDiv.style.left);
        const t = parseFloat(this.lassoDiv.style.top);
        const r = l + parseFloat(this.lassoDiv.style.width);
        const b = t + parseFloat(this.lassoDiv.style.height);

        // Min size threshold — treat tiny lassos as deselect
        if (Math.abs(r - l) < 5 && Math.abs(b - t) < 5) {
            this.deselect();
            return;
        }

        const screenPos = new THREE.Vector3();
        const hitIds: string[] = [];

        for (const [id, node] of this.nodes) {
            node.mesh.getWorldPosition(screenPos);
            screenPos.project(this.camera);
            const sx = ((screenPos.x + 1) / 2) * rect.width;
            const sy = ((-screenPos.y + 1) / 2) * rect.height;

            if (sx >= l && sx <= r && sy >= t && sy <= b) {
                hitIds.push(id);
            }
        }

        if (hitIds.length === 0) {
            this.deselect();
            return;
        }

        // Replace selection with lasso results
        this.clearMultiSelection();
        for (const id of hitIds) {
            this.multiSelectedNodeIds.add(id);
        }
        this.setPrimarySelection(hitIds[0]);
        this.refreshMultiSelectionBoxes();
        this.multiSelectedCount.set(hitIds.length);
    }

    // --- Update ---

    private updateAllNodesSignal() {
        this.allNodes.set(Array.from(this.nodes.values()).map(n => n.data));
    }

    // --- Animation & Config ---

    private animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // Handle Auto-Orbit if Simulation Active
        if (this.isSimulationActive()) {
            this.cameraOrbitAngle += 0.003; // Slow rotation speed
            const radius = Math.sqrt(this.camera.position.x ** 2 + this.camera.position.z ** 2);
            // Maintain current height (y), rotate X and Z
            this.camera.position.x = radius * Math.sin(this.cameraOrbitAngle);
            this.camera.position.z = radius * Math.cos(this.cameraOrbitAngle);
            this.camera.lookAt(0, 0, 0);

            // Spawn Flow Particles (random chance per frame)
            if (Math.random() > 0.92 && this.connectionLines.size > 0) {
                this.spawnRandomParticle();
            }

            this.updateParticles();
        } else {
            // Manual controls only if not simulating
            if (this.controls && this.controls.enabled) this.controls.update();
        }

        const time = Date.now() * 0.001;

        // Camera transition animation (smooth lerp between presets)
        if (this.cameraAnimating) {
            const now = performance.now() / 1000;
            if (this.cameraAnimLastTime === 0) this.cameraAnimLastTime = now;
            const dt = now - this.cameraAnimLastTime;
            this.cameraAnimLastTime = now;
            this.cameraAnimElapsed += dt;
            const rawT = Math.min(this.cameraAnimElapsed / this.CAMERA_ANIM_DURATION, 1);
            const t = 1 - Math.pow(1 - rawT, 3); // ease-out cubic

            this.camera.position.lerpVectors(this.cameraAnimStartPos, this.cameraAnimEndPos, t);
            (this.controls as any).target.lerpVectors(this.cameraAnimStartTarget, this.cameraAnimEndTarget, t);
            this.camera.lookAt(this.controls.target);

            if (rawT >= 1) {
                // Snap to exact target
                this.camera.position.copy(this.cameraAnimEndPos);
                (this.controls as any).target.copy(this.cameraAnimEndTarget);
                this.cameraAnimating = false;
                this.cameraAnimLastTime = 0;
                this.controls.enabled = this.viewMode() === 'camera';
                this.controls.update();
                this.cameraChanged.next();
            }
        }

        this.nodes.forEach(node => {
            // Don't float if selected (primary or multi) and not dragging
            const isSelected = node.data.id === this.selectedNodeId || this.multiSelectedNodeIds.has(node.data.id);
            if (!isSelected && !this.isDragging) {
                node.mesh.position.y = node.data.position.y + Math.sin(time + node.mesh.position.x) * 0.02;
            }
            node.mesh.rotation.y += 0.002;
        });

        // Keep connections in sync with floating nodes
        this.updateAllConnections();

        this.composer.render();
        this.labelRenderer.render(this.scene, this.camera);
    }

    private spawnRandomParticle() {
        // Pick a random connection line
        const keys = Array.from(this.connectionLines.keys());
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const line = this.connectionLines.get(randomKey);

        if (line) {
            const { fromId, toId } = line.userData;

            // Forward pulse (source -> target)
            const forwardMesh = new THREE.Mesh(this.packetGeometry, this.packetMaterialForward);
            this.scene.add(forwardMesh);
            this.flowParticles.push({
                mesh: forwardMesh,
                fromId,
                toId,
                progress: 0,
                speed: 0.01 + Math.random() * 0.01,
                color: 0xffff00
            });

            // Reverse pulse (target -> source) for bidirectional edges
            if (this.isBidirectional(fromId, toId)) {
                const reverseMesh = new THREE.Mesh(this.packetGeometry, this.packetMaterialReverse);
                this.scene.add(reverseMesh);
                this.flowParticles.push({
                    mesh: reverseMesh,
                    fromId: toId,
                    toId: fromId,
                    progress: 0,
                    speed: 0.01 + Math.random() * 0.01,
                    color: 0x00ffff
                });
            }
        }
    }

    private updateParticles() {
        for (let i = this.flowParticles.length - 1; i >= 0; i--) {
            const p = this.flowParticles[i];
            p.progress += p.speed;

            if (p.progress >= 1) {
                // Reached destination
                this.scene.remove(p.mesh);
                this.flowParticles.splice(i, 1);
            } else {
                // Move mesh
                const fromNode = this.nodes.get(p.fromId);
                const toNode = this.nodes.get(p.toId);

                if (fromNode && toNode) {
                    p.mesh.position.lerpVectors(fromNode.mesh.position, toNode.mesh.position, p.progress);
                } else {
                    // Node deleted while packet in transit
                    this.scene.remove(p.mesh);
                    this.flowParticles.splice(i, 1);
                }
            }
        }
    }

    private onWindowResize() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(window.devicePixelRatio);
        this.labelRenderer.setSize(width, height);
    }

    public dispose() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.composer) this.composer.dispose();
        if (this.renderer) this.renderer.dispose();
        if (this.lassoDiv) { this.lassoDiv.remove(); this.lassoDiv = null; }
        document.removeEventListener('keydown', this.keyDownHandler);
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('pointerdown', this.canvasFocusHandler);
        }
    }

    // --- Import / Export ---

    public exportSceneToJson(): string {
        const data = Array.from(this.nodes.values()).map(n => n.data);
        return JSON.stringify(data, null, 2);
    }

    public importSceneFromJson(json: string) {
        try {
            const data = JSON.parse(json) as NodeData[];
            if (!Array.isArray(data)) throw new Error('Invalid JSON structure');

            this.clearScene();

            // Phase 1: Create all nodes
            data.forEach(nodeData => {
                this.addNode(
                    nodeData.type,
                    nodeData.position,
                    nodeData.label,
                    nodeData.description,
                    nodeData.color,
                    nodeData.id // Preserve ID
                );
            });

            // Phase 2: Create connections
            // We must do this after all nodes exist
            data.forEach(nodeData => {
                if (nodeData.connectedTo && Array.isArray(nodeData.connectedTo)) {
                    nodeData.connectedTo.forEach(targetId => {
                        // We use the public connectNodes to ensure visuals are created
                        this.connectNodes(nodeData.id, targetId);
                    });
                }
            });

            console.log('Scene imported successfully');

        } catch (e) {
            console.error('Failed to import scene', e);
            alert('Failed to import file. Please check if it is a valid JSON export.');
        }
    }

    // --- Default Scenario ---

    public loadDefaultScene() {
        this.clearScene();

        const host = this.addNode('rest-api', { x: 0, y: 35, z: -10 }, 'Host Service', 'Central Authority');
        const obs = this.addNode('grpc-service', { x: 15, y: 38, z: -10 }, 'Observability', 'ELK Stack', '#7c3aed');
        this.connectNodes(host, obs);

        const gateway = this.addNode('gateway', { x: 0, y: 0, z: 0 }, 'API Gateway', 'Ingress');
        const proxy = this.addNode('proxy', { x: -25, y: 0, z: 0 }, 'Proxies', 'Load Balancer');
        this.connectNodes(proxy, gateway);
        this.connectNodes(gateway, host);

        const broker = this.addNode('message-queue', { x: 25, y: 0, z: 0 }, 'Service Broker', 'Message Bus', '#f97316');
        this.connectNodes(gateway, broker);

        const auth = this.addNode('grpc-service', { x: 25, y: 15, z: 0 }, 'Auth Svc', 'Security', '#14b8a6');
        this.connectNodes(gateway, auth);

        const extA = this.addNode('rest-api', { x: 50, y: 10, z: 5 }, 'External A', 'Payment Provider');
        const extB = this.addNode('rest-api', { x: 50, y: -10, z: 5 }, 'External B', 'Logistics');

        this.connectNodes(broker, extA);
        this.connectNodes(broker, extB);

        for (let i = 0; i < 3; i++) {
            const c = this.addNode('web-app', { x: -50, y: (i - 1) * 10, z: 0 });
            this.connectNodes(c, proxy);
        }
    }
}
