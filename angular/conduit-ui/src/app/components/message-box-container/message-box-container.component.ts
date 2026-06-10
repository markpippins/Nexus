import { Component, computed } from '@angular/core';
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
    `.mbox-dock{position:fixed;inset:0;pointer-events:none;z-index:900}`,
    `.mbox-dock>*{pointer-events:auto}`,
  ],
})
export class MessageBoxContainerComponent {
  readonly instances = computed(() => this.mbox.instances());
  readonly activeId = computed(() => this.mbox.activeId());

  constructor(private mbox: MessageBoxService) {}
}
