import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-nebula-cp-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-steel-800/60 flex-shrink-0">
        <div class="flex items-center gap-2">
          <h1 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Nebula Control Plane</h1>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium border border-primary-200 dark:border-primary-700">port 4014</span>
        </div>
        <div class="flex items-center gap-2">
          <a (click)="refresh()" class="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-700 rounded hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors cursor-pointer">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </a>
          <a [routerLink]="['/']" class="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            Back to Assembly
          </a>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <iframe
          #iframe
          [src]="trustedUrl"
          class="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Nebula Control Plane"
        ></iframe>
      </div>
    </div>
  `,
})
export class NebulaCpViewComponent {
  private sanitizer = inject(DomSanitizer);
  @ViewChild('iframe') iframeRef!: ElementRef<HTMLIFrameElement>;

  trustedUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl('http://localhost:4014');

  refresh() {
    // Reload via contentWindow for same-origin iframes
    try {
      this.iframeRef?.nativeElement?.contentWindow?.location?.reload();
    } catch {
      // Fallback: recreate the iframe src
      this.trustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
      setTimeout(() => {
        this.trustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl('http://localhost:4014');
      }, 50);
    }
  }
}
