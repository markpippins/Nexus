import { Component, ChangeDetectionStrategy, input, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-iframe-view',
  templateUrl: './iframe-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IframeViewComponent {
  private sanitizer = inject(DomSanitizer);

  src = input.required<string>();
  trustedSrc = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.src()));
}
