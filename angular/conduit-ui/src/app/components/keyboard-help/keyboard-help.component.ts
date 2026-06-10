import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { KeyboardShortcutService, ShortcutHandler } from '../../services/keyboard.service';
import { SLASH_COMMANDS } from '../../services/message-box.service';

@Component({
  selector: 'app-keyboard-help',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <div class="overlay" *ngIf="visible()" (click)="close()">
      <div class="panel" (click)="$event.stopPropagation()">
        <div class="header">
          <h2>Keyboard Shortcuts</h2>
          <button class="close-btn" (click)="close()">✕</button>
        </div>

        <div class="section">
          <h3>Global</h3>
          <div class="shortcut" *ngFor="let s of global()">
            <kbd>{{ label(s.key) }}</kbd>
            <span>{{ s.description }}</span>
          </div>
        </div>

        <div class="section" *ngIf="view().length > 0">
          <h3>Current View</h3>
          <div class="shortcut" *ngFor="let s of view()">
            <kbd>{{ label(s.key) }}</kbd>
            <span>{{ s.description }}</span>
          </div>
        </div>

        <div class="section">
          <h3>Slash Commands</h3>
          <div class="shortcut" *ngFor="let cmd of slashCommands">
            <kbd>{{ cmd.command }}</kbd>
            <span>{{ cmd.description }}</span>
          </div>
        </div>

        <p class="hint">Press <kbd>?</kbd> again to close</p>
      </div>
    </div>
  `,
  styles: [
    `.overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:16px}`,
    `.panel{background:var(--bg-primary,#fff);color:var(--text-primary,#111);border-radius:12px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3)}`,
    `.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}`,
    `.header h2{margin:0;font-size:18px}`,
    `.close-btn{background:none;border:none;color:var(--text-muted,#666);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}`,
    `.close-btn:hover{background:var(--bg-secondary,#f0f0f0)}`,
    `.section{margin-bottom:16px}`,
    `.section h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666)}`,
    `.shortcut{display:flex;align-items:center;gap:12px;padding:6px 0;font-size:14px}`,
    `.shortcut span{color:var(--text-primary,#111)}`,
    `kbd{display:inline-block;padding:2px 8px;font-size:12px;font-family:monospace;background:var(--bg-secondary,#f0f0f0);border:1px solid var(--border-default,#ddd);border-radius:4px;min-width:28px;text-align:center;color:var(--text-primary,#111)}`,
    `.hint{font-size:12px;color:var(--text-muted,#666);text-align:center;margin:12px 0 0}`,
  ],
})
export class KeyboardHelpComponent implements OnInit, OnDestroy {
  readonly visible = signal(false);
  readonly global = signal<ShortcutHandler[]>([]);
  readonly view = signal<ShortcutHandler[]>([]);
  readonly slashCommands = SLASH_COMMANDS;

  constructor(private kb: KeyboardShortcutService) {}

  ngOnInit(): void {
    this.kb.onHelpToggle(() => {
      this.visible.set(this.kb.helpVisible);
      if (this.kb.helpVisible) {
        const all = this.kb.getActiveShortcuts();
        this.global.set(all.global);
        this.view.set(all.view);
      }
    });
  }

  ngOnDestroy(): void {
    // Service detaches listeners; no extra cleanup needed.
  }

  close(): void {
    if (this.kb.helpVisible) {
      this.kb.toggleHelp();
    }
  }

  label(key: string): string {
    const map: Record<string, string> = {
      '1': '1', '2': '2', '3': '3', '4': '4', '5': '5',
      '6': '6', '7': '7', '8': '8', '9': '9',
      'j': 'J', 'k': 'K', 'Enter': '↵ Enter',
      '/': '/', 't': 'T', 'Escape': 'Esc', '?': '?',
    };
    return map[key] || key;
  }
}
