import { Component, computed, input, effect } from '@angular/core';
import { MessageBoxService } from '../../services/message-box.service';
import { MessageBoxComponent } from '../message-box/message-box.component';

@Component({
  selector: 'app-message-box-container',
  standalone: true,
  imports: [MessageBoxComponent],
  template: `
    <div class="mbox-dock">
      @for (box of instances(); track box.id) {
        <app-message-box
          [box]="box"
          [active]="box.id === activeId()"
        />
      }
    </div>
  `,
  styles: [
    `.mbox-dock{position:fixed;inset:0;bottom:0;pointer-events:none;z-index:900}`,
    `.mbox-dock>*{pointer-events:auto}`,
  ],
})
export class MessageBoxContainerComponent {
  readonly instances = computed(() => this.mbox.instances());
  readonly activeId = computed(() => this.mbox.activeId());

  /**
   * Dock height above the viewport bottom (px). The app passes
   * bottom-bar + console-resizer + console-pane height when the console is
   * open so the messagebox docks above the console panel instead of on top of it.
   */
  readonly consoleOffset = input(30);

  constructor(private mbox: MessageBoxService) {
    effect(() => this.mbox.setBottomOffset(this.consoleOffset()));
  }
}
