import { BaseWatcher } from "./base";
import { CircuitBreaker } from "../types";
import { getBreaker, clearBreaker, BreakerRow } from "../db";

const CB_POLL_INTERVAL = 5000;

export class CircuitBreakerWatcher extends BaseWatcher {
  status: CircuitBreaker = { tripped: false, paused: false };
  private interval: ReturnType<typeof setInterval> | null = null;
  private previousTripped: boolean = false;

  async initialize(): Promise<void> {
    this.status = this.readCircuitBreaker();
    this.startPolling();
  }

  destroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private readCircuitBreaker(): CircuitBreaker {
    const row = getBreaker();
    return breakerRowToStatus(row);
  }

  private startPolling() {
    this.interval = setInterval(() => {
      const cb = this.readCircuitBreaker();
      const changed = this.previousTripped !== cb.tripped;
      this.previousTripped = cb.tripped;
      this.status = cb;
      if (changed) {
        this.emit({ type: "circuit_breaker_update", data: cb });
      }
    }, CB_POLL_INTERVAL);
  }
}

/** Convert database row to API CircuitBreaker object. */
export function breakerRowToStatus(row: BreakerRow): CircuitBreaker {
  const paused = row.paused === 1;
  if (!row.tripped) return { tripped: false, paused };

  // Check if retry_after has expired — persist the clear so DB stays consistent
  if (row.tripped_at && row.retry_after) {
    const trippedTime = new Date(row.tripped_at).getTime();
    const expiryTime = trippedTime + row.retry_after * 1000;
    if (Date.now() >= expiryTime) {
      clearBreaker();
      return { tripped: false, paused };
    }
  }

  return {
    tripped: true,
    retryAfter: row.retry_after,
    reason: row.error ?? undefined,
    paused,
  };
}
