import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import { Bash, type BashExecResult } from 'just-bash/browser';
import { UiPreferencesService } from '../../services/ui-preferences.service.js';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terminal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }
    `,
  ],
})
export class TerminalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('terminal') terminalEl!: ElementRef<HTMLDivElement>;

  private readonly initialCwd = '/home/user';
  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private bash = new Bash({
    cwd: this.initialCwd,
    env: {
      TERM: 'xterm-256color',
    },
  });
  private currentCwd = this.initialCwd;
  private currentEnv: Record<string, string> = {
    TERM: 'xterm-256color',
  };
  private inputBuffer = '';
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private isExecuting = false;
  private hostEl = inject(ElementRef);
  private uiPreferencesService = inject(UiPreferencesService);
  // SSE log streaming for broker logs
  private logEventSource: EventSource | null = null;

  private getLogStreamUrl(): string {
    // try {
    //   const origin = typeof window !== 'undefined' && window.location?.origin
    //     ? window.location.origin
    //     : '';
    //   if (origin) {
    //     return origin.replace(/\/+$/, '') + '/api/v1/broker/logs/stream';
    //   }
    // } catch {
    //   // ignore and fallback below
    // }
    return 'http://localhost:8080/api/v1/broker/logs/stream';
  }

  constructor() {
    effect(() => {
      // Rerun this logic whenever the theme signal changes.
      this.uiPreferencesService.theme();

      // The app.component effect which applies the class to the body will have already run.
      // So we can now apply the new theme to the terminal if it exists.
      if (this.term) {
        this.applyTheme();
      }
    });
  }

  ngAfterViewInit(): void {
    this.term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
      fontSize: 13,
    });

    this.applyTheme(); // Apply initial theme

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);

    this.term.open(this.terminalEl.nativeElement);

    this.fitAddon.fit();

    this.term.writeln('\x1B[1;3;34mWelcome to the Nexus Console!\x1B[0m');
    this.term.writeln('Powered by xterm.js + just-bash');
    this.term.writeln('----------------------------------');
    this.writePrompt();

    this.term.onData((data: string) => {
      void this.handleTerminalInput(data);
    });

    this.resizeObserver = new ResizeObserver(() => {
      try {
        setTimeout(() => this.fitAddon?.fit(), 0);
      } catch (e) {
        console.warn('FitAddon resize failed. This can happen during rapid resizing.', e);
      }
    });

    this.resizeObserver.observe(this.hostEl.nativeElement);
  }

  private async handleTerminalInput(data: string): Promise<void> {
    if (!this.term) {
      return;
    }

    if (this.isExecuting) {
      if (data === '\u0003') {
        this.term.write('^C');
      }
      return;
    }

    switch (data) {
      case '\r':
        await this.executeCurrentCommand();
        return;
      case '\u007F':
        this.handleBackspace();
        return;
      case '\u0003':
        this.handleInterrupt();
        return;
      case '\u000C':
        this.term.clear();
        this.writePrompt();
        return;
      case '\u001b[A':
        this.navigateHistory(-1);
        return;
      case '\u001b[B':
        this.navigateHistory(1);
        return;
      case '\u001b[C':
      case '\u001b[D':
      case '\t':
        return;
      default:
        if (this.isPrintableInput(data)) {
          this.inputBuffer += data;
          this.term.write(data);
        }
    }
  }

  private async executeCurrentCommand(): Promise<void> {
    if (!this.term) {
      return;
    }

    const command = this.inputBuffer;
    this.term.write('\r\n');

    if (!command.trim()) {
      this.inputBuffer = '';
      this.historyIndex = -1;
      this.writePrompt();
      return;
    }

    // Support lightweight client-side control commands
    const trimmedCmd = command.trim();
    if (trimmedCmd === 'start-logging') {
      this.startLogging();
      this.inputBuffer = '';
      this.writePrompt();
      return;
    }
    if (trimmedCmd === 'stop-logging') {
      this.stopLogging();
      this.inputBuffer = '';
      this.writePrompt();
      return;
    }

    if (command.trim() === 'clear') {
      this.term.clear();
      this.inputBuffer = '';
      this.historyIndex = -1;
      this.writePrompt();
      return;
    }

    this.commandHistory.push(command);
    this.historyIndex = -1;
    this.inputBuffer = '';
    this.isExecuting = true;

    try {
      const result = await this.bash.exec(command, {
        cwd: this.currentCwd,
        env: this.currentEnv,
      });

      this.applyExecutionState(result);
      this.writeResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.term.writeln(`bash: ${message}`);
    } finally {
      this.isExecuting = false;
      this.writePrompt();
    }
  }

  private applyExecutionState(result: BashExecResult): void {
    this.currentEnv = result.env;
    this.currentCwd = result.env.PWD || this.currentCwd;
  }

  private writeResult(result: BashExecResult): void {
    if (!this.term) {
      return;
    }

    const stdout = this.normalizeOutput(result.stdout);
    const stderr = this.normalizeOutput(result.stderr);

    if (stdout) {
      this.term.write(stdout);
      if (!stdout.endsWith('\r\n')) {
        this.term.write('\r\n');
      }
    }

    if (stderr) {
      this.term.write(`\x1b[31m${stderr}\x1b[0m`);
      if (!stderr.endsWith('\r\n')) {
        this.term.write('\r\n');
      }
    }
  }

  private handleBackspace(): void {
    if (!this.term || this.inputBuffer.length === 0) {
      return;
    }

    this.inputBuffer = this.inputBuffer.slice(0, -1);
    this.term.write('\b \b');
  }

  private handleInterrupt(): void {
    if (!this.term) {
      return;
    }

    this.inputBuffer = '';
    this.historyIndex = -1;
    this.term.write('^C\r\n');
    this.writePrompt();
  }

  private navigateHistory(direction: -1 | 1): void {
    if (!this.term || this.commandHistory.length === 0) {
      return;
    }

    if (direction === -1) {
      this.historyIndex =
        this.historyIndex === -1
          ? this.commandHistory.length - 1
          : Math.max(0, this.historyIndex - 1);
    } else if (this.historyIndex !== -1) {
      this.historyIndex += 1;
      if (this.historyIndex >= this.commandHistory.length) {
        this.historyIndex = -1;
      }
    } else {
      return;
    }

    this.inputBuffer = this.historyIndex === -1 ? '' : this.commandHistory[this.historyIndex];
    this.renderInputBuffer();
  }

  private renderInputBuffer(): void {
    if (!this.term) {
      return;
    }

    this.term.write('\r\x1b[2K');
    this.writePrompt(false);
    this.term.write(this.inputBuffer);
  }

  private writePrompt(includeBuffer = true): void {
    if (!this.term) {
      return;
    }

    this.term.write(`\x1b[1;32m${this.getPrompt()}\x1b[0m`);
    if (includeBuffer && this.inputBuffer) {
      this.term.write(this.inputBuffer);
    }
  }

  private getPrompt(): string {
    return `user@nexus:${this.formatPromptPath(this.currentCwd)}$ `;
  }

  private formatPromptPath(path: string): string {
    return path === this.initialCwd ? '~' : path.replace(`${this.initialCwd}/`, '~/');
  }

  private normalizeOutput(output: string): string {
    return output.replace(/\r?\n/g, '\r\n');
  }

  private isPrintableInput(data: string): boolean {
    return data >= ' ' && data !== '\u007F' && !data.startsWith('\u001b');
  }

  private applyTheme(): void {
    const computedStyle = getComputedStyle(document.body);
    const newTheme = {
      background: `rgb(${computedStyle.getPropertyValue('--color-surface-muted').trim()})`,
      foreground: `rgb(${computedStyle.getPropertyValue('--color-text-muted').trim()})`,
      cursor: `rgb(${computedStyle.getPropertyValue('--color-accent-text').trim()})`,
      selectionBackground: `rgba(${computedStyle.getPropertyValue('--color-accent-bg').trim()}, 0.5)`,
      selectionForeground: `rgb(${computedStyle.getPropertyValue('--color-text-base').trim()})`,
    };
    if (this.term) {
      this.term.options.theme = newTheme;
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.term) {
      this.term.dispose();
    }
    // Ensure SSE stream is cleaned up
    if (this.logEventSource) {
      try {
        this.logEventSource.close();
      } catch {
        // ignore
      }
      this.logEventSource = null;
    }
  }

  private startLogging(): void {
    // Close any existing stream
    if (this.logEventSource) {
      try { this.logEventSource.close(); } catch {}
      this.logEventSource = null;
    }
    const url = this.getLogStreamUrl();
    this.logEventSource = new EventSource(url);
    // Broker traffic events are named via SSE "event:" header. Listen explicitly.
    this.logEventSource.addEventListener('broker-traffic', (ev: MessageEvent) => {
      const raw = ev.data ?? '';
      // Try to parse JSON payload for nicer formatting; fall back to raw data
      try {
        const payload = JSON.parse(raw);
        this.term?.writeln(`broker-traffic: ${JSON.stringify(payload)}\n`);
      } catch {
        this.term?.writeln(`broker-traffic: ${raw}\n`);
      }
    });
    this.logEventSource.addEventListener('ping', (ev: MessageEvent) => {
      const ts = ev.data ?? '';
      this.term?.writeln(`ping: ${ts}`);
    });
    this.logEventSource.onerror = () => {
      this.term?.writeln('[broker-stream-log-error]');
      try { this.logEventSource?.close(); } catch {}
      this.logEventSource = null;
    };
    this.term?.writeln('[broker-logs-stream] started');
  }

  private stopLogging(): void {
    if (this.logEventSource) {
      try { this.logEventSource.close(); } catch {}
      this.logEventSource = null;
      this.term?.writeln('[broker-logs-stream] stopped');
    }
  }
}
