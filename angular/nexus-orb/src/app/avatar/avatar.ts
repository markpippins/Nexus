import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';

type ColorSlot = 'A' | 'B' | 'C';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  template: `
    <div class="avatar-container">
      <div #canvasContainer class="canvas-container"></div>

      <button (click)="showColors.set(!showColors())" class="panel-toggle">
        🎨 Colors {{ showColors() ? '▴' : '▾' }}
      </button>

      @if (showColors()) {
      <div class="color-panel">
        <div class="color-row">
          <span class="slot-label">A</span>
          <input type="color" [value]="colorA()" (input)="setColor('A', $event)" class="color-picker" />
          <input type="text" [value]="colorA()" (input)="setColorFromText('A', $event)" class="hex-input" maxlength="7" />
        </div>
        <div class="color-row">
          <span class="slot-label">B</span>
          <input type="color" [value]="colorB()" (input)="setColor('B', $event)" class="color-picker" />
          <input type="text" [value]="colorB()" (input)="setColorFromText('B', $event)" class="hex-input" maxlength="7" />
        </div>
        <div class="color-row">
          <span class="slot-label">C</span>
          <input type="color" [value]="colorC()" (input)="setColor('C', $event)" class="color-picker" />
          <input type="text" [value]="colorC()" (input)="setColorFromText('C', $event)" class="hex-input" maxlength="7" />
        </div>
      </div>
      }

      <button (click)="showSettings.set(!showSettings())" class="panel-toggle">
        ⚙️ Settings {{ showSettings() ? '▴' : '▾' }}
      </button>

      @if (showSettings()) {
      <div class="color-panel">
        <div class="slider-row">
          <span class="slot-label">Size</span>
          <input type="range" min="0.1" max="3.0" step="0.1"
                 [value]="sphereSize()" (input)="setSize($event)" class="slider" />
          <span class="value-label">{{ sphereSize().toFixed(1) }}</span>
        </div>
        <div class="slider-row">
          <span class="slot-label">Speed</span>
          <input type="range" min="0.1" max="5.0" step="0.1"
                 [value]="animSpeed()" (input)="setSpeed($event)" class="slider" />
          <span class="value-label">{{ animSpeed().toFixed(1) }}x</span>
        </div>
      </div>
      }

      <div class="controls">
        <input type="text" [formControl]="messageInput" placeholder="Send punctuation to focus..."
               (keydown.enter)="sendMessage()" class="message-input" />
        <button (click)="sendMessage()" [disabled]="!messageInput.value" class="send-btn">Send</button>
        <button (click)="clearChar()" class="clear-btn">✕</button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; max-width: 500px; margin: 0 auto; }
    .canvas-container { width: 100%; height: 400px; border-radius: 12px; overflow: hidden; background: #0a0a1a; }
    .panel-toggle { display: block; width: 100%; margin-top: 8px; padding: 8px; border: 1px solid #333; background: #1a1a2e; color: #8888bb; border-radius: 8px; font-size: 13px; cursor: pointer; text-align: left; }
    .panel-toggle:hover { border-color: #6c63ff; color: #e0e0ff; }
    .color-panel { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 10px 14px; margin-top: 6px; display: flex; flex-direction: column; gap: 8px; }
    .color-row { display: flex; align-items: center; gap: 8px; }
    .slot-label { width: 20px; font-weight: 700; font-size: 16px; color: #8888bb; }
    .color-picker { width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer; background: none; }
    .hex-input { width: 80px; padding: 6px 8px; border-radius: 6px; border: 1px solid #333; background: #0a0a1a; color: #e0e0ff; font-size: 13px; font-family: monospace; outline: none; }
    .hex-input:focus { border-color: #6c63ff; }
    .slider-row { display: flex; align-items: center; gap: 8px; }
    .slider { flex: 1; accent-color: #6c63ff; }
    .value-label { width: 40px; text-align: right; font-family: monospace; font-size: 13px; color: #8888bb; }
    .controls { display: flex; gap: 8px; margin-top: 12px; }
    .message-input { flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid #333; background: #1a1a2e; color: #e0e0ff; font-size: 14px; outline: none; }
    .message-input:focus { border-color: #6c63ff; }
    .send-btn { padding: 10px 20px; border-radius: 8px; border: none; background: #6c63ff; color: white; font-size: 14px; cursor: pointer; font-weight: 600; }
    .send-btn:disabled { opacity: 0.4; cursor: default; }
    .clear-btn { padding: 10px 14px; border-radius: 8px; border: 1px solid #333; background: transparent; color: #888; font-size: 14px; cursor: pointer; }
    .clear-btn:hover { border-color: #ff4444; color: #ff4444; }
  `]
})
export class AvatarComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  messageInput = new FormControl('');
  showColors = signal(false);
  showSettings = signal(false);
  colorA = signal('#cc0ae6'); colorB = signal('#094dec'); colorC = signal('#ffffff');
  sphereSize = signal(0.2); animSpeed = signal(5.0);

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sphere!: THREE.Mesh;
  private charSprite!: THREE.Sprite;
  private uniforms: any;
  private charCanvas!: HTMLCanvasElement;
  private charTexture!: THREE.CanvasTexture;
  private animationId = 0;
  private clock = new THREE.Clock();

  ngAfterViewInit() { this.initScene(); }
  ngOnDestroy() { cancelAnimationFrame(this.animationId); this.renderer?.dispose(); }

  private initScene() {
    const container = this.containerRef.nativeElement;
    const w = container.clientWidth, h = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    // Character texture canvas (256x256 for better text quality)
    this.charCanvas = document.createElement('canvas');
    this.charCanvas.width = 256; this.charCanvas.height = 256;
    this.charTexture = new THREE.CanvasTexture(this.charCanvas);
    this.charTexture.minFilter = THREE.LinearFilter;
    this.charTexture.magFilter = THREE.LinearFilter;

    this.uniforms = {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('#cc0ae6') },
      uColor2: { value: new THREE.Color('#094dec') },
      uColor3: { value: new THREE.Color('#ffffff') },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vNormal; varying vec3 vPosition; varying vec2 vUv;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal; varying vec3 vPosition; varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
        uniform sampler2D uCharTex;

        float hash(vec3 p) { float h = dot(p, vec3(127.1, 311.7, 74.7)); return fract(sin(h) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
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

    const geometry = new THREE.SphereGeometry(1.2, 64, 64);
    this.sphere = new THREE.Mesh(geometry, material);
    this.sphere.scale.setScalar(this.sphereSize() / 1.2);
    this.scene.add(this.sphere);

    // Character sprite — always faces camera, renders on top of the lava lamp
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.charTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.charSprite = new THREE.Sprite(spriteMaterial);
    this.charSprite.position.set(0, 0, 0);
    this.charSprite.scale.set(1.0, 1.0, 1);
    this.charSprite.renderOrder = 1;
    this.scene.add(this.charSprite);

    const ambient = new THREE.AmbientLight(0x222244, 0.5);
    this.scene.add(ambient);

    // Clear the character texture (white = no focus)
    this.clearCharTexture();

    this.animate();
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();
    this.uniforms.uTime.value = elapsed * this.animSpeed();
    const s = this.animSpeed();
    this.sphere.rotation.y += 0.001 * s;
    this.sphere.rotation.x += 0.0003 * s;
    this.renderer.render(this.scene, this.camera);
  };

  private clearCharTexture() {
    const ctx = this.charCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.charCanvas.width, this.charCanvas.height);
    this.charTexture.needsUpdate = true;
    this.charSprite.material.opacity = 0;
  }

  private drawCharTexture(char: string) {
    const ctx = this.charCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.charCanvas.width, this.charCanvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, this.charCanvas.width / 2, this.charCanvas.height / 2);
    this.charTexture.needsUpdate = true;
    this.charSprite.material.opacity = 0.85;
  }

  sendMessage() {
    const msg = this.messageInput.value?.trim();
    if (!msg) return;
    this.drawCharTexture(msg);
    this.messageInput.reset();
  }

  clearChar() {
    this.messageInput.reset();
    this.clearCharTexture();
  }

  setColor(slot: ColorSlot, event: Event) {
    this.applyColor(slot, (event.target as HTMLInputElement).value);
  }
  setColorFromText(slot: ColorSlot, event: Event) {
    const hex = (event.target as HTMLInputElement).value;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) this.applyColor(slot, hex);
  }
  private applyColor(slot: ColorSlot, hex: string) {
    const key = `uColor${slot === 'A' ? 1 : slot === 'B' ? 2 : 3}`;
    if (this.uniforms?.[key]) this.uniforms[key].value = new THREE.Color(hex);
    if (slot === 'A') this.colorA.set(hex);
    else if (slot === 'B') this.colorB.set(hex);
    else this.colorC.set(hex);
  }
  setSize(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.sphereSize.set(val);
    this.sphere.scale.setScalar(val / 1.2);
    const spriteSize = 1.0 * (val / 0.2);
    this.charSprite.scale.set(spriteSize, spriteSize, 1);
  }
  setSpeed(event: Event) {
    this.animSpeed.set(parseFloat((event.target as HTMLInputElement).value));
  }
}
