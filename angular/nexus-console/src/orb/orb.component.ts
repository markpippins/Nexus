import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbPaletteDriver, EPOCH_MS, RgbVec } from './orb-palette.js';

// ── Preview mode ────────────────────────────────────────────────────────────
// The avatar's real tempo is minutes-to-hours per walk event and days per
// seasonal cycle — beautiful as a long-term drift, invisible in a sitting.
// Preview mode accelerates the driver's *simulated clock* so the full
// trajectory (walk events + diurnal / weekly / yearly drift) plays out in
// real time, from the avatar's epoch. The real slow mode is untouched: it
// stays the long-term behavior and is restored by ?orbPreview=0.
//
//   ?orbPreview=0  → normal (slow, long-term) mode
//   ?orbSpeed=N    → simulated-ms per real-ms multiplier
//                    (default 7200 = 2 avatar-hours per real second, i.e.
//                    roughly a week of avatar-time per minute of watching)
const PREVIEW_PARAMS =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const PREVIEW_MODE = PREVIEW_PARAMS.get('orbPreview') !== '0';   // default ON
const PREVIEW_SPEEDUP = Math.max(60, Number(PREVIEW_PARAMS.get('orbSpeed')) || 7200);

@Component({
  selector: 'app-orb',
  standalone: true,
  template: `
    <div #canvasContainer class="orb-canvas-container"></div>
  `,
  styles: [`
    :host {
      display: flex;
      width: 100%;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
    }
    .orb-canvas-container {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: 0 0 12px rgba(var(--orb-glow, 108, 99, 255), 0.3), inset 0 0 8px rgba(var(--orb-glow, 108, 99, 255), 0.05);
      transition: box-shadow 300ms ease;
    }
    .orb-canvas-container:hover {
      box-shadow: 0 0 20px rgba(var(--orb-glow, 108, 99, 255), 0.5), inset 0 0 8px rgba(var(--orb-glow, 108, 99, 255), 0.1);
    }
    .orb-canvas-container canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }
  `]
})
export class OrbComponent implements AfterViewInit, OnDestroy {
  private hostRef = inject(ElementRef<HTMLElement>);
  @ViewChild('canvasContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  /** Deterministic, time-driven color state — the orb's slowly evolving palette. */
  private palette = new OrbPaletteDriver();

  /** Preview-only driver: separate walk state, never touches `palette`, so
   *  toggling preview off resumes the true slow evolution undisturbed. */
  private previewDriver: OrbPaletteDriver | null = null;
  /** Real wall-clock ms when the preview clock started (fixed per load — the
   *  trajectory always replays from the avatar's epoch, deterministically). */
  private previewStartWall = 0;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sphere!: THREE.Mesh;
  private uniforms!: any;
  private animationId = 0;
  private clock = new THREE.Clock();

  ngAfterViewInit() {
    this.initScene();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationId);
    if (this.sphere) {
      this.sphere.geometry.dispose();
      if (Array.isArray(this.sphere.material)) {
        this.sphere.material.forEach(m => m.dispose());
      } else {
        this.sphere.material.dispose();
      }
    }
    this.renderer?.dispose();
  }

  private initScene() {
    const container = this.containerRef.nativeElement;
    const size = 40;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(size, size);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.2);

    // The shader's static palette is replaced by the driver's evolving one;
    // the driver's base colors match these originals so the avatar starts
    // where it always was and drifts from there.
    this.uniforms = {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('#cc0ae6') },
      uColor2: { value: new THREE.Color('#094dec') },
      uColor3: { value: new THREE.Color('#ffffff') },
    };
    this.applyPalette(Date.now());

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;

        float hash(vec3 p) {
          float h = dot(p, vec3(127.1, 311.7, 74.7));
          return fract(sin(h) * 43758.5453);
        }

        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        void main() {
          float t = uTime * 0.15;
          vec3 pos = vPosition * 1.8;
          float n  = noise(pos + t * 0.5) * 0.5 + 0.5;
          float n2 = noise(pos * 1.3 - t * 0.7) * 0.5 + 0.5;
          float n3 = noise(pos * 0.7 + t * 1.1 + vec3(5.0)) * 0.5 + 0.5;

          vec3 color = mix(uColor1, uColor2, n);
          color = mix(color, uColor3, n2 * 0.5);
          float blob = smoothstep(0.3, 0.7, n3);
          color = mix(color, color * 1.3, blob * 0.4);

          float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
          color += rim * 0.15;
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
          color += vec3(0.2, 0.15, 0.4) * fresnel * 0.3;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const geometry = new THREE.SphereGeometry(1.0, 48, 48);
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    const ambient = new THREE.AmbientLight(0x222244, 0.5);
    this.scene.add(ambient);

    this.animate();
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();
    this.uniforms.uTime.value = elapsed * 2.0;
    this.sphere.rotation.y += 0.005;
    this.sphere.rotation.x += 0.001;
    // The palette evolves on minute/hour scales — refresh it a few times per
    // second (cheap) so seasonal drift stays continuous while the walk only
    // advances when a new time-tick fires.
    this.applyPalette(Date.now());
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Palette at wall time `nowMs`, honoring preview mode.
   *
   * Normal mode: the real driver, evolving at the avatar's true (slow) pace.
   * Preview mode: a fresh driver fed a simulated clock that starts at the
   * avatar epoch and runs PREVIEW_SPEEDUP× faster than wall time — the whole
   * color trajectory plays out from birth, reproducibly (same wall time
   * every reload → same palette). Both paths are pure functions of the
   * clock, so nothing here needs persistence.
   */
  private paletteAt(nowMs: number): RgbVec[] {
    if (!PREVIEW_MODE) return this.palette.paletteAt(nowMs);
    if (!this.previewDriver) {
      this.previewDriver = new OrbPaletteDriver();
      this.previewStartWall = nowMs;
    }
    const simNow = EPOCH_MS + (nowMs - this.previewStartWall) * PREVIEW_SPEEDUP;
    return this.previewDriver.paletteAt(simNow);
  }

  /** Push the driver's current palette into the shader uniforms + halo. */
  private applyPalette(nowMs: number): void {
    const [c1, c2, c3] = this.paletteAt(nowMs);
    this.uniforms.uColor1.value.setRGB(c1.r, c1.g, c1.b);
    this.uniforms.uColor2.value.setRGB(c2.r, c2.g, c2.b);
    this.uniforms.uColor3.value.setRGB(c3.r, c3.g, c3.b);

    // Halo follows the chromatic colors (c1/c2 blended) so the glow moves
    // with the avatar. Set as a CSS var with the old purple as fallback.
    const r = Math.round(((c1.r + c2.r) / 2) * 255);
    const g = Math.round(((c1.g + c2.g) / 2) * 255);
    const b = Math.round(((c1.b + c2.b) / 2) * 255);
    this.hostRef.nativeElement.style.setProperty('--orb-glow', `${r}, ${g}, ${b}`);
  }
}
