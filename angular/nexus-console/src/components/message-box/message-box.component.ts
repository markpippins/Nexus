import {
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { MessageBoxInstance, MessageBoxService, SlashCommand } from '../../services/message-box.service';

type ResizeEdge = 'n' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

@Component({
  selector: 'app-message-box',
  standalone: true,
  imports: [NgFor, FormsModule],
  template: `
    <div
      class="message-box"
      [class.minimized]="box.minimized"
      [class.active]="active"
      [class.dragging]="dragging"
      [class.resizing]="resizing"
      [style.left.px]="box.left"
      [style.width.px]="box.minimized ? 280 : box.width"
      [style.height.px]="box.minimized ? null : box.height"
      [style.zIndex]="zIndex"
      (mousedown)="onFocus()"
    >
      @if (!box.minimized) {
        <div class="mbox-resize mbox-resize-n" (mousedown)="onResizeStart($event, 'n')"></div>
        <div class="mbox-resize mbox-resize-ne" (mousedown)="onResizeStart($event, 'ne')"></div>
        <div class="mbox-resize mbox-resize-nw" (mousedown)="onResizeStart($event, 'nw')"></div>
        <div class="mbox-resize mbox-resize-se" (mousedown)="onResizeStart($event, 'se')"></div>
        <div class="mbox-resize mbox-resize-sw" (mousedown)="onResizeStart($event, 'sw')"></div>
      }

      <div class="mbox-header" (mousedown)="onHeaderMouseDown($event)">
        <span class="mbox-title">{{ box.title }}</span>
        <div class="mbox-controls">
          <button
            class="mbox-btn"
            type="button"
            [title]="box.minimized ? 'Restore' : 'Minimize'"
            (mousedown)="$event.stopPropagation()"
            (click)="toggleMinimize($event)"
          >{{ box.minimized ? '▢' : '—' }}</button>
          <button
            class="mbox-btn"
            type="button"
            title="Close"
            (mousedown)="$event.stopPropagation()"
            (click)="close($event)"
          >✕</button>
        </div>
      </div>

      @if (!box.minimized) {
        <div class="mbox-body">
        <div class="mbox-transcript" #transcript>
          @if (box.messages.length === 0) {
            <div class="mbox-empty">
              Start a conversation…
            </div>
          }
          <div
            class="mbox-msg"
            *ngFor="let msg of box.messages"
            [class.user]="msg.role === 'user'"
            [class.assistant]="msg.role === 'assistant'"
          >
            <span class="mbox-role">{{ msg.role === 'user' ? 'You' : (box.agentRole || 'Operator') }}</span>
            <div class="mbox-content">{{ msg.content }}</div>
          </div>
          @if (box.submitting) {
            <div class="mbox-msg assistant">
              <span class="mbox-role">{{ box.agentRole || 'Operator' }}</span>
              <div class="mbox-content mbox-thinking">Thinking…</div>
            </div>
          }
        </div>

        <div class="mbox-compose">
          <textarea
            class="mbox-input"
            [ngModel]="box.draft"
            (ngModelChange)="onDraftChange($event)"
            (keydown)="onKeydown($event)"
            placeholder="Type a message…"
            rows="3"
            [disabled]="box.submitting"
          ></textarea>
          @if (slashVisible) {
            <div class="mbox-slash-dropdown">
            <div
              class="mbox-slash-item"
              *ngFor="let cmd of slashFiltered; let i = index"
              [class.selected]="i === slashSelectedIndex"
              (click)="selectSlashCommand(cmd)"
            >
              <span class="mbox-slash-cmd">{{ cmd.command }}</span>
              <span class="mbox-slash-desc">{{ cmd.description }}</span>
            </div>
            @if (slashFiltered.length === 0) {
              <div class="mbox-slash-empty">
                No matching commands
              </div>
            }
          </div>
          }
          <div class="mbox-actions">
            <button
              class="mbox-submit"
              type="button"
              (click)="submit()"
              [disabled]="box.submitting || !box.draft.trim()"
            >
              {{ box.submitting ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </div>
      </div>
      }
    </div>
  `,
  styles: [
    `.message-box{position:fixed;bottom:30px;display:flex;flex-direction:column;background:rgb(var(--color-surface));border:1px solid rgb(var(--color-border-base));border-bottom:none;border-radius:10px 10px 0 0;box-shadow:0 -2px 24px rgba(0,0,0,.25);overflow:hidden}`,
    `.message-box.minimized{height:auto!important;min-height:0}`,
    `.message-box.active{box-shadow:0 -4px 28px rgba(0,0,0,.35),0 0 0 1px rgb(var(--color-accent-ring))}`,
    `.mbox-header{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgb(var(--color-surface-muted));border-bottom:1px solid rgb(var(--color-border-muted));cursor:grab;user-select:none;flex-shrink:0}`,
    `.dragging .mbox-header{cursor:grabbing}`,
    `.minimized .mbox-header{border-bottom:none}`,
    `.mbox-title{flex:1;font-size:13px;font-weight:600;color:rgb(var(--color-text-base));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.mbox-controls{display:flex;gap:2px}`,
    `.mbox-btn{background:none;border:none;color:rgb(var(--color-text-muted));width:28px;height:28px;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center}`,
    `.mbox-btn:hover{background:rgb(var(--color-surface-hover));color:rgb(var(--color-text-base))}`,
    `.mbox-body{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}`,
    `.mbox-transcript{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:rgb(var(--color-background))}`,
    `.mbox-empty{font-size:12px;color:rgb(var(--color-text-muted));font-style:italic;text-align:center;padding:24px 8px}`,
    `.mbox-msg{display:flex;flex-direction:column;gap:2px}`,
    `.mbox-msg.user{align-items:flex-end}`,
    `.mbox-msg.assistant{align-items:flex-start}`,
    `.mbox-role{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:rgb(var(--color-text-muted))}`,
    `.mbox-content{font-size:13px;line-height:1.5;padding:8px 10px;border-radius:8px;max-width:95%;white-space:pre-wrap;word-break:break-word}`,
    `.mbox-msg.user .mbox-content{background:rgb(var(--color-accent-emphasis));color:rgb(var(--color-accent-text))}`,
    `.mbox-msg.assistant .mbox-content{background:rgb(var(--color-surface));color:rgb(var(--color-text-base));border:1px solid rgb(var(--color-border-muted))}`,
    `.mbox-thinking{font-style:italic;color:rgb(var(--color-text-muted))}`,
    `.mbox-compose{flex-shrink:0;border-top:1px solid rgb(var(--color-border-muted));padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:rgb(var(--color-surface));position:relative}`,
    `.mbox-input{width:100%;padding:8px 10px;border:1px solid rgb(var(--color-border-base));border-radius:6px;font-size:13px;font-family:inherit;background:rgb(var(--color-background));color:rgb(var(--color-text-base));resize:vertical;min-height:56px;max-height:120px;box-sizing:border-box}`,
    `.mbox-input:focus{outline:none;border-color:rgb(var(--color-accent-text));box-shadow:0 0 0 2px rgb(var(--color-accent-emphasis))}`,
    `.mbox-input:disabled{opacity:.6;cursor:not-allowed}`,
    `.mbox-actions{display:flex;justify-content:flex-end}`,
    `.mbox-submit{background:rgb(var(--color-accent-emphasis));color:rgb(var(--color-accent-text));border:none;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}`,
    `.mbox-submit:hover:not(:disabled){opacity:.85}`,
    `.mbox-submit:disabled{opacity:.5;cursor:not-allowed}`,
    `.mbox-resize{position:absolute;z-index:3}`,
    `.mbox-resize::after{content:'';position:absolute;opacity:0;transition:opacity .15s,background .15s;background:rgb(var(--color-accent-ring))}`,
    `.message-box:hover .mbox-resize::after,.message-box.resizing .mbox-resize::after{opacity:.55}`,
    `.mbox-resize-n{top:0;left:10px;right:10px;height:6px;cursor:ns-resize}`,
    `.mbox-resize-n::after{top:0;left:0;right:0;height:3px}`,
    `.mbox-resize-ne{top:0;right:0;width:12px;height:12px;cursor:nesw-resize}`,
    `.mbox-resize-ne::after{top:0;right:0;width:10px;height:3px}`,
    `.mbox-resize-nw{top:0;left:0;width:12px;height:12px;cursor:nwse-resize}`,
    `.mbox-resize-nw::after{top:0;left:0;width:10px;height:3px}`,
    `.mbox-resize-se{right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize}`,
    `.mbox-resize-se::after{right:0;bottom:0;width:10px;height:3px}`,
    `.mbox-resize-sw{left:0;bottom:0;width:12px;height:12px;cursor:nesw-resize}`,
    `.mbox-resize-sw::after{left:0;bottom:0;width:10px;height:3px}`,
    `.mbox-slash-dropdown{position:absolute;bottom:100%;left:12px;right:12px;background:rgb(var(--color-background));border:1px solid rgb(var(--color-border-base));border-bottom:none;border-radius:8px 8px 0 0;box-shadow:0 -4px 16px rgba(0,0,0,.25);max-height:160px;overflow-y:auto;z-index:10}`,
    `.mbox-slash-item{padding:8px 12px;cursor:pointer;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid rgb(var(--color-border-muted))}`,
    `.mbox-slash-item:last-child{border-bottom:none}`,
    `.mbox-slash-item.selected,.mbox-slash-item:hover{background:rgb(var(--color-surface-hover))}`,
    `.mbox-slash-cmd{font-size:13px;font-weight:600;color:rgb(var(--color-accent-text))}`,
    `.mbox-slash-desc{font-size:11px;color:rgb(var(--color-text-muted))}`,
    `.mbox-slash-empty{padding:10px 12px;text-align:center;font-size:12px;color:rgb(var(--color-text-muted));font-style:italic}`,
  ],
})
export class MessageBoxComponent {
  @Input({ required: true }) box!: MessageBoxInstance;
  @Input() active = false;

  @ViewChild('transcript') transcriptRef?: ElementRef<HTMLElement>;

  dragging = false;
  resizing = false;
  slashVisible = false;
  slashFiltered: SlashCommand[] = [];
  slashSelectedIndex = 0;

  private dragCleanup?: () => void;
  private resizeCleanup?: () => void;

  constructor(private mbox: MessageBoxService) {}

  get zIndex(): number {
    return 900 + (this.active ? 100 : 0);
  }

  onFocus(): void {
    this.mbox.focus(this.box.id);
  }

  onHeaderMouseDown(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.mbox-btn')) return;

    event.preventDefault();
    this.onFocus();
    this.dragging = true;

    const startX = event.clientX;
    const startLeft = this.box.left;

    const onMove = (e: MouseEvent) => {
      const left = startLeft + (e.clientX - startX);
      this.mbox.updatePosition(this.box.id, left);
    };

    const onUp = () => {
      this.dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.dragCleanup = undefined;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this.dragCleanup = onUp;
  }

  onResizeStart(event: MouseEvent, edge: ResizeEdge): void {
    event.preventDefault();
    event.stopPropagation();
    this.onFocus();
    this.resizing = true;

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = this.box.left;
    const startWidth = this.box.width;
    const startHeight = this.box.height;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let left = startLeft;
      let width = startWidth;
      let height = startHeight;

      if (edge.includes('e')) width = startWidth + dx;
      if (edge.includes('w')) {
        width = startWidth - dx;
        left = startLeft + dx;
      }
      if (edge.includes('n')) height = startHeight - dy;

      this.mbox.updateSize(this.box.id, left, width, height);
    };

    const onUp = () => {
      this.resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.resizeCleanup = undefined;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this.resizeCleanup = onUp;
  }

  toggleMinimize(event: MouseEvent): void {
    event.stopPropagation();
    this.mbox.toggleMinimize(this.box.id);
  }

  close(event: MouseEvent): void {
    event.stopPropagation();
    this.mbox.close(this.box.id);
  }

  onDraftChange(value: string): void {
    this.mbox.updateDraft(this.box.id, value);
    this.updateSlashState(value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.slashVisible) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.slashSelectedIndex = Math.min(this.slashSelectedIndex + 1, this.slashFiltered.length - 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.slashSelectedIndex = Math.max(this.slashSelectedIndex - 1, 0);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        if (this.slashFiltered.length > 0) {
          this.selectSlashCommand(this.slashFiltered[this.slashSelectedIndex]);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.dismissSlash();
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  private updateSlashState(value: string): void {
    if (value.startsWith('/') && !value.includes(' ')) {
      const query = value.slice(1);
      this.slashFiltered = this.mbox.getFilteredCommands(query);
      this.slashVisible = true;
      this.slashSelectedIndex = 0;
    } else {
      this.slashVisible = false;
    }
  }

  selectSlashCommand(cmd: SlashCommand): void {
    this.mbox.updateDraft(this.box.id, cmd.command);
    this.slashVisible = false;
    this.submit();
  }

  private dismissSlash(): void {
    this.slashVisible = false;
  }

  submit(): void {
    this.mbox.submit(this.box.id).then(() => this.scrollTranscript());
  }

  private scrollTranscript(): void {
    setTimeout(() => {
      const el = this.transcriptRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }
}
