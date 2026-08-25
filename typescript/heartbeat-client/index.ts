/**
 * nexus-heartbeat — lightweight TypeScript client for service-registry heartbeats.
 *
 * Sends periodic heartbeats to the service-registry (port 8085).
 * The registry marks services as OFFLINE if no heartbeat arrives within 90s.
 *
 * Usage:
 *   import { startHeartbeat, stopHeartbeat } from '@nexus/heartbeat-client';
 *   startHeartbeat({ serviceId: 18, serviceName: 'cascade-srv' });
 *   // ... service runs ...
 *   stopHeartbeat();
 *
 * Or as an instance:
 *   const hb = new Heartbeat({ serviceId: 18, serviceName: 'cascade-srv' });
 *   hb.start();
 *   // ... service runs ...
 *   hb.stop();
 *
 * CLI test:
 *   npx tsx index.ts --service-id 18 --service-name cascade-srv
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HeartbeatOptions {
  /** Numeric ID from registry.services */
  serviceId: number;
  /** Service name as registered in registry.services */
  serviceName: string;
  /** Registry base URL (default: http://localhost:8085) */
  registryUrl?: string;
  /** Seconds between heartbeats (default: 20, must be < 60s) */
  interval?: number;
  /** HTTP timeout in ms (default: 5000) */
  timeoutMs?: number;
  /** Logger function (default: console.debug) */
  log?: (...args: any[]) => void;
}

export interface HeartbeatStats {
  serviceName: string;
  serviceId: number;
  totalHeartbeats: number;
  totalFailures: number;
  consecutiveFailures: number;
  running: boolean;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL =
  process.env.HEARTBEAT_REGISTRY_URL ||
  process.env.REGISTRY_URL ||
  "http://localhost:8085";
const DEFAULT_INTERVAL = 20; // seconds (well under 60s TTL / 90s stale)
const DEFAULT_TIMEOUT_MS = 5000;

// ─── Heartbeat class ───────────────────────────────────────────────────────

export class Heartbeat {
  private readonly opts: Required<HeartbeatOptions>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _totalHeartbeats = 0;
  private _totalFailures = 0;
  private _consecutiveFailures = 0;
  private readonly logger: (...args: any[]) => void;

  constructor(options: HeartbeatOptions) {
    this.opts = {
      registryUrl: DEFAULT_REGISTRY_URL,
      interval: DEFAULT_INTERVAL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      log: console.debug,
      ...options,
    };
    this.logger = this.opts.log;
  }

  private get url(): string {
    const base = this.opts.registryUrl.replace(/\/+$/, "");
    return `${base}/api/v1/registry/heartbeat/${this.opts.serviceName}`;
  }

  /** Send a single heartbeat. Returns true on success. */
  async sendOnce(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

      const resp = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: this.opts.serviceId }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (resp.ok) {
        this._consecutiveFailures = 0;
        this._totalHeartbeats++;
        this.logger(
          `Heartbeat OK: ${this.opts.serviceName} (total: ${this._totalHeartbeats})`,
        );
        return true;
      } else {
        this._consecutiveFailures++;
        this._totalFailures++;
        const body = await resp.text().catch(() => "");
        this.logger(
          `Heartbeat ${resp.status} for ${this.opts.serviceName}: ${body}`,
        );
        return false;
      }
    } catch (err: any) {
      this._consecutiveFailures++;
      this._totalFailures++;
      if (
        this._consecutiveFailures <= 3 ||
        this._consecutiveFailures % 10 === 0
      ) {
        this.logger(
          `Heartbeat failed for ${this.opts.serviceName} (${this._consecutiveFailures} consecutive):`,
          err.message || err,
        );
      }
      return false;
    }
  }

  /** Start sending periodic heartbeats. */
  start(): void {
    if (this.timer) {
      this.logger(`Heartbeat already running for ${this.opts.serviceName}`);
      return;
    }

    this.logger(
      `Heartbeat started: ${this.opts.serviceName} (id=${this.opts.serviceId}, interval=${this.opts.interval}s)`,
    );

    // Send first heartbeat immediately
    this.sendOnce();

    this.timer = setInterval(() => {
      this.sendOnce();
    }, this.opts.interval * 1000);

    // Ensure the timer doesn't keep the process alive
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /** Stop the heartbeat. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger(
        `Heartbeat stopped: ${this.opts.serviceName} (sent=${this._totalHeartbeats}, failed=${this._totalFailures})`,
      );
    }
  }

  /** Get current stats. */
  get stats(): HeartbeatStats {
    return {
      serviceName: this.opts.serviceName,
      serviceId: this.opts.serviceId,
      totalHeartbeats: this._totalHeartbeats,
      totalFailures: this._totalFailures,
      consecutiveFailures: this._consecutiveFailures,
      running: this.timer !== null,
    };
  }
}

// ─── Singleton API ──────────────────────────────────────────────────────────

let _active: Heartbeat | null = null;

/**
 * Start a global singleton heartbeat.
 * Replaces any existing heartbeat.
 */
export function startHeartbeat(options: HeartbeatOptions): Heartbeat {
  if (_active) {
    _active.stop();
  }

  _active = new Heartbeat(options);
  _active.start();

  // Register cleanup on process exit
  const cleanup = () => stopHeartbeat();
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  return _active;
}

/** Stop the global singleton heartbeat. */
export function stopHeartbeat(): void {
  if (_active) {
    _active.stop();
    _active = null;
  }
}

/** Get the current active heartbeat (or null). */
export function getHeartbeat(): Heartbeat | null {
  return _active;
}

// The ESM CLI entry point lives in ./cli.ts — it uses `import.meta`, which
// is illegal under `module: commonjs` and broke dockerized builds of every
// consumer that imports this file (tsc compiles imported files even when
// outside `include`). Run the CLI via: npx tsx cli.ts --service-id N --service-name X
