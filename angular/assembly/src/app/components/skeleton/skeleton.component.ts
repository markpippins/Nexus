import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="animate-pulse bg-gray-200 rounded" [class.rounded-full]="circle()" [class.w-full]="!width()" [style.width]="width()" [style.height]="height()"></div>
  `,
})
export class SkeletonComponent {
  width = input<string>();
  height = input<string>('1rem');
  circle = input(false);
}
