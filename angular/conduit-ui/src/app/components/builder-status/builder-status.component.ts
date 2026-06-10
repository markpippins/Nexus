import { Component, computed, signal, OnDestroy, effect } from '@angular/core';
import { NgClass } from '@angular/common';
import { ConduitService } from '../../services/conduit.service';

@Component({
  selector: 'app-builder-status',
  standalone: true,
  imports: [NgClass],
  templateUrl: './builder-status.component.html',
  styleUrls: ['./builder-status.component.scss'],
})
export class BuilderStatusComponent implements OnDestroy {
  readonly elapsed = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly builder = computed(() => this.pipeline.builder());
  readonly circuitBreaker = computed(() => this.pipeline.circuitBreaker());

  /** Tracks whether a breaker trip/reset operation is in flight */
  readonly breakerLoading = signal(false);

  /** Shows confirmation UI before tripping the breaker */
  readonly showTripConfirm = signal(false);

  constructor(private pipeline: ConduitService) {
    this.timer = setInterval(() => {
      const b = this.builder();
      if (b.status === 'running' && b.elapsedSeconds != null) {
        this.elapsed.set(this.elapsed() + 1);
      }
    }, 1000);

    effect(() => {
      const b = this.builder();
      if (b.status === 'running') {
        this.elapsed.set(b.elapsedSeconds ?? 0);
      } else {
        this.elapsed.set(0);
      }
    });
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  tripBreaker(): void {
    this.breakerLoading.set(true);
    this.pipeline.tripCircuitBreaker('MANUAL_TRIP').subscribe({
      next: (result) => {
        console.log('Circuit breaker tripped:', result);
        this.breakerLoading.set(false);
        this.showTripConfirm.set(false);
      },
      error: (err) => {
        console.error('Failed to trip circuit breaker:', err);
        this.breakerLoading.set(false);
      },
    });
  }

  resetBreaker(): void {
    this.breakerLoading.set(true);
    this.pipeline.resetCircuitBreaker().subscribe({
      next: (result) => {
        console.log('Circuit breaker reset:', result);
        this.breakerLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to reset circuit breaker:', err);
        this.breakerLoading.set(false);
      },
    });
  }

  getStatusClass(): string {
    if (this.circuitBreaker().tripped) return 'status-tripped';
    switch (this.builder().status) {
      case 'running':
        return 'status-running';
      case 'stale':
        return 'status-stale';
      case 'killed':
        return 'status-killed';
      default:
        return 'status-idle';
    }
  }

  getStatusLabel(): string {
    if (this.circuitBreaker().tripped) return '⛔ Circuit Breaker TRIPPED';
    const b = this.builder();
    switch (b.status) {
      case 'running':
        return `🟢 Builder Running · PID ${b.pid}`;
      case 'stale':
        return `⚠️ Builder Stale · PID ${b.pid}`;
      case 'killed':
        return `🔴 Builder Killed · PID ${b.pid}`;
      default:
        return 'No builder running';
    }
  }

  getElapsedLabel(): string {
    const e = this.elapsed();
    if (e < 60) return `${e}s elapsed`;
    const mins = Math.floor(e / 60);
    const secs = e % 60;
    return `${mins}m ${secs}s elapsed`;
  }

  getLastActivityLabel(): string | null {
    const b = this.builder();
    if (!b.lastLogLine) return null;
    const snippet = b.lastLogLine.length > 80 ? b.lastLogLine.slice(0, 80) + '…' : b.lastLogLine;
    return snippet;
  }

  getCircuitBreakerDetail(): string {
    const cb = this.circuitBreaker();
    if (!cb.tripped) return '';
    const parts: string[] = [];
    if (cb.reason) parts.push(cb.reason);
    if (cb.retryAfter != null) {
      const mins = Math.floor(cb.retryAfter / 60);
      parts.push(`Retry after ${mins}m`);
    }
    return parts.join(' · ');
  }
}
