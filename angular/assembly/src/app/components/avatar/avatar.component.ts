import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      [class]="containerClasses"
      [style.width]="size + 'px'"
      [style.height]="size + 'px'"
    >
      <img *ngIf="displaySrc" [src]="displaySrc" [alt]="name" class="w-full h-full object-cover" (error)="onImageError()" />
      <span *ngIf="!src" class="font-semibold" [style.font-size]="fontSize">{{ initial }}</span>
    </div>
  `,
})
export class AvatarComponent implements OnChanges {
  @Input() name = '';
  @Input() src: string | null = null;
  @Input() size = 32;

  imageError = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['src']) {
      this.imageError = false;
    }
  }

  get displaySrc(): string | null {
    return this.imageError ? null : this.src;
  }

  get initial(): string {
    return (this.name || '?').charAt(0).toUpperCase();
  }

  get fontSize(): string {
    return Math.max(10, this.size * 0.35) + 'px';
  }

  get containerClasses(): string {
    const base = 'inline-flex items-center justify-center rounded-full bg-primary-100 text-primary-700 overflow-hidden flex-shrink-0';
    return base;
  }

  onImageError() {
    this.imageError = true;
    this.src = null;
  }
}
