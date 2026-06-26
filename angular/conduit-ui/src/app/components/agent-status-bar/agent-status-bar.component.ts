import { Component, computed, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { ConduitService } from '../../services/conduit.service';
import { AgentState, AgentStatus } from '../../services/types';

@Component({
  selector: 'app-agent-status-bar',
  standalone: true,
  imports: [NgClass],
  templateUrl: './agent-status-bar.component.html',
  styleUrls: ['./agent-status-bar.component.scss'],
})
export class AgentStatusBarComponent {
  readonly agents = computed(() => this.pipeline.agents());
  readonly agentMap = computed(() => {
    const map = new Map<string, AgentState>();
    for (const a of this.agents()) map.set(a.role, a);
    return map;
  });

  /** Track which agent roles are currently being killed (optimistic UI) */
  readonly killingRoles = signal<Set<string>>(new Set());

  /** Track whether a pause/resume operation is in flight */
  readonly conduitLoading = signal(false);

  constructor(public pipeline: ConduitService) {}

  kill(role: string): void {
    this.killingRoles.update(s => { const ns = new Set(s); ns.add(role); return ns; });
    this.pipeline.killAgent(role).subscribe({
      next: (result) => {
        console.log(`Agent ${role} killed:`, result);
        this.killingRoles.update(s => { const ns = new Set(s); ns.delete(role); return ns; });
      },
      error: (err) => {
        console.error(`Failed to kill agent ${role}:`, err);
        this.killingRoles.update(s => { const ns = new Set(s); ns.delete(role); return ns; });
      },
    });
  }

  pauseConduit(): void {
    this.conduitLoading.set(true);
    this.pipeline.pauseConduit().subscribe({
      next: () => {
        this.pipeline.conduitPaused.set(true);
        this.conduitLoading.set(false);
      },
      error: () => this.conduitLoading.set(false),
    });
  }

  resumeConduit(): void {
    this.conduitLoading.set(true);
    this.pipeline.resumeConduit().subscribe({
      next: () => {
        this.pipeline.conduitPaused.set(false);
        this.conduitLoading.set(false);
      },
      error: () => this.conduitLoading.set(false),
    });
  }

  getIcon(status: AgentStatus): string {
    switch (status) {
      case 'working': return '🟢';
      case 'blocked': return '🟡';
      case 'stale': return '⚠️';
      case 'gone': return '⚫';
      default: return '⚪';
    }
  }

  getTooltip(agent: AgentState): string {
    const parts = [`Role: ${agent.role}`, `Status: ${agent.status}`];
    if (agent.detail) parts.push(`Detail: ${agent.detail}`);
    if (agent.pid) parts.push(`PID: ${agent.pid}`);
    if (agent.lastHeartbeat) {
      const ago = Math.floor((Date.now() - new Date(agent.lastHeartbeat).getTime()) / 1000);
      parts.push(`Last heartbeat: ${ago}s ago`);
    }
    return parts.join('\n');
  }
}
