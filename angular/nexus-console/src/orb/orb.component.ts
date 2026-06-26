import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import * as THREE from 'three';

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
      box-shadow: 0 0 12px rgba(108, 99, 255, 0.3), inset 0 0 8px rgba(108, 99, 255, 0.05);
      transition: box-shadow 300ms ease;
    }
    .orb-canvas-container:hover {
      box-shadow: 0 0 20px rgba(108, 99, 255, 0.5), inset 0 0 8px rgba(108, 99, 255, 0.1);
    }
    .orb-canvas-container canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }
  `]
})
export class OrbComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

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

    this.uniforms = {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('#cc0ae6') },
      uColor2: { value: new THREE.Color('#094dec') },
      uColor3: { value: new THREE.Color('#ffffff') },
    };

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
    this.renderer.render(this.scene, this.camera);
  };
}
