import { Component, ChangeDetectionStrategy, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { ComponentCreatorStateService } from '../../services/component-creator-state.service.js';

@Component({
    selector: 'app-component-preview',
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col h-full bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-base))]">
      <!-- Header -->
      <div class="p-2 border-b border-[rgb(var(--color-border-base))] text-center bg-[rgb(var(--color-surface-muted))]">
        <span class="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase">Live Preview</span>
      </div>

      <!-- 3D Preview Container -->
      <div class="flex-1 min-h-[200px]" #previewContainer></div>

      <!-- Component Info -->
      <div class="p-4 border-t border-[rgb(var(--color-border-base))] text-xs text-[rgb(var(--color-text-muted))] space-y-2">
        @if (state.activeConfig(); as form) {
          <p><strong class="text-[rgb(var(--color-text-subtle))]">ID:</strong> {{ form.id }}</p>
          <p><strong class="text-[rgb(var(--color-text-subtle))]">Type:</strong> {{ form.type }}</p>
          <p><strong class="text-[rgb(var(--color-text-subtle))]">Geometry:</strong> {{ form.geometry }}</p>
          <p><strong class="text-[rgb(var(--color-text-subtle))]">Scale:</strong> {{ form.scale }}x</p>
          <div class="mt-4 p-2 bg-[rgb(var(--color-surface-muted))] rounded border border-[rgb(var(--color-border-muted))]">
            <div class="flex items-center gap-2">
              <div [class]="form.colorClass" class="w-4 h-4 rounded-full"></div>
              <span>{{ form.label }}</span>
            </div>
          </div>
        } @else {
          <div class="flex flex-col items-center justify-center py-8 text-[rgb(var(--color-text-subtle))]">
            <div class="text-3xl mb-2">🎨</div>
            <p>Select a component to preview</p>
          </div>
        }
      </div>
    </div>
  `
})
export class ComponentPreviewComponent implements AfterViewInit, OnDestroy {
    @ViewChild('previewContainer') previewContainer!: ElementRef<HTMLDivElement>;

    state = inject(ComponentCreatorStateService);

    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private mesh: THREE.Mesh | null = null;
    private frameId: number | null = null;
    private initialized = false;

    constructor() {
        // React to activeConfig changes
        effect(() => {
            const config = this.state.activeConfig();
            if (this.initialized) {
                this.updatePreview();
            }
        });
    }

    ngAfterViewInit(): void {
        this.initPreview();
        this.initialized = true;
        this.updatePreview();
    }

    ngOnDestroy(): void {
        if (this.frameId) cancelAnimationFrame(this.frameId);
        if (this.renderer) this.renderer.dispose();
    }

    private initPreview(): void {
        if (!this.previewContainer) return;
        const container = this.previewContainer.nativeElement;
        const width = container.clientWidth || 280;
        const height = container.clientHeight || 200;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a14);

        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
        this.camera.position.z = 4;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            const newWidth = container.clientWidth;
            const newHeight = container.clientHeight;
            if (newWidth && newHeight) {
                this.camera.aspect = newWidth / newHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(newWidth, newHeight);
            }
        });
        resizeObserver.observe(container);

        this.animate();
    }

    private updatePreview(): void {
        const form = this.state.activeConfig();
        if (!form || !this.scene) return;

        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            (this.mesh.material as THREE.Material).dispose();
        }

        let geo: THREE.BufferGeometry;
        switch (form.geometry) {
            case 'sphere': geo = new THREE.SphereGeometry(0.7, 32, 16); break;
            case 'torus': geo = new THREE.TorusGeometry(0.6, 0.2, 16, 100); break;
            case 'octahedron': geo = new THREE.OctahedronGeometry(1); break;
            case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
            case 'icosahedron': geo = new THREE.IcosahedronGeometry(1); break;
            case 'box': geo = new THREE.BoxGeometry(1, 1, 1); break;
            case 'tall-cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 2, 32); break;
            default: geo = new THREE.BoxGeometry(1, 1, 1);
        }

        const mat = new THREE.MeshPhongMaterial({
            color: form.defaultColor,
            shininess: 100,
            flatShading: true
        });

        this.mesh = new THREE.Mesh(geo, mat);
        const scale = form.scale;
        const displayScale = Math.min(Math.max(scale, 0.5), 2.5);
        this.mesh.scale.setScalar(displayScale);

        this.scene.add(this.mesh);
    }

    private animate(): void {
        this.frameId = requestAnimationFrame(() => this.animate());
        if (this.mesh) {
            this.mesh.rotation.x += 0.008;
            this.mesh.rotation.y += 0.01;
        }
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
