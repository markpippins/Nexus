import { Injectable, signal, effect } from '@angular/core';
import { ConduitService } from './conduit.service';
import { ToastEntry, ToastType } from './types';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastEntry[]>([]);
  private idCounter = 0;
  private recentMessages = new Map<string, number>(); // message key → timestamp

  constructor(private pipeline: ConduitService) {
    this.watchActivity();
  }

  private watchActivity() {
    effect(() => {
      const log = this.pipeline.activityLog();
      if (log.length === 0) return;
      const latest = log[0];
      const toast = this.activityToToast(latest);
      if (toast) this.push(toast);
    });
  }

  private activityToToast(a: { type: string; detail: string; timestamp: string }): ToastEntry | null {
    if (a.type === 'builder_update') {
      if (a.detail.includes('stale')) return this.make('builder_stale', 'Builder Stale', a.detail, '⚠️', 'high', a.timestamp);
      if (a.detail.includes('killed')) return this.make('builder_killed', 'Builder Killed', a.detail, '🔴', 'high', a.timestamp);
      return null;
    }
    if (a.type === 'circuit_breaker_update') {
      if (a.detail.includes('TRIPPED')) return this.make('circuit_tripped', 'Circuit Tripped', a.detail, '⛔', 'high', a.timestamp);
      if (a.detail.includes('RESOLVED')) return this.make('circuit_resolved', 'Circuit Resolved', a.detail, '🟢', 'normal', a.timestamp);
      return null;
    }
    if (a.type === 'agent_update') {
      if (a.detail.includes('stale')) return this.make('agent_stale', 'Agent Stale', a.detail, '⚠️', 'normal', a.timestamp);
      if (a.detail.includes('gone')) return this.make('agent_gone', 'Agent Gone', a.detail, '⚫', 'normal', a.timestamp);
      return null;
    }
    if (a.type === 'connected') return this.make('sse_reconnected', 'Reconnected', 'SSE stream reconnected', '🟢', 'normal', a.timestamp);
    return null;
  }

  private make(type: ToastType, title: string, message: string, icon: string, priority: 'high' | 'normal', ts: string): ToastEntry | null {
    // Deduplicate: same type + message within 30 seconds
    const key = `${type}:${message}`;
    const last = this.recentMessages.get(key);
    const now = Date.now();
    if (last && now - last < 30000) return null;
    this.recentMessages.set(key, now);
    return { id: `toast-${++this.idCounter}`, type, title, message, icon, timestamp: ts, priority };
  }

  push(entry: ToastEntry) {
    this.toasts.update((t) => [...t, entry]);
    const duration = entry.priority === 'high' ? 8000 : 5000;
    setTimeout(() => this.dismiss(entry.id), duration);
  }

  dismiss(id: string) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  /** Manually push a toast for SSE disconnect (called from pipeline service if possible) */
  pushDisconnect() {
    this.push(this.make('sse_disconnected', 'Disconnected', 'SSE connection lost', '🔴', 'high', new Date().toISOString())!);
  }
}
